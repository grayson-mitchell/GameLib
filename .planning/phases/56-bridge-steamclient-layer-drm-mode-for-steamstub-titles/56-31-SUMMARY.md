---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 31
subsystem: steam-drm
tags: [drm, retention, gap-closure, CR-03]
requires: [56-27]
provides: [id-grouped DRM trace and wine-log retention]
affects: [src/backend/storeManagers/steam/games.ts]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
decisions:
  - Retention groups `<appId>-<id>.log` and `.wine.log` by id; per-file try so one unlink failure does not stop the rest
metrics:
  tasks: 1
  files: 2
completed: 2026-10-29
---

# Phase 56 Plan 31: DRM wine-log retention (CR-03) Summary

prepareDrmTraceFile now prunes by launch id across trace and wine logs, so wine logs from launches that died before writing a trace are bounded too.

## What changed
- Regex is now `^<appId>-([0-9]{1,16})(\.wine)?\.log$`; names are grouped by id (lstat isFile only), the newest `DRM_TRACE_KEEP_PER_APP - 1` ids are kept, every file of older ids is unlinked (each in its own try, warning on failure). `.stage.wine.log` cannot match.
- Builds on 56-27's games.ts edits; nothing reverted.

## Tests (all four named behaviors implemented)
Three new tests in games.test.ts: orphan wine logs (A), mixed trace/wine-only ids (B), other-app + stage log isolation plus a directory named `219990-5.wine.log` being spared (C and D combined in one test). Existing retention tests pass. RED commit b0208ed8a, GREEN commit 21b69f0b5.

## Verification
games.test.ts 458/458 pass; tsc clean; prettier clean; eslint 0 errors; grep acceptance count = 1.

## Deviations from Plan
None. (Tests C and D share one `it` block.)

## Self-Check: PASSED
