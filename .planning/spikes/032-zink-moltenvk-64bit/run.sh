#!/bin/bash
# Spike 032: run Mesa's own test_wgl.exe (gtest, mesa-dist-win 26.2.4 tests) as x64 AND x86 inside the
# GameLibSteamBridge-63000 bottle, with Mesa's opengl32.dll forced native, per Gallium driver.
# Splits 031's zink/llvmpipe failures into "32-bit path" vs "macOS/MoltenVK/Rosetta".
# usage: ./run.sh <x64|x86> <llvmpipe|softpipe|zink> [ENV=VAL ...]
# Temp dir C:\spike032\<arch> and the AppDefaults\test_wgl.exe key are ALWAYS removed afterwards.
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"
ARCH="$1"; DRV="$2"; shift 2
SCR="${SCR:-/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/5435ea4d-6e17-4b72-b021-9d88fe224f4c/scratchpad}"
MESA="$SCR/mesa-dl/x/$ARCH"; TESTS="$SCR/mesa-tests/x/$ARCH"
BOTTLE="GameLibSteamBridge-63000"; CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
DC="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE/drive_c"; T="$DC/spike032/$ARCH"
REGKEY='HKCU\Software\Wine\AppDefaults\test_wgl.exe'
LABEL="$ARCH-$DRV${TAG:+-$TAG}"; mkdir -p logs; LOG="$SPIKE/logs/$LABEL"; rm -f "$LOG".*
w(){ CX_BOTTLE="$BOTTLE" "$CX/wine" "$@"; }
cleanup(){ CX_BOTTLE="$BOTTLE" "$CX/wineserver" -k 2>/dev/null; w reg delete "$REGKEY" /f >/dev/null 2>&1
  CX_BOTTLE="$BOTTLE" "$CX/wineserver" -w; rm -rf "$DC/spike032"; }
trap cleanup EXIT
mkdir -p "$T"; cp "$TESTS/test_wgl.exe" "$MESA/opengl32.dll" "$MESA/libgallium_wgl.dll" "$T/"
w reg add "$REGKEY\\DllOverrides" /v opengl32 /t REG_SZ /d native /f >/dev/null 2>&1
( cd "$T" && env CX_BOTTLE="$BOTTLE" GALLIUM_DRIVER="$DRV" CX_DEBUGMSG="${CX_DEBUGMSG:-+loaddll,+seh,+debugstr}" \
    CX_LOG="$LOG.cxlog" "$@" perl -e 'alarm shift; exec @ARGV' "${WATCH:-60}" "$CX/wine" "C:\\spike032\\$ARCH\\test_wgl.exe" --gtest_filter='wgl.basic_create*:*basic_create*' > "$LOG.out" 2>&1 ); rc=$?
echo "[$LABEL] exit=$rc  faults=$(grep -c 'page fault' "$LOG.cxlog")  gallium=$(grep -oE 'gallium_wgl.dll" at [0-9A-F]+: [a-z]+' "$LOG.cxlog" | head -1 | awk '{print $NF}')"
grep -E "^\[|OK|FAILED|PASSED|Renderer|renderer|GL_|version|Version" "$LOG.out" | head -15 | sed 's/^/   /'
grep -E "debugstr:OutputDebugString|Unhandled" "$LOG.cxlog" | cut -d: -f4- | sort -u | head -6 | cut -c1-220 | sed 's/^/   ! /'
