---
phase: 84-logger
reviewed: 2026-11-22T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/backend/logger/forwarder.ts
  - src/backend/logger/index.ts
  - src/backend/logger/targetWriter.ts
  - src/backend/logger/__tests__/targetWriter.test.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
  necessity: 0
status: issues_found
---

# Phase 84: Code Review Report (round 4)

**Reviewed:** 2026-11-22
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Round 4 reviews the two round-3 fix commits, 61cffefff (WR-09) and 349975ff0 (WR-10), as
`git diff dc0ce5d53 349975ff0 -- src/backend/logger`. The four files have not changed since 349975ff0.
Phase 85's files and the concurrent session's uncommitted files were left out of scope.
Verification: `npx jest src/backend/logger/__tests__/targetWriter.test.ts src/backend/logger/__tests__/forwarder.test.ts`
(2 suites, 55 tests pass). I also ran two throwaway probes against an esbuild bundle of `forwarder.ts` in the
session scratchpad. No source file was touched.

**WR-10 is closed.** `#logBase` reads the clock once (`targetWriter.ts:164`), after the rotation claim and before
any chaining. It passes that `at` on all three paths: direct (`:171`), queued behind a pending link (`:175`), and
the Promise body itself (`:189`). `LogForwarder.logLine` uses `at ?? Date.now()` and derives `tz` from that same
`ts` (`forwarder.ts:303-304`). A line that then waits in the forwarder's own `#chains` (another source holding a
Promise on the same target key) keeps the stamp too, because `ts`/`tz` are captured before `emit` closes over
them. I probed the tz half directly with `TZ=America/New_York`, `at` = 01:59:50 EDT and enqueue at 01:00:20 EST.
The entry carried `tz: -240`, the call-time offset, not the settle-time `-300`. The implementation is right. The
test does not prove the tz half (IN-12).

**WR-09 is closed on the paths the writer actually uses.** `#extend` registers each new `#tail`
(`targetWriter.ts:136-138`). The tail is `link.then(done, done)`, so it never rejects. `trackSettle` removes it on
settle, and its drop handler is attached before any `Promise.all` in `#settleChains` subscribes, so a snapshot's
links are gone from the Set before the loop re-checks `size`. Settled links do not leak. A link registered during
a flush (including a `#chains` entry created when a writer's held line reaches `logLine` behind another source's
chain) is picked up on the next loop pass. A never-settling link is cut off by the single deadline, as the
fake-timer test shows. Concurrent flushes each snapshot independently and do not interfere.

Two edges of the changed `#settleChains` are not bounded the way its doc says. I reproduced both by probe
(WR-11, WR-12).

## Round-3 fix verification

- **WR-09 (61cffefff): closed for writer-held links, with WR-11 and WR-12 as latent edges of the widened wait.**
  The three new tests would fail without the fix. Tests 1 and 2 would see `flushing` settle within five
  macrotask turns, and test 3 would see `flushed` true at 1,999 ms. Test 3's "other writer's line is handed to
  the transport" is satisfied by the 50 ms tick timer during the wait, not by flush's own pump. That still
  matches the doc's claim.
- **WR-10 (349975ff0): closed.** Both new tests fail without the fix: `ts` would be 30 s and 20 s late.

## Warnings

### WR-11: One rejecting link makes `flush` stop waiting at once, for every other link and for the transport

**File:** `src/backend/logger/forwarder.ts:341-347` (contract), `:467-472` (wait), `:448-450` (swallow)
**Issue:** `trackSettle` is a public method, re-exported as `index.trackLogSettle`. Its doc invites rejecting
links: "a link that rejects is still dropped from the set". `#settleChains`, however, passes the raw links to
`Promise.all`. When one link rejects, `Promise.all` rejects, `await Promise.race(...)` throws out of
`#settleChains`, and `flush`'s `catch { /* Settling never rejects. */ }` returns. That skips both the wait on
every other pending link and the whole transport wait. Probe: a 1,500 ms link plus one that rejects at 20 ms,
then `flush()` returned after **21 ms**. Today's only caller (`#extend`) passes a tail that never rejects, so the
bug is latent. But nothing in the API stops the next caller (a direct `trackLogSettle(somePromise)`) from
silently reducing the fatal-exit flush to a no-op.
**Fix:** Normalise at registration so the Set only ever holds non-rejecting promises:
```ts
trackSettle(link: Promise<unknown>): void {
  const settled = link.then(
    () => undefined,
    () => undefined
  )
  this.#writerLinks.add(settled)
  void settled.then(() => {
    this.#writerLinks.delete(settled)
  })
}
```
Alternatively, use `Promise.allSettled([...])` in `#settleChains`. Add a forwarder test: a slow link plus a
rejecting link, and `flush` must not resolve before the slow one.

