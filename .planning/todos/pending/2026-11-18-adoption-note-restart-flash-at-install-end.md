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
