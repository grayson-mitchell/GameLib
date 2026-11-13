---
phase: 75-steam-local-file-formats-in-rust
plan: 10
subsystem: steam-local-files
tags: [rust, library, acf, vdf]
requires: [75-07]
provides:
  - library::read_library_folders, scan_acfs, find_acf (serde camelCase)
affects: [75-11, 75-15, 75-19]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamfiles/src/library.rs
    - src-tauri/crates/gamelib-steamfiles/tests/library.rs
decisions:
  - scan_acfs sorts by file name (TS readdir order was OS-defined)
  - Entry cap hit records one skipped entry with reason too-many-entries and empty file_name
  - Unreadable (non-NotFound) dir is a skipped entry with reason "read: ..."
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 10: Local library scan in Rust Summary

libraryfolders.vdf roots (modern path maps and legacy numeric strings, decoded), a batched bounded scan of appmanifest_*.acf across steamapps dirs, and a first-dir-wins numeric-id ACF lookup, all on the shared KV parser and ACF reader.

## Commits
- test(75-10) failing tests for libraryfolders roots (RED)
- feat(75-10) read libraryfolders.vdf roots (GREEN)
- test(75-10) failing tests for acf scan and find (RED)
- feat(75-10) batched acf scan and first-match lookup (GREEN)

## Notes
- 13 tests in tests/library.rs; whole crate tests, clippy (all targets, -D warnings) and fmt clean.
- Existence filtering and /usr/share/steam prefix stay TS policy (plan 15).
- Threats T-75-27 (20 000 entry cap, 4 MiB per file) and T-75-28 (1-20 digit ids) mitigated.

## Deviations from Plan
None - plan executed exactly as written.

## Self-Check: PASSED
