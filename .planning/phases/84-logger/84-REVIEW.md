---
phase: 84-logger
reviewed: 2026-11-22T04:21:59Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/backend/logger/forwarder.ts
  - src/backend/logger/index.ts
  - src/backend/logger/__tests__/forwarder.test.ts
  - src/backend/logger/__tests__/targetWriter.test.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
  necessity: 0
status: issues_found
---

# Phase 84: Code Review Report (round 5)

**Reviewed:** 2026-11-22T04:21:59Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Round 5 reviews the four round-4 fix commits: 01dca3681 (WR-11), 915500558 (WR-12), b60933290 (IN-11) and
279f4facd (IN-12). The diff is `git diff a90c128d0 279f4facd -- src/backend/logger`. The four files have no
changes after 279f4facd. Phase 85's files and the concurrent session's uncommitted files were left out of
scope. No source file was touched.

**How this was verified:**

- `npx jest src/backend/logger`: 6 suites, 127 tests, all pass.
- `eslint` on the four files: only the existing `require-await` warning at `index.ts:179`, which these
  commits did not change.
- `prettier --check` on the four files: clean.
- Mutation probes on a scratch copy of `src/backend/logger`, run by a separate jest config in the session
  scratchpad. In that harness three tests could not run because their fixture paths are relative: the
  `paths.rs` parity test and the golden and prefix-parity suites. The golden suite's transport calls
  `onWritten` synchronously, so it can never reach the transport wait and could not catch the WR-13 mutation
  below.

**WR-11 is closed.** `#settleChains` races `Promise.allSettled` (`forwarder.ts:470-476`), so a rejecting link
no longer ends the wait. It adds no unhandled rejections. `trackSettle` attaches `link.then(drop, drop)`
(`:347`) before any snapshot subscribes, so a rejected link is out of the Set before the loop re-checks
`size`. `allSettled` never rejects, and neither does `expired`. The forwarder's own `#chains` links resolve
through `.then(emit, onRejected)`, so they never reject anyway. The transport wait still runs after the
chain wait. Mutation `allSettled` → `all` fails the new WR-11 test. The test's own
`failing.catch(() => undefined)` is redundant but harmless.

**WR-12 is closed for the chain wait.** Both waits now measure against the one `performance.now()`
deadline (`:431`, `:438`, `:460`). No wall-clock read is left on the wait path. The only `Date.now()` left
in the file is the call-time stamp in `logLine` (`:303`), which is correct per D-12. Jest 29's modern fake
timers fake `performance.now()`, and `setSystemTime` leaves it alone. The golden suites leave both
`performance` and the timers real (`doNotFake`), so the two clocks agree in every harness. The probes
showed:

- Reverting to the old wall-clock code fails the WR-12 test.
- Mixing the clocks on the transport wait (`deadline - Date.now()`) fails the WR-11 test.
- The transport-wait half of "cannot stretch either wait" has no test (WR-13).

**IN-12 is closed.** The `getTimezoneOffset` spy is created before the `try` block and restored in
`finally` (`targetWriter.test.ts:378-412`). The describe-level `afterEach` restores real timers. Nothing
leaks into later tests. Mutation `tz = -new Date().getTimezoneOffset()` (settle-time `tz`) fails the test.
The settle-time sanity check (`-300`) proves the window really straddles the mocked offset change. The DST
claim holds: 2026-11-01 is a Sunday, and 02:00 EDT = 06:00Z.

**IN-11 is partly accurate.** `logErrorSettled` really does have one production caller,
`bootstrap.ts:1543`, the fatal sink. Two statements in the new or edited doc text do not match the code
(IN-13, IN-14).

**WR-08/09/10:** these commits do not regress them. WR-09's writer-link wait is the code WR-11 changed, and
it still waits on every link. WR-10's call-time `ts`/`tz` path (`logLine` `:303-304`) is unchanged, and the
IN-12 test now pins it more tightly.

## Warnings

### WR-13: No test proves the transport wait gets only what is left of the one deadline, the line WR-12 rewrote

**File:** `src/backend/logger/forwarder.ts:437-445` (the transport wait), compare the doc at `:422-426`
**Issue:** WR-12 removed the transport wait's `Math.min(this.#flushTimeoutMs, ...)` clamp. That leg is now
bounded only by `Math.max(0, deadline - performance.now())`. The flush doc makes two claims about it:

