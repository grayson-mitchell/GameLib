---
phase: quick-261121-kqt
plan: 01
subsystem: tooling
tags: [typescript, tsc, incremental, codecheck]
requires: []
provides:
  - "pnpm codecheck type-checks both projects incrementally, one tsbuildinfo per project"
affects: [package.json]
tech-stack:
  added: []
  patterns: ["tsc --incremental with per-project --tsBuildInfoFile under node_modules/.cache"]
key-files:
  modified: [package.json]
decisions:
  - "Flags go on the command line after --noEmit, not in tsconfig, so the two projects keep separate buildinfo files and tsconfigMeta.test.ts regexes still match"
metrics:
  duration: ~6min
  completed: 2026-11-21
status: complete
commits: 1
plan_head_before: 4c5ff056e
plan_head_after: 893bf22da
actuals:
  tokens: 300
  tasks: 1
  commits: 1
---

# Phase quick-261121-kqt Plan 01: Incremental tsc in codecheck Summary

`pnpm codecheck` now runs both tsc invocations with `--incremental --tsBuildInfoFile node_modules/.cache/tsc-{main,meta}.tsbuildinfo`; a warm run is about 6x faster and still catches type errors in both projects.

## Measured timings

- Baseline before the edit (no incremental): 47s wall
- Gate 4 cold (buildinfo files deleted): 17s
- Gate 4 warm (no source change): 3s

## Non-masking probes

- src project: `edit-run=2 repeat-run=1 probe-errors=2 after-revert=0`
- meta project: `edit-run=2 repeat-run=1 probe-errors=2 after-revert=0`

## Verify gates

All 10 gates passed: exact script string, tsconfigMeta.test.ts 7/7 unedited, prettier check (file not ignored), cold/warm, missing cache dir created by tsc, both probes, grep counts 1/1, probes removed and tsconfigs untouched.

## Deviations from Plan

None - plan executed exactly as written. Commit made on main because `git.allow_default_branch_commits` is true in .planning/config.json.

## Commit

- 893bf22da: chore(quick-261121-kqt): enable incremental tsc in codecheck (package.json only)

## Self-Check: PASSED
