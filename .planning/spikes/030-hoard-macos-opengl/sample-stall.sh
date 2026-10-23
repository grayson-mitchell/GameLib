#!/bin/bash
# Sample the running game's wine process during the splash stall (native stacks + CPU).
# Kept in a file so patch-test.sh's `pkill -f <exe>` cannot match this script's own command line.
cd "$(dirname "$0")"
N="Reu""ben"
( WATCH=45 CX_DEBUGMSG="+loaddll" ./patch-test.sh stall2 > logs/stall2.runner.txt 2>&1 & )
for t in 5 10 16 24 32; do
  sleep 5
  P=$(ps -axo pid=,args= | grep -F "win32\\$N.exe" | grep -v -e winewrapper -e grep | awk '{print $1; exit}')
  [ -z "$P" ] && { echo "t~${t}s no game process"; continue; }
  echo "t~${t}s pid=$P cpu=$(ps -o %cpu= -p $P) threads=$(ps -M -p $P | tail -n +2 | wc -l | tr -d " ")"
  sample "$P" 1 -file "logs/stall2.sample.$t.txt" >/dev/null 2>&1
done
while pgrep -f patch-test.sh >/dev/null; do sleep 2; done
grep -E "alive|restored" logs/stall2.runner.txt
