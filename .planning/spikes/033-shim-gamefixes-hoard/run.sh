#!/bin/bash
# Spike 033: run UNMODIFIED Reuben.exe with the spike shim (gamefix.c) in place of GameLib's placed
# steam_api.dll, fixes chosen by env. ALWAYS restores the placed DLL. Frame-gap log -> logs/<label>.gamefix.log
# usage: ./run.sh <label> <wgl 0|1> <seekcache 0|1>   (WATCH=secs, INTERACTIVE=1 to play)
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"
LABEL="$1"; WGL="$2"; SEEK="$3"; PROF="${PROFILE:-0}"
BOTTLE="GameLibSteamBridge-63000"; CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
DC="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE/drive_c"; W="$DC/Program Files (x86)/Steam/steamapps/common/Hoard/win32"
EXE='C:\Program Files (x86)\Steam\steamapps\common\Hoard\win32\Reuben.exe'
[ "$(shasum "$W/Reuben.exe" | cut -d' ' -f1)" = 54be4b8c6d7865ee32fc04a27d2a90b2cc1d2481 ] || { echo "Reuben.exe is not the original"; exit 1; }
PLACED_SHA=$(shasum "$W/steam_api.dll" | cut -d' ' -f1)
mkdir -p logs; cp -p "$W/steam_api.dll" "$W/steam_api.dll.bak033"
cleanup(){ N="Reu""ben"; pkill -f "win32.$N.exe" 2>/dev/null; sleep 1; CX_BOTTLE="$BOTTLE" "$CX/wineserver" -k 2>/dev/null
  mv -f "$W/steam_api.dll.bak033" "$W/steam_api.dll"
  echo "[$LABEL] restored placed steam_api.dll: $([ "$(shasum "$W/steam_api.dll" | cut -d' ' -f1)" = "$PLACED_SHA" ] && echo OK || echo MISMATCH)"; }
trap cleanup EXIT
cp steam_api.dll "$W/steam_api.dll"; rm -f "$DC/gamefix033.log"
( cd "$W" && exec env CX_BOTTLE="$BOTTLE" GAMELIB_FIX_WGL="$WGL" GAMELIB_FIX_SEEKCACHE="$SEEK" GAMELIB_FIX_PROFILE="$PROF" "$CX/wine" "$EXE" > "$SPIKE/logs/$LABEL.out" 2>&1 ) &
T0=$(date +%s)
if [ "${INTERACTIVE:-0}" = 1 ]; then sleep 5; while pgrep -f "win32.Reu""ben.exe" >/dev/null; do sleep 2; done
else sleep "${WATCH:-60}"; fi
cp "$DC/gamefix033.log" "logs/$LABEL.gamefix.log" 2>/dev/null
echo "[$LABEL] wgl=$WGL seek=$SEEK ran $(( $(date +%s) - T0 ))s  crash=$(grep -c 'page fault' "logs/$LABEL.out")"
sed 's/^/   /' "logs/$LABEL.gamefix.log" 2>/dev/null | grep -vE "hook .*ok" | tail -12
grep -c "hook .*ok" "logs/$LABEL.gamefix.log" 2>/dev/null | sed 's/^/   hooks ok: /'
