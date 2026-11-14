#!/bin/bash
# Launch staged CE and sample its CPU / context switches once a second into run.log.
# Baseline to beat (Wine bridge, 2026-10-31): ~100% CPU, ~95k ctx switches/s during movies.
set -uo pipefail
STAGE="${1:?usage: run.sh <stage-dir> [seconds]}"; SECS="${2:-90}"
LOG="$(dirname "$0")/run.log"
APP="$STAGE/Fallout/Fallout Community Edition.app"
echo "$(date -u +%FT%TZ) launch $APP" | tee -a "$LOG"
"$APP/Contents/MacOS/fallout-ce" >"$STAGE/ce.out" 2>&1 &
PID=$!
for i in $(seq 1 "$SECS"); do
  sleep 1
  kill -0 $PID 2>/dev/null || { echo "$(date -u +%FT%TZ) exited t=${i}s" | tee -a "$LOG"; break; }
  ps -o %cpu=,rss= -p $PID | awk -v t=$i -v ts="$(date -u +%FT%TZ)" '{printf "%s t=%ds cpu=%s%% rss=%dMB\n", ts, t, $1, $2/1024}' | tee -a "$LOG"
done
echo "$(date -u +%FT%TZ) sampling done (pid $PID left running if alive)" | tee -a "$LOG"
