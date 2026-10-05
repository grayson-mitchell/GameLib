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
