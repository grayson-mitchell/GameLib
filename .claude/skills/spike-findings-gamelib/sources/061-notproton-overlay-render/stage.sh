#!/bin/sh
# Spike 061: put Grim Dawn (219990) back into native Mac Steam as a Windows install on a
# NotProton compat tool, exactly as 044 did, but Grim Dawn only.
#
#   ./stage.sh           clone + ACF (the CompatToolMapping 044 wrote is still in config.vdf)
#   ./stage.sh --undo    remove the clone and ACF; config.vdf is left as found
set -eu

STEAM="$HOME/Library/Application Support/Steam"
APPS="$STEAM/steamapps"
CFG="$STEAM/config/config.vdf"
BK="$HOME/.gamelib-spike061-backup"
SRC="$HOME/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-219990/drive_c/Program Files (x86)/Steam/steamapps"
gd="$APPS/common/Grim Dawn"

if pgrep -x steam_osx >/dev/null; then
	echo "==> Steam is running; quit it first" >&2
	exit 1
fi

if [ "${1:-}" = "--undo" ]; then
	rm -rf "$gd"
	rm -f "$APPS/appmanifest_219990.acf"
	echo "==> undone"
	exit 0
fi

mkdir -p "$BK"
[ -f "$BK/config.vdf.before" ] || cp -p "$CFG" "$BK/config.vdf.before"
grep -q '"219990"' "$CFG" || { echo "==> no CompatToolMapping for 219990; see 044 stage.sh" >&2; exit 1; }

[ -d "$gd" ] || { echo "==> cloning Grim Dawn"; cp -c -R "$SRC/common/Grim Dawn" "$gd"; }
python3 -I - "$SRC/appmanifest_219990.acf" "$APPS/appmanifest_219990.acf" <<'PY'
import sys
src, dst = sys.argv[1:]
text = open(src, encoding="utf-8").read()
override = ('\t"UserConfig"\n\t{\n\t\t"platform_override_dest"\t\t"macos"\n'
            '\t\t"platform_override_source"\t\t"windows"\n\t}\n')
if '"platform_override_source"' not in text:
    if '\t"UserConfig"\n\t{\n' in text:
        text = text.replace('\t"UserConfig"\n\t{\n', override[:-3], 1)
    else:
        text = text.rstrip().rstrip("}") + override + "}\n"
open(dst, "w", encoding="utf-8").write(text)
PY

for orig in "$gd/steam_api.dll.gamelib-orig" "$gd/compat/steam_api64.dll.gamelib-orig" "$gd/x64/steam_api64.dll.gamelib-orig"; do
	[ -f "$orig" ] && mv -f "$orig" "${orig%.gamelib-orig}"
done
rm -f "$gd/x64/steamclient64.dll" "$gd/gamelib_bridge.cfg" "$gd/compat/gamelib_bridge.cfg" "$gd/x64/gamelib_bridge.cfg"

echo "==> staged"
ls "$APPS" | grep 219990
ls "$gd"/compat/steam_api64.dll "$gd"/x64/steam_api64.dll
ls "$gd" | grep -i -E 'gamelib|steamclient' || echo "no GameLib files left in the clone"
