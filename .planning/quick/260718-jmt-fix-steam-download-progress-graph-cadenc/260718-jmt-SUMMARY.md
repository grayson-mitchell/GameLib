---
phase: quick
plan: 260718-jmt
subsystem: infra
tags: [steam, depot-download, progress, setInterval, jest]

requires:
  - phase: 21-steam-native-install
    provides: downloadDepotFiles (in-process depot download engine, emitProgress/rollingRateMiBs)
provides:
  - PROGRESS_HEARTBEAT_MS (1000ms) wall-clock heartbeat inside downloadDepotFiles
  - Guaranteed progressUpdate cadence independent of chunk-completion timing
affects: [21-steam-native-install, 23-steam-full-ownership-install-stateflags-4]

tech-stack:
  added: []
  patterns:
    - "setInterval-driven forced-emit heartbeat wrapped in try/finally around a worker Promise.all, so cleanup fires on both normal settle and throw/abort without touching the outer function's own finally"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts

key-decisions:
  - "Heartbeat test captures the real setInterval callback via jest.spyOn(global, 'setInterval') and invokes it directly instead of using jest.useFakeTimers() — avoids entangling fake global timers with DecompressPool's real worker_threads and their own real dispatch-timeout setTimeout, which risked a flaky/hanging test"

patterns-established:
  - "Wall-clock progress heartbeat: setInterval(() => emitProgress(true), PROGRESS_HEARTBEAT_MS) started just before a worker Promise.all, cleared in a try/finally scoped to only that Promise.all"

requirements-completed: [QUICK-STEAM-PROGRESS-CADENCE]

duration: 25min
completed: 2026-07-18
---

# Quick Task 260718-jmt Summary

**Steam native-install download progress now emits a forced `progressUpdate` at least once per second via a `PROGRESS_HEARTBEAT_MS` (1000ms) `setInterval`, independent of chunk-completion timing, fixing the DownloadManager ProgressHeader graph freezing for tens of seconds during warm-up/large-file stalls.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-18T00:00:00Z (approx, quick task)
- **Completed:** 2026-07-18
- **Tasks:** 1 (TDD: test + implementation, single commit)
- **Files modified:** 2

## Accomplishments
- Added `PROGRESS_HEARTBEAT_MS = 1000` named constant next to `PROGRESS_THROTTLE_MS` in `depot.ts`
- `downloadDepotFiles` now starts a `setInterval(() => emitProgress(true), PROGRESS_HEARTBEAT_MS)` immediately before the worker `Promise.all`, wrapped in a `try { ... } finally { clearInterval(heartbeat) }` scoped to only that `Promise.all` — the interval is cleared on both normal completion and throw/abort
- The pre-existing forced `emitProgress(true)` flush right after the `Promise.all`, and the outer `finally { await pool.shutdown() }`, are both untouched
- Added a deterministic unit test that captures the real `setInterval` callback and invokes it directly (no `jest.useFakeTimers()`), proving: (1) the interval is registered with exactly `1000`ms, (2) invoking it with zero chunk activity forces 3 honest `progressUpdate` emits each reporting `downSpeed: 0`, and (3) `clearInterval` fires with the matching handle once the download settles

## Task Commits

