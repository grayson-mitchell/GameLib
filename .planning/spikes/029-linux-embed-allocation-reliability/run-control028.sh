#!/usr/bin/env bash
# Control arm: spike 028's ORIGINAL Phase 9 path (SPIKE_AUTORUN + SPIKE_ONLY_028), same fake profile + env as run-variants.sh.
set -u
export WEBKIT_DISABLE_DMABUF_RENDERER=1
B=${CARGO_TARGET_DIR:-/home/graysonmitchell/GameLib/src-tauri/target}/debug/spike-029-linux-embed-allocation
for i in $(seq 1 "$1"); do
  P=$(mktemp -d); chmod 700 "$P"
  SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1 SPIKE_ONLY_028=1 HOME="$P" XDG_CONFIG_HOME="$P/c" XDG_STATE_HOME="$P/s" XDG_DATA_HOME="$P/d" XDG_CACHE_HOME="$P/k" SPIKE_LOG="$P/l" timeout 60 "$B" >/dev/null 2>&1
  python3 - "$P/l" "$i" <<'PY'
import json,sys
r={}
for l in open(sys.argv[1]):
    d=json.loads(l); m=d['message']
    if m.startswith('9b '): r['9b']=d['data']['children'][1]['allocationOwnParent']
    if m.startswith('9n '): r['9n_embed']=d['data']['webviews'][1]['boundsPhysical'][-40:]
print('control028 #'+sys.argv[2], r)
PY
  mkdir -p "$(dirname "$0")/results"; grep -E '"(gtklever|autorun)"' "$P/l" | grep -vE 'cookie|Set-Cookie' > "$(dirname "$0")/results/control028-$i.jsonl"
  mkdir -p "$(dirname "$0")/results"
  grep -E '"category":"(gtklever|autorun)"' "$P/l" > "$(dirname "$0")/results/control028-$i.jsonl"
  pkill -f WebKitNetworkProcess; pkill -f WebKitWebProcess
  rm -rf "$P"
done
