#!/bin/bash
# Spike 041: scratch bottle GameLibSpike041 = APFS clone of GameLib's product Grim Dawn bridge bottle, plus the
# user's OWN genuine steamclient64.dll and its two Steam-dir imports copied from their GameLibSteam bottle into
# C:\spike041\ of the clone. Nothing is shipped; the product bottle and GameLibSteam are only read.
# steam.exe is deliberately NOT copied, so nothing in the clone can start a Windows Steam client.
set -euo pipefail
B="$HOME/Library/Application Support/CrossOver/Bottles"; CLONE="$B/GameLibSpike041"
S="$B/GameLibSteam/drive_c/Program Files (x86)/Steam"
[ -d "$CLONE" ] || cp -cR "$B/GameLibSteamBridge-219990" "$CLONE"
mkdir -p "$CLONE/drive_c/spike041"
for f in steamclient64.dll tier0_s64.dll vstdlib_s64.dll; do cp -p "$S/$f" "$CLONE/drive_c/spike041/$f"; done
( cd "$CLONE/drive_c/spike041" && shasum -a 256 *.dll )
echo "GameLibSpike041 ready"
