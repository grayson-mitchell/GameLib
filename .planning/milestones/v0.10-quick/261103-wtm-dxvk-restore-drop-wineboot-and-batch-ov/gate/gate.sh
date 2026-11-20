#!/bin/zsh
# G30 follow-up gate: throwaway CrossOver bottle, Staging -> CrossOver flip with DXVK DLLs
# removed, NO wineboot -u. Overrides deleted in ONE batched `reg import` (the first CrossOver
# process). Then check stock d3d11/d3d10core are back and the overrides are gone.
set -u
B=GameLibGateG30
CX=/Applications/CrossOver.app/Contents/SharedSupport/CrossOver
CXBIN=$CX/bin
ENG="$HOME/Library/Application Support/GameLib/tools/steam-engines"
ST="$ENG/wine-staging-11.20/Contents/Resources/wine/bin"
DX="$ENG/dxvk-macOS-v1.10.3-20230507-repack"
P="$HOME/Library/Application Support/CrossOver/Bottles/$B"
ts() { python3 -c 'import time;print(f"{time.time():.2f}")'; }
isbuiltin() { grep -qa "Wine builtin DLL" "$1" && echo builtin || echo NOT-builtin; }
state() {
  for f in system32/d3d11.dll system32/d3d10core.dll syswow64/d3d11.dll syswow64/d3d10core.dll; do
    if [[ -e "$P/drive_c/windows/$f" ]]; then echo "  $f: $(isbuiltin "$P/drive_c/windows/$f")"; else echo "  $f: MISSING"; fi
  done
  echo "  .update-timestamp=$(cat "$P/.update-timestamp")"
  echo "  overrides in user.reg:"; awk '/^\[Software\\\\Wine\\\\DllOverrides\]/{f=1;next} /^\[/{f=0} f&&/^"d3d1/' "$P/user.reg" | sed 's/^/    /' | grep . || echo "    (none)"
}

[[ -e "$P" ]] && { echo "bottle $B already exists, refusing"; exit 1; }
echo "CrossOver wine.inf mtime: $(stat -f %m $CX/share/wine/wine.inf)"
echo "Staging  wine.inf mtime: $(stat -f %m "$ST/../share/wine/wine.inf")"

echo "== create bottle (CrossOver)"
"$CXBIN/cxbottle" --bottle "$B" --create --template win10_64 >/dev/null 2>&1 || { echo create failed; exit 1; }
"$CXBIN/wineserver" --bottle "$B" -k 2>/dev/null; CX_BOTTLE=$B "$CXBIN/wineserver" -w 2>/dev/null
echo "== flip to Staging: wineboot -u + DXVK install (as installRemove backup)"
WINEPREFIX="$P" "$ST/wine" wineboot -u >/dev/null 2>&1
cp "$DX/x64/"*.dll "$P/drive_c/windows/system32/"
cp "$DX/x32/"*.dll "$P/drive_c/windows/syswow64/"
for d in d3d10core d3d11; do
  WINEPREFIX="$P" "$ST/wine" reg add 'HKEY_CURRENT_USER\Software\Wine\DllOverrides' /v $d /d native /f >/dev/null 2>&1
done
WINEPREFIX="$P" "$ST/wineserver" -w
echo "after Staging + DXVK:"; state

echo "== restore through CrossOver: rm DLLs first, then ONE reg import, no wineboot -u"
for f in "$DX/x64/"*.dll; do rm -f "$P/drive_c/windows/system32/$(basename $f)"; done
for f in "$DX/x32/"*.dll; do rm -f "$P/drive_c/windows/syswow64/$(basename $f)"; done
REG="$P/drive_c/gamelib-dxvk-restore.reg"
printf 'Windows Registry Editor Version 5.00\r\n\r\n[HKEY_CURRENT_USER\\Software\\Wine\\DllOverrides]\r\n"d3d10core"=-\r\n"d3d11"=-\r\n' > "$REG"
t0=$(ts)
CX_BOTTLE=$B "$CXBIN/wine" reg import 'C:\gamelib-dxvk-restore.reg' > "$P/../$B.import.out" 2>&1
rc=$?
t1=$(ts)
echo "reg import exit=$rc in $(python3 -c "print(round($t1-$t0,2))") s"; cat "$P/../$B.import.out" | grep -v '^$' | tail -5
CX_BOTTLE=$B "$CXBIN/wineserver" -k; while pgrep -qf "wineserver.*" && pgrep -lf wineserver | grep -q .; do sleep 0.5; done; sleep 1
echo "after CrossOver restore (wineserver stopped, registry saved):"; state
echo "== negative: import of a missing file / bad header"
CX_BOTTLE=$B "$CXBIN/wine" reg import 'C:\nope.reg' >/dev/null 2>&1; echo "missing file exit=$?"
printf 'garbage\r\n' > "$P/drive_c/bad.reg"
CX_BOTTLE=$B "$CXBIN/wine" reg import 'C:\bad.reg' >/dev/null 2>&1; echo "bad header exit=$?"
CX_BOTTLE=$B "$CXBIN/wineserver" -k 2>/dev/null
