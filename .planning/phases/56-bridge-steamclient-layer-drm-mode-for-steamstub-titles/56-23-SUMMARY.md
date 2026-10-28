---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 23
subsystem: drm-mode
tags: [gap-closure, superseded, gap-9]
requires: [56-22]
provides:
  - "Gap 9 closed by 5ff2dbd8c (F9-a), which landed before this plan executed"
affects: [56-25, 56-26]
key-files:
  created: []
  modified: []
decisions:
  - "Operator ruling 2026-10-29: close 56-23 as superseded; F9-b..F9-d are not implemented here"
metrics:
  duration: "0m"
  completed: 2026-10-29
requirements: []
---

# Phase 56 Plan 23: Gap 9 fix (second-launch bottle-stage hang) Summary

Superseded. F9-a, the measured defect, is already fixed by `5ff2dbd8c` (fix(drm): treat trailing-backslash
SteamPath as staged so later launches skip reg add). `stageDrmBottle.ts` now uses `sameSteamPath` for
both `[Software\\Valve\\Steam]` and `ActiveProcess` keys, with a test in `stageDrmBottle.test.ts`.
Record: `.planning/debug/resolved/drm-second-launch-bottle-stage.md`. The Gap 9 todo is in
`.planning/todos/completed/`.

F9-b, F9-c and F9-d (including the bounded winedevice-kill escalation) needed a 56-22 verdict to set their
shape, and 56-22 was not run. They are not implemented. The residual winebus abort-spin risk they covered is
tracked in `.planning/todos/pending/2026-10-29-drm-stage-session-can-hit-winebus-gamecontroller-abort-spin.md`.

## Deviations from Plan

**1. [Operator ruling] Whole plan superseded.** No tasks executed, no code changed.

## Self-Check: PASSED
Verified that `5ff2dbd8c` exists and touches `stageDrmBottle.ts` and its test.
