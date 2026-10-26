#!/bin/bash
# Spike 034c: put the feature-enabled shim where dev places shims from, and write Hoard's LOCAL tier-2
# profile. Undo with restore-034c.sh. Restart `pnpm dev` afterwards so the sidecar carries prototype.patch.
set -euo pipefail
cd "$(dirname "$0")"
SHIPPED=../../../public/bin/arm64/darwin/steam_api.dll
LOCAL="$HOME/Library/Application Support/GameLib/fixes/local"
[ -f out/steam_api.shipped.dll ] || cp -p "$SHIPPED" out/steam_api.shipped.dll
cp out/steam_api.dll "$SHIPPED"
mkdir -p "$LOCAL"
cp 63000-steam.profile.json "$LOCAL/"
echo "shipped shim backed up: $(shasum out/steam_api.shipped.dll | cut -c1-12)"
echo "bundled shim now spike: $(shasum "$SHIPPED" | cut -c1-12) (spike $(shasum out/steam_api.dll | cut -c1-12))"
echo "profile: $LOCAL/63000-steam.profile.json"
