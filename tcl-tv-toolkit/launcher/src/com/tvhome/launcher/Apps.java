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

    /** The TV's inputs as the system lists them, using the names set in Settings. Empty if none. */
    static List<TvInput> tvInputs(Context c) {
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
        for (TvInputInfo info : all) {
            if (info.getParentId() != null) continue;   // devices behind an HDMI port (CEC) - the port itself is listed
            CharSequence label = null;
            try {
                if (info.isHidden(c)) continue;          // inputs hidden in Settings
                label = info.loadCustomLabel(c);
            } catch (RuntimeException ignored) {
            }
            if (label == null || label.length() == 0) label = info.loadLabel(c);
            out.add(new TvInput(info.getId(), label == null ? info.getId() : label.toString(), info.isPassthroughInput()));
        }
        return out;
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
