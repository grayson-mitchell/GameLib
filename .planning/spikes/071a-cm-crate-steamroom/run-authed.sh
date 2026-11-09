#!/bin/zsh
# Run a signed-in spike command inside the macOS go-offline wrap (STEAM-STACK.md, spikes 046a-c):
# gooffline -> wait for Mac Steam's user-initiated LogOff -> run -> goonline.
# Refuses to log on if the LogOff is not seen in 5 s, as GameLib does.
# usage: run-authed.sh <command...>
set -u
LOG="$HOME/Library/Application Support/Steam/logs/connection_log.txt"
start=$(stat -f %z "$LOG")
if pgrep -x steam_osx >/dev/null; then
  open -g "steam://open/gooffline"
  seen=0
  for i in {1..50}; do
    if tail -c +$((start+1)) "$LOG" | grep -q "user initiated logoff"; then seen=1; break; fi
    sleep 0.1
  done
  if [ $seen -ne 1 ]; then echo "wrap: LogOff not seen in 5s, refusing to log on" >&2; open -g "steam://open/goonline"; exit 3; fi
  echo "wrap: Mac Steam LogOff seen after ~$((i*100)) ms" >&2
  "$@"; rc=$?
  open -g "steam://open/goonline"
  echo "wrap: goonline sent" >&2
  exit $rc
else
  echo "wrap: Mac Steam not running, no wrap needed" >&2
  exec "$@"
fi
