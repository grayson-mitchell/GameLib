---
phase: 61-unified-macos-engine-for-all-stores
plan: 22
subsystem: engine
tags: [demo-status, crossover, engine-decision, inconclusive-preflight]
requires: []
provides:
  - "demoStatus probes any sanitizeBottleName-valid bottle name up to 255 chars"
  - "invalid-bottle probe result is an inconclusive pre-flight; inconclusive never falls back"
affects: []
key-files:
  modified:
    - src/backend/engine/demoStatus.ts
    - src/backend/engine/__tests__/demoStatus.test.ts
    - src/backend/engine/engineDecision.ts
    - src/backend/engine/__tests__/engineDecision.test.ts
decisions:
  - "Bottle-name validation reuses sanitizeBottleName (+255 cap); CX_BOTTLE is env, not argv"
  - "Inconclusive pre-flight with a located CrossOver launches on CrossOver under Automatic and forced override"
metrics:
  tasks: 2
  completed: 2026-11-07
requirements-completed: [D-05]
---

# Phase 61 Plan 22: CR-01 bottle-name probe fix Summary

A healthy CrossOver bottle such as "Windows 10 Games" is now really probed, and any inconclusive pre-flight (bad name, busy-bottle timeout) launches on CrossOver instead of triggering the cx-broken fallback.

## Tasks

1. `e2c911384` - `BOTTLE_RE` removed; validation is `sanitizeBottleName(name) !== name || length > 255`. Tests: rejected `a/b`, empty, `..`, `x\y`, ` padded `, 256 chars (no spawn); accepted `Windows 10 Games`, `My Bottle (2)`, 119-char spaced name, with CX_BOTTLE verified via the stub record. No import cycle (`pnpm boundaries` clean).
2. `003368729` - `preflightCrossover` maps `invalid-bottle` to `{broken, inconclusive: true}` (single probe, no kill). `decideLaunchEngine` launches on CrossOver for inconclusive+located binDir (reason `cx-healthy` under Automatic, `override` when forced) and logs "launching on CrossOver". Table row for invalid-bottle removed; 6 new tests.

## RED evidence

- Task 1: before the fix, the new accepted-name tests failed (4 failures in demoStatus.test.ts); passing after.
- Task 2: before the fix, 4 new tests failed (invalid-bottle inconclusive, Automatic + invalid-bottle, forced CrossOver + invalid-bottle, Automatic + busy-bottle timeout); the nonzero-exit-twice and cx-missing regression guards passed both before and after. All pass after.

## Steam engine-filtered suite (games.test.ts -t engine)

Before: 108 passed, 604 skipped, 0 failures. After: identical (108 passed, 0 failures). No new failures.

## Verification

demoStatus, fakeHomeIsolation, engineDecision, engineState, launchEngine suites pass; `pnpm boundaries` and `pnpm codecheck` exit 0; prettier clean. `pnpm lint` reports 0 errors, 1115 warnings (pre-existing; script exits 1 on warnings, not caused by this plan).

## Deviations from Plan

None - plan executed as written. 61-21's no-kill deadline untouched.

## Self-Check: PASSED

Commits e2c911384 and 003368729 exist; modified files present.
