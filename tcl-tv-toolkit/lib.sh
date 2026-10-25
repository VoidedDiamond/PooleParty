#!/usr/bin/env bash
# lib.sh - shared helpers. Every script sources this; you never run it directly.

TOOLKIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Where backups, screenshots and the saved TV address live.
# When this file sits inside a backup folder (restore.sh copies), use that backup's data folder.
if [ -z "${TCL_TOOLKIT_DATA:-}" ] && [ -f "$TOOLKIT_DIR/changes.log" ]; then
  TCL_TOOLKIT_DATA="$(cd "$TOOLKIT_DIR/../.." && pwd)"
fi
DATA_DIR="${TCL_TOOLKIT_DATA:-$TOOLKIT_DIR/tv-data}"
mkdir -p "$DATA_DIR"

LAUNCHER_PKG="com.tvhome.launcher"
LAUNCHER_ACT=".MainActivity"
FILES_DIR_ON_TV="/sdcard/Android/data/$LAUNCHER_PKG/files"
WALL_DIR_ON_TV="$FILES_DIR_ON_TV/wallpapers"
EXPECTED_BUILD="R51MT08"      # from the build number you gave: V8-R51MT08-LF1VO95.021344

# Stock home screens we know about (Google TV, Android TV, TCL's own)
STOCK_HOMES="com.google.android.apps.tv.launcherx com.google.android.tvlauncher com.google.android.leanbacklauncher com.tcl.cyberui com.tcl.home"
# Google TV restarts its setup app as a home screen if launcherx is switched off; it goes with it.
STOCK_HOME_HELPERS="com.google.android.tungsten.setupwraith"

# ------------------------------------------------------------------ output
if [ -t 1 ]; then
  C_OK=$'\e[32m'; C_WARN=$'\e[33m'; C_ERR=$'\e[31m'; C_DIM=$'\e[2m'; C_HEAD=$'\e[1;36m'; C_OFF=$'\e[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_HEAD=""; C_OFF=""
fi
say()   { printf '%s\n' "$*"; }
ok()    { printf '%s✔%s %s\n' "$C_OK" "$C_OFF" "$*"; }
warn()  { printf '%s!%s %s\n' "$C_WARN" "$C_OFF" "$*"; }
err()   { printf '%s✘%s %s\n' "$C_ERR" "$C_OFF" "$*" >&2; }
die()   { err "$*"; exit 1; }
dim()   { printf '%s%s%s\n' "$C_DIM" "$*" "$C_OFF"; }
head1() { printf '\n%s== %s ==%s\n' "$C_HEAD" "$*" "$C_OFF"; }

# ask_yn "question" y|n   -> returns 0 for yes. Enter (or no keyboard) picks the default.
ask_yn() {
  local q="$1" def="${2:-n}" hint a
  [ "$def" = y ] && hint="[Y/n]" || hint="[y/N]"
  printf '%s %s ' "$q" "$hint"
  if ! IFS= read -r a; then a=""; fi
  [ -t 0 ] || echo
  a="$(printf '%s' "$a" | tr '[:upper:]' '[:lower:]')"
  [ -z "$a" ] && a="$def"
  case "$a" in y|yes) return 0 ;; *) return 1 ;; esac
}

# ------------------------------------------------------------------ adb
find_adb() {
  if command -v adb >/dev/null 2>&1; then return 0; fi
  if command -v adb.exe >/dev/null 2>&1; then adb() { adb.exe "$@"; }; return 0; fi
  local d
  for d in "$TOOLKIT_DIR/platform-tools" "$HOME/platform-tools" "$HOME/Library/Android/sdk/platform-tools" \
           "${ANDROID_HOME:-/nonexistent}/platform-tools" "${LOCALAPPDATA:-/nonexistent}/Android/Sdk/platform-tools"; do
    if [ -x "$d/adb" ] || [ -x "$d/adb.exe" ]; then PATH="$d:$PATH"; export PATH; find_adb; return $?; fi
  done
  err "adb isn't installed on this computer."
  cat >&2 <<'EOF'
  Install Google's "SDK Platform-Tools" (free, small):
    Windows : winget install Google.PlatformTools      (or unzip platform-tools into this folder)
    Mac     : brew install android-platform-tools
    Linux   : sudo apt install adb
  Download page: https://developer.android.com/tools/releases/platform-tools
EOF
  exit 1
}
find_adb

