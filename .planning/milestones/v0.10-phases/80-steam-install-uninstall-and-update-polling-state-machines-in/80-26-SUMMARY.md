---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 26
subsystem: steam-polls
tags: [polls-flag, default-flip, uat]
requires: [80-19, 80-21, 80-23, 80-24, 80-25]
provides:
  - polls flag defaults to rust on both sides
  - 80-HUMAN-UAT.md live gate contract
key-files:
  modified:
    - src-tauri/src/steampoll_dispatch.rs
    - src/backend/storeManagers/steam/library/pollsFlag.ts
  created:
    - .planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-HUMAN-UAT.md
decisions:
  - Flipped DEFAULT_POLLS_IMPL to rust on both sides after parity APPROVED (D-16)
metrics:
  completed: 2026-11-16
---

# Phase 80 Plan 26: Polls default flip Summary

Polls flag now defaults to rust in both `steampoll_dispatch.rs` and `pollsFlag.ts` (the plan-22 pin test still passes); ts-arm tests pin `GAMELIB_STEAM_POLLS=ts` themselves; `80-HUMAN-UAT.md` holds six pending live items (1, 2, 3, 4a, 4b, 5).

## Commits
- bd0a8bd76: flip + pins
- 9c552f902: 80-HUMAN-UAT.md

## Pins added
The 26 files in the plan's list got a file-level `beforeAll/afterAll` pin to `ts`. The four `pollsRustBranch.*` files already set the flag per test; their three "ts branch" tests that used `delete process.env[FLAG]` (install:167, uninstallRunning:113 and :210) now set `'ts'` explicitly.

Additional files that failed on the flip and were pinned to ts (plans 28-29 consume this list):
- src/backend/__tests__/steamPollParity.test.ts
- src/backend/__tests__/steamPollTsDriver.test.ts
- src/backend/sidecar/__tests__/gameDetailsFlows.test.ts
- src/backend/sidecar/__tests__/skeletonFlows.test.ts
- steam/__tests__/library.installRoot, library.installedMap, library.macSteamRefresh, library.refresh.rust, library.rustRefresh, library.test, steamInstallRuntime, steamStartupKeyringDeferral, updateDetection, updateDetection.exit
- steam/localFiles/__tests__/acfUpdateReplay, libraryReplay

## Deviations
None to the plan's design. Prettier ran with `--write` over the touched backend test files (no diff beyond pins).

## Verification
- `cargo test --workspace` and `cargo test --bin gamelib-shell`: all green.
- Jest: with the pins, remaining failures are only the pre-existing/unrelated: flowRegistrationCensus, ipcDomainCensus, shimCoverage, shimGenerate, tauriShellSource WR-07, legendary epicOfflineMode 6c (legendary games.ts signInProbe), frontend gamePageActionDock/themeTokens (other session's dirty GamePage work), meta gamelibCatalogParity (orphaned `steam.bridge.route.missingSymbols` keys), steamLineCeiling (gameLaunch.ts 1131 lines), plus meta genI18nGateScope, lintTranslations, rustTestWorkflow, callbackRegistryHost, x86CallbackWineHarness (not investigated; none touch phase-80 files).
- `pnpm codecheck` passes. `pnpm lint`: 0 errors outside relay/; the exit fails on the warning ceiling (962 > 661), which my appended lines do not add to.
- .planning is prettier-ignored, so no formatter check for the UAT file.

## Carry-forward
The `steampoll_status` `[{}]` vs `[]` argument tidy (80-24) is in files outside this plan; not done.

## Self-Check: PASSED
