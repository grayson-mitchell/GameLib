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

## Resolution (2026-10-05)

**Mechanism confirmed, fixed — all three suggested parts.**

1. **Per-file cancel scope + settle before close** (`downloadFileChunks`, `depot.ts`). Each file
   gets its own `AbortController`. It follows the run's `signal` (listener removed when the
   function returns) and is aborted when any of the file's chunk workers throws. That signal
   replaces the run signal in the worker loop's checks and is what gets passed into
   `fetchChunk`, so a sibling's in-flight fetch is interrupted (as `ChunkFetchAbortedError`,
   which is never recorded against host health), and no sibling writes or takes another chunk.
   The workers are awaited with `Promise.allSettled`, and the first rejection is rethrown, so
   `downloadSingleFile`'s `finally { fd.close() }` only runs after every sibling has settled.
2. **Write failure is fatal.** `fd.write` (plus `onBytes`/`recordProgress`) now runs after the
   fetch `try/catch` rather than inside it. A write error (closed handle, ENOSPC, EIO) fails the
   file instead of re-queuing the chunk for another download.
3. **`DecompressPool.shutdown()`** rejects every in-flight and queued task with a
   `decompress_pool_shutdown`-coded error instead of silently dropping it.

No new timers or handles. This removes in-flight work that outlived its file and its run
(half 2 of the sidecar exit contract).

**RED** (all on the unfixed tree):
- `depot.test.ts` › `downloadFileChunks: a failed file stops its own sibling chunk workers`:
  8-chunk file, `sha-0` fails decode-stage (`unknown_container`), siblings take 20 ms. Failed
  with `inFlightAtReject` **3** (expected 0): the file rejected with three siblings still in
  flight.
- same block, closed-handle write test: with a never-stalling `StallTracker`, the call was
  still running after 200 ms (the endless write-fail/re-queue loop), instead of rejecting.
- `decompressPool.test.ts` › `shutdown() rejects every outstanding task`: one `__TEST_HANG__`
  task in flight on a 1-worker pool plus one queued; after `shutdown()` both were
  `"still pending"` 500 ms later.

**GREEN:** all three pass. The rejected error carries `code: 'EBADF'`; the pool tasks reject
with `decompress_pool_shutdown`. The existing Thread-A wiring test asserted that the run's
`signal` was forwarded to `fetchChunk` by identity. It now asserts behaviour instead: a run
cancel issued during the `fetchChunk` call aborts the signal that call was given. All 38 suites
under `src/backend/storeManagers/steam/__tests__`: 1478 passed, 1 skipped.

**Not verified:** no live run of a multi-chunk file with a corrupt chunk on any OS. The
file-level pool in `downloadDepotFiles` still uses `Promise.all`. That is unchanged, and its
workers contain no `throw` (per-file errors are caught and recorded as failures), so it cannot
orphan siblings the same way.

**Bookkeeping note:** this todo existed only as an uncommitted file in the main checkout's
`pending/`; it was added to this branch directly under `completed/`, so the `pending/` copy
there still has to be deleted when this branch lands.
