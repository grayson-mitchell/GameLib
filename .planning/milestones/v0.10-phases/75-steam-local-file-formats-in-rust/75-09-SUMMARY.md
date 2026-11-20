---
phase: 75-steam-local-file-formats-in-rust
plan: 09
subsystem: steam-local-files
tags: [rust, shortcuts-vdf, atomic-write]
requires: [75-01, 75-06]
provides:
  - gamelib-steamfiles shortcuts (read_shortcuts, apply_shortcuts, EntryField, ShortcutsOp)
affects: [75-11, 75-20]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamfiles/src/shortcuts.rs
    - src-tauri/crates/gamelib-steamfiles/tests/shortcuts.rs
decisions:
  - Add keys at max numeric key + 1; Remove re-keys survivors "0".."n-1" (plan 11 golden confirms against the oracle)
  - apply refuses on parse error, missing root, non-list root; int32 range checked before any read or write
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 09: shortcuts.vdf read and described edits Summary

`read_shortcuts` returns a typed validity/entry summary and `apply_shortcuts` performs add/update/remove on the plan-06 codec with atomic writes, touching only the targeted entry and re-reading the file on every call.

## Commits
- test(75-09) failing read tests, feat(75-09) read_shortcuts
- test(75-09) failing apply tests, feat(75-09) apply_shortcuts (atomic_write only; no fs::write/File::create)

## Deviations from Plan
- Intermediate feat(read) commit does not pass clippy (dead-code helpers awaiting the apply commit); final state is clean.
- Test-only fix during GREEN: a byte-window length typo in the u32 bit-pattern test.

## Known Stubs
None.

## Self-Check: PASSED
24 tests in tests/shortcuts.rs plus roundtrip green; clippy -D warnings (all targets) and rustfmt clean.
