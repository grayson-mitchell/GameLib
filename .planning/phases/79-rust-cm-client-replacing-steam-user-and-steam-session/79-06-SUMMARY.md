---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 06
subsystem: steam-cm-rust
tags: [rust, actor, session, lease, tokio]
requires: [79-04]
provides:
  - SessionHandle<B> actor (acquire, acquire_open, release, run_op, ensure_connected, logout, shutdown, status, licenses)
  - LogonWrap trait, NoWrap, WrapTicket, WrapRefused, RestoreTrigger, RestoreOutcome
  - Refusal, OpFailure, LogonFailure, SessionStatus; IDLE_GRACE, LOGON_BOUND, CANARY_*
affects: [79-11, 79-12, 79-13, 79-16]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamcm/src/session.rs
    - src-tauri/crates/gamelib-steamcm/src/fake.rs
key-decisions:
  - "run_op fetches the conn from the actor then runs the closure under its timeout in the caller's task, so a stalled op never occupies the control loop"
  - "Logout and shutdown drain pending waiters immediately (NotSignedIn / ShuttingDown) and fence the late logon by generation instead of aborting its task, so after_logon still runs once per attempted logon"
  - "Shutdown runs pay_owed in a spawned task under the bound; TimedOut serialises as restore-unconfirmed"
requirements-completed: [D-01, D-03, D-07]
completed: 2026-11-15
---

# Phase 79 Plan 06: Rust session actor Summary

A single tokio actor owns the signed-in CM session: lease counting with one shared logon, a 60 s idle close, a 35 s logon bound, a generation fence that closes any logon landing after logout or shutdown, a credential-refusal verdict (`logon-rejected` with eresult, otherwise `client-not-ready`), and shutdown ordering (abandon, close, then the wrap's owed go-online under a bound).

## Tasks

| Task | Commit | Content |
| ---- | ------ | ------- |
| 1 + 2 | 45c8d2507 | session.rs actor, wrap trait, outcome enums, 15 FakeBackend tests under `start_paused`; fake.rs connect delay |

Both tasks landed in one commit because the actor and the ordering tests were written together; all behavior bullets from both tasks have named passing tests.

## Notes for later plans

- ensure_connected is the interim canary (PICS access tokens + product info for app 753, 5 s). On failure it closes the conn and starts one logon with the stored token; leases survive. Plan 79-11 replaces this with probe + backoff and consumes the `logged_off` receiver, currently held in the actor (`_logged_off`).
- The actor keeps the latest token and logon id as `RefreshTokenSecret`; logout clears them.
- `run_op`'s `idempotent` flag is accepted but unused until 79-11 (retry / Ambiguous).
- `OpFailure::Ambiguous` is defined but not yet produced.
- Diag lines: `CM logon mode=authenticated reason=...`, `CM session closed mode=authenticated cause=idle|logout|shutdown|canary-failed|handles-dropped`, `CM logon landed after sign-out/shutdown, closed`.

## Verification

- `cargo test -p gamelib-steamcm --lib -- session::` 15 passed; clippy `--all-targets -D warnings` and `cargo fmt --check` clean.
- Acceptance greps: 0 `steam_vent` in session.rs; `start_paused = true` count well above 6.

## Deviations from Plan

**1. [Rule 3 - Blocking] Plan verify command is invalid cargo syntax.** Ran `cargo test -p gamelib-steamcm --lib -- session::`.

**2. [Rule 3 - Blocking] FakeBackend had no connect delay.** Tests need a slow `connect_authed`; added a `"connect_authed"` entry in `set_delay` handling in fake.rs (file outside the plan's files_modified).

**3. [Test adaptation]** The "abandon -> close -> pay_owed" order is asserted through a RecordingWrap that records whether the backend is all-closed when pay_owed starts (established session), plus a shutdown-during-connect test checking the late logon is closed and after_logon runs once; the wrap cannot directly observe "abandon".

## Known Stubs

None. `wrap.rs`, `liveness.rs` and others remain module stubs for their own plans.

## Threat Flags

None. T-79-19..23 mitigations are implemented and tested (fence, non-blocking loop, secret-only token, lease membership check, bounded shutdown).

## Self-Check: PASSED

session.rs and fake.rs modified; commit 45c8d2507 exists.
