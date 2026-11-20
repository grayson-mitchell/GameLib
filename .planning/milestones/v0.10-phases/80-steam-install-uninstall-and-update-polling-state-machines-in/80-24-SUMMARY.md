---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 24
subsystem: steam-polling
tags: [steam, rust, polls-flag, uninstall-polling, running-poll]
requires: [80-22]
provides:
  - startUninstallPolling / stopUninstallPolling branched to steampoll_uninstall_start/stop
  - gameUninstall notice seq from steampoll_next_notice_seq
  - readRunningAppId / readRunningAppIdOrThrow / readMacRunningAppId as wrappers over steampoll_read_running_app_id
  - launch-watch pollerHold / pollerReports mapped to steampoll_running_hold/release/last_app_id
  - bootstrap skips the TS running poll under polls=rust
affects: [80-26]
key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/pollsRustBranch.uninstallRunning.test.ts
  modified:
    - src/backend/storeManagers/steam/library/uninstallPolling.ts
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/backend/storeManagers/steam/library/runningPoll.ts
    - src/backend/storeManagers/steam/steamLaunchedDeps.ts
    - src/backend/storeManagers/steam/steamLaunchWatch.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/testUtils/steamPollReplay/tsDriver.ts
key-decisions:
  - "Sync release closure: pollerHold under rust returns a synchronous release that captures the promise from the awaited steampoll_running_hold; the first release call chains steampoll_running_release {claimId, terminalSent} onto it (once-only, failures logged)"
  - "pollerReports is boolean | Promise<boolean>; steamLaunchWatch uses a whenPollerReports helper so the ts arm stays same-turn synchronous and the rust arm resolves asynchronously"
  - "Channels declared with an empty args tuple (next_notice_seq, running_last_app_id) are invoked with [] directly, not through invokeSteamPoll (which sends [{}])"
  - "No separate TS runningPoll.hold/lastAppId change: the rust mapping lives in steamLaunchedDeps, the only caller; the stdin-EOF stop and downloadMonitor.stopAll are already no-ops because nothing is armed under rust"
requirements-completed: [P80-uninstall, P80-running]
completed: 2026-11-16
---

# Phase 80 Plan 24: Uninstall and running poll APIs behind the polls flag Summary

Under `GAMELIB_STEAM_POLLS=rust` the uninstall poll API, the notice sequence, the running-app probe and the launch-watch claim/last-app-id all go to Rust, with no reg.exe spawn and no TS running poll started at boot; the ts arm is unchanged.

## Commits
- 1bac7ff02: uninstall API and notice seq (Task 1)
- 87cb40a99: running probe, claims, bootstrap gating (Task 2)

## Deviations from Plan

**1. [Rule 3 - Blocking] Async signatures.** startUninstallPolling/stopUninstallPolling are now async; gameUninstall awaits them and the notice helpers (failUninstall, pushNotice are async). games.test.ts spies changed to `Promise.resolve()` mock impls and tsDriver.ts awaits start. Assertions unchanged.

**2. [Rule 3 - Blocking] steamLaunchWatch.ts edited** to accept an async `pollerReports` (plan listed only steamLaunchedDeps). steamLaunchWatch tests pass unedited.

**3. Start args follow the channel contract** (`source`, `intervalMs`, `bridgeAuthoritative`), not the plan's `options` wording; `bridgeAuthoritative` is computed with isBridgeAuthoritativeForInstallState.

**4. Observation (not changed):** plan 22/23 call no-arg channels (`steampoll_status`, `steampoll_native_in_flight` is arg-bearing and fine) through invokeSteamPoll as `[{}]` where the rustInvoke schema declares an empty tuple; Rust ignores the args. Worth tidying in 80-26.

`stdin-EOF release` was left as is rather than gated.

## Verification
jest on steam/, sidecar/ and diPhaseGates: all green except the known shimCoverage, shimGenerate, ipcDomainCensus, flowRegistrationCensus. codecheck passes; lint has no errors outside relay/; prettier clean. No jest.mock count change.

## Known Stubs
None.

## Self-Check: PASSED
