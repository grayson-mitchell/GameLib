---
created: 2026-11-21T02:10:00.000Z
title: bootstrap.test.ts legacy-zoom cleanup waits by turn count and fails under full-suite load
area: tests
severity: minor
platform: any
ready: code
files:
  - src/backend/sidecar/__tests__/bootstrap.test.ts
---

## Problem

`register-handlers boot step > legacy-zoom cleanup removes seeded data under ctx.paths.userData`
(bootstrap.test.ts:649) waits for a real fs removal with `for (turn < 50 && existsSync(seeded))
await setImmediate`. It failed in the full local `pnpm test` run on 2026-11-21 (Expected false,
received true) and passes in isolation. Same shape as G-82-2-r2 (fixed in 82-20 for
sharedRedistInstall.test.ts): a turn count is not a time bound, so real fs I/O can outlast it
under load.

Other candidates of the same shape the 82-20 planner listed: steam games.test.ts:18256,
playAdoption.test.ts:288, outboundHttpRegistry.test.ts:38 and :161, humble library.test.ts:659.

## Solution

Bound the wait by real wall-clock time (as 82-20's `yieldUntil` does, with the clock captured
before any fake timers install), and sweep the listed siblings in the same change.

## Resolved by quick 261121-p6z

Resolved by quick 261121-p6z: 1ffdec537 (bootstrap legacy-zoom wait on a real-time yieldUntil, plus a slowed-rm regression test), ded4cd2b8 (sharedRedistInstall and steamBridgeKnownFixes import it, local copies deleted). `yieldUntil` now lives in `src/backend/testUtils/yieldUntil.ts`.

Siblings checked and dropped:

- `games.test.ts` G8 (`startSpy.mock.calls.length` loop, now near line 18369): the Linux launch reaches `startSteamLaunchWatch` through microtasks only, which settle in a fixed number of turns whatever the load. The trailing 5-turn loop is a negative probe. Left unmodified, which also keeps the user's uncommitted edits there safe.
- `playAdoption.test.ts:288`: same shape, harness fully in memory (scripted runner, fake rust invoke, microtask clock). No real I/O.
- `outboundHttpRegistry.test.ts:38` and `:161`: poll with real `setTimeout(5)` sleeps (at least 500 ms real time), and `http.client.request.start` is published a microtask after `http.get`, before any socket I/O.
- `humble/__tests__/library.test.ts:659`: drives waves of mocked `getOrderDetail` promises, then one setImmediate flush each. No real I/O.
