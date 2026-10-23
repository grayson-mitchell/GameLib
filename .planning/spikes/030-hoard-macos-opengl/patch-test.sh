#!/bin/bash
# PROOF ONLY: force Hoard's legacy-context branch by flipping je->jmp at VA 0x43575e
# (file offset 0x34b5e), run, then ALWAYS restore the original Reuben.exe.
set -uo pipefail
cd "$(dirname "$0")"
W="$HOME/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-63000/drive_c/Program Files (x86)/Steam/steamapps/common/Hoard/win32"
EXE="$W/Reuben.exe"; BAK="$W/Reuben.exe.bak030"
ORIG_SHA=$(shasum "$EXE" | cut -d' ' -f1)
cp -p "$EXE" "$BAK"; trap 'mv -f "$BAK" "$EXE"; echo "restored Reuben.exe sha=$(shasum "$EXE"|cut -d" " -f1) (orig $ORIG_SHA)"' EXIT
OFF=$((0x43575e - 0x401000 + 0x400))
cur=$(xxd -s $OFF -l 2 -p "$EXE"); [ "$cur" = "7476" ] || { echo "unexpected bytes $cur at $OFF"; exit 1; }
printf '\xeb' | dd of="$EXE" bs=1 seek=$OFF conv=notrunc 2>/dev/null
echo "patched: $(xxd -s $OFF -l 2 -p "$EXE")"
WINEDEBUG="" WATCH="${WATCH:-25}" ./run.sh "${1:-patched}" CX_DEBUGMSG="${CX_DEBUGMSG:-+wgl,+seh}" CX_LOG="$PWD/logs/${1:-patched}.cxlog"
