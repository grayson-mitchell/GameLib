#!/bin/bash
# Spike 031: run UNPATCHED Hoard with Mesa's Windows opengl32.dll (mesa-dist-win 26.2.4 x86) placed
# beside Reuben.exe and forced native. Driver picked via GALLIUM_DRIVER (llvmpipe | zink).
# Forced native via per-app AppDefaults\Reuben.exe\DllOverrides (CrossOver drops WINEDLLOVERRIDES).
# ALWAYS removes the Mesa DLLs and the registry key afterwards.
# usage: ./run.sh <label> <llvmpipe|zink|none> [ENV=VAL ...]   (WATCH=secs, INTERACTIVE=1 to play)
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"
LABEL="$1"; DRV="$2"; shift 2
MESA="${MESA:-/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/5435ea4d-6e17-4b72-b021-9d88fe224f4c/scratchpad/mesa-dl/x/x86}"
BOTTLE="GameLibSteamBridge-63000"; CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
H="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE/drive_c/Program Files (x86)/Steam/steamapps/common/Hoard"
W="$H/win32"; EXE='C:\Program Files (x86)\Steam\steamapps\common\Hoard\win32\Reuben.exe'
REGKEY='HKCU\Software\Wine\AppDefaults\Reuben.exe\DllOverrides'
WATCH="${WATCH:-25}"; mkdir -p logs; LOG="$SPIKE/logs/$LABEL"
[ "$(xxd -s $((0x34b5e)) -l 2 -p "$W/Reuben.exe")" = "7476" ] || { echo "Reuben.exe is not the unpatched original"; exit 1; }
cleanup(){ pkill -f Reuben.exe 2>/dev/null; sleep 1; CX_BOTTLE="$BOTTLE" "$CX/wineserver" -k 2>/dev/null
  CX_BOTTLE="$BOTTLE" "$CX/wine" reg delete "${REGKEY%\\DllOverrides}" /f >/dev/null 2>&1; CX_BOTTLE="$BOTTLE" "$CX/wineserver" -w
  rm -f "$W/opengl32.dll" "$W/libgallium_wgl.dll"; echo "[$LABEL] removed Mesa DLLs: $(ls "$W" | grep -ciE 'opengl32|gallium') left"; }
trap cleanup EXIT
OVR=""
if [ "$DRV" != "none" ]; then cp "$MESA/opengl32.dll" "$MESA/libgallium_wgl.dll" "$W/"; OVR="opengl32=n"
  CX_BOTTLE="$BOTTLE" "$CX/wine" reg add "$REGKEY" /v opengl32 /t REG_SZ /d native /f >/dev/null 2>&1; CX_BOTTLE="$BOTTLE" "$CX/wineserver" -w; fi
rm -f "$H/reubenGFX.log" "$LOG".*
( cd "$W" && exec env CX_BOTTLE="$BOTTLE" WINEDLLOVERRIDES="$OVR" GALLIUM_DRIVER="$DRV" \
    CX_DEBUGMSG="${CX_DEBUGMSG:-+loaddll,+seh}" CX_LOG="$LOG.cxlog" "$@" "$CX/wine" "$EXE" > "$LOG.out" 2>&1 ) &
if [ "${INTERACTIVE:-0}" = 1 ]; then echo "playing — quit the game to finish"; sleep 5; while pgrep -f Reuben.exe >/dev/null; do sleep 2; done
else alive=0; for i in $(seq 1 "$WATCH"); do sleep 1; pgrep -f Reuben.exe >/dev/null && alive=$i; done; echo "[$LABEL] last-seen-alive t=${alive}s of ${WATCH}s"; fi
cp "$H/reubenGFX.log" "$LOG.reubenGFX.log" 2>/dev/null
echo "[$LABEL] page faults: $(grep -c 'page fault' "$LOG.cxlog" 2>/dev/null)"
echo "[$LABEL] opengl32 loaded: $(grep -oE 'Loaded L"[^"]*(opengl32|gallium)[^"]*" at [0-9A-F]+: [a-z]+' "$LOG.cxlog" | sort -u | tr '\n' ';')"
echo "--- reubenGFX.log"; grep -vE '^GL_EXTENSIONS|^GL_ARB|^$' "$LOG.reubenGFX.log" 2>/dev/null | paste - - | head -8
echo "--- stdout/stderr tail"; tail -8 "$LOG.out"
