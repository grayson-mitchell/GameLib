---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 41
subsystem: steam-engine
tags: [G25, offline-refusal, crossover-missing]
requires: []
provides:
  - offlineLaunchCertainlyBlocked(input) and OfflineRefusalInput in engine/offlineRefusal.ts
  - isCrossoverMissing(deps?) in engine/engineDecision.ts
affects: [59-42]
key-files:
  created:
    - src/backend/storeManagers/steam/engine/offlineRefusal.ts
    - src/backend/storeManagers/steam/engine/__tests__/offlineRefusal.test.ts
  modified:
    - src/backend/storeManagers/steam/engine/engineDecision.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineDecision.test.ts
key-decisions:
  - Refusal predicate only refuses; never selects an engine or routes to bottled Steam
  - CrossOver override with CrossOver missing is left to the existing fast 'unavailable' path
  - A resolver error in isCrossoverMissing reports not-missing (unknown never refuses)
metrics:
  tasks: 2
  files: 4
  completed: 2026-11-03
---

# Phase 59 Plan 41: Offline refusal predicate Summary

A pure `offlineLaunchCertainlyBlocked` predicate and a probe-free `isCrossoverMissing` check, so an offline launch with CrossOver missing and the current pin absent is refused regardless of the marker's DXVK copy (G25c), while a present CrossOver with the DXVK copy still launches.

## What was built

- `isCrossoverMissing(deps?)` mirrors the two 'missing' branches of `preflightCrossover` (no bin dir, no `bin/wine`) without running the probe or `readBuild`. `preflightCrossover` is untouched.
- `offlineLaunchCertainlyBlocked(input)` returns `{ blocked: false }` or `{ blocked: true, arm: 'crossover-missing' | 'restore-needs-pin' }`. It has no imports and no I/O.
- Tests: 4 `G25: ` cases for `isCrossoverMissing`, plus a truth table and the named UAT 34 run 1 (blocked) and run 2 (not blocked) cases for the predicate.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

Engine jest directory: 11 suites, 228 tests pass. `pnpm codecheck`, eslint and prettier are clean on the four paths.

## Commits

- e14160005: feat(59-41): isCrossoverMissing presence check
- 17c3ca295: feat(59-41): pure offline-refusal predicate

## Self-Check: PASSED
