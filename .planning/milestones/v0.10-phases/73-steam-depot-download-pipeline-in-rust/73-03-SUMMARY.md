---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 03
subsystem: infra
tags: [rust, steam-depot, reqwest, cdn, host-health]
requires: [73-01]
provides:
  - HostHealthTracker, StallTracker, InflightLimiter (TS constants as named consts with origin comments)
  - Fetcher (fetch_chunk, fetch_manifest, FetchError) with CDN token acquisition through JobHost
  - tests/support/fake_cdn.rs and fake_host.rs, reusable by later integration tests
affects: [73-04, 73-09, 73-10]
tech-stack:
  added: []
  patterns: [process-wide reqwest client with Policy::none, JobHost calls only via spawn_blocking, redacting non-Debug token cache]
key-files:
  created:
    - src-tauri/crates/gamelib-depot/tests/fetch.rs
    - src-tauri/crates/gamelib-depot/tests/support/fake_cdn.rs
    - src-tauri/crates/gamelib-depot/tests/support/fake_host.rs
  modified:
    - src-tauri/crates/gamelib-depot/src/host_health.rs
    - src-tauri/crates/gamelib-depot/src/stall.rs
    - src-tauri/crates/gamelib-depot/src/inflight.rs
    - src-tauri/crates/gamelib-depot/src/fetch.rs
    - src-tauri/crates/gamelib-depot/Cargo.toml
key-decisions:
  - "reqwest gzip stays off and Accept-Encoding is not forced: chunk bodies are application/x-steam-chunk with no content encoding, so undici's auto-gunzip was never exercised on them"
  - "fetch_chunk returns still-encrypted bytes plus the serving host; decode and the size/SHA1 gate stay with the caller (container::decode_chunk)"
  - "A failed Node token call degrades to a token-less request with a 60 s cooldown, as in cdnAuth.ts; the attempt loop decides the failure"
requirements-completed: [P73-A, D-03, D-04]
duration: 40min
completed: 2026-11-09
---

# Phase 73 Plan 03: Network layer Summary

Host scoring and failover, stall clock, in-flight limiter and the chunk/manifest attempt loop, ported from `hostHealth.ts`, `stallTracker.ts`, `inflightLimiter.ts` and `decompress.ts` with every constant kept and its TS origin cited.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 | bf47e1fa7 | HostHealthTracker (28 tests, one per TS `it`), StallTracker (explicit-time API), InflightLimiter over an owned-permit semaphore (8 tests) |
| 2 | ea8ebeddb | Fetcher, fake CDN, fake JobHost, 14 integration tests |

## Verification

- `cargo test -p gamelib-depot`: 58 unit + 21 container + 14 fetch tests pass (fetch run three times, stable).
- `cargo +1.99.1 clippy -p gamelib-depot --all-targets -- -D warnings`: clean.
- `cargo tree -p gamelib-depot | grep -c aws-lc` = 0. Policy::none count 1, UA string count 1, spawn_blocking count 3.
- Cargo.lock unchanged (the only manifest change is the tokio `test-util` feature as a dev-dependency).

## Deviations from Plan

**1. [Rule 3 - Blocking] Fetcher return type is `Result<_, FetchError>`, not `Result<_, Failure>`.** The plan's behaviours require a distinct Cancelled outcome that is never a failure, so `FetchError::{Cancelled, Failed(Failure)}` carries both.

**2. [Rule 3 - Blocking] Paused-clock tests limited to the hang case.** With `start_paused`, tokio auto-advanced the clock while loopback I/O was still in flight and produced spurious timeouts in the exhaustion and token tests. `attempt_timeout_15s` keeps the paused clock (a hung server has no competing I/O); the others use real time with `Fetcher::with_backoff(1, 3)` and `with_budget`. The 200/400/800/1600/3000 schedule is covered by a unit test on the backoff function.

**3. Added `tokio` `test-util` dev-dependency** to `Cargo.toml` (not in the plan's file list) for the paused-clock test; no new crate.

**4. Host health is recorded at fetch success,** not after decode as in TS (decode lives with the caller). A decode failure is deterministic and host-independent in TS too (cycle 17), so this does not change host choice in practice.

## Known Stubs

None. The `StallTracker` held by `Fetcher` is exposed via `stall()` but only the caller records progress (bytes written), as in TS; wiring happens in the download plans.

## Threat Flags

None. T-73-09..12 mitigations implemented and tested (no redirects, tokens never in Failure/Debug/emits, 15 s timeout with 8 attempts, JobHost only on spawn_blocking).

## Self-Check: PASSED
