#!/bin/bash
# Phase 52 live-gate scratch harness (authored by 52-10, run by 52-11 / 52-12).
#
# Reproduces what GameLib sets up for a SteamStub title (steamClientSetup.ts: HKCU ActiveProcess
# SteamClientDll64 + Universe=Public, steamclient64.dll beside x64/steam_api64.dll, the bridge cfg
# beside the exe and shim) inside a FRESH APFS clone of the product bottle (decision 5). The
# product bottle is only ever READ. This harness answers nothing itself -- it only sets up what
# GameLib sets up, then watches what the game does.
#
#   SESSION=<existing dir>  ROUND=<label>  MODE=probe|trace  [REG=1|0] [WATCH=45] [INTERACTIVE=1] [DRY_RUN=1]
#
#   MODE=probe  copy the built shim + steamclient64.dll into the clone, write the HKCU values (REG=0 skips
#               them: the positive control), start the helper, launch.
#   MODE=trace  no copies, no registry writes: the clone inherits whatever GameLib itself wrote.
#
# Optional clone-only overrides (52-19; defaults keep the original behaviour byte for byte):
#   DEBUGMSG=<channels>     wine --debugmsg value            (default +process,+reg,+loaddll,+seh)
#   HELPER_BIN=<path>       helper binary to start           (default $ART/steam-bridge-helper)
#   RELAY_INCLUDE='a;b;..'  when non-empty, writes HKCU\Software\Wine\Debug\RelayInclude in the
#                           CLONE only (never under Software\Valve), for use with +relay in DEBUGMSG.
set -euo pipefail

: "${SESSION:?SESSION (existing session dir) required}"
: "${ROUND:?ROUND label required}"
: "${MODE:?MODE=probe|trace required}"
case "$MODE" in probe | trace) ;; *) echo "MODE must be probe or trace" >&2; exit 2 ;; esac
REG="${REG:-1}"
WATCH="${WATCH:-45}"
DRY_RUN="${DRY_RUN:-0}"
DEBUGMSG="${DEBUGMSG:-+process,+reg,+loaddll,+seh}"
RELAY_INCLUDE="${RELAY_INCLUDE:-}"

SRC=GameLibSteamBridge-219990
CLONE=GameLibGate52GD
CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
BOTTLES="$HOME/Library/Application Support/CrossOver/Bottles"
SRC_PFX="$BOTTLES/$SRC"
CLONE_PFX="$BOTTLES/$CLONE"
REL_GAME="drive_c/Program Files (x86)/Steam/steamapps/common/Grim Dawn"
CLONE_GAME="$CLONE_PFX/$REL_GAME"
WIN_GAME='C:\Program Files (x86)\Steam\steamapps\common\Grim Dawn'
REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
ART="$REPO/public/bin/arm64/darwin"
HELPER_BIN="${HELPER_BIN:-$ART/steam-bridge-helper}"

# ---- guards (before anything mutates) ---------------------------------------------------------
refuse() {
  if [ "$DRY_RUN" = 1 ]; then echo "DRY_RUN would REFUSE: $*"; else echo "REFUSE: $*" >&2; exit 1; fi
}
[ "$CLONE" != "$SRC" ] || refuse "CLONE equals SRC"
case "$CLONE_PFX" in */GameLibGate52GD) ;; *) refuse "clone path does not end in /GameLibGate52GD: $CLONE_PFX" ;; esac
[ -d "$SESSION" ] || refuse "SESSION dir does not exist: $SESSION"
if pgrep -f 'target/debug/gamelib-shell' >/dev/null 2>&1; then refuse "a gamelib-shell instance is running (single-instance rule)"; fi
if pgrep -fl 'steam-bridge-helper --appid 219990' >/dev/null 2>&1; then refuse "a 219990 steam-bridge-helper is already running"; fi

run() {
  if [ "$DRY_RUN" = 1 ]; then printf 'DRY:'; printf ' %q' "$@"; printf '\n'; else "$@"; fi
}

LOG="$SESSION/terminal.log"
HELPER_LOG="$SESSION/round-$ROUND.helper.log"
CXLOG="$SESSION/round-$ROUND.cxlog"
WINELOG="$SESSION/round-$ROUND.wine.log"
STATE="$SESSION/helper-state-$ROUND"

# (1) delimiter, append-only
echo "=== GATE ROUND ${ROUND} MODE=${MODE} — $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$LOG"

HP=""
cleanup() {
  [ -n "$HP" ] && kill "$HP" 2>/dev/null || true
  if [ "$DRY_RUN" != 1 ]; then WINEPREFIX="$CLONE_PFX" "$CX/wineserver" -k 2>/dev/null || true; fi
}
trap cleanup EXIT

# (2) flush the source registry (wineserver -k only), then fresh clone every run
run env WINEPREFIX="$SRC_PFX" "$CX/wineserver" -k || true
run rm -rf "$CLONE_PFX"
run cp -cR "$SRC_PFX" "$CLONE_PFX"

# (3) MODE=probe: mirror steamClientSetup.ts
if [ "$MODE" = probe ]; then
  run cp "$ART/steam_api64.dll" "$CLONE_GAME/x64/steam_api64.dll"
  run cp "$ART/steamclient64.dll" "$CLONE_GAME/x64/steamclient64.dll"
  if [ "$REG" = 1 ]; then
    KEY='HKCU\Software\Valve\Steam\ActiveProcess'
    run env CX_BOTTLE="$CLONE" "$CX/wine" reg add "$KEY" /v SteamClientDll64 /t REG_SZ /d "$WIN_GAME"'\x64\steamclient64.dll' /f
    run env CX_BOTTLE="$CLONE" "$CX/wine" reg add "$KEY" /v Universe /t REG_SZ /d Public /f
  fi
