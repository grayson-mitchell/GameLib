#!/bin/bash
# Spike 038: scratch bottle GameLibSpikeGD = APFS clone of GameLib's own Grim Dawn bridge bottle (shim already
# placed by GameLib). The product bottle GameLibSteamBridge-219990 is never modified.
set -euo pipefail
B="$HOME/Library/Application Support/CrossOver/Bottles"
[ -d "$B/GameLibSpikeGD" ] || cp -cR "$B/GameLibSteamBridge-219990" "$B/GameLibSpikeGD"
echo "GameLibSpikeGD ready ($(du -sh "$B/GameLibSpikeGD" | cut -f1) logical, APFS-cloned)"
