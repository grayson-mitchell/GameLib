---
phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
plan: 01
subsystem: steam-bridge-launch
tags: [drm-mode, engine-switch, crossover, audit-s9]
requires: []
provides:
  - drmOfflinePrecheck and prepareDrmBottleForCrossover (gameLaunch.ts)
  - DRM launches return the bottle to CrossOver via prepareBottleForEngine
affects: [gameBridgeLaunch.ts, gamelib.json en]
key-files:
  modified:
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/gameBridgeLaunch.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - public/locales/en/gamelib.json
decisions:
  - selectLaunchEngine left unedited; two new helpers added beside it (TCP path byte-identical)
  - game-running/invalid-bottle refusals use new key steam.engine.drmSwitchRefused
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 76 Plan 01: Engine-correct bottle for DRM-mode launches Summary

DRM-mode (steamclient-layer) launches now run an offline pre-check (override pinned to crossover) before preflightCrossover and, after a healthy preflight, switch the bottle to CrossOver via the existing marker-based prepareBottleForEngine, refusing with one dialog plus terminal `done` on any failure (audit S9, DEBT-01).

## Commits
- 83746beb1 test(76-01): failing DRM-mode tests (RED; 11 failing for the right reasons)
- eea599129 feat(76-01): implementation (GREEN)

## Baseline
- Base SHA: 677e99e02f0bfb1e945ccec83daa4d99f62ac4aa
- games.test.ts `jest.mock(` count: 46 before, 46 after

## Verification
- games.test.ts 684/684 pass; engineSwitch, offlineRefusal, backendDiCeilings, boundaryGates pass (230); codecheck clean; eslint 0 errors (pre-existing i18next warnings); prettier clean.
- gameLaunch.ts diff is additions only (selectLaunchEngine unedited); no change to gameInstallBridge.ts or engine/*.

## Deviations from Plan
None in code. Note: `pnpm lint-translations:gamelib` exits 1 because non-English locales lack translations, including the new key `drmSwitchRefused` (96 lines) alongside many pre-existing missing keys (e.g. uz bridge.drm.title). Per the plan, other locales and `*.mt.json` were not edited. Deferred to the translation pipeline.

## Known Stubs
None.

## Self-Check: PASSED
