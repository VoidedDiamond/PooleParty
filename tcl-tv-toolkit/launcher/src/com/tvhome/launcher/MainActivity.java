package com.tvhome.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Point;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The home screen: a full-screen rotating wallpaper, a clock, and one row of favourite apps.
 * Everything is built in code (no layouts or image resources), which keeps the APK tiny.
 */
public class MainActivity extends Activity {

    static final String ACTION_RELOAD = "com.tvhome.launcher.RELOAD";
    private static final long IDLE_MS = 45_000;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    private WallpaperView wallpaper;
    private WallpaperSource source;
    private TextView clock, date, sceneName;
    private LinearLayout dock;
    private HorizontalScrollView dockScroll;
    private View chrome;              // everything except the wallpaper; fades out when idle
    private DockConfig config;
    private String dockSignature = "";
    private boolean resumed, firstWallpaper = true, loadingWallpaper;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Point size = new Point();
        getWindowManager().getDefaultDisplay().getRealSize(size);
        int w = Math.min(size.x, 1920), h = Math.min(size.y, 1080);
        source = new WallpaperSource(this, w, h);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF000000);
        wallpaper = new WallpaperView(this);
        root.addView(wallpaper, match());

        FrameLayout overlay = new FrameLayout(this);
        overlay.setClipChildren(false);
        chrome = overlay;
        root.addView(overlay, match());

        // soft shading so text and tiles stay readable on bright pictures
        View topShade = new View(this);
        topShade.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0x99000000, 0x00000000}));
        overlay.addView(topShade, new FrameLayout.LayoutParams(-1, dp(220), Gravity.TOP));
        View bottomShade = new View(this);
        bottomShade.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{0xCC000000, 0x00000000}));
        overlay.addView(bottomShade, new FrameLayout.LayoutParams(-1, dp(330), Gravity.BOTTOM));

        LinearLayout clockBox = new LinearLayout(this);
        clockBox.setOrientation(LinearLayout.VERTICAL);
        clockBox.setGravity(Gravity.END);
        clock = text(46, Typeface.create("sans-serif-light", Typeface.NORMAL));
        date = text(17, Typeface.create("sans-serif", Typeface.NORMAL));
        date.setAlpha(0.85f);
        clockBox.addView(clock);
        clockBox.addView(date);
        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.END);
        clp.setMargins(0, dp(36), dp(56), 0);
        overlay.addView(clockBox, clp);

        sceneName = text(13, Typeface.create("sans-serif", Typeface.NORMAL));
        sceneName.setAlpha(0.6f);
        FrameLayout.LayoutParams slp = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.START);
        slp.setMargins(dp(56), dp(44), 0, 0);
        overlay.addView(sceneName, slp);

        dockScroll = new HorizontalScrollView(this);
        dockScroll.setHorizontalScrollBarEnabled(false);
        dockScroll.setClipChildren(false);
        dockScroll.setClipToPadding(false);
        dockScroll.setSmoothScrollingEnabled(true);
        dockScroll.setFocusable(false);
        dock = new LinearLayout(this);
        dock.setOrientation(LinearLayout.HORIZONTAL);
        dock.setClipChildren(false);
        dock.setClipToPadding(false);
        dock.setPadding(dp(56), dp(26), dp(56), dp(10));
        dockScroll.addView(dock, new ViewGroup.LayoutParams(-2, -2));
        FrameLayout.LayoutParams dlp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        dlp.bottomMargin = dp(40);
        overlay.addView(dockScroll, dlp);

        setContentView(root);

        IntentFilter pf = new IntentFilter();
        pf.addAction(Intent.ACTION_PACKAGE_ADDED);
        pf.addAction(Intent.ACTION_PACKAGE_REMOVED);
        pf.addAction(Intent.ACTION_PACKAGE_CHANGED);
        pf.addDataScheme("package");
        registerReceiver(packages, pf);
        registerReceiver(packages, new IntentFilter(ACTION_RELOAD));

        rebuildDock(true);
    }

    // ------------------------------------------------------------------ lifecycle

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        rebuildDock(false);
        tickClock.run();
        if (firstWallpaper) {
            nextWallpaper.run();
        } else {
            ui.postDelayed(nextWallpaper, 2000);
        }
        showChrome();
    }

    @Override
    protected void onPause() {
        super.onPause();
        resumed = false;
        ui.removeCallbacks(tickClock);
        ui.removeCallbacks(nextWallpaper);
        ui.removeCallbacks(goIdle);
        wallpaper.pause();
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(packages);
        worker.shutdownNow();
        super.onDestroy();
    }

    /** Home pressed while we're already showing: jump back to the first tile. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        dockScroll.smoothScrollTo(0, 0);
        if (dock.getChildCount() > 0) dock.getChildAt(0).requestFocus();
    }

    /** Make sure the remote always has something to move: focus the first tile if nothing is focused. */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && !(focused() instanceof DockTile) && dock.getChildCount() > 0) {
            dock.getChildAt(0).requestFocus();
        }
    }

    @Override
    public void onBackPressed() {
        // this is the home screen: there's nowhere to go back to
        showChrome();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (chrome.getAlpha() < 1f) {
            showChrome();
            return true;           // the first key press just wakes the screen
        }
        showChrome();
        if (e.getAction() == KeyEvent.ACTION_UP && e.getKeyCode() == KeyEvent.KEYCODE_MENU) {
            View f = focused();
            if (f instanceof DockTile) editTile((DockTile) f);
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    // ------------------------------------------------------------------ dock

    private void rebuildDock(boolean force) {
        config = DockConfig.load(this);
        wallpaper.motion = config.motion;
        wallpaper.driftMillis = config.wallpaperSeconds * 1000L;
        StringBuilder sig = new StringBuilder(config.source);
        for (DockConfig.Entry e : config.entries) sig.append('|').append(e.installed(getPackageManager()));
        if (!force && sig.toString().equals(dockSignature)) return;
        dockSignature = sig.toString();

        int focused = -1;
        View f = focused();
        if (f != null) focused = dock.indexOfChild(f);
        dock.removeAllViews();
        for (DockConfig.Entry e : config.entries) {
            String pkg = e.installed(getPackageManager());
            DockTile t = tile();
            t.bindApp(e.label, pkg != null ? pkg : e.packages[0], pkg != null);
            dock.addView(t);
        }
        DockTile all = tile();
        all.bindGlyph("All Apps", DockTile.GLYPH_ALL_APPS);
        dock.addView(all);
        DockTile inputs = tile();
        inputs.bindGlyph("Inputs", DockTile.GLYPH_INPUTS);
        dock.addView(inputs);
        DockTile settings = tile();
        settings.bindGlyph("Settings", DockTile.GLYPH_SETTINGS);
        dock.addView(settings);

        int pick = Math.max(0, Math.min(focused, dock.getChildCount() - 1));
        dock.getChildAt(pick).requestFocus();
    }

    private DockTile tile() {
        final DockTile t = new DockTile(this, 190, false);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.setMargins(dp(14), 0, dp(14), 0);
        t.setLayoutParams(lp);
        t.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                open(t);
            }
        });
        t.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                editTile(t);
                return true;
            }
        });
        t.setOnFocusChangeListener(chain(t.getOnFocusChangeListener(), new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View v, boolean has) {
                if (has) centre(v);
            }
        }));
        return t;
    }

    private void open(DockTile t) {
        if (t.glyph == DockTile.GLYPH_ALL_APPS) {
            startActivity(new Intent(this, AllAppsActivity.class));
        } else if (t.glyph == DockTile.GLYPH_INPUTS) {
            showInputs();
        } else if (t.glyph == DockTile.GLYPH_SETTINGS) {
            Apps.openSettings(this);
        } else if (t.installed) {
            Apps.launch(this, t.pkg);
        } else {
            Apps.openStore(this, t.pkg);
        }
    }

    /** The Inputs tile: pick HDMI 1, 2, 3 (stands in for the remote's Input button). */
    private void showInputs() {
        final java.util.List<Apps.TvInput> inputs = Apps.hdmiInputs(this, config.inputNames);
        if (inputs.isEmpty()) {
            Apps.openTvApp(this);
            return;
        }
        String[] names = new String[inputs.size()];
        for (int i = 0; i < names.length; i++) names[i] = inputs.get(i).label;
        new AlertDialog.Builder(this, AlertDialog.THEME_DEVICE_DEFAULT_DARK)
                .setTitle("Inputs")
                .setItems(names, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        Apps.switchTo(MainActivity.this, inputs.get(which));
                    }
                })
                .show();
    }

    /** OK-and-hold or Menu on a dock tile: move it or take it off the dock. */
    private void editTile(final DockTile t) {
        if (t.pkg == null) return;
        final int index = config.indexOf(t.pkg);
        if (index < 0) return;
        String[] items = {"Move left", "Move right", "Remove from dock", "Cancel"};
        new AlertDialog.Builder(this, AlertDialog.THEME_DEVICE_DEFAULT_DARK)
                .setTitle(t.label)
                .setItems(items, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        if (which == 0) config.move(index, index - 1);
                        else if (which == 1) config.move(index, index + 1);
                        else if (which == 2) config.remove(t.pkg);
                        else return;
                        config.saveUser(MainActivity.this);
                        int target = which == 0 ? index - 1 : which == 1 ? index + 1 : index;
                        rebuildDock(true);
                        View v = dock.getChildAt(Math.max(0, Math.min(target, dock.getChildCount() - 1)));
                        if (v != null) v.requestFocus();
                    }
                })
                .show();
    }

    private void centre(View v) {
        int target = v.getLeft() + v.getWidth() / 2 - dockScroll.getWidth() / 2;
        dockScroll.smoothScrollTo(Math.max(0, target), 0);
    }

    // ------------------------------------------------------------------ wallpaper, clock, idle

    private final Runnable nextWallpaper = new Runnable() {
        @Override
        public void run() {
            ui.removeCallbacks(this);
            if (!resumed || loadingWallpaper) return;
            loadingWallpaper = true;
            worker.execute(new Runnable() {
                @Override
                public void run() {
                    final WallpaperSource.Item item = source.next();
                    ui.post(new Runnable() {
                        @Override
                        public void run() {
                            loadingWallpaper = false;
                            wallpaper.show(item.bitmap, !firstWallpaper);
                            firstWallpaper = false;
                            sceneName.setText(item.caption);
                            if (resumed) ui.postDelayed(nextWallpaper, config.wallpaperSeconds * 1000L);
                        }
                    });
                }
            });
        }
    };

    private final Runnable tickClock = new Runnable() {
        @Override
        public void run() {
            Date now = new Date();
            clock.setText(new SimpleDateFormat(config.clock24 ? "HH:mm" : "h:mm", Locale.getDefault()).format(now));
            date.setText(new SimpleDateFormat("EEEE, MMMM d", Locale.getDefault()).format(now));
            ui.removeCallbacks(this);
            // run again just after the next minute starts
            ui.postDelayed(this, 60_000 - (System.currentTimeMillis() % 60_000) + 50);
        }
    };

    private final Runnable goIdle = new Runnable() {
        @Override
        public void run() {
            chrome.animate().alpha(0f).setDuration(1200).start();
        }
    };

    private void showChrome() {
        ui.removeCallbacks(goIdle);
        if (chrome.getAlpha() < 1f) chrome.animate().alpha(1f).setDuration(250).start();
        if (resumed) ui.postDelayed(goIdle, IDLE_MS);
    }

    private final BroadcastReceiver packages = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            rebuildDock(true);
            if (ACTION_RELOAD.equals(i.getAction())) {
                firstWallpaper = true;
                nextWallpaper.run();
            }
        }
    };

    // ------------------------------------------------------------------ small helpers

    private static View.OnFocusChangeListener chain(final View.OnFocusChangeListener a, final View.OnFocusChangeListener b) {
        return new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View v, boolean has) {
                if (a != null) a.onFocusChange(v, has);
                b.onFocusChange(v, has);
            }
        };
    }

    private TextView text(int sp, Typeface tf) {
        TextView t = new TextView(this);
        t.setTextColor(0xFFFFFFFF);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTypeface(tf);
        t.setShadowLayer(dp(6), 0, dp(1), 0x99000000);
        return t;
    }

    private static FrameLayout.LayoutParams match() {
        return new FrameLayout.LayoutParams(-1, -1);
    }

    private View focused() {
        return getWindow().getDecorView().findFocus();
    }

    private int dp(float v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }
}
