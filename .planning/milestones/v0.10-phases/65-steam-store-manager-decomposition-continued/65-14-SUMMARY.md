---
phase: 65-steam-store-manager-decomposition-continued
plan: 14
subsystem: steam-store-manager
tags: [refactor, decomposition, bridge-launch]
requires: [65-13]
provides: [gameBridgeWineLaunch.ts]
affects: [games.ts stub import]
key-files:
  created: [src/backend/storeManagers/steam/gameBridgeWineLaunch.ts]
  modified:
    - src/backend/storeManagers/steam/gameBridgeLaunch.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/gamesModuleSurface.test.ts
    - meta/steamLineCeilingBaseline.json
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 14: gameBridgeLaunch split Summary

`fireBridgeWineLaunch` and `OVERLAY_EXIT_GRACE_MS` moved byte-for-byte to `gameBridgeWineLaunch.ts`; `gameBridgeLaunch.ts` dropped off the ceiling allowlist, which now holds only the four bridge/DRM files.

## Commit
- df1000cfd refactor(65-14): move fireBridgeWineLaunch to gameBridgeWineLaunch.ts

## Line counts (D-04)
- gameBridgeLaunch.ts: 570 (was 1183)
- gameBridgeWineLaunch.ts: 628

## Notes
- Unused imports pruned in both files by script (verified with `tsc --noUnusedLocals`). games.ts keeps the stub; it imports from `./gameBridgeWineLaunch`.
- gameBridgeWineLaunch is in LIFTED_OWNERS with FORWARD rank 4. No jest.mock factory named the moved symbol, so games.test.ts needed no change.
- No file `import`s `SteamGame` as a value in gameBridgeWineLaunch (type-only).

## Step-4 battery
- codecheck, boundaries, steam-line-ceiling (4 allowlisted: runnerClone, stageDrmBottle, helperProcess, shimGenerate): pass.
- lint: 0 errors in my files; only the known games.test.ts:223 require() error.
- find-deadcode, indexedAccess ratchet (outside steam), i18n gate output: pre-existing drift only; nothing mentions gameBridge*.
- Steam suite: numTotalTests 4389, numRuntimeErrorTestSuites 0, failing names not in 65-baseline-steam.txt: 0 (macArch Intel baseline failure expected).
- Adjacent suite: 0 runtime errors, 5637 tests; only non-baseline failure is the known testContainment Block C.

## Cycle rule
Census raw count 473 (65-13: 459). Diff against 65-baseline-steam-cycle-modules.txt: the only new module is gameBridgeWineLaunch.ts, a split product of gameBridgeLaunch.ts (on the list). The other differences vs the list are the earlier split products already recorded in 65-13 (bottledSteam, bridgeBottle*, bridgeInstallState, gameInstall*, gameMetadata, provisionBottle, library/*, userTypes). The +14 comes from gameBridgeWineLaunch plus its edges (it sits on the same gameLaunch/games cycles as its parent).

## Deviations
None. Pre-existing failures left alone per notes.

## Self-Check: PASSED
