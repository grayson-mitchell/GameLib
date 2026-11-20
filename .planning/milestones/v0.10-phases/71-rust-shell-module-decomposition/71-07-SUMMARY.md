---
phase: 71-rust-shell-module-decomposition
plan: 07
subsystem: infra
tags: [rust, tauri, dispatcher, wave-1, rust_dispatch]
requires: [71-06]
provides:
  - store_embed.rs rpc_store_embed_* (10 handlers)
  - rust_dispatch.rs (flat 45-arm router)
affects: [71-08, 71-09]
key-files:
  created:
    - src-tauri/src/rust_dispatch.rs
  modified:
    - src-tauri/src/store_embed.rs
    - src-tauri/src/main.rs
    - src/backend/sidecar/__tests__/openPolicy.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
key-decisions:
  - "Handlers placed beside store_embed_open / store_embed_set_bounds / store_embed_navigate so Wave 3 moves them with their clusters"
requirements-completed: [D-04, D-05, D-07, D-10, D-13, D-15]
duration: 20min
completed: 2026-11-08
---

# Phase 71 Plan 07: Wave 1 part 4 - store_embed handlers and rust_dispatch.rs Summary

The last ten arms are one-line `rpc_store_embed_*` calls, and `dispatch_rust_channel` now lives in `rust_dispatch.rs` as a 77-line flat router (45 one-line arms, no catch-all arm). Wave 1 implementation is complete.

## Accomplishments
- Bodies moved verbatim with both cfg blocks; leading comment blocks moved above the handlers. No visibility changes beyond the handlers.
- main.rs production gains only `mod rust_dispatch;` and `use rust_dispatch::*;`; sidecar.rs is untouched versus the wave-1 base (empty diff).
- openPolicy.test.ts now reads rust_dispatch.rs with an exact `ShellOpenPath => shell_open::shell_open_path(app, args),` line regex. tauriShellSource.test.ts gained a pin: 45 arm lines and no `_ =>` in rust_dispatch.rs. `rust_dispatch.rs` added to the main.rs SHELL_SOURCE lists.
- No jest pin read the store-embed arm blocks, so none needed repointing.

## Verification
- `permove.sh wave-1-start 1`: cargo 445 passed (baseline 445), clippy ratchet PASS, PERMOVE PASS at each of the three commits.
- `moveproof.py --wave 1 --require-all`: `LAYER 1 wave 1: removed-not-allowed 0  added-not-allowed 0` / `LAYER 2: matched=43, router-direct=2` / `MOVEPROOF PASS`.
- jestpins over the wave-1 suite list: passed=714 failed=2 unknown-failures=0 (the known WR-07 and C3 pins).
- sizes.py: rust_dispatch.rs 77 lines. Over-limit files are only the allowed ones (store_embed.rs 1859 split-in-wave-3, single_instance.rs 1620 todo, tray.rs 1158 todo; main.rs/login_window.rs/macos_epic_embed.rs allowed).
- prettier and eslint clean on the two edited test files.

## Task Commits
1. 65f2d0b1c store embed open and set_bounds handlers
2. 0d31e7e6c store embed control handlers (8)
3. 50c1332d3 rust_dispatch.rs, router readers repointed

## Deviations from Plan
- The new rust_dispatch.rs `//!` doc initially contained the text `_ =>`, which tripped the new "no catch-all" pin; reworded before the commit. Otherwise none.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
