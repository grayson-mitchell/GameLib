#!/bin/bash
# Spike 055: can an EXISTING CrossOver bridge bottle be run by another engine (WINEPREFIX=<bottle>
# + Wine-Staging's wine), and does CrossOver still work on it afterwards? Operates only on an APFS
# clone of GameLibSteamBridge-206060 (Avernum 6). Sequence: snapshot -> staging (probe x86/x64 +
# real game until GINIT) -> snapshot -> crossover (same) -> snapshot. Self-verifying; the game
# window only flashes (killed once GINIT is logged, 45 s cap).
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"; R="$SPIKE/../../.."
BIN="$R/public/bin/arm64/darwin"; HELPER="$BIN/steam-bridge-helper"; PROBES="$SPIKE/../052-plain-prefix-bridge-handshake/out"
BOTTLES="$HOME/Library/Application Support/CrossOver/Bottles"; CLONE=GameLibSpike055; B="$BOTTLES/$CLONE"
CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
SW="$HOME/Library/Application Support/gamelib/tools/wine/Wine-Staging-macOS-latest/Contents/Resources/wine/bin"
GDIR="$B/drive_c/Program Files (x86)/Steam/steamapps/common/Avernum 6"
mkdir -p logs snapshots state
ts() { perl -MTime::HiRes=time -MPOSIX=strftime -e '$t=time; printf "%s.%03dZ", strftime("%Y-%m-%dT%H:%M:%S", gmtime $t), ($t-int $t)*1000'; }
ev() { echo "$(ts) [$1] $2" | tee -a logs/events.log; }

snapshot() { # <label>
  local o="snapshots/$1.txt"
  {
    echo "update-timestamp: $(cat "$B/.update-timestamp" 2>/dev/null || echo MISSING)"
    echo "cxbottle.conf sha: $(shasum "$B/cxbottle.conf" 2>/dev/null | cut -c1-12)"
    for r in system.reg user.reg userdef.reg; do echo "$r: $(shasum "$B/$r" | cut -c1-12) lines=$(wc -l < "$B/$r" | tr -d ' ') $(grep -m1 '#arch' "$B/$r")"; done
    echo "system32 files: $(ls "$B/drive_c/windows/system32" | wc -l | tr -d ' ')  syswow64 files: $(ls "$B/drive_c/windows/syswow64" | wc -l | tr -d ' ')"
    echo "dosdevices: $(ls -l "$B/dosdevices" | awk 'NR>1{print $9"->"$11}' | tr '\n' ' ')"
    echo "users: $(ls "$B/drive_c/users" | tr '\n' ' ')"
    echo "windows version (HKLM CurrentVersion): $(grep -A12 '^\[Software\\\\Microsoft\\\\Windows NT\\\\CurrentVersion\]' "$B/system.reg" | grep -E '"(ProductName|CurrentBuild)"' | tr '\n' ' ')"
  } > "$o"
  find "$B/drive_c/windows/system32" "$B/drive_c/windows/syswow64" -type f -exec shasum {} + 2>/dev/null | sed "s|$B/||" | sort -k2 > "snapshots/$1.dllhashes"
  ev "$1" "snapshot -> $o"
}

with_helper() { # <label> <appid> <cmd...>: start helper, write cfg beside $CFGDIR, run cmd
  local label="$1" appid="$2"; shift 2
  local secret; secret=$(openssl rand -hex 32)
  ( cd state && GAMELIB_BRIDGE_SECRET="$secret" exec "$HELPER" --appid "$appid" --port 0 ) 2> "logs/$label.helper.log" &
  HP=$!; local port=""
  for _ in $(seq 1 100); do port=$(sed -nE 's/.*LISTEN 127\.0\.0\.1:([0-9]+) appid=.*/\1/p' "logs/$label.helper.log" | head -1); [ -n "$port" ] && break; sleep 0.1; done
  (umask 077; printf 'port=%s\nappid=%s\nsecret=%s\n' "$port" "$appid" "$secret" > "$CFGDIR/gamelib_bridge.cfg")
  "$@"
}

phase() { # <engine label> ; uses WINE / KILL arrays
  local eng="$1" t0=$SECONDS
  # (a) probes, appid 480
  CFGDIR="$B/drive_c/spike055"; mkdir -p "$CFGDIR"
  for a in 32 64; do
    local dll=steam_api.dll; [ "$a" = 64 ] && dll=steam_api64.dll
    rm -f "$CFGDIR/probe.txt"; cp "$PROBES/probe$a.exe" "$CFGDIR/"; cp "$BIN/$dll" "$CFGDIR/"
    t0=$SECONDS
    with_helper "$eng-probe$a" 480 bash -c 'cd "$1" && shift && perl -e "alarm 120; exec @ARGV" "$@"' _ "$CFGDIR" "${WINE[@]}" "C:\\spike055\\probe$a.exe" > "logs/$eng-probe$a.wine.out" 2>&1
    "${KILL[@]}" 2>/dev/null; kill $HP 2>/dev/null; wait $HP 2>/dev/null
    ev "$eng" "probe$a ($((SECONDS-t0))s): $(tr '\n' ' ' < "$CFGDIR/probe.txt" 2>/dev/null || echo NO_OUTPUT) | $(grep -c HELLO "logs/$eng-probe$a.helper.log") HELLO"
  done
  # (b) real game, killed once GINIT is logged
  CFGDIR="$GDIR"; cp "$BIN/steam_api.dll" "$GDIR/steam_api.dll"; t0=$SECONDS
  with_helper "$eng-avernum6" 206060 true
  ( cd "$GDIR" && "${WINE[@]}" "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Avernum 6\\Avernum 6.exe" > "$SPIKE/logs/$eng-avernum6.wine.out" 2>&1 ) &
  local gp=$!
  for _ in $(seq 1 450); do grep -q "GINIT" "logs/$eng-avernum6.helper.log" && break; kill -0 $gp 2>/dev/null || break; sleep 0.1; done
  sleep 3; local alive=$(kill -0 $gp 2>/dev/null && echo running || echo exited)
  "${KILL[@]}" 2>/dev/null; wait $gp 2>/dev/null; kill $HP 2>/dev/null; wait $HP 2>/dev/null
  ev "$eng" "avernum6 ($((SECONDS-t0))s, game $alive 3s after GINIT): $(grep -aoE '(HELLO|GINIT)[^\n]*' "logs/$eng-avernum6.helper.log" | tr '\n' ';')"
}

[ -d "$B" ] || { cp -cR "$BOTTLES/GameLibSteamBridge-206060" "$B"; ev setup "cloned GameLibSteamBridge-206060 -> $CLONE"; }
snapshot 0-cx-original
WINE=( env WINEPREFIX="$B" WINEDEBUG=-all "$SW/wine" ); KILL=( env WINEPREFIX="$B" "$SW/wineserver" -k )
phase staging; env WINEPREFIX="$B" "$SW/wineserver" -w; snapshot 1-after-staging
WINE=( env CX_BOTTLE="$CLONE" "$CX/wine" ); KILL=( env WINEPREFIX="$B" "$CX/wineserver" -k )
phase cx; env WINEPREFIX="$B" "$CX/wineserver" -w; snapshot 2-after-cx-return
