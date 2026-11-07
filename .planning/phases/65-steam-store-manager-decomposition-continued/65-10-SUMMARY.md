---
phase: 65-steam-store-manager-decomposition-continued
plan: 10
subsystem: backend/storeManagers/steam
tags: [decomposition, closeout, verification, cycle-census]
requires: ["65-09"]
provides:
  - "65-baseline-steam-cycle-modules.txt (128 pre-phase cycle modules, for later plans' D-19 check)"
affects: []
key-files:
  created:
    - .planning/phases/65-steam-store-manager-decomposition-continued/65-baseline-steam-cycle-modules.txt
  modified:
    - "unused imports and fixtures from the library split (commit 4de9ce3a7)"
    - src/backend/storeManagers/steam/library/__tests__/library.refresh.test.ts
key-decisions:
  - "D-19 cycle census measure changed from raw edge count to: no module outside the pre-phase cycle set (65-baseline-steam-cycle-modules.txt) may join a cycle, except modules split out of files that were already in it. Raw counts 321 (pre) and 425 (now) recorded for reference."
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 10: Closeout battery and live smoke run 1 Summary

Automated battery and live macOS smoke run 1 done. Two fix commits cleared phase-65 lint debt (4de9ce3a7, fcfc0a1ca). Under the revised D-19 measure the cycle census passes.

## Battery results

| Check | Result |
| --- | --- |
| codecheck | 0 |
| lint | 0 after fixes (before: 21 phase-65 errors; test warnings 686 vs ceiling 661; pre-phase was already 668; now 581) |
| find-deadcode | 1, not phase 65: 28 failures exist at c40f3ab81 (61-02); 17 in ipc schemaTypes/channelSchemas/ipcValidation/ipcDomainParse from 67-02 (810e3da00, 8f4a4b0da, 4ee26928e). No finding names a steam file |
| boundaries | 0 |
| steam-line-ceiling | 0 (8 allowlist keys) |
| indexedAccessRatchet | 1, not phase 65: same buckets fail pre-phase; steam tests 423 = baseline |
| i18n | 0 |
| steam jest | 4385 tests (= baseline), 3 failures all in baseline, 0 runtime-error suites |
| adjacent jest | 7 failures, none phase 65: testContainment Block C (67-02 test files), runTsSignals T8 (SIGTERM race under load, passes alone), plus known logSecretGate x2, tauriShellSource, genI18nGateScope, x86CallbackWineHarness |
| unref tests | 9 pass |
| build:sidecar-sea | 0 |
| smoke:sidecar | PASS |
| graphify update | 0 |

## Cycle census (D-19)

Raw edge count: 425 now vs 321 baseline. All 19 modules newly in cycles are split products of library.ts or bottle.ts, both already in cycles: bottledSteam, bridgeBottle, bridgeBottleLifecycle, provisionBottle, and library/{acfState, index, installPollOnce, installPolling, installRoot, installStop, installedMap, macArch, pollState, refresh, restartHold, resume, resumeBreadcrumbs, runningPoll, uninstallPolling}. library.ts and src/backend/cache.ts are no longer in any cycle.

**Decision (user):** the measure changes from raw edge count to "no module outside the pre-phase cycle set may join a cycle, except modules split out of files already in it". Under it, 65-10 passes. The baseline module list is saved as `65-baseline-steam-cycle-modules.txt` (sorted unique modules from both sides of each `a -> b` line, 128 entries) for later plans.

## Live macOS smoke run 1

`pnpm tauri:dev`; sidecar build/main/sidecar.js built 07:24, after HEAD fcfc0a1ca (07:15), so it contains the changes.

1. Library refresh: pass
2. Bridged title launch and running indicator: pass
3. Grim Dawn 219990 DRM mode: done (reached the menu and quit)
4. Small install (install polling / restart hold): pass
5. Uninstall polling: not individually reported; covered by the operator's overall "approved"; re-check in 65-20 smoke run 2.

## Deviations from Plan

**1. [Rule 1] Lint fixes** for phase-65 errors: unused imports/fixtures (4de9ce3a7) and a file-level eslint-disable with reason for unbound-method in library.refresh.test.ts (fcfc0a1ca).

## Pre-existing, left alone

find-deadcode, indexedAccessRatchet and the adjacent jest failures listed above.

## Known Stubs

None.

## Self-Check: PASSED

Commits 4de9ce3a7 and fcfc0a1ca exist; baseline module list written.
