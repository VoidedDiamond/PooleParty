#!/usr/bin/env bash
# run_all.sh - do every step in order: connect, back up, debloat, home screen.
# Stops at the first step that fails; you can re-run any single step on its own afterwards.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"
for step in 1_connect.sh 2_backup.sh 3_debloat.sh 4_launcher.sh; do
  ./"$step" || { echo; echo "✘ $step didn't finish. Fix what it said, then run ./$step again (earlier steps don't need repeating)."; exit 1; }
done
