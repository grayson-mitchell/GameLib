#!/bin/sh
# Spike 044: put Grim Dawn (219990) and XCOM EW (200510) into the native Mac Steam
# library as Windows installs, forced onto a NotProton compat tool.
#
#   ./stage.sh <compat-tool-name>     e.g. the name under compatibilitytools.d
#   ./stage.sh --undo                 remove the clones, ACFs and restore config.vdf
#
# Game folders are APFS clones (cp -c) of GameLib's bottle installs, so this costs no
# disk. The Grim Dawn clone gets the game's ORIGINAL steam_api dlls back (from the
# .gamelib-orig backups) and loses GameLib's forwarder steamclient64.dll and
# gamelib_bridge.cfg, so nothing of GameLib's bridge is in the path under test.
# The bottle installs themselves are never touched.
set -eu

STEAM="$HOME/Library/Application Support/Steam"
APPS="$STEAM/steamapps"
CFG="$STEAM/config/config.vdf"
BK="$HOME/.gamelib-spike044-backup"
BOTTLES="$HOME/Library/Application Support/CrossOver/Bottles"
GD_SRC="$BOTTLES/GameLibSteamBridge-219990/drive_c/Program Files (x86)/Steam/steamapps"
XC_SRC="$BOTTLES/GameLibSteam/drive_c/Program Files (x86)/Steam/steamapps"

if pgrep -x steam_osx >/dev/null; then
	echo "==> Steam is running; quit it first" >&2
	exit 1
fi

if [ "${1:-}" = "--undo" ]; then
	rm -rf "$APPS/common/Grim Dawn" "$APPS/common/XCom-Enemy-Unknown"
	rm -f "$APPS/appmanifest_219990.acf" "$APPS/appmanifest_200510.acf"
	[ -f "$BK/config.vdf.before" ] && cp -p "$BK/config.vdf.before" "$CFG"
	echo "==> undone"
	exit 0
fi

tool="${1:?usage: stage.sh <compat-tool-name> | --undo}"

clone() { # <src steamapps> <installdir> <appid>
	if [ ! -d "$APPS/common/$2" ]; then
		echo "==> cloning $2"
		cp -c -R "$1/common/$2" "$APPS/common/$2"
	fi
	python3 -I - "$1/appmanifest_$3.acf" "$APPS/appmanifest_$3.acf" <<'EOF'
import sys
src, dst = sys.argv[1:]
text = open(src, encoding="utf-8").read()
# Linux Steam writes this pair when Proton is forced on a game that also has a
# native build; it keeps Steam on the Windows depots.
override = ('\t"UserConfig"\n\t{\n\t\t"platform_override_dest"\t\t"macos"\n'
            '\t\t"platform_override_source"\t\t"windows"\n\t}\n')
if '"platform_override_source"' not in text:
    if '\t"UserConfig"\n\t{\n' in text:
        text = text.replace('\t"UserConfig"\n\t{\n', override[:-3], 1)
    else:
        text = text.rstrip().rstrip("}") + override + "}\n"
open(dst, "w", encoding="utf-8").write(text)
EOF
}

clone "$GD_SRC" "Grim Dawn" 219990
clone "$XC_SRC" "XCom-Enemy-Unknown" 200510

gd="$APPS/common/Grim Dawn"
for orig in "$gd/steam_api.dll.gamelib-orig" "$gd/compat/steam_api64.dll.gamelib-orig" "$gd/x64/steam_api64.dll.gamelib-orig"; do
	[ -f "$orig" ] && mv -f "$orig" "${orig%.gamelib-orig}"
done
rm -f "$gd/x64/steamclient64.dll" "$gd/gamelib_bridge.cfg" "$gd/compat/gamelib_bridge.cfg" "$gd/x64/gamelib_bridge.cfg"

python3 -I - "$CFG" "$tool" <<'EOF'
import re, sys
path, tool = sys.argv[1:]
text = open(path, encoding="utf-8").read()
if '"CompatToolMapping"' in text:
    sys.exit("CompatToolMapping already present; edit by hand")
entry = lambda app: ('\t\t\t\t\t"%s"\n\t\t\t\t\t{\n\t\t\t\t\t\t"name"\t\t"%s"\n'
                     '\t\t\t\t\t\t"config"\t\t""\n\t\t\t\t\t\t"priority"\t\t"250"\n\t\t\t\t\t}\n') % (app, tool)
block = '\t\t\t\t"CompatToolMapping"\n\t\t\t\t{\n' + entry("219990") + entry("200510") + '\t\t\t\t}\n'
m = re.search(r'\n\t\t\t"Steam"\n\t\t\t\{\n', text)
if not m:
    sys.exit("no Software/Valve/Steam section found")
text = text[:m.end()] + block + text[m.end():]
open(path, "w", encoding="utf-8").write(text)
EOF

echo "==> staged; verify:"
ls "$APPS" | grep -E "219990|200510"
grep -n -A 3 '"219990"\|"200510"' "$CFG" | head -12
ls "$gd"/steam_api.dll "$gd"/x64/steam_api64.dll
