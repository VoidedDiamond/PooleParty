#!/usr/bin/env bash
# 3_debloat.sh - switch off ads, telemetry and junk, reversibly, asking you first.
#
# Only ever uses "pm disable-user" (never uninstall). Every change is logged in the backup's
# changes.log, and restore.sh switches everything back on.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"
. ./lib.sh

require_tv
load_backup
init_shots "$BACKUP_DIR/screenshots_debloat_$(date +%H%M%S)"

head1 "Step 3: debloat (reversible)"
cat <<EOF
How this works:
  - I only use "disable" (pm disable-user). Nothing is uninstalled and no app data is touched.
  - You'll be asked about features first, then shown each group of packages before anything happens.
  - After each group I take a screenshot from the TV; if anything looks off, say so and it's switched back on.
  - Undo everything any time with: $BACKUP_DIR/restore.sh
EOF

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
NEVER='^#never-matches#$'

say
say "Reading the TV's app list..."
pkg_enabled    > "$TMP/enabled"
pkg_system     > "$TMP/system"
pkg_user       > "$TMP/user"
pkg_with_icons > "$TMP/icons"
[ -s "$TMP/enabled" ] || die "The TV returned no packages - stopping without changing anything."
ok "$(wc -l < "$TMP/enabled" | tr -d ' ') enabled packages ($(grep -cFx -f "$TMP/system" "$TMP/enabled") system, $(grep -cFx -f "$TMP/user" "$TMP/enabled") installed by you)"

# ---------------------------------------------------------------- what's off limits
echo "$NEVER" > "$TMP/protect_rx"
{ echo "-none-"; echo "$LAUNCHER_PKG"
  h="$(current_home)"; echo "${h%%/*}"
  for p in $STOCK_HOMES $STOCK_HOME_HELPERS; do echo "$p"; done
  [ -f config/dock.txt ] && grep -Ev '^[[:space:]]*(#|@|$)' config/dock.txt | cut -d'|' -f2 | tr ',' '\n' | tr -d ' \r'
} > "$TMP/keep"
echo "-none-" > "$TMP/assigned"

feat_ids=(); feat_def=(); feat_q=(); feat_rx=()
cat_ids=(); cat_def=(); cat_title=(); cat_what=(); cat_rx=()
while IFS= read -r line; do
  line="${line%$'\r'}"
  case "$line" in ''|'#'*) continue ;; esac
  kind="${line%%|*}"; rest="${line#*|}"
  case "$kind" in
    protect)  echo "$rest" >> "$TMP/protect_rx" ;;
    feature)  IFS='|' read -r id def q rx <<< "$rest"
              feat_ids+=("$id"); feat_def+=("$def"); feat_q+=("$q"); feat_rx+=("$rx") ;;
    category) IFS='|' read -r id def title what rx <<< "$rest"
              cat_ids+=("$id"); cat_def+=("$def"); cat_title+=("$title"); cat_what+=("$what"); cat_rx+=("$rx") ;;
  esac
done < candidates.conf

# drop protected / kept / already-offered packages from a list on stdin
available() { grep -Eiv -f "$TMP/protect_rx" | grep -Fxv -f "$TMP/keep" | grep -Fxv -f "$TMP/assigned"; }

describe_pkg() {
  local p="$1" t
  if grep -qFx "$p" "$TMP/user"; then t="[installed by you]"; else t="[system]"; fi
  grep -qFx "$p" "$TMP/icons" && t="$t (has an icon in your app row)"
  printf '%s' "$t"
}
show_list() { local n=0 p; while IFS= read -r p; do n=$((n+1)); printf '  %3d) %-56s %s\n' "$n" "$p" "$(describe_pkg "$p")"; done < "$1"; }

