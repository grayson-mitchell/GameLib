---
phase: 75-steam-local-file-formats-in-rust
plan: 08
subsystem: steam-local-files
tags: [rust, vdf, readers]
requires: [75-04, 75-06, 75-07]
provides:
  - parse_valve_manifest, read_installscript, read_running_app_id, read_localconfig_beta_key
  - acf::is_valid_beta_key now pub
key-files:
  modified:
    - src-tauri/crates/gamelib-steamfiles/src/readers.rs
    - src-tauri/crates/gamelib-steamfiles/src/acf.rs
    - src-tauri/crates/gamelib-steamfiles/tests/readers.rs
requirements-completed: [STEAM-03, P75-A]
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 08: Non-ACF text-VDF readers Summary

Four Rust readers: Valve client manifest with D-05 guards and TS reason strings, installscript.vdf on the ordered view, fail-soft registry RunningAppID, and the localconfig UserAppConfig beta key decoded through the shared binary KV codec.

## Commits
- 5627963c9 test(75-08) valve/installscript RED
- 4c3a82898 feat(75-08) valve manifest + installscript
- afd0ffbf9 test(75-08) registry/localconfig RED
- 8c5ffdde3 feat(75-08) registry + localconfig readers

## Notes
- 21 tests in tests/readers.rs; full crate tests, clippy -D warnings and fmt pass.
- Registry lookup is case-insensitive (oracle was case-exact); record in plan 23.
- parse_bin accepts more binary types (wstr, ptr, color, int64) than the TS walker, which rejected them.

## Deviations from Plan

**1. [Rule 1 - Fixture defect] valve/*.vdf fixtures wrap the manifest in a `steam_client_win64` root**
- The TS oracle (expected.json) and the real Valve manifest need `win64` at the top level, so the committed fixtures all yield "no win64 root" and plan's "good.vdf -> ok true" cannot hold without breaking oracle parity.
- Fix: kept fixtures untouched (golden/oracle stays valid; a test asserts the wrapped shape gives "no win64 root"), and the success/shape cases use inline top-level manifests.

**2. localconfig/userappconfig.vdf hex is plain ASCII ("beta_a"), not a binary KV blob**, so the fixture yields None (matches oracle null). The Some case is tested with a generated binary blob.

## Self-Check: PASSED
