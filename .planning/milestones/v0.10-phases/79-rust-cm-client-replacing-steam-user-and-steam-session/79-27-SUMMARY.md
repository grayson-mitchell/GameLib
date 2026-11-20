---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 27
subsystem: steam-cm
tags: [rust, steam, refresh, pics, library]
requires: [79-08, 79-09, 79-29]
provides:
  - "refresh::owned_demos::{collect_owned_and_demos, select_licensed_demos, OwnedAndDemos, DemoEntry, refresh_owned_opts}"
  - "refresh::assemble::{assemble_library, AssembleInput, InstallStateInput, AcfInstall, PlaytimeMode, OwnedApp}"
affects: [79-30, 79-35, 79-36]
key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-steamcm/src/refresh/owned_demos.rs
    - src-tauri/crates/gamelib-steamcm/src/refresh/assemble.rs
    - src-tauri/crates/gamelib-steamcm/src/fake.rs
decisions:
  - "Package appids accepted as JSON number or decimal string; non-positive and out-of-range skipped"
  - "Demos stage failure or 30 s timeout yields empty demos plus demos_failed; owned failure still fails the call"
  - "Host platform for a native install derives from is_mac, else cfg linux, else Windows"
requirements: [D-12, D-13, CF-05]
completed: 2026-11-15
---

# Phase 79 Plan 27: Ownership half of Refresh and library assembly in Rust

Owned games plus licensed demos (tokens-first PICS, 200-app batches, 30 s fail-soft bound) and refresh.ts Step 3 as a pure `assemble_library`.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | select_licensed_demos and collect_owned_and_demos | 64e4f66b2 |
| 2 | assemble_library | 1f92d5a36 |

## What was built

- `owned_demos.rs`: the licensedDemos.ts rule as a pure function (reusable by 79-35), `collect_owned_and_demos` calling `account::owned_apps` with refresh.ts's options then `pics::product_info` with tokens for packages and app batches. 18 tests (TS licensedDemos has 14 cases): every Jest case ported, plus string appids, ordering, constants, option capture, timeout under paused clock, partial-batch failure yielding no partial set.
- `assemble.rs`: one pure function carrying install precedence (bridge-authoritative reads the raw `platforms_captured` flag, not `depot_signal_captured`), incomplete resume flag, breadcrumb re-apply and drop, seeding defaults with the TS "why" comments kept (three-valued `is_windows_native`, `mac_arch` default `"unknown"`), extra merge with fresh playtime after the cached spread, carry-forward mode, store_url. 15 tests including a schema-key allowlist check. Install maps, allowlist and `is_mac` are inputs; nothing is rescanned.

## Verification

`cargo test -p gamelib-steamcm --lib -- refresh::` 93 passed; clippy `--all-targets -D warnings` and `cargo fmt --check` clean.

## Deviations from Plan

**1. [Rule 3 - Blocking] Small fake.rs extension**
- The fake did not record `GetOwnedGames` options, so the "calls owned_games once with these options" behavior could not be asserted. Added `Script::owned_opts`.
- Files: src-tauri/crates/gamelib-steamcm/src/fake.rs. Commit 64e4f66b2.

**2. Verify command syntax** — used `cargo test -p gamelib-steamcm --lib -- refresh::...` per the phase notes.

**3. Jest-fixture parity not run** — the plan's "each library.refresh Jest fixture produces the same games array" was covered by hand-built Rust fixtures mirroring those cases, not by executing the Jest fixtures against Rust (no TS call site exists until 79-31).

## Known Stubs

None.

## Self-Check: PASSED

Files and commits 64e4f66b2, 1f92d5a36 exist.
