---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
plan: 23
subsystem: steam-bridge
tags: [bridge, process-monitor, helper-lifetime, gap-closure]
requires: [51-22, 51-24]
provides:
  - "startBottleProcessMonitor returns a launcherExited() handle"
  - "fireBridgeWineLaunch starts the monitor before the wine child, never awaits it"
affects: [51-27 live re-gate]
key-files:
  modified:
    - src/backend/storeManagers/steam/bottleProcessMonitor.ts
    - src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - .planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/deferred-items.md
decisions:
  - "Launcher exit, not a timer, bounds the no-match case (LD-4 kept)"
  - "onStopped fires once on every terminal path except supersede/cancel (WR-05 resolved)"
metrics:
  tasks: 2
  completed: 2026-10-22
---

# Phase 51 Plan 23: Bridge process monitor starts before the wine child Summary

The bridge process monitor now starts before the wine child is awaited, so the first launch of a session is matched while the game runs and its helper stops when the game's processes are gone.

## Changes

- `bottleProcessMonitor.ts`: `everMatched`, `matchedAt` and `stoppedFired` moved onto the entry. New `fireStoppedOnce` is used by the gone branch, the ps give-up branch (review WR-05, resolved here) and `launcherExited`. New `recordFirstMatch` helper is shared by the poll loop and `launcherExited`. `startBottleProcessMonitor` returns `BottleProcessMonitorHandle | null`. `launcherExited()` is a no-op after a match or on a superseded entry. Otherwise it runs one immediate ps check: if a game process exists it records the match, and if not it logs, fires `onStopped` and clears.
- `games.ts` `fireBridgeWineLaunch`: starts the monitor first, then calls `runWineCommand` without awaiting it. Fulfilment calls `handle?.launcherExited()`. Rejection keeps the `bridge-launch-failed` contract (`markBridgeFailedThisSession` plus `steamBridgeSetupRequired` with `fallbackAvailable: true`), then calls `launcherExited()`. An outer try/catch preserves the sync-throw `false` return.
- `deferred-items.md`: WR-06 (helper child handles not `unref()`'d) recorded as deferred, not dropped.

## Verification

- bottleProcessMonitor and games suites: 348 passed. `pnpm codecheck` is clean. Prettier is clean on the written source and test paths. `deferred-items.md` is prettier-ignored.
- `await runWineCommand(` no longer appears inside `fireBridgeWineLaunch`.

## Deviations from Plan

None. The plan was executed as written.

## Commits

- b6012f368: feat(51-23): monitor handle launcherExited and onStopped on every terminal path
- b8a020087: fix(51-23): start bridge process monitor before awaiting the wine child

## Self-Check: PASSED
