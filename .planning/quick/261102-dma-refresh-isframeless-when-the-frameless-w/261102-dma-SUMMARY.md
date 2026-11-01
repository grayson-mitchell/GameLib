---
phase: quick-261102-dma
plan: 01
subsystem: window-chrome
tags: [tauri, preload, frameless, windows, react-state]
requires: []
provides:
  - window.api.handleFramelessChanged (subscribe-only frameless-change push)
affects: [src/preload/api, src/frontend/state/GlobalState.tsx]
key-files:
  created:
    - src/frontend/state/__tests__/GlobalStateFramelessRefresh.test.ts
    - .planning/todos/pending/2026-11-02-windows-controls-linger-after-frameless-off.md
  modified:
    - src/preload/api/tauriWindowChrome.ts
    - src/preload/api/settings.ts
    - src/preload/api/misc.ts
    - src/frontend/state/GlobalState.tsx
    - src/preload/__tests__/framelessRuntime.test.ts
decisions:
  - "Push the WRITTEN framelessWindow value from setSetting instead of re-reading window.api.isFrameless(), because the settings snapshot is patched only on the sidecar STORE_CHANGED round trip."
  - "App.tsx left byte-unchanged so the macOS two-boolean gate and its pinned tests are untouched."
metrics:
  duration: ~25m
  completed: 2026-11-02
status: complete
commits: 4
plan_head_before: 6c9b4396ea287cef2e232a2f3bb853ccb730746b
plan_head_after: 9205e177efc728f74b341081115c5290444aa2ce
actuals:
  tokens: 9000
  tasks: 3
  commits: 4
---

# Phase quick-261102-dma Plan 01: Refresh isFrameless live when the frameless window setting changes Summary

`setSetting` now pushes the written `framelessWindow` boolean to `window.api.handleFramelessChanged` subscribers, and GlobalState writes it into `isFrameless`, so GameLib's own WindowControls disappear (or return) the moment "Use frameless window" is toggled, with no restart.

## What was built

- `tauriWindowChrome.ts`: listener set with `tauriHandleFramelessChanged` (subscribe, returns unsubscribe) and total `notifyFramelessChanged` (iterates a copy, per-listener try/catch, warns as `framelessChangeListener`).
- `settings.ts`: `notifyFramelessChanged(Boolean(value))` after `applyFramelessDecorations`, inside the existing default/`framelessWindow` guard.
- `misc.ts`: `handleFramelessChanged` renderer surface (subscribe side only; typed on `window.api` through the existing `Misc` spread).
- `GlobalState.tsx`: subscription registered in `componentDidMount` after the mount-time seed.
- Tests: F1-F7 in `framelessRuntime.test.ts` (red first), and `GlobalStateFramelessRefresh.test.ts` (GlobalState wiring gate, App.tsx gate evaluated on win32/linux/darwin across the flip, S1-S7 anti-vacuity self-tests).
- Todo re-triaged to `ready: live-gate`, cause and fix recorded, Windows live check marked NOT yet run. It stays in `pending/`.

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 (RED) | fa6e56ea6 | test(quick-261102-dma): pin the frameless change push from setSetting |
| 1 (GREEN) | 9b2df1603 | fix(quick-261102-dma): refresh isFrameless live when the frameless setting changes |
| 2 | e8d71269e | test(quick-261102-dma): pin isFrameless refresh through GlobalState into the WindowControls gate |
| 3 | 9205e177e | docs(quick-261102-dma): record the frameless refresh fix and re-triage to live-gate |

## Verification

- Preload `framelessRuntime.test.ts` + `windowChrome.test.ts`: 65/65 passed (F1-F7 observed red first: 8 failed, 30 passed before the production edit).
- Frontend `GlobalStateFramelessRefresh` + `GlobalStateSavedZoomWiring` + `GlobalStateFocusRowHydration`: 23/23 passed.
- `appShellLayout.test.ts -t "D-06 reversal"`: 5 passed (29 skipped by the filter).
- `tsc --noEmit` clean; ESLint 0 problems on touched preload sources and both test files; GlobalState.tsx stays at 16 warnings; `findDeadcode` exit 0; Prettier clean on all touched code paths; `git diff` on `App.tsx` empty.
- `todo-frontmatter-gate.py` passes; `runPlanningGates.py` shows only the baseline FAIL `state-sdk-field-anchor-gate.py`.
- Windows live check: NOT run (operator step, recorded on the todo).

## Deviations from Plan

- GlobalState.tsx: Prettier wrapped the new subscription across three lines (80 col), applied with `--write`; the plan's grep gate still matches.
- Committed on `main`, consistent with the repo's `branching_strategy: none` and the recent commit history; the generic protected-branch assertion was not applicable here.

Otherwise none: plan executed as written.

## Known Stubs

None.

## Self-Check: PASSED

- Created files exist: GlobalStateFramelessRefresh.test.ts, the todo, this SUMMARY.
- Commits fa6e56ea6, 9b2df1603, e8d71269e, 9205e177e present in `git log`.
