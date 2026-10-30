#!/bin/bash
# Spike 055b/c: does WINEUSERNAME=crossover (055b) or USER=crossover (055c, NAMEVAR=USER CLONE=GameLibSpike055c) make Wine-Staging reuse CrossOver's profile in an existing
# bottle instead of creating users/$USER? Fresh APFS clone; the probe writes %USERPROFILE% + %APPDATA%.
set -uo pipefail
cd "$(dirname "$0")"
BOTTLES="$HOME/Library/Application Support/CrossOver/Bottles"; CLONE=${CLONE:-GameLibSpike055b}; B="$BOTTLES/$CLONE"
SW="$HOME/Library/Application Support/gamelib/tools/wine/Wine-Staging-macOS-latest/Contents/Resources/wine/bin"
[ -d "$B" ] || cp -cR "$BOTTLES/GameLibSteamBridge-206060" "$B"
echo "before: users=$(ls "$B/drive_c/users" | tr '\n' ' ')"
WINEPREFIX="$B" ${NAMEVAR:-WINEUSERNAME}=crossover WINEDEBUG=-all perl -e 'alarm 120; exec @ARGV' "$SW/wine" cmd /c 'echo USERPROFILE=%USERPROFILE% & echo APPDATA=%APPDATA% & echo USERNAME=%USERNAME%' 2>/dev/null | tr -d '\r' | tee logs/${CLONE#GameLibSpike}-env.txt
WINEPREFIX="$B" "$SW/wineserver" -w
echo "after:  users=$(ls "$B/drive_c/users" | tr '\n' ' ')" | tee -a logs/${CLONE#GameLibSpike}-env.txt
