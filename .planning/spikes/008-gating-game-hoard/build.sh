#!/bin/bash
# Build the bridge-gated drop-in steam_api.dll for Hoard/Reuben.exe (PE32 i386).
# Needs a zig that can `-target x86-windows-gnu`. Set ZIG=/path/to/zig or have zig on PATH.
# Also depends on ../005b-bottle-to-host-tcp/bridge_server being built (host side).
set -euo pipefail
cd "$(dirname "$0")"
ZIG="${ZIG:-zig}"
"$ZIG" cc -target x86-windows-gnu -O2 -shared -o steam_api.dll steam_api_gate.c steam_api.def -lws2_32
file steam_api.dll
