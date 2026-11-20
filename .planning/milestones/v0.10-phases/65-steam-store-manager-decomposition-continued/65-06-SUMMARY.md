---
phase: 65-steam-store-manager-decomposition-continued
plan: 06
subsystem: backend/storeManagers/steam
tags: [decomposition, library-split, refresh-lift, depcruise]
requires: ["65-05"]
provides:
  - "steam/library/refresh.ts (refresh, refreshInstallState free functions; syncOwnedLibrary module-private)"
  - "steam/library/index.ts holds SteamLibraryManager (library.ts removed)"
  - "depcruise rule no-library-index-back-edge"
affects: []
key-files:
  created:
    - src/backend/storeManagers/steam/library/refresh.ts
    - src/backend/storeManagers/steam/__tests__/library.refresh.test.ts
  modified:
    - src/backend/storeManagers/steam/library/index.ts (git mv from library.ts)
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts
    - src/backend/storeManagers/steam/__tests__/steamDepotSkipCopyCensus.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/frontend/screens/Game/GamePage/components/__tests__/steamResumeCopyCensus.test.ts
    - src/backend/__tests__/steamAuthSessionPolicy.test.ts
    - .dependency-cruiser.cjs
    - meta/__tests__/boundaryGates.test.ts
key-decisions:
  - "syncOwnedLibrary is not exported: only refresh() calls it, and knip flags an unused export"
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 06: refresh lift and library/index.ts Summary

`refresh()`, `syncOwnedLibrary` and `refreshInstallState` are free functions in `library/refresh.ts` (617 lines); `library.ts` moved to `library/index.ts` (328 lines, default export only, no re-exports); a seeded depcruise rule forbids sibling back-edges into the index. Steam suite: 4385 tests (= baseline), 0 runtime-error suites, no failing name outside the baseline. `build:sidecar-sea` and `smoke:sidecar` pass.

## Commits

- 7bacc036c lift refresh into library/refresh free functions (D-07, mechanical, own commit)
- 64c47a0e7 repoint steamAuthSessionPolicy allow-lists to library/refresh.ts
- 73492c0a0 git mv library.ts to library/index.ts (D-05)
- 51ce405ac no-library-index-back-edge rule plus two seeded arms

## Class one-liners (quoted)

```ts
async refresh(): Promise<ExecResult | null> { return refresh() }
async refreshInstallState(): Promise<void> { return refreshInstallState() }
```

Only `this.` rewrites in the lifted bodies were `this.refreshInstallState()` and `this.syncOwnedLibrary(...)`; the two other `this.refresh()` hits were comments (reworded). `grep -c "this\." refresh.ts` = 0. Behaviour nuance: inside `refresh()`, the call to `refreshInstallState` no longer passes through an instance spy. skeletonFlows and steamFocusRefreshWire (25 tests) still pass because they spy the class methods, which remain.

## Module sizes (all under 1,000; D-04 target ~800)

refresh 617, installPollOnce 473, installPolling 455, acfState 438, resume 416, uninstallPolling 375, index 328, installedMap 268, installRoot 240, macArch 209, restartHold 195, runningPoll 192, resumeBreadcrumbs 182, pollState 175. No library entry remained in steamLineCeilingBaseline.json (removed in 65-05), so it was not touched.

## Deviations from Plan

**1. [Rule 3] steamAuthSessionPolicy.test.ts** (not in files_modified). Rules E and F listed `library.ts` as an allowed `acquireAuthenticated(`/`acquireOpenAuthenticated(` caller; the calls now live in `library/refresh.ts`, so both rules failed after the lift. Allow-lists repointed (own commit 64c47a0e7).

**2. [Rule 3] games.test.ts A-19 census** read `library.ts`; it now scans every `library/*.ts` with non-vacuity asserts. steamResumeCopyCensus retargeted to `library/index.ts`. steamDepotSkipCopyCensus already pointed at installPollOnce.ts (only a describe title was fixed). metadataCapture source gate repointed to `library/refresh.ts` in the lift commit (its import-regex variant uses `../metadataCapture`).

**3. Test split.** refresh/refreshInstallState describes (library.test.ts L528-2031, L2100-2762) moved to library.refresh.test.ts with a copied mock preamble and beforeEach; unused imports and fixtures pruned in both files.

**4. `syncOwnedLibrary` unexported** after `pnpm find-deadcode` flagged it as a new knip finding.

## Pre-existing failures observed, left alone

`pnpm find-deadcode` engine/IPC drift; indexedAccessRatchet (engine, scanners, sidecar, testUtils, tools, wiki_game_info, frontend/screens; steam tests 423 = baseline, unchanged here); tauriShellSource (Rust `.title(format!`), logSecretGate (utils/uninstaller.ts:131), genI18nGateScope, x86CallbackWineHarness in the Meta project. None touch files in this plan.

## Known Stubs

None.

## Self-Check: PASSED

refresh.ts, index.ts and library.refresh.test.ts exist; library.ts absent; commits 7bacc036c, 64c47a0e7, 73492c0a0, 51ce405ac present.
