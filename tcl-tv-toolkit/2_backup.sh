#!/usr/bin/env bash
# 2_backup.sh - save the TV's current state to this computer before anything is changed.
#
# Saves: device properties, every package and whether it's enabled, all settings, the default
# home screen, a performance baseline and a "before" screenshot - plus restore.sh to undo
# everything the later steps do. One backup per TV is kept and reused, so restore.sh always
# goes back to how the TV was before the very first change.
#
# usage: ./2_backup.sh          (add --new to start a fresh backup even if one exists)
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"
. ./lib.sh

NEW=0; [ "${1:-}" = "--new" ] && NEW=1
require_tv
head1 "Step 2: back up the TV's current state"

existing="$(latest_backup || true)"
if [ -n "$existing" ] && [ "$NEW" = 0 ] && [ "$(head -1 "$existing/serial" 2>/dev/null)" = "$SERIAL" ]; then
  ok "This TV already has a backup: $existing"
  say "It's kept so restore.sh can always take the TV back to how it was before the first change."
  if ask_yn "Keep using it (recommended)?" y; then
    init_shots "$existing/screenshots"
    shot "backup_check_$(date +%H%M%S)" "TV screen when the backup was re-checked"
    ok "Next: ./3_debloat.sh"
    exit 0
  fi
fi

model="$(prop ro.product.model | tr -c 'A-Za-z0-9_-' '_' | sed 's/_*$//')"
BACKUP_DIR="$DATA_DIR/backups/$(date +%Y%m%d-%H%M%S)-${model:-tv}"
mkdir -p "$BACKUP_DIR/state"
CHANGES="$BACKUP_DIR/changes.log"
say "Saving to: $BACKUP_DIR"

tvsh getprop > "$BACKUP_DIR/state/getprop.txt"
ok "device properties"

pkg_list -f -U        > "$BACKUP_DIR/state/packages_all.txt"
pkg_enabled           > "$BACKUP_DIR/state/packages_enabled.txt"
pkg_disabled          > "$BACKUP_DIR/disabled_before.txt"
pkg_system            > "$BACKUP_DIR/state/packages_system.txt"
pkg_user              > "$BACKUP_DIR/state/packages_user.txt"
pkg_with_icons        > "$BACKUP_DIR/state/packages_with_icons.txt"
tvsh dumpsys package preferred-activities > "$BACKUP_DIR/state/preferred_activities.txt"
n_all="$(pkg_list | wc -l | tr -d ' ')"; n_dis="$(wc -l < "$BACKUP_DIR/disabled_before.txt" | tr -d ' ')"
[ "$n_all" -gt 0 ] || die "The TV returned an empty package list - backup aborted, nothing was changed."
ok "package list: $n_all packages, $n_dis were already disabled"

for ns in global secure system; do tvsh settings list "$ns" > "$BACKUP_DIR/state/settings_$ns.txt"; done
ok "settings (global/secure/system)"

home="$(current_home)"
printf '%s\n' "$home" > "$BACKUP_DIR/home_before.txt"
printf 'HOME_PREV %s\n' "$home" > "$CHANGES"
ok "default home screen: $home"

{
  echo "# taken $(date)"
  tvsh cat /proc/meminfo | grep -E '^(MemTotal|MemFree|MemAvailable|Cached|SwapTotal|SwapFree)'
  echo; tvsh df -h /data
  echo; echo "# running processes by memory"
  tvsh dumpsys meminfo | sed -n '/Total PSS by process/,/Total PSS by OOM/p' | head -30
} > "$BACKUP_DIR/perf_before.txt"
ok "performance baseline"

n_user="$(wc -l < "$BACKUP_DIR/state/packages_user.txt" | tr -d ' ')"
if [ "$n_user" -gt 0 ]; then
  say
  say "You have $n_user user-installed apps. Disabling never removes them or their data, so this is only"
  say "an extra safety net (it can be several hundred MB)."
  if ask_yn "Also copy their APK files to this laptop?" n; then
    mkdir -p "$BACKUP_DIR/apks"
    while IFS= read -r p <&3; do
      i=0
      for path in $(tvsh pm path "$p" | sed -n 's/^package://p'); do
        i=$((i+1)); A pull "$path" "$BACKUP_DIR/apks/${p}_$i.apk" >/dev/null 2>&1 && dim "  $p" || warn "couldn't copy $p"
      done
    done 3< "$BACKUP_DIR/state/packages_user.txt"
  fi
fi

cp lib.sh restore.sh "$BACKUP_DIR/"
chmod +x "$BACKUP_DIR/restore.sh"
printf '%s\n' "$SERIAL" > "$BACKUP_DIR/serial"
( cd "$BACKUP_DIR" && find . -type f ! -name MANIFEST.sha256 ! -name changes.log ! -name '*.png' | sort | while IFS= read -r f; do sha_cmd "$f"; done > MANIFEST.sha256 )
printf '%s\n' "$BACKUP_DIR" > "$DATA_DIR/latest_backup"

init_shots "$BACKUP_DIR/screenshots"
go_home
shot "before_any_changes" "Home screen before any changes"

say
ok "Backup complete."
say "  Backup folder : $BACKUP_DIR"
say "  To undo everything later: $BACKUP_DIR/restore.sh"
say "Keep that folder safe; it is all the restore script needs."
say
ok "Next: ./3_debloat.sh"