fi

# (3b) optional relay filter, clone only
if [ -n "$RELAY_INCLUDE" ]; then
  [ "$CLONE" = GameLibGate52GD ] || refuse "RelayInclude target is not GameLibGate52GD: $CLONE"
  run env CX_BOTTLE="$CLONE" "$CX/wine" reg add 'HKCU\Software\Wine\Debug' /v RelayInclude /t REG_SZ /d "$RELAY_INCLUDE" /f
fi

# (4) helper, cwd = state dir with steam_appid.txt
run mkdir -p "$STATE"
if [ "$DRY_RUN" = 1 ]; then
  echo "DRY: (cd $STATE; $HELPER_BIN --appid 219990 --port 0) appended to $HELPER_LOG"
  PORT=0
else
  printf '219990' >"$STATE/steam_appid.txt"
  (cd "$STATE" && exec "$HELPER_BIN" --appid 219990 --port 0) >>"$HELPER_LOG" 2>&1 &
  HP=$!
  PORT=""
  for _ in $(seq 75); do
    PORT=$(grep -oE 'LISTEN 127\.0\.0\.1:[0-9]+' "$HELPER_LOG" | tail -1 | cut -d: -f2 || true)
    [ -n "$PORT" ] && break
    sleep 0.2
  done
  [ -n "$PORT" ] || { echo "helper never listened" | tee -a "$LOG"; exit 1; }
fi

# (5) cfg beside the exe and beside the root shim
if [ "$DRY_RUN" = 1 ]; then
  echo "DRY: write port=$PORT appid=219990 to $CLONE_GAME/x64/gamelib_bridge.cfg and $CLONE_GAME/gamelib_bridge.cfg"
else
  printf 'port=%s\nappid=219990\n' "$PORT" >"$CLONE_GAME/x64/gamelib_bridge.cfg"
  printf 'port=%s\nappid=219990\n' "$PORT" >"$CLONE_GAME/gamelib_bridge.cfg"
fi

# (6) launch
T0=$(date +%s)
if [ "$DRY_RUN" = 1 ]; then
  echo "DRY: (cd $CLONE_GAME/x64; CX_BOTTLE=$CLONE wine --cx-log $CXLOG --debugmsg $DEBUGMSG 'x64\\Grim Dawn.exe') appended to $WINELOG"
else
  (cd "$CLONE_GAME/x64" && exec env CX_BOTTLE="$CLONE" "$CX/wine" --cx-log "$CXLOG" --debugmsg "$DEBUGMSG" "$WIN_GAME"'\x64\Grim Dawn.exe') >>"$WINELOG" 2>&1 &
  if [ "${INTERACTIVE:-0}" = 1 ]; then
    sleep 8
    while pgrep -fi 'grim dawn.exe' >/dev/null; do sleep 2; done
  else
    sleep "$WATCH"
  fi
fi

# (7) summary block (appended)
{
  echo "--- round $ROUND summary (MODE=$MODE REG=$REG) ---"
  if [ "$DRY_RUN" = 1 ]; then
    echo "DRY: summary skipped"
  else
    ALIVE=$(pgrep -fi 'grim dawn.exe' >/dev/null && echo yes || echo no)
    echo "alive=$ALIVE runtime=$(( $(date +%s) - T0 ))s port=$PORT"
    echo "steam://run count in cxlog: $(grep -c 'steam://run' "$CXLOG" 2>/dev/null || true)"
    echo "helper FWD count: $(grep -c 'FWD' "$HELPER_LOG" 2>/dev/null || true)"
    echo "helper HELLO count: $(grep -c 'HELLO' "$HELPER_LOG" 2>/dev/null || true)"
    echo "first 60 FWD lines (sink: $HELPER_LOG):"
    grep 'FWD' "$HELPER_LOG" 2>/dev/null | head -60 || true
    echo "first MSGBOX cxlog line: $(grep -n 'MSGBOX' "$CXLOG" 2>/dev/null | head -1 | cut -d: -f1 || true)"
    echo "relay Call lines: $(grep -c 'Call ' "$CXLOG" 2>/dev/null || true)"
    if [ -n "$RELAY_INCLUDE" ]; then
      IFS=';' read -ra _RN <<<"$RELAY_INCLUDE"
      for _n in "${_RN[@]}"; do
        echo "relay Call $_n: $(grep 'Call ' "$CXLOG" 2>/dev/null | grep -c "${_n#*.}" || true)"
      done
    fi
    echo "cxlog ActiveProcess lines:"
    grep 'ActiveProcess' "$CXLOG" 2>/dev/null | head -40 || true
    echo "cxlog ActiveProcess value-name pid lines: $(grep 'ActiveProcess' "$CXLOG" 2>/dev/null | grep -ciw 'pid' || true)"
    echo "wine.log 'No implementation for steam_api64.dll' count: $(grep -c 'No implementation for steam_api64.dll' "$WINELOG" 2>/dev/null || true)"
    grep 'No implementation for steam_api64.dll' "$WINELOG" 2>/dev/null | head -20 || true
  fi
} | tee -a "$LOG"
