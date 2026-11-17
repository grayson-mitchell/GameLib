#!/bin/sh
# Spike 083 watcher. One `probe tick` per second across the operator's sign-in.
# Phase A (passive): after BLoggedOn flips to 1, watch <passive_s> for Steam to adopt by itself.
# Phase B (active): if not state 4 by then, fire InstallApp once and watch until state 4 holds 10 s.
# Mac Steam's content_log and connection_log are mirrored for the run.
#   ./watch.sh <run> [app=264160] [passive_s=90] [max_s=900]
set -u
RUN=$1; APP=${2:-264160}; PASSIVE=${3:-90}; MAX=${4:-900}
L="$HOME/Library/Application Support/Steam/logs"
D="runs/$RUN"; rm -rf "$D"; mkdir -p "$D"
CO=$(wc -c < "$L/content_log.txt" | tr -d ' '); NO=$(wc -c < "$L/connection_log.txt" | tr -d ' ')
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
start=$(date +%s); on_at=; fired=; four=0
while :; do
  now=$(date +%s); t=$(./probe tick "$APP" 2>&1 | tail -1)
  echo "$(ts) $t" | tee -a "$D/ticks.log"
  case $t in *'"loggedOn":1'*) [ -z "$on_at" ] && on_at=$now && echo "$(ts) EVENT signed-in observed" | tee -a "$D/ticks.log";; esac
  case $t in *'"state":4,'*) four=$((four + 1));; *) four=0;; esac
  if [ "$four" -ge 10 ]; then echo "$(ts) EVENT state 4 held 10s (fired=${fired:-no})" | tee -a "$D/ticks.log"; break; fi
  if [ -n "$on_at" ] && [ -z "$fired" ] && [ $((now - on_at)) -ge "$PASSIVE" ]; then
    fired=$now; echo "$(ts) EVENT passive window over, firing InstallApp: $(./probe install "$APP" | tail -1)" | tee -a "$D/ticks.log"
  fi
  [ $((now - start)) -ge "$MAX" ] && { echo "$(ts) EVENT max time reached" | tee -a "$D/ticks.log"; break; }
  sleep 1
done
tail -c +$((CO + 1)) "$L/content_log.txt" > "$D/content_log.txt"
tail -c +$((NO + 1)) "$L/connection_log.txt" > "$D/connection_log.txt"
