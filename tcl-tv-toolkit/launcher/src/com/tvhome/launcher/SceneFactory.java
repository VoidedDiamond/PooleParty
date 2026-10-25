package com.tvhome.launcher;

import android.graphics.Bitmap;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.Shader;

import java.util.Random;

/**
 * Paints nature wallpapers in code, so the launcher looks good with no photos and no internet.
 * Each scene is randomised from a seed: the same seed always gives the same picture.
 */
final class SceneFactory {

    static final String[] NAMES = {
            "Alpine dawn", "Ocean sunset", "Northern lights", "Misty forest", "Desert dunes", "Lake at dusk"
    };

    private SceneFactory() {
    }

    static Bitmap render(int kind, long seed, int w, int h) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Random r = new Random(seed);
        switch (kind % NAMES.length) {
            case 0: alpine(c, r, w, h); break;
            case 1: ocean(c, r, w, h); break;
            case 2: aurora(c, r, w, h); break;
            case 3: forest(c, r, w, h); break;
            case 4: dunes(c, r, w, h); break;
            default: lake(c, r, w, h); break;
        }
        grain(c, r, w, h);
        return bmp;
    }

    // ------------------------------------------------------------------ scenes

    private static void alpine(Canvas c, Random r, int w, int h) {
        sky(c, w, h, h * 0.75f, 0xFF1D2B53, 0xFF7E6B8F, 0xFFF2B880);
        float sunX = w * (0.25f + r.nextFloat() * 0.5f);
        glow(c, sunX, h * 0.58f, h * 0.55f, 0x88FFE2B0);
        disc(c, sunX, h * 0.58f, h * 0.035f, 0xFFFFF1D6);
        int[] cols = {0xFF9AA3C2, 0xFF6F7AA3, 0xFF4A5480, 0xFF2C3359, 0xFF151A33};
        for (int i = 0; i < cols.length; i++) {
            float base = h * (0.52f + i * 0.09f);
            ridge(c, r, w, h, base, h * (0.22f - i * 0.03f), 0.55f, cols[i]);
            if (i < cols.length - 1) mist(c, w, base + h * 0.02f, h * 0.10f, 0x44F6D7C3);
        }
    }

    private static void ocean(Canvas c, Random r, int w, int h) {
        float horizon = h * (0.55f + r.nextFloat() * 0.08f);
        sky(c, w, h, horizon, 0xFF2A1B3D, 0xFFD1495B, 0xFFF6B26B);
        float sunX = w * (0.3f + r.nextFloat() * 0.4f);
        glow(c, sunX, horizon, h * 0.6f, 0x99FFC27A);
        disc(c, sunX, horizon - h * 0.02f, h * 0.06f, 0xFFFFE3A3);
        // a few long clouds
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        for (int i = 0; i < 6; i++) {
            p.setColor(Color.argb(40 + r.nextInt(50), 255, 200, 190));
            float y = h * (0.12f + r.nextFloat() * 0.35f), x = r.nextFloat() * w, len = w * (0.15f + r.nextFloat() * 0.3f);
            c.drawRoundRect(x - len / 2, y, x + len / 2, y + h * 0.012f, h, h, p);
        }
        Paint sea = new Paint();
        sea.setShader(new LinearGradient(0, horizon, 0, h, 0xFF4B3F72, 0xFF0B132B, Shader.TileMode.CLAMP));
        c.drawRect(0, horizon, w, h, sea);
        // sun path on the water
        Paint glint = new Paint(Paint.ANTI_ALIAS_FLAG);
        for (int i = 0; i < 140; i++) {
            float t = r.nextFloat();
            float y = horizon + (h - horizon) * t * t + 2;
            float spread = w * (0.03f + 0.22f * t);
            float x = sunX + (float) r.nextGaussian() * spread * 0.5f;
            float len = w * (0.01f + 0.05f * r.nextFloat()) * (0.5f + t);
            glint.setColor(Color.argb((int) (170 * (1 - t * 0.7f)), 255, 214, 150));
            c.drawRect(x - len / 2, y, x + len / 2, y + 1.5f + 2.5f * t, glint);
        }
    }

    private static void aurora(Canvas c, Random r, int w, int h) {
        sky(c, w, h, h, 0xFF02060F, 0xFF071A33, 0xFF0E2E4A);
        Paint star = new Paint(Paint.ANTI_ALIAS_FLAG);
        for (int i = 0; i < 420; i++) {
            star.setColor(Color.argb(60 + r.nextInt(195), 255, 255, 255));
            c.drawCircle(r.nextFloat() * w, r.nextFloat() * h * 0.75f, r.nextFloat() < 0.05f ? 1.8f : 0.9f, star);
        }
        int[][] bands = {{0x3CFFA0, 0x2EB8FF}, {0x55FF9E, 0xB36BFF}, {0x7CFFCB, 0x3CFFA0}};
        Paint p = new Paint();
        p.setStrokeWidth(4);
        for (int b = 0; b < 2 + r.nextInt(2); b++) {
            int[] col = bands[r.nextInt(bands.length)];
            float base = h * (0.35f + r.nextFloat() * 0.2f), amp = h * (0.05f + r.nextFloat() * 0.08f);
            float f1 = 1.5f + r.nextFloat() * 2, f2 = 4 + r.nextFloat() * 4, ph = r.nextFloat() * 6.28f;
            float tall = h * (0.18f + r.nextFloat() * 0.18f);
            for (int x = 0; x < w; x += 3) {
                float u = (float) x / w;
                float y = base + amp * (float) Math.sin(u * f1 * 6.28f + ph) + amp * 0.3f * (float) Math.sin(u * f2 * 6.28f);
                float strength = 0.5f + 0.5f * (float) Math.sin(u * 9.0f + ph * 2);
                float top = y - tall * (0.6f + 0.4f * strength);
                int a = (int) (90 * strength) + 30;
                p.setShader(new LinearGradient(0, top, 0, y, new int[]{
                        Color.argb(0, 0, 0, 0), (a / 2 << 24) | col[1], (a << 24) | col[0], 0}, new float[]{0, 0.45f, 0.9f, 1},
                        Shader.TileMode.CLAMP));
                c.drawLine(x, top, x, y, p);
            }
        }
        ridge(c, r, w, h, h * 0.78f, h * 0.12f, 0.5f, 0xFF0A1424);
        trees(c, r, w, h * 0.92f, h * 0.10f, 0xFF04080F, 60);
    }

    private static void forest(Canvas c, Random r, int w, int h) {
        sky(c, w, h, h, 0xFFB8C6D1, 0xFFD9E2E8, 0xFFEEF2F3);
        glow(c, w * (0.2f + r.nextFloat() * 0.6f), h * 0.3f, h * 0.7f, 0x55FFF6E0);
        int[] cols = {0xFF9FB0B9, 0xFF7C919C, 0xFF5A707C, 0xFF3C515C, 0xFF22333C, 0xFF111D23};
        for (int i = 0; i < cols.length; i++) {
            float base = h * (0.55f + i * 0.09f);
            trees(c, r, w, base, h * (0.16f + i * 0.05f), cols[i], 30 - i * 3);
            if (i < cols.length - 1) mist(c, w, base - h * 0.06f, h * 0.12f, 0x55E8EEF0);
        }
        Paint ground = new Paint();
        ground.setShader(new LinearGradient(0, h * 0.72f, 0, h, 0x00111D23, 0xF0111D23, Shader.TileMode.CLAMP));
        c.drawRect(0, h * 0.72f, w, h, ground);
    }

    private static void dunes(Canvas c, Random r, int w, int h) {
        sky(c, w, h, h * 0.6f, 0xFF3E6D9C, 0xFFF2B880, 0xFFFFDCA8);
        float sunX = w * (0.15f + r.nextFloat() * 0.7f);
        glow(c, sunX, h * 0.42f, h * 0.45f, 0x88FFF0C8);
        disc(c, sunX, h * 0.42f, h * 0.04f, 0xFFFFF4DE);
        int[] lit = {0xFFE8A766, 0xFFD98C4A, 0xFFC4703A, 0xFFA2552C};
        int[] shade = {0xFFB97A4A, 0xFFA05E33, 0xFF864723, 0xFF66331A};
        for (int i = 0; i < lit.length; i++) {
            float base = h * (0.55f + i * 0.12f);
            Path dune = new Path();
            dune.moveTo(0, h);
            float x = -w * 0.1f, y = base;
            dune.lineTo(x, y);
            while (x < w * 1.1f) {
                float nx = x + w * (0.25f + r.nextFloat() * 0.3f);
                float ny = base + (r.nextFloat() - 0.5f) * h * 0.1f;
                dune.quadTo((x + nx) / 2, Math.min(y, ny) - h * (0.04f + r.nextFloat() * 0.07f), nx, ny);
                x = nx; y = ny;
            }
            dune.lineTo(w * 1.1f, h);
            dune.close();
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            boolean sunLeft = sunX < w / 2f;
            p.setShader(new LinearGradient(sunLeft ? 0 : w, 0, sunLeft ? w : 0, 0, lit[i], shade[i], Shader.TileMode.CLAMP));
            c.drawPath(dune, p);
        }
    }

    private static void lake(Canvas c, Random r, int w, int h) {
        float shore = h * 0.6f;
        Bitmap top = Bitmap.createBitmap(w, (int) shore, Bitmap.Config.ARGB_8888);
        Canvas t = new Canvas(top);
        sky(t, w, (int) shore, shore, 0xFF141E3C, 0xFF5B4B8A, 0xFFE59C7A);
        glow(t, w * (0.3f + r.nextFloat() * 0.4f), shore, h * 0.5f, 0x66FFB98A);
        ridge(t, r, w, (int) shore, shore * 0.8f, shore * 0.35f, 0.6f, 0xFF3B3C66);
        ridge(t, r, w, (int) shore, shore * 0.93f, shore * 0.2f, 0.5f, 0xFF1F2244);
        trees(t, r, w, shore + 2, shore * 0.08f, 0xFF0E1026, 90);
        c.drawBitmap(top, 0, 0, null);
        // reflection: mirrored, darker and bluer
        c.save();
        c.translate(0, shore * 2);
        c.scale(1, -1);
        Paint ref = new Paint();
        ref.setAlpha(150);
        c.drawBitmap(top, 0, 0, ref);
        c.restore();
        Paint tint = new Paint();
        tint.setShader(new LinearGradient(0, shore, 0, h, 0x660A1430, 0xEE050A1A, Shader.TileMode.CLAMP));
        c.drawRect(0, shore, w, h, tint);
        Paint ripple = new Paint(Paint.ANTI_ALIAS_FLAG);
        for (int i = 0; i < 70; i++) {
            float y = shore + (h - shore) * r.nextFloat();
            float x = r.nextFloat() * w, len = w * (0.02f + r.nextFloat() * 0.08f);
            ripple.setColor(Color.argb(25 + r.nextInt(35), 255, 220, 200));
            c.drawRect(x, y, x + len, y + 1.5f, ripple);
        }
        top.recycle();
    }

    // ------------------------------------------------------------------ building blocks

    private static void sky(Canvas c, int w, int h, float bottom, int top, int mid, int low) {
        Paint p = new Paint();
        p.setShader(new LinearGradient(0, 0, 0, bottom, new int[]{top, mid, low}, new float[]{0, 0.6f, 1}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
    }

    private static void glow(Canvas c, float x, float y, float radius, int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setShader(new RadialGradient(x, y, radius, color, color & 0x00FFFFFF, Shader.TileMode.CLAMP));
        c.drawCircle(x, y, radius, p);
    }

    private static void disc(Canvas c, float x, float y, float radius, int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        p.setMaskFilter(new BlurMaskFilter(radius * 0.15f, BlurMaskFilter.Blur.NORMAL));
        c.drawCircle(x, y, radius, p);
    }

    private static void mist(Canvas c, float w, float y, float height, int color) {
        Paint p = new Paint();
        p.setShader(new LinearGradient(0, y - height, 0, y + height,
                new int[]{color & 0x00FFFFFF, color, color & 0x00FFFFFF}, null, Shader.TileMode.CLAMP));
        c.drawRect(0, y - height, w, y + height, p);
    }

    /** Mountain ridge by midpoint displacement. */
    private static void ridge(Canvas c, Random r, int w, int h, float base, float height, float rough, int color) {
        int n = 257;
        float[] y = new float[n];
        y[0] = r.nextFloat();
        y[n - 1] = r.nextFloat();
        float amp = 1;
        for (int step = n - 1; step > 1; step /= 2) {
            for (int i = step / 2; i < n; i += step) {
                y[i] = (y[i - step / 2] + y[i + step / 2]) / 2 + (r.nextFloat() - 0.5f) * amp;
            }
            amp *= rough;
        }
        float min = Float.MAX_VALUE, max = -Float.MAX_VALUE;
        for (float v : y) { min = Math.min(min, v); max = Math.max(max, v); }
        Path path = new Path();
        path.moveTo(0, h);
        for (int i = 0; i < n; i++) {
            float norm = (y[i] - min) / Math.max(0.0001f, max - min);
            path.lineTo(w * i / (float) (n - 1), base - norm * height);
        }
        path.lineTo(w, h);
        path.close();
        c.drawPath(path, fill(color));
    }

    /** A row of pine silhouettes standing on y = base. */
    private static void trees(Canvas c, Random r, int w, float base, float height, int color, int count) {
        Paint p = fill(color);
        Path tree = new Path();
        for (int i = 0; i < count; i++) {
            float x = r.nextFloat() * w;
            float th = height * (0.6f + r.nextFloat() * 0.6f);
            float tw = th * (0.28f + r.nextFloat() * 0.1f);
            tree.reset();
            int tiers = 4;
            for (int k = 0; k < tiers; k++) {
                float ty = base - th * k / tiers * 0.85f;
                float half = tw / 2 * (1 - k / (float) (tiers + 1));
                tree.moveTo(x - half, ty);
                tree.lineTo(x, ty - th * 0.4f);
                tree.lineTo(x + half, ty);
                tree.close();
            }
            c.drawRect(x - tw * 0.04f, base - th * 0.1f, x + tw * 0.04f, base + 2, p);
            c.drawPath(tree, p);
        }
    }

    /** A whisper of noise so the gradients don't band on TVs. */
    private static void grain(Canvas c, Random r, int w, int h) {
        Paint p = new Paint();
        for (int i = 0; i < (w * h) / 180; i++) {
            p.setColor(r.nextBoolean() ? 0x08FFFFFF : 0x08000000);
            c.drawPoint(r.nextFloat() * w, r.nextFloat() * h, p);
        }
    }

    private static Paint fill(int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        return p;
    }
}
