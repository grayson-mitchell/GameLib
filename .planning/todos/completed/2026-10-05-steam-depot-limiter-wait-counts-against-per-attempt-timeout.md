---
created: 2026-10-05T00:00:00.000Z
title: "Chunk fetch timeout is armed before the limiter wait — queue time is recorded as a host timeout and demotes healthy hosts on slow links"
area: steam
severity: major
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 25"
files:
  - src/backend/storeManagers/steam/depot/decompress.ts:1014
  - src/backend/storeManagers/steam/depot/decompress.ts:1098
---

## Problem

`CHUNK_FETCH_TIMEOUT_MS` (15s) is armed at `decompress.ts:1014`, before `cdnAuth.getToken` (up to
3s) and before the FIFO `await limiter.acquire()` at `:1098`. Up to 128 chunk workers share 32 slots,
so a waiter sits behind roughly three rounds of fetches.

## Failure scenario

On a link of roughly 20 Mbit/s or less each fetch takes ~5s+, so the queue wait passes 15s. `fetch`
is then called with an already-aborted signal and fails at once with `AbortError`, recorded as
`hostHealth.record(host, 'timeout')` for a host that was never contacted. Five in a row demote a
healthy host; host-health data becomes noise.

## Suggested fix

Arm the timeout (or create the AbortController) after `acquire()`, and keep queue wait out of
`hostHealth` and `onAttempt` timing.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

**Mechanism confirmed, fixed.** In `fetchChunk` (`depot/decompress.ts`) the per-attempt
`CHUNK_FETCH_TIMEOUT_MS` timer is now armed, and the attempt's clock (`attemptStart`) reset,
immediately after `await limiter.acquire()` — i.e. at the request itself. The
`AbortController` and the external-cancel listener are still created at the top of the attempt,
so a cancel during the token fetch or the limiter wait still aborts the request. The timer is
still cleared in the same `finally`; it is the same bounded timer as before, now armed later —
no new referenced handle (sidecar exit contract). Side effect, deliberate: the `cdnAuth.getToken`
wait (bounded at 3s by its own timeout, and a CM call, not a content-server one) is now also
outside the host timeout and outside the `ms`/`netMs` values `hostHealth.record` and
`onAttempt` see. The no-limiter path adds no new `await`, so the synchronous
call-to-`fetch()` ordering the external-cancel tests rely on is unchanged.

**RED** (`depotPrimitives.test.ts`, `fetchChunk › with a HostHealthTracker`, new test, fake
timers): `InflightLimiter(1)` with its only slot already held; `fetchChunk` queues behind it;
fake time advances `CHUNK_FETCH_TIMEOUT_MS + 5000`; then the slot is released. The `fetch` mock
rejects with `AbortError` on an already-aborted signal, as real `fetch` does. On the unfixed
tree: `chunk deadbeef failed after 1 attempts: This operation was aborted` — the queue wait had
already fired the timeout, and the host was recorded as a timeout without being contacted.

**GREEN:** the chunk succeeds; `onAttempt` reports `[{ outcome: 'success', ms: 0 }]`; the
host's snapshot has `consecutiveFailures: 0`, `avgMs: 0`. All 38 suites under
`src/backend/storeManagers/steam/__tests__`: 1475 passed, 1 skipped.

**Not verified:** no live run on a slow (~20 Mbit/s or less) link. The claim that host-health
data stops filling with phantom timeouts there is reasoned from the mechanism, not measured.

**Bookkeeping note:** this todo existed only as an uncommitted file in the main checkout's
`pending/`; it was added to this branch directly under `completed/`, so the `pending/` copy
there still has to be deleted when this branch lands.
