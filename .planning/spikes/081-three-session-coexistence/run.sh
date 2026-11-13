#!/bin/sh
# Spike 081 runner: Mac Steam stays online (no go-offline wrap; 075) while an authenticated
# steam-vent session (ip 0, depot-shaped cycles) and steam-user (logonID <id>, Refresh-shaped
# cycles) share the account. Oracles: each worker's KICKED/DEAD lines, Mac Steam's
# connection_log mirrored for the run, and 084's probe (GetSteamID + BLoggedOn) every 30 s.
#   ./run.sh <run> [hold_s=600] [logonID=81] [gap_s=10]
set -u
RUN=$1; HOLD=${2:-600}; LID=${3:-81}; GAP=${4:-10}
V="${TMPDIR%/}/gamelib-dev-secret-vault.json"
CLOG="$HOME/Library/Application Support/Steam/logs/connection_log.txt"
PROBE=../084-owned-apps-from-running-steam/probe
BIN=../077-dual-cm-session-coexistence/target/release/spike-081-vent-work
D="runs/$RUN"; rm -rf "$D"; mkdir -p "$D" out
OFF=$(wc -c < "$CLOG" | tr -d ' ')
"$BIN" "$V" vent $((HOLD + GAP + 5)) 220 221 2>/dev/null & PV=$!
sleep "$GAP"
node su-work.mjs "$V" su "$HOLD" "$LID" 2>/dev/null & PS=$!
( while kill -0 $PS 2>/dev/null; do
    printf '%s macsteam whoami  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" "$("$PROBE" whoami 2>&1 | tail -1)"
    sleep 30
  done ) > "$D/macsteam-probe.log" & PP=$!
wait $PV; RV=$?; wait $PS; RS=$?; wait $PP
cp out/vent.log out/su.log "$D/"
tail -c +$((OFF + 1)) "$CLOG" | sed 's/^\[\([0-9-]*\) \([0-9:]*\)\]/MACSTEAM-LOCAL \1T\2/' > "$D/macsteam.log"
{ echo "# run $RUN: vent first, su logonID=$LID ${GAP}s later, hold ${HOLD}s; exit vent=$RV su=$RS"
  sort "$D/vent.log" "$D/su.log" "$D/macsteam-probe.log"
  echo "# Mac Steam connection_log (local time) during the run:"; cat "$D/macsteam.log"; } > "$D/merged.log"
echo "exit vent=$RV su=$RS"
