---
phase: 65-steam-store-manager-decomposition-continued
plan: 11
subsystem: backend/storeManagers/steam
tags: [decomposition, gameInstall, split]
requires: ["65-10"]
provides:
  - "steam/bridgeInstallState.ts, steam/gameInstallDepot.ts, steam/gameInstallBridge.ts (flat siblings split out of gameInstall.ts)"
affects: [65-19]
key-files:
  created:
    - src/backend/storeManagers/steam/bridgeInstallState.ts
    - src/backend/storeManagers/steam/gameInstallDepot.ts
    - src/backend/storeManagers/steam/gameInstallBridge.ts
  modified:
    - src/backend/storeManagers/steam/gameInstall.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/gameBridgeLaunch.ts
    - src/backend/storeManagers/steam/gameMaintenance.ts
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/backend/storeManagers/steam/__tests__/gamesModuleSurface.test.ts
    - src/backend/storeManagers/steam/__tests__/installLocation.test.ts
    - src/backend/__tests__/steamAuthSessionPolicy.test.ts
    - meta/knip-baseline.txt
    - meta/steamLineCeilingBaseline.json
key-decisions:
  - "No gameInstall <-> gameInstallBridge cycle: install() reaches installBridgeGame through the SteamGame stub already, so the D-19 fallback was not needed and no todo was filed."
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 11: Split gameInstall.ts Summary

gameInstall.ts (1,953 lines) is split into four flat siblings by pure moves; it is now 602 lines and its steamLineCeiling allowlist entry is deleted (7 keys remain).

## Line counts (D-04 target ~800)

| File | Lines |
| --- | --- |
| gameInstall.ts | 602 |
| gameInstallBridge.ts | 678 |
| gameInstallDepot.ts | 544 |
| bridgeInstallState.ts | 196 |

## Commits

- e6c25ce1f: move bridge install state to bridgeInstallState
- 445e3deb4: move native depot download engine to gameInstallDepot
- 9d5e170ad: move bridge-bottle install to gameInstallBridge
- 0ebd9fbd3: drop unused imports left by the split (found by `pnpm lint`)

## Wiring

- Edges: gameInstall -> {gameInstallDepot, bridgeInstallState briefly, until commit 3}; gameInstallBridge -> {gameInstall (ensureBuiltInEngineForInstall), bridgeInstallState, gameInstallDepot}; bridgeInstallState and gameInstallDepot are leaves. games.ts imports installBridgeGame from gameInstallBridge. The `.dependency-cruiser.cjs` leaf rule (`games-split-modules-are-leaves`) already named all three files.
- gamesModuleSurface: all three added to LIFTED_OWNERS and to the FORWARD ordering (bridgeInstallState 0, gameInstallDepot 0, gameInstall 1, gameInstallBridge 2).
- steamAuthSessionPolicy: Rule E allow-list gained gameInstallDepot.ts and gameInstallBridge.ts (gameInstall.ts keeps its own `install()` prescreen call); Rule I (`allowLogon: true` exactly once) now expects gameInstallBridge.ts. Both stay non-vacuous through the existing exact-count assertions.
- installLocation source scan (37-REVIEW C-01) repointed to gameInstallDepot.ts, where the UnsafeInstalldirError handler now lives; its throw-if-not-found guard is the non-vacuity check.
- knip baseline: markBridgeGameInstalled, installDepotDownload, installResultForRefusal deleted (now imported cross-module); runNativeDepotDownload(+Leased) retargeted to gameInstallDepot.ts; installBridgeGameLeased, provisionBridgeBottleForInstall, resolveInstallEngineSettings retargeted to gameInstallBridge.ts. crossoverRequiredError, hasBottledSteamCopy, removeDemotedNativeOrphan stay on gameInstall.ts.
- No test imported a moved free function directly (only comments and test names mention them), so no describe blocks moved (D-03/D-17 satisfied; no new test files).

## Verification

- codecheck, boundaries, steam-line-ceiling (149 files, 7 allowlisted), find-deadcode (no gameInstall*/bridgeInstallState findings; other findings pre-existing), steamAuthSessionPolicy 14/14, steam jest 4385 tests = baseline, 0 runtime-error suites, no new failing names. prettier clean. indexedAccess: steam bucket 423 = baseline (other buckets fail pre-existing).
- `pnpm lint`: no errors from this plan. One tests-scope error (`no-require-imports` at games.test.ts:221) comes from another session's uncommitted edit to games.test.ts and is not mine.

## Cycle census (D-19, revised rule)

Raw count 452 (baseline 321, 65-10 recorded 425). Modules newly in cycles versus `65-baseline-steam-cycle-modules.txt`: the 19 already accepted in 65-10 (bottledSteam, bridgeBottle, bridgeBottleLifecycle, provisionBottle, 15 under library/) plus three from this plan: bridgeInstallState, gameInstallBridge and gameInstallDepot. All three are split products of gameInstall.ts, which is on the baseline list. The rule passes.

## Deviations from Plan

None to the plan's intent. Method note: moves were done with a script that cut by symbol range and regenerated each file's import block from the original, pruning names unused outside comments; two unused imports it missed (`resolve`, `bottle`) were caught by lint and removed in 0ebd9fbd3. Some interstitial comments in the original import block were not carried to the new files.

## Known Stubs

None.

## Self-Check: PASSED

Commits e6c25ce1f, 445e3deb4, 9d5e170ad, 0ebd9fbd3 exist; the three new files exist.
