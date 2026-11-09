#!/bin/sh
# Runs the 067a harness with an isolated HOME (repo fake-HOME convention), so
# GameLib's logger writes to state/home/Library/Logs/GameLib and a GameLib app
# starting mid-run cannot rotate the harness's log away.
D=$(cd "$(dirname "$0")" && pwd)
if pgrep -x steam_osx >/dev/null; then echo "Quit Mac Steam first."; exit 2; fi
mkdir -p "$D/state/home"
# A previous run's verified files would be reconciled and skipped; start clean.
rm -rf "$D/state/steamapps"
HOME="$D/state/home" SPIKE_LABEL="${1:-run}" exec node "$D/state/build/harness.js"
