---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 07
subsystem: infra
tags: [rust, steam-depot, fixtures, parity]
requires: [73-02, 73-06]
provides:
  - fixture_builder (FixtureCase -> encrypted chunks + wrapped manifests + case.json)
  - seven committed deterministic CDN fixture cases under tests/fixtures/cases
affects: [73-08, 73-10]
tech-stack:
  added: []
  patterns: [render to in-memory path->bytes map, byte-compare against committed tree]
key-files:
  created:
    - src-tauri/crates/gamelib-depot/tests/support/fixture_builder.rs
    - src-tauri/crates/gamelib-depot/tests/fixtures_gen.rs
    - src-tauri/crates/gamelib-depot/tests/fixtures/README.md
    - src-tauri/crates/gamelib-depot/tests/fixtures/cases/ (7 cases)
key-decisions:
  - "Manifest gids are above 2^53 so 64-bit id handling is exercised by every case"
  - "Keys derive from sha1(case|depot); IVs from sha1(key|chunk sha); content from an inline splitmix64"
requirements-completed: [P73-A, D-14]
duration: 25min
completed: 2026-11-09
---

# Phase 73 Plan 07: Synthetic CDN fixtures Summary

Seven deterministic synthetic fixture cases (192 KiB total) covering every codec, wrapper and edge case of the D-14 corpus, built by an in-repo Rust generator and guarded by a non-ignored determinism test.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 | 46f990a52 | builder, `fixtures_gen` tests, seven committed cases |
| 2 | 36a093de3 | README; `case.json` and README prettier-clean (builder already emitted conformant JSON) |

## Verification

- `fixtures_are_deterministic` and `fixtures_parse_and_stay_small` pass without regeneration; every committed manifest parses through `parse_manifest` and matches its source file list.
- Clippy (1.99.1, `-D warnings`) and `cargo fmt` clean; prettier clean on README and all `case.json`.

## Deviations from Plan

**1. Determinism test compares in memory, not via a tempdir.** It renders every case in-process and byte-compares with the committed tree (also asserting identical file sets), which is stricter and needs no temp files.

**2. Extra test `fixtures_parse_and_stay_small`** holds the parse, case-list and 2 MiB cap assertions separately from the determinism test.

**3. `#[allow(clippy::vec_init_then_push)]` on `all_cases()`** to keep one block per case.

## Known Stubs

None. `expected.json` is deliberately absent; plan 08 produces it.

## Threat Flags

None. T-73-26 (synthetic keys and content, README ban, size cap) and T-73-27 (determinism test) mitigated.

## Self-Check: PASSED
