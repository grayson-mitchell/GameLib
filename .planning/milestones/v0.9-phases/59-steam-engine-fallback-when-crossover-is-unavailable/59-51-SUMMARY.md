---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 51
subsystem: steam-engine
tags: [G30, WR-02, dxvk, crossover, engine-switch]
requires: []
provides:
  - strict DXVK restore settling on process exit
  - post-restore CrossOver wineserver stop
  - per-bottle serialisation of prepareBottleForEngine
affects: [tools/index.ts, engineSwitch]
key-files:
  modified:
    - src/backend/tools/index.ts
    - src/backend/tools/__tests__/dxvkInstallRemove.test.ts
    - src/backend/storeManagers/steam/engine/engineSwitch.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineSwitch.test.ts
decisions:
  - "wineboot -u stays in the restore; dropping it and batching the deletes are deferred to the 59-52 todos"
metrics:
  completed: 2026-11-03
  tasks: 2
requirements-completed: [G30, WR-02]
---

# Phase 59 Plan 51: Strict DXVK restore settles on exit (G30) and per-bottle switch serialisation (WR-02) Summary

The strict (source-pinned) DXVK restore now runs each reg delete and `wineboot -u` with `wait: false` and `resolveOnExit: true`, and `prepareBottleForEngine` serialises per bottle.

## Changes

- tools/index.ts: flags are chosen from `strict`; the Heroic toggle restore keeps `wait: true`. Ordering, failure detection and last-removed version file are unchanged.
- engineSwitch.ts: after a healthy-CrossOver restore (success or failure) the bottle's CrossOver wineserver is stopped once via `deps.killWith`. The unhealthy branch is unchanged.
- engineSwitch.ts: exported `prepareBottleForEngine` is a wrapper chaining on a module-level `Map<bottle, Promise>`; the body re-reads the marker, so a waiting call returns `changed: false`. A rejected first call does not block later ones; the entry is cleared on settle.
- Tests: 3 G30 tests plus 1 flags test for the toggle path, 3 WR-02 tests plus a different-bottle test. An existing test ("marker wineserver that does not exist is not spawned") now expects the single post-restore CrossOver stop.

## Deviations from Plan

Both tasks were committed together in one commit (07f6eb84a) because both edit engineSwitch.ts and its test file. Otherwise none.

## Verification

dxvkInstallRemove, engineSwitch, offlineRefusal and games suites pass (660 + 57 tests); prettier clean; eslint 0 errors; `pnpm codecheck` clean; launcher.ts untouched.

## Self-Check: PASSED
