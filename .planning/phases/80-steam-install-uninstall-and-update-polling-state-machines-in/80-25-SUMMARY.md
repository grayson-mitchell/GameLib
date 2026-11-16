---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 25
subsystem: steam-polling
tags: [steam, rust, polls-flag, acf, mac-arch]
requires: [80-22]
provides:
  - acfState.ts and acfUpdateState.ts async exports as rustInvoke wrappers under polls=rust
  - verifyMacArchGroundTruth via steampoll_mac_arch_verdict
  - breadcrumbAppIsFullyInstalledOnDisk via steampoll_breadcrumb_installed_on_disk
affects: [80-26]
key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/pollsRustBranch.acf.test.ts
  modified:
    - src/backend/storeManagers/steam/library/acfState.ts
    - src/backend/storeManagers/steam/library/acfUpdateState.ts
    - src/backend/storeManagers/steam/library/macArch.ts
    - src/backend/storeManagers/steam/library/resumeBreadcrumbs.ts
    - src/backend/storeManagers/steam/pollRust/rustSteamPoll.ts
key-decisions:
  - "removeSteamInstallCopy rust arm (removeCopyViaRust) has no rmSync; Rust deletes, then removePerGameBridgeBottle runs only when Rust returned a non-default bridgeBottle"
  - "scanDownloadingAppIds filters Rust's all-downloading list by libraryState in TS (80-05 carry-forward) and returns [] on rejection, as the ts arm did"
  - "pollRootsFor param type narrowed to the resolvers' own deps types plus a getSettings-only config, so the ACF wrappers' narrow deps compile without casts; nativeSteamRoot extracted"
requirements-completed: [P80-acf, P80-install]
completed: 2026-11-16
---

# Phase 80 Plan 25: ACF, mac arch and breadcrumb wrappers Summary

Under `GAMELIB_STEAM_POLLS=rust` every ACF reader, the copy removal, the mac arch verify and the breadcrumb disk check go to Rust with the same return shapes; the ts arm is unchanged.

## Commit
- f6d198923: both tasks (they share one test file, so one commit)

## rmSync placement (T-80-73)
In `acfState.ts` the only `rmSync` calls are at lines 477, 481 and 482, all inside the ts arm of `removeSteamInstallCopy` (starts line 387; the rust arm `removeCopyViaRust` is at line 518 onward and has none). The remaining grep hits are comments.

## Behavior notes
- readAcfState: Rust rejection maps to `unknown`; bottle/bridge root resolution still throws before the invoke, as on the ts arm. `stateFlags` null becomes NaN.
- findOtherManifestsWithInstalldir: rejection yields the `<unknown>` sentinel.
- removeSteamInstallCopy: numeric appId guard stays first; a rejected invoke maps to refused `install state unknown`; bottle result is folded into `bottleRemoved`.
- isAcfUpdatePending and STATE_FLAG_FULLY_INSTALLED stay sync TS; a test replays the Rust acf_update.rs vectors and reads the Rust constant from constants.rs.
- verifyMacArchGroundTruth keeps `macArchCheckNeeded`; a null verdict or a rejection logs inconclusive.

## Deviations from Plan

**1. [Rule 3 - Blocking] pollRootsFor signature narrowed** (rustSteamPoll.ts). Its `Pick<ManagerDeps,...>` type did not accept the ACF functions' narrow deps. Now `{ config: getSettings } & BottleSettingsDeps & BridgeBottleDeps`. `nativeSteamRoot` added for scanDownloadingAppIds, which has no bottle deps.

**2. Plan said scan rejection "propagates"**; the ts arm swallows it to `[]`, and the behavior clause says "exactly as the TS did", so the rust arm returns `[]`.

**3. Single commit** for both tasks, because the test file spans both.

## Verification
jest on steam/, sidecar/ and diPhaseGates: only the known flowRegistrationCensus, ipcDomainCensus, shimCoverage, shimGenerate fail. codecheck passes; lint has no errors outside relay/; prettier clean. No jest.mock added (injected fakes plus jest.spyOn).

## Known Stubs
None.

## Self-Check: PASSED
