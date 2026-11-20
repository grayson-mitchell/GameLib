---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 11
subsystem: steam-cm-rust
tags: [rust, liveness, reconnect, backoff, sleep-detector]
requires: [79-06]
provides:
  - liveness.rs (Backoff, GapDetector, classify, indicates_dead, kind_name, constants)
  - session recovery: probe on failure, rebuild with backoff, retry once, Ambiguous for non-idempotent ops, LoggedOff 34 terminal, sleep-gap tick
affects: [79-12, 79-13, 79-16]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamcm/src/liveness.rs
    - src-tauri/crates/gamelib-steamcm/src/session.rs
key-decisions:
  - "run_op now takes `Fn` (was `FnOnce`) so the op can be re-run once; it has no callers outside session.rs yet"
  - "Recovery is one shared state in the actor (Probing then Rebuilding) with a waiter list; ops arriving during it wait on it and start no recovery of their own"
  - "Backoff delay comes before every attempt (5,10,20,40 s, about 75 s for four failures) as the plan's test requires; spike 085 tried the first logon at once"
  - "A per-connection watch channel lets an in-flight op fail with Replaced the moment 34 arrives"
requirements-completed: [D-01, D-02, D-03]
completed: 2026-11-15
---

# Phase 79 Plan 11: Session liveness and recovery Summary

The Rust session now recovers from a dead link the way spike 085 measured it must, without any periodic probe. A failed or timed-out op triggers a 10 s probe (PICS access tokens for app 480); a dead probe rebuilds the connection (fresh logon through the wrap, 5/10/20/40 s jittered backoff, 30 s per attempt, 4 attempts) and the op is retried once, all inside a 120 s `COMMAND_DEADLINE` that the caller enforces while the control loop stays free.

## Tasks

| Task | Commit | Content |
| ---- | ------ | ------- |
| 1 | 0bc5598d3 | liveness.rs: `Backoff`, `GapDetector`, `classify`, constants, 5 unit tests |
| 2 | 14a900f59 | session.rs: probe/rebuild/retry-once, 34 handling, gap tick, 23 new paused-clock tests |

## Behavior

- Idempotent op, link-level failure (Timeout, Closed, Io): probe; alive means retry on the same connection, dead means rebuild then retry. Steam answers (EResult) and Discovery are not retried. A second failure is final.
- Non-idempotent op (redeem): never resent. After a rebuild it returns `OpFailure::Ambiguous`; with a live probe it returns its own failure.
- LoggedOff 34: in-flight ops fail `Replaced`, the session is dropped, nothing reconnects (tested over 10 minutes of paused time), next `acquire()` logs on fresh. Other codes with a lease held rebuild; with no lease the session just closes.
- Sleep: the 5 s tick feeds `GapDetector`. With a lease it probes at once (a dead probe rebuilds without any caller op); with none it marks the session suspect and the next acquire probes first.
- Every rebuild goes through `wrap.before_logon` / `after_logon` and `connect_authed` (which re-subscribes LicenseList and LoggedOff). A generation fence and a cancel flag stop a rebuild after logout or shutdown; a late landing is closed.
- A canary failure in `ensure_connected` now takes the same rebuild path.
- Diag lines: `CM session dead (cause=..), rebuilding attempt=n`, `CM session rebuilt in Nms`, `CM sleep gap Ns detected`, `CM session replaced (eresult 34), not reconnecting`. No tokens or bodies.

## Verification

`cargo test -p gamelib-steamcm --lib` 169 passed (38 in session/liveness); `cargo clippy -p gamelib-steamcm --all-targets -- -D warnings` and `cargo fmt --check` clean. Greps: `COMMAND_DEADLINE` 5, `Ambiguous` 5, periodic-probe interval 0, `steam_vent` in session.rs 0.

## Deviations from Plan

**1. [Rule 3 - Blocking] Plan verify commands are invalid cargo syntax.** Ran `cargo test -p gamelib-steamcm --lib -- session:: liveness::`.

**2. [Rule 1 - Spec conflict] Backoff yields 4 delays, not 5.** The interface lists 5,10,20,40,60 but also caps at 4 attempts. `Backoff::base(n)` carries the full schedule (60 from the fifth step); the iterator stops after `RECONNECT_MAX_ATTEMPTS`.

**3. [Design] `run_op` closure is `Fn`, not `FnOnce`,** required to re-run it. No external callers existed.

**4. [Design] Test-only injectable wall clock.** `SessionHandle::spawn_with_wall` (pub(crate)) lets tests simulate a sleep; `spawn` uses `SystemTime::now`. fake.rs needed no change.

## Known Stubs

None.

## Threat Flags

None. T-79-36 (34 terminal, tested 10 min), T-79-37 (4 attempts x 30 s, 120 s command deadline, tested), T-79-38 (Ambiguous, tested), T-79-39 (generation fence and cancel on rebuilds, tested) are all mitigated.

## Self-Check: PASSED

liveness.rs and session.rs modified; commits 0bc5598d3 and 14a900f59 exist.
