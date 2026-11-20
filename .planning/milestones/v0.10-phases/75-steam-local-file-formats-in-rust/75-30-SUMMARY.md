---
phase: 75-steam-local-file-formats-in-rust
plan: 30
subsystem: steam-local-files
tags: [delete-gate, p75-g, library-readers]
requires: [75-28, 75-29]
provides: [Rust-only library-area readers]
key-files:
  modified:
    - src/backend/utils.ts
    - src/backend/storeManagers/steam/library/installedMap.ts
    - src/backend/storeManagers/steam/library/acfState.ts
    - src/backend/storeManagers/steam/library/resumeBreadcrumbs.ts
    - src/backend/storeManagers/steam/library/runningPoll.ts
    - src/backend/storeManagers/steam/cancelDelete.ts
    - src/backend/storeManagers/steam/acfInstalldir.ts
    - src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
requirements-completed: [STEAM-03, P75-G, P75-A]
completed: 2026-11-14
---

# Phase 75 Plan 30: Library-area readers Rust-only Summary

The text-flag TS branches and private `*Ts` helpers are deleted from getSteamLibraries, buildInstalledMap / buildIncompleteInstallSet / buildBottleInstalledMap / buildBridgeInstalledMap, readAcfState, findOtherManifestsWithInstalldir, scanDownloadingAppIds, cancelDelete, breadcrumbAppIsFullyInstalledOnDisk, the registry RunningAppID read and readAcfInstalldir. No `@node-steam/vdf` or `steamFilesTextImpl` reference remains in these seven files. Every Rust-path fail-soft mapping is unchanged (`<unknown>` conflict sentinel, `manifest unreadable` refusal, 0 / undefined / [] fallbacks).

## Commit

- f4198c7fa refactor(75-30): production and test changes in one commit (the tests only pass against the Rust-only code).

## Deviations from Plan

**1. [Rule 3 - Blocking] Tests that relied on the global ts pin (jest.setupContainment) broke once the wrappers became Rust-only.** Fixed by injecting `fsBackedSteamFiles()` (and `logDebug` mocks where the logger is mocked or spied):
- cancelDelete.test.ts, staleQueueHeadCancel.regression.test.ts, updateDetection.test.ts, updateDetection.acf.test.ts, rustSecondary.test.ts (steamfiles_* channels routed to the file-backed double, depot channels to the depot stub), compatibility_layers.test.ts (`requestRustInvoke: jest.fn()` returned undefined).
- sidecarHarness.ts: the harness now answers `steamfiles_*` rustInvoke frames from the file-backed double, so skeletonFlows and downloadQueueFlows (real boot, real refresh) get answers.

**2. Test cases removed:** utils.test.ts had no ts-branch describe (only the rust one); cancelDelete.test.ts's first describe ran the TS manifest read through real temp files and was kept, now served by the file-backed Rust double (no cases deleted). Removed only the now-dead `GAMELIB_STEAMFILES_TEXT=rust` pins in those two files' rust describes. No ts-branch-only test cases existed to delete in these two files.

## Gates

- tsc clean. eslint: 0 errors on touched files. Prettier clean.
- find-deadcode: 5 findings, all pre-existing humble/* and WebView/storeExitRefresh.ts. steam-line-ceiling exit 0. backend-di-ceilings: 20 FAIL lines (pre-existing). No `jest.mock(` added or removed.
- Jest src/backend: remaining failures are pre-existing or other sessions: tauriShellSource, moduleStateCensus, shimCoverage/shimGenerate, diPhaseGates (authTrigger.ts module state), dialogOptionForwarding / sidecarRpc UNBOUNDED_RUST_CHANNELS, plus a flaky epicOfflineMode/dxvkInstallRemove (1 failure, legendary/tools, unrelated). Steam suite and sidecar suite green.

## Self-Check: PASSED
