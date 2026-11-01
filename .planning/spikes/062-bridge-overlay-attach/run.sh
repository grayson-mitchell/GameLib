#!/bin/sh
# Spike 062: launch Schedule I Free Sample (3205720) the way GameLib's bridge does (bridge helper
# + steam_api shim over TCP, CrossOver bin/wine + CX_BOTTLE, DXVK known fix), but on an APFS
# clone of CrossOver whose loader is re-signed with allow-dyld-environment-variables, with Mac
# Steam's overlay renderer injected through CX_ENV, and with gameoverlayui started by us
# rather than by Steam.
#
#   ./run.sh <label> [overlayui=1|0] [shim=1|0]
#     overlayui=0  control: inject the renderer but never start gameoverlayui
#     shim=0       inject Steam's dylibs without NotProton's Metal overlay-shim
#
# Restores both gamelib_bridge.cfg copies on exit. Steam must be running and signed in;
# GameLib must not be running this game.
set -eu

label="${1:?label}"; want_ui="${2:-1}"; want_shim="${3:-1}"
here=$(cd "$(dirname "$0")" && pwd)
out="$here/logs/$label"; mkdir -p "$out/helper-state"
log="$out/run.log"
say() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$log"; }

APP=3205720
BOTTLE=GameLibSteamBridge-$APP
GAME="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE/drive_c/Program Files (x86)/Steam/steamapps/common/Schedule I Demo"
EXE="$GAME/Schedule I Free Sample.exe"
CFGS="$GAME/gamelib_bridge.cfg
$GAME/Schedule I Free Sample_Data/Plugins/x86_64/gamelib_bridge.cfg"
HELPER=/Users/graysonmitchell/Projects/GameLib/public/bin/arm64/darwin/steam-bridge-helper
CLONE=/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/55750ae4-af91-40ce-a494-abb2a9cf8a96/scratchpad/cx062/CrossOver
STOCK=/Applications/CrossOver.app/Contents/SharedSupport/CrossOver
SBIN="$HOME/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS"
SHIM="$HOME/Library/Application Support/notproton/overlay-shim.dylib"

steampid=$(pgrep -x steam_osx || true)
[ -n "$steampid" ] || { echo "Steam is not running" >&2; exit 1; }
pgrep -f "Schedule I Free Sample.exe" >/dev/null && { echo "game already running" >&2; exit 1; }
codesign -d --entitlements - "$CLONE/lib/wine/x86_64-unix/wine" 2>&1 | grep -q allow-dyld \
	|| { echo "clone loader lacks the dyld entitlement" >&2; exit 1; }

say "== spike 062 $label overlayui=$want_ui shim=$want_shim steampid=$steampid"
# The bottle's stock wineserver must not be the one the clone talks to (56-01).
CX_BOTTLE=$BOTTLE "$STOCK/bin/wineserver" -k 2>/dev/null || true
CX_BOTTLE=$BOTTLE "$STOCK/bin/wineserver" -w 2>/dev/null || true

# --- helper, exactly as helperProcess.ts spawns it
secret=$(openssl rand -hex 32)
echo $APP > "$out/helper-state/steam_appid.txt"
(cd "$out/helper-state" && GAMELIB_BRIDGE_SECRET=$secret exec "$HELPER" --appid $APP --port 0 \
	> "$out/helper.stdout" 2> "$out/helper.log") &
hpid=$!
port=""
for i in $(seq 1 50); do
	port=$(sed -nE 's/.*LISTEN 127\.0\.0\.1:([0-9]+) appid='$APP'.*/\1/p' "$out/helper.log" | head -1)
	[ -n "$port" ] && grep -q "READY" "$out/helper.log" && break
	/bin/sleep 0.2
done
[ -n "$port" ] || { say "helper never listened"; kill $hpid; exit 1; }
say "helper pid=$hpid port=$port"

# --- point both cfg copies at this helper; restore on exit
echo "$CFGS" | while IFS= read -r c; do cp -p "$c" "$c.spike062-bak"; done
restore() {
	echo "$CFGS" | while IFS= read -r c; do [ -f "$c.spike062-bak" ] && mv -f "$c.spike062-bak" "$c"; done
	[ -n "${uipid:-}" ] && kill "$uipid" 2>/dev/null || true
	kill "$hpid" 2>/dev/null || true
	say "restored cfgs, stopped helper"
}
trap restore EXIT INT TERM
echo "$CFGS" | while IFS= read -r c; do
	sed -i '' -E "s/^port=.*/port=$port/; s/^secret=.*/secret=$secret/" "$c"
done

# --- overlay injection through CX_ENV (plain DYLD_* would be dropped by the wrapper)
inserts="$SBIN/steamloader.dylib:$SBIN/gameoverlayrenderer.dylib"
cxenv="SteamOverlayGameId=$APP SteamGameId=$APP SteamAppId=$APP"
if [ "$want_shim" = 1 ]; then
	inserts="$SHIM:$inserts"
	cxenv="$cxenv NOTPROTON_OVERLAY_SHIM='$SHIM'"
fi
cxenv="DYLD_INSERT_LIBRARIES='$inserts' $cxenv"
say "CX_ENV=$cxenv"

cd "$GAME"
CX_BOTTLE=$BOTTLE CX_ENV="$cxenv" CX_GRAPHICS_BACKEND=dxvk \
	"$CLONE/bin/wine" "$EXE" > "$out/wine.log" 2>&1 &
wpid=$!
say "wine wrapper pid=$wpid"

# --- find the game's own process by its window, then start gameoverlayui for it
"$here/../061-notproton-overlay-render/watch.sh" "../../062-bridge-overlay-attach/logs/$label" "schedule i free" &
gpid=""
for i in $(seq 1 300); do
	g=$("$here/winshot" "schedule i free" - 2>/dev/null || true)
	case "$g" in (""|*[!0-9]*) ;; (*) gpid=$g; break ;; esac
	/bin/sleep 1
done
say "game window pid=${gpid:-none}"
ps -o pid,ppid,comm -p "${gpid:-1}" >> "$log" 2>&1 || true
vmmap "${gpid:-1}" 2>/dev/null | grep -E 'gameoverlayrenderer|steamloader|overlay-shim' | awk '{print $NF}' | sort -u >> "$log" || true

if [ -n "$gpid" ] && [ "$want_ui" = 1 ]; then
	"$SBIN/gameoverlayui" -pid "$gpid" -steampid "$steampid" -manuallyclearframes 0 -gameid $APP \
		> "$out/overlayui.log" 2>&1 &
	uipid=$!
	say "started gameoverlayui pid=$uipid for game pid=$gpid"
fi

say "waiting for the game to exit; press Shift+Tab in game, then quit it"
wait $wpid || true
say "wine wrapper exited"
for i in $(seq 1 30); do pgrep -f "Schedule I Free Sample.exe" >/dev/null || break; /bin/sleep 1; done
grep -h "overlay_shim\|GameOverlay\|gameoverlay" "$out/wine.log" | sort | uniq -c | sort -rn | head -30 >> "$log" || true
tail -n 300 "$HOME/Library/Application Support/Steam/logs/console_log.txt" > "$out/console_log.tail.txt" 2>/dev/null || true
