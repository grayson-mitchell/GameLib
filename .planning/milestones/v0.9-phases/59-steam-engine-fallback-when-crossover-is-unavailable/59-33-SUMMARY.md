---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 33
subsystem: steam-engine
tags: [gap-closure, sidecar-boot, exit-contract]
requirements-completed: [G20]
key-files:
  modified:
    - src/backend/storeManagers/steam/engine/fallbackEngine.ts
    - src/backend/storeManagers/steam/engine/__tests__/fallbackEngine.test.ts
    - src/backend/sidecar/bootstrap.ts
  created:
    - src/backend/sidecar/__tests__/engineTempSweepBootWire.test.ts
metrics:
  tasks: 2
  completed: 2026-11-03
---

# Phase 59 Plan 33: Boot sweep of stale engine temp dirs Summary

A synchronous `sweepStaleEngineTemps()` removes `steam-engines/.tmp-*` directories left by an interrupted engine unpack, called once at sidecar boot behind a module-scope once-guard.

## Commits
- 7ee7a771e: sweepStaleEngineTemps in fallbackEngine (+6 G20 tests)
- f8f0740f0: once-guarded boot call in bootstrap.ts (+ dedicated boot wiring test)

## Verification
- fallbackEngine suite 25/25 pass; engineTempSweepBootWire + bootstrap suites pass; `pnpm codecheck` and `pnpm smoke:sidecar` green; prettier and eslint clean (warnings only).
- Static import of fallbackEngine into bootstrap was fine (no import-time work); no `require` fallback needed.

## Boot sweep cost
Deleting a synthetic 264 MB tree (2500 files, 50 dirs) with `fs.rmSync` recursive took 95 ms on this machine (APFS). The real `.tmp-wine-*` tree is similar in size, so READY is delayed by roughly 0.1 s once, only after an interrupted unpack; a clean boot adds one `readdirSync`. Acceptable, and it avoids async or unref'd deletion, which would leave in-flight boot work (exit contract half 2).

## Deviations from Plan
None of substance. The first commit attempt for Task 1 was blocked by a lint error (`require()` in the test); fixed by using `jest.requireActual`/`jest.requireMock`, then committed. The "throwing sweep does not stop boot" and "once-guard" behaviors are covered in one test since the guard is consumed by the first `init()`.

## Known Stubs
None.

## Self-Check: PASSED
