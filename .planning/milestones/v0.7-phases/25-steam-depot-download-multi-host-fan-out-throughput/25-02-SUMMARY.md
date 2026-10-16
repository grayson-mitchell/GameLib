---
phase: 25-steam-depot-download-multi-host-fan-out-throughput
plan: 02
subsystem: infra
tags: [steam, depot-download, host-selection, throughput, concurrency, tdd]

# Dependency graph
requires:
  - phase: 25-steam-depot-download-multi-host-fan-out-throughput
    provides: "Plan 25-01's pickHost(hosts, seed, attemptIndex, workerSlot?) contract + TOP_N_FANOUT=3 (hostHealth.ts)"
provides:
  - "fetchChunk(..., workerSlot = 0) — decompress.ts forwards workerSlot into pickHost's 4th arg"
  - "downloadFileChunks' CHUNK_CONCURRENCY pool captures its Array.from index (chunkWorkerSlot) and combines it with a threaded fileWorkerSlot into fetchChunk"
  - "downloadDepotFiles' FILE_CONCURRENCY pool captures its Array.from index (fileWorkerSlot) and threads it through downloadSingleFile -> downloadFileChunks"
  - "Integration test proving concurrent chunk workers spread attempt-0 requests across >1 healthy host"
affects: [25-03, depot.ts hardware throughput measurement (MHOST-04)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Trailing defaulted param (workerSlot/fileWorkerSlot: number = 0, never a bare `?:`) so combination arithmetic stays a plain `number` under strict mode with no `?? 0` coalesce"
    - "Array.from({ length: workerCount }, async (_, slot) => ...) — capture the native pool index directly instead of a separately-tracked counter"
    - "Combined worker identity across two nested pools: fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot gives every concurrently-running worker in the whole run a distinct small integer"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/depot/decompress.ts
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts

key-decisions:
  - "Combined slot formula fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot per RESEARCH.md Assumptions Log A2 — gives every worker in the run a distinct integer without a shared mutable counter"
  - "New integration test drives fetchChunk directly with distinct workerSlot values (0,1,2) rather than through the full downloadFileChunks pool, since pickHost's synchronous pre-await call is what matters for the fan-out assertion — matches the plan's explicitly offered alternative"

requirements-completed: [MHOST-02, MHOST-03]

# Metrics
duration: ~20min
completed: 2026-07-19
---

# Phase 25 Plan 02: Thread worker-slot from depot.ts's concurrency pools into pickHost Summary

**`fetchChunk` forwards an optional `workerSlot` into `pickHost`'s 4th argument, and both of `depot.ts`'s nested concurrency pools (`CHUNK_CONCURRENCY=4` inside `FILE_CONCURRENCY=8`) capture their own `Array.from` index and thread a combined `fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot` slot down through it — turning Plan 25-01's inert fan-out contract into a live one, with a new integration test proving concurrent workers actually hit >1 host at attempt 0.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3 (TDD-tagged; wiring verified against the existing regression suite, new behavior proven by a dedicated integration test)
- **Files modified:** 4

## Accomplishments
- `fetchChunk` (decompress.ts) gained a defaulted trailing `workerSlot: number = 0` param, forwarded verbatim into `hostHealth.pickHost(hosts, seed, i, workerSlot)`
- `downloadFileChunks`'s chunk-level pool now captures `(_, chunkWorkerSlot)` from `Array.from` and passes `fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot` as `fetchChunk`'s new `workerSlot` arg
- `downloadFileChunks` and `downloadSingleFile` both gained a defaulted trailing `fileWorkerSlot: number = 0` param so the file pool's identity threads all the way down
- `downloadDepotFiles`'s file-level pool now captures `(_, fileWorkerSlot)` and forwards it into `downloadSingleFile`
- New `depotPrimitives.test.ts` integration test: three concurrent `fetchChunk` calls with distinct `workerSlot` values (0,1,2) against a fresh, cold-start-healthy `HostHealthTracker` assert `new Set(attempt0Hosts).size > 1`
- All existing regression guards (SHA1-rotation, cancel/abort D-UAT-05/06, cycle-3 host-health tests, CDN-auth tests) pass unmodified; full Steam suite (24 suites, 724 tests) green; `tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: fetchChunk gains an optional workerSlot, forwarded to pickHost** - `1f55e8ef` (feat)
2. **Task 2: Capture and thread worker-slot through both depot.ts concurrency pools** - `71c382e7` (feat)
3. **Task 3: Integration test — concurrent chunk workers fan attempt-0 across >1 host** - `1456adb4` (test)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `src/backend/storeManagers/steam/depot/decompress.ts` - `fetchChunk` gained a defaulted trailing `workerSlot: number = 0` param, forwarded into `pickHost`'s 4th arg
- `src/backend/storeManagers/steam/depot.ts` - `downloadFileChunks`'s chunk pool captures `chunkWorkerSlot` and combines it with a new `fileWorkerSlot` param into `fetchChunk`; `downloadSingleFile` forwards `fileWorkerSlot`; `downloadDepotFiles`'s file pool captures `fileWorkerSlot` and forwards it into `downloadSingleFile`
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` - Fixed three pre-existing negative-offset positional assertions (`cdnAuth`, `hostMeta`, `signal`) that shifted because `fetchChunk` gained a new trailing param
- `src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts` - New integration test proving concurrent chunk workers fan attempt-0 across >1 healthy host

## Decisions Made
- Combined-slot formula `fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot` per RESEARCH.md Assumptions Log A2 — every concurrently-running worker across the whole download run (both pool dimensions) maps to a distinct small integer with no shared mutable counter
- All new params are defaulted `number = 0` (never a bare `?:`), matching the module's established additive-optional-param convention, so the combination arithmetic type-checks under strict mode with no `?? 0` coalescing
- The Task 3 integration test drives `fetchChunk` directly with distinct `workerSlot` values rather than through the full `downloadFileChunks` pool — `pickHost`'s selection happens synchronously before `fetchChunk`'s first `await`, so three concurrent direct calls exercise the exact race condition the pool wiring produces without needing to fabricate a multi-chunk file fixture; this was the plan's explicitly offered alternative

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed three pre-existing negative-offset positional test assertions broken by Task 1's new trailing param**
- **Found during:** Task 2 verification (`npm test -- --testPathPattern="steam.*depot"`)
- **Issue:** `depot.test.ts` (not itself a plan target for Task 1, but exercising `fetchChunk`'s call signature) had three assertions indexing `fetchChunk`'s mocked call args from the END of the array (`callArgs.length - 3` for `cdnAuth`, `callArgs.length - 2` for `hostMeta`, `callArgs.length - 1` for `signal`). Task 1's new trailing `workerSlot` param shifted every one of these by one position, breaking them.
- **Fix:** Updated the three offsets (`length - 4`, `length - 3`, `length - 2` respectively) and their doc comments to reflect the new 14-arg call shape.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/depot.test.ts`
- **Verification:** `npm test -- --testPathPattern="steam.*depot"` — 165/165 pass; full Steam suite (724 tests) green.
- **Committed in:** `71c382e7` (part of Task 2's commit)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Necessary correctness fix directly caused by the plan's own required signature change; no scope creep — no other files touched, no behavior beyond the plan's stated scope.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `fetchChunk`/`downloadFileChunks`/`downloadSingleFile`/`downloadDepotFiles` now thread a live, distinct `workerSlot` per concurrently-running worker into `pickHost`'s top-N fan-out — the mechanism Plan 25-01 built is no longer inert.
- MHOST-04 (hardware throughput measurement, `grep "chunk-stream stats" ~/Library/Logs/gamelib/gamelib.log`, expect sustained `hosts>1`) is now unblocked and ready for Plan 25-03's before/after hardware run.
- No blockers. Cancel/abort, stall-retry, SHA1 integrity, and both concurrency constants (`CHUNK_CONCURRENCY=4`, `FILE_CONCURRENCY=8`) are unchanged and regression-tested.

---
*Phase: 25-steam-depot-download-multi-host-fan-out-throughput*
*Completed: 2026-07-19*

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/depot/decompress.ts
- FOUND: src/backend/storeManagers/steam/depot.ts
- FOUND: src/backend/storeManagers/steam/__tests__/depot.test.ts
- FOUND: src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts
- FOUND: commit 1f55e8ef (feat)
- FOUND: commit 71c382e7 (feat)
- FOUND: commit 1456adb4 (test)
