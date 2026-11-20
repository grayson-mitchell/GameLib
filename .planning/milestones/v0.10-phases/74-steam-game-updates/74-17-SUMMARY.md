---
phase: 74-steam-game-updates
plan: 17
subsystem: steam-depot
tags: [rust, depot, update-estimate, gap-closure, WR-02]
requires: []
provides:
  - Rust download estimate that credits old-manifest chunk SHAs
  - TS estimate that counts depots new in a build in download and disk peak
affects: [74-19]
tech-stack:
  added: []
  patterns: [estimate subtracts the same SHA set delta.rs OldIndex reuses]
key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-depot/src/manifest.rs
    - src-tauri/crates/gamelib-depot/tests/summarize_delta.rs
    - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts
key-decisions:
  - "changed_bytes (disk peak input) left unchanged; only max_download_bytes subtracts reusable chunks"
  - "A depot with no delta no longer clears oldManifestAvailable"
requirements-completed: []
duration: 15min
completed: 2026-11-13
---

# Phase 74 Plan 17: Pre-click estimate accuracy (WR-02) Summary

Rust `estimate_delta` now subtracts chunk SHAs present anywhere in the old manifest from the download figure, and the TS aggregation adds depots new in the build to both download and disk peak.

## Tasks

1. Rust estimate credits old-manifest chunks - `d3e6bf8ac`. Added `unique_new_chunk_bytes` (sibling of `unique_chunk_bytes`, which the `None` arm still uses). Three unit tests in `manifest.rs` (moved content costs 0, only new chunks count, shared new chunk counted once). `estimate_matches_delta_peak` gained a `maxDownloadBytes < changedBytes` assertion (the fixture has reusable chunks); its existing `>= cdn_bytes` bound still holds.
2. TS counts new depots - `a3fb1a9fc`. No-delta depots add `totalBytes` to `downloadBytes` and `newDepotBytes`; `peakBytes = (allOld ? sumChanged : maxChanged) + newDepotBytes`; they no longer set `allOld = false`; log gains `newDepots=`. Two new jest tests.

## Verification

- `cargo test -p gamelib-depot`: all green.
- jest updateEstimate + updateInfo: 17 passed. `pnpm codecheck` clean, `pnpm lint` 0 errors, scoped prettier clean, clippy ratchet PASS.
- Prettier check on the `.rs` files does not apply (no parser).

## Deviations from Plan

**1. [Rule 3 - Tooling] Rust behavior tests placed as unit tests in `manifest.rs`.** `estimate_delta` is private, and the integration fixture cannot express the three cases precisely, so the behavior tests live in a `#[cfg(test)]` module in `manifest.rs` (in a file the plan already modifies) with a tightened assertion in `summarize_delta.rs`.

**2. [Rule 1] `noUncheckedIndexedAccess`:** `res.depots[i]?.totalBytes ?? 0`.

## Deferred / Notes

`cargo fmt --check` reports pre-existing diffs in `tests/delta_fallback.rs` (not touched here).

## Self-Check: PASSED
