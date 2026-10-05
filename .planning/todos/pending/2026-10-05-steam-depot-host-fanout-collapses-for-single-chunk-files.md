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
