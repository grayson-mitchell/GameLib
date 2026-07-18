#!/bin/bash
# Runs the game-like harness inside the GameLibSteam bottle; it LoadLibrary's our
# replacement steam_api.dll, which marshals GetSteamID to the 005b host bridge.
# REQUIRES: Steam running + signed in; ../005b .../bridge_server already built.
set -uo pipefail
cd "$(dirname "$0")"
( cd ../005b-bottle-to-host-tcp && echo 480 > steam_appid.txt && SteamAppId=480 ./bridge_server > server.log 2>&1 & )
sleep 1.5
BOTTLE="GameLibSteam"
CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
DRIVE_C="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE/drive_c"
cp steam_api.dll harness.exe "$DRIVE_C/"; rm -f "$DRIVE_C/shim_out.txt"
CX_BOTTLE="$BOTTLE" "$CX/wine" "C:\\harness.exe"
echo "--- shim_out.txt (from inside the bottle, via shim -> bridge -> native Steam) ---"
cat "$DRIVE_C/shim_out.txt" 2>/dev/null
pkill -f bridge_server 2>/dev/null
