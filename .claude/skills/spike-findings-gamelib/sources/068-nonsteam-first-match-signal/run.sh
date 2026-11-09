#!/bin/bash
# Spike 068: what does `ps` show for a Windows game CrossOver launched from a macOS (Z:) path,
# and what bottle names does `cxbottle --create` accept?
# Isolation (two-profile rule): fake HOME under state/home holds an APFS clone of a real bottle.
# Real-profile arm: CrossOver's licence read (spike 060: HOME cannot hide it); real bottles are only cloned.
# Only ps lines matching the game are logged; the full ps listing is never written to disk.
# Usage: ./run.sh shapes | names | watch <seconds>   (watch needs env MATCH=<install dir substring>)
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"
CX=/Applications/CrossOver.app/Contents/SharedSupport/CrossOver
FAKE="$SPIKE/state/home"; BOT="$FAKE/Library/Application Support/CrossOver/Bottles"; NAME=Spike068
REAL="$HOME/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-206060"
GAMEDIR="$SPIKE/state/Games/Some Game"
mkdir -p logs
ts() { perl -MTime::HiRes=time -MPOSIX=strftime -e '$t=time; printf "%s.%03dZ", strftime("%Y-%m-%dT%H:%M:%S", gmtime $t), ($t-int $t)*1000'; }
redact() { sed "s|$HOME|~|g"; }
ev() { echo "$(ts) [$1] $2" | redact | tee -a logs/events.log; }
cleanup() { env HOME="$FAKE" WINEPREFIX="$BOT/$NAME" "$CX/bin/wineserver" -k 2>/dev/null; pkill -f "alarm 45; exec" 2>/dev/null; true; }
trap cleanup EXIT
if [ ! -d "$BOT/$NAME" ] && [ "${1:-}" = shapes ]; then
  mkdir -p "$BOT"; chmod 700 "$FAKE"; cp -cR "$REAL" "$BOT/$NAME"; ev setup "fake HOME; cloned GameLibSteamBridge-206060 -> $NAME"
fi
# sample ps for $1 seconds, log only lines containing pattern $2 (fixed string, any of several via |)
sample() { # dur label pattern(s) separated by |
  local end=$(( $(date +%s) + $1 )) seen=""
  while [ "$(date +%s)" -lt "$end" ]; do
    ps -axo pid=,command= | grep -F -e "${3%%|*}" -e "${3##*|}" 2>/dev/null | grep -v -e grep -e run.sh > "$SPIKE/state/.sample"
    while IFS= read -r l; do
      case "$seen" in *"|$l|"*) ;; *) seen="$seen|$l|"; ev "$2" "ps: $l";; esac
    done < "$SPIKE/state/.sample"
    sleep 0.5
  done
}
case "${1:-}" in
  shapes)
    GP="$GAMEDIR/Game.exe"; ZP="Z:${GP//\//\\}"
    run_shape() { # label, dir, argv...
      local label="$1" dir="$2"; shift 2
      rm -f "$GAMEDIR/sleeper.txt"
      ( cd "$dir" && env HOME="$FAKE" CX_BOTTLE="$NAME" perl -e 'alarm 45; exec @ARGV' "$@" >"$SPIKE/state/last.out" 2>&1 ) &
      sample 20 "shapes-$label" "Game.exe|Some Game"
      ev "shapes-$label" "sleeper.txt (Windows-side command line): $(cat "$GAMEDIR/sleeper.txt" 2>/dev/null | tr -d '\r' || echo NONE)"
      cleanup; sleep 2
    }
    run_shape S1 "$SPIKE" "$CX/bin/wine" "$GP"
    run_shape S2 "$SPIKE" "$CX/bin/wine" "$ZP"
    run_shape S3 "$GAMEDIR" "$CX/bin/wine" start /unix "$GP"
    run_shape S4 "$GAMEDIR" "$CX/bin/wine" Game.exe ;;
  names)
    L64=GameLib-sideload-$(printf 'a%.0s' $(seq 1 47)); L120=GameLib-sideload-$(printf 'b%.0s' $(seq 1 103))
    for n in GameLib-legendary-0123456789abcdef0123456789abcdef GameLib-nile-amzn1.adg.product.0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0 GameLib-sideload-My_20Game_21 "$L64" "$L120"; do
      mkdir -p "$BOT"; t0=$(perl -MTime::HiRes=time -e 'print time')
      env HOME="$FAKE" perl -e 'alarm 120; exec @ARGV' "$CX/bin/cxbottle" --create --bottle "$n" --template win10_64 >state/last.out 2>&1; rc=$?
      el=$(perl -MTime::HiRes=time -e "printf '%.1f', time-$t0")
      ev names "len=${#n} name=$n rc=$rc ${el}s cxbottle.conf=$([ -f "$BOT/$n/cxbottle.conf" ] && echo yes || echo no) | $(grep -vE '^\s*$|mvk|fixme' state/last.out | tail -2 | tr '\n' ' ' | cut -c1-160)"
      env HOME="$FAKE" WINEPREFIX="$BOT/$n" "$CX/bin/wineserver" -k 2>/dev/null; rm -rf "${BOT:?}/$n"
    done ;;
  watch)
    : "${MATCH:?set MATCH to an install dir substring}"
    sample "${2:-60}" watch "$MATCH" ;;
  *) echo "usage: $0 shapes|names|watch <s>"; exit 2 ;;
esac
