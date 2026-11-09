#!/bin/bash
# Interactive proof: patch Hoard's GL-context branch (je->jmp @ VA 0x43575e), launch, wait for the
# game to exit, then ALWAYS restore the original Reuben.exe.  Pass --unpatched for the control run.
set -uo pipefail
BOTTLE="GameLibSteamBridge-63000"; CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
W="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE/drive_c/Program Files (x86)/Steam/steamapps/common/Hoard/win32"
EXE="$W/Reuben.exe"; BAK="$W/Reuben.exe.bak030"; OFF=$((0x43575e - 0x401000 + 0x400))
if [ "${1:-}" != "--unpatched" ]; then
  [ "$(xxd -s $OFF -l 2 -p "$EXE")" = "7476" ] || { echo "unexpected bytes at $OFF"; exit 1; }
  cp -p "$EXE" "$BAK"; trap 'mv -f "$BAK" "$EXE"; echo "restored original Reuben.exe"' EXIT
  printf '\xeb' | dd of="$EXE" bs=1 seek=$OFF conv=notrunc 2>/dev/null; echo "patched (legacy GL 2.1 path forced)"
fi
cd "$W" && CX_BOTTLE="$BOTTLE" "$CX/wine" 'C:\Program Files (x86)\Steam\steamapps\common\Hoard\win32\Reuben.exe'
CX_BOTTLE="$BOTTLE" "$CX/wineserver" -w
