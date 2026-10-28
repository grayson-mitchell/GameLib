---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 25
subsystem: drm-mode
tags: [live-gate, contract, preflight]
requires: [56-21, 56-24]
provides:
  - "56-25-LIVE-GATE.md: approved re-run gate contract with Structural Reachability Review, 16 pending items, and a recorded author-side preflight"
affects: [56-26]
key-files:
  created:
    - .planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-25-LIVE-GATE.md
  modified: []
decisions:
  - "Operator approved the contract as written (2026-10-29), including three launches each for Grim Dawn (1-3) and Raft (4-6), Ranch at 7, HKLM diagnostic at 8, launch 0 = uninstall and reinstall"
  - "A repeat-launch timeout on an unstaged bottle counts as the residual winebus risk, not a G9 failure"
  - "publish: not needed (56-22..24 superseded, no component rebuilt)"
metrics:
  duration: "multi-session"
  completed: 2026-10-29
requirements: []
---

# Phase 56 Plan 25: Re-run live-gate contract Summary

Authored and operator-approved the Phase 56 re-run live-gate contract (Grim Dawn 219990 in DRM mode, with Raft and Ranch as non-blocking comparisons) and ran the author-side preflight PC1-PC5 and PC8-PC10; no game was launched and every `result:` line is still `pending`.

## Tasks

| Task | Name | Commit |
| --- | --- | --- |
| 1 | Author 56-25-LIVE-GATE.md with the Structural Reachability Review | ea6a7db70 |
| 2 | Operator approval (checkpoint, "Approved" 2026-10-29) | none |
| 3 | Publish: not needed, recorded in Run record | contract edit, see docs commit |
| 4 | Author-side preflight recorded under `### Preflight` | contract edit, see docs commit |

## Preflight outcome

PC1, PC2, PC3, PC9, PC10 passed as written. PC4: all three builds exit 0 and sidecar.js is now newer than the newest `src/backend` commit (was stale at authoring). PC5: prior logs archived. PC8: a prior COMPDIR (mtime 2026-10-28T22:35:45) existed and was moved to the session dir's `compdir-prior/`, so item 1 can re-prove the fetch. Session dir: `/tmp/gamelib-gate-20261028T192950Z/`. PC6, PC7, PC11 are left to 56-26.

## For 56-26

A `gamelib-shell` dev instance was already running during preflight, started before the PC4 rebuild, so its sidecar is stale. The operator must restart `pnpm tauri:dev` under `tee -a <session>/terminal.log` (PC6) before any launch.

## Deviations from Plan

- Section 2 uses three launches each for Grim Dawn and Raft (plan text implied launches 0-6 with fewer repeats); approved by the operator.
- Task 3 resolved as "not needed" without a checkpoint: 56-24 is superseded, so there is no new asset to publish.

## Known Stubs

None.

## Self-Check: PASSED

Contract file, `### Preflight` table, 16 `result: pending` lines, and commit ea6a7db70 verified.
