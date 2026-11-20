---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 29
subsystem: steam-polls-tests
tags: [steam, rust, tests, parity, jest]
requires: [80-28]
provides: [test tree free of the TS poll loops and TS replay harness]
affects: [80-30, 80-31]
key-files:
  modified:
    - src/backend/sidecar/__tests__/{bootstrap,skeletonFlows,gameDetailsFlows}.test.ts
    - src/backend/sidecar/__tests__/helpers/sidecarHarness.ts
    - src/backend/storeManagers/steam/__tests__/{library.updates,steamInstallRuntime}.test.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/rustSecondary.test.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/{acfUpdateReplay,adoptionReplay,libraryReplay}.test.ts
    - meta/backendDiCeilings/storeManagers.steam.json
  deleted:
    - src/backend/__tests__/{steamPollTsDriver,steamPollParity,steamPollProfileFixtures}.test.ts
    - src/backend/testUtils/steamPollReplay/{mocks,timeline,tsDriver}.ts
    - meta/gamelibSteampollCli.ts
completed: 2026-11-16
---

# Phase 80 Plan 29: Retarget remaining TS-poll test dependents, retire TS harness

Parity now lives only in cargo (`frozen_parity`, passing); no Jest test drives the TS poll loops or the TS replay driver.

## Commits

- efcc94aed: retarget the remaining dependents onto the rust arm
- a281e00bd: retire the TS poll replay harness

## What changed

Task 1:
- Removed the `GAMELIB_STEAM_POLLS=ts` pins from bootstrap, skeletonFlows, gameDetailsFlows, rustSecondary, acfUpdateReplay, adoptionReplay, libraryReplay.
- skeletonFlows (read flow) and gameDetailsFlows (kill) now answer `steampoll_status` through a new `answerPollStatus` helper in `sidecarHarness.ts` (the rust arm reads the registry before refresh / before the delegated-install check).
- adoptionReplay: `readMacRunningAppId` runs the rust arm; the `steampoll_read_running_app_id` leaf is answered from the recorded steamfiles RunningAppID result for the case under replay.
- library.updates: dropped the `rearmPersistedSteamRestartHolds` / `library/resume` mock. rustSecondary: dropped the `library/pollState` (MAX_TICKS) and `steamRestartHold` mocks (no case relied on them).
- updateNative.test and games.test were already retargeted in 80-28 (status fake, recorded `steampoll_bridge_finalized` calls); the remaining `cancelDelegatedInstall` / `startInstallPolling` spies target the API modules that keep their paths (80-30), so they stay.

Deleted cases and their cargo mapping:
- steamInstallRuntime "install poll state, notice sequence and bridge-finalized set are per instance": Rust registry / install_loop tests (plans 01, 15) cover the bridge-finalized set, notice sequence and registry isolation.
- bootstrap "steam running-game poller boot wiring" (win32 reg.exe RunningAppID 0 -> X -> 0): plan 08 cargo running-poll tests.
- libraryReplay readAcfState / scanDownloadingAppIds / findOtherManifestsWithInstalldir / breadcrumbAppIsFullyInstalledOnDisk cases and acfUpdateReplay readAcfUpdateFieldsFromDir cases: their TS wrappers go through the Rust poll commands now; cargo steampoll acf tests (80-04..80-16 mapping) cover the reads. Anti-vacuity floor in libraryReplay lowered 24 -> 8.

Task 2: `git rm` of the three Jest tests, `steamPollReplay/` (including `mocks.ts`), and `meta/gamelibSteampollCli.ts`. Crate fixtures untouched.

## Final inventory (test files still naming TS poll modules / registries)

Only thin rust-only API modules that keep their paths (plan 30 owns), and `.polls.` / `uninstallPolls` / store reads (plan 31 owns): gameDetailsModules, cancelDelete, games, library.macArch, library.resumeBreadcrumbs, library.test, library.updates (`../library/acfState`, `refresh` mocks), pollsRustBranch.{acf,install,uninstallRunning}, queueHeadRevalidation, removeCopies, staleQueueHeadCancel, updateDetection.acf, updateDispatch, updateInfo, updateLaunchPrompt, updateNative, rustSecondary, adoptionReplay (runningPoll). No harness file remains.

## Gates

- test:ci: only the known-red suites fail (tauriShellSource, flowRegistrationCensus, ipcDomainCensus, epicOfflineMode, shimCoverage, shimGenerate, themeTokens, callbackRegistryHost, gamelibCatalogParity, genI18nGateScope, lintTranslations, steamLineCeiling, x86CallbackWineHarness). No new failures.
- codecheck: pass. prettier on edited paths: pass. find-deadcode: pass. gameinfo-narrowing-ceiling: pass. i18n --fail-on-update: pass.
- backend-di-ceilings: only the three `GameStatus.*` growth entries remain (known red). The `steamPollParity` / `steamPollTsDriver` / `steamPollProfileFixtures` entries are gone (files deleted); library.updates 7 -> 6 and rustSecondary 10 -> 8 lowered in the shard.
- cargo test -p gamelib-steampoll-cli --test frozen_parity: pass.
- lint: 1 production-scope error, `readSteamRestartHold` unused in `steamRestartHold.ts` (git log: introduced by 80-28 commit 847c799d1 deleting its only test caller; the file is deleted in plan 31). Not touched here.

## Deviations

None of Rule 1-3 beyond: the sidecar flow tests needed the `answerPollStatus` helper (Rule 3, rust arm blocks on an unanswered invoke) and the replay tests lost TS-wrapper cases for modules going thin (documented above).

## Self-Check: PASSED