### WR-12: `#settleChains` has no clock-step-back clamp, so `flush` can wait far past `LOG_FLUSH_TIMEOUT_MS`

**File:** `src/backend/logger/forwarder.ts:459-463` (compare `:433-437`)
**Issue:** The deadline is wall-clock (`Date.now()`). The transport wait clamps itself with
`Math.min(this.#flushTimeoutMs, ...)` and says why: "never more than a full timeout (a clock step back)".
`#settleChains` computes `left = deadline - Date.now()` with no such clamp. If the wall clock steps back during a
flush (an NTP correction, a manual time change, a VM resume), `left` grows by the size of the step, and the
chain-wait timer is armed for that long. Probe: one never-settling link, `Date.now` stepped back 60 s after
`flush` took its deadline, and `flush()` was **still pending after 5,000 ms** (the bound is 2,000). The doc says
the fatal `uncaughtException` guard "must not hang". The function body is from round 2 (WR-06), but WR-09 makes
this wait run whenever any writer holds a Promise message or a write queued behind one. Before, it ran only for
the forwarder's own Promise chains.
**Fix:** Take the deadline from a monotonic clock in both `flush` and `#settleChains` (`performance.now()`;
jest's modern fake timers fake it too). That makes both clamps unnecessary. At minimum, mirror the transport
wait's clamp:
```ts
const left = Math.min(this.#flushTimeoutMs, deadline - Date.now())
```
Add a test that steps the system time back mid-flush (`jest.setSystemTime`) with a never-settling link and asserts
the flush resolves within `LOG_FLUSH_TIMEOUT_MS` of fake time.

## Info

### IN-11: `logErrorSettled` / `logInfoSettled` now also wait on every writer's held Promise messages

**File:** `src/backend/logger/index.ts:62-80`, `:103-110`
**Issue:** `flush` is shared. It backs the fatal guard and `releaseOnStdinEof`, and also the two per-entry settle
helpers, documented as resolving "once the entry has been handed to stdout". Since WR-09, each call to those
helpers also waits, up to the full 2,000 ms, for any `LogWriter` anywhere holding a Promise message or a write
queued behind one. That now includes `writeString(promise)`, which `flush` never waited on before. After a writer
Promise that never settles, every later `*Settled` call costs the full 2 s for the rest of the process,
because that link and every write behind it stay in `#writerLinks`. The bound holds, so this is not a contract
break. But the `trackLogSettle` doc lists only the exit paths, and the latency coupling of an unrelated general
line to a game or runner writer's Promise is undocumented. I did not check the `*Settled` call sites (out of
scope), so the impact is unmeasured.
**Fix:** Either give the settle helpers a queue-only settle (pump and wait for the transport, skip
`#settleChains`), since their own entry is already queued synchronously, or document the coupling on
`trackLogSettle` and on `logErrorSettled` / `logInfoSettled`.

### IN-12: The WR-10 test's `tz` assertions cannot fail, because no offset change happens inside the window

**File:** `src/backend/logger/__tests__/targetWriter.test.ts` (WR-10 describe, first test: the `tz:` lines of both `toMatchObject` calls)
**Issue:** The test is titled "keep their call-time ts and tz". It runs on 2026-11-20 13:05 local time and
advances only 30 s, so `getTimezoneOffset()` is the same at call time and at settle time in any zone. A
regression that derived `tz` from the settle-time clock would still pass. Only the `ts` half proves anything. The
implementation is correct, as the DST probe in the Summary shows.
**Fix:** Pin a zone and straddle a transition. Set `process.env.TZ = 'America/New_York'` for the test (Node
re-reads it at runtime), use `now: Date.parse('2026-11-01T05:59:50Z')`, step 30 s past 06:00Z before release, and
assert `tz: -240`. Or drop "and tz" from the title.

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
