---
phase: 78-verification-records-and-test-health-after-v0-9
plan: 05
subsystem: test-health
tags: [DEBT-06, clean-worktree, attribution, lint, ratchets]
requires: [78-01, 78-02, 78-03, 78-04]
provides:
  - 78-TEST-HEALTH.md (DEBT-06 proof, attribution, lint and ratchet results)
  - grouped todo for the 13 red suites outside the four
  - folded lint todo closed
affects: [gameLaunch.ts, gameBridgeLaunch.ts, inviteBridge.test.ts]
key-files:
  created:
    - .planning/phases/78-verification-records-and-test-health-after-v0-9/78-TEST-HEALTH.md
    - src/backend/storeManagers/steam/gameEngineDialogs.ts
    - .planning/todos/pending/2026-11-16-full-suite-red-outside-debt-06.md
    - .planning/todos/pending/2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md
  modified:
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/gameBridgeLaunch.ts
    - src/backend/storeManagers/steam/bridge/__tests__/inviteBridge.test.ts
    - .planning/todos/completed/2026-11-14-lint-workflow-red-masks-ratchet-steps.md
decisions:
  - "gameLaunch.ts split by moving showEngineDialog, drmOfflinePrecheck and prepareDrmBottleForCrossover to gameEngineDialogs.ts; no re-export (gamesModuleSurface forbids it)."
  - "backend-di-ceilings jestMock reds (five frontend tests) not fixed: the ratchet forbids a baseline edit and the fix is a test rewrite; filed as a todo."
metrics:
  tasks: 2
  files: 8
completed: 2026-11-17
---

# Phase 78 Plan 05: DEBT-06 proof and test health Summary

DEBT-06 is proven from a clean worktree at a96dab654: the four suites pass targeted (209 of 209) and in the full `pnpm test:ci` run, each is attributed to a commit pair that was re-run and reproduced, and 13 other suites that are still red are tracked in one todo (the record does not claim a green full suite).

## Commits

- 18f56e464: fix(78-05) clear the `no-this-alias` lint error in the inviteBridge IN-01 test
- a96dab654: fix(78-05) split gameLaunch.ts under the 1000-line steam ceiling
- b080b752a: docs(78-05) proof record, grouped red-suite todo, lint todo closed

## Results

- Targeted 4/4 pass; full run 13 failed, 1023 passed, 135 failing tests; none of the four fails.
- macArch passes under simulated linux/x64, darwin/x64, linux/arm64, win32/x64; CI run 43927197182 (ubuntu-latest) shows it PASS, so no 78-UAT item was needed.
- Attribution pairs all reproduced (macArch c3cdea41e, installFlows 022de9cd2, runnerSliceRegistration f118e0c81, testContainment ca4cd8f2d). macArch was also red at vfq's parent and tip, so quick 261105-vfq's "pre-existing" claim was true.
- Cold `lintScoped.cjs`: production PASS (957 / 1130), tests PASS (566 / 661). prettier, find-deadcode, boundaries, steam-line-ceiling, gameinfo-narrowing-ceiling and planning-gates pass. Ceilings untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `no-this-alias` error in inviteBridge.test.ts**
- Found during: Task 1 cold lint at f526f45f8 (tests scope failed)
- Fix: collect sockets in an array instead of aliasing `this`
- Files: src/backend/storeManagers/steam/bridge/__tests__/inviteBridge.test.ts
- Commit: 18f56e464

**2. [Rule 3 - Blocking] gameLaunch.ts over the steam line ceiling (1131 > 1000)**
- Found during: Task 1 `pnpm steam-line-ceiling` and the full run (steamLineCeiling.test.ts red)
- Fix: moved three functions verbatim to gameEngineDialogs.ts, updated the gameBridgeLaunch import; first attempt re-exported showEngineDialog and failed gamesModuleSurface, so the re-export was dropped
- Files: gameLaunch.ts (now 965 lines), gameEngineDialogs.ts, gameBridgeLaunch.ts
- Commit: a96dab654

### Deferred Issues

**backend-di-ceilings jestMock ratchet still red** (five frontend tests: NoticeStackTwoToast, steamLoginPollLifecycle, three GameStatus suites). Raising or adding a baseline is forbidden, and clearing it means rewriting jsdom/component tests; one attempt (dropping the SteamUpdateInfo stub) broke suite loading, so I stopped. This departs from plan truth D-16(a)/D-04, which listed backend-di-ceilings among the steps that must pass. Filed as `.planning/todos/pending/2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md`, and the lint todo's resolution note says so. The CI Lint workflow stays red on that one step.

## Known Stubs

None.

## Self-Check: PASSED

78-TEST-HEALTH.md, gameEngineDialogs.ts, both new todos and the completed lint todo exist; commits 18f56e464, a96dab654, b080b752a exist; the proof worktree is removed.
