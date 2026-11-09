#!/bin/bash
# Spike 041: launch Grim Dawn in GameLibSpike041 with GameLib's real bridge helper, as GameLib's bridge launch does.
# usage: ARM=forwarder|genuine WATCH=45 ./run.sh <label>
set -uo pipefail
cd "$(dirname "$0")"; SPIKE="$PWD"; R="$SPIKE/../../.."; LABEL="$1"
BOTTLE=GameLibSpike041; CX="/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin"
PFX="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE"; G="$PFX/drive_c/Program Files (x86)/Steam/steamapps/common/Grim Dawn"
EXE='C:\Program Files (x86)\Steam\steamapps\common\Grim Dawn\x64\Grim Dawn.exe'
[ -d "$PFX" ] || { echo "run setup.sh first"; exit 1; }
pgrep -fi 'steam\.exe|steamwebhelper\.exe' >/dev/null && { echo "a Windows Steam process is running: refusing"; exit 1; }
WINEPREFIX="$PFX" "$CX/wineserver" -k 2>/dev/null; sleep 1
case "${ARM:?ARM=forwarder|genuine}" in
  forwarder) python3 -I setreg.py 'C:\Program Files (x86)\Steam\steamapps\common\Grim Dawn\x64\steamclient64.dll' ;;
  genuine)   python3 -I setreg.py 'C:\spike041\steamclient64.dll' ;;
  *) echo "bad ARM"; exit 1 ;;
esac
RELAY='user32.MessageBoxA;user32.MessageBoxW;kernel32.CreateProcessA;kernel32.CreateProcessW;kernelbase.CreateProcessW;shell32.ShellExecuteW;shell32.ShellExecuteExW;kernel32.GetProcAddress;kernelbase.GetProcAddress;kernel32.CreateFileW;kernelbase.CreateFileW;kernel32.ReadFile;kernelbase.ReadFile;kernel32.OpenFileMappingA;kernelbase.OpenFileMappingW;kernel32.OpenEventA;kernelbase.OpenEventW;kernel32.OpenMutexA;kernelbase.OpenMutexW;kernel32.OpenProcess;kernelbase.OpenProcess;advapi32.RegQueryValueExA;kernelbase.RegQueryValueExA;advapi32.RegQueryValueExW;kernelbase.RegQueryValueExW'
CX_BOTTLE="$BOTTLE" "$CX/wine" reg add 'HKCU\Software\Wine\Debug' /v RelayInclude /t REG_SZ /d "$RELAY" /f >/dev/null 2>&1
WINEPREFIX="$PFX" "$CX/wineserver" -w 2>/dev/null
"$R/public/bin/arm64/darwin/steam-bridge-helper" --appid 219990 --port 0 > "logs/$LABEL.helper.log" 2>&1 &
HP=$!
cleanup(){ kill $HP 2>/dev/null; WINEPREFIX="$PFX" "$CX/wineserver" -k 2>/dev/null; }
trap cleanup EXIT
for i in $(seq 50); do PORT=$(grep -oE 'LISTEN 127\.0\.0\.1:[0-9]+' "logs/$LABEL.helper.log" | head -1 | cut -d: -f2); [ -n "$PORT" ] && break; sleep 0.2; done
[ -n "${PORT:-}" ] || { echo "helper never listened"; exit 1; }
printf 'port=%s\nappid=219990\n' "$PORT" | tee "$G/gamelib_bridge.cfg" > "$G/x64/gamelib_bridge.cfg"
( cd "$G/x64" && exec env CX_BOTTLE="$BOTTLE" "$CX/wine" --cx-log "$SPIKE/logs/$LABEL.cxlog" --debugmsg +process,+reg,+loaddll,+seh,+relay "$EXE" > "$SPIKE/logs/$LABEL.wine.log" 2>&1 ) &
T0=$(date +%s)
if [ "${INTERACTIVE:-0}" = 1 ]; then sleep 8; while pgrep -fi 'grim dawn.exe' >/dev/null; do sleep 2; done; else sleep "${WATCH:-45}"; fi
echo "[$LABEL] arm=$ARM port=$PORT ran $(( $(date +%s) - T0 ))s alive=$(pgrep -fi 'grim dawn.exe' >/dev/null && echo yes || echo no) win-steam=$(pgrep -fi 'steam\.exe' >/dev/null && echo YES || echo no)"
grep -E 'HELLO|FWD|ERROR|INIT' "logs/$LABEL.helper.log" | head -8 | sed 's/^/   helper: /'
