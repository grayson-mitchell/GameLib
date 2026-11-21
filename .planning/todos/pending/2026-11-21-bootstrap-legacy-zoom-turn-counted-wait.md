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
