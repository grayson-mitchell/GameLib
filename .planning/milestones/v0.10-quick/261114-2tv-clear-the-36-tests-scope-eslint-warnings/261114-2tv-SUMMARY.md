---
phase: quick-261114-2tv
plan: 01
subsystem: testing
tags: [eslint, lint-ceiling, jest, require-await, tests-scope]
requires: []
provides:
  - "pnpm lint:tests back under TESTS_CEILING (647 of 661)"
affects: [".husky/pre-push", ".github/workflows/lint.yml"]
tech-stack:
  added: []
  patterns: ["async-free mocks returning Promise.resolve", "jest.mocked(obj).method instead of jest.mocked(obj.method)"]
key-files:
  created: []
  modified:
    - src/backend/humble/__tests__/steamAppIdResolver.test.ts
    - src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts
    - src/backend/storeManagers/steam/__tests__/stopSteamLaunchedGame.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.betaBranch.test.ts
    - src/backend/storeManagers/steam/__tests__/library.runningPoll.test.ts
    - src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts
    - src/backend/storeManagers/steam/__tests__/updateDetection.exit.test.ts
    - src/backend/storeManagers/steam/__tests__/updateInfo.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/bridgeUpdateFollowUps.test.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/valveClient.test.ts
    - src/backend/humble/__tests__/library.realstore.test.ts
    - src/backend/humble/__tests__/library.test.ts
    - src/frontend/state/__tests__/libraryState.test.ts
    - src/backend/storeManagers/steam/__tests__/library.localLibrary.test.ts
    - src/frontend/screens/Game/GamePage/components/__tests__/SteamBridgeRouteSummary.test.tsx
    - src/backend/storeManagers/steam/localFiles/__tests__/oracle/normalize.ts
    - src/backend/storeManagers/steam/__tests__/updateBridge.test.ts
decisions:
  - "TESTS_CEILING stays 661; meta/lintScoped.cjs and eslint.config.mjs untouched. Ratcheting down is a separate decision once CI's ubuntu count is visible."
metrics:
  duration: "~25 min"
  completed: 2026-11-14
status: complete
commits: 3
plan_head_before: d033e88f69dbf25983b693dd11c92c67b0df8890
plan_head_after: 0a09ba886
actuals:
  tokens: 6000
  tasks: 3
  commits: 3
---

# Phase quick-261114-2tv Plan 01: Clear the 36 tests-scope ESLint warnings Summary

Cleared the 36 tests-scope ESLint warnings added since `fba351fbe` by changing test code only (async-free mocks returning `Promise.resolve`, mocked-object method access, a typed `requireActual`, an explicit symbol/function branch). `pnpm lint:tests` went 683 to 647 (cold), `tests: PASS`, 14 under the 661 ceiling.

## Measurements

| Check | Before (BASE dc1ace1f2) | After |
| --- | --- | --- |
| Cold `pnpm lint:tests` | 683 warnings, `tests: FAIL` | 647 warnings, `tests: PASS` |
| Headroom vs TESTS_CEILING 661 | -22 | +14 |
| Per-file ESLint over the 17 files | 62 | 26 |
| Jest over `suites.txt` | 28 suites, 507 tests, 22 failing in 6 suites, 7 pending | 507 tests, 22 failing, 0 newly failing |
| `pnpm codecheck` | exit 2 at baseline (see Deviations) | exit 0 |
| `pnpm backend-di-ceilings` | n/a | PASS |
| prettier --check on the 17 paths | n/a | clean |
| `pnpm lint:src` (information only) | n/a | `production: PASS` (1090 warnings, 0 errors) |

Stepwise: Task 1 warm `lint:tests` was 675 (683 - 8, as expected); final cold run is 647 (683 - 36).

### Per-file before / after

| File | Before | After |
| --- | --- | --- |
| steamAppIdResolver.test.ts | 8 | 0 |
| library.localLibrary.test.ts | 5 | 0 |
| SteamBridgeRouteSummary.test.tsx | 4 | 0 |
| stopSteamLaunchedGame.test.ts | 3 | 0 |
| depot.betaBranch.test.ts | 1 | 0 |
| steamLaunchWatch.test.ts | 1 | 0 |
| updateDetection.exit.test.ts | 1 | 0 |
| updateInfo.test.ts | 1 | 0 |
| bridgeUpdateFollowUps.test.ts | 1 | 0 |
| updateBridge.test.ts | 1 | 0 |
| oracle/normalize.ts | 1 | 0 |
| macSteamAdoption.test.ts | 10 | 7 |
| libraryState.test.ts | 11 | 9 |
| valveClient.test.ts | 6 | 5 |
| library.realstore.test.ts | 3 | 2 |
| library.test.ts | 3 | 2 |
| library.runningPoll.test.ts | 2 | 1 |
| **Total** | **62** | **26** |

