package com.tvhome.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.List;

/** Every installed app in a grid. OK opens it; OK-and-hold or Menu adds it to / removes it from the dock. */
public class AllAppsActivity extends Activity {

    private static final int TILE_DP = 176;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xFF141A26, 0xFF07090D}));
        scroll.setClipChildren(false);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setFillViewport(true);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setClipChildren(false);
        col.setClipToPadding(false);
        col.setPadding(dp(56), dp(36), dp(56), dp(48));
        scroll.addView(col);

        TextView title = new TextView(this);
        title.setText("All Apps");
        title.setTextColor(0xFFFFFFFF);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 30);
        title.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        col.addView(title);
        TextView hint = new TextView(this);
        hint.setText("Hold OK (or press Menu) on an app to add it to the dock or take it off");
        hint.setTextColor(0x99FFFFFF);
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(-2, -2);
        hlp.bottomMargin = dp(20);
        col.addView(hint, hlp);

        float density = getResources().getDisplayMetrics().density;
        int widthDp = (int) (getResources().getDisplayMetrics().widthPixels / density);
        int perRow = Math.max(3, (widthDp - 112) / (TILE_DP + 28));

        List<Apps.App> apps = Apps.installed(this);
        LinearLayout row = null;
        DockTile first = null;
        for (int i = 0; i < apps.size(); i++) {
            if (i % perRow == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setClipChildren(false);
                row.setClipToPadding(false);
                LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(-2, -2);
                rlp.topMargin = dp(18);
                col.addView(row, rlp);
            }
            final Apps.App app = apps.get(i);
            final DockTile t = new DockTile(this, TILE_DP, true);
            t.bindApp(app.label, app.pkg, true);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.setMargins(dp(14), 0, dp(14), 0);
            row.addView(t, lp);
            t.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    Apps.launch(AllAppsActivity.this, app.pkg);
                }
            });
            t.setOnLongClickListener(new View.OnLongClickListener() {
                @Override
                public boolean onLongClick(View v) {
                    toggleDock(app);
                    return true;
                }
            });
            if (first == null) first = t;
        }
        if (first == null) {
            TextView none = new TextView(this);
            none.setText("No apps found.");
            none.setTextColor(0xCCFFFFFF);
            col.addView(none);
        }
        setContentView(scroll);
        if (first != null) first.requestFocus();
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent e) {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            View f = focused();
            if (f instanceof DockTile && ((DockTile) f).pkg != null) {
                DockTile t = (DockTile) f;
                toggleDock(new Apps.App(t.pkg, t.label));
                return true;
            }
        }
        return super.onKeyUp(keyCode, e);
    }

    private void toggleDock(final Apps.App app) {
        final DockConfig cfg = DockConfig.load(this);
        final boolean inDock = cfg.indexOf(app.pkg) >= 0;
        new AlertDialog.Builder(this, AlertDialog.THEME_DEVICE_DEFAULT_DARK)
                .setTitle(app.label)
                .setItems(new String[]{inDock ? "Remove from dock" : "Add to dock", "Cancel"}, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        if (which != 0) return;
                        if (inDock) cfg.remove(app.pkg); else cfg.add(app.label, app.pkg);
                        cfg.saveUser(AllAppsActivity.this);
                        Toast.makeText(AllAppsActivity.this, inDock ? "Removed from the dock" : "Added to the dock", Toast.LENGTH_SHORT).show();
                    }
                })
                .show();
    }

    private View focused() {
        return getWindow().getDecorView().findFocus();
    }

    private int dp(float v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }
}
