# Phase 78 Test Health (DEBT-06 proof)

## Proof head

- Proof head: `a96dab654` (`fix(78-05): split gameLaunch.ts under the 1000-line steam ceiling`), measured 2026-11-17 from a clean `git worktree add --detach` checkout of that sha. The main tree was dirty with unrelated edits and played no part in any run.
- An earlier proof pass at `f526f45f8` found two un-masked reds; the fixes are listed under D-04 and every number below is from the re-run at `a96dab654`.

## Four suites

- Targeted run (`npx jest --runTestsByPath` on the four files): `Test Suites: 4 passed, 4 total`, `Tests: 209 passed, 209 total`.
- Full `pnpm test:ci`: `Test Suites: 13 failed, 5 skipped, 1023 passed, 1036 of 1041 total`; `Tests: 135 failed, 36 skipped, 21673 passed`. Each of the four has a `PASS` line and none has a `FAIL` line:
  - `PASS Backend src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts`
  - `PASS Backend src/backend/sidecar/__tests__/installFlows.test.ts`
  - `PASS Backend src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts`
  - `PASS Backend src/backend/sidecar/__tests__/testContainment.test.ts`
- The four pass in the full run; 13 other suites red, see todo `.planning/todos/pending/2026-11-16-full-suite-red-outside-debt-06.md`. This record does not claim the full suite is clean.

## Arch independence (D-03)

- Mechanism: the test mocks `backend/constants/environment` (lines 67-72 of macArchKnownFixRouting.test.ts, `isAppleSiliconMac: true` by default) and flips `isAppleSiliconMac` itself for the "Intel: never seeds and does not take the bottle-branch result" case (line 286). The result does not depend on the host CPU.
- Simulated hosts (`SIM_PLATFORM`/`SIM_ARCH` set through a `--setupFiles` that redefines `process.platform` and `process.arch`; a probe test printed `SIM linux x64`, `SIM darwin x64`, `SIM linux arm64`, `SIM win32 x64`, so the override reached the sandbox). macArchKnownFixRouting passed, 4 of 4 tests, on linux/x64, darwin/x64, linux/arm64 and win32/x64.
- CI ubuntu-latest: Test workflow run `43927197182` on sha `b5f54b045efe8fe15b2791b49d37c71c302ff2f6` (2026-11-16; `c3cdea41e` is an ancestor of it; job runs on `ubuntu-latest`). Log line: `PASS Backend src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts`. The run's overall conclusion was failure, from other suites. No 78-UAT item is needed.

## Attribution (D-02)

Each pair was re-run in the clean worktree (commit's parent, then the commit); all reproduced.

| Suite | Red at | First green | Cause | Pair observed |
| --- | --- | --- | --- | --- |
| macArchKnownFixRouting ("Intel: never seeds...") | `10dfe024d` (quick 261105-ord); also `2cd7e1a34` (vfq parent) and `1c423224d` (vfq tip) | `c3cdea41e` (66.3-08, config slices) | Not a test defect and not host dependent; the red case flipped when the 66.3-08 config-slice refactor landed. The mechanism is inferred from the bisect, not traced line by line (research A1). | `c3cdea41e^`: FAIL (1 failed, 2 passed); `c3cdea41e`: PASS (3 passed); `2cd7e1a34^` and `2cd7e1a34`: FAIL; `1c423224d^` and `1c423224d`: FAIL |
| installFlows | `3e8823f00` (54-03) | `022de9cd2` (56-30, stub pinning) | Stubs unpinned after 54-03 changed the flow; 56-30 pinned them | `022de9cd2^`: FAIL (1 failed, 22 passed); `022de9cd2`: PASS (23) |
| runnerSliceRegistration | `3e8823f00` | `f118e0c81` (quick 261029-nmt, channel pin) | Channel list not pinned; quick 261029-nmt pinned it | `f118e0c81^`: FAIL (2 failed, 93 passed); `f118e0c81`: PASS (95) |
| testContainment | `3e8823f00` | `ca4cd8f2d` (56-30, channel pin) | Same channel pin cause as runnerSliceRegistration | `ca4cd8f2d^`: FAIL (1 failed, 54 passed); `ca4cd8f2d`: PASS (55) |

Verdict: quick 261105-vfq's "pre-existing" claim for macArch was true. The macArch case was already red at vfq's parent (`2cd7e1a34`) and at its tip (`1c423224d`); vfq did not cause it and did not fix it. The only caveat is A1 above: which line of 66.3-08 turned it green is inferred.

Phase 54's deferred-items.md and the vfq SUMMARY are left as they are (D-15).

## Lint and ratchets (D-16a, D-20)

Cold run at `a96dab654` (`.eslintcache-src` and `.eslintcache-tests` deleted):

| Check | Result |
| --- | --- |
| `node meta/lintScoped.cjs` | `production: PASS | tests: PASS`; production 957 warnings against SRC_CEILING 1130, tests 566 against TESTS_CEILING 661; 0 errors |
| `pnpm prettier` | pass |
| `pnpm find-deadcode` | pass (335 baselined knip findings) |
| `pnpm boundaries` | pass (no dependency violations) |
| `pnpm steam-line-ceiling` | pass (187 files scanned, 0 allowlisted over 1000) |
| `pnpm gameinfo-narrowing-ceiling` | pass |
| `pnpm planning-gates` | pass |
| `pnpm backend-di-ceilings` | **FAIL, not fixed here**: jestMock ratchet, five frontend tests (NoticeStackTwoToast 7 and steamLoginPollLifecycle 4 with no baseline entry; GameStatus.bottleWaiting, .redistSpinner, .steamUpdate 8 against baseline 7) |

Ceilings unchanged: `meta/lintScoped.cjs` and `meta/backendDiCeilings/*.json` were not edited. The backend-di-ceilings step cannot be closed by editing a baseline (the contract forbids raising or adding one), and clearing it means rewriting five jsdom/component tests to drop `jest.mock`; one attempt (dropping the SteamUpdateInfo stub) made the suite fail to load, so it is filed as `.planning/todos/pending/2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md`. The lint workflow is therefore green for ESLint and every other step but still red on the DI ceilings step.

The folded todo 2026-11-14-lint-workflow-red-masks-ratchet-steps moved to `todos/completed/` with a resolution note.

## D-04 fixes

Found by the first proof pass at `f526f45f8`, which the un-masking of Plan 78-04 made visible:

1. `18f56e464`: `@typescript-eslint/no-this-alias` error in `inviteBridge.test.ts:111` (introduced by 78-03's IN-01 test). Collected the sockets in an array instead of aliasing `this`; 20 tests pass.
2. `a96dab654`: `src/backend/storeManagers/steam/gameLaunch.ts` was 1131 lines against the 1000 ceiling (steamLineCeiling.test.ts red as a result). `showEngineDialog`, `drmOfflinePrecheck` and `prepareDrmBottleForCrossover` moved verbatim to the new `gameEngineDialogs.ts`; gameLaunch.ts is 965 lines. `gamesModuleSurface` forbids a re-export, so gameBridgeLaunch.ts imports the two preflights from the new file. tsc, prettier, boundaries, find-deadcode and the 4 suites touching these modules pass (755 tests).

Not fixed: the backend-di-ceilings jestMock reds above (todo filed).
