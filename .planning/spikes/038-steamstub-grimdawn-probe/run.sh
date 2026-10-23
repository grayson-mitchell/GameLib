#!/bin/bash
# Spike 038: launch Grim Dawn in GameLibSpikeGD with GameLib's real bridge helper (appid 219990), the way
# GameLib's bridge launch does. usage: [ARCH=x64|x86] [CXLOG=+process,+reg] [VIA=responder] [ENV_FILE=f] WATCH=30 ./run.sh <label>
# VIA=responder launches the game as a child of spike 036's dipc_responder.exe (registry/env setup + DIPC answer).
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"; R="$SPIKE/../../.."; LABEL="$1"; mkdir -p logs
BOTTLE=GameLibSpikeGD; CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
PFX="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE"; G="$PFX/drive_c/Program Files (x86)/Steam/steamapps/common/Grim Dawn"
WG='C:\Program Files (x86)\Steam\steamapps\common\Grim Dawn'
if [ "${ARCH:-x64}" = x64 ]; then GD="$G/x64"; EXE="$WG\\x64\\Grim Dawn.exe"; else GD="$G"; EXE="$WG\\Grim Dawn.exe"; fi
rm -f "$PFX/drive_c/dipc036.log" "$PFX/drive_c/steamclient037.log"
"$R/build/bin/arm64/darwin/steam-bridge-helper" --appid 219990 --port 0 > "logs/$LABEL.helper.log" 2>&1 &
HP=$!
cleanup(){ kill $HP 2>/dev/null; WINEPREFIX="$PFX" "$CX/wineserver" -k 2>/dev/null; }
trap cleanup EXIT
for i in $(seq 50); do PORT=$(grep -oE 'LISTEN 127\.0\.0\.1:[0-9]+' "logs/$LABEL.helper.log" | head -1 | cut -d: -f2); [ -n "$PORT" ] && break; sleep 0.2; done
[ -n "${PORT:-}" ] || { echo "helper never listened"; exit 1; }
printf 'port=%s\nappid=219990\n' "$PORT" | tee "$G/gamelib_bridge.cfg" > "$G/x64/gamelib_bridge.cfg"
ENVS=(); if [ -n "${ENV_FILE:-}" ]; then while IFS= read -r l; do [ -n "$l" ] && ENVS+=("$l"); done < "$ENV_FILE"; fi
CMD=("$EXE"); [ "${VIA:-}" = responder ] && CMD=('C:\dipc_responder.exe' "$EXE")
( cd "$GD" && exec env CX_BOTTLE="$BOTTLE" ${ENVS[@]+"${ENVS[@]}"} "$CX/wine" ${CXLOG:+--cx-log "$SPIKE/logs/$LABEL.cxlog" --debugmsg "$CXLOG"} "${CMD[@]}" > "$SPIKE/logs/$LABEL.wine.log" 2>&1 ) &
T0=$(date +%s)
if [ "${INTERACTIVE:-0}" = 1 ]; then sleep 8; while pgrep -fi 'grim dawn.exe' >/dev/null; do sleep 2; done; else sleep "${WATCH:-30}"; fi
echo "[$LABEL] arch=${ARCH:-x64} via=${VIA:-direct} port=$PORT ran $(( $(date +%s) - T0 ))s alive=$(pgrep -fi 'grim dawn.exe' >/dev/null && echo yes || echo no)"
grep -E 'HELLO|ERROR' "logs/$LABEL.helper.log" | head -5 | sed 's/^/   helper: /'
cp "$PFX/drive_c/dipc036.log" "logs/$LABEL.dipc.log" 2>/dev/null && grep -v '  [0-9a-f]\{4\}:\|saw STEAM\|entries' "logs/$LABEL.dipc.log" | sed 's/^/   dipc: /' | cut -c1-150
cp "$PFX/drive_c/steamclient037.log" "logs/$LABEL.steamclient.log" 2>/dev/null && sed 's/^/   client: /' "logs/$LABEL.steamclient.log" | head -40
