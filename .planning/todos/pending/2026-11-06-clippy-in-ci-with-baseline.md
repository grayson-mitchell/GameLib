---
created: 2026-11-06T12:00:00.000Z
title: "Run cargo clippy in CI, warn-only with a shrink-only baseline"
area: build
files:
  - .github/workflows/rust-test.yml
  - src-tauri/Cargo.toml
severity: minor
platform: any
ready: code
---

## Problem

Nothing lints the Rust shell. `rust-test.yml` runs `cargo test --bin gamelib-shell` (442 tests),
but no workflow runs `cargo clippy`, and `src-tauri/Cargo.toml` has no `[lints]` table and there
is no `clippy.toml`. About 24.5k lines of Rust (`main.rs` 7,886, `store_embed.rs` 4,623,
`login_window.rs` 3,339, measured 2026-11-06) get less static checking than the TypeScript does.
From the second architecture review on 2026-11-06 (item 5).

## Solution

Run with `/gsd-quick`.

1. Measure: `cd src-tauri && cargo clippy --all-targets` on this Mac and record the warning
   count by lint name.
2. Add a `cargo clippy` step to the existing `cargo-test` job in `rust-test.yml`, reusing its
   build prep (vite build and `build:sidecar-sea` already run there).
3. Make it warn-only at first, with a shrink-only baseline in the same style as Phase 62's
   ratchets: CI fails if the count rises, never because it is above zero.
4. Optionally add a `[lints.clippy]` table to `Cargo.toml` for anything the operator wants to
   deny outright (e.g. `dbg_macro`, `todo`).

Do not fix warnings in the same commit that adds the gate. Fixes go in separate follow-up commits
that lower the baseline. If the `main.rs` split quick task is in flight, sequence after it to
avoid churn.