# "1 3 5-8" / "all" -> lines picked from the list file
pick_numbers() {
  local list="$1" ans="$2" total tok a b i
  total="$(wc -l < "$list" | tr -d ' ')"
  [ "$ans" = all ] && { cat "$list"; return; }
  for tok in $(printf '%s' "$ans" | tr ',' ' '); do
    case "$tok" in
      *-*) a="${tok%-*}"; b="${tok#*-}" ;;
      *)   a="$tok"; b="$tok" ;;
    esac
    [ "$a" -ge 1 ] 2>/dev/null && [ "$b" -le "$total" ] 2>/dev/null && [ "$a" -le "$b" ] || { warn "ignoring \"$tok\"" >&2; continue; }
    for i in $(seq "$a" "$b"); do sed -n "${i}p" "$list"; done
  done | awk '!seen[$0]++'
}

DISABLED_TOTAL=0
# disable everything in the file, screenshot, and let the user roll the group back
apply_group() {
  local id="$1" sel="$2" p done_f="$TMP/done_$1"
  [ -s "$sel" ] || { say "Skipped."; return; }
  say "Disabling $(wc -l < "$sel" | tr -d ' ') package(s)..."
  : > "$done_f"
  while IFS= read -r p <&4; do
    if disable_pkg "$p"; then say "  disabled $p"; echo "$p" >> "$done_f"; else warn "  couldn't disable $p (the TV refused; left as is)"; fi
  done 4< "$sel"
  [ -s "$done_f" ] || return
  go_home 4
  shot "after_$id" "After disabling: $id"
  if ask_yn "Look at that screenshot / the TV. Does everything still look and respond normally?" y; then
    DISABLED_TOTAL=$((DISABLED_TOTAL + $(wc -l < "$done_f")))
    ok "Kept: $id"
  else
    while IFS= read -r p <&4; do enable_pkg "$p" >/dev/null; done 4< "$done_f"
    go_home 4
    shot "rolled_back_$id" "After switching '$id' back on"
    warn "Switched '$id' back on."
  fi
}

# ---------------------------------------------------------------- 1) features
head1 "Which of these do you use?"
say "Say yes to anything you use or might use; matching packages are then left alone."
for i in "${!feat_ids[@]}"; do
  if ask_yn "${feat_q[$i]}" "${feat_def[$i]}"; then
    grep -Ei "${feat_rx[$i]}" "$TMP/enabled" >> "$TMP/keep"
    say "   -> related packages will be left alone"
  fi
done

# ---------------------------------------------------------------- 2) known junk, by group
for i in "${!cat_ids[@]}"; do
  id="${cat_ids[$i]}"
  grep -Ei "${cat_rx[$i]}" "$TMP/enabled" | available > "$TMP/cat_$id" || true
  head1 "${cat_title[$i]}"
  say "${cat_what[$i]}"
  if [ ! -s "$TMP/cat_$id" ]; then dim "  nothing like this is switched on - skipping"; continue; fi
  cat "$TMP/cat_$id" >> "$TMP/assigned"
  show_list "$TMP/cat_$id"
  : > "$TMP/sel"
  n="$(wc -l < "$TMP/cat_$id" | tr -d ' ')"
  [ "${cat_def[$i]}" = y ] && opts="[Y]es / [n]o / [r]eview one by one" || opts="[y]es / [N]o / [r]eview one by one"
  printf 'Disable all %s? %s: ' "$n" "$opts"
  IFS= read -r a || a=""; [ -t 0 ] || echo
  a="$(printf '%s' "${a:-${cat_def[$i]}}" | tr '[:upper:]' '[:lower:]')"
  case "$a" in
    y|yes) cp "$TMP/cat_$id" "$TMP/sel" ;;
    r|review)
      while IFS= read -r p <&4; do ask_yn "  Disable $p ?" n && echo "$p" >> "$TMP/sel"; done 4< "$TMP/cat_$id" ;;
  esac
  apply_group "$id" "$TMP/sel"
done

# ---------------------------------------------------------------- 3) lists you pick from
pick_stage() {   # id title explanation listfile
  local id="$1" ans
  head1 "$2"
  say "$3"
  if [ ! -s "$4" ]; then dim "  none found - skipping"; return; fi
  cat "$4" >> "$TMP/assigned"
  show_list "$4"
  printf 'Numbers to disable (e.g. 1 3 5-8), "all", or Enter for none: '
  IFS= read -r ans || ans=""; [ -t 0 ] || echo
  pick_numbers "$4" "$ans" > "$TMP/sel"
  apply_group "$id" "$TMP/sel"
}

