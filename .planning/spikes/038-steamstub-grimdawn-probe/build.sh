#!/bin/bash
# Spike 038: build 037's logging steamclient probe for BOTH arches (x64 export set == x86, see exports64.txt)
# plus 036's responder, and drop them into the GameLibSpikeGD scratch bottle.
set -euo pipefail
cd "$(dirname "$0")"; R=../../..; Z="$R/.build-tools/zig/zig"; P=../037-ceg-steamclient-probe
DC="$HOME/Library/Application Support/CrossOver/Bottles/GameLibSpikeGD/drive_c"; S="$DC/Program Files (x86)/Steam"
"$Z" cc -target x86-windows-gnu -O2 -shared -o steamclient.dll "$P/steamclient_probe.c" "$P/steamclient.def"
"$Z" cc -target x86_64-windows-gnu -O2 -shared -o steamclient64.dll "$P/steamclient_probe.c" "$P/steamclient.def"
"$Z" cc -target x86-windows-gnu -O2 -o dipc_responder.exe ../036-proton-style-dipc-responder/dipc_responder.c -ladvapi32
rm -f *.pdb *.lib
cp steamclient.dll steamclient64.dll "$S/"; cp dipc_responder.exe "$DC/"
file steamclient.dll steamclient64.dll dipc_responder.exe | cut -d, -f1
