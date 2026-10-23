#!/bin/bash
# List the processes of a running patched Hoard launch, with full args and thread counts.
cd "$(dirname "$0")"
( WATCH=20 CX_DEBUGMSG="+loaddll" ./patch-test.sh psprobe > logs/psprobe.runner.txt 2>&1 & )
sleep 8
for p in $(ps -axo pid=,lstart= | awk '{print $1}'); do
  a=$(ps -o args= -p $p 2>/dev/null); case "$a" in *Hoard*|*wine*|*CrossOver*) ;; *) continue;; esac
  case "$a" in *patch-test*|*run.sh*|*ps-probe*|*zsh*|*bash*) continue;; esac
  echo "$p thr=$(ps -M -p $p 2>/dev/null | tail -n +2 | wc -l | tr -d ' ') cpu=$(ps -o %cpu= -p $p) $(echo "$a" | cut -c1-140)"
done
while pgrep -f patch-test.sh >/dev/null; do sleep 2; done; grep restored logs/psprobe.runner.txt
