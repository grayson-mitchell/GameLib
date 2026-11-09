#!/bin/bash
# Spike 034c: after a GameLib launch of Hoard, collect what the shim saw. Usage: ./check-034c.sh <label>
set -uo pipefail
cd "$(dirname "$0")"; L="${1:-run}"; mkdir -p logs
W="$HOME/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-63000/drive_c/Program Files (x86)/Steam/steamapps/common/Hoard/win32"
echo "Reuben.exe sha:  $(shasum "$W/Reuben.exe" | cut -d' ' -f1)  (033 original: 54be4b8c6d7865ee32fc04a27d2a90b2cc1d2481)"
echo "placed shim sha: $(shasum "$W/steam_api.dll" | cut -d' ' -f1)  (spike: $(shasum out/steam_api.dll | cut -d' ' -f1))"
echo "--- gamelib_bridge.cfg"; cat "$W/gamelib_bridge.cfg" 2>/dev/null | sed 's/^port=.*/port=<ephemeral>/' | tee "logs/034c-$L.cfg.txt"
echo "--- gamelib_shimfix.log"; cat "$W/gamelib_shimfix.log" 2>/dev/null | tee "logs/034c-$L.shimfix.txt"
echo "--- GameLib log (last bridge launch lines)"
grep -h "63000" "$HOME/Library/Application Support/GameLib/"{Logs,logs}/*.log 2>/dev/null | grep -iE "launching appId 63000|shim feature|fix line|hideExtensions" | tail -6
