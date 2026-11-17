---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 03
subsystem: steam-polling
status: complete
tags: [typescript, steam, adoption, rustinvoke, sidecar-boot]
requires: [81-02]
provides:
  - adoptionWatch.ts (AdoptionWatchDeps, adoptionWatchArgs, recordAndWatchPendingAdoption, clearAndUnwatchPendingAdoption, readSteamAdoption, resumeAdoptionWatches)
  - listPendingAdoptions in macSteamAdoption.ts (shared parsePendingAdoption validator)
  - boot step 'steam-adoption-resume' (directly after 'mac-steam-online-restore')
affects: [81-05, 81-06, 81-08, 81-09]
tech-stack:
  added: []
  patterns: [TS record store is the single writer and Rust watch list is fed from it, fire-and-forget unwatch with logged catch, narrow deps slice instead of the whole ManagerDeps bundle at boot]
key-files:
  created:
    - src/backend/storeManagers/steam/adoptionWatch.ts
    - src/backend/storeManagers/steam/__tests__/adoptionWatch.test.ts
  modified:
    - src/backend/storeManagers/steam/gameInstallDepot.ts
    - src/backend/storeManagers/steam/macSteamAdoption.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/bootstrap.steamcm.test.ts
decisions:
  - "watchPendingAdoption is a private boolean-returning helper, not an export: nothing outside adoptionWatch.ts needs it (record-and-watch and resume cover every caller) and knip flags an unused export"
  - "The boot step passes a narrow {requestRustInvoke, stores, config} slice to resumeAdoptionWatches rather than building the whole ManagerDeps bundle"
metrics:
  tasks: 2
  files: 8
  completed: 2026-11-18
commits: 2
plan_head_before: 7f72d5a3392bc42a26a1f858bab0060d67095b1e
plan_head_after: 493c3cb48c2da94b593a647f4b662271646d198d
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
---

# Phase 81 Plan 03: adoption watch wired into every record write and clear Summary

Every pending-adoption record GameLib writes is now registered with the Rust watch at once, every clear (install, Play, three uninstall paths) unwatches, and stored records are re-registered once at sidecar boot, with a failed invoke never throwing into the install, launch or uninstall path.

## Commits

- 6940d918c: feat(81-03) install end writes a pending-adoption record and Rust watches it (tracer)
- 493c3cb48: feat(81-03) every clear unwatches; stored pending-adoption records are re-watched at boot

## What was built

- **Task 1 (tracer).** `adoptionWatch.ts`: `adoptionWatchArgs` maps a record to the watch op args; `recordAndWatchPendingAdoption` writes the record then invokes `steampoll_adoption_watch` with `installAppFallback` from `isSteamExperimentalInstallAppEnabled`; `clearAndUnwatchPendingAdoption` clears then fires `steampoll_adoption_unwatch` (rejection logged); `readSteamAdoption` returns the parsed `AdoptionReading` or null on a rejection or a wrong-shaped reply. `gameInstallDepot.ts` routes its one record write and two clears through them.
- **Task 2.** `parsePendingAdoption` factored out of `readPendingAdoption`, plus `listPendingAdoptions`. `resumeAdoptionWatches` watches each valid record whose manifest exists, clears those whose manifest is gone, ignores invalid entries, resolves the watched count and never rejects. The two clears in `gameLaunch.ts` and three in `gameUninstall.ts` use `clearAndUnwatchPendingAdoption`. Boot step `'steam-adoption-resume'` sits after `'mac-steam-online-restore'` (and so after `'rpc-server'`), calls `void resumeAdoptionWatches(...).catch(logWarning)`, creates no timer or handle.

## Verification

- `pnpm exec jest` adoptionWatch (14), macSteamAdoption, games, bootSourceShape, diPhaseGates, moduleStateCensus, bootstrap.steamcm: 967 passed. Whole `src/backend/storeManagers/steam` and `src/backend/sidecar` trees: 7475 passed, 1 failed (the pre-existing `acfUpdateReplay.test.ts`, already in deferred-items.md).
- `pnpm codecheck` clean; eslint 0 errors on touched files (warnings pre-existing); prettier `--check` clean on every touched path (none ignored).
- `cargo test -p gamelib-steampoll` (whole crate, run from `src-tauri/`) green.
- `pnpm backend-di-ceilings` and `pnpm find-deadcode` show only the already-logged pre-existing reds (launchWithoutSteam, NativePortInfo, LaunchWithoutSteam; NativePortDataStyle, NativePortMac). Nothing new.
- Acceptance greps: `clearPendingAdoption(` / `recordPendingAdoption(` in gameInstallDepot.ts, gameLaunch.ts, gameUninstall.ts: 0; `'steam-adoption-resume'` in bootstrap.ts: 2; no `setInterval`/`setTimeout` in adoptionWatch.ts.

## Deviations from Plan

**1. [Rule 3 - gate] `watchPendingAdoption` not exported.** The plan listed it as an export, but nothing outside the module calls it and `pnpm find-deadcode` flagged it as a new finding. It is a private helper returning a boolean (so resume can count successes); `recordAndWatchPendingAdoption` and `resumeAdoptionWatches` wrap it.

**2. [Test setup] The test calls `initHeadless()` from `backend/logger`.** The real logger has no writer until initialised and the invoke-failure paths log, so the suite initialises it (HOME is redirected by the backend jest containment setup) instead of adding a `jest.mock`, which the di-ceilings ratchet forbids.

**3. [Design] Narrow deps at boot.** The plan suggested `managerDepsFromServices(requireServices(state))`; the step passes `{ requestRustInvoke: host.requestRustInvoke, stores, config }`, which is all `AdoptionWatchDeps` needs.

**4. [Rule 3 - pin] Boot-order test.** Added one ordering test to `bootstrap.steamcm.test.ts` (resume directly after `mac-steam-online-restore`, after `rpc-server`). `bootSourceShape` and `diPhaseGates` needed no edits; they derive from the literal.

TDD: Task 1 RED observed (module not found) before the implementation. Task 2 tests were written together with its implementation after Task 1 landed (no separate RED run); the plan is `type: execute`, so no plan-level gate applies.

## Known Stubs

None. `readSteamAdoption` has no production caller until 81-06 (Play gate); it is exercised by tests and not flagged by knip.

## Threat Flags

None beyond the plan's threat model (T-81-07, T-81-08, T-81-09 mitigated as specified).

## Self-Check: PASSED

Both commits (6940d918c, 493c3cb48) are ancestors of HEAD; adoptionWatch.ts and adoptionWatch.test.ts exist.
