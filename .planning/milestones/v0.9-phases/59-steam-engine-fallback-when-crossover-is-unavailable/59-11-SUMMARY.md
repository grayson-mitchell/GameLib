---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 11
subsystem: steam-engine
tags: [steam, game-page, ui, zustand]
requires: [59-08]
provides:
  - useSteamEngineState store + handleSteamEngineStateChangedSignal (global listener in GlobalState)
  - EngineBadge (Built-in / Unsupported) and SteamEngineNotices (trial, no-CrossOver, untested)
  - Game page wiring for Steam titles on macOS
key-files:
  created:
    - src/frontend/state/SteamEngineState.ts
    - src/frontend/state/__tests__/SteamEngineState.test.ts
    - src/frontend/screens/Game/GamePage/components/EngineBadge.tsx
    - src/frontend/screens/Game/GamePage/components/SteamEngineNotices.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/EngineBadge.test.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/SteamEngineNotices.test.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/gamelibT.ts
  modified:
    - src/frontend/state/GlobalState.tsx
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/index.css
decisions:
  - "Dismissal hides the note optimistically in the store after the IPC resolves; backend persists it"
  - "Refetch after a launch ends is keyed off a launching/playing -> idle transition, no timer"
metrics:
  tasks: 2
  completed: 2026-11-01
---

# Phase 59 Plan 11: Game page engine badge and notices Summary

Steam titles on macOS now show a "Built-in engine (best-effort)" / "Unsupported engine" badge and inline non-modal notices (7-day CrossOver trial countdown with Buy link, dismissible no-CrossOver note, one-time untested-build note), all fed by backend engine state.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. Store, listener, EngineBadge, SteamEngineNotices | 0ad596aa5 | 16 tests green |
| 2. Game page wiring and styles | 5d388a588 | codecheck clean; 27 GamePage suites / 432 tests pass |

## Deviations from Plan

**1. [Rule 3 - Blocking] Extra test helper.** Added `__tests__/gamelibT.ts`, a `t` resolving the real en gamelib.json with plural and interpolation (the existing faithfulTranslate does not support options). Tests are DOM-less function-invocation style, since jsdom is not installed.

**2. Components imported directly** (not via `./components` index) to avoid touching an unlisted file.

## Verification notes

- `pnpm lint` fails on pre-existing errors in other files (engine/*.ts, meta/*); the eslint run over this plan's files shows 0 errors (warnings only, matching repo norms).
- Unsupported badge uses `var(--status-danger)` (exists in _colors.scss); no hard-coded colours.
- Full `jest --selectProjects Frontend` not run; GamePage suites and the three new suites pass.

## Known Stubs

None.

## Self-Check: PASSED
