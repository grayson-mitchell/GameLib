#!/bin/zsh
# Spike 042: run the MF probe in the throwaway bottle clone.
# Usage: run.sh <label> <32|64> [extra env assignments...]
# Writes logs/<label>-<bits>.out (probe stdout) and logs/<label>-<bits>.err (Wine/GStreamer stderr).
set -u
here=${0:A:h}
label=$1 bits=$2; shift 2
bottle=zz-spike042-wmv
bdir="$HOME/Library/Application Support/CrossOver/Bottles/$bottle"
wine=/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine
video='C:\Program Files (x86)\Steam\steamapps\common\Unclaimed World\Content\MainMenu\TauCetiMainMenu.wmv'

[[ -d $bdir ]] || { echo "clone $bottle missing" >&2; exit 2; }
cp "$here/mfprobe$bits.exe" "$bdir/drive_c/mfprobe$bits.exe"
mkdir -p "$here/logs"
env CX_DEBUGMSG="${CX_DEBUGMSG:-+mfplat,+gstreamer}" "$@" \
  "$wine" --bottle "$bottle" "C:\\mfprobe$bits.exe" "$video" \
  >"$here/logs/$label-$bits.out" 2>"$here/logs/$label-$bits.err"
rc=$?
echo "rc=$rc"
cat "$here/logs/$label-$bits.out"
