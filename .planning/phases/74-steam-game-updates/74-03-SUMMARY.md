---
phase: 74-steam-game-updates
plan: 03
subsystem: steam-depot
tags: [rust, depot, summarize, delta-estimate, prune]
requires:
  - phase: 74-steam-game-updates
    provides: delta::compute_work_set / removed_paths (plan 01)
provides:
  - DepotSummary.delta (DeltaEstimate) from summarize with fromManifest
  - ManifestStore::prune protected-GID guard
affects: [74-06]
key-files:
  modified:
    - src-tauri/crates/gamelib-depot/src/job.rs
    - src-tauri/crates/gamelib-depot/src/manifest.rs
    - src-tauri/crates/gamelib-depot/tests/manifest.rs
  created:
    - src-tauri/crates/gamelib-depot/tests/summarize_delta.rs
key-decisions:
  - "Estimate reuses delta::compute_work_set, so changed_bytes equals the delta job's peak_bytes (tested)"
  - "Old-manifest failure (not cancel) degrades to old_manifest_available=false with the largest-single-file disk peak and all-unique-chunk download bound"
requirements-completed: []
duration: 20min
completed: 2026-11-12
---

# Phase 74 Plan 03: summarize delta estimate and prune guard Summary

**`summarize` now accepts `fromManifest` and returns a per-depot `delta` estimate (exact changed-file bytes, CDN upper bound, file counts, `oldManifestAvailable`); `ManifestStore::prune` takes a protected-GID list.**

## Commits

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1+2 | cba9a7985 | One commit: both tasks edit `manifest.rs` and were implemented together, so they were not split |

## Verification

- `cargo test -p gamelib-depot` and `-p gamelib-depot-cli` green; `cargo clippy --all-targets` clean; `cargo fmt --check` clean (prettier has no Rust parser).
- New: `summarize_delta` 4 tests (parity with delta peak, old unavailable, absent without fromManifest, same GID zero), `prune_keeps_protected_gid` (also checks `../x` and empty entries are ignored).
- `ManifestStore::prune` still has no production caller (only tests call it); no eviction caller added, per plan.

## Deviations from Plan

**1. Single commit for both tasks** (shared file); behavior tests for both are present.
**2. [Rule 2] Numeric check on `fromManifest` inside `summarize`** (the dispatch probe's `validate` does not check it), returning `delta_unsupported` for a non-numeric id before any path join.

No pre-existing test asserted the old summarize `fromManifest` rejection, so none needed replacing.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: tests/summarize_delta.rs, commit cba9a7985
