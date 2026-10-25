#!/usr/bin/env bash
# build.sh - build launcher/build/tvhome.apk WITHOUT the Android SDK.
#
# Needs: Java 11+ (javac, java), python3, curl.
# The first build downloads three files from Maven Central into ~/.cache/tvhome-build (about 145 MB,
# almost all of it the Android class library used for compiling):
#   dalvik-dx (turns Java classes into Android's dex format), apksig (Google's APK signer),
#   android-all (the Android 11 framework classes, from the Robolectric project).
# If you do have the Android SDK, set ANDROID_HOME and its android.jar is used instead of android-all.
#
# usage: ./build.sh            build, then copy the result to prebuilt/tvhome.apk
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

CACHE="${TVHOME_BUILD_CACHE:-$HOME/.cache/tvhome-build}"
MAVEN="https://repo1.maven.org/maven2"
DX="$CACHE/dalvik-dx-16.0.1.jar"
APKSIG="$CACHE/apksig-2.3.0.jar"
ANDROID_ALL="$CACHE/android-all-11-robolectric-6757853.jar"
KEYSTORE="tools/tvhome-debug.p12"; KEYPASS="tvhome-debug"

need() { command -v "$1" >/dev/null 2>&1 || { echo "✘ $1 is missing. $2" >&2; exit 1; }; }
need javac "Install a JDK 11 or newer (e.g. https://adoptium.net)."
need java  "Install a JDK 11 or newer (e.g. https://adoptium.net)."
PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || { echo "✘ python3 is missing (https://www.python.org/downloads/)." >&2; exit 1; }
need curl "Install curl."

fetch() {   # fetch maven-path dest
  [ -s "$2" ] && return 0
  mkdir -p "$CACHE"
  echo "Downloading $(basename "$2") ..."
  curl -fL --retry 3 -o "$2.part" "$MAVEN/$1" && mv "$2.part" "$2"
}
fetch com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar "$DX"
fetch com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar "$APKSIG"

ANDROID_JAR=""
if [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME/platforms" ]; then
  ANDROID_JAR="$(ls -d "$ANDROID_HOME"/platforms/android-*/android.jar 2>/dev/null | sort -V | tail -1 || true)"
fi
if [ -z "$ANDROID_JAR" ]; then
  fetch org/robolectric/android-all/11-robolectric-6757853/android-all-11-robolectric-6757853.jar "$ANDROID_ALL"
  ANDROID_JAR="$ANDROID_ALL"
fi

rm -rf build; mkdir -p build/classes
echo "Compiling Java..."
# Java 8 language level (what dx understands); java.* comes from the JDK, android.* from ANDROID_JAR
javac -nowarn -Xlint:-options --release 8 -encoding UTF-8 \
      -cp "$ANDROID_JAR" -d build/classes $(find src -name '*.java')
echo "Converting to dex..."
java -cp "$DX" com.android.dx.command.Main --dex --min-sdk-version=24 --output=build/classes.dex build/classes
echo "Packaging..."
"$PY" tools/mkapk.py AndroidManifest.xml res build/classes.dex build/unsigned.apk
echo "Signing..."
# apksig 2.3 (the newest on Maven Central) touches a JDK-internal class while loading, hence the export
java --add-exports java.base/sun.security.x509=ALL-UNNAMED -cp "$APKSIG" tools/Sign.java build/unsigned.apk build/tvhome.apk "$KEYSTORE" "$KEYPASS"
mkdir -p prebuilt && cp build/tvhome.apk prebuilt/tvhome.apk
echo "✔ Built build/tvhome.apk ($(wc -c < build/tvhome.apk | tr -d ' ') bytes), also copied to prebuilt/tvhome.apk"
