#!/usr/bin/env bash
# 1_connect.sh - find the TV on your Wi-Fi and connect to it with adb.
#
# usage: ./1_connect.sh              search the network, then ask
#        ./1_connect.sh 192.168.1.50 connect straight to that address (add :PORT if the TV shows one)
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"
. ./lib.sh

TARGET="${1:-}"
SERIAL=""

head1 "Step 1: connect to the TV"
cat <<'EOF'
Before this works, turn on debugging on the TV (one time):
  Settings > System (or Device Preferences) > About > click "Build" 7 times
  Settings > System > Developer options > turn on "USB debugging" / "Network debugging"
  (If your TV says "Wireless debugging" instead, turn that on - I'll ask for the pairing code.)
Keep the TV on and awake while this runs.
EOF

# ---------- 1) already connected? ----------
if [ -z "$TARGET" ] && [ -f "$DATA_DIR/serial" ]; then
  prev="$(head -1 "$DATA_DIR/serial")"
  if [ -n "$prev" ]; then
    case "$prev" in *:*) adb connect "$prev" </dev/null >/dev/null 2>&1 ;; esac
    if [ "$(state_of "$prev")" = device ]; then
      SERIAL="$prev"; ok "Already connected to the TV at $SERIAL"
    fi
  fi
fi

# ---------- helpers for finding it ----------
local_ip() {
  local ip="" rx='([0-9]{1,3}\.){3}[0-9]{1,3}'
  if command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | grep -oE "src $rx" | grep -oE "$rx")"
  fi
  if [ -z "$ip" ] && [ "$(uname -s)" = Darwin ]; then
    ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
  fi
  if [ -z "$ip" ] && command -v ipconfig >/dev/null 2>&1; then                         # Windows (Git Bash)
    ip="$(ipconfig 2>/dev/null | tr -d '\r' | grep -iE 'IPv4' | grep -oE "$rx" | grep -vE '^(127|169\.254)\.' | head -1)"
  fi
  if [ -z "$ip" ] && [ "$(uname -s)" = Linux ]; then
    ip="$(hostname -I 2>/dev/null | grep -oE "$rx" | grep -vE '^127\.' | head -1)"
  fi
  if [ -z "$ip" ] && command -v ifconfig >/dev/null 2>&1; then
    ip="$(ifconfig 2>/dev/null | grep -oE "inet (addr:)?$rx" | grep -oE "$rx" | grep -vE '^127\.' | head -1)"
  fi
  printf '%s' "$ip" | grep -oE "^$rx$" || true
}

# TVs that announce themselves (newer "Wireless debugging")
mdns_hosts() {
  adb mdns services </dev/null 2>/dev/null | tr -d '\r' | grep -E '_adb' | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]+' | sort -u
}

