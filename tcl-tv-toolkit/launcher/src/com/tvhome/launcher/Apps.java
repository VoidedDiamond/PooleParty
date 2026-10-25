package com.tvhome.launcher;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.media.tv.TvContract;
import android.media.tv.TvInputInfo;
import android.media.tv.TvInputManager;
import android.net.Uri;
import android.text.TextUtils;
import android.widget.Toast;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Launching apps and listing what's installed. */
final class Apps {

    static final class App {
        final String pkg, label;

        App(String pkg, String label) {
            this.pkg = pkg;
            this.label = label;
        }
    }

    private Apps() {
    }

    static void launch(Context c, String pkg) {
        PackageManager pm = c.getPackageManager();
        Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
        if (i == null) i = pm.getLaunchIntentForPackage(pkg);
        if (i == null) {
            openStore(c, pkg);
            return;
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        try {
            c.startActivity(i);
        } catch (RuntimeException e) {
            Toast.makeText(c, "Couldn't open " + pkg, Toast.LENGTH_SHORT).show();
        }
    }

    static void openStore(Context c, String pkg) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            c.startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(c, pkg + " isn't installed, and the Play Store isn't available.", Toast.LENGTH_LONG).show();
        }
    }

    static void openSettings(Context c) {
        Intent i = new Intent(android.provider.Settings.ACTION_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            c.startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(c, "Settings isn't available.", Toast.LENGTH_SHORT).show();
        }
    }

    static final class TvInput {
        final String id, label;
        final boolean passthrough;   // HDMI, composite... (as opposed to the antenna/cable tuner)

        TvInput(String id, String label, boolean passthrough) {
            this.id = id;
            this.label = label;
            this.passthrough = passthrough;
        }
    }

    /**
     * The TV's HDMI ports only (no antenna, AV...), in port order, each labelled with what's on it:
     * your own name from dock.txt (@hdmi2|Soundbar), else a name you gave it in the TV's settings,
     * else the names connected devices announce over HDMI-CEC (consoles, streaming and cable boxes),
     * else whether anything is plugged in. Empty if the TV doesn't list its inputs.
     */
    static List<TvInput> hdmiInputs(Context c, Map<Integer, String> myNames) {
        List<TvInput> out = new ArrayList<>();
        TvInputManager m = (TvInputManager) c.getSystemService(Context.TV_INPUT_SERVICE);
        if (m == null) return out;
        List<TvInputInfo> all;
        try {
            all = m.getTvInputList();
        } catch (RuntimeException e) {
            return out;
        }
        if (all == null) return out;

        // devices plugged into each port that announced themselves (CEC "child" inputs)
        Map<String, List<String>> devices = new LinkedHashMap<>();
        for (TvInputInfo info : all) {
            if (info.getParentId() == null) continue;
            CharSequence l = info.loadLabel(c);
            if (l == null || l.length() == 0) continue;
            List<String> list = devices.get(info.getParentId());
            if (list == null) devices.put(info.getParentId(), list = new ArrayList<>());
            if (!list.contains(l.toString())) list.add(l.toString());
        }

        List<TvInputInfo> ports = new ArrayList<>();
        for (TvInputInfo info : all) {
            if (info.getParentId() != null || info.getType() != TvInputInfo.TYPE_HDMI) continue;
            try {
                if (info.isHidden(c)) continue;          // inputs hidden in the TV's settings
            } catch (RuntimeException ignored) {
            }
            ports.add(info);
        }
        // only trust "nothing connected" if this TV reports plugged/unplugged at all
        boolean reportsCables = false;
        for (TvInputInfo info : ports) if (state(m, info) == TvInputManager.INPUT_STATE_DISCONNECTED) reportsCables = true;

        final Map<TvInput, Integer> order = new java.util.HashMap<>();
        for (int i = 0; i < ports.size(); i++) {
            TvInputInfo info = ports.get(i);
            CharSequence sys = info.loadLabel(c), custom = null;
            try {
                custom = info.loadCustomLabel(c);
            } catch (RuntimeException ignored) {
            }
            int port = portNumber(sys == null ? null : sys.toString(), i + 1);
            String label = inputLabel(port, myNames == null ? null : myNames.get(port),
                    sys == null ? null : sys.toString(), custom == null ? null : custom.toString(),
                    devices.get(info.getId()), state(m, info), reportsCables);
            TvInput in = new TvInput(info.getId(), label, true);
            order.put(in, port);
            out.add(in);
        }
        Collections.sort(out, new Comparator<TvInput>() {
            @Override
            public int compare(TvInput a, TvInput b) {
                return order.get(a) - order.get(b);
            }
        });
        return out;
    }

    private static int state(TvInputManager m, TvInputInfo info) {
        try {
            return m.getInputState(info.getId());
        } catch (RuntimeException e) {
            return TvInputManager.INPUT_STATE_CONNECTED;
        }
    }

    /** "HDMI 2", "HDMI2", "HDMI 2 (ARC)" -> 2; otherwise the fallback. */
    static int portNumber(String systemLabel, int fallback) {
        if (systemLabel != null) {
            java.util.regex.Matcher mt = java.util.regex.Pattern.compile("(\\d+)").matcher(systemLabel);
            if (mt.find()) return Integer.parseInt(mt.group(1));
        }
        return fallback;
    }

    /** e.g. "HDMI 1  ·  PlayStation 5", "HDMI 2  ·  Soundbar", "HDMI 3  ·  nothing connected". */
    static String inputLabel(int port, String myName, String systemLabel, String customLabel,
                             List<String> devices, int state, boolean reportsCables) {
        String what = null;
        if (myName != null && !myName.trim().isEmpty()) {
            what = myName.trim();
        } else if (customLabel != null && !customLabel.trim().isEmpty() && !customLabel.trim().equals(systemLabel)
                && portNumber(customLabel, -1) != port) {
            what = customLabel.trim();
        } else if (devices != null && !devices.isEmpty()) {
            what = TextUtils.join(", ", devices);
        } else if (reportsCables) {
            what = state == TvInputManager.INPUT_STATE_DISCONNECTED ? "nothing connected" : "connected";
        }
        return what == null ? "HDMI " + port : "HDMI " + port + "  \u00b7  " + what;
    }

    /** The standard Android TV request to show an input; the TV's own TV app carries it out. */
    static Intent inputIntent(TvInput in) {
        Uri uri = in.passthrough ? TvContract.buildChannelUriForPassthroughInput(in.id) : TvContract.buildChannelsUriForInput(in.id);
        return new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    static void switchTo(Context c, TvInput in) {
        try {
            c.startActivity(inputIntent(in));
        } catch (ActivityNotFoundException e) {
            if (in.passthrough || !openTvApp(c)) {
                Toast.makeText(c, "Couldn't switch to " + in.label, Toast.LENGTH_SHORT).show();
            }
        }
    }

    /** Open the TV's live TV app (antenna/cable). Returns false if there isn't one. */
    static boolean openTvApp(Context c) {
        PackageManager pm = c.getPackageManager();
        for (String pkg : new String[]{"com.tcl.tv", "com.mediatek.wwtv.tvcenter", "com.google.android.tv", "com.android.tv"}) {
            Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
            if (i == null) i = pm.getLaunchIntentForPackage(pkg);
            if (i == null) continue;
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                c.startActivity(i);
                return true;
            } catch (RuntimeException ignored) {
            }
        }
        Toast.makeText(c, "No TV inputs found.", Toast.LENGTH_SHORT).show();
        return false;
    }

    /** Every app with a TV or phone launcher entry, sorted by name, excluding this launcher. */
    static List<App> installed(Context c) {
        PackageManager pm = c.getPackageManager();
        Map<String, App> byPkg = new LinkedHashMap<>();
        for (String cat : new String[]{Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER}) {
            Intent q = new Intent(Intent.ACTION_MAIN).addCategory(cat);
            for (ResolveInfo ri : pm.queryIntentActivities(q, 0)) {
                String pkg = ri.activityInfo.packageName;
                if (pkg.equals(c.getPackageName()) || byPkg.containsKey(pkg)) continue;
                CharSequence l = ri.activityInfo.applicationInfo.loadLabel(pm);
                byPkg.put(pkg, new App(pkg, l == null ? pkg : l.toString()));
            }
        }
        List<App> list = new ArrayList<>(byPkg.values());
        final Collator col = Collator.getInstance();
        Collections.sort(list, new Comparator<App>() {
            @Override
            public int compare(App a, App b) {
                return col.compare(a.label, b.label);
            }
        });
        return list;
    }
}
