#!/bin/sh
# Spike 044 run 3: wait for XComGame.exe under NotProton, then run ack_watch.exe in the same
# prefix with NotProton's own wine + wineserver, so it shares the game's named-object namespace.
#
#   ./arm_ack.sh [label]      arm, then launch XCOM from Steam; the log lands in logs/200510-<label>/
set -eu

here=$(cd "$(dirname "$0")" && pwd)
label="${1:-run3}"
CX_ROOT="$HOME/Library/Application Support/notproton/runners/crossover-26.3.0.39832/CrossOver"
PFX="$HOME/Library/Application Support/Steam/steamapps/compatdata/200510/pfx"
out="$here/logs/200510-$label"
mkdir -p "$out"
rm -f "$PFX/drive_c/ack044.log"

WINESERVER="$CX_ROOT/bin/wineserver"
[ -x "$WINESERVER" ] || WINESERVER="$CX_ROOT/bin/wineserver-x86"

echo "==> armed; launch XCOM from Steam now (waiting up to 5 min)"
i=0
until pgrep -f 'XComGame\.exe' >/dev/null; do
	i=$((i + 1))
	[ "$i" -lt 1500 ] || { echo "==> XComGame.exe never appeared" >&2; exit 1; }
	sleep 0.2
done
echo "==> XComGame.exe up; starting ack_watch"

WINEPREFIX="$PFX" WINESERVER="$WINESERVER" WINELOADER="$CX_ROOT/lib/wine/x86_64-unix/wine" \
	CX_ROOT="$CX_ROOT" WINEMSYNC=0 WINEDEBUG=-all \
	"$CX_ROOT/lib/wine/x86_64-unix/wine" "$here/ack_watch.exe" 90 >"$out/ack_watch.stdout" 2>&1 || true

cp "$PFX/drive_c/ack044.log" "$out/ack044.log" 2>/dev/null && sed 's/^/   ack: /' "$out/ack044.log"
