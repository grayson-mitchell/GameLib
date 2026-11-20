---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 05
subsystem: infra
tags: [rust, steam-depot, reconcile, acf, appmanifest, sha1]
requires: [73-01, 73-04]
provides:
  - reconcile_partial_state / verify_structural_integrity / sha1_file
  - build_app_manifest_text / write_app_manifest / measure_installed_bytes
  - can_write_full_ownership / should_finalize_after_throw / finalize
affects: [73-06, 73-09]
key-files:
  modified:
    - src-tauri/crates/gamelib-depot/src/reconcile.rs
    - src-tauri/crates/gamelib-depot/src/acf.rs
  created:
    - src-tauri/crates/gamelib-depot/tests/reconcile.rs
    - src-tauri/crates/gamelib-depot/tests/acf.rs
key-decisions:
  - "Reconcile results are indices into the caller's file slice (filenames repeat across depots)"
  - "StateFlags 4 requires spec.allow_full_ownership AND can_write_full_ownership; one call site in finalize"
requirements-completed: [P73-A, D-10, D-11]
duration: 30min
completed: 2026-11-09
---

# Phase 73 Plan 05: Reconcile and ACF finalize Summary

`reconcile.rs` ports the sha1-gated resume walk and the post-download structural check; `acf.rs` ports the appmanifest text builder, atomic write, measured SizeOnDisk, the full-ownership gate and the single `finalize`. Reconcile has 29 tests and acf has 32; clippy 1.99.1 `-D warnings` is clean.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 reconcile | 46c42300b | 29 tests (TS has 24 `it(`); streaming 1 MiB SHA1 on `spawn_blocking` behind a semaphore; cancel checked between files |
| 2 acf | 51fd2c478 | 32 tests incl. `policy_false_forces_1026`, `missing_root_measures_zero`, `atomic_write_no_tmp_left`, an exact golden string |

## Contracts for later plans

- `reconcile_partial_state(root, &[&ManifestFile], &CancellationToken, hash_threads) -> Result<ReconcileResult, ReconcileError>`. `ReconcileResult { skipped: Vec<usize>, queued: Vec<usize>, missing: Vec<String>, stale_dirs: Vec<usize>, bytes_verified, complete }`, plus `all_files_verified()`. Indices point into the input slice. `ReconcileError` is `Traversal(PathTraversal) | Io`.
- `verify_structural_integrity(root, &[&ManifestFile], case_insensitive) -> Result<StructuralVerifyResult, PathTraversal>` (sync; mismatch list capped at 10, count uncapped).
- `finalize(&FinalizeSpec, app_id, &[AttemptedDepot], &RunResult) -> Result<AcfWritten, Failure>`. `AttemptedDepot` is an alias of `job::PlannedDepot`. `RunResult { outcome: RunOutcome, failures, all_files_verified, all_modes_applied }` is new in `acf.rs`.
- `build_app_manifest_text` and `write_app_manifest` take an injected `last_updated` (unix seconds) so goldens are stable.

## Deviations from Plan

1. **[Rule 1 - shape] `ReconcileResult` fields.** Plan listed `skipped/queued: Vec<String>`. Used indices instead, because the same filename can appear in several depots and callers need to map back to the file. `missing` holds the queued filenames (what verify_only reports). Added `stale_dirs`.
2. **[Rule 2 - security] `installdir` containment.** `finalize` resolves the install root through `resolve_contained_path(steamapps/common, installdir)`, which the TS does not. Also `last_owner` is accepted only if all digits, else "0", so it cannot inject a VDF key.
3. **verify_structural_integrity** takes a flat file slice plus an explicit `case_insensitive` bool rather than a plan object.
4. The TS test "never writes StateFlags 4" in manifest.test.ts is stale (it predates the gate); it is not ported. The gate cases come from depot.finalize.test.ts and `canWriteFullOwnership`.

## Known Stubs

None.

## Self-Check: PASSED

Commits 46c42300b and 51fd2c478 exist; all four files present; `read_to_end`/`fs::read(` count in reconcile.rs is 0.
