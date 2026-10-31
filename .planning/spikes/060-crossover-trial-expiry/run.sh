#!/bin/bash
# Spike 060: what does an EXPIRED CrossOver trial do to the calls GameLib makes?
# CrossOver is made unlicensed by sandbox-exec denying reads of ~/Library/Preferences/
# com.codeweavers.CrossOver.license (+ /Library/Preferences); a fake HOME alone does NOT hide it. The trial clock is
# per bottle: registry Software\CodeWeavers\CrossOver\cxoffice InstallTime/NagTime. A clone of a
# real bridge bottle is placed INSIDE the fake home; the real licence and bottles are only read.
# Usage: ./run.sh status | backdate <0xHEX|sub:SECONDS> | launch | create
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"
CX=/Applications/CrossOver.app/Contents/SharedSupport/CrossOver
FAKE="$SPIKE/state/home"; BOT="$FAKE/Library/Application Support/CrossOver/Bottles"; NAME=SpikeTrial060
REAL="$HOME/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-206060"
PROBE="$SPIKE/../056-plain-prefix-bridge-handshake/out/probe32.exe"
mkdir -p logs
ts() { perl -MTime::HiRes=time -MPOSIX=strftime -e '$t=time; printf "%s.%03dZ", strftime("%Y-%m-%dT%H:%M:%S", gmtime $t), ($t-int $t)*1000'; }
ev() { echo "$(ts) [$1] $2" | tee -a logs/events.log; }
if [ ! -d "$BOT/$NAME" ]; then
  mkdir -p "$BOT"; chmod 700 "$FAKE"; cp -cR "$REAL" "$BOT/$NAME"; ev setup "fake HOME $FAKE; cloned GameLibSteamBridge-206060 -> $NAME"
fi
cx() { # run a CrossOver command as the fake user, 90 s cap; prints rc + elapsed
  local t0; t0=$(perl -MTime::HiRes=time -e 'print time')
  # Licence hidden by sandbox (nolicence.sb denies reads of com.codeweavers.CrossOver.license*); HOME alone does not
  # hide it -- winewrapper resolves the home dir via getpwuid. The bottle still lives in the fake HOME.
  env HOME="$FAKE" CX_BOTTLE="$NAME" sandbox-exec -f "$SPIKE/nolicence.sb" perl -e 'alarm 90; exec @ARGV' "$@" > "logs/last.out" 2>&1; local rc=$?
  RC=$rc; EL=$(perl -MTime::HiRes=time -e "printf '%.1f', time-$t0")
}
trialkey() { grep -A4 -i 'CodeWeavers\\\\CrossOver\\\\cxoffice' "$BOT/$NAME/user.reg" "$BOT/$NAME/system.reg" 2>/dev/null | grep -iE 'cxoffice|InstallTime|NagTime' | sed "s|$BOT/$NAME/||"; }
case "${1:-status}" in
  status)
    cx "$CX/bin/wine" --demo-status
    ev status "rc=$RC ${EL}s: $(grep -vE '^\s*$|mvk|fixme' logs/last.out | tr '\n' ' ' | cut -c1-200)"
    ev status "trial key: $(trialkey | tr '\n' ' ')" ;;
  backdate) # shift InstallTime (and NagTime) back N days, wineserver stopped first
    env WINEPREFIX="$BOT/$NAME" "$CX/bin/wineserver" -k 2>/dev/null; sleep 1
    python3 -I "$SPIKE/backdate.py" "$BOT/$NAME" "${2:?value: 0xHEX or sub:<seconds>}" | tee -a logs/events.log ;;
  launch) # the GameLib launch shape: bin/wine + CX_BOTTLE + a Windows exe
    mkdir -p "$BOT/$NAME/drive_c/spike060"; cp "$PROBE" "$BOT/$NAME/drive_c/spike060/"
    cx "$CX/bin/wine" 'C:\spike060\probe32.exe'
    ev launch "rc=$RC ${EL}s probe.txt=$(tr '\n' ' ' < "$BOT/$NAME/drive_c/spike060/probe.txt" 2>/dev/null || echo NONE) | out: $(grep -vE '^\s*$|mvk|fixme' logs/last.out | tr '\n' ' ' | cut -c1-300)"
    env WINEPREFIX="$BOT/$NAME" "$CX/bin/wineserver" -k 2>/dev/null ;;
  create) # the GameLib provisioning shape: cxbottle --create
    cx "$CX/bin/cxbottle" --create --bottle SpikeTrial060new --template win10_64
    ev create "rc=$RC ${EL}s cxbottle.conf=$([ -f "$BOT/SpikeTrial060new/cxbottle.conf" ] && echo yes || echo no) | $(grep -vE '^\s*$|mvk|fixme' logs/last.out | tail -3 | tr '\n' ' ' | cut -c1-200)" ;;
esac
