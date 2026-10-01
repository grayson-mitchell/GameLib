#!/bin/bash
# usage: launch.sh LABEL  -> runs harness in foreground (call with run_in_background)
cd /home/graysonmitchell/GameLib
RAW=${GL_RAW:?set GL_RAW}
L=$1
rm -f $RAW/stop-$L
exec node meta/runTs.cjs --bundle --platform=node --target=node22 /home/graysonmitchell/GameLib/.planning/quick/260930-feh-desk-runnable-linux-embed-live-gate-e4b-/gate_live.ts --binary /home/graysonmitchell/GameLib/src-tauri/target/debug/gamelib-shell --evidence $RAW/ev --label $L --stop-file $RAW/stop-$L --max-seconds 1500
