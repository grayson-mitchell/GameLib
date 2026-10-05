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
