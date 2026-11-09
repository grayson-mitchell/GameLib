#!/usr/bin/env bash
# usage: run-variants.sh N variant [variant...]
# Inherits the session env (XDG_RUNTIME_DIR/DBUS/DISPLAY: env -i made WebKit abort with EGL_NOT_INITIALIZED)
# and overrides only the eight profile variables. One fresh fake profile per attempt (two-profile rule, isolated arm). DISPLAY/XAUTHORITY are inherited
# because X needs them and XAUTHORITY lives outside $HOME here. Results: results/<variant>-<i>.json
set -u
# EGL_NOT_INITIALIZED abort on this machine today (also without any fake HOME, sandbox on or off): documented constant across ALL variants
export WEBKIT_DISABLE_DMABUF_RENDERER=1
N=$1; shift
HERE=$(cd "$(dirname "$0")" && pwd)
BIN=${CARGO_TARGET_DIR:-/home/graysonmitchell/GameLib/src-tauri/target}/debug/spike-029-linux-embed-allocation
mkdir -p "$HERE/results"
for v in "$@"; do
  for i in $(seq 1 "$N"); do
    P=$(mktemp -d); chmod 700 "$P"
    OUT="$HERE/results/$v-$i.json"; rm -f "$OUT"
    env HOME="$P" USERPROFILE="$P" APPDATA="$P/a" LOCALAPPDATA="$P/l" XDG_CONFIG_HOME="$P/c" XDG_STATE_HOME="$P/s" XDG_DATA_HOME="$P/d" XDG_CACHE_HOME="$P/k" \
      SPIKE_029_VARIANT="$v" SPIKE_029_OUT="$OUT" SPIKE_LOG="$P/run.log" \
      timeout 60 "$BIN" >"$P/stdout.log" 2>&1
    rc=$?
    verdict=$( [ -f "$OUT" ] && python3 -c "import json,sys;print(json.load(open('$OUT'))['verdict'])" || echo "NO_RESULT(rc=$rc)")
    echo "$v #$i $verdict"
    pkill -f WebKitNetworkProcess 2>/dev/null; pkill -f WebKitWebProcess 2>/dev/null
    if [ "${verdict#NO_RESULT}" != "$verdict" ]; then tail -5 "$P/stdout.log"; fi
    rm -rf "$P"
  done
done
