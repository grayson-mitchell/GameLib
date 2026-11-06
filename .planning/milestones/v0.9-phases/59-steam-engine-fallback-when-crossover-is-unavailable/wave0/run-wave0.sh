#!/bin/bash
# Phase 59 Plan 01 Wave 0 harness. Usage: run-wave0.sh adopt|dxvk|psmatch|cleanup
# SAFETY: every engine call targets a clone inside "$WORK" (CX_BOTTLE_PATH / WINEPREFIX). Real bottles are
# only ever `cp -c -R` sources. Nothing is written under CrossOver.app or the licence file.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
R="$(cd "$HERE/../../../.." && pwd)"
CXROOT="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver"
CX="$CXROOT/bin"
STAGING="$HOME/Library/Application Support/gamelib/tools/wine/Wine-Staging-macOS-latest/Contents/Resources/wine/bin"
SRC_BOTTLES="$HOME/Library/Application Support/CrossOver/Bottles"
S056="$R/.planning/spikes/056-plain-prefix-bridge-handshake"
STAGING_PREFIX_SRC="$S056/prefixes/staging"
PROBE64="$S056/out/probe64.exe"
SHIM64="$R/public/bin/arm64/darwin/steam_api64.dll"
PROBE_WIN='C:\spike056\probe64.exe'
# DXVK-macOS 1.10.3 (same tag DXVK.getLatest uses); override with DXVK_DIR=<dir containing x32 and x64>
DXVK_DIR="${DXVK_DIR:-$HOME/Library/Application Support/gamelib/tools/dxvk-macOS/v1.10.3-20230507-repack}"
mkdir -p "$HERE/logs"
SUB="${1:-}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
export WINEDEBUG=-all MVK_CONFIG_LOG_LEVEL=0

T() { local n="$1"; shift; perl -e 'alarm shift; exec @ARGV' "$n" "$@"; }
cap() { head -c 1048576; }

