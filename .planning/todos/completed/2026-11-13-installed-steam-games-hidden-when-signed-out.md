---
created: 2026-11-13T00:00:00.000Z
title: 'Installed Steam games vanish from the library when signed out of Steam in GameLib'
area: steam
severity: major
platform: any
ready: code
source: '.planning/phases/74-steam-game-updates/74-UAT.md item 23 (operator, 2026-11-13 live gate)'
files:
  - src/backend/storeManagers/steam/library/refresh.ts
---

## Problem

Signing out of Steam in GameLib and relaunching leaves the library with **no Steam games at
all**, including installed ones (Mac Steam-registered games and bridge installs such as Hell
Clock 1782460). Installed games are meant to show, and launch, while signed out.

Boot log after sign-out (21:14:39 launch):

- `Steam: update check apps=0 stale=0 unknown=0 pics=ok` (nothing in the library to check)
- `Steam client not ready (not-signed-in), skipping library refresh` (`library/refresh.ts:80`)

The refresh bails out on the missing sign-in lease before installed apps (local
`libraryfolders.vdf` / `appmanifest_*.acf`, bridge bottles) are merged in, so an empty owned
list means an empty library.

## Expected

Signed out: every locally installed Steam game (native registered + bridge) is listed and
launchable. Owned-but-not-installed entries may drop out. Update detection still runs over
the installed set (anonymous PICS works signed out).

## Notes

Found while trying to induce an unattended auto-update failure for 74-UAT item 23 by signing
out; it also blocks that route to item 23.

## Resolution

Closed by 74-31 and 74-32. Backend: the cached library is restored on every non-sync refresh exit (74-31, `library/localLibrary.ts`, `refresh.ts`), so update detection has an installed set signed out. Frontend (74-32): installed-only visibility with no Steam identity, sign-out keeps installed entries in the same session, the mount refresh (with its update check) runs on a boot with installed Steam games and no sign-in, and sign-in runs a library-wide update check after its sync.

Known limitation, cache-based scope: a game installed through Steam after the last signed-in GameLib sync stays hidden while signed out until the next signed-in sync; never-synced profiles and ACF-only apps are not enumerated. Live proof is the 74-33 gate.
