---
phase: 87-engine-wine-and-tools
plan: 22
subsystem: infra
tags: [rust, wine, port-complete, delete-gate, d-06, d-16]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the Rust wine manager (87-19) and the switch of its three native channels (87-20); the per-slice delete gate (87-03)
provides:
  - describe('wineDownloadsPortComplete') green, added red first
  - the TS wine manager (utils), the downloader (main, utilities, constants), their five tests and the wine-manager oracle deleted
  - the single-stream download quirk filed as a todo (D-16)
affects: [87-37 (the TS DXMT still reads the wineDownloaderInfoStore mirror in stores.ts), 87-48 (fallback engine download), later Phase 87 delete gates]

actuals:
  tokens: 2400
  tasks: 2
  commits: 3

plan_head_before: ddb6e3db2fd6aeb0f25295ad75dd03d6487d3f7e
plan_head_after: 1b0bc1f0d0d7d690e350c8d2e7dcc005455bd158

tech-stack:
  added: []
  patterns:
    - "a sub-slice delete gate is added red (16 failures with the files present), then the TS deleted and the gate run green"

key-files:
  created:
    - .planning/todos/pending/2026-11-23-fallback-and-wine-downloads-are-single-stream.md
  modified:
    - src/backend/__tests__/engineWinePortComplete.test.ts
    - src/backend/sidecar/__tests__/wineToolsFlows.test.ts
    - src/common/types.ts
    - meta/backendDiCeilings/sidecar-tests-wineTools.json
    - knip.jsonc
  deleted:
    - src/backend/wine/manager/utils.ts
    - src/backend/wine/manager/downloader/main.ts
    - src/backend/wine/manager/downloader/utilities.ts
    - src/backend/wine/manager/downloader/constants.ts
    - src/backend/wine/manager/__tests__/removeWineVersion.test.ts
    - src/backend/wine/manager/downloader/__tests__/main/getter.test.ts
    - src/backend/wine/manager/downloader/__tests__/utilities/geProtonArch.test.ts
    - src/backend/wine/manager/downloader/__tests__/utilities/rest.test.ts
    - src/backend/wine/manager/downloader/__tests__/utilities/unzip.test.ts
    - src/backend/wine/manager/downloader/__tests__/test_data/ (github-api-test-data.json, test.tar.xz, test.tar.gz)
    - src/backend/wine/__tests__/oracle/wineManager.oracle.test.ts
    - meta/backendDiCeilings/wine.json

key-decisions:
  - "stores.ts and the wineDownloaderInfoStore mirror stay (kept list and a preservation check in the gate): the TS DXMT still reads them until 87-37"
  - "The three downloader test_data fixtures only served the deleted unit tests (nothing else references them), so they were deleted with them; every golden and recorded wine_manager fixture stays"
  - "Forbidden identifiers are the ones only the deleted modules named (updateWineListsIfOutdated, WineManagerDeps, getAvailableVersions, fetchReleases, PROTONGE_URL, WINESTAGINGMACOS_URL); installWineVersion, removeWineVersion and updateWineVersionInfos stay legitimate native-channel and renderer names"

requirements-completed: [SVC-02]

duration: 25 min
completed: 2026-11-23
---

# Phase 87 Plan 22: wine-downloads TS deleted Summary

**The TS wine manager and its downloader are gone one plan after 87-20 switched their last caller; `wineDownloadsPortComplete` guards the deletion and the copied single-stream download is filed as a todo.**

## Accomplishments

- `describe('wineDownloadsPortComplete')` added to `engineWinePortComplete.test.ts` and run red first (16 failures: the ten files still present, the forbidden identifiers, nothing else), then green after the deletion. Its kept list guards the golden and recorded `wine_manager` fixtures and `stores.ts` (T-87-69); `manifestSlice: 'wine'` with a floor of 5 channels means no sidecar `ipc.handle` or `ipc.on` may register a wine-slice channel.
- Deleted the four manager modules, their five unit tests, the orphaned downloader `test_data`, and the wine-manager oracle test (3234 lines).
- Todo `2026-11-23-fallback-and-wine-downloads-are-single-stream.md` (`severity: minor`, `platform: any`, `ready: code`): the Rust port downloads with one stream where the TS EasyDl used five ranged connections; 87-48 adds the fallback engine to it (D-16).

