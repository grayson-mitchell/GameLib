#!/bin/bash
# Live gate for todo 2026-08-16-orphaned-depot-download-outlives-failure.
#
# Proves BY ABSENCE that a terminal DownloadManager install failure actually
# stops the depot chunk-stream loop. The canceller's own report is not proof —
# only the absence of further `[Timing] chunk-stream stats` lines is.
#
# Usage: monitor-abort-gate.sh <appId> <installdirName>

set -u
APPID="${1:?appId required}"
INSTALLDIR="${2:?installdir name required}"

LOG="${GATE_LOG:-$HOME/Library/Logs/GameLib/gamelib.log}"
COMMON="${GATE_COMMON:-$HOME/Library/Application Support/Steam/steamapps/common/$INSTALLDIR}"
OUT="${GATE_OUT:-$(dirname "$0")/gate-result.txt}"
# Dry-run against an archived log: skip the waits, assert the logic only.
DRY="${GATE_DRY:-0}"

FAIL_RE="Installation of ${APPID} failed with:"
ABORT_RE="Aborting in-flight download for ${APPID} after terminal install failure"
STEAM_ABORT_RE="aborting in-flight native depot download for appId ${APPID}"
CHUNK_RE="\[Timing\] chunk-stream stats"

# Any stats line landing more than this many seconds after the failure line
# means the loop did NOT stop. One line inside the grace window is tolerable:
# an in-flight chunk can still flush as the abort unwinds.
GRACE_SEC=20
OBSERVE_SEC=180

count_files() { find "$COMMON" -type f 2>/dev/null | wc -l | tr -d ' '; }

{
  echo "=== abort gate: appId=$APPID installdir=$INSTALLDIR ==="
  echo "log:    $LOG"
  echo "common: $COMMON"
  echo

  echo "[phase 0] waiting for the watchdog trip (8 min after install starts)..."
  DEADLINE=$(( SECONDS + 1800 ))
  FAIL_LINE=""
  while [ $SECONDS -lt $DEADLINE ]; do
    FAIL_LINE=$(grep -n "$FAIL_RE" "$LOG" 2>/dev/null | tail -1)
    [ -n "$FAIL_LINE" ] && break
    sleep 5
  done

  if [ -z "$FAIL_LINE" ]; then
    echo "RESULT: INCONCLUSIVE — no '$FAIL_RE' line appeared within 30 min."
    echo "        (install never started, or it completed/was cancelled first)"
    exit 2
  fi

  FAIL_N="${FAIL_LINE%%:*}"
  echo "[phase 1] failure line found at log line $FAIL_N:"
  echo "  ${FAIL_LINE#*:}"

  C0=$(count_files)
  echo "  file count at trip: $C0"
  echo

  # --- abort log lines (self-report — necessary, NOT sufficient) --------------
  #
  # These fire from installQueueElement's `finally`, which runs BEFORE the
  # caller in downloadqueue.ts logs "Installation of X failed with:" — so the
  # abort lines land ABOVE the failure line, not below it. Scanning only
  # forward from the failure line finds nothing and reports a false FAIL
  # (observed 2026-08-17, first run of this harness). Search the whole log and
  # bound by TIMESTAMP proximity instead of line order.
  [ "$DRY" = "1" ] || sleep 5
  ABORT_LINE=$(grep -n "$ABORT_RE" "$LOG" | tail -1)
  ABORT_HIT=$(grep -c "$ABORT_RE" "$LOG")
  STEAM_HIT=$(grep -c "$STEAM_ABORT_RE" "$LOG")
  echo "[phase 2] abort self-report lines (anywhere in the log):"
  echo "  DownloadManager 'Aborting in-flight download': $ABORT_HIT"
  echo "  SteamGame       'aborting in-flight native':   $STEAM_HIT"
  [ -n "$ABORT_LINE" ] && echo "  abort at log line ${ABORT_LINE%%:*}: ${ABORT_LINE#*:}"
  echo

  # --- the real proof: absence of further chunk-stream activity ---------------
  echo "[phase 3] observing ${OBSERVE_SEC}s for further chunk-stream activity..."
  if [ "$DRY" != "1" ]; then
    for i in 1 2 3; do
      sleep 60
      CN=$(count_files)
      AFTER=$(awk -v n="$FAIL_N" 'NR>n' "$LOG" | grep -c "$CHUNK_RE")
      echo "  t+$((i*60))s: files=$CN  chunk-stream lines since failure=$AFTER"
    done
  else
    echo "  (dry run — waits skipped)"
  fi
  echo

  C_END=$(count_files)
  # Anchor the absence check on the ABORT line when we have one: it precedes
  # the failure line, so anchoring there counts strictly MORE stats lines.
  ANCHOR_N="$FAIL_N"
  [ -n "$ABORT_LINE" ] && ANCHOR_N="${ABORT_LINE%%:*}"
  STATS_FILE=$(mktemp)
  awk -v n="$ANCHOR_N" 'NR>n' "$LOG" | grep "$CHUNK_RE" > "$STATS_FILE"
  N_AFTER=$(wc -l < "$STATS_FILE" | tr -d ' ')

  echo "[evidence] chunk-stream stats lines AFTER log line $ANCHOR_N (abort/failure anchor): $N_AFTER"
  sed 's/^/  /' "$STATS_FILE"
  echo

  # Timestamps are '(HH:MM:SS)' at line start — compare seconds-of-day.
  to_sec() { echo "$1" | sed -n 's/^(\([0-9][0-9]\):\([0-9][0-9]\):\([0-9][0-9]\)).*/\1 \2 \3/p' \
    | awk '{print $1*3600+$2*60+$3}'; }
  FAIL_TS=$(to_sec "${FAIL_LINE#*:}")
  LATE=0
  while IFS= read -r l; do
    [ -z "$l" ] && continue
    T=$(to_sec "$l")
    if [ -n "$T" ] && [ -n "$FAIL_TS" ] && [ $((T - FAIL_TS)) -gt $GRACE_SEC ]; then
      LATE=$((LATE+1))
    fi
  done < "$STATS_FILE"
  rm -f "$STATS_FILE"

  ABORT_DELTA="n/a"
  if [ -n "$ABORT_LINE" ]; then
    AT=$(to_sec "${ABORT_LINE#*:}")
    [ -n "$AT" ] && [ -n "$FAIL_TS" ] && ABORT_DELTA="$((AT - FAIL_TS))s vs failure line"
  fi

  echo "=== VERDICT ==="
  echo "files at trip:        $C0"
  echo "files at +${OBSERVE_SEC}s:      $C_END"
  echo "stats lines after:    $N_AFTER (of which >${GRACE_SEC}s late: $LATE)"
  echo "abort lines present:  DM=$ABORT_HIT Steam=$STEAM_HIT  ($ABORT_DELTA)"
  echo
  if [ "$LATE" -eq 0 ] && [ "$C0" = "$C_END" ] && [ "$ABORT_HIT" -ge 1 ]; then
    echo "RESULT: PASS — the chunk loop stopped and the on-disk file count froze."
  else
    echo "RESULT: FAIL — see above."
    [ "$LATE" -gt 0 ] && echo "  * $LATE chunk-stream line(s) landed >${GRACE_SEC}s after the failure"
    [ "$C0" != "$C_END" ] && echo "  * file count grew $C0 -> $C_END after the failure"
    [ "$ABORT_HIT" -lt 1 ] && echo "  * the DownloadManager abort line never appeared"
  fi
} 2>&1 | tee "$OUT"