SERIAL="${TV_SERIAL:-}"
# Every call gets </dev/null so adb never swallows keyboard input meant for our prompts or loops.
A()    { adb -s "$SERIAL" "$@" </dev/null; }
tvsh() { adb -s "$SERIAL" shell "$@" </dev/null 2>&1 | tr -d '\r'; }
prop() { tvsh getprop "$1"; }

state_of() { adb -s "$1" get-state </dev/null 2>/dev/null | tr -d '\r'; }

# connect_to HOST[:PORT] -> sets SERIAL, waits for the TV to approve this computer
connect_to() {
  local t="$1" out i st
  case "$t" in *:*) ;; *) t="$t:5555" ;; esac
  out="$(adb connect "$t" </dev/null 2>&1 | tr -d '\r')"
  say "$out"
  case "$out" in *"connected to"*) ;; *) return 1 ;; esac
  for i in $(seq 1 45); do
    st="$(state_of "$t")"
    [ "$st" = device ] && { SERIAL="$t"; return 0; }
    [ "$i" = 1 ] && say "If the TV shows an \"Allow debugging?\" box, choose \"Always allow\" and press OK."
    sleep 2
  done
  warn "The TV never approved this computer (state: ${st:-none})."
  return 1
}

save_serial() { printf '%s\n' "$SERIAL" > "$DATA_DIR/serial"; }

# require_tv: make sure the TV from 1_connect.sh is reachable, reconnecting over Wi-Fi if needed
require_tv() {
  if [ -z "$SERIAL" ]; then
    [ -f "$DATA_DIR/serial" ] && SERIAL="$(head -1 "$DATA_DIR/serial")"
    [ -z "$SERIAL" ] && [ -n "${BACKUP_DIR:-}" ] && [ -f "$BACKUP_DIR/serial" ] && SERIAL="$(head -1 "$BACKUP_DIR/serial")"
  fi
  [ -n "$SERIAL" ] || die "I don't know which TV to use yet. Run ./1_connect.sh first."
  if [ "$(state_of "$SERIAL")" != device ]; then
    case "$SERIAL" in
      *:*) say "Reconnecting to the TV at $SERIAL ..."; connect_to "$SERIAL" >/dev/null || true ;;
    esac
  fi
  [ "$(state_of "$SERIAL")" = device ] || die "Can't reach the TV ($SERIAL). Is it on, on the same Wi-Fi, with debugging enabled? Then run ./1_connect.sh again."
}

# ------------------------------------------------------------------ packages
pkg_list() { tvsh pm list packages "$@" | sed -n 's/^package://p' | sort -u; }
pkg_enabled()  { pkg_list -e; }
pkg_disabled() { pkg_list -d; }
pkg_system()   { pkg_list -s; }
pkg_user()     { pkg_list -3; }
pkg_exists()   { pkg_list | grep -qx "$1"; }

# Packages that have a tile in the TV's app list
pkg_with_icons() {
  { tvsh cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER
    tvsh cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER
  } | grep -oE '^[[:space:]]*[A-Za-z0-9_.]+/' | tr -d ' /' | sort -u
}

disable_pkg() {
  local out
  out="$(tvsh pm disable-user --user 0 "$1")"
  case "$out" in
    *disabled-user*) log_change "DISABLED $1"; return 0 ;;
    *) dim "    ($1: ${out:-no answer})"; return 1 ;;
  esac
}
enable_pkg() {
  local out
  out="$(tvsh pm enable --user 0 "$1")"
  case "$out" in
    *"new state: enabled"*) [ -n "${CHANGES:-}" ] && log_change "ENABLED $1"; return 0 ;;
    *) dim "    ($1: ${out:-no answer})"; return 1 ;;
  esac
}

# ------------------------------------------------------------------ home screen
current_home() {
  tvsh cmd package resolve-activity --brief --user 0 -a android.intent.action.MAIN -c android.intent.category.HOME | tail -1
}
set_home() {
  [ -n "$1" ] || return 1
  local out; out="$(tvsh cmd package set-home-activity --user 0 "$1")"
  case "$out" in *Success*|"") ;; *) return 1 ;; esac
  same_component "$(current_home)" "$1"
}
# compare com.x/.A with com.x/com.x.A
same_component() {
  local a="$1" b="$2"
  norm() { local p="${1%%/*}" c="${1#*/}"; case "$c" in .*) c="$p$c" ;; esac; printf '%s/%s' "$p" "$c"; }
  [ "$(norm "$a")" = "$(norm "$b")" ]
}
top_activity() {
  tvsh dumpsys activity activities | grep -E 'mResumedActivity|ResumedActivity:' | head -1 | grep -oE '[A-Za-z0-9_.]+/[A-Za-z0-9_.$]+' | head -1
}
go_home() { tvsh input keyevent KEYCODE_HOME >/dev/null; sleep "${1:-3}"; }

