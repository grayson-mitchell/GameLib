---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 23
subsystem: steam-polling
tags: [steam, rust, polls-flag, restart-hold, native-in-flight]
requires: [80-22]
provides:
  - status readers (pollOwnsUpdate, Refresh poll check, withoutSteamRestartHolds) branched to steampoll_status
  - boot rearm skipped under polls=rust
  - nativeInstallsInFlight mirrored to Rust via steampoll_native_in_flight
affects: [80-26]
key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/pollsRustBranch.status.test.ts
  modified:
    - src/backend/storeManagers/steam/updateNative.ts
    - src/backend/storeManagers/steam/library/refresh.ts
    - src/backend/storeManagers/steam/library/rustRefresh.ts
    - src/backend/storeManagers/steam/library/index.ts
    - src/backend/storeManagers/steam/library/restartHold.ts
    - src/backend/storeManagers/steam/gameSessionState.ts
    - src/backend/storeManagers/steam/steamInstallRuntime.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/storeManagers/steam/__tests__/steamInstallRuntime.test.ts
key-decisions:
  - "withoutSteamRestartHolds is async on both arms; createSteamRestartHold takes an optional requestRustInvoke (from the install-runtime transport)"
  - "createSteamGameSessionState takes optional RustInvokeDeps; bootstrap passes state.services.host; the Map is a set/delete-intercepting subclass that pushes only new keys and present-key deletes"
  - "refreshInstallState makes at most one lazy status call per reconcile for its activePolls check"
requirements-completed: [P80-install, P80-events]
completed: 2026-11-16
---

# Phase 80 Plan 23: Status readers and in-flight mirror Summary

Under `GAMELIB_STEAM_POLLS=rust` every TS reader of the poll/hold registries asks Rust's `steampoll_status`, boot rearm is left to the shell (the reconcile arrives as the existing `rearmSettled` event), and native-in-flight changes are pushed to Rust; the ts arm is unchanged.

## Commits
- 3babe69d9: both tasks (the two tasks share one test file and touch connected signatures, committed together).

## Deviations from Plan
- **[Rule 3]** `pollOwnsUpdate` is now exported (for tests); `steamInstallRuntime.ts`, `bootstrap.ts` and `steamInstallRuntime.test.ts` were touched to thread `requestRustInvoke` and await the now-async `withoutSteamRestartHolds`. Assertions unchanged.
- The two tasks were committed together.

## Verification
Steam __tests__, sidecar and diPhaseGates run green except the known ipcDomainCensus and flowRegistrationCensus failures. codecheck passes, lint has no errors outside relay/, prettier clean. No jest.mock count change.

## Known Stubs
None.

## Self-Check: PASSED
