#!/bin/bash
# Build the spike-036 DIPC responder (x86 PE, repo-pinned zig) and drop it into the spike bottle.
set -euo pipefail
cd "$(dirname "$0")"; R=../../..
"$R/.build-tools/zig/zig" cc -target x86-windows-gnu -O2 -o dipc_responder.exe dipc_responder.c -ladvapi32
rm -f dipc_responder.pdb
cp dipc_responder.exe "$HOME/Library/Application Support/CrossOver/Bottles/GameLibSpikeXCOM/drive_c/XCOM/XEW/Binaries/Win32/"
file dipc_responder.exe
