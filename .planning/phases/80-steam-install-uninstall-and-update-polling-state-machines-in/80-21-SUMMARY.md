---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 21
subsystem: shell
tags: [rust, tauri, steampoll, lifecycle]
requires: [80-20, 80-16]
provides: [polls_impl_from, steampoll_boot, on_sidecar_ready_steampoll, on_sidecar_eof_steampoll, steampoll_exit_shutdown]
key-files:
  modified:
    - src-tauri/src/steampoll_dispatch.rs
    - src-tauri/src/sidecar.rs
    - src-tauri/src/main.rs
    - src-tauri/crates/gamelib-steampoll/src/outbox.rs
    - src-tauri/crates/gamelib-steampoll/src/install_loop.rs
    - src/backend/__tests__/tauriShellSource.test.ts
decisions:
  - "GAMELIB_STEAM_POLLS read once by the shell (OnceLock); default Ts until plan 80-26"
metrics:
  completed: 2026-11-16
---

# Phase 80 Plan 21: Shell poll lifecycle Summary

The shell now owns the Rust poll lifecycle from boot to exit, behind GAMELIB_STEAM_POLLS (default ts).

- Flag: `PollsImpl`, `DEFAULT_POLLS_IMPL = Ts`, pure `polls_impl_from` (unknown value falls back with a diag line), `polls_impl()` cached.
- Boot: `steampoll_boot()` in `.setup` after `install_steampoll_host` and before the sidecar spawn; with rust it spawns `rearm_persisted_holds` on the steampoll runtime and starts the running poll, returning at once.
- READY: `on_sidecar_ready_steampoll()` replaces the direct `mark_sidecar_ready()` call in the reader; it sets the flag and spawns `outbox.mark_ready` (non-blocking for the reader thread).
- EOF: `on_sidecar_eof_steampoll()` clears the ready flag and calls new `Outbox::mark_not_ready()`; polls keep running.
- Exit: `steampoll_exit_shutdown()` runs in `handle_exit` after `steamcm_exit_shutdown`, before `shutdown_child`; cancels all polls (bounded by EXIT_FINALIZE_WAIT) and kills monitor children via new `InstallPolls::stop_all_monitors()`.

Commit: 223157ba4.

## Deviations from Plan

[Rule 3 - Blocking] Added `Outbox::mark_not_ready` and `InstallPolls::stop_all_monitors` in gamelib-steampoll, since the plan's hooks needed them and neither was exposed.

## Verification

cargo test --bin gamelib-shell (467 pass), gamelib-steampoll tests pass, clippy clean on touched files, jest tauriShellSource: only the two known pre-existing failures (WR-07 title literal, UOK Gate 4). Prettier clean.

Carry-forward (80-06): monitor stop still relies on kill_on_drop (SIGKILL); not observed as an issue here.

## Self-Check: PASSED
