---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 08
subsystem: steam-cm
tags: [rust, pics, steam-user-parity]
requires: [79-04]
provides: [ops::pics::product_info, licenses_json, appinfo_to_json, packageinfo_to_json]
key-files:
  created:
    - src-tauri/crates/gamelib-steamcm/tests/fixtures/pics/app.vdf
    - src-tauri/crates/gamelib-steamcm/tests/fixtures/pics/package.bin
  modified:
    - src-tauri/crates/gamelib-steamcm/src/ops/pics.rs
    - src-tauri/crates/gamelib-steamcm/src/fake.rs
requirements: [CF-05, D-03, D-04]
metrics:
  completed: 2026-11-15
---

# Phase 79 Plan 08: PICS and licence ops Summary

`ops/pics.rs` reproduces steam-user's `getProductInfo` result shape over `CmConn`, tokens first, with `depotOrder` per app and `licenses_json`.

## Commits
- 7128fd7a1: feat(79-08): both tasks (one file, committed together)

## Typing rules found in steam-user source (documented in the module doc)
- App text VDF: one trailing NUL stripped, `kvparser` semantics: all leaves strings; backslash makes next char literal (`\n` becomes the letter `n`); keys case-sensitive; repeated scalar last-wins; a repeated block key REPLACES the earlier block. Root other than `appinfo` gives `null`.
- Package buffer: 4-byte id prefix skipped, `[packageid]` of the root; Int32/Color/Ptr as i32; 64-bit as number up to 2^53 else decimal string; empty-named keys dropped; array-like and EMPTY objects become arrays (`convertObject`).
- Licences: 64-bit `access_token` is a decimal string (`toObject({longs: String})`); only the six `LicenseEntry` fields are emitted.
- Malformed, oversized (>4 MiB) or too-deep buffers give `CmError::Protocol("pics-parse")`.

## Deviations
- [Rule 3] `fake.rs` extended with `log`, `token_reqs`, `pics_reqs` so tests can assert call order and request tokens.
- Did not use `kv_text::merged`: it merges re-opened blocks and is case-insensitive, unlike kvparser. Walks the lossless `kv_text::parse` tree instead (still no new parser).
- steam-user itself requests first and re-requests `missingToken` ids with tokens; per plan/CF-05 this fetches tokens up front. steam-user does not chunk, so neither does this.
- Tasks 1 and 2 share one file and were committed together. Fixtures are hand-written (app.vdf, package.bin); real recorded buffers come with 79-21.
- `product_info` does not apply steam-user's licence-token fallback for packages (it has no licences input).

## Verification
`cargo test -p gamelib-steamcm --lib` 125 passed (9 new in ops::pics), clippy `--all-targets -D warnings` and `cargo fmt --check` clean.

## Self-Check: PASSED