## Task Commits

1. Task 1 (tracer): `25beaf808` feat(87-22): wineDownloadsPortComplete, and the TS wine manager and downloader deleted
2. Task 2: `3d588119a` docs(87-22): file the single-stream wine download quirk as a todo

Note: `1b0bc1f0d` (docs(quick-261123-pnl)) landed on main from another session between the two, so the measured `commits: 3` counts one commit that is not this plan's.

## Verification

- Tracer verify: utils.ts absent, stores.ts present; `engineWinePortComplete` and `engineWineShimSchedule` jest green; `cargo test -p gamelib-wine --features testing --test golden_wine_manager` 7 passed; `pnpm codecheck` clean; `pnpm find-deadcode` PASS (no ratchet increase); prettier clean over the written TS and JSON. Tracer verified end to end before expansion.
- Task 2 verify: `pnpm planning-gates` 12/12; `severity: minor` grep matches.
- Regression sweep: `jest src/backend/sidecar src/backend/__tests__ src/backend/wine src/backend/enginewine meta/__tests__` 312 suites passed; two failures: the known pre-existing `genI18nGateScope` A-17 ANTI-ROT, and a `depotPortComplete` ENOENT on a transient `meta/runTs.__probe__.cjs` written by a parallel meta test (a race; the suite passes alone, together with `infoPortComplete`, `engineWinePortComplete` and `engineWineShimSchedule`: 334 tests).
- `node meta/backendDiCeilings.cjs` PASS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A dead `jest.doMock` of the deleted `wine/manager/utils` in `wineToolsFlows.test.ts`**
- **Found during:** Task 1
- **Issue:** the isolated Windows-branch test mocked `../../wine/manager/utils`; a non-virtual mock of a missing module fails to resolve. The sidecar registers none of those handlers any more (87-20).
- **Fix:** dropped the mock; the file's `jestMock` ceiling shrank 10 to 9 in `meta/backendDiCeilings/sidecar-tests-wineTools.json` (the ratchet demands the shrink).
- **Files modified:** src/backend/sidecar/__tests__/wineToolsFlows.test.ts, meta/backendDiCeilings/sidecar-tests-wineTools.json

**2. [Rule 3 - Blocking] The ceilings shard `wine.json` listed only the five deleted tests**
- **Fix:** removed the now-empty shard.

**3. [Rule 3 - Blocking] knip ratchet: `Repositorys` and `VersionInfo` in `src/common/types.ts` became dead with the deleted modules**
- **Fix:** removed the `Repositorys` enum; `VersionInfo` is still extended by `WineVersionInfo` in the same file, so it is no longer exported. Also dropped the `du` `ignoreBinaries` entry and its comment (the only `du` runner was the deleted `utilities.ts`; knip raises no hint).
- **Files modified:** src/common/types.ts, knip.jsonc

**Total deviations:** 3 auto-fixed (all Rule 3). **Impact:** none on scope; all were consequences of the deletion.

## Issues Encountered

None. Stale prose mentions of the deleted `wine/manager/utils.ts` remain in comments (`wineToolsFlowRegistration.ts`, `electronReachLedger.test.ts`, `testContainment.test.ts`, `.github/copilot-instructions.md`, and two Rust doc comments that cite the TS they ported); they are historical and left as is.

## Known Stubs

None.

## Threat Flags

None. T-87-69 is mitigated: every `wine_manager` golden and recorded fixture and `stores.ts` survive, and `golden_wine_manager` passes.

## Next Phase Readiness

Ready for 87-23. `stores.ts` stays until 87-37.

## Self-Check: PASSED

- `src/backend/wine/manager/utils.ts` absent, `src/backend/wine/manager/stores.ts` present, the todo present.
- Commits `25beaf808` and `3d588119a` are ancestors of HEAD.
