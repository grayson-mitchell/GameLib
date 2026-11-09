#!/bin/bash
# Build GameLib's generated x86 steam_api shim + spike-033 gamefix.c with the repo's pinned zig,
# mirroring meta/buildSteamBridgeShims.ts buildShimCompileArgv (x86-windows-gnu, -shared, -lws2_32).
set -euo pipefail
cd "$(dirname "$0")"
R=../../..; Z="$R/.build-tools/zig/zig"; G="$R/native/steam-bridge/generated"
"$Z" cc -target x86-windows-gnu -shared -o steam_api.dll "$G/steam_api_shim.c" gamefix.c "$G/steam_api.def" -lws2_32
rm -f steam_api.pdb steam_api.lib steam_api_shim.lib
file steam_api.dll
