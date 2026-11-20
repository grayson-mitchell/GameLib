---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 04
subsystem: steam-cm-rust
tags: [rust, steam-vent, trait-seam, error-model]
requires: [79-01]
provides:
  - CmBackend / CmConn trait seam (backend.rs) with raw response structs
  - CmError model, credential-refusal table, diagnostic sink (error.rs)
  - FakeBackend scripted test double (fake.rs, cfg(test))
  - SteamVentBackend / VentConn and install_vent_log_forwarder (vent.rs)
affects: [79-05, 79-14, 79-16]
key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-steamcm/src/backend.rs
    - src-tauri/crates/gamelib-steamcm/src/error.rs
    - src-tauri/crates/gamelib-steamcm/src/fake.rs
    - src-tauri/crates/gamelib-steamcm/src/vent.rs
key-decisions:
  - "Non-Expired RefreshTokenError (malformed token) maps to Protocol, not a credential-refusal EResult, so it never latches credentialsMissing"
  - "SSLKEYLOGFILE guard applies to connect_anon as well as connect_authed"
requirements-completed: [D-02, D-03, D-07, CF-02, CF-03, CF-04, CF-05]
completed: 2026-11-15
---

# Phase 79 Plan 04: CmBackend seam, error model and steam-vent backend Summary

A `CmBackend`/`CmConn` trait seam (return-position `impl Future + Send`, no async-trait) with a real steam-vent implementation confined to `vent.rs`, a `CmError` model with the 5/15/26/27/63 credential-refusal table, and a scripted `FakeBackend` so the session layer is testable with no network.

## Tasks

| Task | Commit | Content |
| ---- | ------ | ------- |
| 1 | f5a6f23b4 | backend.rs contract, error.rs model + diag sink, fake.rs with queues, delays, failure injection, kick channel |
| 2 | 36082038b | SteamVentBackend, error mapping, SSLKEYLOGFILE guard, hand-written tracing forwarder, live tests |

## Notes for later plans

- `connect_authed`: reads the SteamID from the JWT `sub`, subscribes `CMsgClientLicenseList` and `CMsgClientLoggedOff` before `login_with_refresh_token_and_logon_id` (pin 767481ad supports logon id), awaits the licence list 10 s, forwards every LoggedOff eresult on an `mpsc(4)` for the connection's life.
- `VentConn::close()` drops its `Connection` clone and aborts the forwarder; later calls return `CmError::Closed`. `Drop` calls `close`.
- `map_err`: `InvalidCredentials`->5, `Unknown(r)`->`EResult(r)` (34 -> `Replaced`), `AccessToken(Expired)`->27, Timeout/EOF/Ws/BrokenPipe-class IO->Timeout/Closed, `ApiError(r)`->EResult, everything else `Protocol(<variant name>)`. SteamGuardRequired and RateLimited become `Protocol` (not refusals).
- `personas` requests with the PlayerName flag (2) and collects for up to 5 s; returns what arrived.
- FakeBackend API: `push_authed`, `inject_job_failure(n, err)`, `set_delay(method, d)`, `send_logged_off(code)`, `connect_count()`, `job_count()`, `all_closed()`, `script(|s| ..)` for per-method queues/defaults. `fake.rs` carries `#![allow(dead_code)]` because most helpers are consumed by later plans.

## Verification

- `cargo test -p gamelib-steamcm`: unit tests green (error 4, fake 6, vent 4).
- `cargo clippy -p gamelib-steamcm --all-targets -- -D warnings` and `cargo fmt -p gamelib-steamcm --check`: clean.
- Live: `vent_anon_pics_live` passed. `vent_authed_live` RAN (dev vault held a token) and passed: 485 licences, 390 owned games (counts only).
- Acceptance greps: only vent.rs has `use steam_vent`; 0 `tracing_subscriber`; `SSLKEYLOGFILE` guarded and tested.

## Deviations from Plan

**1. [Rule 3 - Blocking] Plan verify command is invalid cargo syntax.** `cargo test -p gamelib-steamcm error:: fake::` errors (one test filter only). Ran `cargo test -p gamelib-steamcm --lib -- error:: fake::` instead. Plan text left unchanged.

**2. [Rule 1 - Bug] Test closure lifetime error in fake.rs** (closure returning a borrowing future); rewrote the test to call the method directly.

No other deviations.

## Known Stubs

None in this plan's files. Other crate modules remain stubs for later plans.

## Threat Flags

None beyond the plan's register. T-79-11/12/13 mitigations are implemented and unit-tested; T-79-14 accepted as planned.

## Self-Check: PASSED

backend.rs, error.rs, fake.rs, vent.rs exist; commits f5a6f23b4 and 36082038b exist.
