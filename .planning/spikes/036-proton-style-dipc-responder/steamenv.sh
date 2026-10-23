#!/bin/bash
# Spike 036: print the env a genuine Windows Steam launch gives app 200510 (captured by envoracle.sh ->
# logs/env2.envdump.txt), one NAME=VALUE per line, for run.sh's ENV_FILE. Identity (account name,
# SteamID64) is read at runtime from the native Mac client's loginusers.vdf (MostRecent user, else the only/first one) -- never stored.
set -euo pipefail
V="$HOME/Library/Application Support/Steam/config/loginusers.vdf"
read -r SID ACC < <(python3 -I - "$V" <<'PY'
import re,sys
t=open(sys.argv[1]).read()
users=re.findall(r'"(\d{17})"\s*\{(.*?)\}',t,re.S)
pick=[u for u in users if re.search(r'"MostRecent"\s*"1"',u[1])] or users[:1]
sid,body=pick[0]; print(sid, re.search(r'"AccountName"\s*"([^"]+)"',body).group(1))
PY
)
cat <<ENV
SteamPath=C:\Program Files (x86)\Steam
ValvePlatformMutex=c:/program files (x86)/steam/steam.exe
SteamUser=$ACC
SteamAppUser=$ACC
STEAMID=$SID
SteamClientLaunch=1
SteamEnv=1
SteamGameId=200510
SteamAppId=200510
SteamOverlayGameId=200510
EnableConfiguratorSupport=4096
INSTALLDIR=C:\XCOM
ENV
