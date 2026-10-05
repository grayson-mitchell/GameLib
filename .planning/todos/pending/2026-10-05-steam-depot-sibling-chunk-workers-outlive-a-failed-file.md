---
created: 2026-10-05T00:00:00.000Z
title: "When one chunk of a multi-chunk file fails, its sibling chunk workers keep re-downloading indefinitely after the file handle closes"
area: steam
severity: major
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 25"
files:
  - src/backend/storeManagers/steam/depot.ts:1485-1499
  - src/backend/storeManagers/steam/depot.ts:1687
  - src/backend/storeManagers/steam/depot/decompressPool.ts:778-783
---

## Problem

When one chunk worker throws a decode-stage error (or the stall error), `Promise.all` rejects and
`downloadSingleFile`'s `finally` closes `fd`. Sibling workers are never stopped: each fetches and
decodes its next chunk, then `fd.write` fails on the closed handle. That error isn't decode-stage,
so the chunk is requeued and fetched again, indefinitely.

`DecompressPool.shutdown()` (`decompressPool.ts:778-783`) clears pending timers and queued tasks
without rejecting them, so an outstanding `decode()` never settles — today that only bites these
orphans.

## Failure scenario

One corrupt chunk (sha1/size mismatch — the case cycle 16 recorded) in a multi-chunk file leaves up
to 3 orphan workers re-downloading for the rest of the run, using limiter slots and decode capacity.
Other files keep resetting the stall tracker, so nothing stops them. After the run returns they keep
making network requests until 3 minutes pass with no progress (in-flight work outliving its owner —
half 2 of the sidecar exit contract), or hang forever on the cleared pool.

## Suggested fix

- Give each file its own AbortController (or `failed` flag) that every worker checks; abort it on
  the first throw and `await Promise.allSettled` before `fd.close()`.
- Make a write error on a closed handle fatal, not requeued.
- Make `DecompressPool.shutdown()` reject each outstanding task with a `decompress_pool_shutdown` error.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
