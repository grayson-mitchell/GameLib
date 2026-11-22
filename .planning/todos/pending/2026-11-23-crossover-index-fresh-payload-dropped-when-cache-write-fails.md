---
created: 2026-11-23T04:00:00.000Z
title: "CrossOver index: a validated fresh payload is dropped when the cache write fails"
area: info
files:
  - src-tauri/crates/gamelib-info/src/crossover/fetcher.rs (refresh, Failure::Store)
  - src/backend/crossover_index/fetcher.ts (loadIndex: the store write sits inside the try)
severity: minor
platform: any
ready: code
---

## Problem

In the TS `loadIndex`, the `crossoverIndexStore.set(...)` of a freshly fetched, validated payload is inside the
same `try` as the request. If the write throws (a disk error, a store file that is not writable), the `catch` runs:
it logs "Index refresh failed, keeping last good", records the failure for the back-off and returns the STALE cached
copy, or the bundled snapshot, even though a good, newer payload is in hand.

Phase 86 (86-19, D-03) copied that into `gamelib-info` `crossover::fetcher::refresh`: a failed write is
`Failure::Store`, the payload is discarded, the 5 minute back-off starts and the caller gets the last good copy.

## Why it is parked

A cache that cannot be written is already a broken profile (the store host refuses a read-only store silently, so
this needs a real I/O error), the stale copy is at most a day behind, and the next call after the back-off retries.
The effect is a slightly older rating for a few minutes, never a wrong one.

## If it ever matters

Return the fresh payload from `refresh` even when `write_cached` fails (log the write failure, skip the back-off) and
pin it with a test that makes the cache file unwritable.
