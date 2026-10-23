#!/bin/bash
# Spike 036 ORACLE: how does a genuine Windows Steam client answer the CEG start request?
# Boots bottled Windows Steam (GameLibSteam) under --cx-log, then launches XComEW.exe DIRECTLY (not via
# -applaunch) under a second --cx-log, so the DIPC request goes to the real client. Kills the bottle after.
# usage: STEAM_WAIT=90 WATCH=60 ./oracle.sh <label>
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"; LABEL="$1"; mkdir -p logs
BOTTLE=GameLibSteam; CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
DC="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE/drive_c"
G="$DC/Program Files (x86)/Steam/steamapps/common/XCom-Enemy-Unknown/XEW/Binaries/Win32"
cleanup(){ pkill -f 'XComEW.exe' 2>/dev/null; WINEPREFIX="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE" "$CX/wineserver" -k 2>/dev/null; rm -f "$G"/*.STEAMSTART; }
trap cleanup EXIT
WINEPREFIX="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE" "$CX/wineserver" -k 2>/dev/null; sleep 1
( exec env CX_BOTTLE="$BOTTLE" "$CX/wine" --cx-log "$SPIKE/logs/$LABEL.steam.cxlog" --debugmsg "${STEAM_DEBUG:-+process,+sync}" \
    'C:\Program Files (x86)\Steam\steam.exe' -silent > /dev/null 2>&1 ) &
echo "[$LABEL] bottled Steam booting; waiting ${STEAM_WAIT:-90}s"; sleep "${STEAM_WAIT:-90}"
# GAME_CMD=applaunch: ask the running client to launch 200510 itself (no direct exe launch)
if [ "${GAME_CMD:-direct}" = applaunch ]; then
  ( exec env CX_BOTTLE="$BOTTLE" "$CX/wine" 'C:\Program Files (x86)\Steam\steam.exe' -applaunch 200510 > /dev/null 2>&1 ) &
else
  ( cd "$G" && exec env CX_BOTTLE="$BOTTLE" "$CX/wine" --cx-log "$SPIKE/logs/$LABEL.game.cxlog" --debugmsg +process,+sync,+reg \
    'C:\Program Files (x86)\Steam\steamapps\common\XCom-Enemy-Unknown\XEW\Binaries\Win32\XComEW.exe' > /dev/null 2>&1 ) &
fi
T0=$(date +%s); sleep "${WATCH:-60}"
echo "[$LABEL] watched $(( $(date +%s) - T0 ))s; XComEW alive: $(pgrep -f XComEW.exe | tr '\n' ' ')"
ls "$G" | grep -i steamstart | sed 's/^/   steamstart: /'
