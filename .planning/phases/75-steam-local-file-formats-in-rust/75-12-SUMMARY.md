---
phase: 75-steam-local-file-formats-in-rust
plan: 12
subsystem: steam-local-files
tags: [rust, tauri, rustInvoke, ipc-contract, discovery]
requires: [75-11]
provides:
  - ten RUST_STEAMFILES_* rustInvoke channels with zod schemas and generated ipc_contract.rs
  - shell handlers and arms passing to gamelib_steamfiles::dispatch
  - static OPS == channels == arms parity test
  - GAMELIB_STEAM_ROOT_DEFAULT handed to the sidecar at spawn (dev and packaged)
affects: [75-13, 75-14]
key-files:
  created:
    - src-tauri/src/steamfiles_dispatch.rs
    - src/backend/storeManagers/steam/localFiles/__tests__/steamFilesChannelParity.test.ts
  modified:
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src-tauri/src/ipc_contract.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/main.rs
    - src-tauri/src/sidecar.rs
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src/backend/__tests__/tauriShellSource.test.ts
decisions:
  - shortcuts_apply mutation is typed as an opaque value (depotValueArg precedent, x-rust-value) and validated in-crate by deny_unknown_fields
  - Steam root default is computed by the shell at spawn and passed as an env var, so no boot-time rustInvoke exists
metrics:
  tasks: 3
  completed: 2026-11-14
---

# Phase 75 Plan 12: Steamfiles transport wiring Summary

Ten steamfiles channels are typed end to end, reach the crate through validated shell arms pinned by a static parity test, and the sidecar receives the Rust-discovered Steam root at every spawn.

## Commits
- 90069807f feat(75-12) channels, schemas, generated contract
- 05ac012fd feat(75-12) shell handlers, arms, parity test
- f7a5933bf feat(75-12) discovered Steam root passed at spawn

## Deviations from Plan
- Rule 3: tauriShellSource.test.ts enumerates arms and asserts a "48 one-line arms" count; updated the allow-list with the ten new arms and the count to 58.
- Running `cargo fmt -p` reformatted unrelated files; those changes were reverted and only my edits kept. Repo is not rustfmt-clean (pre-existing).

## Deferred Issues (pre-existing, not caused by this plan)
- tauriShellSource.test.ts: two tests fail on code this plan did not touch (WR-07 `.title(format!` literal check, quick-260925-uok `?` in repair fn).
- `cargo clippy -D warnings` reports 14 errors in login_window/store_embed/shell_state files, none in files touched here.

## Known Stubs
None.

## Self-Check: PASSED
