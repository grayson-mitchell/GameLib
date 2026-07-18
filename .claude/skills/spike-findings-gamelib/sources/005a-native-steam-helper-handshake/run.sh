#!/bin/bash
# Run the handshake. REQUIRES: Steam running + signed in.
# steam_appid.txt (480 = Spacewar, the Steamworks SDK test app) tells the flat
# API which app context to init as; reading the local user's SteamID/persona
# does not require owning that app.
set -uo pipefail
cd "$(dirname "$0")"
echo "480" > steam_appid.txt
export SteamAppId=480
./helper
echo "--- exit code: $? ---"
