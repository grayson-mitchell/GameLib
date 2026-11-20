#!/bin/bash
# Live GATE A for quick task 260817-dib: proves the POSITIVE property (the
# defect closes) -- a native Steam install making steady forward progress
# past the OLD 8-minute total-duration ceiling is NEVER declared failed.
#
# INVERTED from monitor-abort-gate.sh (GATE B, copied unmodified alongside
# this file, originally written for todo
# 2026-08-16-orphaned-depot-download-outlives-failure.md): that script waits
# for the FAIL_RE line to appear and treats its appearance as the trigger
# point for a PASS verdict (the abort worked, on a GENUINE stall). Gate A
# instead treats the appearance of FAIL_RE at ANY point during the WHOLE
# download as the FAILURE verdict, and its ABSENCE across the entire run as
# PASS -- proof by absence.
#
# ANTI-FALSE-PASS: before trusting a PASS from this script, run its FAIL_RE
# grep against the preserved RUN-20260817-humankind-watchdog.log (which DOES
# contain a failure line) and confirm it reports a hit. See LIVE-GATE.md's
# "Anti-false-pass note" -- an absence check that has never produced a hit on
# a known-bad input is not calibrated.
#
# Usage: monitor-abort-gate-gateA.sh <appId> <installdirName>

set -u
APPID="${1:?appId required}"
INSTALLDIR="${2:?installdir name required}"

LOG="${GATE_LOG:-$HOME/Library/Logs/GameLib/gamelib.log}"
COMMON="${GATE_COMMON:-$HOME/Library/Application Support/Steam/steamapps/common/$INSTALLDIR}"
OUT="${GATE_OUT:-$(dirname "$0")/gate-a-result.txt}"
MANIFEST="${GATE_MANIFEST:-$HOME/Library/Application Support/Steam/steamapps/appmanifest_${APPID}.acf}"

FAIL_RE="Installation of ${APPID} failed with:"
ABORT_RE="Aborting in-flight download for ${APPID} after terminal install failure"
CHUNK_RE="\[Timing\] chunk-stream stats"
TIMING_RE="\[Timing\] runNativeDepotDownload: downloadSteamDepots"

# EXTENDED past monitor-abort-gate.sh's 1800s (30min) phase-0 DEADLINE -- a
# 37 GB title at ~7.4 MiB/s needs roughly an hour end to end. 4500s (75min)
# gives headroom above that estimate. Override with GATE_DEADLINE_SEC for a
# smaller/larger title.
DEADLINE_SEC="${GATE_DEADLINE_SEC:-4500}"
POLL_SEC=30

{
  echo "=== GATE A (positive property -- the defect closes): appId=$APPID installdir=$INSTALLDIR ==="
  echo "log:      $LOG"
  echo "common:   $COMMON"
  echo "manifest: $MANIFEST"
  echo "deadline: ${DEADLINE_SEC}s (~$((DEADLINE_SEC / 60))min)"
  echo

  echo "[phase 0] observing the FULL download for up to ${DEADLINE_SEC}s -- any FAIL_RE hit is an IMMEDIATE FAIL, an appmanifest write is the SUCCESS exit..."
  ELAPSED=0
  FAIL_HIT=0
  while [ "$ELAPSED" -lt "$DEADLINE_SEC" ]; do
    if grep -q "$FAIL_RE" "$LOG" 2>/dev/null; then
      FAIL_HIT=1
      break
    fi
    if [ -f "$MANIFEST" ]; then
      echo "  appmanifest_${APPID}.acf appeared at t+${ELAPSED}s -- install reached completion."
      break
    fi
    sleep "$POLL_SEC"
    ELAPSED=$((ELAPSED + POLL_SEC))
    if [ $((ELAPSED % 300)) -eq 0 ]; then
      LAST_CHUNK=$(grep "$CHUNK_RE" "$LOG" 2>/dev/null | tail -1)
      echo "  t+${ELAPSED}s: ${LAST_CHUNK:-no chunk-stream line yet}"
    fi
  done
  echo

  echo "=== VERDICT ==="
  if [ "$FAIL_HIT" -eq 1 ]; then
    echo "RESULT: FAIL -- '$FAIL_RE' appeared during the observation window (the old ceiling, or a genuine defect, still fired)."
    grep -n "$FAIL_RE" "$LOG" | tail -3
    ABORT_HIT=$(grep -c "$ABORT_RE" "$LOG" 2>/dev/null || echo 0)
    echo "  abort lines present: $ABORT_HIT"
  elif [ -f "$MANIFEST" ]; then
    FAIL_COUNT=$(grep -c "$FAIL_RE" "$LOG" 2>/dev/null || echo 0)
    LAST_TIMING=$(grep "$TIMING_RE" "$LOG" 2>/dev/null | tail -1)
    if [ "$FAIL_COUNT" -eq 0 ]; then
      echo "RESULT: PASS -- '$FAIL_RE' never appeared anywhere in the log (proof by absence), and appmanifest_${APPID}.acf was written."
      echo "  final timing line: ${LAST_TIMING:-<none found>}"
    else
      echo "RESULT: FAIL -- appmanifest was written but '$FAIL_RE' appeared $FAIL_COUNT time(s) earlier in the run."
    fi
  else
    echo "RESULT: INCONCLUSIVE -- observation window elapsed with no FAIL_RE hit and no appmanifest written yet."
    echo "        Re-run with a larger GATE_DEADLINE_SEC, or confirm the install is still actually progressing."
  fi
} 2>&1 | tee "$OUT"
