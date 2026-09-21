---
created: 2026-09-21T00:00:00.000Z
title: "The leaked store_embed rustInvoke timer now blames a NAMED unrelated test -- test:ci misattributes a Humble security failure"
area: testing
severity: major
platform: any
ready: code
found_by: "quick-260921-saw"
files:
  - src/backend/sidecar/sidecarRpc.ts
  - src/backend/sidecar/__tests__/storeEmbedFlows.test.ts
  - src/backend/sidecar/__tests__/storeEmbedWireContract.test.ts
  - src/backend/humble/__tests__/library.test.ts
---

## What changed, and why it is worse than the recorded behaviour

The leaked 60s `rustInvoke` rejection timer behind `pnpm test:ci`'s intermittent `exit 1` is
already known. **Its failure SHAPE has changed, and the new shape actively accuses innocent code.**

**Recorded behaviour (2026-09-06, `97a9fdca8`).** `exit 1` with **zero** failing tests: no `FAIL`
line, no `Tests:` summary, the process dying *after* a green per-project summary printed. The
documented way to recognise it was "read the tail for an uncaught `Error:` after the last `Tests:`
line".

**Measured 2026-09-21 at `c20a46bbb`.** Every one of those recognition cues is now absent:

```
FAIL Backend src/backend/humble/__tests__/library.test.ts
  ● HumbleLibrary › sync() -- 14-08 gap closure: ownership-overlay integrity at commit time
    (Fix 1) › C2 mid-sync security (T-14-03): a reveal on a key whose order was just
    re-committed mid-sync is still owned_blocked -- never reads a transiently-false
    ownedElsewhere

    rustInvoke timed out after 60000ms: store_embed_open
    rustInvoke timed out after 60000ms: store_embed_set_bounds
    rustInvoke timed out after 60000ms: store_embed_navigate
        at Timeout._onTimeout (src/backend/sidecar/sidecarRpc.ts:339:24)

Test Suites: 1 failed, 438 passed, 439 total
Tests:       1 failed, 2 skipped, 8855 passed, 8858 total
```

There **is** a `FAIL` line. There **is** a `Tests:` summary. The error sits at output line ~264,
roughly **350 lines BEFORE** the summary at line 621 -- not after it.

## Why this is the dangerous part

