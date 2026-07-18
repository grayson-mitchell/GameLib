#!/bin/bash
# End-to-end: host bridge server + PE client inside the GameLibSteam bottle.
# REQUIRES: Steam running + signed in; the GameLibSteam CrossOver bottle to exist.
set -uo pipefail
cd "$(dirname "$0")"
echo 480 > steam_appid.txt; export SteamAppId=480
./bridge_server > server.log 2>&1 & SRV=$!
sleep 1.5
BOTTLE="GameLibSteam"
CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
DRIVE_C="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE/drive_c"
cp bottle_client.exe "$DRIVE_C/"; rm -f "$DRIVE_C/bridge_out.txt"
CX_BOTTLE="$BOTTLE" "$CX/wine" "C:\\bottle_client.exe"
echo "--- bridge_out.txt (from inside the bottle) ---"
cat "$DRIVE_C/bridge_out.txt" 2>/dev/null
kill "$SRV" 2>/dev/null
