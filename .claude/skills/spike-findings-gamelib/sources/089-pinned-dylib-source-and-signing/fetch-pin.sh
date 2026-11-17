#!/bin/bash
# 089: fetch a pinned, Valve-signed libsteam_api.dylib from Valve's client-update CDN.
# Pin = (package file name, sha256 of the .vz, sha256 of the extracted dylib, Valve team id).
# Usage: ./fetch-pin.sh <outdir>
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:?outdir}"; mkdir -p "$out"
PKG=webhelpers_osx.zip.vz.6d8f8e88928b53e6d7210fc2d7dab15760bd49d9_2348800   # client 1792618285, built 2026-10-21
PKG_SHA=8b9993c58577eec72895d85d6e113dbb226b1b5ecaff019c74f2bdb93c988ddb       # manifest "sha2vz"
DYLIB_SHA=4162eb404dd42f572e7514f906f9ad5e16b7ab9c3ad29f3a532dacbc30e16bac
MEMBER="Frameworks/Steam Helper.app/Contents/MacOS/libsteam_api.dylib"
VALVE_TEAM=MXGJJ98X76
curl -sf --max-time 60 -A "GameLib-spike" -o "$out/$PKG" "https://client-update.steamstatic.com/$PKG"
echo "$PKG_SHA  $out/$PKG" | shasum -a256 -c -
python3 -I "$here/vz.py" "$out/$PKG" "$out/pkg.zip"
unzip -o -q "$out/pkg.zip" "$MEMBER" -d "$out/x"
cp "$out/x/$MEMBER" "$out/libsteam_api.dylib"
echo "$DYLIB_SHA  $out/libsteam_api.dylib" | shasum -a256 -c -
codesign -v "$out/libsteam_api.dylib"
codesign -dv "$out/libsteam_api.dylib" 2>&1 | grep "TeamIdentifier=$VALVE_TEAM" >/dev/null
echo "pinned dylib OK: $out/libsteam_api.dylib (Valve $VALVE_TEAM, $(nm -gU "$out/libsteam_api.dylib" | grep -oE 'SteamAPI_SteamUser_v[0-9]+'))"
