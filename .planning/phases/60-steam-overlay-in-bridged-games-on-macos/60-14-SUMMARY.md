---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 14
subsystem: steam-overlay
tags: [overlay, notice, macos, g4, gap-closure]
requires: [60-13]
provides:
  - SteamEngineState.overlayNotice { step, seq }
  - engineState.publishOverlayNotice(appId, step)
  - In-app "Steam overlay unavailable" notice with focus-gated auto-hide
affects: []
tech-stack:
  added: []
  patterns: [seq-tracked notice over the steamEngineStateChanged push, closed-union validation on both ends]
key-files:
  modified:
    - src/common/types/steam.ts
    - src/backend/storeManagers/steam/engine/engineState.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
    - src/frontend/components/UI/SteamEngineLaunchNotice/index.scss
    - src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx
key-decisions:
  - "Overlay notice reuses existing catalogue strings; no locale changes"
  - "publishOverlayNotice re-pushes the last published state (keeping launchNotice) with a seq from the shared launchNoticeSeq counter"
  - "Overlay auto-hide timer starts only when document is visible and focused"
requirements-completed: [G4, D-08, D-09]
duration: 25min
completed: 2026-11-04
---

# Phase 60 Plan 14: G4 in-app overlay-unavailable notice Summary

Every overlay setup failure now pushes a seq-numbered `overlayNotice` to the renderer, which shows a non-modal "Steam overlay unavailable" notice naming the failed step; the OS notification is still sent and no dialog is ever opened.

## Tasks

1. Backend: commit 726bda01c. `publishOverlayNotice` validates appId (`/^\d+$/`) and step (`OVERLAY_STEPS`), returns false with no base state; `notifyOverlaySetupFailed` calls it and logs `overlay notice surface=in-app pushed=<bool>`. A games.test case asserts one push per launch across two launches and zero `showDialogBoxModalAuto` calls.
2. Frontend: commit 943da5551. Second `role="status"` notice (`--overlay` modifier, stacked above the engine notice), `isOverlayStep` guard, local `OVERLAY_STEP_KEYS` map (test asserts equality with backend `OVERLAY_STEP_TEXT`), focus/visibility-gated 8 s timer with listener cleanup.

## Deviations from Plan

None of substance. Existing `getSteamEngineState` toEqual fixture gained `overlayNotice: null` (compute now emits it); the frontend test's `t` mock now interpolates `{{step}}`. In `games.test.ts` the mocked engineState module gained `publishOverlayNotice`.

## Verification

engineState (41), SteamEngineLaunchNotice (14) and games.test `-t overlay` (51) pass; `pnpm codecheck` clean; `pnpm lint-translations` 0 hard failures; prettier clean. ESLint on touched files: 2 warnings, both on pre-existing code (`dismissSteamEngineNotice` require-await; a `find` any-argument in the existing test). Locale file untouched.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED
