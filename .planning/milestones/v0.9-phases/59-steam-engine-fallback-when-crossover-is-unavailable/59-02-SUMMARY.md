---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 02
subsystem: steam-engine
tags: [crossover, demo-status, engine-types, tested-builds]
requires: []
provides:
  - engineTypes (EngineSelection contract, engineLogLabel)
  - parseDemoStatus / probeDemoStatus (bounded CrossOver trial-state probe)
  - TESTED_CROSSOVER_BUILDS, readCrossoverBuild, one-time untested notice state
  - steamEngineNoticeStore
affects: [59-05, 59-07, 59-10]
tech-stack:
  added: []
  patterns: [unref'd cap timer, settle-once promise, fake-profile child env in tests]
key-files:
  created:
    - src/backend/storeManagers/steam/engine/engineTypes.ts
    - src/backend/storeManagers/steam/engine/demoStatus.ts
    - src/backend/storeManagers/steam/engine/testedCrossoverVersions.ts
    - src/backend/storeManagers/steam/engine/__tests__/demoStatus.test.ts
    - src/backend/storeManagers/steam/engine/__tests__/testedCrossoverVersions.test.ts
    - src/backend/storeManagers/steam/engine/__tests__/fixtures/stub-wine.sh
  modified:
    - src/backend/storeManagers/steam/electronStores.ts
key-decisions:
  - "Demo-status cap 15 s (spike 060: 4.2 s cold)"
  - "Probe is the declared real-profile arm; tests use createFakeHomeProfile().childEnv()"
requirements-completed: [D-09, D-15]
duration: 10min
completed: 2026-11-01
---

# Phase 59 Plan 02: Engine leaf modules Summary

Anchored demo-status parser, a bounded unref'd `wine --demo-status` probe with distinct failure reasons, shared engine types, and a warn-never-block tested-CrossOver-builds record with persisted one-time notice state.

## Commits
- 3b91b6a23: engine types and demo-status probe (Task 1)
- 145ac0b43: tested versions record, notice store (Task 2)

## Verification
demoStatus, testedCrossoverVersions and fakeHomeIsolation jest suites pass; `pnpm codecheck` passes; prettier clean.

## Deviations from Plan
None - plan executed as written.

## Known Stubs
None.

## Self-Check: PASSED
