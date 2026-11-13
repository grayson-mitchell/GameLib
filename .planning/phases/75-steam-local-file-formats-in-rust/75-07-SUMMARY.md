---
phase: 75-steam-local-file-formats-in-rust
plan: 07
subsystem: steam-local-files
tags: [rust, acf, vdf]
requires: [75-01, 75-04]
provides:
  - gamelib_steamfiles::acf single ACF codec (builder + typed reader)
  - AcfRecord, AcfDepot, AcfReadResult, read_acf, read_acf_bytes (4 MiB cap)
affects: [75-10, 75-11]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamfiles/src/acf.rs
    - src-tauri/crates/gamelib-depot/src/acf.rs
    - src-tauri/crates/gamelib-depot/Cargo.toml
    - src-tauri/Cargo.lock
  created:
    - src-tauri/crates/gamelib-steamfiles/tests/acf_read.rs
decisions:
  - Reader errors are strings "parse: <Kind> at <offset>" or "read: <io error>"
  - write_app_manifest now uses shared atomic_write (same .tmp naming)
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 07: One ACF codec Summary

The ACF builder moved from gamelib-depot into gamelib-steamfiles::acf (depot re-exports it), and a typed string-valued ACF reader was added on the shared KV parser; depot's StateFlags read now goes through it.

## Commits
- 43cfea64f: refactor(75-07) move builder, depot re-export
- 81c5ab62d: test(75-07) failing reader tests (RED)
- feat(75-07): typed reader, depot read_existing_state_flags on read_acf (GREEN; see git log)

## Notes
- depot tests/ untouched; acf (38), golden (1) and lib (74) tests pass; reader has 11 tests; clippy and fmt clean.
- Module doc carries the per-field TS caller/type table (Pitfall 1).
- The old quoted-token line scanner is gone from depot.

## Deviations from Plan
None.

## Self-Check: PASSED
