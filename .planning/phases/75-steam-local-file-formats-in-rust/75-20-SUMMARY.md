---
phase: 75-steam-local-file-formats-in-rust
plan: 20
subsystem: steam-local-files
tags: [typescript, rustInvoke, delete-guards, replay-parity]
requires: [75-15]
provides:
  - async findOtherManifestsWithInstalldir(rust, steamappsDir, installdirSegment, selfAppId) on one steamfiles_scan_acfs call
  - cancelDelete installed refusal on steamfiles_read_acf
  - async breadcrumbAppIsFullyInstalledOnDisk(rust, appId, install) on steamfiles_read_acf
  - libraryReplay.test.ts now replays findOther and breadcrumb cases (29 library cases)
affects: [75-24]
key-files:
  modified:
    - src/backend/storeManagers/steam/library/acfState.ts
    - src/backend/storeManagers/steam/cancelDelete.ts
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/backend/storeManagers/steam/library/resumeBreadcrumbs.ts
    - src/backend/storeManagers/steam/library/index.ts
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/{invocations,rust-results}.json
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/overrides/library.json
decisions:
  - Transport failure in the co-install guard returns the sentinel ['<unknown>'] so callers take the conflicting branch and skip rmSync (T-75-55); more conservative than the TS path, which returned [] on readdir failure
  - cancelDelete on the rust path refuses with 'manifest unreadable' when the read rejects (T-75-56); unparseable manifest stays residue, as on TS
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 20: Library-directory delete guards on Rust Summary

The co-installed-installdir guard, the cancel-delete installed refusal and the resume-breadcrumb check now run on Rust under the rust flag, and every failure mode moves toward not deleting.

## Commits
- 260bb4e83 feat(75-20): co-install guard, cancel-delete check and breadcrumb check on Rust
- 5df1bf836 test(75-20): rust-branch cases for co-install guard, cancel-delete and breadcrumb; replay of remaining library cases

## Details
- `findOtherManifestsWithInstalldir` keeps a private `...Ts` body; the rust branch does one scan call, skips `appmanifest_<self>.acf`, compares installdir exactly, and returns `['<unknown>']` on rejection. Callers: `gameUninstall` and `removeSteamInstallCopy` (acfState.ts, same file, not in the plan list) and `cancelDelete` all await it before any rmSync.
- `cancelDelete` re-checks `isNativeInstallInFlight` after the new awaits, immediately before the removal, to keep the "nothing can start between checks and rmSync" property.
- `breadcrumbAppIsFullyInstalledOnDisk` returns false on anything but a parsed record with a numeric stateFlags; `library/index.ts` awaits it in the same loop order.
- Three `steamfiles_read_acf` invocations for scan/lib1 manifests (10, 20, 99) were added to `invocations.json` and `rust-results.json` re-recorded for the breadcrumb replay.

## Replay parity
29 library cases replayed. New divergence: `findOtherManifestsWithInstalldir/with-truncated-manifest` (oracle hangs; Rust skips the unparseable manifest and reports the readable sibling). The plan's numeric-installdir candidate did not occur: no fixture exercises it.

## Deviations from Plan
- [Rule 3] `removeSteamInstallCopy` in acfState.ts also called the guard and now awaits it with its own deps (it already carried requestRustInvoke).
- [Rule 3] Callers' mocks in `games.test.ts`, `cancelDelete.test.ts` and `staleQueueHeadCancel.regression.test.ts` switched to `mockResolvedValue`; the `games.test.ts` A-13 assertion gained the leading deps argument. `logDebug` was added to the existing logger mock factories in cancelDelete and resumeBreadcrumbs tests (needed by invokeSteamFiles). No new jest.mock calls.
- Added three invocations to the crate fixtures (not in the plan's file list) so the breadcrumb replay has recorded Rust results.

## Verification
tsc clean. Steam Jest suites and localFiles replay/golden pass except the known pre-existing shimCoverage and shimGenerate failures. `cargo test -p gamelib-steamfiles --test golden` passes. `pnpm backend-di-ceilings` still reports the pre-existing jestMock violations (SteamBridgeRouteSummary, SteamUpdateInfo, plus bridgeUpdateFollowUps, progressBridge.stage, updateEstimate, checkGameUpdates, libraryLaunchSteamUpdatePrompt, statusLabel.steamUpdate, none of them files this plan touched). No IPC change.

## Known Stubs
None.

## Self-Check: PASSED
