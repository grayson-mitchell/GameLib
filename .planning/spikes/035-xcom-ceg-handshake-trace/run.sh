#!/bin/bash
# Spike 035/036: launch XComEW.exe in GameLibSpikeXCOM with GameLib's real bridge helper (appid 200510).
# usage: WATCH=45 CXLOG=+reg,+sync [ENV_FILE=f] ./run.sh <label> [windows-exe-to-run-instead ...]
# Logs: logs/<label>.{helper,wine}.log. Always kills the helper + wineserver on exit.
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"; R="$SPIKE/../../.."
LABEL="$1"; shift
BOTTLE=GameLibSpikeXCOM; CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
DC="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE/drive_c"; W="$DC/XCOM/XEW/Binaries/Win32"
mkdir -p logs; rm -f "$W"/*.STEAMSTART
"$R/build/bin/arm64/darwin/steam-bridge-helper" --appid 200510 --port 0 > "logs/$LABEL.helper.log" 2>&1 &
HP=$!
cleanup(){ kill $HP 2>/dev/null; pkill -f 'XComEW.exe' 2>/dev/null; sleep 1; WINEPREFIX="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE" "$CX/wineserver" -k 2>/dev/null; }
trap cleanup EXIT
for i in $(seq 50); do PORT=$(grep -oE 'LISTEN 127\.0\.0\.1:[0-9]+' "logs/$LABEL.helper.log" | head -1 | cut -d: -f2); [ -n "$PORT" ] && break; sleep 0.2; done
[ -n "${PORT:-}" ] || { echo "helper never listened"; cat "logs/$LABEL.helper.log"; exit 1; }
printf 'port=%s\n' "$PORT" > "$W/gamelib_bridge.cfg"
ENVS=(); if [ -n "${ENV_FILE:-}" ]; then while IFS= read -r l; do [ -n "$l" ] && ENVS+=("$l"); done < "$ENV_FILE"; fi
if [ $# -gt 0 ]; then CMD=("$@"); else CMD=('C:\XCOM\XEW\Binaries\Win32\XComEW.exe'); fi
( cd "$W" && exec env CX_BOTTLE="$BOTTLE" WINEDEBUG="${DEBUG:--all}" ${EXTRA_ENV:-} ${ENVS[@]+"${ENVS[@]}"} "$CX/wine" ${CXLOG:+--cx-log "$SPIKE/logs/$LABEL.cxlog" --debugmsg "$CXLOG"} "${CMD[@]}" > "$SPIKE/logs/$LABEL.wine.log" 2>&1 ) &
T0=$(date +%s)
if [ "${INTERACTIVE:-0}" = 1 ]; then sleep 8; while pgrep -f 'XComEW.exe' >/dev/null; do sleep 2; done
else sleep "${WATCH:-45}"; fi
echo "[$LABEL] port=$PORT ran $(( $(date +%s) - T0 ))s alive=$(pgrep -f XComEW.exe >/dev/null && echo yes || echo no)"
ls "$W" | grep -i steamstart | sed 's/^/   steamstart file: /'
grep -E 'HELLO|INIT|LISTEN|ERROR|WARN' "logs/$LABEL.helper.log" | head -8 | sed 's/^/   helper: /'
