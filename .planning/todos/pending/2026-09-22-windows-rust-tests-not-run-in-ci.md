---
created: 2026-09-22T11:40:43.000Z
title: "No CI workflow runs `cargo test` (or even `cargo check`) on any OS -- the Windows `cargo test` compile break sat on `main` unnoticed"
area: ci
severity: medium
platform: any
ready: code
found_by: "Phase 46 plan 46-01 Task 1, running `cd src-tauri && cargo test --bin gamelib-shell` by hand on Windows, 2026-09-22"
files:
  - .github/workflows/release-tauri.yml
  - src-tauri/src/main.rs
---

# No CI workflow runs `cargo test` on any OS

No workflow in `.github/workflows/` runs `cargo test` or `cargo check` on ANY OS.
`release-tauri.yml` only does a release build via `tauri-action`, which invokes `cargo build`
(release profile), never the test harness.

Because of that, a real compile break in `src-tauri/src/main.rs`'s `#[cfg(test)] mod tests` sat on
`main` unnoticed: four `store_embed_wire_contract_*` test functions called three
`#[cfg(target_os = "macos")]`-gated `store_embed_*` helper functions without a matching platform
guard on the test functions themselves. `cargo check` (the binary, non-test build) was clean the
whole time -- only `cargo test --bin gamelib-shell` failed, and nothing in CI ever ran it. It was
found only when phase 46 research ran `cargo test` by hand on a Windows machine.

Phase 46 adds `#[cfg(windows)]` FFI code (named mutex + named pipe single-instance guard) that
only a local Windows run compiles, and touches `#[cfg(unix)]`-adjacent code that only a local
macOS or Linux run compiles. Neither leg has any CI coverage today, so a mistake in either one
would ship the same way the `store_embed_wire_contract_*` break did.

## Direction

Add a `cargo test --bin gamelib-shell` job on `windows-latest` and `macos-latest` (Linux is
optional, since it needs the `webkit2gtk` system deps `src-tauri` depends on for a full build).

## Done when

That job exists in a workflow under `.github/workflows/` and is a required check.

This is phase 46 decision point (c): out of scope for plan 46-01 itself, filed here so it is
owned rather than silently dropped.