# Try port 5555 on every address in this /24 (about 5 seconds)
scan_lan() {
  local me net i
  me="$(local_ip)"
  [ -n "$me" ] || return 1
  net="${me%.*}"
  say "Looking for the TV on $net.0/24 (this computer is $me)..." >&2
  local tmp pids=(); tmp="$(mktemp -d)"
  for i in $(seq 1 254); do
    [ "$net.$i" = "$me" ] && continue
    ( ( exec 3<>"/dev/tcp/$net.$i/5555" ) 2>/dev/null && echo "$net.$i" > "$tmp/$i" ) &
    pids+=($!)
    [ $((i % 64)) = 0 ] && sleep 1
  done
  sleep 4
  kill "${pids[@]}" 2>/dev/null; wait 2>/dev/null
  cat "$tmp"/* 2>/dev/null | sort -t. -k4 -n
  rm -rf "$tmp"
  return 0
}

describe() {
  local s="$1" st
  st="$(state_of "$s")"
  case "$st" in
    device) printf '%s %s' "$(adb -s "$s" shell getprop ro.product.manufacturer </dev/null 2>/dev/null | tr -d '\r')" \
                           "$(adb -s "$s" shell getprop ro.product.model </dev/null 2>/dev/null | tr -d '\r')" ;;
    unauthorized) printf '(waiting for you to approve it on the TV screen)' ;;
    *) printf '(port open, not identified)' ;;
  esac
}

# ---------- 2) find it ----------
if [ -z "$SERIAL" ] && [ -z "$TARGET" ]; then
  found="$(mdns_hosts)"
  [ -z "$found" ] && found="$(scan_lan || true)"
  if [ -n "$found" ]; then
    say "Devices that answered:"
    i=0; list=()
    for h in $found; do
      i=$((i+1)); list+=("$h")
      key="$( case "$h" in *:*) echo "$h";; *) echo "$h:5555";; esac )"
      # connecting only to identify it; the TV may pop up an approval box
      adb connect "$key" </dev/null >/dev/null 2>&1
      sleep 1
      say "  $i) $h   $(describe "$key")"
    done
    if [ "$i" = 1 ]; then
      ask_yn "Use $found?" y && TARGET="$found"
    else
      printf 'Which one is your TCL TV? (number, or press Enter to type an IP): '
      IFS= read -r pick || pick=""
      [ -t 0 ] || echo
      if [ -n "$pick" ] && [ "$pick" -ge 1 ] 2>/dev/null && [ "$pick" -le "$i" ]; then TARGET="${list[$((pick-1))]}"; fi
    fi
  else
    say "Couldn't auto-find the TV (that's normal on some networks)."
  fi
fi

if [ -z "$SERIAL" ] && [ -z "$TARGET" ]; then
  say "Find the TV's IP address: Settings > Network & Internet > (your Wi-Fi) - it looks like 192.168.1.50"
  printf 'TV IP address (add :PORT if the TV shows one): '
  IFS= read -r TARGET || TARGET=""
  [ -t 0 ] || echo
  [ -n "$TARGET" ] || die "No address given."
fi

# ---------- 3) connect (pair first only if a plain connect fails) ----------
if [ -z "$SERIAL" ]; then
  if ! connect_to "$TARGET"; then
    warn "Couldn't connect to $TARGET directly."
    if ask_yn "Does your TV show a \"Wireless debugging\" screen with a pairing code?" n; then
      say "On the TV open Wireless debugging > \"Pair device with pairing code\"."
      printf 'Pairing address shown (IP:PORT): '; IFS= read -r pa || pa=""
      printf '6-digit pairing code: '; IFS= read -r pc || pc=""
      adb pair "$pa" "$pc" </dev/null || die "Pairing failed. Check the code and that the box is still open on the TV."
      say "Now use the IP:PORT shown on the main Wireless debugging screen (different from the pairing port)."
      printf 'Connect address (IP:PORT): '; IFS= read -r TARGET || TARGET=""
      connect_to "$TARGET" || die "Still couldn't connect to $TARGET."
    else
      die "Could not connect to $TARGET. Check: same Wi-Fi, debugging switched on, and you approved the prompt on the TV."
    fi
  fi
  ok "Connected to $SERIAL"
fi
save_serial

# ---------- 4) what is it? ----------
head1 "What I found"
brand="$(prop ro.product.manufacturer)"; model="$(prop ro.product.model)"
builds="$(prop ro.build.display.id) $(prop ro.build.version.incremental) $(prop ro.tcl.sw.version) $(prop ro.software.version)"
say "Brand/model : $brand $model"
say "Build       : $(prop ro.build.display.id)"
say "Android     : $(prop ro.build.version.release) (API $(prop ro.build.version.sdk))   platform: $(prop ro.board.platform)"
say "Memory      : $(tvsh cat /proc/meminfo | grep -E '^(MemTotal|MemAvailable)' | awk '{printf "%s %d MB  ", $1, $2/1024}')"
say "Storage     : $(tvsh df -h /data | tail -1 | awk '{print $4" free of "$2" ("$5" used)"}')"
say "Current home: $(current_home)"
printf '%s' "$brand" | grep -qi tcl && ok "That looks like a TCL." || warn "This doesn't report itself as a TCL ($brand). The scripts still work, but double-check it's the right TV."
if printf '%s' "$builds" | grep -qi "$EXPECTED_BUILD"; then
  ok "Build matches the one you gave me ($EXPECTED_BUILD)."
else
  warn "Build number differs from the one you gave me ($EXPECTED_BUILD) - fine if the TV updated since."
fi

init_shots
shot "connected" "TV screen right after connecting"
say
ok "Done. Next: ./2_backup.sh"
