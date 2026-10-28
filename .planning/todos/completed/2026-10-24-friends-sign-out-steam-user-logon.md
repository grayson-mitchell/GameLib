---
created: 2026-10-24
title: "GameLib's steam-user logon signs the Mac Steam Friends list out (status stuck 'Offline') until Mac Steam is restarted"
source: 52-19 Gap 6 arms (F1, F2, F3)
area: steam-auth
files:
  - src/backend/storeManagers/steam/user.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/platformCapture.ts
  - src/backend/storeManagers/steam/installLocation.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/bridge/launchTarget.ts
  - src/backend/storeManagers/steam/depot.ts
severity: medium
platform: macos
ready: live-gate
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

## Note 2026-10-24 (52-24, item 20)
Reproduced a fourth time on ELEX (411300) in re-gate 2: Friends signed in before GameLib launch, dropped offline after GameLib's steam-user logon, and the operator restarted Mac Steam before Play. Friends then stayed signed in through the bridge Play and after quitting ELEX. Consistent with the 52-19 attribution (outside-phase-52); item 20 scored on ELEX no-regression alone. Triage keys unchanged.

## Root cause 2026-10-25 (debug session friends-signout-steam-user)

Confirmed by a live A/B on the operator's Mac (`.planning/debug/friends-signout-steam-user.md`):
**any authenticated steam-user CM logon for the account signs Mac Steam's Friends out.** It is not
tunable from the logon message. Each of these still flipped Friends: `chat_mode` 0 (steam-user
hardcodes 2), a distinct non-zero `logonID`, `setPersona(Online)` after logon, `setPersona(Invisible)`
after logon. Skipping the logon alone, with everything else GameLib does at launch unchanged, kept
Friends signed in; the control run in the same sitting flipped. `steam://open/friends` (Playnite's
Friends button) does not recover it. Correction to the Problem section: a Mac Steam restart is not
needed. Mac Steam itself stays online and only Friends signs out, so the operator can sign back in
to Friends by hand.

Side finding: `LogonSessionReplaced` at logon on back-to-back dev runs is GameLib's new session
colliding with its own previous one (both `logonID` 0), not with Mac Steam. Unrelated to the flip.

## Fix shape (to plan as a phase; reopens the frozen STEAM-STACK.md decision)

Playnite (JosefNemec/PlayniteExtensions SteamLibrary) never logs on to the CM as the user: owned
games come from Web API `IPlayerService/GetOwnedGames` with an access token
(`Services/PlayerService.cs:19`), and its only CM logon is `LogOnAnonymous`
(`SteamShared/SteamApiClient.cs:121`). For GameLib:

- library list (`getOwnedApps`, every launch): Web API with an access token from the refresh token;
- PICS reads (platform capture on sync, game page `getExtraInfo`, install location, bridge launch
  target): an anonymous CM session where the data is public;
- depot installs: still need an authenticated session (ownership, depot keys, manifest request
  codes). Connect only for the install and log off after; Friends will still drop during an install
  unless another route is found. Whether Friends recovers by itself after logoff is untested.

## Closed 2026-10-28: fixed by Phase 54

Phase 54 (_Steam library without an authenticated CM session at launch_) was created to action this
todo (`STATE.md`, Phase 54 entry). `54-VERIFICATION.md`: `status: passed`, 6/6. SC4: "launch/browse/game
page/Play leave Friends signed in".

- Launching, browsing, opening game pages and pressing Play no longer log on to the CM as the user.
  Public data comes from an anonymous session. `54-UAT.md` items 1-4 pass: 0 authenticated logons,
  operator Friends signed in.
- Explicit Refresh, installs, sign-in and key redeem still need an authenticated logon. They now run
  inside a go-offline wrap, so Mac Steam goes offline for the logon and comes back online after.
  Friends drops briefly and comes back without a hand sign-in (items 5-6). The edge cases pass: Steam
  already offline (7), a game running (8), quit, kill and boot-restore mid-wrap (10-12), and the
  user's own offline choice is kept (13). Items 5-8 and 10-13 were re-run 2026-10-28 on
  `20c1fe9d5`/`95a89d8d3`.

Still true: any authenticated logon for the account drops Friends for a moment. The wrap manages that
drop rather than removing it, as the fix shape above expected for depot installs.
