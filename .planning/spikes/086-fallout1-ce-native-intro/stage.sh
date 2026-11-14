#!/bin/bash
# Stage fallout1-ce v1.1.0 beside an APFS-clone copy of the Steam 38400 data.
# Never writes to the Steam install: every file is cloned (cp -c) into $STAGE.
set -euo pipefail
SRC="${SRC:-$HOME/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-38400/drive_c/Program Files (x86)/Steam/steamapps/common/Fallout}"
STAGE="${1:?usage: stage.sh <stage-dir>}"
DMG_URL=https://github.com/alexbatalov/fallout1-ce/releases/download/v1.1.0/fallout-ce-macos.dmg
DMG_SHA=db8833e4fe452e5cdff16a4c37893be0a4e5f6b473abe5ae4839a3ba61c11a2c

mkdir -p "$STAGE/Fallout" "$STAGE/dl"
cd "$STAGE/dl"
[ -f fallout-ce-macos.dmg ] || curl -sSLO "$DMG_URL"
echo "$DMG_SHA  fallout-ce-macos.dmg" | shasum -a 256 -c -
MNT="$STAGE/mnt"; mkdir -p "$MNT"
mount | grep -q " $MNT " || hdiutil attach -nobrowse -readonly -mountpoint "$MNT" fallout-ce-macos.dmg >/dev/null
rm -rf "$STAGE/Fallout/Fallout Community Edition.app"
cp -R "$MNT/Fallout Community Edition.app" "$STAGE/Fallout/"
hdiutil detach "$MNT" >/dev/null

# Data: clone, not move/symlink (CE writes saves into DATA/SAVEGAME and rewrites fallout.cfg).
for f in MASTER.DAT CRITTER.DAT fallout.cfg; do cp -c "$SRC/$f" "$STAGE/Fallout/$f"; done
rm -rf "$STAGE/Fallout/DATA"; cp -cR "$SRC/DATA" "$STAGE/Fallout/DATA"
echo "staged: $STAGE/Fallout"; ls -la "$STAGE/Fallout"