The test it names is a **Humble ownership-overlay security assertion** (`T-14-03`, "a reveal on a
key whose order was just re-committed mid-sync is still `owned_blocked`"). A reader who trusts the
failure name concludes they have broken key-ownership security in the Humble store manager. That is
false, and it is a far more expensive wrong conclusion than the original "exit 1, nothing failed",
which at least announced itself as inexplicable.

**Proof it is a bystander:** `src/backend/humble/__tests__/library.test.ts` run alone is
**141/141 PASS**. Nothing in that suite touches `store_embed_*`.

## Run-to-run variance is real -- neither reading is evidence

On the SAME commit `c20a46bbb`, minutes apart:

| run | result |
| --- | --- |
| executor's `pnpm test:ci` | exit 0, `Test Suites: 439 passed, 439 total`, `Tests: 2 skipped, 8856 passed, 8858 total` |
| orchestrator's `pnpm test:ci` | exit 1, `1 failed, 438 passed`, the output above |

Both are real. The leak's visibility is **duration-dependent** -- whether the 60s timer fires
before the process exits depends on total run length, so which suite is executing when it lands is
effectively arbitrary. Consequence: **a green `test:ci` on this defect proves nothing, and a red
one attributes nothing.**

## The discriminator to use instead

The old cue ("error after the last `Tests:` line") is now WRONG and must not be relied on.

```
grep -n 'rustInvoke timed out' <test:ci output>
```

If `store_embed_open` / `store_embed_set_bounds` / `store_embed_navigate` appears **anywhere** in
the log, the named failing test is a bystander. Confirm by re-running that suite alone; a pass in
isolation plus a `rustInvoke timed out` in the full log is the signature.

## Resolved

Fixed by quick task `260921-thi` (2026-09-21). All three of this todo's "not known" questions are
now answered; this section replaces that one rather than appending a note that would contradict
it.

- **Which test issues the unanswered RPC (was "not identified"): three `void`-ed sites in
  `storeEmbedWireContract.test.ts`** (lines 83/102/120 at `c10fd00a5`), which were the only
  `void`-ed rustInvoke sites in the repo. The todo's warning that running the two obvious suites
  alone does not reproduce (E6) was correct, and here is why: the process exits long before the
  60s mark, so reproduction needs **jest fake timers**, not a bigger run -- confirmed by this
  fix's own Leg A regression test, which reproduces the timeout deterministically via
  `jest.advanceTimersByTime(60_000)`.
- **One call site or three (was "not established"): three**, one per channel
  (`store_embed_open` / `store_embed_set_bounds` / `store_embed_navigate`). This settles the
  question the todo left open.
- **The attribution mechanism (new -- the part this todo never had):**
  `process.on('unhandledRejection')` sees **ZERO**. Jest intercepts the rejection and attributes
  it to whichever test is executing when the 60s timer fires. This is what makes both historical
  shapes ("exit 1 with zero failing tests" and "a named `FAIL`") one defect: which reading you get
  depends only on whether a test happened to be mid-flight at the 60s mark. It is also why no
  `unhandledRejection`-listener gate could ever have caught this -- the fix's own regression gate
  had to assert a *positive* claim (a handler received the exact Error) instead.
- **Production was never affected.** Every `requestRustInvoke` in `storeEmbedFlowRegistration.ts`
  is awaited (lines 193, 209, 221, 230, 239, 252, 263, 269). This was a test-only defect and
  `sidecarRpc.ts` was not changed by the fix.
- **The fix and the gate (was "does not propose a fix"):** the three sites now route through a
  named helper, `fireWithNoRustPeer`, which records each call's settlement instead of discarding
  it; a two-leg regression gate beside them in the same file is mutation-proven (restoring a
  `void`-ed site reds the source-shape leg while the behavioural leg stays green; stripping the
  helper's handler reds the behavioural leg and reproduces the exact leaked diagnostic inside the
  gate). Of the three shapes this todo left unevaluated, `unref()` was the wrong one: the timer
  was **already** `unref()`-ed at `sidecarRpc.ts:392`, and `unref()` governs event-loop retention,
  not rejection handling -- it does not touch whether a rejection has a handler.
- **Second instance of a known class.** `appShellFlowRegistration.ts:585-600` carries a
  `sidecar-init-rustinvoke-leak` comment describing the identical failure mode from a different
  call site -- an assertion settling before a test drained its own pending rustInvoke calls,
  leaving a real timer to reject into a later, unrelated suite. That one was fixed by
  `skipInitialTraySync`; this is the same class, a different call site.

## This is NOT the F-9 todo, and must not be filed there

`.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md` tracks a
**different** question and was checked against this finding before this file was written:

| | F-9 | this |
| --- | --- | --- |
| question | does the LIVE app's RPC abandonment co-occur with a cookie operation? | why does a jest-only leaked timer misattribute a failure? |
| diagnostic | `invoke abandoned` / `unknown/timed-out` (Rust shell side) | `rustInvoke timed out after …ms: <channel>` (`sidecarRpc.ts`, sidecar side) |
| source read | `~/Library/Logs/GameLib/gamelib-shell.log` | jest stdout |
| channels | `humble_login_cookies*` | `store_embed_*` |

`sidecarRpc.ts` never writes `gamelib-shell.log` (verified), so F-9's unpark grep cannot see this
event and this event cannot satisfy F-9's unpark condition. They share only the substring
`timed out`. A cross-reference note has been added to F-9 saying exactly this, so a reader running
its unpark grep does not mistake one for the other.

## Why `severity: major`

Not because CI is red -- because **the measurement is silently contaminated**. `pnpm test:ci`
currently reports a false, specific, security-flavoured accusation against code that is fine, on a
run-to-run coin flip. Per the severity vocabulary in `CLAUDE.md`, "a measurement is silently
contaminated" is `major`.

`ready: code` -- identifying the leaking call site and bounding the timer is desk work against
`sidecarRpc.ts` and the store-embed suites; it needs no live app run and no second OS. The one trap
is that the smallest reproduction does not reproduce, so the investigation has to run the whole
Backend project, not the two obvious suites.
