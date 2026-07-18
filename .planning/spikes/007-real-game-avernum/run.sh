#!/bin/bash
# Real-game run: swap our bridge-backed steam_api.dll into Avernum 4, launch the
# actual game in the GameLibSteam bottle, observe whether it passes the Steam
# ownership gate and runs. ALWAYS restores the original DLL on exit.
# REQUIRES: Steam running + signed in; ../005b .../bridge_server built.
set -uo pipefail
cd "$(dirname "$0")"
BOTTLE="GameLibSteam"
CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
DRIVE_C="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE/drive_c"
GAMEDIR="$DRIVE_C/Program Files (x86)/Steam/steamapps/common/Avernum 4"
REAL="$GAMEDIR/steam_api.dll"
BAK="$GAMEDIR/steam_api.dll.real007"

cleanup() {
  pkill -f "Avernum 4.exe" 2>/dev/null
  [ -f "$BAK" ] && mv -f "$BAK" "$REAL" && echo "restored original steam_api.dll"
  pkill -f bridge_server 2>/dev/null
}
trap cleanup EXIT

# 1. host bridge up
( cd ../005b-bottle-to-host-tcp && echo 480 > steam_appid.txt && SteamAppId=480 ./bridge_server > server.log 2>&1 & )
sleep 1.5
lsof -iTCP:54550 -sTCP:LISTEN >/dev/null 2>&1 && echo "bridge listening" || echo "BRIDGE NOT LISTENING"

# 2. swap in our bridge-backed shim
cp -f "$REAL" "$BAK"
cp -f steam_api.dll "$REAL"
rm -f "$DRIVE_C/steam007.log"

# 3. launch the REAL game
echo "launching Avernum 4..."
CX_BOTTLE="$BOTTLE" "$CX/wine" "$GAMEDIR/Avernum 4.exe" > /tmp/avernum.log 2>&1 &
sleep 12

# 4. observe
if pgrep -f "Avernum 4.exe" >/dev/null; then echo "RESULT: GAME_ALIVE — passed the Steam gate and is running"; else echo "RESULT: GAME_EXITED"; fi
echo "--- C:\\steam007.log (our shim's call trace) ---"
cat "$DRIVE_C/steam007.log" 2>/dev/null || echo "(no steam007.log)"
echo "--- wine stdout/stderr tail ---"
grep -iE "steam|err:|fixme:module.*steam" /tmp/avernum.log 2>/dev/null | head -8 || true
