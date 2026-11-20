---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 16
subsystem: steam-cm
tags: [rust, tauri, dispatch, lifecycle]
requires: [79-15]
provides:
  - "24 exhaustive Steamcm arms in rust_dispatch.rs; gamelib-shell compiles again"
  - "ShellWrapHost (real local UTC offset, boot time, pid probe, const steam:// URLs only)"
  - "EOF and exit shutdown hooks (shutdown_all, 5 s bound)"
affects: [79-17, 79-21]
key-files:
  created:
    - src-tauri/src/steamcm_dispatch.rs
  modified:
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/main.rs
    - src-tauri/src/sidecar.rs
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src/backend/__tests__/steamCmChannelParity.test.ts
decisions:
  - "Both tasks landed in one commit (main.rs hunks for provider, setup and exit hook are interleaved)."
  - "ShellWrapHost uses libc natively on unix (kill 0, sysctlbyname kern.boottime, localtime_r tm_gmtoff); pgrep -x steam_osx only for steam_running on macOS; non-unix fall back to false/None/0 (NoWrap platforms)."
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 79 Plan 16: Shell wiring for the Rust CM client Summary

The shell links gamelib-steamcm: 24 `rpc_steamcm_*` handlers validate via the generated Args structs then call `gamelib_steamcm::dispatch`; the ring TLS provider is installed right after `install_panic_hook()`; the wrap host is installed in `run_setup` before `spawn_sidecar_state`; the sidecar EOF branch and `handle_exit` (before `shutdown_child`) call `shutdown_all(5 s)`.

## Commits

- aab77c1a4 feat(79-16): wire gamelib-steamcm into the shell

## Handoffs honored

1. `ShellWrapHost` overrides `local_utc_offset_secs` (localtime_r), `pid_alive`, `system_boot_unix_ms`; `self_pid` default kept. steam:// opener goes through `open_external_scheme_check` and `opener().open_url` on a worker thread, accepting only the two const URLs.
2. `set_wrap_host` runs in setup, long before any `steamcm_configure` from the sidecar.
3. macOS uses `RestoreOnlyWrap` (chosen inside the crate). The shell does NOT call `pay_owed(Boot)` itself: it needs `configure`'s app folder, which only the sidecar knows. The Boot payment is reachable as the `steamcm_wrap_restore_if_owed {trigger:"boot"}` channel, which the TS side (later plan) must call after configure.
4. `shutdown_all(5 s)` wired to EOF and exit; outcome name only is logged.
5. `install_crypto_provider()` is called early in `main()`.

## Deviations from Plan

- Tasks 1 and 2 committed together (see decisions).
- `ShellWrapHost::connection_log_path` is the macOS path under `$HOME` (only used on macOS).

## Verification

`cargo build` ok; `cargo test --bin gamelib-shell` 460 passed (incl. new steamcm hook test, NotOwed within bound); parity + cargoFeatures jest green with the shell-arm case enabled; prettier ok. `cargo clippy -D warnings` shows no errors in steamcm_dispatch.rs; the workspace-wide errors (login_window, store_embed, shell_state, native_gamepad_shape) and `cargo fmt --check` diffs (clipboard.rs etc.) are pre-existing and untouched.

## Deferred Issues (pre-existing / from 79-15, not fixed here)

- `tauriShellSource.test.ts`: "58 one-line arms" (HEAD already had 59, now 83) and the "only new dispatch arm" census need their counts/allowlists updated for the steamfiles/depot/steamcm arms.
- `dialogOptionForwarding.test.ts`: `UNBOUNDED_RUST_CHANNELS` now includes 16 `RUST_STEAMCM_*` channels (from 79-15's TS contract); the expected set must be updated or those channels declared bounded.
- Other failing backend suites (epicOfflineMode, shimCoverage, shimGenerate, libraryReplay) and two tauriShellSource gates (WR-07 title, Gate 4 `?;`) are unrelated to this plan.

## Known Stubs

None.

## Self-Check: PASSED
