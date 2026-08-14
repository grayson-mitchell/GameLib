---
phase: quick-260814-u2u
plan: 01
subsystem: infra
tags: [node, child_process, signals, esbuild, jest, meta-tooling]

requires:
  - phase: 34.9 gap cycle 4 (plan 34.9-29)
    provides: meta/runTs.cjs, the private-tmpdir compile-then-run wrapper C3-01 introduced
provides:
  - "meta/runTs.cjs rewritten onto async spawn with SIGTERM/SIGINT/SIGHUP forwarding, bounded SIGKILL escalation, idempotent cleanup, and 128+N exit codes"
  - "meta/__tests__/runTsSignals.test.ts: 5 executable, execution-proven regression pins (T1-T5) for C4-01/C4-02/C4-04 and invariant 1"
  - "meta/__tests__/fixtures/runTsSignalFixture.ts: long-lived fixture entry for signal-proof tests"
  - "34.9-WRAPPER-PROOF.md row 11 dated addendum recording the fix"
affects: [34.9-32, 34.9-33]

tech-stack:
  added: []
  patterns:
    - "async spawn + tracked currentChild + terminatingSignal state machine for transparent signal-forwarding process wrappers"
    - "idempotent cleanup() registered both on the normal exit path AND process.on('exit') as a second, independent guarantee"
    - "RED-proof-by-execution against a recreated pre-fix file (git show <parent>:<path>), hash-verified restore of the test file after a temporary constant repoint"

key-files:
  created:
    - meta/__tests__/runTsSignals.test.ts
    - meta/__tests__/fixtures/runTsSignalFixture.ts
  modified:
    - meta/runTs.cjs
    - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-WRAPPER-PROOF.md
    - .planning/STATE.md

key-decisions:
  - "Moved BOTH the esbuild and node spawn steps to async spawn (not just the run step) -- a SIGTERM landing during compile hits the identical blocked-loop/leak problem, and two spawn mechanisms would mean two different signal stories (D1)."
  - "Forward only SIGTERM/SIGINT/SIGHUP, escalate to SIGKILL after 5000ms if the child ignores the forward, timer cleared on 'close' and never unref'd (D2/D3)."
  - "Exit code convention: signalled wrapper always answers 128+signum of the CALLER's signal regardless of how the child actually died; unsignalled wrapper with a signal-killed child answers 128+signum of the CHILD's signal (never a flat 1); child launch failure ('error' event) answers 1 (D5)."
  - "process.on('exit', cleanup) added as a second guarantee alongside the explicit cleanupAndExit() path, with cleanup() made idempotent via a 'cleaned' boolean -- the async rewrite makes double-entry reachable (D6)."
  - "Moved the node_modules symlink block inside the try/catch (C4-02) so a symlinkSync failure is caught by the same handler that owns cleanup(), instead of leaking tmpDir on an uncaught throw."

patterns-established:
  - "Signal-forwarding wrapper proof: spawn the real wrapper as a child, capture its own PID via a printed ready line, signal it externally, read the exit code from the wrapper's own 'close' event (never through a pipe), assert the child's PID is ESRCH and the tmpdir is gone."
  - "Global tmpdir-diff leak checks in a jest suite must poll rather than snapshot-once when the shared tmp namespace can also be touched by a concurrent test file in a different jest worker (discovered live against meta/__tests__/updaterSigningKey.test.ts's own `pnpm verify:updater-key` invocation)."

requirements-completed: [REQ-34.9-08, C4-01, C4-02, C4-04]

duration: ~50min
completed: 2026-08-14
---

# Quick Task 260814-u2u: Forward signals in meta/runTs.cjs Summary

**meta/runTs.cjs rewritten from blocking `spawnSync` to async `spawn` with SIGTERM/SIGINT/SIGHUP forwarding, bounded SIGKILL escalation, idempotent cleanup, and `128+N` exit codes -- closing review findings C4-01/C4-02/C4-04 (C4-03 as a structural consequence), pinned by 5 execution-proven tests.**

## Performance

- **Duration:** ~50 min (session start time not captured; estimated from the span of exploration/authoring/debugging work, commits landed within a 15-minute window: 21:58-22:13)
- **Completed:** 2026-08-14T10:14:04Z
- **Tasks:** 3/3 completed
- **Files modified:** 5 (`meta/runTs.cjs`, `meta/__tests__/runTsSignals.test.ts` [new], `meta/__tests__/fixtures/runTsSignalFixture.ts` [new], `34.9-WRAPPER-PROOF.md`, `.planning/STATE.md`)

## Accomplishments

