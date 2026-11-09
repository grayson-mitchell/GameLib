#!/bin/bash
# Spike 034c: undo stage-034c.sh (shipped shim back, local Hoard profile removed).
set -euo pipefail
cd "$(dirname "$0")"
cp -p out/steam_api.shipped.dll ../../../public/bin/arm64/darwin/steam_api.dll
rm -f "$HOME/Library/Application Support/GameLib/fixes/local/63000-steam.profile.json"
echo "restored shim $(shasum ../../../public/bin/arm64/darwin/steam_api.dll | cut -c1-12); local profile removed"
