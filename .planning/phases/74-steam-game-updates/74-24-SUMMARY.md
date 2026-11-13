---
phase: 74-steam-game-updates
plan: 24
subsystem: steam-updates
tags: [auto-update, download-queue, gap-closure]
requires: [74-19, 74-23]
provides:
  - per-boot {appId -> targetBuild} auto-update attempt marker
  - one Steam update detection per refresh
  - queue-aware autoUpdate
  - phase-accurate unattended failure log
affects: [steam/games.ts, steam/library/index.ts, storeManagers/index.ts, steam/updateBridge.ts]
key-files:
  created:
    - src/backend/storeManagers/steam/autoUpdateAttempts.ts
    - src/backend/storeManagers/steam/__tests__/autoUpdateAttempts.test.ts
  modified:
    - src/backend/storeManagers/steam/steamInstallRuntime.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/library/index.ts
    - src/backend/storeManagers/steam/updateBridge.ts
    - src/backend/storeManagers/index.ts
key-decisions:
  - "Marker recorded on the attempt (before updateBridgeGame), not only on failure, so every early return and throw is covered"
  - "Wildcard marker when no target build is known; matches any target until a user Update clears it"
  - "autoUpdate caches one getDownloadQueue() per call so construction never touches the queue"
requirements-completed: [STEAM-02]
duration: ~25min
completed: 2026-11-13
---

# Phase 74 Plan 24: Auto-update loop closure Summary

A failed unattended bridge auto-update is no longer re-queued for the same target build this boot (CR-02), an auto-update never replaces a user-queued element (WR-03), and every unattended error return logs "not started" or "failed" (IN-05).

## Commits
- 42fbe253d: attempt marker (autoUpdateAttempts.ts, runtime Map, games.ts wiring) and one detection per refresh (listUpdateableGames hands its pass to listAutoUpdateableGames, one-shot)
- 176063e5b: autoUpdate skips apps already in getQueueInformation().elements; logUnattendedFailure(phase, reason) on all error returns; requeue-churn todo moved to completed

## Todo scope taken
The per-build marker and the shared detection result are implemented here. The third item (no error dialog on the auto path) was already true after 74-19, confirmed by the existing updateBridge test "unattended refused lease: error result, one log line, no dialog". All three covered, so the todo moved to completed. The frontend backstop was not taken.

## Tests
jest src/backend/storeManagers: 4712 passed, 1 failed (see below). Added tests for the marker, detect-once, queue skip and log phases. `tsc --noEmit`, `pnpm lint:tests`, `steam-line-ceiling`, `planning-gates` pass; prettier clean on written files.

## Deviations
None from the plan. Note the plan's autoUpdate test constraint (getDownloadQueue called once) required caching the queue handle for both the read and addToQueue.

## Deferred / pre-existing issues (not fixed)
- `pnpm codecheck` step 2 fails on meta/gen_vtables.ts type errors (known).
- `legendary/__tests__/epicOfflineMode.test.ts` "Test 6c" fails: legendary/games.ts matches /signInProbe/. Untouched by this plan; pre-existing.

## Self-Check: PASSED
