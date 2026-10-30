#!/bin/bash
# Spike 052: run probe32/probe64 beside the SHIPPED shims under each engine, each with its own fresh
# bridge helper (--appid 480 --port 0 + per-run secret, exactly like helperProcess.ts), and record
# helper stderr + probe.txt. Engines:
#   cx      -- positive control: APFS clone of a CrossOver bridge bottle, CX_BOTTLE + bin/wine
#   staging -- fresh WINEPREFIX made by Wine-Staging's own `wineboot -i` (no cxbottle anywhere)
# Usage: [BAD_SECRET=1] ./run.sh [engine...]   (engines: cx staging dxmt gptk; default: cx staging).
# BAD_SECRET=1 is the negative control: the cfg carries a secret the helper did not issue. Real bridge bottles are never touched.
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"; R="$SPIKE/../../.."
BIN="$R/public/bin/arm64/darwin"; HELPER="$BIN/steam-bridge-helper"
CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
BOTTLES="$HOME/Library/Application Support/CrossOver/Bottles"
CXCLONE="GameLibSpike052"
STAGING_WINE="$HOME/Library/Application Support/gamelib/tools/wine/Wine-Staging-macOS-latest/Contents/Resources/wine/bin"
GPTK_WINE="$HOME/Library/Application Support/gamelib/tools/game-porting-toolkit/Game-Porting-Toolkit-latest/Contents/Resources/wine/bin"
DXMT_WINE="${STAGING_WINE/Wine-Staging-macOS-latest/Wine-Staging-macOS-latest-DXMT}"
mkdir -p logs state prefixes
ts() { perl -MTime::HiRes=time -MPOSIX=strftime -e '$t=time; printf "%s.%03dZ", strftime("%Y-%m-%dT%H:%M:%S", gmtime $t), ($t-int $t)*1000'; }
ev() { echo "$(ts) [$1] $2" | tee -a logs/events.log; }
T() { perl -e 'alarm shift; exec @ARGV' "$@"; }

prep_cx() {
  [ -d "$BOTTLES/$CXCLONE" ] || cp -cR "$BOTTLES/GameLibSteamBridge-206060" "$BOTTLES/$CXCLONE"
  DRIVE="$BOTTLES/$CXCLONE/drive_c"
  WINE=( env CX_BOTTLE="$CXCLONE" "$CX/wine" ); KILL=( env WINEPREFIX="$BOTTLES/$CXCLONE" "$CX/wineserver" -k )
}
prep_plain() { # <engine label> <wine bin dir> [wine exe name] [extra env...] -- fresh WINEPREFIX via the engine's own wineboot -i
  local eng="$1" wbin="$2" wexe="${3:-wine}" prefix="$SPIKE/prefixes/$1"; shift 3 2>/dev/null || shift $#; local xenv=( "$@" )
  if [ ! -f "$prefix/system.reg" ]; then
    local t0=$SECONDS
    WINEPREFIX="$prefix" WINEDLLOVERRIDES="mscoree,mshtml=" T 300 "$wbin/$wexe" wineboot -i > "logs/$eng-wineboot.out" 2>&1
    local rc=$?
    WINEPREFIX="$prefix" "$wbin/wineserver" -w   # system.reg is only flushed when the wineserver exits
    ev "$eng" "wineboot -i rc=$rc in $((SECONDS-t0))s; system.reg=$([ -f "$prefix/system.reg" ] && echo yes || echo no) $(grep -m1 '#arch' "$prefix/system.reg" 2>/dev/null)"
  fi
  DRIVE="$prefix/drive_c"
  WINE=( env WINEPREFIX="$prefix" WINEDEBUG=-all ${xenv[@]+"${xenv[@]}"} "$wbin/$wexe" ); KILL=( env WINEPREFIX="$prefix" "$wbin/wineserver" -k )
}
prep_staging() { prep_plain staging "$STAGING_WINE"; }
prep_dxmt() { prep_plain dxmt "$DXMT_WINE"; }
# GPTK (spike 054): wine64 only; launcher.ts env for `toolkit` with msync on (config.ts:379) = WINEMSYNC + WINEESYNC
prep_gptk() { prep_plain gptk "$GPTK_WINE" wine64 WINEMSYNC=1 WINEESYNC=1; }

run_case() { # <engine> <arch 32|64>
  local eng="$1" a="$2" label="$1-x$2"; [ -n "${BAD_SECRET:-}" ] && label="$label-badsecret"
  local D="$DRIVE/spike052"; mkdir -p "$D"
  local dll=steam_api.dll; [ "$a" = 64 ] && dll=steam_api64.dll
  rm -f "$D"/probe.txt "$D"/gamelib_bridge.cfg "$D"/steam_api*.dll
  cp "out/probe$a.exe" "$D/"; cp "$BIN/$dll" "$D/"
  local secret; secret=$(openssl rand -hex 32)
  : > "logs/$label.helper.log"
  ( cd state && GAMELIB_BRIDGE_SECRET="$secret" exec "$HELPER" --appid 480 --port 0 ) 2> "logs/$label.helper.log" &
  local hp=$! port=""
  for _ in $(seq 1 50); do port=$(sed -nE 's/.*LISTEN 127\.0\.0\.1:([0-9]+) appid=.*/\1/p' "logs/$label.helper.log" | head -1); [ -n "$port" ] && break; sleep 0.1; done
  if [ -z "$port" ]; then ev "$label" "helper never reported LISTEN"; kill $hp 2>/dev/null; return; fi
  local cfgsecret="$secret"; [ -n "${BAD_SECRET:-}" ] && cfgsecret=$(openssl rand -hex 32)
  printf 'port=%s\nappid=480\nsecret=%s\n' "$port" "$cfgsecret" > "$D/gamelib_bridge.cfg"
  ( cd "$D" && T 90 "${WINE[@]}" "C:\\spike052\\probe$a.exe" > "$SPIKE/logs/$label.wine.out" 2>&1 ); local rc=$?
  "${KILL[@]}" 2>/dev/null; kill $hp 2>/dev/null; wait $hp 2>/dev/null
  cp "$D/probe.txt" "logs/$label.probe.txt" 2>/dev/null || echo "result=NO_OUTPUT" > "logs/$label.probe.txt"
  ev "$label" "rc=$rc port=$port | $(tr '\n' ' ' < "logs/$label.probe.txt")| helper: $(grep -oE '(HELLO|INIT|AUTH|FATAL)[^\n]*' "logs/$label.helper.log" | tr '\n' ';')"
}

for eng in "${@:-cx staging}"; do
  for e in $eng; do "prep_$e"; run_case "$e" 32; run_case "$e" 64; done
done
