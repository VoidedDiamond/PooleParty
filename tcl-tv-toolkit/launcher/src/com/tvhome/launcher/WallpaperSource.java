package com.tvhome.launcher;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Environment;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/**
 * Supplies the next wallpaper: your photos (pushed by 4_launcher.sh) in shuffled order,
 * or painted nature scenes when there are none. Call next() off the main thread.
 */
final class WallpaperSource {

    static final class Item {
        final Bitmap bitmap;
        final String caption;

        Item(Bitmap bitmap, String caption) {
            this.bitmap = bitmap;
            this.caption = caption;
        }
    }

    private final Context context;
    private final int width, height;
    private final Random random = new Random();
    private final List<File> queue = new ArrayList<>();
    private int sceneIndex = new Random().nextInt(SceneFactory.NAMES.length);

    WallpaperSource(Context context, int width, int height) {
        this.context = context.getApplicationContext();
        this.width = width;
        this.height = height;
    }

    synchronized Item next() {
        if (queue.isEmpty()) {
            queue.addAll(photos());
            Collections.shuffle(queue, random);
        }
        while (!queue.isEmpty()) {
            File f = queue.remove(0);
            Bitmap b = decode(f);
            if (b != null) return new Item(b, "");
        }
        int kind = sceneIndex++ % SceneFactory.NAMES.length;
        return new Item(SceneFactory.render(kind, random.nextLong(), width, height), SceneFactory.NAMES[kind]);
    }

    private List<File> photos() {
        List<File> out = new ArrayList<>();
        File ext = context.getExternalFilesDir("wallpapers");
        collect(ext, out);
        // also allow /sdcard/TVHome/wallpapers for people who copy photos with a file manager
        collect(new File(Environment.getExternalStorageDirectory(), "TVHome/wallpapers"), out);
        return out;
    }

    private static void collect(File dir, List<File> out) {
        if (dir == null) return;
        File[] files;
        try {
            files = dir.listFiles();
        } catch (SecurityException e) {
            return;
        }
        if (files == null) return;
        for (File f : files) {
            String n = f.getName().toLowerCase();
            if (f.isFile() && (n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png") || n.endsWith(".webp"))) {
                out.add(f);
            }
        }
    }

    /** Decode at roughly screen size so a 24-megapixel photo doesn't eat the TV's memory. */
    private Bitmap decode(File f) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(f.getPath(), o);
            if (o.outWidth <= 0 || o.outHeight <= 0) return null;
            int sample = 1;
            while (o.outWidth / (sample * 2) >= width && o.outHeight / (sample * 2) >= height) sample *= 2;
            BitmapFactory.Options d = new BitmapFactory.Options();
            d.inSampleSize = sample;
            return BitmapFactory.decodeFile(f.getPath(), d);
        } catch (OutOfMemoryError | RuntimeException e) {
            return null;
        }
    }
}
