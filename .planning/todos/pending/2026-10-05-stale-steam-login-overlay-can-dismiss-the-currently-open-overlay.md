---
created: 2026-10-05T00:00:00.000Z
title: "A Steam login that completes after its dialog closed calls dismiss on whatever overlay is open now — can cancel an in-progress Humble sign-in"
area: auth
severity: medium
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 36"
files:
  - src/frontend/screens/Login/index.tsx:220-232
  - src/frontend/screens/Login/components/SteamLogin/index.tsx:134-140
  - src/frontend/screens/Login/components/SteamLogin/index.tsx:179-188
  - src/frontend/screens/Login/components/SteamLogin/index.tsx:265-277
  - src/frontend/screens/Login/components/SteamLogin/index.tsx:300-308
---

## Problem

`dismissLoginOverlay` is not bound to the overlay that called it (`overlayMountKey`). SteamLogin calls
`closeWindow()` after its awaits finish, even after it has unmounted; the unmount cleanup clears the
intervals but not a callback already waiting on IPC.

## Failure scenario

1. Click "Sign In to Steam"; `steamStartCredentials` is in flight.
2. Close the dialog; `loginInFlight` drops, tiles are clickable.
3. Click Humble; its native sign-in window opens.
4. The Steam call returns `done`; the unmounted SteamLogin calls `dismiss` → `openOverlay = null`
   while Humble is up. The screen is no longer inert, so a second login can start.
5. 500ms later HumbleLogin unmounts; its cleanup calls `humbleStopLogin()`, cancelling the user's
   Humble sign-in.

The QR and credential polls (`:179`, `:134`) can do the same; a Steam→Steam reopen is also closed by
the old overlay.

## Suggested fix

Pass a key-bound dismiss, e.g. `dismiss={() => dismissLoginOverlay(overlayMountKey)}`, and ignore the
call unless the key matches a ref holding the current key. Also (or instead) give SteamLogin a
`mountedRef` and skip `closeWindow()` after unmount.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
