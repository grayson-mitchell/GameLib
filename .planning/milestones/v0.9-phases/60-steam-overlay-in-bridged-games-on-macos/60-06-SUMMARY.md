---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 06
subsystem: settings-ui
tags: [steam, overlay, settings, i18n]
requires: [60-02]
provides:
  - SteamEngineState.overlayEligible
  - steam.overlay.* gamelib catalogue keys
  - SteamOverlayOverride per-game toggle
affects: [60-08, 60-09]
key-files:
  created:
    - src/frontend/screens/Settings/components/SteamOverlayOverride.tsx
    - src/frontend/screens/Settings/components/__tests__/SteamOverlayOverride.test.tsx
  modified:
    - src/common/types/steam.ts
    - src/backend/storeManagers/steam/engine/engineState.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts
    - src/frontend/screens/Settings/components/index.ts
    - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
    - public/locales/en/gamelib.json
decisions:
  - overlayEligible is true wherever engineState has a bridge bottle on macOS, DRM-mode included
  - Toggle shown inside the existing non-Default, macOS, steam-runner Advanced block, after the engine override
metrics:
  tasks: 2
  completed: 2026-11-03
---

# Phase 60 Plan 06: Per-game overlay toggle Summary

Per-game Automatic/On/Off Steam overlay select in Advanced settings, gated by a backend `overlayEligible` flag (DRM-mode titles included), plus all `steam.overlay.*` strings in gamelib.json.

## Commits
- e892f274a: overlayEligible + catalogue keys
- 0d5bc1a22: SteamOverlayOverride component, test, mount

## Deviations from Plan
- [Rule 3] The test lives in `components/__tests__/SteamOverlayOverride.test.tsx`, not beside the component: jest only matches `__tests__` here (the plan path found no tests). The plan's stated location was wrong.
- Added an `export` line for SteamOverlayOverride to `components/index.ts` (GamesSettings imports from that barrel).
- Catalogue step texts match OVERLAY_STEP_TEXT in `bridge/overlay/overlayNotice.ts` exactly.

## Deferred / pre-existing issues
- `pnpm lint-translations` fails on missing non-en translations (pl etc.), already true for existing `steam.engine.*` keys; the new overlay keys add to the same class.
- `pnpm i18n-churn-guard` fails because `public/locales/en/translation.json` is dirty in the working tree from before this plan (not touched by this plan).
- `pnpm lint` reports 1 error in an unrelated file (`'manifest' is defined but never used`, line 7472 of a production file), outside this plan's files.
- `pnpm codecheck` passes; engineState (39) and Settings (28 suites) jest pass; new component test has 7 cases.

## Self-Check: PASSED
