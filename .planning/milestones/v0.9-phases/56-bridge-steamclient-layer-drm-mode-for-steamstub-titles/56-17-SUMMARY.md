---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 17
subsystem: steam-bridge
tags: [diagnosis, drm, grim-dawn, gap-closure, desk-only]
requires: []
provides:
  - "56-17-DIAGNOSIS.md: desk diagnosis for Gap 7 and Gap 9 with E7-n / E9-n experiments and F9-a..d fix candidates"
affects: [56-22, 56-23, 56-24]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-17-DIAGNOSIS.md
  modified: []
key-decisions:
  - "Hypothesis statuses take the 2026-10-29 live-confirmed debug records into account: Gap 7 root cause is the x64 working directory (98837f09b), Gap 9 trigger is the strict SteamPath staged check (5ff2dbd8c)"
  - "56-22 experiments are confirmation and regression checks, not blind discrimination; the winebus abort-spin remains an open residual risk"
requirements-completed: [D-11, D-17, D-21]
duration: 25min
completed: 2026-10-29
---

# Phase 56 Plan 17: Desk diagnosis for Gaps 7 and 9 Summary

Read-only diagnosis in `56-17-DIAGNOSIS.md`: Gap 7 ranked hypotheses with the working-directory cause supported and controller, overlay and exe causes excluded; Gap 9 with the staged-check mismatch located and the winebus abort-spin recorded as residual.

## What was done

- **Gap 7.** The 56-16 crash files and the minidump are gone (`/tmp` session dir absent), so the lldb pass could not be re-run. Register, module and stack facts are carried from the planner's reading and marked unverified. Trace semantics were confirmed in `steamclient_main.c` (success-only, first-occurrence by name hash, no return values), so "last traced call" is not a timeline. The 044 delta table gained two rows the plan had not listed: working directory, and that 044 never proved Steam init.
- **Gap 9.** Re-measured today: both bottles' `user.reg` carry the trailing-backslash `SteamPath` in both keys; writer is `helper/steam.c:152` (builds `steam_dir`) and lines 88-89 (writes both keys); `.update-timestamp` and both `wine.inf` mtimes are all 1784047440, so the timestamp hypothesis is excluded. Every session-end path is listed with file:line and env (`WINEPREFIX` + `CX_ROOT`, never `CX_BOTTLE`); none runs after a natural game exit, and `onStopped` does not end the session.
- Experiments E7-1..4 and E9-1..5, fix candidates for Gap 7 and F9-a..d for Gap 9.

## Deviations from Plan

### Context discovered at execution time

**1. [Rule 3 - Blocking] Evidence source gone**
- **Found during:** Task 1
- **Issue:** The gate session dir and minidump no longer exist, so the plan's lldb steps could not run.
- **Fix:** Recorded the loss, carried the planner's measured facts, marked them unverified; arithmetic on offsets redone.

**2. Debug sessions already resolved both gaps (informational)**
- **Found during:** Tasks 1 and 2
- **Issue:** Commits `98837f09b` (Grim Dawn cwd root cause) and `5ff2dbd8c` (trailing-backslash staged check) landed on 2026-10-29, after this plan was written. The plan's premise of open hypotheses was out of date.
- **Fix:** The diagnosis states the later live evidence and its source for each status; experiments were reframed as confirmation and regression. No product code touched, per the plan.

Otherwise the plan executed as written. Both tasks write one file, so they share one commit.

## Known Stubs

None.

## Threat Flags

None. Only the four DRM registry values and renderer/input/Steam lines are quoted. The acceptance greps for account, persona, SteamID and unrelated registry value names print nothing.

## Task commits

| Task | Commit |
| --- | --- |
| 1 and 2 (single file) | 85bcc7cc1 |

## Issues Encountered

None beyond the deviations above. Prettier check omitted: `.planning/**` is prettier-ignored.
