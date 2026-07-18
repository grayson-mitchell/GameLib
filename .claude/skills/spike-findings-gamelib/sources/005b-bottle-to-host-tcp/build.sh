#!/bin/bash
# Build the host bridge server (native arm64) + the bottle-side client (PE32 i386).
# Needs: clang (host) and a zig that can `-target x86-windows-gnu` (bundles a mingw
# sysroot). Set ZIG=/path/to/zig, or have `zig` on PATH.
# (mingw-w64 via Homebrew also works if i686-w64-mingw32-gcc is available — swap the
#  zig line for: i686-w64-mingw32-gcc -O2 -o bottle_client.exe bottle_client.c -lws2_32)
set -euo pipefail
cd "$(dirname "$0")"
ZIG="${ZIG:-zig}"
clang -arch arm64 -O2 -Wall -o bridge_server bridge_server.c
"$ZIG" cc -target x86-windows-gnu -O2 -o bottle_client.exe bottle_client.c -lws2_32
file bridge_server bottle_client.exe