- `meta/runTs.cjs` no longer orphans its spawned child (and leaks its private `gamelib-runts-*` tmpdir) when the wrapper is `SIGTERM`'d -- measured before and after: pre-fix the child kept running 19s past the kill and the tmpdir survived; post-fix the child is confirmed dead (`process.kill(pid,0)` throws `ESRCH`) and the tmpdir is confirmed gone, with the wrapper reporting the conventional `128+N` exit code.
- Discovered and avoided a strictly-worse fix shape: `process.on('SIGTERM', ...)` alongside the old `spawnSync` suppresses Node's default disposition (wrapper survives) but the handler never gets a turn to run while `spawnSync` blocks the event loop -- the abort becomes a complete no-op. The real fix required moving both spawn sites (esbuild compile step AND node run step) to async `spawn`.
- All three review findings closed: C4-01 (orphan+leak), C4-02 (symlinkSync failure leaking tmpDir, fixed by moving the block inside the cleanup-owning `try`), C4-04 (external `SIGKILL` of the child reported a flat `1` instead of `137`). C4-03 (logging spawn `'error'` events) fell out structurally from the async rewrite, per D7.
- Invariant 1 (compile-failure short-circuit -- `node` never spawned on a failed/partial compile) is preserved unchanged and re-proven with an in-test positive control (T3).
- `parseArgv()` is byte-unchanged (verified programmatically, not just by eye).

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite meta/runTs.cjs onto async spawn with signal forwarding, idempotent cleanup and 128+N exit codes** - `fdc5b24e7` (fix)
2. **Task 2: Author the executable signal proof, RED-prove it against the pre-fix wrapper, restore, and gate on the full suite** - `bf8a8f024` (test)
3. **Task 3: Record the contract consequence on WRAPPER-PROOF row 11, hand-edit STATE.md, and commit** - `8647ac19e` (docs)

_Note: a concurrent session's own commit (`590f9add0`, `docs(34.13): fix UI-SPEC Section-Gating Matrix completeness gap`) landed between Task 1 and Task 2's commits -- unrelated to this work, left untouched._

## Files Created/Modified

- `meta/runTs.cjs` - Async spawn, signal forwarding (SIGTERM/SIGINT/SIGHUP), 5000ms bounded SIGKILL escalation, idempotent `cleanup()` also registered on `process.on('exit')`, `128+N` exit code convention, `node_modules` symlink moved inside the cleanup-owning `try`, spawn `'error'` events logged to stderr.
- `meta/__tests__/runTsSignals.test.ts` - New. 5 executable, execution-proven tests (T1-T5) spawning the real wrapper, really signalling it or its child, reading the exit code from the wrapper's own `'close'` event.
- `meta/__tests__/fixtures/runTsSignalFixture.ts` - New. Long-lived entry printing its own pid/`__dirname` (which resolves to the wrapper's private tmpdir once bundled), heartbeating until a 20s deadline. No signal handler of its own.
- `.planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-WRAPPER-PROOF.md` - Dated addendum on Direction B row 11 recording that the fix makes its SIGTERM-the-wrapper methodology sound.
- `.planning/STATE.md` - Hand-edited `last_activity`/`last_updated` only; `progress:` block untouched.

## Decisions Made

See `key-decisions` in frontmatter (D1/D2/D3/D5/D6 from the plan's own design-decisions block, implemented as specified; C4-02's fix placement decision made explicit).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, in this task's own new test file] afterEach leak check raced a concurrent test file's own use of the same wrapper**
- **Found during:** Task 2, first GREEN run of `runTsSignals.test.ts`
- **Issue:** `meta/__tests__/updaterSigningKey.test.ts` independently calls `spawnSync('pnpm', ['verify:updater-key'])`, which itself runs through `meta/runTs.cjs` and creates its own `gamelib-runts-*` dir in the same shared `os.tmpdir()`. Jest runs test FILES concurrently by default (different worker processes); a single before/after snapshot in my `afterEach` flaked when that unrelated invocation's dir existed transiently inside my own comparison window (T3 and T4 both failed on this in the first run, with zero relationship to my own test's correctness).
- **Fix:** Changed the leak check from a single snapshot comparison to a poll (up to 5s, 100ms interval) that only fails if the diff is still non-empty after the deadline -- tolerates a concurrent unrelated invocation's own bounded lifetime while still failing definitively on a real leak, which (being an actual bug) would never clear no matter how long the poll waits.
- **Files modified:** `meta/__tests__/runTsSignals.test.ts`
- **Verification:** Re-ran the suite repeatedly with no further flakes; re-ran alongside `updaterSigningKey.test.ts` in the same jest invocation, both green.
- **Committed in:** `bf8a8f024` (Task 2 commit)

