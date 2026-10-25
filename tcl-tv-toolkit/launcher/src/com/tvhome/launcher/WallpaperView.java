package com.tvhome.launcher;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.content.Context;
import android.graphics.Bitmap;
import android.view.View;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;

import java.util.Random;

/**
 * Two stacked images that cross-fade. With motion on, each picture drifts and zooms very slowly
 * (the "Ken Burns" look). Both effects are view-property animations, which the GPU does on its
 * own, so they cost almost nothing on a slow TV.
 */
final class WallpaperView extends FrameLayout {

    private final ImageView[] layers = new ImageView[2];
    private int front = 0;
    private final Random random = new Random();
    boolean motion = true;
    long driftMillis = 60_000;

    WallpaperView(Context c) {
        super(c);
        for (int i = 0; i < 2; i++) {
            ImageView v = new ImageView(c);
            v.setScaleType(ImageView.ScaleType.CENTER_CROP);
            v.setAlpha(i == 0 ? 1f : 0f);
            addView(v, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
            layers[i] = v;
        }
    }

    void show(Bitmap bmp, boolean animate) {
        final ImageView old = layers[front];
        front = 1 - front;
        final ImageView next = layers[front];
        next.animate().cancel();
        next.setImageBitmap(bmp);
        next.bringToFront();
        startDrift(next);
        if (!animate) {
            next.setAlpha(1f);
            old.setAlpha(0f);
            old.setImageDrawable(null);
            return;
        }
        next.setAlpha(0f);
        next.animate().alpha(1f).setDuration(1800).setListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator a) {
                old.animate().cancel();
                old.setAlpha(0f);
                old.setImageDrawable(null);
            }
        }).start();
    }

    private void startDrift(View v) {
        v.setScaleX(1f);
        v.setScaleY(1f);
        v.setTranslationX(0);
        v.setTranslationY(0);
        if (!motion) return;
        float zoom = 1.06f + random.nextFloat() * 0.04f;
        float room = getWidth() * (zoom - 1) / 2;
        v.animate().scaleX(zoom).scaleY(zoom)
                .translationX((random.nextFloat() * 2 - 1) * room)
                .translationY((random.nextFloat() * 2 - 1) * room * 0.5f)
                .setDuration(driftMillis + 4000)
                .setInterpolator(new LinearInterpolator())
                .setListener(null)
                .start();
    }

    /** Stop drifting while the launcher is hidden (saves the TV's GPU for the app you're watching). */
    void pause() {
        for (ImageView v : layers) v.animate().cancel();
    }
}
