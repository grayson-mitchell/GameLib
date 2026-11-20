---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 20
subsystem: steam-depot
tags: [steam-depot, rust, deletion, d-15, knip, sea]
requires: [73-19]
provides:
  - "The TS depot pipeline is gone: chunkDecode, crypto, decompress, decompressPool, decompressPoolSelfTest, decompressWorker, download, downloadFiles, fileAttributes, finalize, flagsCensus, hostHealth, inflightLimiter, machO, manifest, pathCollisions, reconcile, stallTracker and their unit tests"
  - "No decompress worker: no build:decompress-worker-dev, no meta/buildDecompressWorkerDev.ts, no SEA worker bundle or asset, no runDecompressPoolSelfTest, no GAMELIB_DECOMPRESS_POOL_SIZE"
  - "steam/depotPaths.ts (resolveContainedPath, PathTraversalError, sha1File) with its own tests"
  - "depot/finalizeAcf.ts (finalizeToSteam, canWriteFullOwnership) and depot/appManifest.ts (the ACF writer, renamed from manifest.ts) for the TS honest-empty finalize"
  - "depot/ holds only appinfoOrder, appManifest, cdnAuth, contentServers, finalizeAcf, index, outcome, plan, planModel, select, sharedRedist"
affects: [73-21]
tech-stack:
  added: []
  patterns:
    - "A survivor that imports a module on the delete list moves the symbol to a surviving module first, with its tests"
key-files:
  created:
    - src/backend/storeManagers/steam/depotPaths.ts
    - src/backend/storeManagers/steam/__tests__/depotPaths.test.ts
  modified:
    - src/backend/storeManagers/steam/depot/finalizeAcf.ts (renamed from finalize.ts; now holds canWriteFullOwnership)
    - src/backend/storeManagers/steam/depot/appManifest.ts (renamed from manifest.ts; buildAppManifestText un-exported)
    - src/backend/storeManagers/steam/__tests__/appManifest.test.ts (renamed from manifest.test.ts)
    - src/backend/storeManagers/steam/depot/contentServers.ts (ContentServerHostMeta)
    - src/backend/storeManagers/steam/depot/index.ts
    - src/backend/storeManagers/steam/depot/planModel.ts
    - src/backend/storeManagers/steam/depot/sharedRedist.ts
    - src/backend/storeManagers/steam/depotRust/install.ts
    - src/backend/storeManagers/steam/depotRust/jobBuilder.ts
    - src/backend/storeManagers/steam/depotRust/progress.ts
    - src/backend/storeManagers/steam/bridge/originalRestore.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.clobberGuard.test.ts
    - src/sidecar/index.ts
    - src/sidecar/installRejectionGuard.ts
    - src/backend/logger/index.ts
    - meta/buildSidecarSea.ts
    - meta/esbuildWorkerBundleShared.ts
    - meta/__tests__/buildSidecarSea.test.ts
    - meta/knip-baseline.txt
    - knip.jsonc
    - package.json
  deleted:
    - "18 depot/ pipeline modules listed under provides"
    - src/backend/storeManagers/steam/depot/lzmaLoader.ts
    - src/backend/storeManagers/steam/depot/lzmaLoaderCore.ts
    - src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts
    - meta/buildDecompressWorkerDev.ts
    - "tests: decompressPool, decompressWorkerRealBuild (+ 2 fixtures), depotPrimitives, fileAttributes, flagsCensus, hostHealth, inflightLimiter, pathCollisions, reconcile, lzmaNativeBinding, lzmaNativeSeaRealBuild"
key-decisions:
  - "finalizeToSteam, canWriteFullOwnership and the ACF writer survive: depotRust/install.ts (zero-depot install) and library/resume.ts (verify failure) still write an honest-empty ACF in TS, and Rust has no command for that. They moved to depot/finalizeAcf.ts and depot/appManifest.ts, and their tests moved with them"
  - "The worker's SEA bundle and asset were removed from build:sidecar-sea now, not in 73-21: its entry file is gone, so leaving the step would have broken the SEA build between the two plans"
  - "lzmaLoader, lzmaLoaderCore and lzmaNativeBinding were deleted here because knip found them dead once the worker went. Baseline lines may only be removed, so the alternative was widening the gate. lzma-native itself, its typedef, the native SEA asset and NATIVE_LZMA_REQUIRED_TRIPLES stay for 73-21"
  - "lzma and zstddec go in knip's ignoreDependencies. They are steam-user's runtime requires (patched), not first-party imports; 73-21 keeps both and gates their presence"
requirements-completed: [P73-F, D-15]
duration: ~2h
completed: 2026-11-10
---

# Phase 73 Plan 20: Delete the TS depot pipeline Summary

**The TS depot download pipeline, its decompress worker pool and both worker bundles are deleted (about 21k lines). The survivors moved first into `steam/depotPaths.ts`, `depot/finalizeAcf.ts` and `depot/appManifest.ts`, with their tests.**

## Performance

