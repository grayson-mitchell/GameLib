#!/bin/bash
# Gating demo: Hoard/Reuben.exe with our bridge-GATED steam_api.dll.
#   POSITIVE (bridge up)   -> RestartAppIfNecessary=0 -> game runs
#   NEGATIVE (bridge down) -> RestartAppIfNecessary=1 -> game exits (relaunch)
# Proves the bridge is what authorizes the launch. Always restores the original DLL.
# REQUIRES: Steam running + signed in; ../005b .../bridge_server built.
set -uo pipefail
cd "$(dirname "$0")"
BOTTLE="GameLibSteam"; CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
DRIVE_C="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE/drive_c"
WIN32="$DRIVE_C/Program Files (x86)/Steam/steamapps/common/Hoard/win32"
REAL="$WIN32/steam_api.dll"; BAK="$WIN32/steam_api.dll.bak008"
EXE_WIN="C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hoard\\win32\\Reuben.exe"

cleanup(){ pkill -f "Reuben.exe" 2>/dev/null; "$CX/wineserver" -k 2>/dev/null; [ -f "$BAK" ] && mv -f "$BAK" "$REAL" && echo restored-dll; pkill -f bridge_server 2>/dev/null; }
trap cleanup EXIT

cp -f "$REAL" "$BAK"; cp -f steam_api.dll "$REAL"

launch_and_watch(){ # $1 label
  rm -f "$DRIVE_C/hoard_gate.log"
  ( cd "$WIN32" && CX_BOTTLE="$BOTTLE" "$CX/wine" "$EXE_WIN" > "/tmp/hoard_$1.log" 2>&1 & )
  local alive=0
  for i in 1 2 3 4 5; do sleep 2; if pgrep -f "Reuben.exe" >/dev/null; then alive=1; fi; done
  echo "  [$1] Reuben alive at t=10s? $([ $alive -eq 1 ] && echo YES || echo NO)"
  echo "  [$1] hoard_gate.log:"; sed 's/^/      /' "$DRIVE_C/hoard_gate.log" 2>/dev/null || echo "      (none)"
  pkill -f "Reuben.exe" 2>/dev/null; "$CX/wineserver" -k 2>/dev/null; sleep 1
}

echo "=== POSITIVE run (bridge UP) ==="
( cd ../005b-bottle-to-host-tcp && SteamAppId=480 ./bridge_server > server.log 2>&1 & ); sleep 1.5
launch_and_watch positive
pkill -f bridge_server 2>/dev/null; sleep 1

echo "=== NEGATIVE run (bridge DOWN) ==="
launch_and_watch negative