grep -Ei '(^|\.)tcl' "$TMP/enabled" | available > "$TMP/tcl_other" || true
pick_stage tcl_other "TCL's own apps I couldn't classify" \
"I can't tell what these do from the name, so none are selected. Icons in your app row are the ones you can see.
If you don't recognise one, leave it alone - you can re-run this later. Names with 'store', 'news', 'guard',
'tips', 'weather' or 'recommend' are usually safe to switch off." "$TMP/tcl_other"

# other preinstalled apps that have an icon (system services without an icon are never offered)
grep -Fx -f "$TMP/icons" "$TMP/system" | grep -Fx -f "$TMP/enabled" | available > "$TMP/preinstalled" || true
pick_stage preinstalled "Other preinstalled apps" \
"Streaming, music and other apps that shipped on the TV. Disable any you never use; restore.sh switches them back on." "$TMP/preinstalled"

if [ -s "$TMP/user" ] && ask_yn "Show the apps you installed yourself, in case you want to switch some off?" n; then
  grep -Fx -f "$TMP/enabled" "$TMP/user" | available > "$TMP/userapps" || true
  pick_stage userapps "Apps you installed" "Disabling hides an app and stops it running; its data stays." "$TMP/userapps"
fi

# ---------------------------------------------------------------- 4) speed
head1 "Speed tweaks (optional, reversible)"
if ask_yn "Make menus and transitions roughly twice as fast (animation scale 1.0 -> 0.5)?" y; then
  for k in window_animation_scale transition_animation_scale animator_duration_scale; do put_setting global "$k" 0.5; done
  ok "animations sped up"
fi
if ask_yn "Clear app caches to free storage? (caches rebuild themselves; nothing you saved is lost)" y; then
  before="$(tvsh df /data | tail -1 | awk '{print $4}')"
  tvsh pm trim-caches 999G >/dev/null
  after="$(tvsh df /data | tail -1 | awk '{print $4}')"
  if [ "${before:-0}" -ge 0 ] 2>/dev/null && [ "${after:-0}" -ge 0 ] 2>/dev/null; then
    ok "caches cleared ($(( (after - before) / 1024 )) MB freed)"
  else
    ok "caches cleared"
  fi
fi

# ---------------------------------------------------------------- done
head1 "Debloat finished"
go_home 4
shot "after_debloat" "Home screen after debloating"
mem_before="$(grep MemAvailable "$BACKUP_DIR/perf_before.txt" | awk '{print int($2/1024)}')"
mem_after="$(tvsh cat /proc/meminfo | grep MemAvailable | awk '{print int($2/1024)}')"
net_total="$(awk '$1=="DISABLED"{s[$2]=1} $1=="ENABLED"{s[$2]=0} END{n=0; for(p in s) n+=s[p]; print n}' "$CHANGES")"
ok "$DISABLED_TOTAL package(s) disabled this run ($net_total in total so far)"
[ -n "$mem_before" ] && [ -n "$mem_after" ] && say "Free memory: ${mem_before} MB before -> ${mem_after} MB now (it grows further after a restart)."
cat <<EOF

Worth doing by hand on the TV (these are settings, not apps, so adb can't flip them reliably):
  - Settings > Privacy > Usage & diagnostics: off
  - Settings > Privacy > Ads: "Delete advertising ID" / opt out of personalisation
  - TCL: Settings > Privacy (or System > Advanced) > "Viewing information services" / "Smart TV experience": off
  - Google TV: Settings > Accounts & Sign In > (your account) > Apps only mode: on, if you keep the Google home

A restart (hold the remote's power button > Restart) clears out anything that was still running.
Undo all of this any time: $BACKUP_DIR/restore.sh
EOF
ok "Next: ./4_launcher.sh"