- **Duration:** about 2h
- **Completed:** 2026-11-10
- **Tasks:** 2 of 2
- **Diff:** 77 files changed, 349 insertions, 21,448 deletions

## Accomplishments

- **Pipeline modules removed.** All 18 modules on D-15's list are gone, with their unit tests.
- **Survivors moved first,** as the 73-19 handoff listed. Each moved symbol kept its tests:
  - `resolveContainedPath`, `PathTraversalError` and `sha1File` moved to the new `steam/depotPaths.ts`, with new tests. Its consumers are `sharedRedist.ts` and `bridge/originalRestore.ts`.
  - `ContentServerHostMeta` moved to `depot/contentServers.ts`.
  - `finalizeToSteam` and `canWriteFullOwnership` moved to `depot/finalizeAcf.ts`.
  - The ACF writer moved to `depot/appManifest.ts`.
  - `depot.clobberGuard.test.ts` seeds a literal ACF and stays.
- **depot.test.ts trimmed** from 5,232 lines to the survivor suites: censuses, completeness gate, failure helpers, finalize, content servers, progress formatters and the error classifier.
- **Worker removed everywhere:**
  - the sidecar self-test branch and its stdout carve-out
  - `build:decompress-worker-dev` and both `tauri:dev*` script steps
  - `meta/buildDecompressWorkerDev.ts`
  - the SEA worker bundle and asset
  - the `node-gyp-build` alias
  - `initHeadless`'s worker-only argument
- **Dead code cleared:** the EDepotFileFlag constants, the `DepotPlan`/`DepotPlanFile`/`DepotModeCounters` types, `FAILURE_LOG_CAP` and `PROGRESS_HEARTBEAT_MS`. Two knip baseline lines were removed and none were added.

## Task Commits

1. **Task 1: delete the pipeline modules, oracle and their tests** - `859b6d80e` (feat)
2. **Task 2: worker pool wiring, dev bundle and dead references** - `3afc5d6b0` (chore)

The TS oracle, `depotGolden.test.ts`, `depotLinktarget.test.ts`, `gen:depot-goldens` and the fixtures README note were already handled in 73-19. `expected.json` and the Rust golden are kept, and `cargo test -p gamelib-depot --test golden` passes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] finalize.ts and manifest.ts could not just be deleted**
- **Issue:** `finalizeToSteam` still has two TS callers: the zero-depot honest-empty install and the resume verify-failure fallback. It needs the ACF writer and the completeness gate.
- **Fix:**
  - `git mv` finalize.ts to finalizeAcf.ts and moved `canWriteFullOwnership` into it.
  - `git mv` manifest.ts to appManifest.ts, along with its test file.
  - The finalize, gate and census tests in depot.test.ts now read the new paths.
- **Commit:** 859b6d80e

**2. [Rule 3 - Blocking] The SEA build bundled the deleted worker**
- **Issue:** `bundleWorkerForSea()` throws when `decompressWorker.ts` is missing, which would break `build:sidecar-sea` and `tauri:dev:packaged`.
- **Fix:**
  - Removed the worker bundle, `SEA_WORKER_ASSET_KEY`, `buildWorkerEsbuildArgv` and `DECOMPRESS_WORKER_ENTRY_PATH`.
  - `buildSeaConfig` now starts with no assets.
  - Updated the buildSidecarSea tests to match.
  - Checked that the main SEA esbuild bundle builds with the new flag set and contains no `node-gyp-build` reference.
- **Commit:** 3afc5d6b0

**3. [Rule 3 - Blocking] lzmaNativeSeaRealBuild.test.ts needed the self-test**
- **Issue:** The test drives `GAMELIB_SIDECAR_SELFTEST=decompress-pool` against a real SEA build. Deleting the self-test (a planned step) leaves it nothing to run. 73-21 had it on its own delete list.
- **Fix:** Deleted the test here. Also removed `installRejectionGuard.ts`'s SELFTEST stdout carve-out and its test case: the stdout redirect is now unconditional.
- **Commit:** 859b6d80e

**4. [Rule 3 - Blocking] knip found the lzma loader stack dead**
- **Issue:** `lzmaLoader.ts`, `lzmaLoaderCore.ts` and `lzmaNativeBinding.ts` had no consumer left, and baseline lines may only be removed.
- **Fix:** Deleted all three, `lzmaNativeBinding.test.ts`, the `--alias:node-gyp-build` flag and the gitignored generated `.cjs` on disk. Moved the `LzmaModule` type into lzmaLoaderCore before deleting it.
- **Kept for 73-21:** the `lzma-native` dependency, its typedef, the native SEA asset, `NATIVE_LZMA_REQUIRED_TRIPLES`, and `writeLzmaNativeResolvedPaths`/`assertNodeGypBuildSingleConsumer`. The last two are now called only by their tests.
- **Commit:** 3afc5d6b0

**5. [Rule 3 - Blocking] Stale mocks in 16 library/steam suites**
- **Issue:** `jest.mock('../depot/reconcile')` fails once the module is gone. The `formatEta`/`rollingRateMiBs`/`healReconciledFileModes` barrel keys no longer type-check.
- **Fix:** Removed the mocks and keys. library.refresh's `healReconciledFileModes` default went too, since nothing calls it.
- **Commit:** 859b6d80e

