#!/bin/sh
# Spike 061: photograph the game window every 3 s and record overlay processes until the game exits.
#   ./watch.sh <label> <window-owner-substring>
here=$(cd "$(dirname "$0")" && pwd)
label="$1"; needle="$2"
out="$here/logs/$label"; mkdir -p "$out/shots"
log="$out/watch.log"
seen=0; n=0; end=$(( $(date +%s) + 1500 ))
while [ "$(date +%s)" -lt "$end" ]; do
	ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
	game=$(pgrep -if "$needle" | head -1)
	ovl=$(pgrep -lf 'MacOS/gameoverlayui' | tr '\n' ' ')
	if [ -n "$game" ]; then
		seen=1; n=$((n+1))
		shot=$(printf '%s/shots/%03d.png' "$out" "$n")
		echo "$ts game=$game gameoverlayui=[$ovl]" >> "$log"
		"$here/winshot" "$needle" "$shot" >> "$log" 2>&1
	elif [ "$seen" = 1 ]; then
		echo "$ts game gone, stopping" >> "$log"; break
	fi
	/bin/sleep 3
done
