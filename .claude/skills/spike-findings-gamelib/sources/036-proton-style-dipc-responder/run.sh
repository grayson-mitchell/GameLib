#!/bin/bash
# Spike 036: launch XComEW.exe THROUGH dipc_responder.exe, reusing spike 035's run harness (helper,
# cfg, bottle hygiene). usage: [EXTRA_ENV="DIPC_ACK=0"] WATCH=60 ./run.sh <label>
set -uo pipefail
cd "$(dirname "$0")"; mkdir -p logs
DC="$HOME/Library/Application Support/CrossOver/Bottles/GameLibSpikeXCOM/drive_c"; rm -f "$DC/dipc036.log"
../035-xcom-ceg-handshake-trace/run.sh "$1" 'C:\XCOM\XEW\Binaries\Win32\dipc_responder.exe' 'C:\XCOM\XEW\Binaries\Win32\XComEW.exe' 2>&1 | grep -v Terminated
mv ../035-xcom-ceg-handshake-trace/logs/"$1".* logs/ 2>/dev/null
cp "$DC/dipc036.log" "logs/$1.dipc.log" 2>/dev/null && sed 's/^/   dipc: /' "logs/$1.dipc.log"
