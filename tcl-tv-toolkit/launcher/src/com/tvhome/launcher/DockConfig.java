package com.tvhome.launcher;

import android.content.Context;
import android.content.pm.PackageManager;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * The dock: which apps, in what order, plus a few settings.
 *
 * Text format (same as config/dock.txt on the laptop):
 *   Label|package[,fallback package...]
 *   @wallpaper_seconds|60     @clock|12h or 24h     @motion|on or off     @hdmi2|Soundbar
 *
 * Two copies can exist: dock.txt pushed by 4_launcher.sh into the app's external files folder, and
 * dock_user.txt written when you edit the dock on the TV. Whichever was changed last wins.
 */
final class DockConfig {

    static final String BUILT_IN =
            "Netflix|com.netflix.ninja\n"
            + "YouTube|com.google.android.youtube.tv\n"
            + "Disney+|com.disney.disneyplus\n"
            + "Peacock|com.peacocktv.peacockandroid\n"
            + "Prime Video|com.amazon.amazonvideo.livingroom,com.amazon.avod.thirdpartyclient\n"
            + "Hulu|com.hulu.livingroomplus\n"
            + "HBO Max|com.wbd.stream,com.hbo.hbonow\n";

    static final class Entry {
        final String label;
        final String[] packages;

        Entry(String label, String[] packages) {
            this.label = label;
            this.packages = packages;
        }

        /** First package from the list that is installed, or null. */
        String installed(PackageManager pm) {
            for (String p : packages) {
                try {
                    pm.getPackageInfo(p, 0);
                    return p;
                } catch (PackageManager.NameNotFoundException ignored) {
                }
            }
            return null;
        }

        boolean has(String pkg) {
            for (String p : packages) if (p.equals(pkg)) return true;
            return false;
        }
    }

    final List<Entry> entries = new ArrayList<>();
    int wallpaperSeconds = 60;
    boolean clock24 = false;
    boolean motion = true;
    /** Your own names for HDMI ports (@hdmi1|Xbox), shown in the Inputs list. */
    final java.util.TreeMap<Integer, String> inputNames = new java.util.TreeMap<>();
    /** The raw text this was parsed from; used to notice changes cheaply. */
    String source = "";

    static DockConfig load(Context c) {
        File pushed = pushedFile(c);
        File user = userFile(c);
        File pick = null;
        if (pushed != null && pushed.isFile()) pick = pushed;
        if (user.isFile() && (pick == null || user.lastModified() > pick.lastModified())) pick = user;
        String text = pick == null ? null : read(pick);
        DockConfig cfg = parse(text == null ? BUILT_IN : text);
        if (cfg.entries.isEmpty()) {
            DockConfig fallback = parse(BUILT_IN);
            fallback.wallpaperSeconds = cfg.wallpaperSeconds;
            fallback.clock24 = cfg.clock24;
            fallback.motion = cfg.motion;
            fallback.inputNames.putAll(cfg.inputNames);
            return fallback;
        }
        return cfg;
    }

    static DockConfig parse(String text) {
        DockConfig cfg = new DockConfig();
        cfg.source = text;
        for (String raw : text.split("\n")) {
            String line = raw.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            int bar = line.indexOf('|');
            if (bar <= 0) continue;
            String key = line.substring(0, bar).trim();
            String value = line.substring(bar + 1).trim();
            if (key.startsWith("@")) {
                cfg.setting(key.substring(1), value);
            } else if (!value.isEmpty()) {
                String[] pkgs = value.split(",");
                for (int i = 0; i < pkgs.length; i++) pkgs[i] = pkgs[i].trim();
                cfg.entries.add(new Entry(key, pkgs));
            }
        }
        return cfg;
    }

    private void setting(String key, String value) {
        if (key.equals("wallpaper_seconds")) {
            try {
                wallpaperSeconds = Math.max(10, Integer.parseInt(value));
            } catch (NumberFormatException ignored) {
            }
        } else if (key.equals("clock")) {
            clock24 = value.startsWith("24");
        } else if (key.equals("motion")) {
            motion = !value.equalsIgnoreCase("off");
        } else if (key.matches("hdmi[0-9]+") && !value.isEmpty()) {
            inputNames.put(Integer.parseInt(key.substring(4)), value);
        }
    }

    String serialize() {
        StringBuilder sb = new StringBuilder("# edited on the TV\n");
        for (Entry e : entries) {
            sb.append(e.label).append('|');
            for (int i = 0; i < e.packages.length; i++) {
                if (i > 0) sb.append(',');
                sb.append(e.packages[i]);
            }
            sb.append('\n');
        }
        sb.append("@wallpaper_seconds|").append(wallpaperSeconds).append('\n');
        sb.append("@clock|").append(clock24 ? "24h" : "12h").append('\n');
        sb.append("@motion|").append(motion ? "on" : "off").append('\n');
        for (java.util.Map.Entry<Integer, String> e : inputNames.entrySet()) {
            sb.append("@hdmi").append(e.getKey()).append('|').append(e.getValue()).append('\n');
        }
        return sb.toString();
    }

    int indexOf(String pkg) {
        for (int i = 0; i < entries.size(); i++) if (entries.get(i).has(pkg)) return i;
        return -1;
    }

    void add(String label, String pkg) {
        if (indexOf(pkg) < 0) entries.add(new Entry(label, new String[]{pkg}));
    }

    void remove(String pkg) {
        int i = indexOf(pkg);
        if (i >= 0) entries.remove(i);
    }

    void move(int from, int to) {
        if (from < 0 || from >= entries.size() || to < 0 || to >= entries.size()) return;
        entries.add(to, entries.remove(from));
    }

    void saveUser(Context c) {
        try {
            FileOutputStream out = new FileOutputStream(userFile(c));
            out.write(serialize().getBytes("UTF-8"));
            out.close();
        } catch (Exception ignored) {
        }
    }

    static File pushedFile(Context c) {
        File dir = c.getExternalFilesDir(null);
        return dir == null ? null : new File(dir, "dock.txt");
    }

    static File userFile(Context c) {
        return new File(c.getFilesDir(), "dock_user.txt");
    }

    private static String read(File f) {
        try {
            InputStream in = new FileInputStream(f);
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[4096];
            int n;
            while ((n = in.read(b)) > 0) buf.write(b, 0, n);
            in.close();
            return buf.toString("UTF-8");
        } catch (Exception e) {
            return null;
        }
    }
}
