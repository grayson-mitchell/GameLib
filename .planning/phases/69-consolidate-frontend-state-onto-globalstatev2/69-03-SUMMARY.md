---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 03
subsystem: testing
tags: [jest, jsdom, react-profiler, perf, rerender]
requires: []
provides:
  - "pnpm perf:rerender: D-14 four-step scenario on a 2,000-game synthetic library, JSON of Library/GameCard commit counts + actualDuration (median of 5)"
  - "meta/rerender/seam.tsx: only era-specific file (69-25 edits it)"
affects: [69-04, 69-25]
tech-stack:
  added: [jest-environment-jsdom@29.7.0]
  patterns: ["Profiler-wrapped GameCard via jest.mock in meta/rerender only"]
key-files:
  created:
    - meta/rerender/jest.config.js
    - meta/rerender/fakeApi.ts
    - meta/rerender/syntheticLibrary.ts
    - meta/rerender/seam.tsx
    - meta/rerender/rerender.perf.tsx
    - meta/rerender/styleStub.js
    - meta/rerender/setupJsdom.js
  modified: [package.json, pnpm-lock.yaml, tsconfig.meta.json]
key-decisions:
  - "Harness route: option-a (jsdom under jest)"
duration: ~25min
completed: 2026-11-10
---

# Phase 69 Plan 03: D-14 re-render harness Summary

Headless jsdom Profiler harness (`pnpm perf:rerender`) measuring Library and GameCard commits for toggleAppearance, gameStatusPush, dialogOpenClose and libraryRefreshPush against a 2,000-game synthetic library.

## Decisions (operator input)

- Task 1 route: operator selected "option-a: jsdom (Recommended)" -> option id `option-a`.
- Task 2 package legitimacy (blocking-human): operator was shown `npm view jest-environment-jsdom@29.7.0` facts (repo jestjs/jest, packages/jest-environment-jsdom, maintainers simenb/cpojer/aaronabramov, depends on jsdom ^20, no scripts) and replied "approved". Only `pnpm add -D jest-environment-jsdom@29.7.0` was run; no other package added.

## Task commits

- Tasks 1-2: decisions only, no commit (install is in the Task 3 commit since it shares package.json).
- Task 3: `9d827905b` (harness, dependency, script).

## Smoke run (deleted; 69-04 captures the committed baseline)

Library commit counts were 2-3 per step and GameCard 200-266, so the probe is not vacuous (gameStatusPush Library count 3).

## Stubs needed to mount Library in jsdom (all inside meta/rerender)

- `jest.mock('../../src/preload/tauriAttach')`: it overwrites `window.api` at import.
- `setupJsdom.js`: TextEncoder/TextDecoder, IntersectionObserver, ResizeObserver, matchMedia, Element.scrollTo/scrollIntoView, window.scrollTo, `IS_REACT_ACT_ENVIRONMENT`.
- CSS/image moduleNameMapper -> `styleStub.js`; existing svg `?react` stub reused.
- fakeApi: real store names (`legendary_library`, `gog_library`, `nile_library`, `steam_library` with `__timestamp.*` and `storeHas`, `sideloadedStore`, `gogInstalledGamesStore`) plus `getCrossoverIndex`/`getRunsForMeMap` -> `{}` and humble keys/sync-state shapes.

## Deviations from Plan

**1. [Rule 3 - Blocking] tsconfig.meta.json excludes meta/rerender.** The harness imports frontend code, which `tsc -p tsconfig.meta.json` (include: meta) could not type-check (375 errors: no `window.api` typings). The directory is type-checked by ts-jest under the root tsconfig when `pnpm perf:rerender` runs. `pnpm codecheck` passes.

**2. Extra file `setupJsdom.js`** (not in the plan's file list) for the jsdom polyfills above.

## Notes for later plans

- `seam.tsx` currently mounts `<GlobalState>` plus `Library`; GlobalStateV2 (zustand) already coexists, so the zustand slice is already live in the measured baseline. 69-25 rewrites mountApp/toggleAppearance/dialogOpenClose.
- jsdom timings are not WebKit timings; commit counts are the primary metric.
- `pnpm test:ci --listTests` lists no `*.perf.tsx`; no file under `src/` changed.
- Perf script is not wired into pre-push/CI.

## Self-Check: PASSED
