---
phase: 66-backend-dependency-injection-replacing-module-level-singleto
plan: 03
subsystem: backend
tags: [di, testing, fakes]
requires: ["66-01"]
provides:
  - "createScriptedRunner, createFakeClock, createCaptureLog, createRealRunner, createTestContext"
  - "src/backend/process/README.md: documented test context and slice convention"
affects: [66-08]
tech-stack:
  added: []
  patterns: ["per-instance fakes, no module state", "generic TestContext<R> avoids a runner cast"]
key-files:
  created:
    - src/backend/testUtils/scriptedRunner.ts
    - src/backend/testUtils/fakeClock.ts
    - src/backend/testUtils/captureLog.ts
    - src/backend/testUtils/realRunner.ts
    - src/backend/testUtils/testContext.ts
    - src/backend/process/README.md
key-decisions:
  - "TestContext is generic over the runner type (default ScriptedRunner) so a runner override needs no cast"
  - "ScriptedCall is not exported: knip flagged it as an unused type"
requirements-completed: []
duration: 20min
completed: 2026-11-10
---

# Phase 66 Plan 03: Test fakes and createTestContext Summary

Tests can now script process results, drive time and build a full `AppContext` from fakes without mocking `child_process` or using jest fake timers. The real-runner arm runs under a fresh fake HOME, and its `openDetached` throws.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 Scripted runner, fake clock, capture log | 2e74e4eb5 | 17 tests |
| 2 Real runner, createTestContext, README | 2900e0caf | 8 more tests, README 89 lines |

## Verification

`pnpm jest src/backend/testUtils` and `fakeHomeIsolation.test.ts` pass (unchanged); `pnpm codecheck`, `pnpm backend-di-ceilings`, `pnpm find-deadcode` and prettier pass.

## Deviations from Plan

**1. [Rule 3 - Blocking] `ScriptedCall` un-exported.** `pnpm find-deadcode` reported it as a new knip finding; it is only used inside the module.

## Known Stubs

None.

## Self-Check: PASSED
