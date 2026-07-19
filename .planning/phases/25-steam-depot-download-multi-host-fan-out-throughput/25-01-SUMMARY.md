---
phase: 25-steam-depot-download-multi-host-fan-out-throughput
plan: 01
subsystem: infra
tags: [steam, depot-download, host-selection, throughput, tdd]

# Dependency graph
requires:
  - phase: 21-steam-native-install
    provides: HostHealthTracker (cycle 3/5) + pickHost health/prior-aware selection, fetchChunk/depot.ts concurrency pools
provides:
  - "TOP_N_FANOUT exported constant (=3) in hostHealth.ts"
  - "pickHost(hosts, seed, attemptIndex, workerSlot?) contract — attempt-0 fans across top-N healthy hosts by workerSlot"
affects: [25-02, depot.ts consumers, fetchChunk]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Trailing optional param, defaulted so omission reproduces prior behavior byte-for-byte (this module's established additive-cycle convention)"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/depot/hostHealth.ts
    - src/backend/storeManagers/steam/__tests__/hostHealth.test.ts

key-decisions:
  - "TOP_N_FANOUT=3, matching PATTERNS.md's calibration guidance"
  - "Fan-out logic placed after the existing ordered=[...healthy,...unhealthy] construction, only branching when attemptIndex===0 && N>1 — every other path (retries, empty/near-empty healthy bucket) falls through unchanged"

patterns-established:
  - "workerSlot 4th param on pickHost: optional, defaults to 0, so every pre-Phase-25 3-arg call site is byte-for-byte unaffected"

requirements-completed: [MHOST-01, MHOST-03]

# Metrics
duration: ~12min
completed: 2026-07-19
---

# Phase 25 Plan 01: pickHost worker-slot fan-out Summary

**`HostHealthTracker.pickHost` gains an optional `workerSlot` param and a `TOP_N_FANOUT=3` constant so attempt-0 selection spreads concurrent chunk workers across the top-3 healthy CDN hosts instead of every worker converging on the single top-scored host.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-19T06:45:00Z (approx)
- **Completed:** 2026-07-19T06:57:27Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- New `TOP_N_FANOUT` exported tunable (value 3) with a rationale doc comment following this file's established constant convention
- `pickHost`'s signature extended with a defaulted `workerSlot = 0` 4th param; attempt-0 with N>1 healthy hosts now returns `healthy[workerSlot % N]`
- Full `hostHealth.test.ts` suite green (20/20), including 3 new Phase 25 tests and zero modification to any pre-existing test
- Wider steam test suite (24 suites, 723 tests) passes with no collateral regression; `tsc --noEmit` clean

## Task Commits

Each task was committed atomically (TDD RED/GREEN cycle):

1. **Task 1: Write failing fan-out + no-regression tests for pickHost's workerSlot dimension** - `25aa5404` (test)
2. **Task 2: Implement TOP_N_FANOUT + pickHost workerSlot top-N selection (attempt-0 only)** - `9923545e` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `src/backend/storeManagers/steam/depot/hostHealth.ts` - Added `TOP_N_FANOUT` constant; `pickHost` gained optional `workerSlot` param with an attempt-0 top-N fan-out branch
- `src/backend/storeManagers/steam/__tests__/hostHealth.test.ts` - Added `describe('worker-slot-aware fan-out (Phase 25)')` block: fan-out test, retry-unaffected test, omit-workerSlot no-regression guard

## Decisions Made
- `TOP_N_FANOUT = 3` per PATTERNS.md's calibration guidance — caps fan-out to genuinely-good hosts rather than spreading across the full healthy bucket
- No changes to `compositeScore`, `isUnhealthy`, `record`, `snapshot`, or any circuit-breaker constant — confirmed via grep and full test-suite pass
- This is the contract-defining plan only: `fetchChunk`/`depot.ts` consumer threading (MHOST-02) is explicitly deferred to Plan 25-02 per the plan's stated scope

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>`/`<behavior>` specs verbatim; no auto-fixes, no blocking issues, no architectural questions.

## TDD Gate Compliance

- RED gate: `test(25-01): add failing fan-out + no-regression tests for pickHost workerSlot` (`25aa5404`) — fan-out assertion failed as expected (workerSlot had no effect pre-implementation); 19 pre-existing tests + 2 new no-regression-shaped tests already passed (expected, since a 3-arg call site is unaffected by an as-yet-unused 4th arg)
- GREEN gate: `feat(25-01): fan attempt-0 host selection across top-N healthy hosts` (`9923545e`) — all 20 hostHealth tests pass
- No REFACTOR commit needed (implementation was minimal and matched the target shape from PATTERNS.md on first pass)

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `pickHost(hosts, seed, attemptIndex, workerSlot?)` contract is now locked and tested; Plan 25-02 can thread `workerSlot`/`chunkWorkerSlot` down through `fetchChunk` and both `depot.ts` concurrency pools (`downloadFileChunks`, `downloadDepotFiles`) per MHOST-02, using the exact `Array.from({ length: workerCount }, async (_, workerSlot) => {...})` idiom already documented in 25-PATTERNS.md
- No blockers. `TOP_N_FANOUT` and the `workerSlot` param are available for import (`from '../depot/hostHealth'`) by Plan 25-02's consumer changes
- MHOST-04 (hardware throughput measurement) remains gated on Plan 25-02 actually wiring workerSlot into the live download path — this plan alone changes no runtime call sites (`pickHost` is still called 3-arg everywhere), so no throughput change is observable yet

---
*Phase: 25-steam-depot-download-multi-host-fan-out-throughput*
*Completed: 2026-07-19*
