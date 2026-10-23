#!/bin/bash
# Launch Hoard (Reuben.exe) in its GameLib bridge bottle with extra env, watch N s, capture logs.
# usage: ./run.sh <label> [ENV=VAL ...]     (WATCH=secs, WINEDEBUG overridable)
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"
LABEL="$1"; shift
BOTTLE="GameLibSteamBridge-63000"; CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
DRIVE_C="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE/drive_c"
H="$DRIVE_C/Program Files (x86)/Steam/steamapps/common/Hoard"
EXE='C:\Program Files (x86)\Steam\steamapps\common\Hoard\win32\Reuben.exe'
WATCH="${WATCH:-15}"
mkdir -p logs; LOG="$SPIKE/logs/$LABEL.wine.log"
rm -f "$H/reubenGFX.log" "$H/reuben.log"
( cd "$H/win32" && exec env CX_BOTTLE="$BOTTLE" WINEDEBUG="${WINEDEBUG:-err+all,fixme-all}" "$@" "$CX/wine" "$EXE" > "$LOG" 2>&1 ) &
alive=0; for i in $(seq 1 "$WATCH"); do sleep 1; pgrep -f "Hoard.win32.Reuben.exe|Reuben.exe" >/dev/null && alive=$i; done
echo "[$LABEL] last-seen-alive t=${alive}s of ${WATCH}s"
WID=$(swift -e 'import CoreGraphics; let l = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String:Any]]; for w in l { if let o = w["kCGWindowOwnerName"] as? String, (o.lowercased().contains("reuben") || o.lowercased().contains("wine")), (w["kCGWindowLayer"] as? Int) == 0 { print(w["kCGWindowNumber"]!); break } }' 2>/dev/null)
[ -n "$WID" ] && screencapture -x -o -l"$WID" "logs/$LABEL.png" && echo "[$LABEL] screenshot logs/$LABEL.png (window $WID)"
cp "$H/reubenGFX.log" "logs/$LABEL.reubenGFX.log" 2>/dev/null; cp "$H/reuben.log" "logs/$LABEL.reuben.log" 2>/dev/null
echo "--- reubenGFX.log"; cat "logs/$LABEL.reubenGFX.log" 2>/dev/null; echo; echo "--- reuben.log (tail)"; tail -20 "logs/$LABEL.reuben.log" 2>/dev/null
echo "--- wine log (tail)"; tail -25 "$LOG"
pkill -f "Reuben.exe" 2>/dev/null; sleep 1
CX_BOTTLE="$BOTTLE" "$CX/wineserver" -k 2>/dev/null; true
