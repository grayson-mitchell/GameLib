---
phase: 74-steam-game-updates
plan: 30
subsystem: steam-update
tags: [steam, update-poll, pics, installapp, gap-closure]
requires: []
provides:
  - PICS-preferring update target on the ACF-says-current hand-off path
  - bounded InstallApp retry on the update poll tick
affects: [74-VERIFICATION UAT 19]
key-files:
  modified:
    - src/backend/storeManagers/steam/updateNative.ts
    - src/backend/storeManagers/steam/library/updatePollOnce.ts
    - src/backend/storeManagers/steam/library/pollState.ts
    - src/backend/storeManagers/steam/library/installPolling.ts
    - src/backend/storeManagers/steam/library/installRoot.ts
decisions:
  - "On the ACF-says-current path the PICS target wins; ACF TargetBuildID is used only when the ACF itself is pending"
  - "InstallApp retry runs every 3 ticks, max 13 attempts (39 < 40 quiet window), guarded by inFlight, no new timer"
metrics:
  tasks: 2
  completed: 2026-11-13
requirements: [STEAM-01]
---

# Phase 74 Plan 30: UAT 19 false-finish fix and InstallApp retry Summary

A registered update handed to Steam with Steam closed now waits for the PICS target build instead of the ACF's stale TargetBuildID, and retries InstallApp on the poll tick once Steam is up.

## Tasks

1. **Wait on the PICS target (3cfeba51e)**: `updateNative.ts` computes `targetBuild` as `known.targetBuild` when `picsSaysNewer && !acfPending`; otherwise the ACF target (non-0) then PICS. Tests replay the live 5820077/5820078 sequence: 40 ticks of a stale ACF end quietly with no `finished` log and no `pushGameToLibrary`; reaching 5820078 logs `finished (build 5820078)`. RED: the new updateNative test failed pre-fix (received targetBuild `5820077`, expected `5820078`). The updatePollOnce replay tests passed pre-fix, as the plan predicted (its quiet end is already target-aware).
2. **InstallApp retry (2645ce5a5)**: `awaitingUpdate.installAppRetry` armed in `updateNative.ts` when InstallApp is on and unavailable; carried through both `startInstallPolling` construction sites (fresh and existing-entry upgrade) and the `PollOptions` type in `installRoot.ts`; `retryInstallApp` in `updatePollOnce.ts` retries every `STEAM_INSTALLAPP_RETRY_EVERY_TICKS` (3) up to `STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS` (13), with an `inFlight` guard, disarm on ok/error/give-up, and a `delegatedSinceTick` reset on success. No setInterval/setTimeout added.

## Deviations from Plan

- **[Rule 3] PollOptions type** in `library/installRoot.ts` also needed `installAppRetry` for `tsc` to accept the option; added (file not in the plan list).
- The existing test "unavailable falls back to the details hand-off" expected options without `installAppRetry`; updated to the new armed shape (intended behaviour change).
- Task 2 tests were written before the implementation but the RED run was not captured during execution. **RED captured retroactively (2026-11-13):** in a throwaway worktree at `2645ce5a5` with the five Task 2 source files (`installPolling.ts`, `installRoot.ts`, `pollState.ts`, `updatePollOnce.ts`, `updateNative.ts`) reverted to `3cfeba51e`, the three suites ran 8 failed / 53 passed / 61 total:
  - `updateRegisteredSteamGame` › unavailable falls back to the details hand-off (options lack `installAppRetry`)
  - `updateRegisteredSteamGame` › InstallApp unavailable arms installAppRetry on the poll options (74-30)
  - `pollUpdateOnce InstallApp retry (74-30)` › ok: logs the retry, disarms, restarts the quiet window (helper called 0 times, expected 1)
  - `pollUpdateOnce InstallApp retry (74-30)` › unavailable: counts attempts, gives up at the max with one log
  - `pollUpdateOnce InstallApp retry (74-30)` › error: disarms and logs the EAppUpdateError code (expected `StringContaining "EAppUpdateError 9"`, never logged)
  - `pollUpdateOnce InstallApp retry (74-30)` › does not call the helper again while one retry is in flight
  - `startInstallPolling()` › installAppRetry carry-through › fresh poll keeps installAppRetry on awaitingUpdate (expected `{"attempts": 0, "libraryPath": "/lib"}`, received `undefined`)
  - `startInstallPolling()` › installAppRetry carry-through › existing-entry upgrade keeps installAppRetry on awaitingUpdate (same)

  GREEN on `main` after the change: 61/61. Every Task 2 test fails without the implementation, so the tests discriminate.

## Verification

jest (updateNative, library.updatePollOnce, library.installPolling) 61/61 pass; tsc exit 0; lint 0 errors; find-deadcode PASS; steam-line-ceiling PASS; prettier clean on written paths.

## Known Stubs

None.

## Self-Check: PASSED

Commits 3cfeba51e and 2645ce5a5 exist.
