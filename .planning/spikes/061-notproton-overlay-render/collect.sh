#!/bin/sh
# Spike 061: copy one launch's logs into logs/<label>/ and print the overlay signals.
#   ./collect.sh <label>
set -eu
here=$(cd "$(dirname "$0")" && pwd)
label="${1:?label}"
STEAM="$HOME/Library/Application Support/Steam"
out="$here/logs/$label"
mkdir -p "$out"
wl="$HOME/Library/Application Support/notproton/launchers/219990/notproton-wine.log"
[ -f "$wl" ] && cp "$wl" "$out/notproton-wine.log"
[ -f "$STEAM/steamapps/compatdata/219990/notproton-run.log" ] && cp "$STEAM/steamapps/compatdata/219990/notproton-run.log" "$out/"
tail -n 400 "$STEAM/logs/console_log.txt" > "$out/console_log.tail.txt" 2>/dev/null || true
tail -n 200 "$STEAM/logs/compat_log.txt" > "$out/compat_log.tail.txt" 2>/dev/null || true
tail -n 60 "$HOME/Library/Application Support/notproton/notproton.log" > "$out/notproton.log.tail.txt" 2>/dev/null || true
echo "== $label -> $out"
echo "-- Steam overlay process"
grep -h "GameOverlay" "$out/console_log.tail.txt" | tail -5 || true
echo "-- shim lines for the game process"
grep -h "overlay_shim" "$out/notproton-wine.log" 2>/dev/null | sort | uniq -c | sort -rn | head -25 || true
