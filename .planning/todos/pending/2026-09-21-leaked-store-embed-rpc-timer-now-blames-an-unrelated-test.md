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

## What is NOT known, stated plainly

- **Which test issues the unanswered `store_embed_*` RPC is not identified here.** The recorded
  note says "some test issues `rustInvoke('store_embed_open')` without a responding sidecar and
  nothing cancels the 60s rejection timer", and names `storeEmbedFlows.test.ts` /
  `storeEmbedWireContract.test.ts` as the suites to look at -- but **running those two alone does
  NOT reproduce the crash** (62 tests, 2 suites, clean), because the process exits long before 60s
  elapses. Do not conclude from a clean isolated run that those suites are innocent.
- **Whether the three channels (`open`/`set_bounds`/`navigate`) leak from one call site or three is
  not established.** Three separate timeouts fired in the same window.
- This todo does **not** propose a fix. The plausible shapes -- cancel the rejection timer on
  teardown, `unref()` it, or stub the transport so the RPC is answered -- have not been evaluated
  against `sidecarRpc.ts:339`, and picking one from the armchair is how this repo's recorded
  "sound measurement, wrong remedy" pattern happens.

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