Single TDD task, one atomic commit (test + implementation together per the plan's action spec):

1. **Task 1: Add a 1s wall-clock progress heartbeat to downloadDepotFiles** - `d231dc17` (fix)

_No separate plan-metadata commit was made — per the executor's constraints, docs artifacts (SUMMARY.md, STATE.md) are committed separately by the orchestrator._

## Files Created/Modified
- `src/backend/storeManagers/steam/depot.ts` - added `PROGRESS_HEARTBEAT_MS` constant + `setInterval`/`clearInterval` heartbeat wrapping the worker `Promise.all` inside `downloadDepotFiles`
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` - added a `describe('progress heartbeat: ...')` block with one test proving the heartbeat cadence and cleanup contract

## Decisions Made

- **Fake-timer simulation avoided (deviation from the plan's literal "advance timers ~3000ms" instruction, functionally equivalent coverage achieved a different way):** The plan's `<action>` suggested `jest.useFakeTimers()` + `jest.advanceTimersByTimeAsync(3000)` + `jest.getTimerCount() === 0`. `downloadDepotFiles` uses a REAL `DecompressPool` (real `worker_threads`, not mocked in this test file) which itself has an internal real `setTimeout`-based dispatch timeout (`decompressPool.ts`, 30s default). Globally faking timers while a real cross-thread message round-trip is in flight risked a flaky or hanging test (the fake clock and the real worker's message-passing timing are not obviously compatible, and jest's `advanceTimersByTimeAsync` gives no guarantee it drains pending real I/O/worker-thread callbacks before returning). The plan itself anticipated this risk and explicitly permitted a fallback: *"If wiring a full stalled-download proves infeasible with the existing mocks, assert the smallest testable seam (e.g. spy that setInterval is registered with PROGRESS_HEARTBEAT_MS and cleared on settle) and add a one-line manual-verify note."* I used that fallback, but strengthened it beyond a pure existence-check: the test captures the actual registered callback and invokes it directly (deterministic, 12ms actual runtime) to prove it truly forces `emitProgress(true)` semantics (bypasses throttle, computes rolling rate honestly as 0 when no bytes moved) — this is a closer behavioral proxy for "3 seconds pass with no chunk activity" than a real 3-second real-time wait or a fragile fake-timer/worker-thread interaction would have been. A one-line manual-verify note is included as a code comment above the test (start a real native Steam depot install and watch the ProgressHeader graph during warm-up).
- No other deviations — implementation matches the plan's `<action>` steps exactly (constant placement, setInterval/try-finally placement, untouched outer finally, untouched rolling-rate/throttle/onBytes code).

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing critical functionality, or blocking issues were found in this task beyond the test-strategy adjustment documented above under "Decisions Made" (that adjustment is a test-implementation-strategy choice explicitly pre-authorized by the plan's own fallback clause, not a Rule 1/2/3 auto-fix).

---

**Total deviations:** 0 auto-fixed. 1 pre-authorized test-strategy substitution (fake timers -> direct-callback-invocation), within the plan's own escape hatch.
**Impact on plan:** None on scope or correctness. Test still directly exercises the production `setInterval`/`clearInterval` wiring and the forced-emit/zero-byte-honesty behavior the plan's `<behavior>` block specifies.

## Issues Encountered

- A pre-existing, unrelated leaked-timer warning ("A worker process has failed to exit gracefully... Timeout._onTimeout at library.ts:1080") appears when running the full `src/backend/storeManagers/steam` test directory together, originating from `library.ts`'s `pollInstallOnce`/`readAcfState` (a different test file's teardown, not `depot.test.ts`). Confirmed unrelated to this task by running `depot.test.ts` in isolation, where the warning does not appear, and by never touching `library.ts` in this task. Out of scope per the scope-boundary rule (pre-existing warning in an unrelated file) — not fixed, not logged to `deferred-items.md` since it does not affect any test's pass/fail outcome (all 563/563 tests still pass) and is far outside this quick task's file scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend fix is self-contained to `depot.ts`; no frontend changes were needed (`ProgressHeader` already advances one chart sample per `progressUpdate` — it now simply receives more of them during stalls).
- Manual/hardware verification remains open (as it was before this task): during a real native Steam depot install, confirm the DownloadManager ProgressHeader graph advances smoothly (~1s samples) through warm-up/large-file stalls instead of freezing for tens of seconds. This folds into the existing Phase 21 `21-UAT.md` real-hardware verification already pending in STATE.md — no new blocker introduced.

---
*Quick task: 260718-jmt*
*Completed: 2026-07-18*

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/depot.ts
- FOUND: src/backend/storeManagers/steam/__tests__/depot.test.ts
- FOUND commit: d231dc17
- FOUND: `PROGRESS_HEARTBEAT_MS` constant + setInterval usage in depot.ts (L605, L1122)
- FOUND: `PROGRESS_HEARTBEAT_MS` referenced in depot.test.ts heartbeat test (L2193)
- `pnpm jest src/backend/storeManagers/steam` — 14/14 suites, 563/563 tests passed (562 baseline + 1 new)
- `npx tsc --noEmit -p .` — clean, no errors
