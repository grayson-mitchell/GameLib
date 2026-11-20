---
phase: 61-unified-macos-engine-for-all-stores
plan: 07
subsystem: macos-engine
tags: [per-game-bottle, prefix-rule, pinned-engine-progress]
requires: ["61-01", "61-03", "61-04", "61-06", "61-08"]
provides:
  - "src/backend/engine/perGameBottle.ts: perGameBottleName, createCrossoverBottle, ensureGameBottle"
  - "src/backend/engine/gamePrefix.ts: resolveGamePrefix"
  - "src/backend/engine/pinnedEngineProgress.ts: ensurePinnedEngineReportingStatus"
affects: [61-09, 61-10, 61-14, 61-16]
key-files:
  created:
    - src/backend/engine/perGameBottle.ts
    - src/backend/engine/gamePrefix.ts
    - src/backend/engine/pinnedEngineProgress.ts
    - src/backend/engine/__tests__/perGameBottle.test.ts
    - src/backend/engine/__tests__/gamePrefix.test.ts
    - src/backend/engine/__tests__/pinnedEngineProgress.test.ts
    - src/backend/engine/__tests__/fixtures/stub-cxbottle.sh
  modified:
    - src/backend/storeManagers/steam/gameInstall.ts
key-decisions:
  - "Bottle name `GameLib-<runner>-<encoded appName>`; cap held at 64 (spike 068 accepted 120, but 64 is the plan ceiling and fits every real id)"
  - "Dots kept literally (spike 068 dotsAccepted true) except inside a run of dots, where each is escaped to _2e"
  - "Per-game state inferred from wineCrossoverBottle equality, not engine key presence (D-02/D-05)"
requirements-completed: [D-01, D-02, D-03, D-04, D-05]
duration: n/a
completed: 2026-11-07
---

# Phase 61 Plan 07: Per-game bottle and prefix rule Summary

Non-Steam games get a deterministic per-game CrossOver bottle name, created lazily with CrossOver (capped `cxbottle --create`) or the pinned engine through the shared `createFallbackBottle`, and `resolveGamePrefix` is the single pure rule for legacy / CrossOver bottle / per-game bottle / plain prefix.

## Commits

- 6ff74b2d6 - perGameBottle.ts, pinnedEngineProgress.ts, Steam delegation, tests, stub cxbottle fixture
- 6af21d9a4 - gamePrefix.ts and tests

## Verification

- `jest src/backend/engine` plus games.test.ts: 1068 passed, 1 failed (the known pre-existing "channel constants equal the 56-01 SUMMARY values"). fakeHomeIsolation passes.
- `pnpm boundaries` clean, `tsc --noEmit` clean, prettier clean, eslint 0 errors and 0 new warnings (the 3 i18next warnings in gameInstall.ts are pre-existing sites; one was replaced by the equivalent call).
- `createFallbackBottle(` used in perGameBottle.ts, no `wineboot` there, no `storeManagers` import in the new engine files, gamePrefix.ts has no fs calls.
- Key links checked by grep: createFallbackBottle, decideCreationEngine, ensurePinnedEngineReportingStatus in gameInstall.ts.

## Deviations from Plan

**1. [Rule 1 - Plan inconsistency] Long-name test uses 255 chars, not 300.** `engineKeyFor` rejects appNames over 255, so a 300-char appName returns null by design; the truncation test uses 255 (254 `x` plus a differing last char).

**2. [Rule 2 - hardening] `ensureGameBottle` sanitizes the bottle name** (`sanitizeBottleName(name) === name`) before any work, and `createCrossoverBottle` does the same before the spawn.

**3. ensurePinnedEngineReportingStatus returns `reason` too.** The plan shape was `{ ok:false; aborted; error }`; Steam's i18n message needs the `EnsureResult` reason, so `reason` was added.

**4. Test spawn model.** `backend/utils` `spawnAsync` is replaced in perGameBottle.test.ts by an `execFile` shim using `mockProfile.childEnv()`, with a stub `cxbottle` (fixtures/stub-cxbottle.sh) whose behaviour is chosen by bottle name (hang, no conf, success).

## Decisions

- Cap 64; dots literal outside dot runs (recorded per the plan's request).
- `createCrossoverBottle` leaves Steam's CrossOver arm untouched; phase 65 should fold it onto this one.

## Known Stubs
None.

## Self-Check: PASSED
