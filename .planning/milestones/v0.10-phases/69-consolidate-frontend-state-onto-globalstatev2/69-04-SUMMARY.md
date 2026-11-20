---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 04
subsystem: testing
tags: [perf, rerender, baseline]
requires: ["69-03"]
provides:
  - "D-14 baseline numbers on the unmigrated tree"
affects: [69-25]
key-files:
  created:
    - meta/rerender/results/baseline.json
    - .planning/phases/69-consolidate-frontend-state-onto-globalstatev2/69-RERENDER.md
key-decisions: []
duration: ~5min
completed: 2026-11-10
---

# Phase 69 Plan 04: D-14 baseline Summary

Captured the re-render baseline (`PERF_ERA=baseline pnpm perf:rerender`) at `097106497` and recorded it in 69-RERENDER.md.

Two consecutive runs agreed on every commit count (Library/GameCard): toggleAppearance 1/100, gameStatusPush 3/200, dialogOpenClose 2/200, libraryRefreshPush 3/266. The second run's baseline.json was kept.

Tree was confirmed unmigrated (GlobalState.tsx unchanged, no domain state files). No src/ change.

Prettier: `--file-info` shows baseline.json is not ignored and `--check` passes. 69-RERENDER.md is under `.planning/` (prettier-ignored), so no check was run on it.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
