# TCL TV toolkit: debloat + Apple TV-style home screen

Speeds up a TCL Google TV and gets rid of the ads. It runs from a laptop on the same Wi-Fi as the TV:

1. **Finds the TV** on your network and connects with adb
2. **Backs up** everything first: apps and their on/off state, settings, the home screen, plus a "before" screenshot
3. **Switches off** manufacturer ads, telemetry and junk. It asks before each group, only ever *disables* (never uninstalls), and takes a screenshot after each step so you can undo anything that looks wrong
4. **Installs TV Home**, a fast, minimal home screen: a row of your favourite apps over slowly changing nature wallpapers
5. **restore.sh** puts everything back exactly as it was

Written for a TCL with build `V8-R51MT08-LF1VO95.021344` (Android 11 / Google TV), but it works on any Android TV.

## What you need

- **The laptop** (Windows, Mac or Linux), on the same Wi-Fi as the TV. It only needs to stay on while the scripts run (about 15 to 30 minutes). After that the TV doesn't need it.
- **adb** (Google's free "platform-tools"):
  - Windows: `winget install Google.PlatformTools`, or unzip [platform-tools](https://developer.android.com/tools/releases/platform-tools) into this folder
  - Mac: `brew install android-platform-tools`
  - Linux: `sudo apt install adb`
- **Windows only:** [Git for Windows](https://git-scm.com/download/win), which provides the `bash` these scripts run in.
- **No Android SDK and no compiling.** The home screen app comes ready-made in `launcher/prebuilt/tvhome.apk`.

## On the TV, once

1. Settings > System > About > click **Build** 7 times ("You are now a developer")
2. Settings > System > Developer options > turn on **USB debugging** (on some TCLs it's called *Network debugging* or *Wireless debugging*)
3. Keep the TV on. When it asks "Allow debugging?", tick **Always allow** and press OK.

## Run it

**Windows:** double-click `Run on Windows.bat`.
**Mac/Linux:** open a terminal in this folder and run `./run_all.sh`.

That runs the four steps in order. You can also run them one at a time, and re-running any step is safe:

| Step | What it does |
|---|---|
| `./1_connect.sh` | Searches the network (or `./1_connect.sh 192.168.1.50`), connects, shows the model/build/memory, screenshot |
| `./2_backup.sh` | Saves everything to `tv-data/backups/<date>-<model>/`, plus a copy of `restore.sh` |
| `./3_debloat.sh` | Feature questions, then each group of junk, with a screenshot after each and the option to undo it |
| `./4_launcher.sh` | Installs TV Home, sends your dock list, previews it, then asks before making it the default |

Every screenshot is saved as a PNG, and each folder has an `index.html` you can open to flip through them.

### What the debloat asks you

First, which features you use. Saying **yes** protects everything related:
voice search, casting (Chromecast), live TV/antenna, HDMI-CEC (soundbar/console control), TCL Channel and free channels,
smart-home, screensaver, games, accessibility/parental controls.

Then it shows each group and you choose **Yes / No / Review one by one**:

- **Ads**: TCL's ad service and ad SDKs
- **Telemetry**: analytics, logging, and "viewing data" (automatic content recognition, Samba TV)
- **Promotions**: sponsored rows and buttons, the message box, TCL Channel, app-store nags
- **Feedback**: survey and feedback prompts
- **TCL apps it can't classify**: nothing is selected; you pick by number
- **Other preinstalled apps**: e.g. Google TV's movie store, YouTube Music; you pick by number

It never touches core Android, Google Play services, the Play Store, the TV's picture/sound/HDMI drivers, system updates,
your dock apps, or anything in `candidates.conf`'s protect list. Edit that file if you want to change what it looks for.

Some settings adb can't change reliably. The script lists them at the end so you can switch them off on the TV yourself:
"Viewing information services", usage & diagnostics, and ad personalisation.

### The home screen (TV Home)

- A full-screen wallpaper that cross-fades every 60 seconds with a slow drift. With no photos, it paints its own scenes
  (alpine dawn, ocean sunset, northern lights, misty forest, desert dunes, lake at dusk), different each time.
  To use your own photos, put them in `wallpapers/` and run `./4_launcher.sh --update-dock`.
- A clock and date, top right.
- **The dock:** Netflix, YouTube, Disney+, Peacock, Prime Video, Hulu, HBO Max, then All Apps, Inputs and Settings.
  Inputs lists the TV's inputs (HDMI 1, Antenna...) and switches to the one you pick; with Google TV's home switched off
  the remote's own Settings and Input buttons do nothing, so these two tiles replace them.
  An app that isn't installed shows a dimmed tile that opens its Play Store page.
- After 45 seconds without input, everything except the wallpaper fades away. Any button brings it back.
- **Changing the dock:**
  - On the TV: hold OK (or press Menu) on a dock tile to move or remove it. In All Apps, hold OK on any app to add it.
  - From the laptop: edit `config/dock.txt`, then run `./4_launcher.sh --update-dock` (this also installs a newer TV Home
    when the kit has one). The same file sets the wallpaper interval, 12/24-hour clock and motion on/off.
- It's a 38 KB app with no internet access, no tracking and no background services.

**About Google TV's Home button:** Google TV lets another home screen take over for a while, then takes the Home button
back (and always after a restart). On Google TV, `4_launcher.sh` therefore recommends switching the Google TV home off.
It's *disabled, not uninstalled*, and `restore.sh` switches it back on. It then tests the Home button (twice, starting
from another screen), offers to restart the TV to confirm TV Home survives the restart, and puts everything back
automatically if it didn't work. If Home ever goes back to the old screen, run `./4_launcher.sh --fix-home`
(Windows: `Fix Home button (Windows).bat`).

## Undo

```
./restore.sh            # undo everything (asks first)
./restore.sh --list     # just show what it would undo
./restore.sh --everything   # also re-enable anything disabled since the backup, even outside these scripts
./restore.sh --keep-launcher  # put the old home screen back but keep TV Home in the app list
```

A copy of `restore.sh` also lives in the backup folder (`tv-data/backups/.../restore.sh`), so keep that folder safe.
Restore switches the stock home back on before anything else, so the TV is never left without one, then re-enables apps,
resets settings and removes TV Home. Restart the TV afterwards.

If the TV ever ends up on a black screen with no home, the laptop can still reach it: run `./restore.sh`.

## Rebuilding the launcher (optional)

You don't need to. To change the app's code, run `./4_launcher.sh --build` (or `launcher/build.sh`).
It needs Java 11+, python3 and curl, **not** the Android SDK. The first build downloads about 145 MB of build tools from
Maven Central: the dex compiler, Google's APK signer and the Android class library. `launcher/tools/mkapk.py` does the
manifest and resource packaging that Android Studio would normally do.
`launcher/tools/tvhome-debug.p12` is a throwaway signing key (password `tvhome-debug`). It's kept so rebuilt APKs can
update the installed one.

## Files

```
run_all.sh  1_connect.sh  2_backup.sh  3_debloat.sh  4_launcher.sh  restore.sh  lib.sh
candidates.conf          what the debloat looks for / protects
config/dock.txt          your dock apps and launcher settings
wallpapers/              optional photos for the home screen
launcher/                TV Home source, build script, ready-made APK
tv-data/                 created on first run: backups, screenshots (stays on your computer)
```
