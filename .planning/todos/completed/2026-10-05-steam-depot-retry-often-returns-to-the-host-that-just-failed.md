---
created: 2026-10-05T00:00:00.000Z
title: "Steam depot chunk retry (attempt 1) often picks the same host attempt 0 just failed on"
area: steam
severity: medium
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 25"
files:
  - src/backend/storeManagers/steam/depot/hostHealth.ts:428-431
---

## Problem

Attempt 0 uses `healthy[slot % N]`; retries use `ordered[attemptIndex % len]`, ignoring the slot.
When `slot % N == 1`, attempt 0 picks the rank-1 host; one failure barely moves a well-established
host's score, so attempt 1 (`ordered[1]`) is usually the same host. With 2 hosts it is certain.

## Failure scenario

About 1 in N workers spends a second 15s timeout plus backoff on the host that just failed.

## Suggested fix

Offset retries by the attempt-0 index, or exclude the previously tried host. Fix together with
`2026-10-05-steam-depot-host-fanout-collapses-for-single-chunk-files.md`, which touches the same
selector.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

**Mechanism confirmed, fixed** (fixed alongside, but committed separately from,
`2026-10-05-steam-depot-host-fanout-collapses-for-single-chunk-files.md`).
`HostHealthTracker.pickHost` takes a new optional 5th argument, `previousHost`. On a retry
(`attemptIndex > 0`) with another candidate available, that host is excluded and the retry
rotates through the remaining ordered hosts (`others[(attemptIndex - 1) % others.length]`).
`fetchChunk` records the host of each attempt and passes it to the next one. Excluding the
previous host was chosen over "offset by the attempt-0 index", because a failing host that
drops exactly one rank would land on the offset index and be retried anyway. Callers that
omit `previousHost` (every pre-existing hostHealth test) keep `ordered[attemptIndex % len]`.
A single-host pool still returns that host.

**RED** (`depotPrimitives.test.ts`, `fetchChunk › with a HostHealthTracker`, new `it.each`):
`workerSlot = 1` against a warm tracker sends attempt 0 to the rank-1 host, which rejects
`ECONNRESET`; the other host serves the chunk; `attempts = 2`. On the unfixed tree both cases
failed with `chunk deadbeef failed after 2 attempts: ECONNRESET`: both attempts went to the
failing host, in the 2-host case (certain, as the todo says) and in a 3-host case with a
well-established rank-1 host (100 samples, latencies 50/1000/5000 ms).

**GREEN:** both pass. A new `hostHealth.test.ts` case pins the rotation (b → a, c, d, a) and
the 2-host alternation. `hostHealth.test.ts` + `depotPrimitives.test.ts` + `depot.test.ts`:
307/307.

**Not verified:** no live download run — the change in retry success rate on a real CDN pool
is unmeasured.

**Bookkeeping note:** this todo existed only as an uncommitted file in the main checkout's
`pending/`; it was added to this branch directly under `completed/`, so the `pending/` copy
there still has to be deleted when this branch lands.
