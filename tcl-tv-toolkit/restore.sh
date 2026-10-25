#!/usr/bin/env bash
# restore.sh - undo what this toolkit changed on the TV.
#
# Reads the backup's changes.log and plays it backwards: re-enables every app that was disabled,
# puts changed settings back, switches the original home screen back on and makes it the default.
# A copy lives in every backup folder, so you can run it from there too.
#
# usage: ./restore.sh                 undo everything in the latest backup (asks first)
#        ./restore.sh --list          only show what would be undone
#        ./restore.sh --everything    also re-enable anything disabled since the backup that isn't in the log
#        ./restore.sh --keep-launcher put the old home screen back but leave the TV Home app installed
#        ./restore.sh --backup DIR    use a specific backup folder
#        ./restore.sh --yes           don't ask for confirmation
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
[ -f "$HERE/changes.log" ] && BACKUP_DIR="$HERE"
. ./lib.sh

LIST=0; EVERYTHING=0; KEEP_LAUNCHER=0; YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --list) LIST=1 ;;
    --everything) EVERYTHING=1 ;;
    --keep-launcher) KEEP_LAUNCHER=1 ;;
    --backup) BACKUP_DIR="$(cd "${2:?folder missing}" && pwd)"; shift ;;
    --yes|-y) YES=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

load_backup
head1 "Restore from $(basename "$BACKUP_DIR")"

# ---------------------------------------------------------------- work out the net changes
# For each package, only its last logged action counts; for settings, the first logged old value.
to_enable="$(awk '$1=="DISABLED"{s[$2]=1} $1=="ENABLED"{s[$2]=0} END{for(p in s) if(s[p]) print p}' "$CHANGES" | sort)"
stock_off="$(awk '$1=="STOCK_HOME_DISABLED"{print $2}' "$CHANGES" | sort -u)"
settings="$(awk '$1=="SETTING" && !seen[$2" "$3]++ {print $2, $3, $4}' "$CHANGES")"
home_prev="$(awk '$1=="HOME_PREV"{print $2; exit}' "$CHANGES")"
home_set="$(grep -c '^HOME_SET' "$CHANGES")"
launcher="$(grep -c '^LAUNCHER_INSTALLED' "$CHANGES")"

if [ "$EVERYTHING" = 1 ] && [ -f "$BACKUP_DIR/disabled_before.txt" ]; then
  require_tv
  extra="$(pkg_disabled | grep -Fxv -f "$BACKUP_DIR/disabled_before.txt" | grep -Fxv "$LAUNCHER_PKG" || true)"
  to_enable="$(printf '%s\n%s\n' "$to_enable" "$extra" | grep -v '^$' | sort -u)"
fi
stock_off_extra="$(printf '%s\n' "$stock_off" | grep -Fxv -f <(printf '%s\n' "$to_enable") | grep -v '^$' || true)"

n_en="$(printf '%s\n' "$to_enable" "$stock_off_extra" | grep -vc '^$' || true)"
n_set="$(printf '%s\n' "$settings" | grep -vc '^$' || true)"

say "This will:"
[ "$n_en" -gt 0 ] && say "  - switch $n_en app(s) back on"
[ "$n_set" -gt 0 ] && say "  - put $n_set setting(s) back"
[ "$home_set" -gt 0 ] || [ -n "$stock_off" ] && say "  - make ${home_prev:-the original home screen} the default home again"
[ "$launcher" -gt 0 ] && [ "$KEEP_LAUNCHER" = 0 ] && say "  - remove the TV Home launcher app this toolkit added"
if [ "$n_en" = 0 ] && [ "$n_set" = 0 ] && [ "$home_set" = 0 ] && [ "$launcher" = 0 ]; then
  ok "Nothing to undo - the log has no changes."; exit 0
fi
if [ "$LIST" = 1 ]; then
  say; say "Apps:"; printf '%s\n' "$to_enable" "$stock_off_extra" | grep -v '^$' | sed 's/^/    /'
  [ -n "$settings" ] && { say "Settings (namespace key original-value):"; printf '%s\n' "$settings" | sed 's/^/    /'; }
  exit 0
fi
[ "$YES" = 1 ] || ask_yn "Go ahead?" y || { say "Nothing changed."; exit 0; }

require_tv
init_shots "$BACKUP_DIR/screenshots_restore_$(date +%H%M%S)"
CHANGES=""   # don't log the restore's own actions into the log we're replaying
fail=0

# ---------------------------------------------------------------- 1) home screen first, so the TV is never left without one
if [ -n "$stock_off" ]; then
  for p in $stock_off; do enable_pkg "$p" >/dev/null && ok "switched $p back on" || { warn "couldn't re-enable $p"; fail=1; }; done
fi
if [ "$home_set" -gt 0 ] || [ -n "$stock_off" ]; then
  case "$home_prev" in
    ""|android/*|*ResolverActivity*) tvsh cmd package set-home-activity --user 0 "" >/dev/null 2>&1 || true
                                     ok "home screen choice cleared (the TV will use its own)" ;;
    *) enable_pkg "${home_prev%%/*}" >/dev/null 2>&1
       if set_home "$home_prev"; then ok "default home: $home_prev"; else warn "couldn't set $home_prev as default - press Home and pick it if asked"; fi ;;
  esac
fi

# ---------------------------------------------------------------- 2) apps
if [ -n "$to_enable" ]; then
  say "Switching apps back on..."
  for p in $to_enable; do
    if enable_pkg "$p" >/dev/null; then dim "  enabled $p"; else warn "  couldn't enable $p"; fail=1; fi
  done
fi

# ---------------------------------------------------------------- 3) settings
if [ -n "$settings" ]; then
  while read -r ns key old; do
    [ -n "$ns" ] || continue
    if [ "$old" = null ]; then tvsh settings delete "$ns" "$key" >/dev/null; else tvsh settings put "$ns" "$key" "$old" >/dev/null; fi
    dim "  $ns $key -> $old"
  done <<< "$settings"
  ok "settings put back"
fi

# ---------------------------------------------------------------- 4) the launcher we added
if [ "$launcher" -gt 0 ] && [ "$KEEP_LAUNCHER" = 0 ] && pkg_exists "$LAUNCHER_PKG"; then
  out="$(tvsh pm uninstall "$LAUNCHER_PKG")"
  case "$out" in *Success*) ok "removed the TV Home app" ;; *) warn "couldn't remove TV Home ($out)"; fail=1 ;; esac
fi

go_home 4
shot "after_restore" "Home screen after restoring"
now_home="$(current_home)"
say "Home button now opens: $now_home"

# start a fresh log so a second restore doesn't replay this one
stamp="$(date +%Y%m%d-%H%M%S)"
mv "$BACKUP_DIR/changes.log" "$BACKUP_DIR/changes.restored-$stamp.log"
printf 'HOME_PREV %s\n' "$(head -1 "$BACKUP_DIR/home_before.txt" 2>/dev/null || echo "$home_prev")" > "$BACKUP_DIR/changes.log"

say
if [ "$fail" = 0 ]; then ok "Restore complete. The old log is kept as changes.restored-$stamp.log"
else warn "Restore finished with some warnings above. Re-running ./restore.sh --everything usually sorts them out."; fi
say "Restart the TV (hold power > Restart) to finish."
