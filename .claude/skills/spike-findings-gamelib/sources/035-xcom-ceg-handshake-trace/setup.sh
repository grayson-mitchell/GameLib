#!/bin/bash
# Spike 035: build a scratch bridge bottle (GameLibSpikeXCOM, APFS clone of a bridge bottle) holding a
# SHADOW TREE of XCOM -- symlinks to the GameLibSteam install, except XEW/Binaries/Win32 which is a real
# dir so steam_api.dll can be the GameLib shim. The original install is never modified.
set -euo pipefail
cd "$(dirname "$0")"; R=../../..
B="$HOME/Library/Application Support/CrossOver/Bottles"
SRC="$B/GameLibSteam/drive_c/Program Files (x86)/Steam/steamapps/common/XCom-Enemy-Unknown"
DST="$B/GameLibSpikeXCOM/drive_c/XCOM"
[ -d "$B/GameLibSpikeXCOM" ] || cp -cR "$B/GameLibSteamBridge-206060" "$B/GameLibSpikeXCOM"
rm -rf "$DST"; mkdir -p "$DST/XEW/Binaries/Win32"
for e in "$SRC"/*; do [ "$(basename "$e")" = XEW ] || ln -s "$e" "$DST/"; done
for e in "$SRC/XEW"/*; do [ "$(basename "$e")" = Binaries ] || ln -s "$e" "$DST/XEW/"; done
for e in "$SRC/XEW/Binaries"/*; do [ "$(basename "$e")" = Win32 ] || ln -s "$e" "$DST/XEW/Binaries/"; done
for e in "$SRC/XEW/Binaries/Win32"/*; do [ "$(basename "$e")" = steam_api.dll ] || ln -s "$e" "$DST/XEW/Binaries/Win32/"; done
# GameLib's generated x86 shim, built with the repo-pinned zig exactly like spike 033 / buildShimCompileArgv
"$R/.build-tools/zig/zig" cc -target x86-windows-gnu -shared -o shim/steam_api.dll \
  "$R/native/steam-bridge/generated/steam_api_shim.c" "$R/native/steam-bridge/generated/steam_api.def" -lws2_32
rm -f shim/*.pdb shim/*.lib
cp shim/steam_api.dll "$DST/XEW/Binaries/Win32/steam_api.dll"
echo "shadow tree: $DST"; file "$DST/XEW/Binaries/Win32/steam_api.dll"
