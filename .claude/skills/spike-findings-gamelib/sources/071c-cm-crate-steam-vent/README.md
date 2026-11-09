---
spike: 071c
name: cm-crate-steam-vent
type: comparison
validates: "Given a plain cargo binary on steam-vent (codeberg main a9e8164, unreleased 0.6.0), when it logs on anonymously and with GameLib's stored refresh token, then PICS appinfo, licenses, depot key, request code and CDN hosts match steam-user"
verdict: WINNER (with caveats)
related: [071a, 071b, 010]
tags: [rust, steam, cm, steam-user, steam-vent, sidecar-retirement, pics, depot]
---

# Spike 071c: CM crate — steam-vent (and the 071 head-to-head)

## What This Validates

The same questions as 071a/071b, on `steam-vent`. Spike 010 (2026-07-20) rejected it at 0.5.0 as
"auth-only, no high-level APIs". The codeberg main branch (unreleased 0.6.0, `a9e8164`,
2026-11-08) is the one tested here, plus released 0.5.0 for the anonymous check (see trail).

## Research

From source:

- **A message pump with routing.** `MessageFilter` routes replies by job id (`on_job_id`,
  `on_job_id_multi`), delivers by message kind (`on::<T>()`, `one::<T>()`) and service
  notification (`on_notification::<T>()`), and buffers the rest (`take_unprocessed()`, at most
  32). A heartbeat is set up at logon.
- **Generic typed calls, no marker types:** `job::<Req, Rsp>(msg)`,
  `job_multi::<Req, Rsp>(msg)` (a stream until `JobMultiple::completed()`, implemented for PICS
  product info, so `response_pending` splits are handled), and `service_method(msg)` for any
  request with a `ServiceMethodRequest` impl. `steam-vent-proto` generates those impls.
- **Refresh-token logon sends no account name** (`login(&mut raw, None, token.subject, …)`).
- Auth: password plus Steam Guard (email or device code, device confirmation, shared secret). **No QR
  helper.** QR is two service calls (`Authentication.BeginAuthSessionViaQR#1` plus poll) whose protos
  exist (072).
- Logon shape: `client_os_type` 203, `chat_mode` 2, empty machine name, protocol 65580.
- Deps: rustls + webpki-roots; `reqwest` 0.13 defaults pull in **`aws-lc-rs`/`aws-lc-sys`** (C,
  built by `cc`), beside `ring`. `rust-protobuf` 3 (not prost). No OpenSSL.

## How to Run

```bash
cargo build --release
../071a-cm-crate-steamroom/run-authed.sh ./target/release/spike-071c-steam-vent authed \
  "$TMPDIR/gamelib-dev-secret-vault.json" 1062520 1062521        # -> out/authed.json
(cd anon-050 && cargo build --release && ./target/release/spike-071c-anon-050 480 8930 1145360 730)
```

## Investigation Trail

1. **Anonymous logon on main fails every time:** `LoginError(NoToken)`. In the 0.6 refactor,
   `anonymous()` builds a logon without `access_token`, and the shared `send_logon` now parses
   `access_token` into a `RefreshToken` and errors with `NoToken` if it's missing
   (`src/session.rs:233`). A main-branch regression; a one-line fix (skip the parse when
   anonymous).
2. **Anonymous on released 0.5.0** (`anon-050/`): logon ok, PICS for the four apps **ALL MATCH**
   steam-user (1/86/4/15 manifests). ~1.0–1.16 s per app (two round trips).
3. **Refresh-token logon on main, no account name:** ok in 1.7 s. Subscribing with
   `on::<CMsgClientLicenseList>()` *before* logon delivered **485 licenses** 58 ms after logon.
   `take_unprocessed()` still held 12 other messages (5501×3, 768, 5456, 767, 5587, 798, 5528,
   779, 9600, 782): nothing silently dropped, within the 32 cap.
4. **Depot inputs, app 1062520 / depot 1062521:** PICS via `job_multi` in 1 message, manifest
   gid `1849274456907275637`, depot key SHA-1 `641d4c98…` (**identical**, 4th client to agree),
   request code ok, 6 CDN servers. Round trips ~0.3–0.4 s.
5. **`job_multi` with an actually split answer was not exercised** (anonymous batching was
   blocked by step 1; the authed single-app answer came in one message).
6. **Maintenance:** codeberg, created 2025-05 (moved from GitHub), MIT. ≥50 commits since
   2026-08-01 by 4 authors, the most active and least single-author of the three. 0.6.0 is
   unreleased and breaking.

## Results — 071 head-to-head

GameLib only needs the **CM half**. The CDN half (manifest fetch, chunks, decrypt, decompress,
write) is already Rust in Phase 73's `gamelib-depot`, and it accepted the CM inputs from 071a.
So steamroom's biggest asset, its content pipeline, duplicates what GameLib owns, and its CM half
lacks a client architecture.

| | 071a steamroom | 071b steam-client-lib | 071c steam-vent (main) |
|---|---|---|---|
| Anonymous PICS = steam-user | ✓ | ✓ | ✓ on 0.5.0; ✗ **main regression** (NoToken) |
| Existing refresh token, no account name | ✓ (raw logon) | ✗ InvalidPassword; needs name | ✓ |
| License list | ⚠ dropped by `login()`; recording workaround | ✓ event | ✓ typed subscription |
| Depot key / request code / CDN hosts | ✓ / ✓ / ✓ | ✓ / ✓ / ✓ | ✓ / ✓ / ✓ |
| Message pump, heartbeat, concurrent calls | ✗ none | ✓ + reconnect | ✓ (reconnect not checked) |
| Multi-part PICS | ✓ | ✗ job model | ✓ `job_multi` (not exercised split) |
| Calls not built in | typed methods for all | ~50 lines of markers | none needed (generic typed calls) |
| QR sign-in | ✓ | ✗ (DIY) | ✗ (DIY, protos present) |
| Round trip | ~0.25 s (WS) | ~0.55 s (TCP, likely Nagle) | ~0.3–0.4 s |
| New native deps vs `src-tauri` | none (ring/rustls/prost already there) | **openssl-sys** (Linux) | **aws-lc-sys** |
| Protobuf runtime | prost (= shell) | rust-protobuf | rust-protobuf |
| Maintenance | 1 author, 7 months, 13★ | 1 main author, 7 years | 4 authors, most active; unreleased |

**Verdict: steam-vent is the best fit for the CM half, with caveats.** It has the client
architecture and logon semantics GameLib needs and the least code to write on top. The caveats:
pin a main commit or wait for 0.6.0; fix or patch the anonymous regression; accept or feature-gate
`aws-lc-sys`. **steamroom is the fallback** (zero new native deps, prost, QR built in, fastest),
but only with a message pump added upstream or in GameLib (~300 lines). **steam-client-lib** has
the best client engineering (reconnects, sans-IO), but the account-name requirement and OpenSSL
make it the hardest to adopt.

**Overall answer to 071:** CM traffic *can* leave Node. Every input the Phase 73 Rust pipeline
takes from steam-user is available from Rust, identical where comparable. Spike 010's blocker,
"Rust has no PICS/depot/CDN", no longer holds for any of the three crates.
