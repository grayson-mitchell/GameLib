---
phase: 84-logger
reviewed: 2026-11-22T04:40:44Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/backend/logger/index.ts
  - src/backend/logger/__tests__/forwarder.test.ts
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
  necessity: 0
status: issues_found
---

# Phase 84: Code Review Report (round 6)

**Reviewed:** 2026-11-22T04:40:44Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Round 6 reviews the three round-5 fix commits: 2a3d6d6ed (WR-13, new tests in `forwarder.test.ts`),
d69f19327 (IN-14, a doc paragraph in `index.ts`) and d3cdf6944 (IN-13, a doc paragraph in `index.ts`). The
diff is `git diff db27f0ad7 d3cdf6944 -- src/backend/logger`. `forwarder.ts` was read as context only and
has not changed. `sidecar/processGuards.ts`, `sidecar/bootstrap.ts:1540-1544` and `meta/logSecretGate.ts`
were read only, to check the doc claims. Nothing else in the tree was reviewed. No source file was edited.

**How this was verified:**

- `npx jest src/backend/logger`: 6 suites, 129 tests, all pass. `forwarder.test.ts` also passes under
  `--randomize` with seeds 1 to 5 (37/37 each time).
- `prettier --check` on the two files: clean. `eslint`: only the existing `require-await` warning on
  `createGameLogWriter`. It is now at `index.ts:186` because the new doc lines moved it down; these commits
  did not change it.
- Mutation probes ran on a scratch copy of `src/backend/logger`, using a separate jest config in the session
  scratchpad. The baseline there has one failure, the `paths.rs` parity test, because its fixture path is
  relative (same as round 5). Each mutation was run against the WR-11, WR-12 and WR-13 tests:

| Mutation in `flush` (`forwarder.ts:431-448`) | WR-11 | WR-12 | WR-13 total | WR-13 step-back |
| --- | --- | --- | --- | --- |
| `left = this.#flushTimeoutMs` (the round-5 probe) | pass | pass | **fail** | **fail** |
| Transport leg on the wall clock (`wallDeadline - Date.now()`) | pass | pass | pass | **fail** |
| Transport wait removed (`return` after `#pump`) | **fail** | pass | **fail** | **fail** |
| `#isIdle()` ignores `#inFlight` | **fail** | pass | **fail** | **fail** |
| `left + 10` | pass | pass | **fail** | **fail** |
| `left - 10` | pass | pass | **fail** | **fail** |

**WR-13 is closed.** The two new tests prove what they claim:

- The fixture really reaches the transport wait. `bind` comes before `enqueue`, so the 50 ms tick sends
  the frame, and with `autoWritten = false` `#inFlight` stays at 1. The `#isIdle` mutation above confirms
  the tests depend on that held write.
- The bound is tight on both sides. The `±10 ms` mutations fail, and the 1,999 / 2,001 ms checks bracket
  the exact 2,000 ms deadline: the link settles at 1,500, and `left` is 500.
- The step-back variant is the only test that pins the transport leg to the monotonic clock. The fixer's
  reason for stepping inside the chain wait, not inside the transport wait, is correct. A step after the
  transport timer is armed cannot change a `setTimeout` delay.
- Jest 29's `setSystemTime` shifts each pending timer's `callAt` by the same difference, and offsets
  `performance.now()` through `adjustedSystemTime`. So the step is deterministic and leaves the monotonic
  deadline alone. That matches the round-5 finding.
- Nothing leaks. Each test builds its own `LogForwarder`, and no module state is involved. The held write
  callback and pending fake timers are dropped by the describe-level `afterEach(jest.useRealTimers)`, and
  `beforeEach` reinstalls a fixed `now`. A regression fails at the synchronous `expect` before
  `await flushing`, so it cannot hang the test.

**IN-13 is closed.** The only non-test references to `logInfoSettled` are its definition, the
`trackLogSettle` doc, the export, and `meta/logSecretGate.ts:74`. There it is named in the vocabulary doc,
and `LOG_FUNCTION_RE`'s `(Settled)?` matches it. "No production caller today" is accurate.

**IN-14 is mostly accurate:**

- `UNCAUGHT_FLUSH_CAP_MS = 1500` (`processGuards.ts:102`).
- The guard races `Promise.allSettled(writes)`, which holds the stderr write and the sink's promise,
  against an unref'd cap, and then calls `exit(1)` (`processGuards.ts:340-371`).
- The one sink is `logErrorSettled` (`bootstrap.ts:1542-1544`).
- So "the full 2 s never happens there" and "held lines that settle after 1.5 s are lost" are correct.

The last clause holds only for one kind of never-settling link (IN-15).

Earlier fixed items (WR-06, WR-09, WR-11, WR-12, IN-11, IN-12) are not regressed: `forwarder.ts` has not
changed, and `index.ts` changed only in doc comments.

## Info

### IN-15: The IN-14 sentence says the fatal entry still reaches stdout with "a link that never settles", but that holds only for a target writer's link, not the forwarder's own general chain

**File:** `src/backend/logger/index.ts:66-70` (compare `forwarder.ts:315-331` and `:458-479`)
**Issue:** The new paragraph says "with a link that never settles the chain wait uses the guard's whole
window: the fatal entry then reaches stdout only through the 50 ms tick". `#settleChains` waits on two kinds
of link:

- `#writerLinks` (`trackSettle`, a game or runner writer's held message);
- the forwarder's own `#chains`, one per target, which includes the general target.

The sentence is true for the first kind. It is false for a never-settling link on the **general** chain.
`logErrorSettled` calls `logGeneral`, which runs `logLine` on `{ kind: 'general' }`. When
`#chains.get('general')` has a tail, the fatal line is chained behind it (`forwarder.ts:316-327`). It is
never enqueued, so no tick can send it, and it is lost.

A scratch probe through `index.ts` with fake timers shows this:

- `logError(['held', new Promise(() => undefined)])`, then `logErrorSettled('FATAL')`: no message has
  reached the transport at 1,500 ms, the guard's cap.
- `trackLogSettle(new Promise(() => undefined))`, then `logErrorSettled('FATAL')`: nothing has reached the
  transport at 49 ms, and `["FATAL"]` has by 50 ms. This matches the doc.

The paragraph before it talks about target writers' held lines, so a careful reader may scope "a link" to
those. But the sentence does not say so. On the general-chain case it states a delivery guarantee that the
code does not give, and that case is exactly the one where the fatal entry is lost. Severity is Info: this is
a doc defect, and the behaviour (per-target ordering behind a held message) is deliberate. It is not changed
here.
**Fix:** Scope the clause and state the other case, for example:
```ts
 * happens there, held lines that settle after 1.5 s are lost there, and with a target writer's link
 * that never settles (`trackLogSettle`) the chain wait uses the guard's whole window: the fatal entry
 * then reaches stdout only through the 50 ms tick, and its write callback is never awaited. A
 * general-log Promise message that never settles is worse: the fatal entry is chained behind it on
 * the general target, so it never reaches stdout at all (IN-14, IN-15).
```

---

_Reviewed: 2026-11-22T04:40:44Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
