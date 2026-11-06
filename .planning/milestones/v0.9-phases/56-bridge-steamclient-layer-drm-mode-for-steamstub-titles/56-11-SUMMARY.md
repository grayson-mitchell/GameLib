---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 11
subsystem: steam-bridge
tags: [drm, orchestrator, bottle, crossover]
requires: [56-04, 56-07, 56-08, 56-09, 56-10]
provides: [drmLaunchSetup, getDrmBridgeBottleSettings, DRM runner registry]
affects: [56-12]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/drmLaunchSetup.test.ts
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
decisions:
  - launch_form is bin/wine+CX_BOTTLE (56-01-SUMMARY.md line 47)
  - session stop before runner registration is REQUIRED by 56-01 consequences, not only a safeguard
metrics:
  tasks: 2
  completed: 2026-10-28
---

# Phase 56 Plan 11: drmLaunchSetup orchestrator and DRM bottle-settings variant Summary

One ordered, never-rejecting DRM launch-setup orchestrator (Mac Steam, CrossOver allowlist, component, runner, Valve client, bottle staging) plus a per-appId clone-runner registry in bottle.ts that keeps the title's own bridge bottle.

## Commits
- 2e3c354bc: bottle.ts DRM variant, DRM_LAUNCH_FORM, runner validation, registry, clone wineserver stop
- f08b31cb7: drmLaunchSetup.ts and its tests

## Signatures for 56-12
- `drmLaunchSetup(input: DrmLaunchSetupInput, deps?: DrmLaunchSetupDeps): Promise<DrmLaunchSetupResult>`
- `DrmLaunchSetupInput = { appId, appFolder, bottleName, exePath, installRoot, installdir, drmWrapper: 'steamstub'|'none'|undefined, cegMarkers?, signal? }`
- `DrmLaunchSetupResult = DrmStepResult<DrmLaunchReady> | { status: 'not-applicable'; mode: 'tcp' }`
- `DrmLaunchReady = { mode, appId, crossover, component, runner, valveClient, bottle (StageDrmBottleOk minus status), bottleSettings, launchForm, anchor: { crossover, client }, progressSent }`
- `DRM_PROGRESS_CONTEXT = { runner: 'Compatibility runner', valveClient: 'Steam client files' }`
- bottle.ts: `DRM_LAUNCH_FORM`, `DrmLaunchForm`, `DrmBridgeRunner`, `drmRunnerWineInstallation`, `getDrmBridgeBottleSettings(appId, runner, form?)`, `setDrmBridgeRunner`, `clearDrmBridgeRunner`, `getDrmBridgeRunner`

## Call contract for 56-12
- Call `drmLaunchSetup({ appId, appFolder, bottleName, exePath, installRoot, installdir, drmWrapper, cegMarkers, signal })` on every bridge launch after the bottle/exe gate and before `placeShimForGame`.
- `not-applicable`: continue the TCP path unchanged.
- error: `formatDrmNoticeLine(appId, result.step, result.cause)` plus the notice; no launch.
- ok: launch `result.bottle.helperWinPath` with the game exe under `result.bottleSettings` (or `getBridgeBottleSettings(appId)`, now the same variant). The settings computed at games.ts:3079 predate the swap and must not be used.
- `result.anchor` feeds `formatBridgeDrmAnchor`; `result.bottle.steamDirHost` is the first WINEDLLPATH entry; `result.progressSent` says whether a `redist` status needs resetting on failure.

## launch_form
`bin/wine+CX_BOTTLE`, from 56-01-SUMMARY.md line 47 (`launch_form: bin/wine+CX_BOTTLE`). Swap is `bin: <clone>/bin/wine`, `wineserver: <clone>/bin/wineserver`, `type: 'crossover'`. No extra raw-form env keys were named by the SUMMARY. The raw form is implemented too (WINELOADER/WINESERVER env replace, winePrefix set) but unused.

## Session stop
The stop of the previous runner's wineserver before registration is required by 56-01's "Consequences" (stop a still-running stock wineserver before the first clone launch), and is kept as bounded (15 s). It runs only when the registered runnerDir differs from the new one.

## Notes
- The real runner path contains a space (`Application Support`); the bottle.test.ts and drmLaunchSetup tests use such paths.
- Deviation: tasks were committed as one commit each (tests and implementation together) rather than separate RED/GREEN commits.

## Deviations from Plan
None beyond the commit granularity above.

## Deferred / environment
- `node meta/findDeadcode.cjs` reports only the three pre-existing used-in-module findings (GameMakerRunnerSignals, PeReader, WINE_DRIVERS_KEY); none are from this plan.
- `requirements.mark-complete`: REQUIREMENTS.md missing in this repo (known); skipped.
- `roadmap.update-plan-progress` reported summary_count 10 (this SUMMARY did not yet exist when run).

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
bottle.ts, bottle.test.ts, drmLaunchSetup.ts, drmLaunchSetup.test.ts exist; commits 2e3c354bc and f08b31cb7 exist; drm suites, bottle, fakeHomeIsolation jest pass; codecheck and prettier pass.
