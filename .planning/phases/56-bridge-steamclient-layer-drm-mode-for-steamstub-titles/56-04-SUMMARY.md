---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 04
subsystem: steam-bridge
tags: [drm, steamstub, routing, typescript, jest]
requires: []
provides:
  - resolveBridgeMode routing (D-12)
  - DrmStep union, DrmStepResult, drmStepError, notice and anchor formatters (D-13)
  - drmPaths on-disk layout keyed by CrossOver build (D-09)
affects: [56-05, 56-07, 56-08, 56-09, 56-10, 56-11, 56-12]
tech-stack:
  added: []
  patterns: [zero-import pure module (D-51-15), null-not-throw path getters]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/drm/steamclientLayerMode.ts
    - src/backend/storeManagers/steam/bridge/drm/drmPaths.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/steamclientLayerMode.test.ts
  modified:
    - src/backend/storeManagers/steam/bridge/peSteamDrm.ts
key-decisions:
  - "CEG-marked steamstub exe resolves to 'tcp' so the existing refusal path keeps handling it"
  - "drmPaths takes appFolder as a parameter; never imports constants/paths"
requirements-completed: [D-09, D-12, D-13]
duration: 15min
completed: 2026-10-28
---

# Phase 56 Plan 04: DRM-mode contracts Summary

Pure, tested contracts for DRM mode: routing decision, nine-step failure vocabulary, typed step result, single-line notice and anchor formatters, and the `<appFolder>/steam-bridge/drm/` layout.

## Exported signatures (copy these)

steamclientLayerMode.ts (zero imports):
- `type BridgeMode = 'tcp' | 'steamclient-layer'`; `const STEAMCLIENT_LAYER_MODE`
- `resolveBridgeMode(drmWrapper: 'steamstub'|'none'|undefined, cegMarkers?: readonly string[]): BridgeMode`
- `DRM_STEPS` (steam-not-running, unsupported-crossover, component-missing, component-verify, runner-clone, runner-patch, valve-fetch, valve-verify, bottle-stage); `type DrmStep`; `isDrmStep(v: unknown): v is DrmStep`
- `type DrmNoticeReason = \`drm-${DrmStep}\``; `drmNoticeReason(step)`
- `type DrmStepError = { status:'error'; step: DrmStep; cause: string }`; `type DrmStepResult<T extends object = Record<never,never>> = ({status:'ok'} & T) | DrmStepError`
- `DRM_CAUSE_MAX_CHARS = 160`; `drmStepError(step, cause: unknown): DrmStepError`
- `formatDrmNoticeLine(appId: string, step: DrmStep, cause: string): string`
- `type BridgeDrmAnchorFields = {appId, crossover, client, trace}`; `formatBridgeDrmAnchor(f): string | null`

drmPaths.ts (imports only `path`):
- `buildDrmPaths(appFolder: string): DrmPaths | null` with `root, valveClientRoot, runnersRoot, componentRoot, traceRoot, valveClientDir(v), runnerDir(build), runnerAppPath(build), componentDir(id), traceFile(appId, launchId)` (each getter returns `string | null`)
- `steamclientLayerComponentId(build): string | null`; `newDrmLaunchId(now = Date.now()): string`

## Notes for 56-05
- `trace=` in the `[bridge-drm]` anchor is the LAST field and may contain spaces (`Application Support`); parse it as the rest of the line, not `\S+`.
- The crossover regex requires at least three numeric parts (`26.3.0.39832` ok, `26.3` rejected).

## Commits
- 05616204a test: failing tests (routing, steps, formatters)
- 462706679 feat: steamclientLayerMode.ts
- 9865900d4 test: failing drmPaths tests
- bfe759cd1 feat: drmPaths.ts and peSteamDrm.ts header fix

## Deviations from Plan
None - plan executed as written. (`pnpm find-deadcode` reported nothing for bridge/drm.) `requirements.mark-complete` is skipped: REQUIREMENTS.md is missing in this repo (known).

## Self-Check: PASSED
56 jest tests pass (drm + peSteamDrm), codecheck clean, prettier clean, peSteamDrm diff is comment-only, constants/paths.ts untouched.
