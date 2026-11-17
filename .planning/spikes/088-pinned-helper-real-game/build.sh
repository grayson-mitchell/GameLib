#!/bin/bash
# 088: build the REAL bridge helper with resolve_dylib_path() pointed at spike 089's pin.
# Same flags as meta/buildSteamBridgeShims.ts buildHelperCompileArgv().
set -euo pipefail
cd "$(dirname "$0")"; R=../../..
[ -f pin/libsteam_api.dylib ] || ../089-pinned-dylib-source-and-signing/fetch-pin.sh pin
clang -O2 -Werror=uninitialized -arch arm64 -I $R/native/steam-bridge/generated -I $R/native/steam-bridge/helper \
  -o steam-bridge-helper-pinned bridge_helper_pinned.c
echo "built steam-bridge-helper-pinned"
