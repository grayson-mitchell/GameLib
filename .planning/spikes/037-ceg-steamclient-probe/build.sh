#!/bin/bash
# Build the spike-037 steamclient.dll probe (x86, repo-pinned zig) into the spike bottle's Steam dir.
set -euo pipefail
cd "$(dirname "$0")"; R=../../..
"$R/.build-tools/zig/zig" cc -target x86-windows-gnu -O2 -shared -o steamclient.dll steamclient_probe.c steamclient.def
rm -f steamclient.pdb steamclient.lib
DST="$HOME/Library/Application Support/CrossOver/Bottles/GameLibSpikeXCOM/drive_c/Program Files (x86)/Steam"
mkdir -p "$DST"; cp steamclient.dll "$DST/steamclient.dll"
/usr/bin/objdump -p steamclient.dll | grep -c 'Steam_\|CreateInterface\|Breakpad' | sed 's/^/exports: /'