**6. [Rule 2 - Coverage] originalRestore.test.ts uses the real path helpers**
- The `../../depot` mock used to stub `resolveContainedPath` and `sha1File` without a containment check. The test now gets the real dependency-free `depotPaths.ts`, and the suite passes unchanged.

**7. [Config] knip `ignoreDependencies` gained `lzma` and `zstddec`**
- First-party code no longer imports either. They are steam-user's runtime requires, and 73-21 keeps both by design. This is a config entry with a written reason, not a baseline line.

## Gates (run separately, exit codes checked)

| Gate | Result |
| --- | --- |
| `pnpm codecheck` | 0 |
| `pnpm lint` | 0 (production PASS, tests PASS) |
| `pnpm prettier` | 0 |
| `pnpm i18n --fail-on-update` | 0, no catalog changes |
| `pnpm find-deadcode` | PASS (354 baselined; 2 lines removed, 0 added) |
| `pnpm boundaries` | 0 violations |
| `pnpm steam-line-ceiling` | PASS |
| `pnpm build:sidecar` then `pnpm smoke:sidecar` | 0 / PASS |
| `pnpm planning-gates` | 12/12 |
| tauri:dev chain (`GAMELIB_DEV_SECRET_VAULT=1 node meta/tauriDevPreflight.cjs && pnpm build:sidecar`, without `tauri dev`) | 0 |
| `cargo test -p gamelib-depot --test golden` | 1 passed (Rust not touched, so no clippy ratchet) |
| jest `--selectProjects Backend Meta` | 536 suites pass. Of the 10 failing suites, 2 are the known pre-existing failures and none comes from 73-20 (below) |

Failures in the jest run that 73-20 did not cause (no file they touch changed here; HEAD before this plan already had them):
- Known: `tauriShellSource.test.ts` WR-07 and `macArchKnownFixRouting` "Intel: never seeds...".
- `logSecretGate`: two `result.stderr` log calls in `src/backend/utils/uninstaller.ts` (from c3ddef301, quick-261108-anw).
- `lintTranslations` R13/REQ-41-02: `steam.engine.markerNewer` is not localised in 48 locales (from 1bb683146).
- `gamelibCatalogParity`: `sl` `humbleKeys.giftConfirmBody` drops the "Humble" glossary term.
- `genI18nGateScope` A-17: the committed `meta/i18nForkTouchedFiles.json` lags the live git derivation (frontend files).
- `rustTestWorkflow`: an anti-vacuity predicate over the rust-test workflow.
- Environment flakes: `helperIntegration` 58 WR-02 (ECONNRESET), `dxvkInstallRemove` (ENOTEMPTY on tmp cleanup), `x86CallbackWineHarness` (Wine harness).

## Known Stubs

None.

## Threat Flags

None. This plan only deletes code. T-73-70 is mitigated: `resolveContainedPath` and `sha1File` moved to `steam/depotPaths.ts` with tests, including the traversal rejections. T-73-71 is mitigated: smoke:sidecar passed after the sidecar entry changed.

## For plan 73-21

Already done here, so 73-21 can skip these:
- `lzmaLoader.ts`, `lzmaLoaderCore.ts`, `lzmaNativeBinding.ts`, `lzmaNativeBinding.test.ts` and `lzmaNativeSeaRealBuild.test.ts` are deleted.
- The `node-gyp-build` alias and the SEA worker bundle and asset are removed.
- The SELFTEST branch in `installRejectionGuard.ts` is gone.

Still to do in 73-21:
- the `lzma-native` dependency and lockfile entry
- `src/common/typedefs/lzma-native.d.ts`
- the `.gitignore` line for `lzmaNativeResolvedPaths.generated.cjs`
- the native-addon SEA asset, the win32 DLL and `NATIVE_LZMA_REQUIRED_TRIPLES`
- `writeLzmaNativeResolvedPaths`/`assertNodeGypBuildSingleConsumer` and their test, or all of `esbuildWorkerBundleShared.ts`. `buildSidecarSea.ts` still imports `resolveEsbuildCli`, `seaEsbuildFlags` and `spawnArgv` from it.
- the `releaseWorkflow.test.ts` fixture that touches `build/main/decompressWorker.js`
- the steam-user patch comment

When 73-21 retires the packages, the knip `ignoreDependencies` entries for `lzma`/`zstddec` should stay. `build:sidecar-sea` was not run end to end here (it overwrites the shared `src-tauri/binaries` sidecar). Its main esbuild bundle was checked on its own.

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/depotPaths.ts, __tests__/depotPaths.test.ts, depot/finalizeAcf.ts, depot/appManifest.ts, gamelib-depot tests/fixtures/expected.json
- ABSENT: every depot/ module on the D-15 list, meta/buildDecompressWorkerDev.ts
- FOUND commits: 859b6d80e, 3afc5d6b0
