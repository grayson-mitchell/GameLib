#!/bin/bash
# Spike 037: responder (036) + registered probe steamclient.dll + genuine-Steam launch env, launching
# XComEW.exe with the launcher's own args. usage: WATCH=60 ./run.sh <label> [extra NAME=VALUE ...]
set -uo pipefail
cd "$(dirname "$0")"; mkdir -p logs; LABEL="$1"; shift
DC="$HOME/Library/Application Support/CrossOver/Bottles/GameLibSpikeXCOM/drive_c"
rm -f "$DC/dipc036.log" "$DC/steamclient037.log"
ENVF=$(mktemp); trap 'rm -f "$ENVF"' EXIT          # holds identity values: temp only, never kept
{ ../036-proton-style-dipc-responder/steamenv.sh; echo DIPC_VPM=0
  echo 'DIPC_CLIENTDLL=C:\Program Files (x86)\Steam\steamclient.dll'; for kv in "$@"; do echo "$kv"; done; } > "$ENVF"
ENV_FILE="$ENVF" ../035-xcom-ceg-handshake-trace/run.sh "$LABEL" 'C:\XCOM\XEW\Binaries\Win32\dipc_responder.exe' \
  'C:\XCOM\XEW\Binaries\Win32\XComEW.exe' -FROMLAUNCHER -LANGUAGE=INT 2>&1 | grep -v Terminated
mv ../035-xcom-ceg-handshake-trace/logs/"$LABEL".* logs/ 2>/dev/null
cp "$DC/dipc036.log" "logs/$LABEL.dipc.log" 2>/dev/null; cp "$DC/steamclient037.log" "logs/$LABEL.steamclient.log" 2>/dev/null
grep -v '  [0-9a-f]\{4\}:\|saw STEAM\|entries' "logs/$LABEL.dipc.log" | sed 's/^/   dipc: /' | cut -c1-150
sed 's/^/   client: /' "logs/$LABEL.steamclient.log" 2>/dev/null | head -40
