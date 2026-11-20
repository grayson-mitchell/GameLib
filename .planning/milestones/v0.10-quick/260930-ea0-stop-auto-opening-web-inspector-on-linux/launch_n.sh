#!/bin/bash
# launch_n.sh <prefix> <N> <HOLD_SECONDS> <RAW_DIR>
#
# N sequential fresh-profile launches of the DEBUG shell through probe_live.ts (quick 260930-ea0).
# Launch i has label <prefix><i>. Each launch: refuse if a gamelib-shell is already running, start
# the harness, wait HOLD_SECONDS, screenshot the window for i == 1, touch the stop-file, wait for the
# harness (which does the pid/group teardown itself). Writes RAW_DIR/<prefix>-DONE at the end.
#
# Kills are the harness's job, by pid and process group. This script never kills anything by name.
set -u
P=${1:?prefix}; N=${2:?count}; HOLD=${3:?hold seconds}; RAW=${4:?raw dir}
REPO=/home/graysonmitchell/GameLib
Q=$REPO/.planning/quick/260930-ea0-stop-auto-opening-web-inspector-on-linux
CAP=$REPO/.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/cap.py
BIN=$REPO/src-tauri/target/debug/gamelib-shell
mkdir -p "$RAW"
rm -f "$RAW/$P-DONE"
cd "$REPO" || exit 2

for i in $(seq 1 "$N"); do
  L=$P$i
  for pd in /proc/[0-9]*; do
    if [ "$(cat "$pd/comm" 2>/dev/null)" = "gamelib-shell" ]; then
      echo "REFUSED: a gamelib-shell is already running (pid ${pd#/proc/})" | tee "$RAW/$P-DONE"
      exit 2
    fi
  done
  rm -f "$RAW/stop-$L"
  node meta/runTs.cjs --bundle --platform=node --target=node22 "$Q/probe_live.ts" \
    --binary "$BIN" --out "$RAW" --label "$L" --stop-file "$RAW/stop-$L" \
    --max-seconds 100 --snap-every 4 > "$RAW/$L-harness.log" 2>&1 &
  HP=$!
  sleep "$HOLD"
  if [ "$i" -eq 1 ]; then
    WID=$(grep '^WINDOW_ID=' "$RAW/$L-identity.txt" 2>/dev/null | cut -d= -f2)
    if [ -n "$WID" ] && [ "$WID" != NONE ] && [ "$WID" != NOWINDOW ]; then
      python3 "$CAP" "$WID" "$RAW/$L.png" > "$RAW/$L-cap.log" 2>&1
    fi
  fi
  touch "$RAW/stop-$L"
  wait "$HP"
  echo "launch $L finished"
done
echo done > "$RAW/$P-DONE"
