---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 01
subsystem: steam-cm-rust
tags: [rust, steam-vent, workspace, ci, supply-chain]
requires: []
provides:
  - gamelib-steamcm crate (Tauri-free, stub modules for plans 79-04..79-35)
  - gamelib-steamcm-cli crate
  - compile-proven steam-vent pin 767481ad
affects: [79-04, 79-05, 79-14, 79-16]
tech-stack:
  added: [steam-vent (git 767481ad), steam-vent-proto 0.5.2, rsa 0.9, protobuf]
  patterns: [63/73/75 Tauri-free crate + CLI recipe, results-not-errors dispatch]
key-files:
  created:
    - src-tauri/crates/gamelib-steamcm/ (Cargo.toml, src/**, tests/vent_api_shapes.rs)
    - src-tauri/crates/gamelib-steamcm-cli/ (Cargo.toml, src/main.rs, tests/cli.rs)
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/deny.toml
    - .github/workflows/rust-test.yml
    - src/backend/__tests__/cargoFeatures.test.ts
    - package.json
key-decisions:
  - "steam-vent pin used: codeberg main 767481ad4eb91dd73f1c70bea6b15f8123a0a040 (no a9e8164 + vendor fallback needed)"
  - "D-01: lease + idle close, probe-on-failure + sleep detector, no periodic probe (recorded in the plan)"
requirements-completed: [CF-01, CF-02, CF-07, D-01, D-13]
duration: ~25 min
completed: 2026-11-15
---

# Phase 79 Plan 01: Crate pair, dependency gate and steam-vent pin Summary

The `gamelib-steamcm` / `gamelib-steamcm-cli` pair exists in the `src-tauri` workspace with every module stub later plans fill, steam-vent pinned at codeberg rev `767481ad4eb91dd73f1c70bea6b15f8123a0a040`, and an API-shape test plus a live anonymous-logon test proving that pin.

## Task 1: package legitimacy checkpoint (resolved by the orchestrator)

The orchestrator ran `git ls-remote https://codeberg.org/steam-vent/steam-vent HEAD`, which returned `767481ad4eb91dd73f1c70bea6b15f8123a0a040	HEAD` (matches the pin). The operator was shown steam-vent (git rev 767481ad, crates.io/crates/steam-vent, icewind), steam-vent-proto 0.5.2, rsa 0.9 (RustCrypto, RUSTSEC-2023-0071 deny.toml ignore) and protobuf (transitive), with wiremock noted as not used, and asked "Do you approve all four?". Operator's answer, verbatim: **"Approved"**. This covers steam-vent, steam-vent-proto, rsa and protobuf. No Cargo.toml was edited before the approval. No commit for this task.

## Tasks

| Task | Commit | Content |
| ---- | ------ | ------- |
| 2 | d6143952d | crates, stubs, workspace, CI, lockfile pin, deny.toml, package script |
| 3 | 1808cc395 | `tests/vent_api_shapes.rs` and ignored `anon_logon_live` |

## steam-vent pin used (CF-02)

`767481ad4eb91dd73f1c70bea6b15f8123a0a040` (codeberg main, resolves as steam-vent v0.6.0 in the lock). It compiled against every spike call shape, including `login_with_refresh_token_and_logon_id(&token, 0)`, so the fallback `a9e8164` + `vendor.sh` was not used and D-18's logonID lives on the Rust side as planned. The live anonymous PICS call for app 480 passed on this rev (`anon_logon_live`, 4.8 s).

Call-shape changes against the spike code (mechanical, in the test only): `CPlayer_GetOwnedGames` game rows expose `appid()` and `playtime_forever()` as `i32`, not `u32`. 79-27 must treat them as `i32`.

## Lockfile names added to EXPECTED_LOCKFILE_CRATE_NAMES (60)

another-steam-totp, array-init, async-stream, async-stream-impl, aws-lc-rs, aws-lc-sys, base64ct, binrw, binrw_derive, bytemuck_derive, chacha20, cmake, crc, crc-catalog, dashmap, data-encoding, der, directories, fs_extra, gamelib-steamcm, gamelib-steamcm-cli, h2, hmac, lazy_static, libm, lru-slab, num-bigint-dig, num-integer, num-iter, owo-colors, pem-rfc7468, pkcs1, pkcs8, protobuf, protobuf-support, quinn, quinn-proto, quinn-udp, rand_pcg, rsa, sha-1, sha1_smol, signature, spin, spki, steam-machine-id, steam-vent, steam-vent-core, steam-vent-crypto, steam-vent-proto, steam-vent-proto-common, steam-vent-proto-steam, steamid-ng, system-configuration, system-configuration-sys, tokio-stream, tokio-tungstenite, tungstenite, web-time, webpki-roots. None removed.

## Deviations from Plan

None to the plan's behaviour. Notes for later plans:

- **aws-lc-rs / aws-lc-sys / cmake entered the lock** through steam-vent's reqwest (default TLS feature) and rustls-platform-verifier. They compiled on this macOS machine. They may need cmake/NASM on the Windows CI leg; `install_crypto_provider()` explicitly installs ring (CF-07), so ring remains the active provider. If the Windows leg fails to build aws-lc-sys, that is the first place to look. Not verified on CI here.
- `rust-version = "1.89"` on both crates (gamelib-depot exception, as planned).

## Verification

- `cargo test -p gamelib-steamcm -p gamelib-steamcm-cli`: green (6 lib tests, 4 CLI tests, shapes test).
- `cargo clippy -p gamelib-steamcm -p gamelib-steamcm-cli -- -D warnings` and `--all-targets` for steamcm: green. `cargo fmt --check`: green.
- `pnpm exec jest src/backend/__tests__/cargoFeatures.test.ts`: 12 passed. `prettier --check` on the three JS/YAML/JSON files: pass (none are ignored).
- Ignored `anon_logon_live`: passed.
- `cargo deny` not run locally.

## Known Stubs

All module files under `src-tauri/crates/gamelib-steamcm/src/` other than `lib.rs` are intentional doc-only stubs; each names the plan that fills it. `OPS` and `CLI_ONLY_OPS` are empty until those plans register ops.

## Threat Flags

None beyond the plan's register.

## Self-Check: PASSED

Both commits exist (d6143952d, 1808cc395); crate, test, deny.toml and CI files exist.
