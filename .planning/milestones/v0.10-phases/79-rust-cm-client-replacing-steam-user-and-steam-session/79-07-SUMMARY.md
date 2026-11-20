---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 07
subsystem: steam-cm
tags: [rust, steam, anonymous-session, actor]
requires: [79-04]
provides: [AnonHandle, ANON_CONNECT_TIMEOUT, ANON_IDLE_CLOSE]
affects: [79-platform-capture, 79-pics]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamcm/src/anon.rs
    - src-tauri/crates/gamelib-steamcm/src/fake.rs
decisions:
  - "Any failed or timed-out read closes the anonymous connection; no retry loop"
  - "A dropped run_read future releases its in-flight count via a Drop guard (not counted as a failure)"
metrics:
  tasks: 1
  completed: 2026-11-15
---

# Phase 79 Plan 07: Anonymous CM session actor Summary

Rust port of `anonymousClient.ts`: `AnonHandle<B>` is a separate mpsc actor (D-04) with one shared anonymous connection, a 15 s bounded connect, and a 60 s idle close armed only when no read is in flight.

## What was built
- `AnonHandle::{spawn, run_read, close, shutdown, is_connected}`, constants `ANON_CONNECT_TIMEOUT` (15 s) and `ANON_IDLE_CLOSE` (60 s).
- Concurrent reads share one connect (waiter list); connect runs in a spawned task, so the control loop never awaits I/O.
- Generation fencing: a connect or read completion from before a close is discarded, and a late connection is closed at once.
- Diag lines mirror the TS wording (`CM logon mode=anonymous reason=`, `CM session closed mode=anonymous cause=`).
- No token type is imported (grep for `RefreshTokenSecret|connect_authed` returns 0).
- 7 paused-time tests cover every behavior bullet; clippy `-D warnings` and `cargo fmt --check` are clean.

## Deviations from Plan

**1. [Rule 3 - Blocking] FakeBackend `connect_anon` honours `set_delay("connect_anon", ..)`** — needed to test the 15 s connect bound and shared connect. Files: `fake.rs`. Commit 8e1cf9964.

Plan verify line `cargo test -p gamelib-steamcm anon::` was run as `cargo test -p gamelib-steamcm --lib -- anon::`.

## Commits
- 8e1cf9964: feat(79-07): anonymous CM session actor with in-flight-aware idle close

## Known Stubs
None.

## Self-Check: PASSED
