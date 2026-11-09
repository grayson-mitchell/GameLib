#!/bin/sh
# Spike 080: steam-vent a9e8164 with ONE change -- anonymous logon (send_logon demanded a token and
# failed every anonymous logon with NoToken, 071c). A placeholder JWT stands in for the absent token;
# it is never sent (access_token stays None on the wire). vendor/ is gitignored.
set -eu
cd "$(dirname "$0")"
rm -rf vendor && mkdir -p vendor
git clone -q https://codeberg.org/steam-vent/steam-vent vendor/steam-vent
git -C vendor/steam-vent checkout -q a9e8164ccd8a7b537da59a652093b0318f416105
perl -0pi -e 's/\.ok_or\(LoginError::NoToken\)\?;/.unwrap_or_else(|| RefreshToken::new("e30.eyJzdWIiOiI3NjU2MTE5Nzk2MDI2NTcyOSIsImlzcyI6InN0ZWFtIiwiZXhwIjowfQ.x".into()).expect("placeholder"));/' vendor/steam-vent/src/session.rs
grep -c 'placeholder' vendor/steam-vent/src/session.rs
