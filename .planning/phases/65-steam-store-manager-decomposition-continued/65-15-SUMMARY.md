---
phase: 65-steam-store-manager-decomposition-continued
plan: 15
subsystem: steam-store-manager
tags: [refactor, decomposition, bridge-helper, sidecar-exit-contract]
requires: [65-14]
provides: [bridge/helperRegistry.ts, bridge/helperSpawn.ts]
affects: [utils.ts, inviteBridge.ts, games.ts, gameLaunch.ts, gameBridgeWineLaunch.ts]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/helperRegistry.ts
    - src/backend/storeManagers/steam/bridge/helperSpawn.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperRegistry.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperSpawn.test.ts
  modified:
    - src/backend/storeManagers/steam/bridge/helperProcess.ts
    - src/backend/utils.ts
    - src/backend/storeManagers/steam/bridge/inviteBridge.ts
    - src/backend/storeManagers/steam/{games,gameLaunch,gameBridgeWineLaunch}.ts
    - meta/steamLineCeilingBaseline.json
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 15: helperProcess split Summary

`bridge/helperProcess.ts` (1,143) split into `helperRegistry.ts` (203, single owner of the `helpers` map, the three test overrides, their seams and getters, `unrefHandle`, `installExitTeardownOnce`, stop/shutdown/reset), `helperSpawn.ts` (389, `ensureHelperSpawned`, line parsers, `classifyInitFlatError`) and `helperProcess.ts` (readiness, 609). helperProcess left the ceiling allowlist; the baseline now holds 3 keys (runnerClone, stageDrmBottle, shimGenerate).

## Commits
- b72efb176 refactor(65-15): add registry accessors before the helperProcess split (non-pure)
- edb8f556b refactor(65-15): move bridge helper registry state to helperRegistry.ts
- b6f4d61c1 refactor(65-15): move helper spawn and stderr line parsing to helperSpawn.ts
- 16a0a1d8d test(65-15): split helperProcess tests by owning module

## Verification
- Steam suite: numTotalTests 4389 (>= 4389), numRuntimeErrorTestSuites 0, failing names not in 65-baseline-steam.txt: 0 (1 failed test, the baseline macArch one).
- `pnpm build:sidecar-sea && pnpm smoke:sidecar`: PASS (built, started, READY, exited 0 on stdin EOF).
- `npx jest -t unref src/backend/storeManagers/steam`: 9 passed, 4380 skipped (7 suites passed).
- Unref ownership: `unrefHandle` and `installExitTeardownOnce` (the only `process.on('exit')`) live in helperRegistry with the `helpers` map; helperSpawn calls them, readiness keeps its sleep/timer unrefs. Single-owner grep: 5 `let/const` state decls in helperRegistry, 0 in helperSpawn and helperProcess.
- ChildProcess-`let` source assertion now scans helperProcess, helperRegistry and helperSpawn, asserts each file read is non-empty, and positively requires `const helpers = new Map<` in one of them.
- codecheck, boundaries, steam-line-ceiling (3 allowlisted), lint: clean for my files; only the known games.test.ts `require()` error remains. find-deadcode and indexedAccess ratchet show only pre-existing drift outside steam (steam buckets equal baseline).

## Cycle rule
Census raw count 474 (65-14: 473). New modules in cycles vs 65-baseline-steam-cycle-modules.txt: `bridge/helperRegistry.ts` and `bridge/helperSpawn.ts`, both split products of helperProcess.ts (on the list). Remaining differences are the earlier split products already recorded in 65-13/65-14.

## Deviations
- Task 2 specified two pure-move commits; test updates for repointed imports rode with each move and the test file split landed as a third commit (16a0a1d8d), since the old test file had to stay green between moves.
- Task 1: knip flags the three new getters until the move; I did not add them to `meta/knip-baseline.txt` because they are consumed by commit 2 and find-deadcode was already red from pre-existing drift. The transient steamLineCeiling bump (1143->1159) in Task 1 was removed in commit 2 (file dropped under 1,000).
- `helpers` is exported via `export { helpers }` so the single-owner grep (`^const helpers`) holds.
- macArchKnownFixRouting, removeCopies, steamStartupKeyringDeferral gained a `helperRegistry` mock (`stopBridgeHelper: jest.fn()`) because games.ts now imports it from there.

## Known Stubs
None.

## Self-Check: PASSED
