---
phase: 84-logger
fixed_at: 2026-11-22T00:00:00Z
review_path: .planning/phases/84-logger/84-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 84: Code Review Fix Report (round 3)

**Fixed at:** 2026-11-22
**Source review:** .planning/phases/84-logger/84-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 2 (WR-09, WR-10; no critical findings, no info findings)
- Fixed: 2
- Skipped: 0

Both findings were regressions from the WR-08 fix (1790bba62). Each fix landed test-first: the new tests
were run and failed before the fix, then passed after. WR-08's two tests in `targetWriter.test.ts` stayed
green throughout, so the owed-rotation guarantee is intact.

## Fixed Issues

### WR-09: `flush()` no longer waits for a Promise-valued structured message, so the fatal-exit guard can lose it

**Files modified:** `src/backend/logger/forwarder.ts`, `src/backend/logger/index.ts`,
`src/backend/logger/targetWriter.ts`, `src/backend/logger/__tests__/targetWriter.test.ts`
**Commit:** 61cffefff
**Applied fix:** The writer's chain is now visible to the forwarder. `LogForwarder.trackSettle(link)` adds a
pending link to a forwarder-owned `Set` (dropped when it settles), `index.ts` exposes it as
`trackLogSettle`, and `LogWriter.#extend` registers its new `#tail` (which never rejects) after every
chained step. `#settleChains` now loops while `#chains` or the writer links are non-empty and awaits both
under the same single deadline taken at entry, so a message that never settles still cannot hold `flush`
past `LOG_FLUSH_TIMEOUT_MS` (WR-06 unchanged). This also closes the same gap for `writeString(promise)`.
The `flush()` doc comment (the IN-10 text) now says it waits for the forwarder's own chains and for the
writer-held Promise messages plus the writes queued behind them, so it is accurate again.
**Tests added (3, all red before the fix):**

- a flush during a pending `writer.logInfo(slow)` plus a queued `writeString` waits for both, and the lines arrive in order;
- the same for a pending `writeString(promise)` with a later `logInfo` queued behind it;
- with fake timers, a flush with a never-settling message resolves at `LOG_FLUSH_TIMEOUT_MS` (not before), and another writer's line is still handed to the transport.

### WR-10: A line behind a Promise message is timestamped when the chain reaches it, not when it was logged (D-12)

**Files modified:** `src/backend/logger/forwarder.ts`, `src/backend/logger/index.ts`,
`src/backend/logger/targetWriter.ts`, `src/backend/logger/__tests__/targetWriter.test.ts`
**Commit:** 349975ff0
**Applied fix:** Took the review's alternative: `LogForwarder.logLine` and `index.logLine` gained an
optional `at` argument (default `Date.now()`), and `LogWriter.#logBase` takes the clock once at the call and
passes it in all three paths (immediate, queued behind a pending link, Promise body). `tz` is derived from
that same instant, so it is also the call-time offset. This keeps the forwarder's empty-body and owed-rotation
rules in one place instead of duplicating them in the writer.
**Tests added (2, red before the fix, ts was 30 s late):** with fake timers, a Promise-valued line and a line
logged behind it keep their call-time `ts` and `tz` after the Promise settles 30 s later; and a Promise line
queued behind another pending Promise keeps its own call time.

## Verification

Run in the main checkout (`workflow.use_worktrees` was not used; this session edited `main` directly, staging
explicit paths only).

- `npx jest src/backend/logger src/backend/__tests__/shellLogCategoryOnly.test.ts src/backend/__tests__/loggerPortComplete.test.ts`: 8 suites, 207 tests pass.
- `npx tsc --noEmit`: clean (no output).
- `npx prettier --check` over the four TS paths written: all matched files use Prettier code style.

---

_Fixed: 2026-11-22_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
