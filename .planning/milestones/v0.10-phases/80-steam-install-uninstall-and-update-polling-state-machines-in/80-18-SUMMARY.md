---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 18
subsystem: steam-polling
tags: [rust, tauri, rustInvoke, ipc-contract, parity]
requires: [80-17]
provides:
  - "24 RUST_STEAMPOLL_* channels, RUST_STEAMPOLL_CHANNELS, RUST_INVOKE_CHANNELS membership"
  - "generated Steampoll*Args structs and RustInvokeChannel variants"
  - "steampoll_dispatch.rs: 24 thin rpc_steampoll_* arms calling gamelib_steampoll::dispatch"
  - "steamPollTypes.ts: STEAMPOLL_OPS and TS result mirrors"
  - "steamPollChannelParity.test.ts"
affects: [80-19, 80-20, 80-21]
key-files:
  created:
    - src-tauri/src/steampoll_dispatch.rs
    - src/backend/storeManagers/steam/pollRust/steamPollTypes.ts
    - src/backend/__tests__/steamPollChannelParity.test.ts
  modified:
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src-tauri/src/ipc_contract.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/main.rs
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src/backend/__tests__/tauriShellSource.test.ts
decisions:
  - "install_start.options is an opaque x-rust-value (PollOptions validated in the crate with deny_unknown_fields); roots is a typed strict object."
  - "read_running_app_id takes an optional object arg (tuple item optional), matching the crate's tolerance of no args."
  - "testUtils/tauriShellSource.ts needed no edit: it discovers shell files automatically."
metrics:
  tasks: 2
  completed: 2026-11-16
---

# Phase 80 Plan 18: steampoll channels and shell arms Summary

Every one of the 24 steampoll ops is now a typed rustInvoke channel with a generated Args struct and a one-line shell arm that validates and calls `gamelib_steampoll::dispatch`; a static parity test pins crate OPS == constants == TS mirror == arms.

## Commits

- 19d7556f7: constants, zod args, generated contract, steamPollTypes.ts, parity test
- c9f43e691: steampoll_dispatch.rs, router arms, main.rs wiring, Cargo deps, source pins

The generated contract (task 1) and arms (task 2) landed in two commits; the shell does not build at 19d7556f7 alone (generated variants without arms), as expected when generation precedes arms.

## Verification

`cargo build`, `cargo test --bin gamelib-shell` (461 passed), `pnpm check:ipc-contract`, `pnpm codecheck`, steamPollChannelParity (4 passed) and prettier on every TS file written all pass. `grep eprintln/diag args` in steampoll_dispatch.rs: 0.

## Deviations from Plan

**1. [Rule 3 - Blocking] Stale arm pins in tauriShellSource.test.ts.** The "58 one-line arms" literal was already stale at HEAD (actual 87 before this plan, 111 after) and the "ONLY new dispatch arm" list lacked the Phase 79 steamcm arms and `depot_finalize`. Set the count to 111 (+24 mine) and declared steamcm (28), depot_finalize and steampoll (24) in the list, with comments.

**2. [Scope] `cargo fmt --check` / `cargo clippy --workspace -D warnings` are not green workspace-wide at HEAD.** Pre-existing: 24 shell files are not rustfmt-clean and clippy reports 14 errors in the shell (e.g. shell_state.rs type_complexity, dead-code warning in store_embed/state.rs). None are in files this plan wrote. My own new file is rustfmt-clean.

## Issues Encountered

- Running `cargo fmt` reformatted 24 unrelated shell files in the working tree (src/clipboard.rs, dialogs.rs, keyring_dispatch.rs, login_window*.rs, macos_epic_embed/nav_delegate.rs, notification_show.rs, relay_commands.rs, shell_open.rs, shell_state.rs, sidecar.rs, single_instance/windows_pipe.rs, store_embed/*.rs, terminate_veto.rs, tray*.rs, wake_lock/*.rs). They are NOT committed. My attempt to `git checkout` them was denied by the permission system, so they remain as uncommitted formatting noise for the user to discard (`git checkout -- <those files>`). My own files (main.rs, rust_dispatch.rs, ipc_contract.rs) were rebuilt from HEAD plus my edits, so they carry no fmt noise.
- Four tauriShellSource.test.ts tests fail and are not caused by this plan (D-35-29-01 NARROWNESS x2, WR-07 title literal, UOK Gate 4); Gate 4 reads windows_protocol.rs, which is untouched.

## Threat mitigations

T-80-54: generated `from_args` precedes the crate's deny_unknown_fields. T-80-55: no args in logs (grep 0). T-80-56: exhaustive generated enum, unknown names rejected before any arm.

## Known Stubs

None.

## Self-Check: PASSED

steampoll_dispatch.rs, steamPollTypes.ts, steamPollChannelParity.test.ts exist; commits 19d7556f7 and c9f43e691 exist.
