package com.tvhome.launcher;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * One rounded card plus a caption underneath. The card grows and lifts when focused,
 * like the Apple TV top row; the caption only shows while focused (or always, in All Apps).
 */
final class DockTile extends LinearLayout {

    static final int GLYPH_ALL_APPS = 1, GLYPH_SETTINGS = 2;

    final FrameLayout card;
    final TextView caption;
    String pkg;          // package this tile opens (null for special tiles)
    String label;
    boolean installed = true;
    private final boolean alwaysCaption;

    DockTile(Context c, int widthDp, boolean alwaysCaption) {
        super(c);
        this.alwaysCaption = alwaysCaption;
        setOrientation(VERTICAL);
        setGravity(Gravity.CENTER_HORIZONTAL);
        setClipChildren(false);
        setClipToPadding(false);
        setFocusable(true);
        setFocusableInTouchMode(true);

        int w = dp(widthDp), h = w * 9 / 16;
        card = new FrameLayout(c);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(14));
        bg.setColor(0xFF2A2F3A);
        card.setBackground(bg);
        card.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
        card.setClipToOutline(true);
        card.setElevation(dp(2));
        addView(card, new LayoutParams(w, h));

        caption = new TextView(c);
        caption.setTextColor(Color.WHITE);
        caption.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        caption.setSingleLine(true);
        caption.setEllipsize(TextUtils.TruncateAt.END);
        caption.setGravity(Gravity.CENTER);
        caption.setShadowLayer(dp(3), 0, dp(1), 0xCC000000);
        caption.setAlpha(alwaysCaption ? 0.85f : 0f);
        LayoutParams lp = new LayoutParams(w, LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(14);
        addView(caption, lp);

        setOnFocusChangeListener(new OnFocusChangeListener() {
            @Override
            public void onFocusChange(View v, boolean has) {
                float s = has ? 1.12f : 1f;
                card.animate().scaleX(s).scaleY(s).translationZ(has ? dp(14) : 0).setDuration(160).start();
                caption.animate().alpha(has ? 1f : (DockTile.this.alwaysCaption ? 0.85f : 0f))
                        .translationY(has ? dp(8) : 0).setDuration(160).start();
                GradientDrawable g = (GradientDrawable) card.getBackground();
                g.setStroke(has ? dp(3) : 0, 0xF2FFFFFF);
            }
        });
    }

    /** Fill the card for an app: its TV banner if it has one, otherwise its icon and name. */
    void bindApp(String label, String pkg, boolean isInstalled) {
        this.label = label;
        this.pkg = pkg;
        this.installed = isInstalled;
        caption.setText(isInstalled ? label : label + " · Get");
        card.removeAllViews();
        PackageManager pm = getContext().getPackageManager();
        Drawable banner = null, icon = null;
        if (isInstalled) {
            try {
                Intent li = pm.getLeanbackLaunchIntentForPackage(pkg);
                if (li != null) banner = pm.getActivityBanner(li);
                if (banner == null) banner = pm.getApplicationBanner(pkg);
                if (banner == null) icon = pm.getApplicationIcon(pkg);
            } catch (Exception ignored) {
            }
        }
        if (banner != null) {
            ImageView iv = new ImageView(getContext());
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            iv.setImageDrawable(banner);
            card.addView(iv, new FrameLayout.LayoutParams(-1, -1));
        } else {
            ((GradientDrawable) card.getBackground()).setColor(colorFor(label));
            if (icon != null) {
                ImageView iv = new ImageView(getContext());
                iv.setImageDrawable(icon);
                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(56), dp(56), Gravity.CENTER);
                lp.bottomMargin = dp(14);
                card.addView(iv, lp);
                addCardLabel(label, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL, 13);
            } else {
                addCardLabel(label, Gravity.CENTER, 20);
            }
        }
        card.setAlpha(isInstalled ? 1f : 0.55f);
    }

    void bindGlyph(String label, int glyph) {
        this.label = label;
        this.pkg = null;
        caption.setText(label);
        card.removeAllViews();
        ((GradientDrawable) card.getBackground()).setColor(0xCC3A4150);
        ImageView iv = new ImageView(getContext());
        iv.setImageDrawable(new Glyph(glyph));
        card.addView(iv, new FrameLayout.LayoutParams(dp(44), dp(44), Gravity.CENTER));
    }

    private void addCardLabel(String text, int gravity, int sp) {
        TextView t = new TextView(getContext());
        t.setText(text);
        t.setTextColor(Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        t.setGravity(Gravity.CENTER);
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1, -2, gravity);
        lp.setMargins(dp(8), dp(6), dp(8), dp(8));
        card.addView(t, lp);
    }

    /** A pleasant, stable colour per app name for tiles without a banner. */
    static int colorFor(String s) {
        float[] hsv = {(s.hashCode() & 0x7fffffff) % 360, 0.45f, 0.42f};
        return Color.HSVToColor(hsv);
    }

    int dp(float v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    /** Simple vector glyphs for the special tiles, so no image resources are needed. */
    static final class Glyph extends Drawable {
        private final int kind;
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        Glyph(int kind) {
            this.kind = kind;
            p.setColor(Color.WHITE);
        }

        @Override
        public void draw(Canvas c) {
            float w = getBounds().width(), h = getBounds().height();
            c.save();
            c.translate(getBounds().left, getBounds().top);
            if (kind == GLYPH_ALL_APPS) {
                float r = w * 0.09f;
                for (int i = 0; i < 3; i++)
                    for (int j = 0; j < 3; j++)
                        c.drawCircle(w * (0.2f + 0.3f * i), h * (0.2f + 0.3f * j), r, p);
            } else {
                float cx = w / 2, cy = h / 2, ro = w * 0.46f, ri = w * 0.34f;
                Path gear = new Path();
                int teeth = 8;
                for (int i = 0; i < teeth * 4; i++) {
                    double a = Math.PI * 2 * i / (teeth * 4);
                    float rr = (i % 4 < 2) ? ro : ri;
                    float x = cx + (float) Math.cos(a) * rr, y = cy + (float) Math.sin(a) * rr;
                    if (i == 0) gear.moveTo(x, y); else gear.lineTo(x, y);
                }
                gear.close();
                gear.addCircle(cx, cy, w * 0.14f, Path.Direction.CCW);
                gear.setFillType(Path.FillType.EVEN_ODD);
                c.drawPath(gear, p);
            }
            c.restore();
        }

        @Override public void setAlpha(int a) { p.setAlpha(a); }
        @Override public void setColorFilter(ColorFilter f) { p.setColorFilter(f); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }
}
