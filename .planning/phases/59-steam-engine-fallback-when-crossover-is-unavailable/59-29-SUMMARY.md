---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 29
subsystem: steam-engine
tags: [abort, install, gap-closure]
requires: [59-26, 59-27]
provides: [install cancel honoured at every provisioning hand-off, abort exempt from failure mark]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
requirements-completed: [D-01, D-04, D-05, D-09]
completed: 2026-11-02
---

# Phase 59 Plan 29: Cancel stops the install, abort does not poison the session Summary

A cancel during engine or bottle provisioning now ends the install with `{ status: 'abort' }` before any depot download, and a cancelled depot download no longer marks the bridge failed.

## Commits
- cb842c182: Tasks 1 and 2 together (same two files, tests developed jointly)

## What changed
- `ensureBuiltInEngineForInstall`: reason `aborted` returns `{ status: 'abort' }` (no failure text); the launch-time download returns `{ ok: false }` with no dialog.
- `installBridgeGame`: reuses only a live controller (IN-03), one try/finally from controller creation through `installBridgeGameLeased` deletes the controller only if this install created it and it is still registered (identity check), post-provisioning abort discards the bottle only when `createdHere`.
- `provisionBridgeBottleForInstall`: returns `{ engine, createdHere }`, signal checks after the decision, after each engine fetch and before each `provisionBridgeBottle`, `signal` on all three calls, `PROVISION_ABORTED` maps to abort ahead of the CrossOver fallback and the failure mark.
- `installBridgeGameLeased`: synchronous signal check before `installDepotDownload`; `abort` result returned before `markBridgeFailedThisSession`.

## Deviations from Plan
- Tests: the CR-02 tests were placed in the 59-09 describe (not 59-21), reusing APP_ID because a fresh appId did not take the bridge route in this harness. Route observation is via `isBridgeBottleReady` being consulted (only the bridge route does). Depot cancel is the `'cancelled'` outcome of `downloadSteamDepots`, which `runNativeDepotDownload` maps to `abort`.
- Three existing exact-match `provisionBridgeBottle` assertions gained `signal: expect.anything()`; the bottle mock gained `PROVISION_ABORTED` and `discardNewBridgeBottle`.
- Both tasks landed in one commit.

## Verification
games.test.ts (570), cancelDelete (18), engine suite (195) pass; prettier clean; eslint 0 errors; `pnpm codecheck` and `pnpm smoke:sidecar` pass.

## Self-Check: PASSED
