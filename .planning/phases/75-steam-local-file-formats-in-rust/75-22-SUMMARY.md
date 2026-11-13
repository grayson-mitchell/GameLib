---
phase: 75-steam-local-file-formats-in-rust
plan: 22
subsystem: steam-local-files
tags: [typescript, rustInvoke, adoption, running-app-poll, replay-parity]
requires: [75-20]
provides:
  - async readAppManifestFlags(rust, steamappsDir, appId) on steamfiles_read_acf (readAppManifestFlagsTs kept for finalizeAcf)
  - async readAcfSnapshot(rust, path) with optional stateFlags/buildid; isSteamAdoptedAcf on those fields
  - registry.vdf RunningAppID reads (macOS and Linux) on steamfiles_read_running_app_id; readMacRunningAppId async
  - adoptionReplay.test.ts (29 cases) and overrides/adoption.json
affects: [75-24]
key-files:
  modified:
    - src/backend/storeManagers/steam/library/manifestFlags.ts
    - src/backend/storeManagers/steam/library/runningPoll.ts
    - src/backend/storeManagers/steam/macSteamAdoption.ts
    - src/backend/storeManagers/steam/{gameLaunch,gameUninstall,gameInstallDepot,queueHeadRevalidation,steamProcesses,steamLaunchedDeps}.ts
    - src/backend/storeManagers/steam/depot/finalizeAcf.ts
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/overrides/adoption.json
  created:
    - src/backend/storeManagers/steam/localFiles/__tests__/adoptionReplay.test.ts
decisions:
  - Rust-unreachable in readAcfSnapshot yields a snapshot with stateFlags null so isSteamAdoptedAcf answers false (not adopted), the conservative restart-on-Play verdict
  - RunningPollProbeDeps now carries requestRustInvoke; RestartDeps.readRunningAppId is async and createRestartDeps takes requestRustInvoke
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 22: Adoption, manifest-flag and running-app reads on Rust Summary

`readAppManifestFlags`, the Mac adoption snapshot and the registry.vdf RunningAppID reads now run on Rust under the rust flag, with replay parity against the oracle.

## Commits
- 71fae4749 feat(75-22): manifest flags, adoption snapshot and registry RunningAppID reads on Rust
- 31528674d test(75-22): rust-branch cases for manifest flags, adoption snapshot and RunningAppID; adoption replay parity

## Details
- The TS branches stay verbatim under the ts flag. `readAcfSnapshot` still reads mtime and raw content in TS (persisted baseline shape unchanged); the Rust fields are optional so pre-phase baselines validate.
- The `inFlight` guard in `createRunningPoll` was already present in the repo (Pitfall 7); the plan's requirement is satisfied and now covered by an explicit overlap test (a pending read is not re-entered by later fake-clock ticks).
- Windows reg.exe arm untouched.

## Replay parity
29 adoption cases replayed. Six divergences, each noted in overrides/adoption.json: coercion buildid keeps the leading zero ("0123"), comments-unquoted and lowercase-keys manifests now parse (Steam-correct), the truncated manifest no longer hangs (null / not adopted), and registry/lowercase.vdf now returns the id (the predicted case).

## Deviations from Plan
- [Rule 3] `steamProcesses.ts`, `steamLaunchedDeps.ts` (callers of `readRunningAppId`) and `games.test.ts` (readAcfSnapshot mocks to `mockResolvedValue`) were changed; not in the plan's file list, needed to compile and pass.
- `logDebug: jest.fn()` added to existing logger mock factories in three tests (needed by invokeSteamFiles); no new `jest.mock(` calls.

## Verification
tsc clean. Steam Jest suites pass except the known shimCoverage/shimGenerate failures. backend-di-ceilings still 20 FAIL lines (unchanged). No IPC change.

## Known Stubs
None.

## Self-Check: PASSED
