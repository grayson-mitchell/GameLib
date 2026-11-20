---
created: 2026-11-18T00:00:00.000Z
title: 'Restart note and "Restart Steam now" flash for 1-2 s at install end before the state settles'
area: steam
severity: minor
platform: macos
ready: live-gate
files:
  - src/frontend/screens/Game/GamePage/components/AdoptionNote.tsx
  - src/backend/storeManagers/steam/gameInstallDepot.ts
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
---

## Problem

Phase 81 live gate, item 7 (`81-HUMAN-UAT.md`, launch L2, 2026-11-18), InstallApp setting
ON. Both sub-checks passed on outcome, but at install end the page briefly showed the
restart-on-Play note with the "Restart Steam now" button for about 1-2 s before the real
state appeared:

- 7a (Wildermyth 763890, signed in): the note and button flashed, then vanished when the
  InstallApp adoption won (`SteamGame: Steam adopted appId 763890 via InstallApp without a
  restart`);
- 7b (Machinarium 40700, signed out): the restart note and button flashed before the page
  settled on the sign-in note "Sign in to Steam to finish setup".

The page appears to render the default pending variant while the InstallApp attempt and
the signed-in reading are still in flight at the end of `gameInstallDepot.ts`'s
install-end branch.

## Direction

Find what the frontend reads during that window (the pending record written before the
InstallApp attempt, or the adoption status before the signed-in reading lands) and hold
the note until the install-end branch has decided, or record the pending state only after
the InstallApp verdict. Verify live on the Mac with item 7's steps; watch the page at
install end.

## Fix landed, live check pending (quick 261120-963, 2026-11-20)

Code commit `d0459b101` (both fixes, plus their regression tests). Two causes, neither a
frontend one:

- 7b (signed out): the InstallApp verdict did precede the record. But the record's first
  push carried `steamSignedIn: null`, because the signed-in cache is only filled by the Rust
  watch's first tick (up to 5 s later), and `AdoptionNote.tsx` treats only `false` as signed
  out, so null rendered the restart-on-Play note and "Restart Steam now".
- 7a (signed in, InstallApp ok): the post-install poll still started with
  `isNativeHandoff: true`, so a StateFlags 1026 that Steam wrote during its own InstallApp
  validation read as `steam-waiting-for-restart` for one tick. Inferred by elimination
  (neither log sink records that tick), which is why the live check is owed.

Fix: the install-end branch now takes the one-shot `readSteamAdoption` reading after the
InstallApp verdict and before the record, seeds the signed-in cache from it (an already
adopted reading writes no record), and starts the poll with `isNativeHandoff: !steamAdopted`.
Boot migration passes its reading too.

OWED live check on the Mac (not run):

- Preflight: `pnpm build:sidecar`, and confirm `build/main/sidecar.js` is newer than the fix
  commits. Restart with `pnpm tauri:dev`, never `tauri:dev:run`. Record the InstallApp
  setting state.
- (a) Setting ON, Mac Steam signed in. Depot-install a small game Steam does not have
  installed, and watch the game page at install end. Expect: no "Restart Steam now" and no
  "Restart Steam to finish" at any point. gamelib.log shows `SteamGame: Steam adopted appId
  <id> via InstallApp without a restart`. The terminal shows `starting install polling for
  appId <id> (... isNativeHandoff false ...)`.
- (b) Steam signed out (confirm helper `loggedOn 0`). Depot-install another. Expect the page
  to go from installing straight to "Sign in to Steam to finish setup" with "Open Steam",
  with no restart note or button in between. gamelib.log shows `SteamGame: adoption reading
  for <id> at install end: signedIn false` before `SteamGame: recorded pending Steam
  adoption for <id>`. After sign-in the note clears on its own.
- (c) Setting OFF at the end; record that.
- Close the todo (git mv to completed/ with a Live result section) only after (a) and (b)
  pass.

## Live result, 2026-11-20

Operator ran the owed checks on the Mac against the `d0459b101` fix.

- (a) **passed**. InstallApp setting ON, Mac Steam signed in: no "Restart Steam now" or restart
  note at install end.
- (b) **passed**. Steam signed out: the page went from installing straight to "Sign in to Steam
  to finish setup", with no restart note or button in between.
- (c) setting-OFF state at the end was not reported.
