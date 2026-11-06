---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 36
subsystem: steam-install
tags: [WR-02, WR-03, G21, cancel, abort-controller]
requires: []
provides:
  - ownership-checked abort controller cleanup in runNativeDepotDownload
  - signal re-check after the prior-run wait in installDepotDownload
  - creating-bottle engine-download stage during bridge bottle provisioning
affects: [59-37 renders the creating-bottle context]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
decisions:
  - "Provisioning failure now sends status 'done' before deferring to setup; the install() caller sends no terminal status for deferredToSetup from this path, so no double-send."
metrics:
  completed: 2026-11-03
requirements: [WR-02, WR-03, G21]
---

# Phase 59 Plan 36: depot cancel races and creating-bottle stage Summary

Neither handoff race can drop a cancel, and bridge bottle creation now reports a `creating-bottle` stage.

## What was built
- WR-02: `runNativeDepotDownload`'s finally deletes the registered controller only when `getAbortSignal(appId) === controller.signal`.
- WR-03: `installDepotDownload` and `runNativeDepotDownload` take an optional `signal` (passed from `installBridgeGameLeased`); an aborted signal returns `{ status: 'abort' }` after the prior-run wait, before registering, and before a fresh controller is created.
- G21: `sendCreatingBottle()` (`engine-download` / `creating-bottle`) before each of the three `provisionBridgeBottle` calls; `installing` sent after every successful provision (not only built-in engines); `done` sent on the provisioning-failure branch.

## Commits
- ace61e592: both tasks in one commit (same hunks in the same two files; split would have been artificial)

## Verification
games.test.ts + cancelDelete.test.ts 598 passed; engine suites 202 passed; eslint 0 errors; `pnpm codecheck` and `pnpm smoke:sidecar` pass; prettier clean.

## Deviations from Plan
- [Rule 1] Three existing tests asserted the old status sequence (no stage when the engine was already installed; last status `setting-up`) and one (SNI-07 controller release) mocked `getAbortSignal` as undefined; updated them to the new contract and to model a registered controller.
- Tasks 1 and 2 committed together as one commit.

## Known Stubs
None.

## Self-Check: PASSED
