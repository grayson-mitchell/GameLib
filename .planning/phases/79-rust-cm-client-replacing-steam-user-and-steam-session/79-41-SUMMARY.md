---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 41
subsystem: steam-library
tags: [steam, refresh, enrichment, rust, cleanup, delete-gate, d-18]
requires: [79-40]
provides:
  - Rust-only Refresh caller (refresh() calls syncOwnedLibraryRust only, plus the gated Mac attempt)
  - Rust-only lazy enrichment and install-size estimate (fetchMetadataIfNeeded, getSteamInstallSize)
  - D-18 flags and the Jest transition pin deleted
affects: [79-42]
tech-stack:
  added: []
  patterns: ["source gates over Rust text (metadataCapture.test.ts reads refresh/assemble.rs and enrich.rs)"]
key-files:
  modified:
    - src/backend/storeManagers/steam/library/refresh.ts
    - src/backend/storeManagers/steam/gameMetadata.ts
    - src/backend/storeManagers/steam/gameRequirements.ts
    - src/backend/storeManagers/steam/platformCapture.ts
    - src/backend/storeManagers/steam/gameConstants.ts
    - src/backend/sidecar/depotHostRegistration.ts
    - src/backend/jest.setupContainment.ts
  deleted:
    - src/backend/storeManagers/steam/licensedDemos.ts
    - src/backend/storeManagers/steam/metacriticCapture.ts
    - src/backend/storeManagers/steam/platformPrecedence.ts
    - src/backend/storeManagers/steam/cm/steamCmFlags.ts
    - src/backend/storeManagers/steam/cm/__tests__/steamCmFlags.test.ts
    - src/backend/storeManagers/steam/__tests__/licensedDemos.test.ts
    - src/backend/storeManagers/steam/__tests__/metacriticCapture.test.ts
    - src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts
key-decisions:
  - "meta/steamcmRefreshParitySweep.ts keeps its GAMELIB_STEAMCM_CM constant: plan 79-42 deletes that file outright"
  - "Behaviour of the deleted TS code is carried by the Rust tests named below; TS tests that only pinned TS assembly were deleted, not retargeted"
requirements-completed: [CF-01, D-12, D-18]
duration: one session
completed: 2026-11-15
---

# Phase 79 Plan 41: Delete TS Refresh, capture and enrichment, and the D-18 flags Summary

Refresh and the lazy enrichment now have one implementation, in Rust. The TS side is a thin caller, and the `GAMELIB_STEAMCM_*` flags, `steamCmFlags.ts` and the Jest pin are gone.

## What was deleted

- `refresh.ts`: `syncOwnedLibrary` (about 400 lines) and the `steamCmImpl()` branches. `refresh()` keeps the grant/lease flow, the gated Mac Steam attempt (`macSteamPathEnabled()`, no longer also `steamCmImpl() === 'rust'`) and `refreshInstallState`.
- `licensedDemos.ts`, `metacriticCapture.ts`, `platformPrecedence.ts` (whole files).
- `platformCapture.ts`: everything except `createPlatformCaptureQueue` and the `PlatformCaptureQueue` type.
- `gameMetadata.ts`: the axios fetch and merge; `fetchMetadataIfNeeded` keeps the dedup, slot, syncing-indicator and non-numeric appId guard and calls `enrichViaRust`.
- `gameRequirements.ts`: the axios path, `parseSteamStorageRequirement`, `parseSteamMacMinOSVersion`, `macArchFromMinOS`. `hostSteamDepotOs` stays. `getSteamInstallSize` is Rust-only.
- `STEAM_STORE_API` (dead after the above), `steamCmFlags.ts` and its test, the `jest.setupContainment.ts` pin, and every per-test `GAMELIB_STEAMCM_*` set/restore.
- `depotHostRegistration.ts`: the `steamCmImpl() === 'rust'` guard on the typed-failure allow-list is now unconditional.

## Source gates (T-79-128)

