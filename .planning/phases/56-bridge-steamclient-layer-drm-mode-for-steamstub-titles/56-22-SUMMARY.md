---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 22
subsystem: drm-mode
tags: [gap-closure, live-diagnosis, superseded, gap-7, gap-9]
requires: [56-17, 56-20, 56-21]
provides:
  - "Gap 7 and Gap 9 verdicts taken from the 2026-10-29 debug sessions instead of a new live session"
affects: [56-23, 56-24, 56-25, 56-26]
key-files:
  created: []
  modified: []
decisions:
  - "Operator ruling 2026-10-29: close 56-22 as superseded; no live diagnosis session is run"
metrics:
  duration: "0m"
  completed: 2026-10-29
requirements: []
---

# Phase 56 Plan 22: Live diagnosis (Gaps 7 and 9) Summary

Superseded. The operator ruled on 2026-10-29 that this plan closes without a live session, because the
two debug sessions it was meant to inform had already found and fixed both gaps.

## Verdicts (from the debug records, not from a new run)

- **Gap 7 (Grim Dawn 219990 crash before menu):** the game ran with its working directory set to
  `Grim Dawn\x64\` and could not find `database.arz`. The `ISteamController` calls in the trace came just
  before the crash but were not its cause. Fixed by `98837f09b` (launch from the install root, not the
  exe's folder). Record: `.planning/debug/resolved/grim-dawn-drm-actionset-crash.md`.
- **Gap 9 (second DRM launch hangs at `drm-bottle-stage`):** the helper writes `SteamPath` with a
  trailing backslash, so the strict staged check failed and forced a `reg add` on every later launch.
  Fixed by `5ff2dbd8c` (`sameSteamPath` in `stageDrmBottle.ts`). Record:
  `.planning/debug/resolved/drm-second-launch-bottle-stage.md`.
- **Still open:** a fresh wine session's `winedevice` (winebus) can abort and spin during
  `wineboot --init`, which makes `reg add` time out. Tracked in
  `.planning/todos/pending/2026-10-29-drm-stage-session-can-hit-winebus-gamecontroller-abort-spin.md`.
  56-20's per-launch wine log and timeout process listing are there to catch it if it recurs.

`56-22-LIVE-DIAGNOSIS.md` was not written. The 56-17 experiments (E7-1..E7-4, E9-1..E9-5) were not run.
Live confirmation that both gaps stay fixed belongs to the 56-25 contract and the 56-26 run.

## Deviations from Plan

**1. [Operator ruling] Whole plan superseded.** No tasks executed, no commits besides this summary.

## Self-Check: PASSED
Verified that `98837f09b` and `5ff2dbd8c` exist and that `stageDrmBottle.ts` uses `sameSteamPath` for both SteamPath keys.
