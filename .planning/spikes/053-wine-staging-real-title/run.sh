#!/bin/bash
# Spike 053: launch a REAL bridge-verified title through the shipped shim from a plain (non-CrossOver)
# prefix, then judge it with the census's own strict rules (meta/bridgeCensus.ts).
# Usage: ./run.sh <game: avernum6|crafter> <engine: staging|dxmt|staging-dxvk|cx>
#   staging/dxmt reuse spike 052's fresh `wineboot -i` prefixes; cx = APFS clone of the game's
#   real per-game bridge bottle (positive control). The real install and bottle are never written.
# Blocks until the game exits (the operator plays, then quits). 30 min alarm.
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"; R="$SPIKE/../../.."
BIN="$R/public/bin/arm64/darwin"; HELPER="$BIN/steam-bridge-helper"
BOTTLES="$HOME/Library/Application Support/CrossOver/Bottles"
CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
SW="$HOME/Library/Application Support/gamelib/tools/wine"
GAME="$1"; ENG="$2"; LABEL="$GAME-$ENG"
case "$GAME" in
  avernum6) APPID=206060; DIR="Avernum 6"; EXE="Avernum 6.exe"; SHIMREL="."; DLL=steam_api.dll ;;
  crafter)  APPID=1284190; DIR="The Planet Crafter"; EXE="Planet Crafter.exe"; SHIMREL="Planet Crafter_Data/Plugins/x86_64"; DLL=steam_api64.dll ;;
  *) echo "unknown game"; exit 2 ;;
esac
SRCBOTTLE="$BOTTLES/GameLibSteamBridge-$APPID"
SRC="$SRCBOTTLE/drive_c/Program Files (x86)/Steam/steamapps/common/$DIR"
mkdir -p logs state
ts() { perl -MTime::HiRes=time -MPOSIX=strftime -e '$t=time; printf "%s.%03dZ", strftime("%Y-%m-%dT%H:%M:%S", gmtime $t), ($t-int $t)*1000'; }
ev() { echo "$(ts) [$LABEL] $1" | tee -a logs/events.log; }

case "$ENG" in
  staging|dxmt|staging-dxvk)
    # staging-dxvk = 052's staging prefix + production's DXVK-macOS install (./install-dxvk.sh)
    PREFIX="$SPIKE/../052-plain-prefix-bridge-handshake/prefixes/$ENG"
    WBIN="$SW/Wine-Staging-macOS-latest$([ "$ENG" = dxmt ] && echo -DXMT)/Contents/Resources/wine/bin"
    [ -f "$PREFIX/system.reg" ] || { ev "missing prefix $PREFIX -- run 052 first"; exit 3; }
    GDIR="$PREFIX/drive_c/Program Files (x86)/Steam/steamapps/common/$DIR"
    python3 -I shadow.py "$SRC" "$GDIR" "$SHIMREL" >> logs/events.log
    # launcher.ts:1235 sets WINEMSYNC=1 for any -DXMT engine; plain staging gets wined3d (no DXVK here).
    MS=(); [ "$ENG" = dxmt ] && MS=( WINEMSYNC=1 )
    WINE=( env WINEPREFIX="$PREFIX" ${MS[@]+"${MS[@]}"} "$WBIN/wine" ); KILL=( env WINEPREFIX="$PREFIX" "$WBIN/wineserver" -k )
    USERS="$PREFIX/drive_c/users/$USER" ;;
  cx)
    CLONE="GameLibSpike053-$APPID"; PREFIX="$BOTTLES/$CLONE"
    [ -d "$PREFIX" ] || cp -cR "$SRCBOTTLE" "$PREFIX"
    GDIR="$PREFIX/drive_c/Program Files (x86)/Steam/steamapps/common/$DIR"
    WINE=( env CX_BOTTLE="$CLONE" "$CX/wine" ); KILL=( env WINEPREFIX="$PREFIX" "$CX/wineserver" -k )
    USERS="$PREFIX/drive_c/users/crossover" ;;
  *) echo "unknown engine"; exit 2 ;;
esac

# Current shipped shim, exactly as the launch-time shim refresh places it.
rm -f "$GDIR/$SHIMREL/$DLL"; cp "$BIN/$DLL" "$GDIR/$SHIMREL/$DLL"
# Fresh Player.log baseline so only this run's log is judged.
find "$USERS/AppData/LocalLow" -name Player.log -exec mv {} {}.pre053 \; 2>/dev/null

secret=$(openssl rand -hex 32)
( cd state && GAMELIB_BRIDGE_SECRET="$secret" exec "$HELPER" --appid "$APPID" --port 0 ) 2> "logs/$LABEL.helper.log" &
HP=$!; PORT=""
for _ in $(seq 1 100); do PORT=$(sed -nE 's/.*LISTEN 127\.0\.0\.1:([0-9]+) appid=.*/\1/p' "logs/$LABEL.helper.log" | head -1); [ -n "$PORT" ] && break; sleep 0.1; done
[ -n "$PORT" ] || { ev "helper never reported LISTEN"; kill $HP; exit 4; }
for d in "$GDIR" "$GDIR/$SHIMREL"; do
  rm -f "$d/gamelib_bridge.cfg"; (umask 077; printf 'port=%s\nappid=%s\nsecret=%s\n' "$PORT" "$APPID" "$secret" > "$d/gamelib_bridge.cfg")
done
ev "launch engine=$ENG port=$PORT shim=$(shasum "$GDIR/$SHIMREL/$DLL" | cut -c1-12) -- play briefly, then quit the game"
T0=$SECONDS
( cd "$GDIR" && WINEDEBUG=-all perl -e 'alarm shift; exec @ARGV' 1800 "${WINE[@]}" "C:\\Program Files (x86)\\Steam\\steamapps\\common\\$DIR\\$EXE" ) > "logs/$LABEL.wine.out" 2>&1
RC=$?
"${KILL[@]}" 2>/dev/null; kill $HP 2>/dev/null; wait $HP 2>/dev/null

PLOG=$(find "$USERS/AppData/LocalLow" -name Player.log 2>/dev/null | head -1)
[ -n "$PLOG" ] && cp "$PLOG" "logs/$LABEL.Player.log"
H="logs/$LABEL.helper.log"
hello=$(grep -c "HELLO  shim attached appid=$APPID" "$H"); calls=$(grep -cE '^\[[^]]*\]\s+CALL\s' "$H")
nover=$(grep -m1 -oE 'NOVER\s+.*' "$H"); ginit=$(grep -m1 -E '^\[[^]]*\] GINIT\s+.*ok=1 session=1' "$H")
verdict=unverified; detail=""
if [ "$hello" -eq 0 ]; then detail="no HELLO"
elif [ "$GAME" = avernum6 ]; then [ -n "$ginit" ] && verdict=verified || detail="no GINIT ok=1 session=1"
elif [ -n "$nover" ]; then verdict=init-failed; detail="unserved $nover"
elif [ -z "$PLOG" ]; then detail="no Player.log"
elif m=$(grep -m1 -oE 'EntryPointNotFoundException:\s*(SteamAPI|SteamInternal)_\w+' "logs/$LABEL.Player.log"); then verdict=init-failed; detail="$m"
elif m=$(grep -m1 -iE '(SteamAPI[_.]Init(Ex)?)\s*(\(\))?.*(failed|returned false)' "logs/$LABEL.Player.log"); then verdict=init-failed; detail="$m"
else verdict=verified; fi
ev "exit rc=$RC after $((SECONDS-T0))s | HELLO=$hello CALL=$calls GINIT=${ginit:+yes} | Player.log=${PLOG:+yes} | VERDICT=$verdict ${detail}"
