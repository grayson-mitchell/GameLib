---
phase: 61-unified-macos-engine-for-all-stores
plan: 05
subsystem: engine
tags: [engine, gameKey, bottleLedger, registry, launchDeadline]
requires: ["61-03"]
provides:
  - engine/gameKey.ts (EngineKey, engineKeyFor, isEngineKey, describeEngineKey)
  - engine/bottleLedger.ts (markGameRunning, markGameStopped, otherGamesRunning, gamesRunningIn)
affects: [61-12]
key-files:
  created:
    - src/backend/engine/gameKey.ts
    - src/backend/engine/bottleLedger.ts
    - src/backend/engine/__tests__/gameKey.test.ts
    - src/backend/engine/__tests__/engineRegistry.test.ts
    - src/backend/engine/__tests__/bottleLedger.test.ts
  modified:
    - src/backend/engine/engineRegistry.ts
    - src/backend/engine/launchDeadline.ts
    - src/backend/engine/__tests__/launchDeadline.test.ts
    - src/backend/storeManagers/steam/gameBridgeLaunch.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
decisions:
  - "EngineKey: Steam keeps the bare numeric appId, every other store is runner:appName; the forms are disjoint (D-12)"
  - "armLaunchDeadline arg and LaunchDeadline field renamed appId -> key; the single Steam call site updated"
  - "Steam marks the ledger just before startBottleProcessMonitor and clears it wherever clearEngineSelection runs on the bridge path (D-16)"
metrics:
  completed: 2026-11-07
  tasks: 2
---

# Phase 61 Plan 05: Engine game key and per-bottle ledger Summary

Collision-free `EngineKey` for every store (Steam's bare appId kept), the registry and launch deadline re-keyed onto it, and a timer-free per-bottle running-games ledger that Steam bridge launches already feed.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 gameKey + re-keyed registry/deadline | 0993bb9d8 | engineKeyFor rejects `/`, `\`, NUL, `..`, >255 chars, unknown runners |
| 2 bottleLedger + Steam wiring | af171d823 | mark at monitor start; clear in onStopped, no-monitor, wine-reject and catch paths |

## Deviations from Plan

**1. [Rule 3 - Blocking] games.test.ts mock of bottlePrimitives lacked sanitizeBottleName.** The ledger calls it, which threw in the launch path and failed 89 tests. Added a pure-function stand-in to the existing mock. Commit af171d823.

Log label text changed from `appId N` to the bare key in the registry and deadline lines; no test matched the old text.

## Verification

- engine and steam jest suites: only the four known pre-existing failures remain (bottle DRM_LAUNCH_FORM, games channel constants, macArchKnownFixRouting Intel; tauriShellSource not in this scope).
- `pnpm boundaries` clean. `pnpm lint` fails only on the known tests-scope ceiling; new files add 0 warnings and games.test.ts / gameBridgeLaunch.ts warning counts are unchanged.
- No timers in bottleLedger; launchDeadline keeps `unref?.()`.

## Known Stubs

None.

## Self-Check: PASSED
