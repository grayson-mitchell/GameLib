---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 01
subsystem: rust-scanners
tags: [rust, cargo-workspace, ci, scanner]
requires: []
provides:
  - gamelib-scan crate (dispatch, OPS, CLI_ONLY_OPS, RangeRead readers, contained_real)
  - gamelib-scan-cli binary (argv, --ndjson, --list)
  - rust-test.yml coverage plus text gate for the new crates
affects: [63-04, 63-05, 63-06]
tech-stack:
  added: []
  patterns: [Tauri-free workspace crates, dispatch() with catch_unwind panic guard]
key-files:
  created:
    - src-tauri/crates/gamelib-scan/Cargo.toml
    - src-tauri/crates/gamelib-scan/src/lib.rs
    - src-tauri/crates/gamelib-scan/src/reader.rs
    - src-tauri/crates/gamelib-scan/src/contain.rs
    - src-tauri/crates/gamelib-scan-cli/Cargo.toml
    - src-tauri/crates/gamelib-scan-cli/src/main.rs
    - src-tauri/crates/gamelib-scan-cli/tests/cli.rs
    - meta/__tests__/rustTestWorkflow.test.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src/backend/__tests__/cargoFeatures.test.ts
    - .github/workflows/rust-test.yml
key-decisions:
  - "App crate stays the workspace root; gamelib-shell is the only default member"
  - "Minimal CI: -p test step on both legs, clippy --workspace, no Linux leg"
requirements-completed: [D-01, D-02, D-10]
duration: ~15min
completed: 2026-11-07
---

# Phase 63 Plan 01: Workspace and gamelib-scan crates Summary

Cargo workspace in src-tauri with a Tauri-free `gamelib-scan` library (realpath containment op, ranged readers, panic-guarded `dispatch`) and a thin `gamelib-scan-cli`, covered in CI by an explicit `-p` test step and a workspace clippy run.

## Tasks

1. Workspace, gamelib-scan core, lock pin: 342895f84
2. gamelib-scan-cli (argv / --ndjson / --list): b464f9535
3. CI coverage and text gate: ce0befe3d

## Verification

- `cargo test -p gamelib-scan`: 16 passed. `cargo test -p gamelib-scan-cli`: 5 passed.
- `cargo metadata`: members gamelib-scan, gamelib-scan-cli, gamelib-shell; 1 default member.
- Cargo.lock diff adds only the two path crates; cargoFeatures, rustTestWorkflow and clippyRatchet jest suites pass.
- `cargo clippy -p gamelib-scan -p gamelib-scan-cli --all-targets -- -D warnings` clean; `cargo fmt --check` clean; prettier clean.
- Not run: `cargo test --bin gamelib-shell` and the full workspace clippy ratchet (need sidecar and vite build prep).

## Deviations from Plan

- The CI `-p` test step sits after the `swatinem/rust-cache` step rather than directly after `Install Rust stable`, so it uses the cache. Behaviour is unchanged (minor).
- Lock pin row for `gamelib-scan*` was inserted inline, making one row longer than six entries (prettier-ignored).

## Known Stubs

None.

## Self-Check: PASSED
