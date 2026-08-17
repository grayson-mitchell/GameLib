---
phase: quick-260817-ihr
plan: 01
subsystem: steam-native-install
tags: [steam, depot-download, concurrency, circuit-breaker, throughput]

# Dependency graph
requires:
  - phase: 25-steam-depot-download-multi-host-fan-out-throughput
    provides: TOP_N_FANOUT / workerSlot attempt-0 host fan-out (pickHost), which this
      plan builds a recovery probe on top of without changing its signature
provides:
  - DEMOTED_PROBE_INTERVAL bounded recovery probe in HostHealthTracker.pickHost, making
    the pre-existing "half-open circuit breaker" documented on MutableHostStats actually
    reachable in production
  - InflightLimiter (depot/inflightLimiter.ts), a run-scoped FIFO concurrency limiter
  - TARGET_INFLIGHT_CHUNKS=32 explicit network-request budget, replacing the accidental
    FILE_CONCURRENCY=8 ceiling that emerged from single-chunk-file pool sizing
  - A corrected, appended record in the resolved steam-install-slow-start.md debug doc
    closing the stale "Thread C fan-out never implemented" lead
affects: [23-10, steam-native-install, steam-depot-download]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Run-scoped limiter/tracker discipline: InflightLimiter joins HostHealthTracker and
      StallTracker as a class constructed fresh per download run in downloadDepotFiles,
      never a module-level singleton, so one run can never throttle or poison another and
      tests never leak state."
    - "Post-increment probe cadence: a per-run monotonic counter checked AFTER incrementing
      (not before) so a fresh tracker's very first attempt-0 call is never itself diverted
      -- preserves every pre-existing caller/test's 'first pick avoids the demoted host'
      expectation while still guaranteeing a probe within any DEMOTED_PROBE_INTERVAL-length
      run of attempt-0 calls."

key-files:
  created:
    - src/backend/storeManagers/steam/depot/inflightLimiter.ts
    - src/backend/storeManagers/steam/__tests__/inflightLimiter.test.ts
  modified:
    - src/backend/storeManagers/steam/depot/hostHealth.ts
    - src/backend/storeManagers/steam/__tests__/hostHealth.test.ts
    - src/backend/storeManagers/steam/depot.ts
    - .planning/debug/resolved/steam-install-slow-start.md

key-decisions:
  - "Probe cadence is post-increment (checked after incrementing the internal counter), not
    pre-increment as the plan's action steps literally described -- pre-increment would fire
    a probe on the very first ever attempt-0 call after ANY demotion (counter starts at 0,
    0 % 32 === 0), which broke 2 existing hostHealth tests and 1 existing depotPrimitives
    test that assert 'the first pick after a demotion avoids the demoted host'. Post-increment
    preserves every existing assertion byte-for-byte while still guaranteeing exactly one
    probe within any 32-call window, satisfying the plan's actual behavior bullets."
  - "FILE_CONCURRENCY raised 8 -> 32 (not left at 8 with only the limiter added) so a
    single-chunk file's one-worker cap can still reach the InflightLimiter's budget --
    otherwise the limiter alone would do nothing for the single-chunk-file-dominant case
    that caused the original throughput collapse."

requirements-completed: [IHR-01, IHR-02, IHR-03]

# Metrics
duration: ~25min
completed: 2026-08-17
---

# Quick 260817-ihr: Fix the Steam depot downloader's throughput regressions Summary

**Made host demotion recoverable via a bounded probe (DEMOTED_PROBE_INTERVAL=32) and replaced the accidental 8-request network ceiling with an explicit 32-request InflightLimiter budget, closing a stale debug-doc lead that had already been fixed in Phase 25.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3/3 completed
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- `HostHealthTracker.pickHost` now gives a demoted host a probe pick every
  `DEMOTED_PROBE_INTERVAL` (32) attempt-0 calls when a healthy alternative exists, so the
  documented "half-open circuit breaker" on `MutableHostStats.consecutiveFailures` is now
  actually reachable — a demoted host with a strong lifetime track record (the real
  99.5%/99.8% hosts from the 2026-08-17 HUMANKIND hardware log) can earn its way back into
  the fan-out pool after one recorded success instead of being frozen out for the rest of
  the run.
