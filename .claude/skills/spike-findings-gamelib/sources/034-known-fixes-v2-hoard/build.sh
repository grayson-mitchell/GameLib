#!/bin/bash
# Spike 034a: build GameLib's generated x86 steam_api shim + shim_features.c with the repo's pinned zig
# and the SHIPPING flags (meta/buildSteamBridgeShims.ts buildShimCompileArgv + SHIM_RELEASE_CFLAGS),
# then the glprobe.exe positive control linked against the shim's import library.
set -euo pipefail
cd "$(dirname "$0")"
R=../../..; Z="$R/.build-tools/zig/zig"; G="$R/native/steam-bridge/generated"
mkdir -p out
"$Z" cc -target x86-windows-gnu -shared -O2 -fno-sanitize=undefined -o out/steam_api.dll \
  "$G/steam_api_shim.c" shim_features.c "$G/steam_api.def" -lws2_32
rm -f ./*.pdb ./*.lib out/*.pdb out/*.lib   # zig drops the shim's own import lib in cwd; unused
"$Z" dlltool -m i386 -d "$G/steam_api.def" -l out/libsteam_api.a
"$Z" cc -target x86-windows-gnu -O2 -o out/glprobe.exe glprobe.c out/libsteam_api.a -lopengl32 -lgdi32 -luser32
rm -f out/*.pdb
file out/steam_api.dll out/glprobe.exe
echo "UBSan strings in shim: $(strings out/steam_api.dll | grep -ciE 'misaligned address|panic:' || true)"
