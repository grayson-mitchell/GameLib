---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 10
subsystem: steam-engine
tags: [launch-path, engine-selection, launch-deadline, crossover, wine-staging]
requires: [59-01, 59-04, 59-06, 59-07, 59-08, 59-09]
provides:
  - per-launch engine selection in launchBridgeGame (decide, download, register, prepare, re-read settings)
  - CrossOver-only gating for DRM and bottled-Steam launches
  - 180 s launch deadline with "Game didn't start" outcome in fireBridgeWineLaunch
affects: [phase-59 verification]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
key-decisions:
  - "STAGING_MONITOR_MATCH = true (59-01), so the deadline is armed for built-in-engine launches too"
  - "nag_blocks: no (59-01), so no nag notification exists; the deadline bounds the expired-bottle hang"
  - "CrossOver-required dialog is shown on every blocked attempt, not once per session"
requirements-completed: [D-05, D-06, D-07, D-09, D-10, D-11, D-12, D-14, D-15]
completed: 2026-11-01
---

# Phase 59 Plan 10: Engine selection and launch deadline in the launch path Summary

Every bridge launch now runs a fresh CrossOver pre-flight and engine decision, falls back to the built-in engine (downloading it first if needed) with a toast, and every launch is time-bounded by a 180 s deadline that ends in a clear "Game didn't start" dialog with no fallback retry and no rerouting to bottled Steam.

## What changed (games.ts)

- `launchBridgeGame` is now a thin wrapper over `launchBridgeGameBody`; any non-started launch clears the engine registry entry, so no early return leaks a selection.
- TCP bridge path: `selectLaunchEngine` runs `decideLaunchEngine`, downloads via the existing `ensureBuiltInEngineForInstall` (`engine-download` progress), `setEngineSelection`, `prepareBottleForEngine` (dxvk-failed is a warning; game-running and invalid-bottle abort), re-reads `getBridgeBottleSettings`, logs `decision.logLines` (engine/version line and untested line, every launch), calls `recordLaunchDecision` (badge republish) and toasts for automatic non-CrossOver drops.
- DRM and bottled Steam: pre-flight only; not healthy gives the CrossOver-required dialog and a terminal `done`, with no engine decision, no `drmLaunchSetup`, no dispatch.
- `fireBridgeWineLaunch`: `armLaunchDeadline` before known fixes and redists, `onFirstMatch` cancels it, fired checks after each pre-launch step, cancel on launcher exit (only if never matched) and on launch error, `clearEngineSelection` in `onStopped`.
- `onBridgeLaunchDeadline`: stop monitor, `killBridgeBottleWineServer(appId, 15000)` before clearing the registry, stop helper, clear record, `done`, dialog. No `markBridgeFailedThisSession`, `steamBridgeSetupRequired`, `reportLaunchFailure`, `decideLaunchEngine` or `ensurePinnedEngine`.

## Verification

- games.test.ts, bottleProcessMonitor.test.ts, launchDeadline.test.ts: 584 pass (21 new tests covering each behavior bullet).
- `pnpm codecheck`, `pnpm smoke:sidecar`, `eslint --quiet` on both files, prettier check: clean.
- `jest --selectProjects Backend`: 6 failing suites (cargoFeatures, testContainment, steamFlows, skeletonFlows, getDefaultLegendarySavePathRefresh). steamFlows and cargoFeatures were confirmed failing on HEAD with my games.ts reverted; the others are in files this plan does not touch. None are caused by this plan.

## Deviations from Plan

1. **Single commit for both tasks (585b5451e).** The tasks edit the same functions and share one test file and one wrapper, so they were committed together rather than split.
2. **CrossOver-required dialog is not deduplicated per session.** The plan asked for once per appId|kind; a second Play that silently does nothing is worse, so it shows each time.
3. **[Rule 1 - test update]** The existing 56-12 test "not-applicable after a registered runner re-reads the bottle settings" counts `getBridgeBottleSettings` calls; the new engine re-read adds one, so its expectation moved from `/v2/wine` to `/v3/wine` (semantics unchanged).
4. `onBridgeLaunchDeadline` takes only `clearLaunchRecord` (no `launchRecord` argument; it was unused).

## Known Stubs

None.

## Threat Flags

None. The deadline kill uses the per-game guarded `killBridgeBottleWineServer`; no code touches NagTime, the licence or CrossOver's registry.

## Self-Check: PASSED

Commit 585b5451e exists; both modified files exist.
