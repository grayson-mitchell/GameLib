---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 05
subsystem: steam-engine
tags: [bottle, engine-registry, wineserver]
requires: [59-02, 59-03]
provides:
  - engine/engineRegistry.ts (setEngineSelection, getEngineSelection, clearEngineSelection)
  - bottle.ts buildFallbackGameSettings, engine-aware getBridgeBottleSettings, killBottleWineServerWith, killBridgeBottleWineServer
affects: [59-06, 59-07, 59-10]
key-files:
  created:
    - src/backend/storeManagers/steam/engine/engineRegistry.ts
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/engine/engineTypes.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
decisions:
  - "Dispatch order in getBridgeBottleSettings: DRM runner, then non-CrossOver engine, then stock CrossOver"
  - "Kill dispatch lives once in killForRegisteredEngine, used by stop, end and killBridgeBottleWineServer"
metrics:
  tasks: 2
  files: 4
  completed: 2026-11-01
---

# Phase 59 Plan 05: Engine registry and engine-aware bottle Summary

A session-scoped engine registry lets one call switch a title's bridge bottle to a pinned or Wine Manager engine, and `getBridgeBottleSettings` plus the wineserver kill follow it without touching any of the 18 callers.

## What was built
- `engineRegistry.ts`: in-memory map, numeric appId guard, existence check on wine and wineserver binaries, defensive copy, launch-log line. Nothing persisted (D-07).
- `bottle.ts`: `buildFallbackGameSettings(bottleName, engine)` (type `wine`, engine wine/wineserver, per-game prefix, auto DXVK/VKD3D off, `USER=crossover`, `WINEDEBUG=-all`, `MVK_CONFIG_LOG_LEVEL=0`, conflicting global env keys stripped). DRM stays first in dispatch.
- `killBottleWineServerWith` (scope-fenced, WINEPREFIX set last) and `killBridgeBottleWineServer`; `stopPerGameBridgeBottle` and `endPerGameBridgeBottleSession` use the shared three-way dispatch.
- 14 new tests in `Phase 59 engine registry`.

## Deviations from Plan
- [Rule 3] Exported `NonCrossoverEngine` from engineTypes.ts (was module-private) because bottle.ts needs the type.
- Both tasks landed in a single commit (`4c4d2776d`) because they edit the same files and tests interleaved.

## Verification
bottle.test.ts and fakeHomeIsolation.test.ts pass (183 tests); `pnpm codecheck` clean; prettier applied.

## Known Stubs
None. Exports unused until 59-06/59-10 carry ts-prune-ignore markers.

## Self-Check: PASSED
