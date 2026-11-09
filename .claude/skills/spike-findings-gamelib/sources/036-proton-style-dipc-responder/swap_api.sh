#!/bin/bash
# Spike 036: choose which steam_api.dll the spike shadow tree uses. usage: ./swap_api.sh shim|orig
# 'orig' is a SYMLINK to the GameLibSteam install's untouched DLL; 'shim' is 035's GameLib build.
set -euo pipefail
cd "$(dirname "$0")"
W="$HOME/Library/Application Support/CrossOver/Bottles/GameLibSpikeXCOM/drive_c/XCOM/XEW/Binaries/Win32"
O="$HOME/Library/Application Support/CrossOver/Bottles/GameLibSteam/drive_c/Program Files (x86)/Steam/steamapps/common/XCom-Enemy-Unknown/XEW/Binaries/Win32/steam_api.dll"
rm -f "$W/steam_api.dll"
case "$1" in
  orig) ln -s "$O" "$W/steam_api.dll" ;;
  shim) cp ../035-xcom-ceg-handshake-trace/shim/steam_api.dll "$W/steam_api.dll" ;;
  *) echo "usage: $0 shim|orig"; exit 2 ;;
esac
echo "steam_api.dll -> $1 ($(shasum "$W/steam_api.dll" | cut -c1-12))"