# ------------------------------------------------------------------ backups and the change log
# Everything that changes is written to changes.log in the backup folder; restore.sh replays it backwards.
#   DISABLED pkg | ENABLED pkg | SETTING ns key old-value | HOME_PREV comp | HOME_SET comp
#   LAUNCHER_INSTALLED pkg | STOCK_HOME_DISABLED pkg
latest_backup() {
  local d
  [ -f "$DATA_DIR/latest_backup" ] && d="$(head -1 "$DATA_DIR/latest_backup")"
  if [ -n "${d:-}" ] && [ -f "$d/changes.log" ]; then printf '%s\n' "$d"; return 0; fi
  d="$(ls -d "$DATA_DIR"/backups/*/ 2>/dev/null | sort | tail -1)"
  [ -n "$d" ] && [ -f "$d/changes.log" ] && printf '%s\n' "${d%/}"
}
load_backup() {
  BACKUP_DIR="${BACKUP_DIR:-$(latest_backup)}"
  [ -n "$BACKUP_DIR" ] && [ -f "$BACKUP_DIR/changes.log" ] || die "No backup found. Run ./2_backup.sh first - nothing is changed without one."
  CHANGES="$BACKUP_DIR/changes.log"
}
log_change() { [ -n "${CHANGES:-}" ] && printf '%s\n' "$*" >> "$CHANGES"; }

# put_setting ns key value  (logs the old value first so it can be put back)
put_setting() {
  local old; old="$(tvsh settings get "$1" "$2")"
  [ "$old" = "$3" ] && return 0
  log_change "SETTING $1 $2 ${old:-null}"
  tvsh settings put "$1" "$2" "$3" >/dev/null
}

# ------------------------------------------------------------------ screenshots
SHOT_N=0
init_shots() {
  SHOT_DIR="${1:-$DATA_DIR/shots/$(date +%Y%m%d-%H%M%S)}"
  mkdir -p "$SHOT_DIR"; SHOT_N=0
  [ -f "$SHOT_DIR/index.html" ] || printf '<!doctype html><meta charset="utf-8"><title>TV screenshots</title><body style="background:#111;color:#eee;font-family:sans-serif">\n' > "$SHOT_DIR/index.html"
}
# shot name "caption": grabs the TV screen into SHOT_DIR/NN_name.png and adds it to index.html
shot() {
  [ -n "${SHOT_DIR:-}" ] || init_shots
  SHOT_N=$((SHOT_N+1))
  local f; f="$SHOT_DIR/$(printf '%02d' "$SHOT_N")_$1.png"
  adb -s "$SERIAL" exec-out screencap -p </dev/null > "$f" 2>/dev/null
  if ! head -c 4 "$f" 2>/dev/null | grep -q PNG; then
    # some TVs mangle exec-out; fall back to saving on the TV and pulling it
    tvsh screencap -p /sdcard/.tvtk_shot.png >/dev/null
    A pull /sdcard/.tvtk_shot.png "$f" >/dev/null 2>&1
    tvsh rm -f /sdcard/.tvtk_shot.png >/dev/null
  fi
  if head -c 4 "$f" 2>/dev/null | grep -q PNG; then
    printf '<figure><img src="%s" style="max-width:100%%"><figcaption>%s</figcaption></figure>\n' "$(basename "$f")" "${2:-$1}" >> "$SHOT_DIR/index.html"
    ok "screenshot: $f"
    [ "${TVTK_OPEN_SHOTS:-0}" = 1 ] && open_file "$f"
  else
    rm -f "$f"; warn "couldn't take a screenshot (the TV may block it on some screens) - check the TV itself"
  fi
}
open_file() {
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then open "$1"
  elif command -v cmd.exe >/dev/null 2>&1; then cmd.exe /c start "" "$(cygpath -w "$1" 2>/dev/null || echo "$1")" >/dev/null 2>&1
  fi
}

sha_cmd() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
