---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 05
subsystem: steam-cm-rust
tags: [rust, web-api, qr-signin, flow-registry]
requires: [79-01]
provides:
  - WebAuth { base_url, client, flows, timing } with bounded call() (GET/POST, input_protobuf_encoded, x-eresult)
  - WebAuthError, HttpMethod, FlowStatus/FlowErrorReason (serde camelCase), QrStarted
  - qr_start / status / cancel / cancel_all with Rust-owned poll loop
  - cfg(test) TcpListener HTTP mock (webauth/mock.rs)
affects: [79-10, 79-14]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamcm/src/webauth/mod.rs
  created:
    - src-tauri/crates/gamelib-steamcm/src/webauth/mock.rs
key-decisions:
  - "reqwest query/form features are not enabled, so the form/query field is built by hand (base64 needs only + / = escaped); no Cargo change"
  - "Poll pacing is a Timing struct (production 1..10 s, 120 s) that tests shrink; a paused tokio clock auto-advances during real socket IO and spuriously fires the 15 s call timeout"
  - "steamId is a decimal string (u64 exceeds JS number precision); Done and Error statuses are read-once"
  - "Transient Network/Timeout poll errors keep polling until the flow deadline; EResult ends the flow; Protocol ends it as network"
requirements-completed: [D-05, D-08, CF-08]
completed: 2026-11-15
---

# Phase 79 Plan 05: Web API QR sign-in and flow registry Summary

Sign-in over IAuthenticationService on HTTPS (no CM), with a crate-owned QR poll loop, challenge rotation, 120 s deadline, read-once token hand-out and a flowId registry.

## Tasks

| Task | Commit | Content |
| ---- | ------ | ------- |
| 1 | c073d3df2 | call helper (15 s, 64 KiB cap, x-eresult), local HTTP mock |
| 2 | 597c0b839 | QR flow, registry, poll loop, tests |

## Verification

- `cargo test -p gamelib-steamcm --lib -- webauth::` 14 passed (3 consecutive runs, stable); clippy `--all-targets -D warnings` and `cargo fmt --check` clean.
- Greps: 0 diag lines mentioning challenge/token/client_id; 0 `api.steampowered.com` in the mock.

## Deviations from Plan

**1. [Rule 3 - Blocking] reqwest `query`/`form` unavailable.** Built the encoded field manually instead of enabling features.

**2. [Rule 1 - Bug] Plan's "tokio::time paused" tests spuriously time out** (auto-advance while waiting on loopback IO). Introduced `Timing` and run the flow tests in real time with 20 ms polls and a 1 s deadline; the 1..=10 s clamp and 120 s production value are asserted in a unit test. The stalled-call timeout test still uses paused time.

**3. Plan verify command** `cargo test ... webauth::` is valid single-filter syntax and was used as `--lib -- webauth::`.

## Known Stubs

None in this plan's files (`webauth/credentials.rs` remains the 79-10 stub).

## Threat Flags

None. T-79-15..18 mitigations implemented (diag logs transitions only, size/time bounds, https base in production, flows removed on read/cancel).

## Self-Check: PASSED
