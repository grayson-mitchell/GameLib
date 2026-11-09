#!/bin/sh
# Spike 077 arm runner. Mac Steam stays online (no go-offline wrap: holds are minutes; 075 showed
# unwrapped is safe) and its connection_log is mirrored as the third oracle.
#   ./arm.sh <arm> <first-spec> <second-spec> [gap_s=10] [hold_s=60]
# spec: su:<logonID> (steam-user) | vent (steam-vent, ip 0)
set -u
ARM=$1; A=$2; B=$3; GAP=${4:-10}; HOLD=${5:-60}
V="${TMPDIR%/}/gamelib-dev-secret-vault.json"
CLOG="$HOME/Library/Application Support/Steam/logs/connection_log.txt"
D="runs/$ARM"; rm -rf "$D"; mkdir -p "$D" out
OFF=$(wc -c < "$CLOG" | tr -d ' ')
run() { # spec label hold
  case $1 in
    su:*) node su-hold.mjs "$V" "$2" "$3" "${1#su:}" ;;
    vent) ./target/release/spike-077-vent-hold "$V" "$2" "$3" ;;
  esac
}
LA="1st-${A%%:*}"; LB="2nd-${B%%:*}"
run "$A" "$LA" $((HOLD + GAP + 5)) 2>/dev/null & PA=$!
sleep "$GAP"
run "$B" "$LB" "$HOLD" 2>/dev/null & PB=$!
wait $PA; RA=$?; wait $PB; RB=$?
cp "out/$LA.log" "out/$LB.log" "$D/"
tail -c +$((OFF + 1)) "$CLOG" | sed 's/^\[\([0-9-]*\) \([0-9:]*\)\]/MACSTEAM-LOCAL \1T\2/' > "$D/macsteam.log"
{ echo "# arm $ARM: first=$A second=$B gap=${GAP}s hold=${HOLD}s exit first=$RA second=$RB"
  sort "$D/$LA.log" "$D/$LB.log"
  echo "# Mac Steam connection_log (local time) during the arm:"; cat "$D/macsteam.log"; } > "$D/merged.log"
cat "$D/merged.log"
