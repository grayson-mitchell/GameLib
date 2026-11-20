---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 20
subsystem: steam-polling
tags: [rust, tauri-shell, notifications, ipc]
requires: [80-18, 80-03, 80-09, 80-11]
provides:
  - "ShellPollHost (PollHost impl) and install_steampoll_host in src-tauri/src/steampoll_dispatch.rs"
  - "pub(crate) show_notification shared by rpc_notification_show and the poll host"
  - "5 s timeout_for arm for steamPollStateEvent"
affects: [80-21]
key-files:
  modified:
    - src-tauri/src/steampoll_dispatch.rs
    - src-tauri/src/notification_show.rs
    - src-tauri/src/main.rs
    - src-tauri/src/sidecar.rs
decisions:
  - "Host resolves SidecarState lazily via app.try_state at state_event time and gates on a static SIDECAR_READY set by the sidecar reader on READY, because the facade must be installed before the sidecar (and its state) exist."
requirements-completed: [P80-events, P80-locale]
metrics:
  tasks: 2
  completed: 2026-11-16
---

# Phase 80 Plan 20: Shell poll host Summary

The real PollHost lives in the shell: webview emits use the relay's FrontendMessagePayload on FRONTEND_MESSAGE_EVENT, notifications render through gamelib-i18n (language read from config.json at notify time) and go out through one shared `show_notification`, and state events are acked `steamPollStateEvent` invokes run via `spawn_blocking` on the steampoll runtime, bounded at 5 s and answering not_acked before READY, on a dead pipe, timeout or malformed reply. The facade is installed in `.setup` before the sidecar spawns.

## Commits

- ec14322ae: show_notification refactor, ShellPollHost, install_steampoll_host, READY mark
- cbc6c91bc: steamPollStateEvent 5 s timeout arm, setup install before spawn_sidecar

## Deviations from Plan

- [Rule 3 - Blocking] The shell has no direct tokio dependency, so `spawn_blocking` is called on `gamelib_steampoll::runtime::handle()` (same runtime, no new dependency).
- ShellPollHost does not hold `Arc<SidecarState>`/ready fields as written in the plan; `install_steampoll_host(app)` takes no state because the state does not exist yet at install time (install must precede spawn). State is fetched via `try_state` and readiness is a static flag (`mark_sidecar_ready()` called from the reader on READY). `show_notification` takes `Option<&str>` title/body to keep `rpc_notification_show` behaviour unchanged.
- Locales dir is `<app root>/<asset dir>/locales` with asset dir `public` (dev) / `build` (packaged), mirroring appPaths.ts.
- Test module named `tests` (the shell-source census permits one `tests` mod per file only); no change to tauriShellSource.test.ts was needed.

## Verification

cargo build and `cargo test --bin gamelib-shell` (465 passed); no clippy findings in the new files; rustfmt clean on files written. tauriShellSource jest: only the 2 known pre-existing failures (WR-07 title literal, UOK Gate 4).

## Self-Check: PASSED
