---
created: 2026-10-05T00:00:00.000Z
title: "Steam depot minor defects: abort listeners leak in retry backoff, failed HTTP bodies never cancelled, fake profile reused across two binary runs"
area: steam
severity: minor
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 25"
files:
  - src/backend/storeManagers/steam/depot/decompress.ts:359
  - src/backend/storeManagers/steam/depot/decompress.ts:1108
  - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts:189
---

## Problem

1. **Abort listeners accumulate** (`decompress.ts:359`, `sleepAbortable`): the `'abort'` listener is
   removed only if the signal fires. A long run with many retries piles closures onto the run-wide
   AbortSignal and triggers MaxListenersExceededWarning.
2. **Failed responses never read or cancelled** (`decompress.ts:1108`, `!res.ok`): under undici the
   connection stays tied up until GC; a host returning many 4xx/5xx builds up idle sockets.
3. **Fake-HOME profile reused** (`lzmaNativeSeaRealBuild.test.ts:189`): one profile from `beforeAll`
   is shared by the two live tests (lines 214 and 302). CLAUDE.md's two-profile rule says "Fresh
   profile per invocation, always" unless reuse is justified at the call site; it isn't.

## Failure scenario

See each item.

## Suggested fix

1. `removeEventListener` in the timer callback.
2. `await res.body?.cancel()` before throwing.
3. Create a profile per test, or justify the reuse at the call site.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
