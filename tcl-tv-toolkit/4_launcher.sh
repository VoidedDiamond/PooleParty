#!/usr/bin/env bash
# 4_launcher.sh - install the Apple TV-style home screen and (if you agree) make it the default.
#
# usage: ./4_launcher.sh                    install the ready-made APK + preview + ask to make it the default
#        ./4_launcher.sh --build            rebuild the APK from source first (needs Java; see launcher/build.sh)
#        ./4_launcher.sh --apk file.apk     install a different APK
#        ./4_launcher.sh --no-default       install and preview only
#        ./4_launcher.sh --update-dock      just push config/dock.txt and wallpapers/ to the TV (no reinstall)
#        ./4_launcher.sh --replace-wallpapers   delete the photos already on the TV first
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"
. ./lib.sh

APK=""; BUILD=0; SET_DEFAULT=ask; UPDATE_ONLY=0; REPLACE_WALLS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --apk) APK="${2:-}"; shift ;;
    --build) BUILD=1 ;;
    --no-default) SET_DEFAULT=no ;;
    --update-dock) UPDATE_ONLY=1 ;;
    --replace-wallpapers) REPLACE_WALLS=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

require_tv
FULL="$LAUNCHER_PKG/$LAUNCHER_ACT"

push_files() {
  # opening the app once makes Android create its folder, so the files land somewhere it can read
  tvsh "am start -n $FULL" >/dev/null 2>&1; sleep 2
  tvsh "mkdir -p $WALL_DIR_ON_TV" >/dev/null
  if [ -f config/dock.txt ]; then
    # touch: adb keeps the laptop file's date, and the launcher uses whichever dock list is newest
    if A push config/dock.txt "$FILES_DIR_ON_TV/dock.txt" >/dev/null 2>&1; then
      tvsh "touch $FILES_DIR_ON_TV/dock.txt" >/dev/null; ok "dock list sent to the TV"
    else
      warn "couldn't send dock.txt (the launcher will use its built-in list)"
    fi
  fi
  if [ "$REPLACE_WALLS" = 1 ]; then
    tvsh "rm -f $WALL_DIR_ON_TV/*" >/dev/null; dim "  cleared old wallpapers on the TV"
  fi
  local n=0 f lc
  for f in wallpapers/*; do
    [ -f "$f" ] || continue
    lc="$(printf '%s' "$f" | tr '[:upper:]' '[:lower:]')"
    case "$lc" in *.jpg|*.jpeg|*.png|*.webp)
      if A push "$f" "$WALL_DIR_ON_TV/" >/dev/null 2>&1; then n=$((n+1)); else warn "couldn't send $f"; fi ;;
    esac
  done
  if [ "$n" -gt 0 ]; then ok "$n wallpaper photo(s) sent"; else dim "no photos in ./wallpapers - the launcher will paint its own nature scenes"; fi
  # tell a running launcher to reload
  tvsh "am broadcast -a $LAUNCHER_PKG.RELOAD -p $LAUNCHER_PKG" >/dev/null 2>&1
}

if [ "$UPDATE_ONLY" = 1 ]; then
  init_shots
  head1 "Updating dock and wallpapers"
  push_files
  tvsh "am start -n $FULL" >/dev/null 2>&1; sleep 4
  shot "dock_updated" "Home screen after updating the dock"
  exit 0
fi

load_backup
init_shots "$BACKUP_DIR/screenshots_launcher_$(date +%H%M%S)"
head1 "Step 4: the home screen"

# ---------------------------------------------------------------- the APK
if [ "$BUILD" = 1 ]; then
  say "Building the launcher from source..."
  ( cd launcher && ./build.sh ) || die "The build didn't finish (see above). The ready-made APK in launcher/prebuilt/ still works."
  APK="launcher/build/tvhome.apk"
fi
[ -n "$APK" ] || APK="launcher/prebuilt/tvhome.apk"
[ -f "$APK" ] || die "APK not found: $APK  (run ./4_launcher.sh --build to make one)"

# ---------------------------------------------------------------- install
say "Installing $APK ..."
tvsh "pm enable --user 0 $LAUNCHER_PKG" >/dev/null 2>&1   # in case an earlier step switched it off
out="$(A install -r "$APK" 2>&1 | tr -d '\r' | tail -3)"
case "$out" in
  *Success*) ok "installed" ;;
  *INSTALL_FAILED_UPDATE_INCOMPATIBLE*|*signatures*)
    err "A different build of TV Home is already on the TV (signed with another key)."
    say "Remove it with:  adb -s $SERIAL uninstall $LAUNCHER_PKG   then run this again."; exit 1 ;;
  *) err "install failed:"; say "$out"; exit 1 ;;
esac
grep -q '^LAUNCHER_INSTALLED' "$CHANGES" || log_change "LAUNCHER_INSTALLED $LAUNCHER_PKG"

push_files

# which favourites does this TV actually have?
head1 "Dock check"
installed_all="$(tvsh 'pm list packages' | sed -n 's/^package://p')"
grep -Ev '^[[:space:]]*(#|@|$)' config/dock.txt | tr -d '\r' | while IFS='|' read -r label pkgs; do
  found=""
  for p in $(printf '%s' "$pkgs" | tr ',' ' '); do
    printf '%s\n' "$installed_all" | grep -qx "$p" && { found="$p"; break; }
  done
  if [ -n "$found" ]; then ok "$label ($found)"; else warn "$label is not installed - its dock tile will open the Play Store page"; fi
done

# ---------------------------------------------------------------- preview
head1 "Preview"
tvsh "am start -n $FULL" >/dev/null 2>&1
sleep 4
shot "launcher_preview" "New launcher started (not yet the default)"
say "Look at the TV (or the screenshot). Use the remote's left/right to move along the dock."
if ! ask_yn "Does it look right?" y; then
  warn "Left installed but NOT set as default. Tweak config/dock.txt and run ./4_launcher.sh --update-dock, or run restore.sh to remove it."
  exit 0
fi

# ---------------------------------------------------------------- make it the home screen
[ "$SET_DEFAULT" = no ] && { ok "Done (not set as default)."; exit 0; }
say
say "Making it the default means the Home button opens this screen instead of the TCL/Google home."
say "The original home stays installed, so you can always switch back (restore.sh does it for you)."
ask_yn "Make it the default home screen?" y || { ok "Done (not set as default)."; exit 0; }

prev="$(current_home)"
home_works() { go_home 3; same_component "$(top_activity)" "$FULL"; }

set_home "$FULL" && log_change "HOME_SET $FULL"
if home_works; then
  shot "launcher_is_home" "Pressed Home - shows the new launcher"
  ok "The Home button now opens TV Home."
else
  shot "home_still_stock" "Pressed Home - still the old home screen"
  warn "The Home button still goes to the old home screen: $(top_activity)"
  say "Google TV keeps its own home in charge of the Home button. The usual fix is to switch the"
  say "Google TV home off (disabled, not uninstalled - restore.sh switches it straight back on)."
  say "You'd lose Google TV's recommendation rows and profiles; the Play Store, voice search, casting"
  say "and every app keep working, and TV Home has an All Apps screen."
  if ask_yn "Switch off the stock home screen so Home opens TV Home?" n; then
    turned_off=""
    for p in ${prev%%/*} $STOCK_HOMES $STOCK_HOME_HELPERS; do
      [ "$p" = "$LAUNCHER_PKG" ] && continue
      case " $turned_off " in *" $p "*) continue ;; esac
      pkg_enabled | grep -qx "$p" || continue
      if tvsh pm disable-user --user 0 "$p" | grep -q disabled-user; then
        log_change "STOCK_HOME_DISABLED $p"; turned_off="$turned_off $p"; dim "  switched off $p"
      fi
    done
    set_home "$FULL" && log_change "HOME_SET $FULL"
    if home_works; then
      shot "launcher_is_home" "Pressed Home - shows the new launcher"
      ok "The Home button now opens TV Home."
    else
      shot "home_failed" "Pressed Home - still not the new launcher"
      warn "That didn't work either - switching the stock home back on."
      for p in $turned_off; do tvsh pm enable --user 0 "$p" >/dev/null; log_change "ENABLED $p"; done
      set_home "$prev" >/dev/null 2>&1 || true
      go_home 3; shot "home_reverted" "Back to the original home"
      say "TV Home stays in your app list, so you can still open it from there."
      exit 0
    fi
  else
    say "OK - TV Home stays in your app list; nothing else changed."
    exit 0
  fi
fi

if ! ask_yn "Press Home on the remote a couple of times and try the dock. Keep TV Home as your home screen?" y; then
  for p in ${turned_off:-}; do tvsh pm enable --user 0 "$p" >/dev/null; log_change "ENABLED $p"; done
  set_home "$prev" >/dev/null 2>&1 || true
  go_home 3; shot "home_reverted" "Back to the original home"
  warn "Reverted to the previous home screen (TV Home is still in your app list)."
  exit 0
fi
say
ok "All done. Undo everything any time with: $BACKUP_DIR/restore.sh"
say "Change dock apps later: edit config/dock.txt, then ./4_launcher.sh --update-dock"
say "(or on the TV: open All Apps, highlight an app and press OK-and-hold / Menu to add or remove it)"