`metadataCapture.test.ts`: the two gates that read deleted TS were retargeted to Rust text.
- `library/refresh.ts` seeds `steamPlatformsCaptured` via `depotSignalCaptured` -> `refresh/assemble.rs` (`depot_signal_captured`, `use super::meta_entry::`).
- `gameMetadata.ts` bridge carry-forward -> `refresh/enrich.rs` (`entry.bridge = cached.and_then(|c| c.bridge.clone())`).
Gates over surviving TS (installFormIpc.ts, games.ts, gameEligibility.ts, installRoot.ts, steamPlatformRow.ts) are unchanged.

## Rust tests that carry the deleted TS tests

| Deleted TS tests | Rust carrier |
|---|---|
| platformPrecedence.test.ts | `refresh/meta_entry.rs` (`pics_declines_strictly_newer_complete_appdetails`, `tie_goes_to_incoming`, `poisoned_far_future_existing_stamp_loses_and_is_repaired`, ...) |
| platformCapture.test.ts (oslist parse and merge) | `refresh/capture.rs` (`oslist_cases_from_platform_capture_test`, `oslist_writes_nothing_for_absent_empty_or_non_string`) |
| metacriticCapture.test.ts | `refresh/capture.rs` (`metacritic_extraction_follows_parse_metacritic_score`, `scope_metacritic_excludes_captured_apps`, `merge_metacritic_marks_captured_with_or_without_a_score`) |
| licensedDemos.test.ts | `refresh/owned_demos.rs` (`adds_a_licensed_not_owned_demo`, `does_not_duplicate_an_already_owned_demo`) |
| games.test.ts parsers and macArchFromMinOS | `refresh/enrich.rs` (`low_min_os_is_unknown_never_32`), `refresh/store_http.rs` |
| games.test.ts appdetails/delisted/metacritic/carry-forward fetch tests | `refresh/enrich.rs` plus `gameMetadata.rust.test.ts` |
| library.refresh.test.ts assembly tests (bottle/bridge/resume/breadcrumb/cachedMeta seeding, 36 `it`s and 3 emptied describes) | `refresh/assemble.rs` (`native_wins_over_bottle_wins_over_bridge`, `bridge_authoritative_*`, steamPlatformsCaptured cases) |

TS tests kept and re-pointed: games.test.ts getGameInfo self-heal gating (now observed at the `fetchMetadataIfNeeded` seam), ensurePlatformsCaptured and checkBottleEligibility (a `mockAppdetailsWrites` stand-in for the Rust enrich op), `platformCapture.test.ts` (queue only), `skeletonFlows.test.ts` Test 1 (answers the `steamcm_refresh` rustInvoke frame on a Rust lease), `steamStartupKeyringDeferral.test.ts` (allowlist mock gained `seedIds`). Added: a non-numeric appId guard test in `gameMetadata.rust.test.ts`. Dead mocks of `../metacriticCapture` and `captureOwnedAppPlatforms` were stripped from 14 steam tests. DI-ceiling baselines in `meta/backendDiCeilings/storeManagers.steam*.json` lowered or removed to match.

## Deviations from Plan

- **[Scope] `meta/steamcmRefreshParitySweep.ts`** still names `GAMELIB_STEAMCM_CM`. It is a ts-vs-rust sweep whose ts side no longer exists; plan 79-42 lists it (and its test) for deletion, so it was left rather than edited twice. The plan's literal "no reference in src or meta" grep therefore matches that one file until 79-42.
- **[Rule 3]** Tests beyond the plan's file list were edited (list above) because they mocked or imported deleted modules or ran on the pinned ts engine.
- `package.json` script `steamcm-refresh-parity-sweep` untouched (79-42).

## Verification

- `tsc --noEmit`, eslint (no errors) and prettier clean on every touched path.
- `jest src/backend`: only the known pre-existing failures remain (epicOfflineMode, shimCoverage, shimGenerate, tauriShellSource, flowRegistrationCensus, ipcDomainCensus); dxvkInstallRemove flaked once and passed on rerun.
- `boundaries`, `steam-line-ceiling` pass; `find-deadcode`, `backend-di-ceilings`, `gameinfo-narrowing-ceiling` fail in the working tree only on the operator's dirty GamePage files (SteamUpdateInfo.scss, GameStatus tests, GamePage/index.tsx).
