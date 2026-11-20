---
phase: 74-steam-game-updates
plan: 21
subsystem: planning
tags: [todos, gap-closure, steam, updates]
requires: []
provides:
  - Eight pending todos for the can-defer Phase 74 findings
affects: [REQUIREMENTS.md]
key-files:
  created:
    - .planning/todos/pending/2026-11-13-bridge-update-resume-keeps-verified-temps.md
    - .planning/todos/pending/2026-11-13-bridge-update-hero-planning-label.md
    - .planning/todos/pending/2026-11-13-auto-update-requeue-churn-and-double-detection.md
    - .planning/todos/pending/2026-11-13-steam-update-button-and-size-line-on-game-page.md
    - .planning/todos/pending/2026-11-13-update-estimate-job-key-collision-and-bound.md
    - .planning/todos/pending/2026-11-13-manifest-store-prune-has-no-caller.md
    - .planning/todos/pending/2026-11-13-orphan-delta-journal-after-cancel.md
    - .planning/todos/pending/2026-11-13-update-prompt-wording-for-part-downloaded-updates.md
  modified:
    - .planning/REQUIREMENTS.md
decisions:
  - STEAM-02 stays Pending until live UAT 74-22 passes
metrics:
  tasks: 2
  completed: 2026-11-13
---

# Phase 74 Plan 21: Deferred findings as todos Summary

Eight deferred Phase 74 findings (WR-03, WR-07, WR-08 remainder, UAT 1, WR-10, IN-01, IN-02, UAT 6c) are now tracked as pending todos with severity/platform/ready frontmatter; `pnpm planning-gates` passes 12/12.

## Commits

- 50a254e78: docs(74-21): track deferred Phase 74 findings as todos

## Deviations from Plan

**1. [Rule 1 - Drift] STEAM-02 had drifted to complete**
- Found during: Task 2
- Issue: REQUIREMENTS.md line 40 read `[x]` and the traceability row read `Complete`, contrary to the plan's expectation.
- Fix: set back to `[ ]` / `Pending`, nothing else touched (included in 50a254e78).

The duplicate-check grep found only the existing Windows hand-off todo (UAT 15), which does not cover any finding, so no substitution was made.

## Known Stubs

None.

## Self-Check: PASSED
