---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 10
subsystem: backend
tags: [steam-depot, rust, verify-only, select-files, golden, parity]
requires: [73-08, 73-09]
provides:
  - verify_only, select_files and shared-redist (finalize null) job modes in run_install
  - manifest::summarize and the depot_manifest_summary dispatch op (45 s deadline)
  - manifest::normalize_depot_path (port of normalizeDepotPath)
  - Tier 1 golden test: Rust output equals the TS oracle expected.json
affects: [73-11]
key-files:
  created:
    - src-tauri/crates/gamelib-depot/tests/job_modes.rs
    - src-tauri/crates/gamelib-depot/tests/golden.rs
  modified:
    - src-tauri/crates/gamelib-depot/src/download.rs
    - src-tauri/crates/gamelib-depot/src/manifest.rs
    - src-tauri/crates/gamelib-depot/src/lib.rs
key-decisions:
  - "verify_only: RunResult.outcome is Cancelled whenever anything is queued (mirrors resume.ts), so StateFlags 4 is only reachable when the whole tree reconciles and modes heal; missing files are reported in Outcome.missing (normalised paths), not as failures"
  - "select_files never finalizes even if a FinalizeSpec is sent; unknown selectPaths produce one warning event ('N selected path(s) are not in any manifest...') and are not an error; depots with no picked file are left out of attemptedDepots"
  - "summarize returns Result<SummarizeResult, Failure>; the op answers {depots:[...]} on success and {error: Failure} on failure or deadline (kind manifest_unavailable), Err only for bad args"
  - "Pattern rule: a pattern containing '/' must equal the whole normalised path, otherwise it matches the basename (screenDepotPlanForSteamApi rule); directories and symlinks never match; fileCount/totalBytes cover non-directory entries; matches capped at 1000 per depot"
requirements-completed: [P73-A, D-02, D-07, D-12, D-13, D-14]
duration: 40min
completed: 2026-11-09
---

# Phase 73 Plan 10: Job modes, manifest summary and Tier 1 golden Summary

verify_only, select_files and shared-redist now run through the same `run_install` path as a normal install, `depot_manifest_summary` returns counts and pattern matches without the manifest, and the Rust pipeline equals the TS oracle `expected.json` on all seven fixture cases with no override.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 | 227c1019f | mode dispatch in `run_install_inner`, `summarize`, `depot_manifest_summary` op, `tests/job_modes.rs` |
| 2 | e926a35be | `tests/golden.rs` |

## Verification

- `cargo test -p gamelib-depot -p gamelib-depot-cli` green; `cargo +1.99.1 clippy -p gamelib-depot --all-targets -- -D warnings` clean; cargo fmt applied.
- Six named tests pass: `verify_only_fetches_nothing`, `verify_only_reports_missing_and_writes_1026`, `cancel_resume_fetches_only_missing`, `redist_job_writes_no_acf`, `select_files_writes_only_selected`, `summarize_matches_steam_api_and_omits_files`.
- Golden: `rust_matches_ts_oracle_on_every_case` compares 7 cases (asserts >= 7), also asserts the case directories and `expected.json` keys are the same set.
- Acceptance greps: `OPS` lists `depot_job_cancel`, `depot_job_run`, `depot_manifest_summary` in order (rustfmt put one per line); `Duration::from_secs(45)` count in manifest.rs is 1; `rustOverride` count in expected.json is 0.

## Parity result

No divergences. `expected.json` was not edited and no `rustOverride` or `divergenceNote` exists. Hardening from 73-05 (installdir containment, numeric last_owner) did not change any golden.

Verified on macOS (case-insensitive APFS) only: the `multi-depot-collision` test picks the `caseInsensitive` variant by `probe_case_insensitive`; the `caseSensitive` variant is exercised on a case-sensitive volume or Linux CI, not here. The Windows ReadOnly-attribute branch compiles under cfg(windows) but was not run.

## Deviations from Plan

**1. [Rule 3 - Blocking] `summarize` signature.** The plan wrote `-> SummarizeResult`, but a deadline must surface an error kind, so it returns `Result<SummarizeResult, Failure>`. The wire shape for the failure case (`{error: Failure}` with HTTP-style Ok) is something 73-11 must handle.

**2. Golden harness reads fixtures from disk.** It serves `cases/<name>/chunks` and `manifests` straight from the committed files (not via the fixture builder), so the test also pins the committed bytes. Cache dir is a separate tempdir so the compared tree matches the oracle's.

No other deviations.

## Notes for 73-11

- `Outcome.missing` is `Some(vec)` only for verify_only (normalised, lower-case `/` paths); `Outcome.files` is `Some` only for select_files and carries manifest-form filenames.
- verify_only emits `planned` and a final `progress`, no chunk traffic; its Outcome.status is `completed` even when files are missing (check `missing`/`allFilesVerified`); `error` only for heal failures, `cancelled` on cancel.
- Unknown select paths surface only as a `warning` event, not in the Outcome.
- The summary op does not register with the cancel registry; it is bounded by its 45 s deadline.

## Known Stubs

None.

## Threat Flags

None. T-73-36 (counts and capped matches only), T-73-37 (45 s deadline), T-73-38 (select still goes through `resolve_contained_path` inside `write_file`; non-manifest paths are only reported) and T-73-39 (full SHA1 reconcile; 4 only through `can_write_full_ownership`) are in place.

## Self-Check: PASSED

- FOUND: tests/job_modes.rs, tests/golden.rs, download.rs, manifest.rs, lib.rs
- FOUND commits: 227c1019f, e926a35be
