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
  - .github/workflows/rust-test.yml
status: completed
resolved: 2026-09-23
resolved_by: quick-260923-b31
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

## Resolution (2026-09-23, quick 260923-b31)

**What shipped:** `.github/workflows/rust-test.yml` -- a new workflow, job `cargo-test`, running
`cargo test --bin gamelib-shell` (working directory `src-tauri`) on `windows-latest` and
`macos-latest`, `fail-fast: false` so one leg's failure never hides an independent break on the
other. The cargo step sits behind `./.github/actions/install-deps` and a real `pnpm exec vite
build`.

**Why the vite build is in there:** `src-tauri/src/main.rs` calls `tauri::generate_context!()`,
which embeds `frontendDist` (`../build/renderer` per `tauri.conf.json`) at COMPILE time -- the
crate does not compile at all, tests included, without that directory existing first. A stub
`build/renderer/index.html` was considered during planning and REJECTED: a fake input would let a
real asset/codegen break pass this gate and only surface at release time, which is the
green-check-proving-nothing pattern this project keeps stamping out.

**Why Ubuntu is out:** `src-tauri` needs `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, and
`librsvg2-dev` system packages to build at all (`release-tauri.yml`), and the only Linux-specific
Rust code is the `cfg(unix)` `libc::kill` arm, which the macOS leg already compiles. Adding a third
OS leg here buys no additional `cfg` coverage for the cost of maintaining Ubuntu system deps in a
second workflow.

**Measured baseline:** `cd src-tauri && cargo test --bin gamelib-shell` on this Windows machine,
2026-09-23 -- `234 passed; 0 failed; 2 ignored`. The `store_embed_wire_contract_*` break this todo
describes is already fixed, so the new job lands green on day one. Stated plainly: this means the
gate has NOT been observed catching a real break -- there is no negative control for it in this
task. Its value is prophylactic (it would have caught the original break had it existed then), not
demonstrated on a live red run.

**NOT DONE -- operator follow-up.** This todo's Done-when was two clauses: "That job exists in a
workflow under `.github/workflows/`" AND "is a required check." Only the first clause is
satisfiable from a file in this repo. Marking `Rust test / cargo-test (windows-latest)` and
`Rust test / cargo-test (macos-latest)` as required status checks is a GitHub branch-protection
(or ruleset) setting under Settings -> Branches for `main`, changed by a repo admin through the
GitHub UI or API -- it is not a file this task can commit. Until an operator flips that setting,
the job runs and reports a verdict on every push/PR but does NOT block a merge, which is strictly
weaker than what this todo originally asked for. Note also that GitHub's required-check picker
only lists check names it has already observed at least once, so the order has to be: land this
workflow, let it run once on `main`, then enable the required-check setting.
