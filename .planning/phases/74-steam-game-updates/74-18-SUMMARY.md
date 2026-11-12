---
phase: 74-steam-game-updates
plan: 18
subsystem: steam-update-poll
tags: [steam, update-poll, library-state, gap-closure, WR-04, UAT-12]
requires: []
provides:
  - Poll completion on the target build, with updating sent before done
  - Already-current short circuit for registered game updates
  - Quiet end that invalidates the cached update state and completes when the ACF is current
  - ACF-fresh update info for registered games
  - Single-slot re-run of a checkForUpdates refresh requested mid-flight
affects: [74-22]
tech-stack:
  added: []
  patterns: [module-scope single-slot re-run instead of store state, no new timers]
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/library/pollState.ts
    - src/backend/storeManagers/steam/library/installPolling.ts
    - src/backend/storeManagers/steam/library/installRoot.ts
    - src/backend/storeManagers/steam/library/updatePollOnce.ts
    - src/backend/storeManagers/steam/updateNative.ts
    - src/backend/storeManagers/steam/updateInfo.ts
    - src/backend/storeManagers/steam/__tests__/library.updatePollOnce.test.ts
    - src/backend/storeManagers/steam/__tests__/updateNative.test.ts
    - src/backend/storeManagers/steam/__tests__/updateInfo.test.ts
    - src/frontend/state/libraryState.ts
    - src/frontend/state/__tests__/libraryState.test.ts
    - src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateInfo.test.tsx
key-decisions:
  - "Re-run slot lives at module scope in libraryState.ts, not in the store, so it never persists"
  - "Re-run origin is 'update-check-rerun' (not 'game-status') to keep the origin-literal count test exact"
requirements-completed: []
duration: 25min
completed: 2026-11-13
---

# Phase 74 Plan 18: Update completion reflects Steam (WR-04 / UAT 12) Summary

A Steam-owned update that finishes (or was already finished) now clears GameLib's Updating state and badge: the poll completes on the target build, emits updating then done, the quiet end invalidates and completes when the ACF is current, and a mid-flight refresh can no longer overwrite the clearing.

## Tasks

1. Backend completion - `1e6dfba3b`. `awaitingUpdate.targetBuild` carried through pollState, installPolling (both copy sites) and installRoot's option type. `updatePollOnce` has a shared `complete()` (invalidate, push game, updating, done); the target-build arm still requires not-pending and bit 4. `updateRegisteredSteamGame` returns done at once when the ACF is already current, otherwise passes the target build. `getSteamUpdateInfo` re-runs detection for a cached registered state.
2. Frontend - `5ec1b4c3a`. `refreshLibrary` records a mid-flight `checkForUpdates` request (scopes merge to 'all') and runs one re-run when the in-flight refresh ends (success and failure paths). `SteamUpdateInfo` depends on the game's library status and refetches.

## Deviations from Plan

**1. [Rule 3 - Blocking] Re-run origin**
- `GlobalStateRefreshLibraryOrigin.test.ts` counts the `'game-status'` literal exactly twice in libraryState.ts; reusing it for the re-run failed that test. Used `'update-check-rerun'` instead.

**2. [Rule 3] installRoot.ts also modified** - its `awaitingUpdate` option type needed `targetBuild`.

**3. Module-scope slot** rather than a store field (plan said "for example"), so nothing persists.

**4. Test note** - in the quiet-end-completes test an earlier tick also emits 'updating' (ACF current, not yet complete), so the assertion checks the last two statuses.

## Verification

- `jest src/backend/storeManagers/steam`: all pass; `jest src/frontend/state src/frontend/screens/Game/GamePage`: 1007 pass
- `pnpm codecheck` clean, `pnpm lint` 0 errors, `pnpm steam-line-ceiling` PASS (no new files), scoped prettier clean
- No timers added: `setTimeout` count in libraryState.ts is 0 before and after; none in updatePollOnce.ts
- `graphify update .` run

## Known Stubs

None.

## Self-Check: PASSED
