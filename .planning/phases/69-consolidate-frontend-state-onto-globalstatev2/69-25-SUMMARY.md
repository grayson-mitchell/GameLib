---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 25
subsystem: frontend-state
tags: [perf, rerender, D-14]
requires: [69-24]
provides: [final D-14 re-render numbers and baseline comparison]
key-files:
  created: [meta/rerender/results/final.json]
  modified: [.planning/phases/69-consolidate-frontend-state-onto-globalstatev2/69-RERENDER.md]
requirements-completed: [D-14]
completed: 2026-11-10
---

# Phase 69 Plan 25: Final re-render measurement Summary

Re-ran the D-14 jsdom harness on the migrated tree (commit 0af370d15); commit counts match the baseline on two steps and drop on two (dialogOpenClose 2/200 -> 0/0, libraryRefreshPush 3/266 -> 2/200).

## Runs

`PERF_ERA=final pnpm perf:rerender` twice, both exit 0, all Library and GameCard counts identical across runs (1/100, 3/200, 0/0, 2/200). The second run's final.json is kept. baseline.json untouched; no check.json/smoke.json present.

## Comparison (see 69-RERENDER.md)

| Step | Baseline Lib/Card | Final Lib/Card |
| --- | --- | --- |
| toggleAppearance | 1/100 | 1/100 |
| gameStatusPush | 3/200 | 3/200 |
| dialogOpenClose | 2/200 | 0/0 |
| libraryRefreshPush | 3/266 | 2/200 |

Seam caveat: the baseline went through the old GlobalState/ContextProvider seam; 69-24 re-pointed the harness at the store-based boot path. Documented in 69-RERENDER.md.

jsdom durations are higher on every rendering step (about 50-60 percent). Indicative only, with a concurrent session on the machine and a different mount seam; counts did not regress, so no todo was filed and no code was tuned.

## Deviations

None. No source changes (`src/` diff empty).

## Verification

`final.json` is not prettier-ignored (`--file-info` checked); it is a harness-written file kept as emitted. The .planning paths are prettier-ignored, so their check is omitted.

Commit: e9578f78f.

## Self-Check: PASSED
