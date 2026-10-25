package com.tvhome.launcher;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
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