The 26 remaining are the pre-existing warnings in the six mixed files, left untouched as planned.

## Commits

- `083921bb0` test(quick-261114-2tv): clear require-await in steamAppIdResolver tests (Task 1, tracer)
- `45bf78590` test(quick-261114-2tv): clear new require-await warnings in steam, humble and libraryState tests (Task 2, 12 files)
- `0a09ba886` test(quick-261114-2tv): clear unbound-method, unsafe-any, base-to-string and unused-directive warnings (Task 3, 4 files)

`plan_head_before` is `d033e88f6`, the HEAD when the first commit was made. The peer session's commit `0d918e51f` (quick 261114-2yj, docs only) landed after Task 3; the 3 commits above are this plan's.

## Changes made

- **require-await (25 sites, 17 in Task 2 plus 8 in Task 1):** dropped `async` and returned `Promise.resolve(...)` (R1/R2), or dropped `async` only on `it`/`test` callbacks with no await (R4). No gratuitous awaits; no side-effect reordering.
- **library.localLibrary (5 unbound-method):** `jest.mocked(steamLibraryStore).get`.
- **SteamBridgeRouteSummary (4):** typed `jest.requireActual<typeof import('./gamelibT')>`, removed its no-require-imports suppression; `n as ReactNode[]` in `find`; direct className comparison in `badge`.
- **oracle/normalize.ts (1):** explicit `symbol`/`function` branch returning `v.toString()`, then an unreachable `TypeError`. No golden output changes (localFiles replay/golden suites unchanged vs baseline).
- **updateBridge.test.ts (1):** removed the unused file-level unbound-method directive.
- No `eslint-disable` was added in any of the 17 files; two were removed.

## libraryState attribution correction

The orchestrator brief attributed libraryState's +2 to `import-x/no-duplicates`. They are `require-await` at lines 490 and 514. The duplicate-import warnings at lines 3 and 10 are blamed `^fba351fbe` and predate the range, so they stay (libraryState ends at 9).

## Deviations from Plan

### Environment notes (not code deviations)

**1. Baseline `pnpm codecheck` failed on a peer's in-flight work.**
- At the Task 1 baseline, `pnpm codecheck` exited 2: `meta/__tests__/sidecarExitCheck.test.ts(22,3): TS2305 ... no exported member 'exitCodeFor'`. That file belongs to the concurrent session working quick 261114-2yj, not this plan's 17 files. `tsc --noEmit` (src) was clean. The peer then landed `exitCodeFor` and `pnpm codecheck` exited 0 at the Task 2 and Task 3 checks. The plan's "exit 0 at baseline" assumption did not hold at that single instant, for a reason outside this plan's scope.

**2. Per-file count gates held exactly.** No drift from the peer's edits was observed: the cold tests-scope total was exactly baseline minus 36.

Otherwise: plan executed as written. No Rule 1-4 deviations.

## Follow-up

- Consider ratcheting TESTS_CEILING down (currently 661, actual 647 on this Windows box) once CI's ubuntu count is visible. Deliberately not done here: pinning the ceiling to a Windows-only measurement could turn lint CI red over a platform delta. Headroom is 14.
- A pre-existing "Unused eslint-disable directive (no-require-imports)" warning at `207:5` of some other tests-scope file is in the baseline too and is not part of the 36.

## Known Stubs

None.

## Threat Flags

None. Test-scope files only; no package or lockfile changes (`git diff --stat dc1ace1f2 -- package.json pnpm-lock.yaml` empty).

## Self-Check: PASSED

- 17 files exist and all three commits (083921bb0, 45bf78590, 0a09ba886) are in `git log`.
- `git diff --quiet dc1ace1f2 -- meta/lintScoped.cjs eslint.config.mjs` exits 0.
- Zero added `eslint-disable` lines across the 17 files.
