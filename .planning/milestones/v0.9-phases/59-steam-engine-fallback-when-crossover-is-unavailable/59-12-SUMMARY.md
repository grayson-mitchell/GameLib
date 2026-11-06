---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 12
subsystem: settings-ui
tags: [steam, engine-override, settings]
requires: [59-03, 59-08]
provides: [SteamEngineOverride advanced per-game control]
affects: [GamesSettings Advanced tab]
key-files:
  created:
    - src/frontend/screens/Settings/components/SteamEngineOverride.tsx
    - src/frontend/screens/Settings/components/__tests__/SteamEngineOverride.test.tsx
  modified:
    - src/frontend/screens/Settings/components/index.ts
    - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
    - src/frontend/screens/Settings/sections/GamesSettings/index.scss
decisions:
  - "Pure SteamEngineOverrideView plus a thin hook container, so the plain-function (no jsdom) test style can cover all behaviors"
  - "Help is an InfoIcon via SelectField labelHelp on the label line (no Help link)"
requirements-completed: [D-08, D-14]
duration: 15min
completed: 2026-11-01
---

# Phase 59 Plan 12: Per-game Steam engine override Summary

Collapsed "Engine (advanced)" select in a Steam game's Advanced settings on macOS, defaulting to Automatic, offering only ids from listSteamEngineOptions and showing the Unsupported warning for any other choice.

## Tasks
1. SteamEngineOverride component + 7 tests - 2de586e7e
2. Placement in GamesSettings Advanced tab (`!isDefault && isMac && runner === 'steam'`) + scss - 0608ce7ad

## Deviations from Plan
- [Rule 3] Tests mock `SelectField`/`InfoIcon` because their CSS imports cannot load under the frontend jest config; SelectField imported directly rather than via the UI barrel for the same reason.
- No GamesSettings test exists, so the optional placement test was not added; the gate is a single conditional.
- `pnpm lint` fails on pre-existing errors in unrelated files; `npx eslint` on the changed files is clean. `pnpm codecheck` and `npx jest src/frontend/screens/Settings` pass.

## Known Stubs
None.

## Self-Check: PASSED
