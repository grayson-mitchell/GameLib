#!/bin/bash
# Spike 036 ENV ORACLE: boot bottled Windows Steam, -applaunch 200510, wait for the Steam-launched tree to
# reach XCOMLauncher.exe (inherits the env Steam gave XComGame.exe), dump that env via envdump036.exe.
set -uo pipefail
cd "$(dirname "$0")"; mkdir -p logs
BOTTLE=GameLibSteam; CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
PFX="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE"
cleanup(){ WINEPREFIX="$PFX" "$CX/wineserver" -k 2>/dev/null; rm -f "$PFX/drive_c/envdump036.exe"; }
trap cleanup EXIT
cp envdump.exe "$PFX/drive_c/envdump036.exe"; rm -f "$PFX/drive_c/envdump036.txt"
( exec env CX_BOTTLE="$BOTTLE" "$CX/wine" 'C:\Program Files (x86)\Steam\steam.exe' -silent >/dev/null 2>&1 ) &
sleep "${STEAM_WAIT:-80}"
( exec env CX_BOTTLE="$BOTTLE" "$CX/wine" 'C:\Program Files (x86)\Steam\steam.exe' -applaunch 200510 >/dev/null 2>&1 ) &
for i in $(seq 90); do pgrep -f 'XCOMLauncher.exe' >/dev/null && break; sleep 2; done
pgrep -f 'XCOMLauncher.exe' >/dev/null || { echo "launcher never appeared"; exit 1; }
sleep 3; CX_BOTTLE="$BOTTLE" "$CX/wine" 'C:\envdump036.exe' XCOMLauncher.exe >/dev/null 2>&1
cp "$PFX/drive_c/envdump036.txt" "logs/${1:-env1}.envdump.txt"; grep -v '^proc ' "logs/${1:-env1}.envdump.txt"
grep '^proc ' "logs/${1:-env1}.envdump.txt" | grep -iv 'conhost\|svchost\|winedevice\|plugplay\|services\|rpcss\|explorer\|steamwebhelper' 
