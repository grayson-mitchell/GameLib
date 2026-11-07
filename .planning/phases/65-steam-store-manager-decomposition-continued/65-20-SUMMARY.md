---
phase: 65-steam-store-manager-decomposition-continued
plan: 20
subsystem: backend/storeManagers/steam
tags: [decomposition, closeout, verification, cycle-census, line-ceiling]
requires: ["65-19"]
provides:
  - "Phase 65 done-line met: every non-test steam source file is at or below 1,000 lines"
affects: []
key-files:
  modified:
    - src/backend/storeManagers/steam/library/__tests__/games.test.ts
    - meta/knip-baseline.txt
key-decisions:
  - "Cycle census passes under the 65-10 user-decision rule (no module outside the pre-phase cycle set joins a cycle unless split out of a file already in it)."
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 20: Final closeout battery and live smoke run 2 Summary

Final battery and live macOS smoke run 2 done on the final tree. Two fix commits cleared the last lint error and stale knip baseline lines. The D-01 done-line is met.

## Task 1 commits

- ad5bbe3b9 fix(65-20): `require('node:fs')` became `jest.requireActual<typeof import('node:fs')>('node:fs')` in games.test.ts `failNextRmSync` (the only lint error, from c3ddef301). `pnpm lint` exits 0 with 582 warnings.
- 4bcac32d2 fix(65-20): removed 7 stale steam lines from meta/knip-baseline.txt that plans 65-11 to 65-18 had made obsolete: runBridgeLaunch, installBridgeGameLeased, provisionBridgeBottleForInstall, resolveInstallEngineSettings, runNativeDepotDownload, runNativeDepotDownloadLeased, showEngineDialog.

## Done-line (D-01)

Every non-test steam source file is at or below 1,000 lines. Largest: depot/downloadFiles.ts 996, gameLaunch.ts 940, depot/download.ts 939. steamLineCeilingBaseline.json is `{}`.

## Battery results

| Check | Result |
| --- | --- |
| steam-line-ceiling | 0 |
| boundaries | 0 |
| codecheck | 0 |
| lint | 0 (582 warnings) |
| i18n | 0 (one call returned 254 on a clean tree; three reruns returned 0) |
| find-deadcode | 1, not phase 65: 44 FAIL lines, none names a file phase 65 touched. 28 already fail at c40f3ab81 (stale steam/engine baseline lines from the 61-02 engine move) and 17 come from 67-02 |
| indexedAccessRatchet | 1, not phase 65: every failing bucket is outside steam; steam tests bucket 423 = baseline. Drift belongs to concurrent quick-261108-cut work |
| steam jest | 4389 tests (baseline file 4385; +4 from the 65-12 policy tests), 0 runtime-error suites, 1 failure (baseline macArch Intel case); `comm -23` against baseline printed nothing |
| adjacent jest | 7 failures matching 65-10's list: logSecretGate x2, tauriShellSource, genI18nGateScope, x86CallbackWineHarness, testContainment Block C, runTsSignals T8. steamAuthSessionPolicy hit one runtime error from run order (reads a gitignored generated .cjs before build:sidecar-sea creates it); alone it passes 15/15 |
| test:ci | 1; its 7 failures are a subset of the union of the two baselines |
| unref tests | 9 pass |
| build:sidecar-sea | 0 |
| smoke:sidecar | PASS |
| graphify update | 0 |

## Cycle census (D-19)

Raw count 482 against a 321 baseline. 37 modules are new in cycles and 2 have left (library.ts, cache.ts). All 37 were split out during phase 65 from files already on the baseline list. This PASSES under the 65-10 user-decision rule.

depcruise diff since c40f3ab81 (2653abda6, 51ce405ac, 0bfd02bab) is additions only: the new `no-library-index-back-edge` error rule, and the games-split leaf alternation extended with `InstallBridge|InstallDepot|BridgeWineLaunch|BridgeLaunchGate|Metadata` and `|bridgeInstallState`.

## D-04 size table

42 modules created in the phase (`git diff --name-only --diff-filter=A c40f3ab81..HEAD`, non-test, `wc -l`; 13,203 lines total). Only bridge/shimPlacement.ts (835) is over the ~800 target; none is over 850.

| Lines | Module |
| ---: | --- |
| 835 | bridge/shimPlacement.ts |
| 680 | gameInstallBridge.ts |
| 628 | gameBridgeWineLaunch.ts |
| 618 | library/refresh.ts |
| 614 | bridgeBottleLifecycle.ts |
| 567 | gameInstallDepot.ts |
| 515 | bridgeBottle.ts |
| 473 | library/installPollOnce.ts |
| 452 | library/installPolling.ts |
| 447 | provisionBottle.ts |
| 436 | library/acfState.ts |
| 415 | library/resume.ts |
| 411 | userSignIn.ts |
| 409 | bottledSteam.ts |
| 389 | bridge/helperSpawn.ts |
| 373 | library/uninstallPolling.ts |
| 371 | bridge/shimOriginals.ts |
| 328 | library/index.ts |
| 307 | gameMetadata.ts |
| 287 | bridge/drm/runnerCrossover.ts |
| 268 | library/installedMap.ts |
| 258 | bridge/drm/runnerVerify.ts |
| 258 | bridge/drm/drmRestore.ts |
| 237 | library/installRoot.ts |
| 209 | library/macArch.ts |
| 203 | bridge/helperRegistry.ts |
| 196 | bridgeInstallState.ts |
| 195 | library/restartHold.ts |
| 192 | library/runningPoll.ts |
| 189 | bridge/drm/runnerEntitlements.ts |
| 183 | bridge/drm/drmRegistry.ts |
| 182 | library/resumeBreadcrumbs.ts |
| 175 | library/pollState.ts |
| 175 | bridge/drm/bottleProcesses.ts |
| 138 | userRedeem.ts |
| 132 | bridge/shimDrmWrapper.ts |
| 107 | userTypes.ts |
| 93 | bridgeRouteVerdict.ts |
| 86 | gameBridgeLaunchGate.ts |
| 81 | userSignInState.ts |
| 69 | bridge/drm/stageDrmTypes.ts |
| 22 | library/installStop.ts |

## Live macOS smoke run 2

`pnpm tauri:dev`; build/main/sidecar.js built 09:23:57, after HEAD 9e5aa097d (09:23:54), so it contains the final changes. The operator typed "approved". All five items pass:

1. Library refresh: pass
2. Bridged launch and running indicator: pass
3. Grim Dawn 219990 DRM mode: pass
4. Small install (polling and restart hold): pass
5. Uninstall polling: pass

## Deviations from Plan

**1. [Rule 1] Lint error** in games.test.ts (ad5bbe3b9) and **2. [Rule 3] stale knip baseline lines** (4bcac32d2), both described above.

## Pre-existing, left alone

find-deadcode (44 lines), indexedAccessRatchet, and the adjacent jest failures listed above.

## Known Stubs

None. 65-13 removed 5 stubs and quick-261108-ca6 removed the remaining 10 (3ebf3dabf, c44cb7c12, 0c242e0ce). None are retained under D-19, so the VERIFICATION stub gap list is empty. See 65-19-SUMMARY.
