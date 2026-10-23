#!/bin/bash
# Spike 039: build the forwarding steamclient64.dll into GameLibSpikeGD's Steam dir (038's registry slot).
set -euo pipefail
cd "$(dirname "$0")"; Z=../../../.build-tools/zig/zig
S="$HOME/Library/Application Support/CrossOver/Bottles/GameLibSpikeGD/drive_c/Program Files (x86)/Steam"
"$Z" cc -target x86_64-windows-gnu -O2 -shared -o steamclient64.dll steamclient_fwd.c
rm -f *.pdb *.lib; cp steamclient64.dll "$S/steamclient64.dll"; file steamclient64.dll | cut -d, -f1