stop_engines() { # stop wineservers for every prefix under $WORK/Bottles
  [ -n "${WORK:-}" ] && [ -d "$WORK/Bottles" ] || return 0
  local p
  for p in "$WORK"/Bottles/*; do
    [ -d "$p" ] || continue
    WINEPREFIX="$p" T 20 "$STAGING/wineserver" -k >/dev/null 2>&1 || true
    CX_BOTTLE_PATH="$WORK/Bottles" WINEPREFIX="$p" T 20 "$CX/wineserver" -k >/dev/null 2>&1 || true
  done
}
mkwork() {
  WORK="$(mktemp -d "${TMPDIR:-/tmp}/gl59-$1.XXXXXX")"
  trap 'stop_engines; rm -rf "$WORK"' EXIT
  mkdir -p "$WORK/Bottles"
  LOG="$HERE/logs/$1-$TS.log"
  exec > >(tee "$LOG") 2>&1
  echo "# $1 $TS WORK=$WORK"
}
cx_wine() { # <bottle> args...
  local b="$1"; shift
  CX_BOTTLE_PATH="$WORK/Bottles" CX_BOTTLE="$b" "$CX/wine" "$@"
}
st_wine() { # <prefix> args...
  local p="$1"; shift
  WINEPREFIX="$p" USER=crossover "$STAGING/wine" "$@"
}

adopt() {
  mkwork adopt
  local P="$WORK/Bottles/GameLibAdoptTest" fail=""
  cp -c -R "$STAGING_PREFIX_SRC" "$P" || { echo "cp -c failed"; echo "adoption_clean: no (clone failed)"; return; }
  {
    echo '[Bottle]'
    echo "\"BottleID\" = \"$(uuidgen)\""
    echo '"Encoding" = "UTF-8"'
    echo '"Template" = "win10_64"'
    echo '"MenuMode" = "ignore"'
    echo '"AssocMode" = "ignore"'
    echo '"WineArch" = "win64"'
  } > "$P/cxbottle.conf"
  mkdir -p "$P/drive_c/spike056"; cp "$PROBE64" "$SHIM64" "$P/drive_c/spike056/"
  echo "--- conf before:"; cat "$P/cxbottle.conf"
  local t0=$SECONDS out rc
  set +e
  out=$(cx_wine GameLibAdoptTest --demo-status 2>&1 | cap); rc=${PIPESTATUS[0]}
  set -e
  echo "--- demo-status rc=$rc dur=$((SECONDS-t0))s: $out"
  echo "$out" | grep -qE "Demo version|Standard version|Licensed|Expired|Registered|days remaining|expired" || { fail="$fail demo-status-unrecognised"; }
  t0=$SECONDS
  set +e
  out=$(T 120 env CX_BOTTLE_PATH="$WORK/Bottles" CX_BOTTLE=GameLibAdoptTest "$CX/wine" "$PROBE_WIN" 2>&1 | cap); rc=${PIPESTATUS[0]}
  set -e
  echo "--- probe under CrossOver rc=$rc dur=$((SECONDS-t0))s:"; echo "$out" | tail -20
  echo "probe.txt: $(tr '\n' ' ' < "$P/drive_c/spike056/probe.txt" 2>/dev/null)"
  grep -q arch=x64 "$P/drive_c/spike056/probe.txt" 2>/dev/null || fail="$fail cx-probe-no-output"; rm -f "$P/drive_c/spike056/probe.txt"
  [ "$rc" = 0 ] || fail="$fail cx-probe-rc=$rc"
  CX_BOTTLE_PATH="$WORK/Bottles" WINEPREFIX="$P" T 20 "$CX/wineserver" -k >/dev/null 2>&1 || true
  echo "--- conf after:"; cat "$P/cxbottle.conf"
  local gained=no; grep -q '"Timestamp"' "$P/cxbottle.conf" && gained=yes
  echo "Timestamp line: $gained; Version line: $(grep -c '"Version"' "$P/cxbottle.conf")"
  echo "drive_c/users/crossover exists: $([ -d "$P/drive_c/users/crossover" ] && echo yes || echo no)"
  [ "$gained" = yes ] || fail="$fail no-timestamp"
  t0=$SECONDS
  set +e
  out=$(T 120 env WINEPREFIX="$P" USER=crossover "$STAGING/wine" "$PROBE_WIN" 2>&1 | cap); rc=${PIPESTATUS[0]}
  set -e
  echo "--- probe under Staging afterwards rc=$rc dur=$((SECONDS-t0))s:"; echo "$out" | tail -20
  echo "probe.txt: $(tr '\n' ' ' < "$P/drive_c/spike056/probe.txt" 2>/dev/null)"
  grep -q arch=x64 "$P/drive_c/spike056/probe.txt" 2>/dev/null || fail="$fail staging-probe-no-output"
  [ "$rc" = 0 ] || fail="$fail staging-probe-rc=$rc"
  WINEPREFIX="$P" T 20 "$STAGING/wineserver" -k >/dev/null 2>&1 || true
  echo "adoption_conf_gained_timestamp: $gained"
  if [ -z "$fail" ]; then echo "adoption_clean: yes"; else echo "adoption_clean: no (failing:$fail)"; fi
}

pick_bottle() {
  local n d
  for n in 1284190 206060; do [ -d "$SRC_BOTTLES/GameLibSteamBridge-$n" ] && { echo "$SRC_BOTTLES/GameLibSteamBridge-$n"; return; }; done
  for d in "$SRC_BOTTLES"/GameLibSteamBridge-*; do [ -f "$d/system.reg" ] && { echo "$d"; return; }; done
}
dll_names() { { ls "$DXVK_DIR/x64"; ls "$DXVK_DIR/x32"; } | sort -u; }
sha() { [ -f "$1" ] && shasum -a 256 "$1" | cut -c1-16 || echo MISSING; }
dxvk_backup() { # <prefix> -- Staging reproduces DXVK.installRemove 'backup'
  local P="$1" f dll
  [ -d "$DXVK_DIR/x64" ] || { echo "DXVK dir missing: $DXVK_DIR"; return 1; }
  for f in "$DXVK_DIR"/x32/*.dll; do cp "$f" "$P/drive_c/windows/syswow64/"; done
  for f in "$DXVK_DIR"/x64/*.dll; do cp "$f" "$P/drive_c/windows/system32/"; done
  for dll in $(dll_names); do
    T 60 env WINEPREFIX="$P" USER=crossover "$STAGING/wine" reg add 'HKEY_CURRENT_USER\Software\Wine\DllOverrides' /v "${dll%.dll}" /d native /f 2>&1 | cap | tail -1 || true
  done
  echo "v1.10.3-20230507-repack" > "$P/current_dxvk-macOS"
  WINEPREFIX="$P" T 20 "$STAGING/wineserver" -w || true
}
dxvk_restore() { # <engine cx|staging> <prefix> <bottle name>
  local eng="$1" P="$2" B="$3" dll f rc
  local -a W
  if [ "$eng" = cx ]; then W=(env CX_BOTTLE_PATH="$WORK/Bottles" CX_BOTTLE="$B" "$CX/wine"); else W=(env WINEPREFIX="$P" USER=crossover "$STAGING/wine"); fi
  for dll in $(dll_names); do
    T 60 "${W[@]}" reg delete 'HKEY_CURRENT_USER\Software\Wine\DllOverrides' /v "${dll%.dll}" /f 2>&1 | cap | tail -1 || true
  done
  rm -f "$P/current_dxvk-macOS"
  for f in $(ls "$DXVK_DIR/x64"); do rm -f "$P/drive_c/windows/system32/$f"; done
  for f in $(ls "$DXVK_DIR/x32"); do rm -f "$P/drive_c/windows/syswow64/$f"; done
  set +e; T 180 "${W[@]}" wineboot -u 2>&1 | cap | tail -3; rc=${PIPESTATUS[0]}; set -e
  echo "wineboot -u ($eng) rc=$rc"
  if [ "$eng" = cx ]; then CX_BOTTLE_PATH="$WORK/Bottles" WINEPREFIX="$P" T 20 "$CX/wineserver" -w || true
  else WINEPREFIX="$P" T 20 "$STAGING/wineserver" -w || true; fi
}
dxvk_evaluate() { # <engine> <prefix> <bottle> -> sets EVAL=yes|no
  local eng="$1" P="$2" B="$3" rc ok=yes
  echo "post-restore sha system32 d3d11: $(sha "$P/drive_c/windows/system32/d3d11.dll")  syswow64 d3d11: $(sha "$P/drive_c/windows/syswow64/d3d11.dll")"
  [ -f "$P/drive_c/windows/system32/d3d11.dll" ] && [ -f "$P/drive_c/windows/syswow64/d3d11.dll" ] || ok=no
  local left; left=$(grep -ciE '"(d3d11|d3d10core|dxgi|d3d9)"=' "$P/user.reg" || true)
  echo "DllOverride DXVK names remaining in user.reg: $left"
  grep -iE '"(d3d11|d3d10core)"=' "$P/user.reg" || true
  [ "$left" = 0 ] || ok=no
  set +e
  if [ "$eng" = cx ]; then T 90 env CX_BOTTLE_PATH="$WORK/Bottles" CX_BOTTLE="$B" "$CX/wine" cmd /c ver 2>&1 | cap | tail -2; rc=${PIPESTATUS[0]}
  else T 90 env WINEPREFIX="$P" USER=crossover "$STAGING/wine" cmd /c ver 2>&1 | cap | tail -2; rc=${PIPESTATUS[0]}; fi
  set -e
  echo "cmd /c ver ($eng) rc=$rc"
  [ "$rc" = 0 ] || ok=no
  EVAL=$ok
}
dxvk() {
  mkwork dxvk
  local SRC; SRC="$(pick_bottle)"
  [ -n "$SRC" ] || { echo "no bridge bottle found"; echo "dxvk_restore_clean: no"; return; }
  echo "source bottle (read-only clone source): $SRC"
  local P1="$WORK/Bottles/GameLibDxvkTest"
  cp -c -R "$SRC" "$P1" || { echo "cp -c failed; aborting (no full-copy fallback)"; echo "dxvk_restore_clean: no"; return 1; }
  local hasts=no; [ -f "$P1/.update-timestamp" ] && hasts=yes
  echo "cx_bottle_has_update_timestamp: $hasts"
  echo "before sha system32 d3d11: $(sha "$P1/drive_c/windows/system32/d3d11.dll")  syswow64 d3d11: $(sha "$P1/drive_c/windows/syswow64/d3d11.dll")"
  echo "--- backup (Staging)"
  dxvk_backup "$P1"
  echo "after-backup sha system32 d3d11: $(sha "$P1/drive_c/windows/system32/d3d11.dll")"
  echo "--- restore (CrossOver)"
  dxvk_restore cx "$P1" GameLibDxvkTest
  dxvk_evaluate cx "$P1" GameLibDxvkTest
  if [ "$EVAL" = yes ]; then echo "dxvk_restore_clean: yes"; echo "dxvk_restore_engine: crossover"; return; fi
  echo "CrossOver restore NOT clean; retrying on a fresh clone with Staging"
  stop_engines; rm -rf "$P1"
  local P2="$WORK/Bottles/GameLibDxvkTest2"
  cp -c -R "$SRC" "$P2"
  dxvk_backup "$P2"
  dxvk_restore staging "$P2" GameLibDxvkTest2
  dxvk_evaluate staging "$P2" GameLibDxvkTest2
  echo "dxvk_restore_clean: $EVAL"; echo "dxvk_restore_engine: staging"
}

psmatch() {
  mkwork psmatch
  local P="$WORK/Bottles/GameLibPsTest"
  cp -c -R "$STAGING_PREFIX_SRC" "$P"
  mkdir -p "$P/drive_c/Games/Probe"
  cp "$P/drive_c/windows/system32/cmd.exe" "$P/drive_c/Games/Probe/probecmd.exe"
  ( T 60 env WINEPREFIX="$P" USER=crossover "$STAGING/wine" 'C:\Games\Probe\probecmd.exe' /c ping -n 25 127.0.0.1 >/dev/null 2>&1 ) &
  local i matched=no seen="" line
  for i in $(seq 1 20); do
    sleep 1
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      case "$seen" in *"$line"*) ;; *) seen="$seen$line"$'\n'; echo "ps: $line";; esac
      local cmd; cmd=$(echo "$line" | sed -E 's/^ *[0-9]+ //; s/^"//')
      case "$(echo "$cmd" | tr '[:upper:]' '[:lower:]')" in 'c:\games\probe\'*) matched=yes;; esac
    done < <(ps -axo pid=,command= | grep probecmd | grep -v grep || true)
  done
  wait || true
  echo "staging_monitor_match: $matched"
}

cleanup() {
  local d p
  for d in "${TMPDIR:-/tmp}"/gl59-*; do
    [ -d "$d" ] || continue
    WORK="$d"; stop_engines; rm -rf "$d"
  done
  echo "cleanup done"
}

case "$SUB" in
  adopt) adopt ;;
  dxvk) dxvk ;;
  psmatch) psmatch ;;
  cleanup|all-temp-cleanup) cleanup ;;
  *) echo "usage: $0 adopt|dxvk|psmatch|cleanup" >&2; exit 2 ;;
esac
