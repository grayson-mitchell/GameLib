---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 21
subsystem: testing
tags: [steamcm, parity, golden, rust, jest, fixtures]
requires: [79-14, 79-17]
provides:
  - meta/gamelibSteamcmCli.ts (runSteamcmCliSync, runSteamcmNdjson, resolveSteamcmCliPath)
  - Tier 1 CM goldens (recorded anonymous PICS + synthetic account ops), Rust and Jest replay
affects: [79-24]
key-files:
  created:
    - meta/gamelibSteamcmCli.ts
    - meta/steamcmCaptureFixtures.ts
    - meta/__tests__/gamelibSteamcmCli.test.ts
    - src-tauri/crates/gamelib-steamcm/tests/golden.rs
    - src-tauri/crates/gamelib-steamcm/tests/fixtures/{invocations,expected,rust-results}.json
    - src-tauri/crates/gamelib-steamcm/tests/fixtures/raw/app-{480,1007,232250,220}.json
    - src-tauri/crates/gamelib-steamcm/tests/fixtures/overrides/*.json
    - src/backend/storeManagers/steam/cm/__tests__/steamcmGolden.test.ts
  modified:
    - package.json
    - src/backend/storeManagers/steam/cm/__tests__/RustCmClient.test.ts
requirements-completed: [CF-01, D-16]
duration: ~40min
completed: 2026-11-15
---

# Phase 79 Plan 21: Tier 1 CM parity goldens Summary

Recorded real anonymous PICS buffers for apps 480, 1007, 232250 and 220 from both implementations (Rust CLI capture and steam-user anonymous `getProductInfo`), plus 9 synthetic account-op cases, with a Rust golden replay and a Jest replay through `RustCmClient`.

## Commits

- 27b32e017: CLI spawn helper, capture script, recorded anonymous fixtures
- 662c64e53: golden.rs, synthetic fixtures, overrides, Jest replay, RustCmClient.test.ts moved onto the golden file

## What was built

- `meta/gamelibSteamcmCli.ts`: fresh `createFakeHomeProfile` per call, argv-form spawn, refuses the four secret ops on argv, `runSteamcmNdjson` writes requests to stdin and closes it (EOF shutdown runs).
- `meta/steamcmCaptureFixtures.ts` + `pnpm steamcm-capture-fixtures`: one-off maintainer tool. Ran it live; the anonymous CM worked, no account sign-in was involved. steam-user is loaded with `createRequire` rather than bundled (esbuild-bundled steam-user fails on its `system.pem` read).
- `golden.rs`: its own scripted `CmConn` (the in-crate `FakeConn` is `#[cfg(test)]`-private, unreachable from an integration test). `recorded_results` compares to `rust-results.json` (rewrite with `GAMELIB_WRITE_STEAMCM_RUST=1`); `matches_steam_user` compares to `expected.json` after the case's override.
- Jest `steamcmGolden.test.ts`: anti-vacuity (>= 13 cases, every case present in results and expected), overrides must carry class and cause, then per-case replay through the real client mapping. No cargo needed. `RustCmClient.test.ts` now reads its result fixtures from `rust-results.json`.

## Divergences recorded (overrides/)

- anon_pics_*: Rust adds `depotOrder` (class extra-rust-field). Every appinfo value, including string-typed leaves, matched steam-user exactly for all four public apps.
- licenses_three: `licenses_json` emits six fields; steam-user carries 12 more (omitted-field). The values of those 12 in expected are synthetic placeholders.
- owned_apps_two: `img_icon_url` omitted (omitted-field).
- content_servers_strings: `sourceid`, `preferred_server`, `NumEntriesInClientList` omitted; their expected values are synthetic.

## Known gaps, not hidden

- Account-op expected values are hand-derived from steam-user's source for the fields GameLib reads, not full protobuf shapes (steam-user also fills absent proto fields with null). Only the redeem receipt expectation was produced by running steam-user's own `binarykvparser` on the synthetic receipt.
- Empty `purchase_receipt_info`: Rust returns an empty `packageList`; steam-user's `BinaryKVParser.parse` throws on an empty buffer (measured), so its `redeemKey` never resolves. No golden case, since steam-user has no value to compare. The Rust behaviour is the safer one.
- steam-user's `getContentServers` treats an empty (truthy) `allowed_app_ids` array as a restriction; Rust treats empty as unrestricted. The real directory omits the key when empty, so the synthetic cases omit it too; not exercised.
- Not covered here: package PICS buffers (no recorded real package; 79-08 fixtures remain hand-written), the licence-token fallback, and any live signed-in session (Tier 2, 79-24). No signed-in read-only recording was done; the plan recorded anonymous data only.

## PII check (T-79-68)

The operator's SteamID and account name were extracted from local config and checked against every committed fixture file: 0 hits. Synthetic ids use 76561197960287930 (the public example id) and `example.invalid` hosts.

## Deviations from Plan

None needing a rule: all file targets and verify commands ran as written. The plan's `RustCmClient.test.ts` "inline fixtures" are replaced only where they carried result shapes; argument-shape and error-path assertions stay.

## Verification

- `cargo test -p gamelib-steamcm --test golden`: 2 passed; `cargo fmt --check` and `cargo clippy -p gamelib-steamcm --tests` clean.
- `pnpm exec jest src/backend/storeManagers/steam/cm meta/__tests__/gamelibSteamcmCli.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts`: pass; `pnpm codecheck` clean; prettier clean on all checked paths.

## Self-Check: PASSED

Files and both commits (27b32e017, 662c64e53) exist.
