---
phase: 75-steam-local-file-formats-in-rust
plan: 15
subsystem: steam-local-files
tags: [typescript, rustInvoke, library-scan, replay-parity]
requires: [75-13]
provides:
  - getSteamLibraries, four installed-map builders, readAcfState and scanDownloadingAppIds on steamfiles Rust channels behind GAMELIB_STEAMFILES_TEXT=rust
  - libraryReplay.test.ts (16 library cases, TS wrapper over recorded Rust == oracle or override)
  - overrides/library.json with 10 noted divergences
affects: [75-24]
key-files:
  modified:
    - src/backend/utils.ts
    - src/backend/storeManagers/steam/library/installedMap.ts
    - src/backend/storeManagers/steam/library/acfState.ts
    - src/backend/storeManagers/steam/library/refresh.ts
    - src/backend/config.ts
    - src/backend/downloadmanager/downloadqueue.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/installFlowRegistration.ts
    - src/backend/utils/compatibility_layers.ts
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/overrides/library.json
  created:
    - src/backend/storeManagers/steam/localFiles/__tests__/libraryReplay.test.ts
decisions:
  - requestRustInvoke is threaded from the boot host, not made optional: GlobalConfigDeps (so getAlternativeWine keeps its signature), DownloadQueueDeps, installFlow handlers via a local withRustInvoke helper
  - buildBridgeInstalledMap takes the Rust transport as a second argument (paths object is not a deps bag)
  - sizeOnDisk is now the ACF string, not the number @node-steam/vdf coerced to; recorded as overrides
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 15: Library scan core on Rust Summary

Library roots, installed maps, per-app ACF state and the downloading scan read through `steamfiles_read_library_folders`, one `steamfiles_scan_acfs` per build and one `steamfiles_find_acf` per poll tick under the rust flag; the flag-ts bodies are untouched private `<name>Ts` helpers.

## Commits
- 9315dbdc2 feat(75-15): library scan core on Rust behind text flag
- f0cbc0779 test(75-15): rust-branch caller tests and library replay parity with overrides

## Extra files touched by the SteamLibrariesDeps widening
`config.ts` (GlobalConfigDeps now extends RustInvokeDeps; getAlternativeWine forwards `this.deps.requestRustInvoke` to getLinuxWineSet, so the five getAlternativeWine callers did not change), `sidecar/bootstrap.ts` (config step and download-queue step pass `requestRustInvoke`), `downloadmanager/downloadqueue.ts`, `sidecar/installFlowRegistration.ts`, `utils/compatibility_layers.ts`, `library/refresh.ts` (bridge map second arg), plus test deps in games, installLocation, library, library.refresh, library.installRoot, removeCopies, downloadqueue, compatibility_layers, steamFlows, dismissBackstop, settingsVersioning and three config default tests.

## Replay parity
16 library cases replayed. Overrides (all with divergenceNote): legacy libraryfolders layout now read (Steam-correct); malformed and no-file no longer throw (fail-soft); sizeOnDisk string vs coerced number (readAcfState 10/40, buildInstalledMap x2); truncated manifest no longer hangs (buildInstalledMap, buildIncompleteInstallSet, readAcfState/30, scanDownloadingAppIds). findOtherManifestsWithInstalldir and breadcrumb cases are left to plan 20.

## Deviations from Plan
- [Rule 3 - Blocking] Widening the deps type forced `requestRustInvoke` through GlobalConfig, the download queue and install-flow handlers (listed above); a first attempt to thread it through getAlternativeWine's callers reached launcher/gog/nile setup and was reverted for the GlobalConfigDeps route.
- [Rule 3] Added `logDebug: jest.fn()` to the logger factory in library.installedMap and library.acfState tests (invokeSteamFiles logs); no new jest.mock calls.
- buildBridgeInstalledMap returns early without a scan call when no bridge bottle is ready (matches the TS "never reads" behaviour).
- Commit message of task 2 says 11 divergences; the file has 10.

## Verification
tsc clean; `check:ipc-contract` up to date; steam, utils, downloadmanager Jest suites pass except pre-existing failures (steamFilesChannelParity arm count 7<10, shimCoverage, shimGenerate); backend-di-ceilings shows only pre-existing baselines (none in touched files); overrides notes all >= 20 chars; prettier applied to touched files.

## Known Stubs
None.

## Self-Check: PASSED
