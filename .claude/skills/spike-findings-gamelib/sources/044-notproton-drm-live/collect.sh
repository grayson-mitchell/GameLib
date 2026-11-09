#!/bin/sh
# Spike 044: copy the logs of one NotProton launch into logs/<appid>-<label>/ and
# print the signals that decide the verdict.
#
#   ./collect.sh <appid> <label>
set -eu

here=$(cd "$(dirname "$0")" && pwd)
app="${1:?appid}"
label="${2:?label}"
STEAM="$HOME/Library/Application Support/Steam"
data="$STEAM/steamapps/compatdata/$app"
out="$here/logs/$app-$label"
mkdir -p "$out"

[ -f "$data/notproton-run.log" ] && cp "$data/notproton-run.log" "$out/"
wl="$HOME/Library/Application Support/notproton/launchers/$app/notproton-wine.log"
[ -f "$wl" ] && cp "$wl" "$out/notproton-wine.log"
tail -n 400 "$STEAM/logs/console_log.txt" > "$out/console_log.tail.txt" 2>/dev/null || true
tail -n 200 "$STEAM/logs/compat_log.txt" > "$out/compat_log.tail.txt" 2>/dev/null || true

w="$out/notproton-wine.log"
echo "== $app $label -> $out"
[ -f "$w" ] || { echo "no wine log found"; exit 0; }
echo "-- client DLLs loaded"
grep -iE "Loaded L\".*(steamclient|lsteamclient|steam_api)" "$w" | sed 's/^.*Loaded/Loaded/' | sort -u | head -12
echo "-- Steam3Master / DIPC / ACK / CEG"
grep -iE "Steam3Master|DIPC|START_ACK|STEAMSTART|steam_drm_thread|Got event" "$w" | head -10
echo "-- lsteamclient init"
grep -iE "Loaded host steamclient|unable to load native steamclient|steamclient_init" "$w" | head -5
echo "-- error dialogs / exits"
grep -iE "MessageBox|Application load error|Steam Error|exit_process|process .* exited|unhandled exception" "$w" | head -10
echo "-- line count $(wc -l < "$w")"
