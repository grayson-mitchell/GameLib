---
created: 2026-10-24
title: "GameLib's steam-user logon signs the Mac Steam Friends list out (status stuck 'Offline') until Mac Steam is restarted"
source: 52-19 Gap 6 arms (F1, F2, F3)
area: steam-auth
files:
  - src/backend/storeManagers/steam/user.ts
severity: medium
platform: macos
ready: code
---
## Problem

Reproduced three times in the 52-19 arms on a non-ELEX title (Age of Decadence, appid 230070): within
about 30 seconds of `SteamUser.loggedOn` (GameLib's steam-user logOn with the keyring refresh token,
`user.ts` `client.logOn({ refreshToken })`) the operator's Mac Steam Friends list is signed out, or
signed in but locked to 'Offline'. No helper, shim, forwarder or Play was involved (F1 and F2 had no
Play and no `bridge helper [` line). The idle control (0b) and the helper alone against Mac Steam
(arm c) did not flip. Restarting Mac Steam restores Friends even with GameLib still running (F3), and
a bridge Play afterwards did not flip it again. Mac Steam's connection log shows no displacement or
remote logoff, and no "logged in elsewhere" notice was seen.

## Evidence

See `.planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-19-DIAGNOSIS.md`
`## Gap 6: arms` and `## Gap 6: attribution` (classification: outside-phase-52).

## Not done

Nothing fixed in 52-19. Open question for whoever picks this up: whether the steam-user session can
be made not to claim the persona/Friends session (for example by logging on only when the library
fetch needs it and logging off after), and why Mac Steam does not recover without a restart.
