---
phase: 75-steam-local-file-formats-in-rust
plan: 11
subsystem: steam-local-files
tags: [rust, dispatch, golden, shortcuts, parity]
requires: [75-03, 75-05, 75-08, 75-09, 75-10]
provides:
  - twelve-op dispatch registry (OPS sorted, CLI_ONLY_OPS = discover_root, shortcuts_roundtrip)
  - invocations.json (77) and rust-results.json for TS-wrapper replay
  - shortcuts logical edit parity vs the oracle
affects: [75-12, 75-15, 75-19, 75-24]
key-files:
  created:
    - src-tauri/crates/gamelib-steamfiles/tests/golden.rs
    - src-tauri/crates/gamelib-steamfiles/tests/security.rs
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/invocations.json
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/rust-results.json
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/overrides/*.json
  modified:
    - src-tauri/crates/gamelib-steamfiles/src/lib.rs
    - src-tauri/crates/gamelib-steamfiles-cli/tests/cli.rs
decisions:
  - Shortcuts index rules (add at max+1, remove re-keys contiguously) confirmed against the oracle
  - The only divergence is the oracle padding a sparse array with an empty-string placeholder; recorded in overrides/shortcuts.json with a divergenceNote
  - rust-results.json is compared as parsed JSON so a prettier pass never makes it stale
  - Ops without an exists field (read_running_app_id, parse_valve_manifest) report absence in their own shape (runningAppId 0, ok false)
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 11: Op registry and Rust-side Tier 1 parity Summary

All twelve steamfiles ops are registered in dispatch with deny_unknown_fields camelCase args, 77 recorded Rust results exist for Jest replay, and shortcuts add/remove match the oracle by value except for one documented sparse-array quirk.

## Commits
- 53872326c test(75-11) failing tests for op registry and dispatch security (RED)
- ee9ca5e20 feat(75-11) register twelve steamfiles ops in dispatch (GREEN)
- d084b3792 test(75-11) recorded rust results and shortcuts logical parity

## Deviations from Plan
None of substance. Task 1 was TDD (RED then GREEN); the missing-file unit test was adjusted to the actual result shape of two ops that have no `exists` field.

## Known Stubs
None.

## Self-Check: PASSED
