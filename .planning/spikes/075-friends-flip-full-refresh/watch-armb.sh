#!/bin/sh
# Spike 075 arm B: mirror Mac Steam connection_log + GameLib's Steam logon lines with timestamps.
OUT="runs/b1-realapp.log"; CL="$HOME/Library/Application Support/Steam/logs/connection_log.txt"
GL="$HOME/Library/Logs/GameLib/gamelib.log"
echo "[$(date -u +%FT%TZ)] arm B watch start; gamelib log: ${GL:-NOT FOUND}" >> "$OUT"
tail -n0 -F "$CL" 2>/dev/null | sed -u "s/^/MACSTEAM /" >> "$OUT" &
[ -n "$GL" ] && tail -n0 -F "$GL" 2>/dev/null | grep -a --line-buffered -E "CM logon|loggedOn|Steam: fetched|licensed demos|bulk platform|logOff|session|wrap" | sed -u "s/^/GAMELIB /" >> "$OUT" &
wait
