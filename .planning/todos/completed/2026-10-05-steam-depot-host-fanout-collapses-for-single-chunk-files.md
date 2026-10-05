---
created: 2026-10-05T00:00:00.000Z
title: "Phase 25 host fan-out collapses to a subset of hosts for single-chunk files when the healthy-host count is even"
area: steam
severity: major
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 25"
files:
  - src/backend/storeManagers/steam/depot.ts:1447
  - src/backend/storeManagers/steam/depot.ts:970
  - src/backend/storeManagers/steam/depot/hostHealth.ts:428-431
---

## Problem

The first-attempt slot is `fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot` (`depot.ts:1447`,
`CHUNK_CONCURRENCY = 4`), and attempt 0 picks `healthy[workerSlot % N]` (`hostHealth.ts:429`). A
single-chunk file has one chunk worker, so `chunkWorkerSlot = 0` and the slot is always a multiple
of 4. `4f mod N` reaches only:

| healthy N | host indices that get first attempts |
|---|---|
| 2 | {0} |
| 4 | {0} |
| 6 | {0, 2, 4} |
| 8 | {0, 4} |

(Computed, not measured live.)

## Failure scenario

The code's own comments say most files are single-chunk. With the typical 6-host directory half
the healthy hosts never get a first attempt; with 2 or 4 healthy hosts every first attempt goes to
host 0 — the concentration Phase 25 set out to remove.

## Suggested fix

- Use a slot that is coprime with N, e.g. `chunkWorkerSlot * FILE_CONCURRENCY + fileWorkerSlot`.
  Better: have the tracker round-robin first attempts with its own counter.
- Add a test with even N and single-chunk files.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). The orchestrating session re-checked the cited lines itself and the mechanism holds. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

**Mechanism confirmed, fixed.** The slot `downloadFileChunks` forwards into `fetchChunk`
(and from there into `HostHealthTracker.pickHost`'s `workerSlot`) is now
`chunkWorkerSlot * FILE_CONCURRENCY + fileWorkerSlot` — the file-pool slot is the low-order
term. A single-chunk file's slot is now just its `fileWorkerSlot` (0..31), which covers every
residue mod any `N <= TOP_N_FANOUT`; every (file, chunk) pair still maps to a distinct integer
because `fileWorkerSlot < FILE_CONCURRENCY`. `hostHealth.ts` is unchanged by this fix —
`healthy[slot % N]` is fine once the slot it receives is not always a multiple of 4. The
tracker-owned round-robin counter alternative was not taken: it would discard `workerSlot` and
break the `healthy[workerSlot % N]` contract the existing hostHealth tests pin.

**RED** (`depot.test.ts`, new `downloadFileChunks: first-attempt host fan-out for single-chunk
files`, `it.each([2, 4, 6])`): a warm, all-healthy, score-differentiated `HostHealthTracker`
(so the composite sort discards the seed rotation and `workerSlot` alone decides attempt 0);
one single-chunk file per file-pool slot `0..N-1`; the `fetchChunk` mock resolves attempt 0's
host through the real `pickHost` with the forwarded `workerSlot`. On the unfixed tree all three
failed, reaching exactly the todo's computed table: N=2 → `[host-0]`, N=4 → `[host-0]`,
N=6 → `[host-0, host-2, host-4]`.

**GREEN:** all three pass; full `depot.test.ts` 205/205.

**Not verified:** no live download run on any OS — the per-host spread against a real
content-server directory (the `hosts=` count in the chunk-stream stats line) is unmeasured.

**Bookkeeping note:** this todo existed only as an uncommitted file in the main checkout's
`pending/`; it was added to this branch directly under `completed/`, so the main checkout's
`pending/` copy still has to be deleted when this branch lands.
