---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 10
subsystem: steam-cm-rust
tags: [rust, web-api, credentials-signin, steam-guard, rsa]
requires: [79-05]
provides:
  - WebAuth::credentials_start (RSA PKCS#1 v1.5, BeginAuthSessionViaCredentials, shared poll loop)
  - WebAuth::guard_submit (UpdateAuthSessionWithSteamGuardCode)
  - CredStarted (serde tag status: guardRequired | waiting), GuardOutcome
affects: [79-14, 79-25]
key-files:
  modified:
    - src-tauri/crates/gamelib-steamcm/src/webauth/credentials.rs
    - src-tauri/crates/gamelib-steamcm/src/webauth/mod.rs
key-decisions:
  - "Credentials flows reuse qr_poll_loop (empty challenge url) with a separate 180 s Timing.credentials_timeout"
  - "FlowState gained guard_ctx (client_id, steam_id) so guard_submit is flowId-scoped (T-79-34)"
  - "Email codes are trimmed and upper-cased; device codes only trimmed (numeric, so equal to userSignIn.ts behaviour)"
  - "A flow not in guardRequired is reported as UnknownFlow by guard_submit; no request is made"
  - "Methods live on WebAuth and use its own flows registry rather than taking a Flows argument"
requirements-completed: [D-05, D-08]
completed: 2026-11-15
---

# Phase 79 Plan 10: Credentials and Steam Guard sign-in over the Web API Summary

Credentials sign-in in Rust over HTTPS only (no CM): RSA-encrypted password, confirmation mapping to guardRequired/waiting, and typed-code submission with a surviving flow on a wrong code.

## Tasks

| Task | Commit | Content |
| ---- | ------ | ------- |
| 1 + 2 | 88dc50cda | credentials_start, guard_submit, mock tests (both tasks edit one file and landed in one commit) |

## Verification

- `cargo test -p gamelib-steamcm --lib -- webauth::` 28 passed; clippy `--all-targets -D warnings` and `cargo fmt --check` clean.
- Greps: Pkcs1v15Encrypt 3, diag lines naming password/code/account 0, `rand =` in Cargo.toml 0, to_uppercase 1, UpdateAuthSessionWithSteamGuardCode 8.
- The mock test decrypts the posted ciphertext with a generated private key and asserts the plaintext password is absent from the posted bytes.

## Deviations from Plan

**1. [Rule 3 - Blocking] Touched webauth/mod.rs.** Added `Timing.credentials_timeout` (180 s production), `FlowState.guard_ctx`, and removed the `allow(dead_code)` on `FlowKind::Credentials`. Needed for the 180 s deadline and for flow-scoped guard submission.

**2. Signatures.** `credentials_start`/`guard_submit` are `WebAuth` methods using `self.flows`, not taking a separate `&Flows`.

**3. Password zeroing is best effort:** `into_bytes()` then `fill(0)` plus `black_box`. The plain `rsa` OsRng worked without enabling any Cargo feature.

## Known Stubs

None.

## Threat Flags

None. T-79-32/34/35 mitigations implemented; no Debug on secret-bearing types, no file writes. Live-only gaps (real typed email and mobile codes) are documented in the module doc for UAT-A in 79-25.

## Self-Check: PASSED
