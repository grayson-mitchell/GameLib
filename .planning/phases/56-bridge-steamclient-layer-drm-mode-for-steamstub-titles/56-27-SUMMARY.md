---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 27
subsystem: steam-bridge-drm
tags: [gap-closure, drm, card-status]
requirements: [D-05, D-13]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/drmLaunchSetup.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
metrics:
  completed: 2026-10-29
---

# Phase 56 Plan 27: Terminal 'done' after DRM setup failure Summary

DRM setup failures that followed 'drm-setup' progress now send a logged terminal 'done' status, closing verification gap 2 (IN-01).

## Root cause
The Steam launch is dispatched by `dispatchSteamLaunch` (steamFlowRegistration.ts) and never reaches launcher.ts's 'done', so progress frames stuck on the card.

## Changes
- `drmLaunchSetup.ts`: `fail()` sends `{appName, runner:'steam', status:'done'}` when `progressSent`, inside try/catch, logging `sent terminal status done after <stage>`. The step sequence is wrapped so a throw inside runSetup after progress routes through `fail('bottle-stage', ...)`. No send on success or without progress. (3e7d63dfb)
- `games.ts`: a failed `launchDrmModeGame` after `drm.progressSent` sends 'done' and logs `sent terminal status done after launch failure`; corrected the stale comment in the `drm.status === 'error'` branch. (59f1dd9a2)
- Tests: five new drmLaunchSetup tests (error path, throw path, no progress, Mac Steam not running, success), two new games tests (progress and no progress).

## Deviations
None of substance. Tests were written alongside the implementation rather than strictly red-first.

## Verification
drmLaunchSetup suite 40/40, games suite 455/455, tsc clean, prettier clean.

## Self-Check: PASSED
