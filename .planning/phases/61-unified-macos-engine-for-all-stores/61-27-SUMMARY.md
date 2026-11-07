---
phase: 61-unified-macos-engine-for-all-stores
plan: 27
subsystem: engine
tags: [engine, launch-deadline, notice, wr-02, gap-closure]
requires: [61-26]
provides:
  - "showEngineNotice and publishLaunchDeadlineNotice: a launch-deadline notice that never raises the window or opens a modal"
  - "EngineState.deadlineNotice plus a fifth toast stream in SteamEngineLaunchNotice"
affects: [launchEngine, engineDialogs, engineState, SteamEngineLaunchNotice]
key-files:
  modified:
    - src/common/types/engine.ts
    - src/backend/engine/engineState.ts
    - src/backend/engine/engineDialogs.ts
    - src/backend/engine/launchEngine.ts
    - src/backend/engine/__tests__/engineState.test.ts
    - src/backend/engine/__tests__/launchEngine.deadline.test.ts
    - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
    - src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx
    - .planning/phases/61-unified-macos-engine-for-all-stores/61-HUMAN-UAT.md
decisions:
  - "Deadline notice = system notification + bottom-right in-app toast; DeadlineDeps drops showDialog so the path cannot reach the raising dialog"
metrics:
  completed: 2026-11-07
  tasks: 2
---

# Phase 61 Plan 27: WR-02 deadline notice without focus theft Summary

When the 180 s launch deadline fires with no game process seen, the user now gets a system notification and a bottom-right toast (held until GameLib is in front). The main window is not raised, no modal opens, and nothing is stopped.

## What changed

- `engineDialogs.ts`: new `showEngineNotice` (notify only, logs `raise=false`). `showEngineDialog` is unchanged for refused launches.
- `engineState.ts` and `common/types/engine.ts`: `EngineState.deadlineNotice` and `publishLaunchDeadlineNotice`. It uses the shared seq, caps the title at 200 characters and never throws.
- `launchEngine.ts`: `DeadlineDeps` is now `{ watch, showNotice, publishNotice }`. `onEngineLaunchDeadline` calls `showNotice` and `publishNotice`. It has no kill, stop or dialog call.
- `SteamEngineLaunchNotice/index.tsx`: a fifth stream copied from the exit stream. It validates seq, title and seconds types, shows once per seq, waits for focus, and reuses the notDetected strings. No locale changes.
- 61-HUMAN-UAT.md item 2 recorded as pass (passed 2, pending 1).

## Tests

Engine suites (deadline, engineState, launchEngine, fakeHomeIsolation) and the notice component suite (40 tests) pass. `pnpm codecheck` and `pnpm boundaries` pass. `pnpm lint` reports 0 errors and 1115 existing warnings. Prettier passes on all source paths.

## Deviations from Plan

**1. [Rule 1 - Bug] CR-03 test assertion**
- The plan said to replace the CR-03 assertions with "notify / publishNotice not called". That test lets the deadline fire, so notify must be called and the assertion would fail. Kept the neighbour-untouched assertions and asserted `showEngineDialog` and `raiseMainWindow` are not called. WR-01 give-up still asserts notify and publishNotice are not called.

**2. [Rule 3 - Blocking] backend/platform mock**
- The deadline test's `backend/platform` mock spreads the actual module and adds `getPath`, because `paths.ts` calls `app.getPath` at import (the plan anticipated this).

**3. [Rule 1 - Bug] engineState test fixture**
- An existing `toEqual` fixture needed `deadlineNotice: null`.

## Commits

- 8af776990: backend notice path
- c9302df5b: renderer toast stream
- UAT edit and this SUMMARY are in the docs commit.

## Self-Check: PASSED