**2. [Rule 1 - Bug, in this task's own new test file] probe-file cleanup skipped on a failing afterEach assertion**
- **Found during:** Task 2, immediately after the first RED proof run
- **Issue:** `afterEach`'s leak assertion (`expect(leaked).toEqual([])`) throws on failure; the probe-file unlink (`meta/runTs.__probe__.cjs`) was written AFTER that assertion in the same function body, so a throw skipped it. Confirmed live: after the first RED run, `git status --porcelain meta/` showed a leaked `meta/runTs.__probe__.cjs`.
- **Fix:** Wrapped the leak-poll-and-assert block in `try`, moved the probe unlink into a `finally`, so it runs unconditionally.
- **Files modified:** `meta/__tests__/runTsSignals.test.ts`
- **Verification:** Re-ran the RED proof (against a freshly recreated `meta/runTs.prefix.cjs`, git-show'd from the parent of the fix commit, hash-confirmed identical to the original) -- `git status --porcelain meta/` showed no probe leftover after the RED run this time.
- **Committed in:** `bf8a8f024` (Task 2 commit)

**3. [Rule 1 - Bug, lint] `let WRAPPER` never reassigned in the shipped file**
- **Found during:** Task 2, `pnpm lint` gate
- **Issue:** After the RED-proof-and-restore cycle (which repoints the `WRAPPER` constant via an out-of-band text edit, not a runtime reassignment), the shipped file never actually reassigns `WRAPPER` at runtime, tripping `prefer-const` (3545/54 vs. the 3544/53 baseline).
- **Fix:** Changed `let WRAPPER = ...` to `const WRAPPER = ...`.
- **Files modified:** `meta/__tests__/runTsSignals.test.ts`
- **Verification:** `pnpm lint` returned to the exact 3544/53 baseline; re-ran the 5-test suite green.
- **Committed in:** `bf8a8f024` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1, all confined to this task's own new test file, none touching `meta/runTs.cjs` itself after Task 1's commit).
**Impact on plan:** All three necessary for the test suite to be correct and non-flaky. No scope creep -- none of the three affected the wrapper under test or any other file.

## Issues Encountered

- One unrelated flaky test (`src/backend/sidecar/__tests__/bootstrapWirings.test.ts`, `REQ-34.2-04/REQ-34.2-07: the re-homed listener writes the anticheat data file to disk`) failed once during a full `pnpm test:ci` run. Confirmed unrelated: it passes 13/13 in isolation, touches sidecar bootstrap wiring nowhere near `meta/runTs.cjs`, and a second full `pnpm test:ci` run came back 251/251 suites clean. Logged here per the SCOPE BOUNDARY rule (pre-existing, out of scope) -- not fixed, not re-run in a loop chasing it.

## W1/W2/W3 checker-warning fixes (applied inline, per instructions)

- **W1:** The Task 1 manual-verification `wait $W; echo "EXIT=$?"` diagnostic-under-`set -e` dead-code issue was avoided in practice by not using `set -e` in the manual verification commands actually run (`RC=$?` captured directly on the line after `wait`, echoed unconditionally). Both SIGTERM (143) and SIGINT (130) manual runs printed their diagnostic successfully.
- **W2:** Invariant 4 (argv contract byte-unchanged) is now asserted with an automated check, not prose alone: a Node script extracts the `parseArgv` function body from both the current `meta/runTs.cjs` and the pre-fix file (via `git show`) and asserts string equality -- run during Task 1 and re-confirmed after Task 3.
- **W3:** The `Observed: ______` slot count in `34.9-WRAPPER-PROOF.md` was captured BEFORE the edit (18) and compared programmatically against the count AFTER the edit (18) in the same verification pass (Task 3's second `<automated>` check plus a manual `git show HEAD:...` comparison).

## Correction to the plan's own prose (verified empirically, per instructions)

Node v26's `'exit'` event ordering relative to an uncaught exception's stack-trace print was not independently re-measured with a standalone repro in this session (the design does not depend on the ordering either way -- `cleanupAndExit()`'s synchronous `cleanup()` call runs before `process.exit()` on every explicit exit path, and the `process.on('exit', cleanup)` hook is idempotent insurance regardless of when Node prints its own diagnostic). The header comment written into `meta/runTs.cjs` does NOT repeat the plan's parenthetical claim about print-then-exit ordering -- it states only that `'exit'` fires on normal return, explicit `process.exit()`, and after an uncaught exception, without asserting a relative ordering to the stack-trace print, avoiding copying a claim that was flagged as possibly backwards.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 34.9-32 (the real macOS arm64 hardware run) can now trust Direction B row 11's SIGTERM-the-wrapper methodology: the addendum on `34.9-WRAPPER-PROOF.md` records this explicitly, citing the fix commit and the T1 pin.
- `deferred-items.md` still carries no rows for C4-01..C4-05 or C3-01..C3-03 -- phase 34.9's own reconciliation sweep remains behind by two cycles. This quick task deliberately did not touch that ledger; it is phase 34.9's own gap-cycle work. C4-05 (the sweep tool's case-sensitive self-citation ban) also remains open and untouched.

---
*Phase: quick-260814-u2u*
*Completed: 2026-08-14*

## Self-Check: PASSED

All created/modified files confirmed present on disk (`meta/runTs.cjs`, `meta/__tests__/runTsSignals.test.ts`, `meta/__tests__/fixtures/runTsSignalFixture.ts`, `34.9-WRAPPER-PROOF.md`, `.planning/STATE.md`, this SUMMARY.md). All three task commits confirmed in `git log`: `fdc5b24e7`, `bf8a8f024`, `8647ac19e`.
