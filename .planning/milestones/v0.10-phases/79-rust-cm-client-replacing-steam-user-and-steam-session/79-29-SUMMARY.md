---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 29
subsystem: steam
tags: [rust, steamcm, appdetails, reqwest, metadata]
requires: [79-01]
provides:
  - SteamMetadataEntry with flattened passthrough, resolve_platform_write, depot_signal_captured
  - store_appdetails (reqwest) and requirement parsers
  - enrich_entry, needs_enrichment, enrich_stage
affects: [79-27, 79-28, 79-30, 79-32]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamcm/src/refresh/meta_entry.rs
    - src-tauri/crates/gamelib-steamcm/src/refresh/store_http.rs
    - src-tauri/crates/gamelib-steamcm/src/refresh/enrich.rs
requirements-completed: [D-12]
completed: 2026-11-15
---

# Phase 79 Plan 29: Store enrichment in Rust Summary

Steam store metadata enrichment (appdetails fetch, parsing, merge into the metadata entry and game info) now lives in `gamelib-steamcm`, with a bounded Refresh stage; TS only needs to persist results.

## Commits
- 51704e7bd: meta_entry.rs (18 tests)
- d935f8c4d: store_http.rs (20 tests, includes the shared local tokio HTTP mock under `cfg(test)`)
- 363ec4ec1: enrich.rs (22 tests)

## Notable decisions
- `enrich_entry` builds the entry as the enumerated TS write (faithful carry-forwards) but starts `rest` from the cached entry, so unmodelled future keys survive (T-79-123).
- `resolve_platform_write` takes one `now_ms` (stamp and clock), per the plan interface; the TS incoming-stamp clamp is kept in an internal `resolve_with` and tested there. `platformsCapturedAt` deserialises leniently (non-number becomes absent).
- `platformsSource` / `mac_arch` / `mac_arch_source` are strings in the entry so a junk on-disk value cannot fail the whole entry.
- `enrich_stage` returns only Enriched/Delisted outcomes; NoData and non-429 failures count as `failed`; the 429 app, apps in flight at the budget and the unstarted queue go to `not_reached`.
- Stage tests use real short timings, not paused time (79-05 finding). No regex dependency, no Cargo.toml / Cargo.lock change.

## Deviations from Plan
- TS has no gameRequirements test file, so the parser tests were written from the TS doc-comment shapes (five observed mac OS shapes, codenames, unit conversions); 20 store_http tests exceed the stated floor only if the TS count is 0 + 5.
- Verify command syntax `cargo test -p X a::` fixed to `--lib -- a::` per phase notes.

## Verification
`cargo test -p gamelib-steamcm --lib -- refresh::` 60 passed (stable across 3 runs); clippy `--all-targets -D warnings` and `cargo fmt --check` clean.

## Known Stubs
None.

## Self-Check: PASSED
