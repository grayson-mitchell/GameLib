---
phase: 75-steam-local-file-formats-in-rust
plan: 16
subsystem: steam-local-files
tags: [typescript, rustInvoke, acf-installdir, replay-parity]
requires: [75-15]
provides:
  - async readAcfInstalldir(rust, steamappsDir, appId) on steamfiles_read_acf behind GAMELIB_STEAMFILES_TEXT=rust
  - installdirReplay.test.ts (20 cases, TS wrapper over recorded Rust == oracle or override)
  - overrides/installdir.json with 5 noted divergences
affects: [75-24]
key-files:
  modified:
    - src/backend/storeManagers/steam/acfInstalldir.ts
    - src/backend/storeManagers/steam/steamLaunchedDeps.ts
    - src/backend/storeManagers/steam/stopSteamLaunchedGame.ts
    - src/backend/storeManagers/steam/installLocation.ts
    - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
    - src/backend/storeManagers/steam/library/resume.ts
    - src/backend/storeManagers/steam/updateBridge.ts
    - src/backend/storeManagers/steam/updateInfo.ts
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/overrides/installdir.json
  created:
    - src/backend/storeManagers/steam/localFiles/__tests__/installdirReplay.test.ts
decisions:
  - The flag-ts body stays a private readAcfInstalldirTs; the rust branch returns record.installdir only when a non-blank string and maps any rejection to undefined
  - steamLaunchedStopDeps binds `deps` (ManagerDeps carries requestRustInvoke) into the injected readAcfInstalldir dep
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 16: readAcfInstalldir on Rust Summary

`readAcfInstalldir` is now async and, under the rust flag, reads one `steamfiles_read_acf`; every production caller awaits it and no containment or sanitisation step was touched.

## Commits
- bc3aae787 feat(75-16): async readAcfInstalldir on Rust behind text flag, callers awaited
- 8018d36aa test(75-16): readAcfInstalldir rust-branch cases and installdir replay parity with overrides

## Callers made async or awaited
- `stopSteamLaunchedGame.resolveSteamLaunchedInstallFolder` (already async; dep type now returns a Promise; also used by steamLaunchWatch through the shared dep type).
- `steamLaunchedDeps` binds `rust` (the ManagerDeps) into the dep.
- `installLocation.resolveSteamInstallTarget` and `library/resume.locateDownloadingTarget` (both already async).
- `depotRust/updateEstimate.resolveBridgeUpdateContext` became async; its callers `estimateBridgeUpdate`, `updateBridge` and `updateInfo` now await it. Each is in an already-async path, so no timer tick gained overlap.

## Replay parity
20 installdir cases replayed. Overrides (all with divergenceNote): `coercion` (numeric-looking installdir kept as string), `comments-unquoted`, `escapes` (Rust decodes the escape to one backslash), `lowercase-keys` (case-insensitive lookup), `truncated` (oracle hangs, Rust fails soft).

## Deviations from Plan
- [Rule 3] `resolveBridgeUpdateContext` (and its two extra callers updateBridge.ts, updateInfo.ts) were not in the plan's file list but had to become async; their tests' mocks switched to `mockResolvedValue`. Existing caller tests (installLocation, library.runningPoll, stopSteamLaunchedGame, steamLaunchWatch, updateBridge, updateInfo, updateEstimate) updated for the Promise return, with no new jest.mock calls.
- The plan's candidate override (numeric "1979") was not the only divergence; four others were found and are noted above.

## Verification
tsc clean; steam Jest suite passes except the pre-existing shimCoverage and shimGenerate failures; golden test passes; backend-di-ceilings shows only pre-existing baselines; prettier applied to touched files. No IPC change.

## Known Stubs
None.

## Self-Check: PASSED