- New `InflightLimiter` class (`depot/inflightLimiter.ts`) enforces an explicit
  `TARGET_INFLIGHT_CHUNKS = 32` run-wide network-request budget at the actual `fetchChunk`
  call boundary, replacing the accidental ~8-request ceiling that emerged when
  `downloadFileChunks`'s per-file worker pool collapsed to 1 for single-chunk files (the
  overwhelming majority of files in a modern game depot).
- Corrected `.planning/debug/resolved/steam-install-slow-start.md`: the "(b) Thread C
  client-side host fan-out gap fix ... diagnosis-closed, fix not implemented" line was stale
  — that fix shipped in Phase 25 (commit `9923545e3`). A new dated section closes that lead
  and records the two real defects this plan fixed, plus an explicit open lead for a stall
  window this plan did NOT explain (46 attempts in 806s with only 2 timeouts moved,
  pointing away from `fetchChunk` toward `DecompressPool`/`fd.write`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Make host demotion recoverable via a bounded probe (IHR-01)** - `f77de7c57` (fix)
2. **Task 2: Replace the accidental 8-request ceiling with an explicit in-flight budget (IHR-02)** - `a0e2f07f4` (fix)
3. **Task 3: Correct the written record in the resolved debug doc (IHR-03)** - `d89059e06` (docs)

_Tasks 1 and 2 were TDD: tests were written first, confirmed to fail against the pre-existing
implementation (RED), then made to pass (GREEN) — see "TDD Gate Compliance" below. Each task's
single commit includes both the test and implementation changes together (the plan's `<action>`
did not require separate RED/GREEN commits for this plan's task granularity)._

## Files Created/Modified

- `src/backend/storeManagers/steam/depot/hostHealth.ts` - Added `DEMOTED_PROBE_INTERVAL`
  export and the probe branch in `pickHost`; no change to `pickHost`'s public signature.
- `src/backend/storeManagers/steam/__tests__/hostHealth.test.ts` - New `describe` block
  covering every `<behavior>` bullet for the probe (exactly-one-probe-per-window, recovery
  rejoin, unchanged-when-all-healthy, unchanged attemptIndex>0, single-host, empty-list).
- `src/backend/storeManagers/steam/depot/inflightLimiter.ts` - New `InflightLimiter` class:
  FIFO queue, `finally`-released slots, throws on non-positive/non-finite `max`.
- `src/backend/storeManagers/steam/__tests__/inflightLimiter.test.ts` - New test suite:
  max-concurrency enforcement, FIFO order, throw-releases-slot, resolve/reject propagation,
  constructor validation.
- `src/backend/storeManagers/steam/depot.ts` - Exported `TARGET_INFLIGHT_CHUNKS = 32`; raised
  `FILE_CONCURRENCY` 8 -> 32; threaded optional `limiter?: InflightLimiter` through
  `downloadFileChunks` and `downloadSingleFile` (appended at the end of each signature);
  constructed one `InflightLimiter` per run in `downloadDepotFiles` alongside the run's
  `HostHealthTracker`; wrapped only the `fetchChunk` call in `downloadFileChunks` with
  `limiter.run(...)`.
- `.planning/debug/resolved/steam-install-slow-start.md` - Appended a dated follow-up section
  (append-only, no existing section edited).

## Decisions Made

- **Probe counter is post-increment, not pre-increment as literally described in the plan's
  action steps.** The plan's action step 3 said "the pre-increment counter is a multiple of
  DEMOTED_PROBE_INTERVAL" — implemented literally, this fires a probe on the very FIRST
  attempt-0 call ever made on a fresh tracker whenever a host is already demoted at that
  point (counter starts at 0, and 0 is a multiple of 32). Running the RED tests against this
  literal reading broke 3 pre-existing tests (2 in `hostHealth.test.ts`, 1 in
  `depotPrimitives.test.ts`) that assert "the first pick after a demotion avoids the demoted
  host" — a hard requirement per the plan's own `<done>` criterion ("All existing hostHealth
  and depotPrimitives tests still pass unmodified"). Switched to checking the counter AFTER
  incrementing it, so the first probe fires on the 32nd attempt-0 call instead of the 1st.
  This still satisfies every `<behavior>` bullet (probe within `DEMOTED_PROBE_INTERVAL` calls;
  at most one per window; recovery rejoin; unchanged-when-healthy; unchanged attemptIndex>0)
  while keeping every pre-existing test green. Documented inline in both the implementation's
  doc comment and the test file. This is a Rule 1 (bug) auto-fix under the deviation rules —
  the plan's literal instruction was itself an unintentional bug relative to its own stated
  "existing tests unmodified" done-criterion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Probe counter changed from pre-increment to post-increment semantics**
- **Found during:** Task 1, writing the RED tests and confirming they failed correctly
  before implementation
- **Issue:** The plan's action step 3 literally specified checking "the pre-increment
  counter" for the modulo-32 probe condition. Implemented literally (counter starts at 0,
  checked before incrementing), this diverts the very first attempt-0 `pickHost` call ever
  made on a fresh tracker to the demoted host whenever one already exists at that point —
  breaking 3 pre-existing tests that assert the first pick after a demotion avoids the
  demoted host, and contradicting the plan's own `<done>` requirement that all existing
  hostHealth/depotPrimitives tests pass unmodified.
- **Fix:** Incremented the counter BEFORE the modulo check (post-increment) instead. The
  first probe now fires on the 32nd attempt-0 call rather than the 1st, still guaranteeing
  exactly one probe within any 32-consecutive-call window and full recovery after one
  success, while every pre-existing test's "first pick avoids the demoted host" assumption
  holds untouched.
- **Files modified:** `src/backend/storeManagers/steam/depot/hostHealth.ts`,
  `src/backend/storeManagers/steam/__tests__/hostHealth.test.ts`
- **Verification:** `pnpm test -- hostHealth.test.ts depotPrimitives.test.ts` — all 92 tests
  pass (23 new probe tests + 69 pre-existing, none weakened).
- **Committed in:** `f77de7c57` (part of Task 1's commit)

**2. [Rule 1 - Bug] Fixed two ESLint `require-await` warnings in new test helper closures**
- **Found during:** Task 2, running `pnpm lint` against the newly created files (goes beyond
  the plan's stated `pnpm test` + `pnpm codecheck` verification, per this repo's own process
  lesson that a green `codecheck` says nothing about lint)
- **Issue:** Three `async () => ...` test-helper arrow functions passed to `limiter.run()`
  contained no `await` expression, tripping `@typescript-eslint/require-await`.
- **Fix:** Rewrote them as plain (non-`async`) functions returning `Promise.resolve(...)` or
  throwing synchronously with an explicit `Promise<never>` return-type annotation, preserving
  identical runtime behavior.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/inflightLimiter.test.ts`
- **Verification:** `npx eslint` on the changed files — 0 errors, 0 warnings (was 5 warnings).
  Full `pnpm test` re-run afterward confirmed no behavior change (223/223 passing).
- **Committed in:** `a0e2f07f4` (part of Task 2's commit)

## TDD Gate Compliance

Both TDD tasks followed RED -> GREEN within their own single commit (test file and
implementation landed together per task, matching this plan's task granularity — the plan did
not request separate `test(...)` and `feat(...)` commits for Tasks 1/2):

- **Task 1 (hostHealth):** Tests written first; confirmed 4 failures against the pre-existing
  implementation (`DEMOTED_PROBE_INTERVAL` undefined, no probe logic) via
  `pnpm test -- hostHealth.test.ts` before writing any implementation code. Then implemented
  and reached green (92/92, including the 69 pre-existing tests).
- **Task 2 (inflightLimiter):** Test file written first against a module that did not yet
  exist; confirmed the RED failure was "Cannot find module '../depot/inflightLimiter'" via
  `pnpm test -- inflightLimiter.test.ts`. Then implemented `InflightLimiter` and reached green
  (7/7), then wired it into `depot.ts` and re-confirmed the full Steam-depot suite green
  (223/223 across `inflightLimiter.test.ts`, `depot.test.ts`, `depotPrimitives.test.ts`,
  `hostHealth.test.ts`).

No fail-fast violations: no test passed unexpectedly during either RED phase.

## Verification Results

- `pnpm test -- src/backend/storeManagers/steam/__tests__/hostHealth.test.ts
  src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts` — 92/92 pass.
- `pnpm test -- src/backend/storeManagers/steam/__tests__/inflightLimiter.test.ts
  src/backend/storeManagers/steam/__tests__/depot.test.ts
  src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts` — 196/196 pass.
- `pnpm codecheck` (`tsc --noEmit`) — clean, run after every task.
- `npx eslint` on all 6 changed files — 0 errors, 0 warnings.
- `pnpm test -- src/backend/storeManagers/steam/` (full Steam suite, all files) — 1225/1225
  individual tests passed. One suite, `depot.finalize.test.ts`, crashed with a Node
  `JavaScript heap out of memory` V8 OOM when run as part of the full ~34-suite batch. **This
  is a pre-existing environment/sandbox memory-pressure issue, not a regression from this
  plan**: confirmed by temporarily `git checkout --`-ing `depot.ts` back to its pre-Task-2
  state (verified via `git diff --stat` showing zero diff) and re-running
  `depot.finalize.test.ts` in isolation — it produced the identical OOM crash on the
  unmodified baseline. Changes were then restored from a scratchpad backup and re-verified
  clean (`git diff --stat` confirmed byte-identical restoration, followed by a fresh
  `pnpm codecheck` + full targeted test pass).
- `grep -n "TOP_N_FANOUT\|workerSlot" src/backend/storeManagers/steam/depot/decompress.ts` —
  `fetchChunk`'s `pickHost` call site is unchanged (confirmed byte-identical to pre-plan).
- `git diff --stat` across all 3 commits — touches exactly the 6 files listed in the plan's
  `files_modified` frontmatter, nothing else. The watchdog, abort/DownloadManager path,
  `depot/cdnAuth.ts`, and StateFlags/chmod logic are all untouched.
- `grep -v '^#' .planning/debug/resolved/steam-install-slow-start.md | grep -c
  "DEMOTED_PROBE_INTERVAL\|TARGET_INFLIGHT_CHUNKS\|9923545e3"` — 3 (all three identifiers
  present in the appended section).

## Threat Model Compliance

- **T-IHR-01 (DoS via raised FILE_CONCURRENCY):** Mitigated as specified — `InflightLimiter`
  caps run-wide in-flight requests at `TARGET_INFLIGHT_CHUNKS = 32` regardless of
  `FILE_CONCURRENCY * CHUNK_CONCURRENCY`'s theoretical product (up to 128); the limiter wraps
  only the network call, enforced unconditionally whenever a limiter is supplied.
- **T-IHR-02 (DoS via probe branch):** Mitigated as specified — probe fires at most once per
  32 attempt-0 calls, only when a healthy alternative exists (`healthy.length > 0`), verified
  by a dedicated unit test (`'a demoted host receives exactly one attempt-0 probe pick within
  DEMOTED_PROBE_INTERVAL consecutive attempt-0 calls'`).
- **T-IHR-03 (Tampering via new deps):** No new dependencies introduced. `InflightLimiter` is
  plain promises (`Promise`, arrays) — no timers, no third-party packages.
- **T-IHR-04 (Tampering via probed-host bytes):** Accepted as specified — unchanged; the
  existing per-chunk SHA1 verification in `decompress.ts`'s decode path was not touched by
  this plan and rejects corrupt bytes identically regardless of which host served them.

## Known Stubs

None — this plan touches only internal scheduling/health-tracking logic and a debug doc; no
UI-facing data paths or stubs were introduced.

## Live-Hardware Validation Note

Per the plan's `<success_criteria>`: live-hardware validation is explicitly OUT of scope for
this plan's own verification — it is deferred to phase 23 plan 23-10 Task 1 (Gate 2 clean
re-run). Flagging for that gate: **Task 2 raises real network concurrency roughly 4x** (from
an effective ~8 to a budgeted 32 in-flight requests), so 23-10's Gate 2 is now load-bearing
for this change too, not just its original scope.

## Self-Check: PASSED

All claimed files and commits verified to exist:

- FOUND: `src/backend/storeManagers/steam/depot/hostHealth.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/hostHealth.test.ts`
- FOUND: `src/backend/storeManagers/steam/depot/inflightLimiter.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/inflightLimiter.test.ts`
- FOUND: `src/backend/storeManagers/steam/depot.ts`
- FOUND: `.planning/debug/resolved/steam-install-slow-start.md`
- FOUND commit `f77de7c57`
- FOUND commit `a0e2f07f4`
- FOUND commit `d89059e06`
