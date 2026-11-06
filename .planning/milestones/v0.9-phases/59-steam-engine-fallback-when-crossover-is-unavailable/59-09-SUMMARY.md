---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 09
subsystem: steam-engine
tags: [steam, bridge, install, crossover-fallback]
requires: [59-06, 59-07, 59-08]
provides:
  - Route-aware CrossOver gate in SteamGame.install() (blocks only the bottled-Steam route)
  - Engine-aware bridge bottle creation in installBridgeGame() with on-demand pinned engine download
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
decisions:
  - "Engine download failure is a precondition failure: error result plus terminal 'done' status, never markBridgeFailedThisSession or steamBridgeSetupRequired"
  - "CROSSOVER_CREATE_TIMEOUT and a CROSSOVER_MISSING race both fall back to built-in engine creation instead of erroring"
  - "Engine modules are imported lazily inside installBridgeGame"
metrics:
  tasks: 2
  completed: 2026-11-01
---

# Phase 59 Plan 09: Install without CrossOver Summary

A Windows Steam title on the bridge route now installs on a Mac with no CrossOver. The pinned built-in engine downloads on first need and creates the same per-game bottle.

## What changed

- `install()`: `crossoverMissing` is computed where the old gate was. It is enforced after the final route is known, and only when `route !== 'bridge'`. It returns `crossoverRequiredError()` before the route notice or any bottled dispatch, and never marks the bridge failed.
- `installBridgeGame()`: calls `decideCreationEngine`.
  - Pinned decision: ensure the pin, then `provisionBridgeBottle({ fallbackEngine })`.
  - CrossOver decision: `provisionBridgeBottle({ createTimeoutMs })`. A licensed user never downloads the engine. On `CROSSOVER_CREATE_TIMEOUT` or `CROSSOVER_MISSING` it ensures `ENGINE_PINS.current` and retries with `fallbackEngine` (D-12).
- `ensureBuiltInEngineForInstall`: sends `engine-download` statuses once per whole percent. On failure it sends a terminal `done` and returns the `steam.engine.downloadFailed` error.
- Tests: updated the CrossOver precondition tests (bridge route proceeds; the bottled route, via known-bad and acknowledged, still errors). Added 6 engine-aware creation tests. All 506 tests in the file pass, and `pnpm codecheck` is clean.

## Deviations from Plan

None in behaviour. Both tasks edit the same two files with interleaved tests, so they went into one commit (`5aa2d499c`) rather than two.

## Known Stubs

None.

## Self-Check: PASSED

Commit 5aa2d499c exists. games.ts and games.test.ts are changed.