- the whole call takes at most `LOG_FLUSH_TIMEOUT_MS` ("one deadline taken at entry, WR-06");
- a step back "cannot stretch either wait".

No test exercises the transport leg's timer once the chain wait has used up part of the deadline:

- The WR-12 test has no transport wait. Its `FakeTransport` calls `onWritten` itself and nothing is queued,
  so `#isIdle()` returns at `:436`.
- The WR-11 test releases the held write callbacks by hand at 1,550 ms, before the deadline, so the
  transport timer never fires.
- The CR-01 settle tests (`forwarder.test.ts:649-667`) wait on the transport only, with no chain wait first.

Probe: change `:438` to `const left = this.#flushTimeoutMs`. Every runnable logger test still passes. With
that change, a 1,500 ms writer link plus a held write callback makes `flush` take 3,500 ms, against a
documented 2,000 ms. That breaks WR-06's single-deadline guarantee and goes past the fatal guard's own
1,500 ms cap.

**Fix:** Add a forwarder test that runs both legs in sequence and asserts the total. I ran this as a scratch
probe: it passes on the current code and fails on the mutation.
```ts
it('the transport wait gets only what is left of the one deadline (WR-06, WR-12)', async () => {
  const fw = new LogForwarder()
  const transport = new FakeTransport()
  transport.autoWritten = false
  fw.bind(transport)
  fw.enqueue(GAME, false, { raw: 'queued' })
  fw.trackSettle(new Promise<void>((resolve) => setTimeout(resolve, 1500)))
  let flushed = false
  const flushing = fw.flush().then(() => {
    flushed = true
  })
  await jest.advanceTimersByTimeAsync(LOG_FLUSH_TIMEOUT_MS - 1)
  expect(flushed).toBe(false)
  await jest.advanceTimersByTimeAsync(2)
  expect(flushed).toBe(true)
  await flushing
})
```
For the "either wait" claim, add a variant that calls `jest.setSystemTime(Date.now() - 60_000)` after
1,500 ms, inside the transport wait, and expects the same 2,001 ms result.

## Info

### IN-13: The `logInfoSettled` doc still names a call site that does not exist

**File:** `src/backend/logger/index.ts:78-83`
**Issue:** The doc says `logInfoSettled` is "for the `logInfo` send listener's call-site guard". The IN-11
commit extended this comment without correcting that. A grep of `src/` and `meta/` finds no production
caller: the only hits are tests and the name list in `meta/logSecretGate.ts:74`. The round-4 fix report
says so itself ("`logInfoSettled` has no production caller"). The new `logErrorSettled` paragraph is
accurate, but it now sits next to a sibling doc that implies a live caller, and the IN-11 cost note on
`logInfoSettled` describes a cost that no running code pays.
**Fix:** Replace the call-site claim with the fact: "No production caller today, kept as the `logInfo`
sibling and listed in `meta/logSecretGate.ts`." Whether to remove the export is a separate scope decision.

### IN-14: The IN-11 cost and rationale ignore the fatal guard's 1,500 ms cap, which is shorter than the flush deadline

**File:** `src/backend/logger/index.ts:58-64` (verified against `src/backend/sidecar/processGuards.ts:102`,
`:352-363`, read only)
**Issue:** The new paragraph justifies waiting on writer links with "a settle that skipped those links would
lose a game or runner writer's held lines on a fatal exit". It states the cost as "every call takes the full
`LOG_FLUSH_TIMEOUT_MS` (2 s)". But the one production caller is the `uncaughtException` guard, and it races
the sink's promise against `UNCAUGHT_FLUSH_CAP_MS = 1500` and then calls `exit(1)`. So on the path the
paragraph defends:

- the full 2 s never happens;
- a writer's held line that settles between 1.5 s and 2 s is still lost;
- with a link that never settles, `#settleChains` uses the guard's whole window. The fatal entry reaches the
  transport only through the 50 ms tick, never through flush's own pump, and its write callback is never
  awaited.

The behaviour is defensible. The doc overstates both the cost and the protection.
**Fix:** Add one sentence: "On the fatal path the guard's own 1.5 s cap (`processGuards.ts`
`UNCAUGHT_FLUSH_CAP_MS`) ends the wait first, so held lines that settle after 1.5 s are lost there." To make
the protection match the doc instead, align the two bounds, but that is outside these four files.

---

_Reviewed: 2026-11-22T04:21:59Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
