---
phase: quick-261105-sqe
plan: 01
subsystem: steam-install-poller
tags: [steam, mac, d-uat-13, installapp]
key-files:
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
metrics:
  completed: 2026-11-05
---

# Quick 261105-sqe: Release the D-UAT-13 restart hold when Steam adopted via InstallApp

New `adoptedBySteamClient` poll option: an ok InstallApp adoption now starts the poll with the
restart hold already released, so no Steam PID probe, no persisted hold, no
`steam-waiting-for-restart`; the game is reported installed immediately.

## Changes
- library.ts: `PollOptions.adoptedBySteamClient`; destructure/defaults; log line; `initialSteamHold`
  (restored -> holding, adopted -> released, else unprobed); upgrade branch calls `releaseSteamHold`
  (clears persisted record) when the flag arrives on an existing poll.
- games.ts: conditional spread `...(adoptedByInstallApp ? { adoptedBySteamClient: true } : {})`, so the
  non-adopted call object is unchanged.
- Tests: 2 new library tests (init + upgrade; fail with the library change disabled), games ok test
  expects the flag; unavailable/error/not-running/setting-OFF assert exact objects without it.

## Commits
- library: see `fix(quick-261105-sqe): adoptedBySteamClient poll option ...`
- games: see `fix(quick-261105-sqe): pass adoptedBySteamClient only ...`

## Verification
jest library/steamRestartHold/games: 1038 passed. `pnpm codecheck` clean. eslint (--quiet) clean on the
four files (existing warnings only). Scoped prettier check clean; no path ignored.

## Deviations
[Rule 1] The inline `as` cast on `steamHold` became flagged `no-unnecessary-type-assertion` yet removing it
broke tsc; replaced with a typed `initialSteamHold` const.

Operator live re-check of 261105-ord gate item 2 still pending (needs `pnpm tauri:dev` restart).
