#!/bin/bash
# Spike 034a: run glprobe.exe beside the spike shim in an APFS clone of a bridge bottle, once per cfg
# variant. Real bridge bottles are never touched. Results -> logs/034a-<case>.{probe,shimfix}.txt
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"
CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
BOTTLES="$HOME/Library/Application Support/CrossOver/Bottles"
SRC="GameLibSteamBridge-206060"; BOTTLE="GameLibSpike034"; PREFIX="$BOTTLES/$BOTTLE"
D="$PREFIX/drive_c/spike034"
[ -d "$PREFIX" ] || cp -cR "$BOTTLES/$SRC" "$PREFIX"
mkdir -p "$D" logs
cp out/glprobe.exe "$D/"

run_case() { # <label> <shim dll> <cfg contents or -NONE->
  local label="$1" dll="$2" cfg="$3"
  cp "$dll" "$D/steam_api.dll"
  rm -f "$D/glprobe.txt" "$D/gamelib_shimfix.log" "$D/gamelib_bridge.cfg"
  [ "$cfg" = "-NONE-" ] || printf '%s' "$cfg" > "$D/gamelib_bridge.cfg"
  ( cd "$D" && CX_BOTTLE="$BOTTLE" perl -e 'alarm shift; exec @ARGV' 60 "$CX/wine" 'C:\spike034\glprobe.exe' > "$SPIKE/logs/034a-$label.out" 2>&1 )
  local rc=$?
  WINEPREFIX="$PREFIX" "$CX/wineserver" -k 2>/dev/null
  cp "$D/glprobe.txt" "logs/034a-$label.probe.txt" 2>/dev/null || echo "result=NO_OUTPUT" > "logs/034a-$label.probe.txt"
  cp "$D/gamelib_shimfix.log" "logs/034a-$label.shimfix.txt" 2>/dev/null || echo "(no shimfix log)" > "logs/034a-$label.shimfix.txt"
  printf '%-22s rc=%-3s %s | %s\n' "$label" "$rc" \
    "$(grep -E '^(result|gl_version|create_context_tokens|total_tokens)=' "logs/034a-$label.probe.txt" | tr '\n' ' ')" \
    "$(grep -E 'attach:|hook|dropped|unknown' "logs/034a-$label.shimfix.txt" | tr '\n' ' ')"
}

BASE=$'port=50000\nappid=63000\n'
run_case A-no-cfg          out/steam_api.dll "-NONE-"
run_case B-cfg-no-fix      out/steam_api.dll "$BASE"
run_case C-glob            out/steam_api.dll "${BASE}fix.wgl.hideExtensions=WGL_ARB_create_context*"$'\n'
run_case D-exact           out/steam_api.dll "${BASE}fix.wgl.hideExtensions=WGL_ARB_create_context"$'\n'
run_case E-multi-spaces    out/steam_api.dll "${BASE}fix.wgl.hideExtensions= WGL_ARB_create_context_profile , WGL_EXT_swap_control "$'\r\n'
run_case F-unknown-fix     out/steam_api.dll "${BASE}fix.gl.nope=1"$'\n'
run_case G-shipped-shim    ../../../public/bin/arm64/darwin/steam_api.dll "${BASE}fix.wgl.hideExtensions=WGL_ARB_create_context*"$'\n'
