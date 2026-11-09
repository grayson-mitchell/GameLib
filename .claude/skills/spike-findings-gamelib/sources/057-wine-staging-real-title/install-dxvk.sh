#!/bin/bash
# Spike 057 run 5: reproduce production's macOS DXVK install (backend/tools/index.ts DXVK.installRemove,
# tool 'dxvk-macOS', the `...repack.tar.gz` asset) into an APFS clone of 056's staging prefix:
# x64 DLLs -> system32, x32 -> syswow64, native DllOverrides in HKCU. Download kept in dl/ (gitignored).
set -euo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"
SRC="$SPIKE/../056-plain-prefix-bridge-handshake/prefixes/staging"
DST="$SPIKE/../056-plain-prefix-bridge-handshake/prefixes/staging-dxvk"
WBIN="$HOME/Library/Application Support/gamelib/tools/wine/Wine-Staging-macOS-latest/Contents/Resources/wine/bin"
URL=https://github.com/Gcenx/DXVK-macOS/releases/download/v1.10.3-20230507-repack/dxvk-macOS-async-v1.10.3-20230507-repack.tar.gz
mkdir -p dl/dxvk
[ -f dl/dxvk.tar.gz ] || curl -fsSL -o dl/dxvk.tar.gz "$URL"
tar -xzf dl/dxvk.tar.gz -C dl/dxvk
D=$(find dl/dxvk -maxdepth 1 -mindepth 1 -type d | head -1)
[ -d "$DST" ] || cp -cR "$SRC" "$DST"
cp "$D"/x64/*.dll "$DST/drive_c/windows/system32/"
cp "$D"/x32/*.dll "$DST/drive_c/windows/syswow64/"
for f in "$D"/x64/*.dll; do
  n=$(basename "$f" .dll)
  WINEPREFIX="$DST" WINEDEBUG=-all "$WBIN/wine" reg add 'HKEY_CURRENT_USER\Software\Wine\DllOverrides' /v "$n" /d native,builtin /f >/dev/null
done
WINEPREFIX="$DST" "$WBIN/wineserver" -w
echo "installed $(basename "$D") into $DST: $(ls "$D"/x64 | tr '\n' ' ')"
