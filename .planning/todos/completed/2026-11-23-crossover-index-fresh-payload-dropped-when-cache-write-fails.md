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

## Resolution

Closed by quick 261123-9i7 (2026-11-23). Nothing pushed.

- `3a4d64220`: `crossover::fetcher::refresh` now logs a failed cache write as one fixed-text note and returns the validated payload, so `load_index` takes its success arm: the fresh copy is served, the stale copy is not, and no 5 minute back-off is armed. The write-failure `Failure` variant and its log line were removed because nothing produces them.
- Two tests, `a_failed_cache_write_still_serves_the_fresh_payload_over_a_stale_copy_and_arms_no_back_off` and `a_failed_cache_write_on_a_cold_profile_still_serves_the_fresh_payload`, force the write to fail through `StoreHost::with_writer` with an always-failing writer, not a read-only file: the store host refuses a read-only store silently, as the todo noted. They assert the fresh payload, `last_failure_ms()` None, the stored copy untouched, and the next load making a new request.
- The TS half needed nothing: `src/backend/crossover_index/fetcher.ts` (`loadIndex`) was deleted with the TS CrossOver slice in `fcf981590` (86-24), and `src/backend/info/crossover.ts` is a shim over `info_crossover_rating_map` with no store write.
- The trade-off, stated plainly. While a profile's cache stays unwritable, each load past the 24 hour TTL fetches again, because there is no back-off and nothing stored. That is the requested behavior. Loads are serialized by the CrossOver load lock, and each refetch logs the note to `gamelib.log`.
- This departs from Phase 86 D-03 parity for this quirk only, by request.
