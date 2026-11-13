---
phase: 75-steam-local-file-formats-in-rust
plan: 13
subsystem: steam-local-files
tags: [typescript, adapter, rustInvoke, parity-harness]
requires: [75-12]
provides:
  - invokeSteamFiles typed helper (Buffer args rejected at compile time)
  - steamFilesTypes result/arg mirrors of the crate
  - GAMELIB_STEAMFILES_TEXT / GAMELIB_STEAMFILES_SHORTCUTS env-only flags (default ts)
  - stubRustSteamFiles programmable test double
  - replayDeps / expectedFor replay-parity harness
affects: [75-14]
key-files:
  created:
    - src/backend/storeManagers/steam/localFiles/steamFilesTypes.ts
    - src/backend/storeManagers/steam/localFiles/rustSteamFiles.ts
    - src/backend/storeManagers/steam/localFiles/steamFilesFlags.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/rustSteamFiles.test.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/steamFilesFlags.test.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/replayParity.test.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/fixtures/stubRustSteamFiles.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/fixtures/replayParity.ts
decisions:
  - Flags are pure and silent on bad values (no warn-once latch, so no module state)
  - Tests spy on logger.logDebug with jest.spyOn rather than jest.mock, to avoid a new backend-di-ceilings jestMock violation
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 13: TS adapter layer Summary

A typed `invokeSteamFiles` adapter, two env-only dev flags, a programmable stub and a replay harness that runs recorded Rust results through real TS wrappers, ready for parallel caller plans.

## Commits
- 2076d6431 feat(75-13) types, invokeSteamFiles, flags
- 73dea4ed9 feat(75-13) stub and replay-parity harness

## Deviations from Plan
- Rule 1: the plan's EntryField union was assumed to use `type`; the crate tags it `kind` (string/int32), so the TS type uses `kind`.
- tdd="true" on Task 1: tests and implementation landed in one commit (no separate RED commit), because the test cannot compile without the module.
- Tests use `jest.spyOn(logger, 'logDebug')` instead of a `jest.mock` of the logger, since the real logger has no writer outside the sidecar and a jest.mock would add a backend-di-ceilings violation. Caller tests that reach invokeSteamFiles need the same spy.

## Deferred Issues (pre-existing)
- `pnpm backend-di-ceilings` fails on frontend jestMock baselines (none in localFiles).
- moduleStateCensus fails on `src/backend/humble/adapter.ts` libraryActionCache; not touched here.

## Known Stubs
None.

## Self-Check: PASSED
