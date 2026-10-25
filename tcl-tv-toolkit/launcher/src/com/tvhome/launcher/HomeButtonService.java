package com.tvhome.launcher;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;

/**
 * Makes the remote's Home button open TV Home while the TV's own home screen stays switched on.
 *
 * Google TV takes the Home button back from any other default home, and switching its home off
 * also breaks the remote's Settings and Input buttons (Google TV's home draws those panels).
 * So instead this service, switched on by 4_launcher.sh, catches the Home button press and opens
 * TV Home. It also steps in when the stock home's main screen comes to the front by itself
 * (after a restart, or when an app closes). Every other button, and the stock home's Settings
 * and Input panels, are left alone.
 */
public class HomeButtonService extends AccessibilityService {

    private long[] recentRedirects = new long[4];
    private int redirectIndex;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        // just switched on, or the TV just started: show TV Home
        openTvHome(true);
    }

    @Override
    public boolean onKeyEvent(KeyEvent e) {
        if (e.getKeyCode() != KeyEvent.KEYCODE_HOME) return false;
        if (e.getAction() == KeyEvent.ACTION_UP && !e.isCanceled()) openTvHome(false);
        return true;   // the stock home never sees the Home button
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkg = event.getPackageName(), cls = event.getClassName();
        if (pkg == null || cls == null) return;
        ComponentName stock = stockHome();
        if (stock != null && stock.getPackageName().contentEquals(pkg) && stock.getClassName().contentEquals(cls)) {
            openTvHome(true);
        }
    }

    @Override
    public void onInterrupt() {
    }

    /** The system's default home screen if it isn't TV Home (e.g. Google TV's), else null. */
    ComponentName stockHome() {
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo ri = getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
        if (ri == null || ri.activityInfo == null) return null;
        ActivityInfo ai = ri.activityInfo;
        if (ai.packageName.equals(getPackageName()) || ai.packageName.equals("android")) return null;
        return new ComponentName(ai.packageName, ai.name);
    }

    /** automatic = not a button press; those are rate-limited. */
    void openTvHome(boolean automatic) {
        if (automatic) {
            // safety valve: if TV Home keeps disappearing (e.g. crashing), stop fighting the stock home
            long now = SystemClock.elapsedRealtime();
            long oldest = recentRedirects[redirectIndex];
            if (oldest != 0 && now - oldest < 10_000) return;
            recentRedirects[redirectIndex] = now;
            redirectIndex = (redirectIndex + 1) % recentRedirects.length;
        }

        Intent i = new Intent(this, MainActivity.class);
        i.setAction(Intent.ACTION_MAIN);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        try {
            startActivity(i);
        } catch (RuntimeException ignored) {
        }
    }
}
