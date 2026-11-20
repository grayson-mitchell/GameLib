#!/bin/zsh
# Same-engine restore (timestamp already matches CrossOver): put DXVK back, remove it, write a
# mismatched .update-timestamp, then ONE reg import + one reg query. No wineboot -u.
B=GameLibGateG30; CXBIN=/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin
DX="$HOME/Library/Application Support/GameLib/tools/steam-engines/dxvk-macOS-v1.10.3-20230507-repack"
P="$HOME/Library/Application Support/CrossOver/Bottles/$B"
w() { CX_BOTTLE=$B "$CXBIN/wine" "$@"; }
chk() { for f in system32/d3d11.dll syswow64/d3d11.dll system32/d3d10core.dll syswow64/d3d10core.dll; do
  [[ -e "$P/drive_c/windows/$f" ]] && { grep -qa "Wine builtin DLL" "$P/drive_c/windows/$f" && echo "  $f builtin" || echo "  $f NOT-builtin"; } || echo "  $f MISSING"; done
  echo "  ts=$(cat "$P/.update-timestamp")"; }
for d in d3d10core d3d11; do w reg add 'HKEY_CURRENT_USER\Software\Wine\DllOverrides' /v $d /d native /f >/dev/null 2>&1; done
cp "$DX/x64/"*.dll "$P/drive_c/windows/system32/"; cp "$DX/x32/"*.dll "$P/drive_c/windows/syswow64/"
CX_BOTTLE=$B "$CXBIN/wineserver" -k; sleep 2
echo "control (matching ts, DLLs removed, one reg query, no update expected):"
rm -f "$P/drive_c/windows/system32/d3d1"*.dll "$P/drive_c/windows/syswow64/d3d1"*.dll
w reg query 'HKEY_CURRENT_USER\Software\Wine\DllOverrides' /v d3d11 >/dev/null 2>&1; chk
CX_BOTTLE=$B "$CXBIN/wineserver" -k; sleep 2
echo "forced (ts := 0, then reg import + reg query):"
echo 0 > "$P/.update-timestamp"
t0=$(date +%s.%N 2>/dev/null || python3 -c 'import time;print(time.time())')
w reg import 'C:\gamelib-dxvk-restore.reg' >/dev/null 2>&1; echo "  import exit=$?"
w reg query 'HKEY_CURRENT_USER\Software\Wine\DllOverrides' 2>&1 | grep -iE '^\s+d3d1' ; echo "  query (no d3d1x lines above = gone)"
chk
CX_BOTTLE=$B "$CXBIN/wineserver" -k
