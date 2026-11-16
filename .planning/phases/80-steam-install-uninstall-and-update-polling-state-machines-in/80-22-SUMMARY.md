---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 22
subsystem: steam-polling
tags: [steam, rust, polls-flag, install-polling]
requires: [80-18, 80-11, 80-21]
provides:
  - pollsImpl() flag mirroring the shell's GAMELIB_STEAM_POLLS
  - invokeSteamPoll / pollRootsFor / titleFor wrapper
  - install poll API (start, stop, isDelegated, cancelDelegated, bridge finalized) branched to Rust
affects: [80-23, 80-26]
tech-stack:
  added: []
  patterns: [flag-branched dual implementation, injected-fake rust-branch tests]
key-files:
  created:
    - src/backend/storeManagers/steam/library/pollsFlag.ts
    - src/backend/storeManagers/steam/pollRust/rustSteamPoll.ts
    - src/backend/storeManagers/steam/__tests__/pollsRustBranch.install.test.ts
  modified:
    - src/backend/storeManagers/steam/library/installPolling.ts
    - src/backend/storeManagers/steam/library/installStop.ts
    - src/backend/storeManagers/steam/gameInstallBridge.ts
    - src/backend/gamedetails/dispatch.ts
    - src/backend/sidecar/handlers.ts
key-decisions:
  - "stopInstallPolling is async; the in-loop TS callers (installPollOnce, updatePollOnce, installPolling) call it with void so the ts arm stays synchronous in effect and adds no floating-promise warning"
  - "GameDetailsDeps gains requestRustInvoke (wired in sidecar/handlers.ts) because dispatch.kill now awaits isDelegatedInstallPolling"
  - "pollRootsFor resolves the source's own root strictly and the other non-native root best effort (null on failure)"
requirements-completed: [P80-install, P80-events]
duration: ~35min
completed: 2026-11-16
---

# Phase 80 Plan 22: Install poll API behind the polls flag Summary

The install-side poll API (start, stop, isDelegated, cancelDelegated, bridge-finalized) forwards to Rust under `GAMELIB_STEAM_POLLS=rust`, with the TS loops untouched as the default `ts` arm.

## Tasks
1. Flag and wrapper module (235f15964): `pollsImpl`, `DEFAULT_POLLS_IMPL='ts'` pinned by a test that reads `steampoll_dispatch.rs`; `invokeSteamPoll`, `pollRootsFor`, `titleFor`; no import-time work.
2. Branch the install API and make callers await (dc5910815).

## Deviations from Plan

**1. [Rule 3 - Blocking] Existing tests edited for the async signatures.** games.test.ts (cancelDelegatedInstall/startInstallPolling spies now `mockResolvedValue`), updateNative.test.ts (async mock impl) and library.installPolling.test.ts (`await` on the now-async cancel/isDelegated, `void` on start/stop) were edited; tsc failed otherwise. Assertions unchanged, no jest.mock count change.

**2. [Rule 3 - Blocking] Extra files touched.** sidecar/handlers.ts (pass requestRustInvoke into GameDetailsDeps), installPollOnce.ts and updatePollOnce.ts (`void` on internal stop calls), testUtils/steamPollReplay/tsDriver.ts (awaits).

Start sites gameInstall.ts, gameInstallDepot.ts, updateNative.ts, resume.ts only gained `await` keywords (all were in async functions).

## Verification
jest on steam/, testUtils/ and __tests__/ green except known failures (shimCoverage, shimGenerate, tauriShellSource, rustInvokeSchemas channel count, flowRegistrationCensus, ipcDomainCensus), none from this plan. codecheck passes; lint has 0 errors on touched files (3 pre-existing test-scope errors elsewhere); prettier clean.

## Known Stubs
None.

## Self-Check: PASSED
