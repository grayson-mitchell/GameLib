---
phase: 74-steam-game-updates
plan: 01
subsystem: steam-depot
tags: [rust, depot, delta, steam, chunk-level]
requires:
  - phase: 73-steam-depot-download-pipeline-in-rust
    provides: gamelib-depot crate, DepotRef.fromManifest reserved, finalize/ACF
provides:
  - delta::run_delta chunk-level update (plan, build-beside, commit)
  - delta::compute_work_set / removed_paths / DELTA_TMP_SUFFIX
  - wire fields DepotJob.retiredDepots, JobEventBody::Stage, Outcome.delta (DeltaReport/DeltaMode)
affects: [74-02, 74-03, 74-06]
tech-stack:
  added: []
  patterns: [build-beside-then-commit, SHA-1 verified local chunk reuse]
key-files:
  created:
    - src-tauri/crates/gamelib-depot/src/delta.rs
    - src-tauri/crates/gamelib-depot/tests/delta.rs
  modified:
    - src-tauri/crates/gamelib-depot/src/job.rs
    - src-tauri/crates/gamelib-depot/src/events.rs
    - src-tauri/crates/gamelib-depot/src/outcome.rs
    - src-tauri/crates/gamelib-depot/src/download.rs
    - src-tauri/crates/gamelib-depot/src/lib.rs
    - src-tauri/crates/gamelib-depot/tests/job_install.rs
key-decisions:
  - "Plan-pass result is only the CDN list; local chunks are re-read and re-SHA-1-checked at build time (TOCTOU)"
  - "A CDN chunk wanted more than once is fetched once and cached until its last user (per depot, per sha)"
  - "Delta all_modes_applied = no failures (unchanged files get no chmod attempt, so the install census rule does not apply)"
  - "Removal failures of a retired file are warnings, not failures; a failed rename is a failure and finalizes 1026"
patterns-established:
  - "Delta paths: validate every new-manifest entry (containment + symlink target) before any write"
requirements-completed: [STEAM-02, STEAM-02a]
duration: 45min
completed: 2026-11-12
---

# Phase 74 Plan 01: Chunk-level delta in gamelib-depot Summary

**Chunk-level delta update in `gamelib-depot`: SHA-1-verified reuse of local chunks, CDN fetch for the rest, temps built beside the old tree and committed by rename, with cancel/failure before commit leaving the old build and ACF untouched.**

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. Wire contracts and failing tests | d2bb5f475 | `retiredDepots`, `Stage` event + `ProgressEmitter::stage`, `DeltaMode`/`DeltaReport`/`Outcome.delta` (skipped when None), shape checks, 11 delta tests (RED) |
| 2. Implement delta and route | f03b6cf33 | `delta.rs` plan/build/commit, `run_install_inner` routes install jobs with `fromManifest` to `delta::run_delta` |

## Verification

- `cargo test -p gamelib-depot -p gamelib-depot-cli`: all green (71 lib, 11 delta, 12 job_install, rest unchanged)
- `cargo fmt -p gamelib-depot --check` clean; `cargo clippy -p gamelib-depot --all-targets` zero warnings
- `depotRustErrorMap.test.ts` parity test passes (ErrorKind / ERROR_KINDS unchanged, 16 entries)
- prettier has no Rust parser (`--file-info` inferredParser null), so `cargo fmt` is the formatter gate

## Deviations from Plan

**1. [Rule 3 - Blocking] Exhaustive match in events.rs test helper**
- Adding `JobEventBody::Stage` broke the `kinds()` match in `events.rs` tests; added a `"stage"` arm. Included in task 1 commit.

**2. [Rule 3 - Blocking] `retired_depots` added to the `depot_manifest_summary` probe `DepotJob` in `lib.rs`.**

**3. Helper visibility.** Private helpers in `download.rs` (`failure`, `failed`, `io_failed`, `hex`, `key_from_hex`, `write_all_at`, `apply_modes_sync`, `clear_stale_dir`, `place_symlink`, `outcome_shell`, `plain_failure`) became `pub(crate)` so `delta.rs` reuses them instead of duplicating; the install path is unchanged.

Otherwise the plan was executed as written. Auth gates: none.

## Known Stubs

None. `retiredDepots` is parsed and validated only; deleting its files, the commit-resume and file-level fallback modes (`DeltaMode::CommitResume`/`FileFallback`) and the old-manifest-unavailable fallback belong to plan 74-02 (an old-manifest load failure currently ends the job as `manifest_unavailable` before touching disk).

## Threat Flags

None beyond the plan's threat model; T-74-01..06 mitigations are implemented and tested (traversal, symlink targets, SHA-1 at plan and build time, owned-only deletes with case-fold guard, no secrets logged, wire id validation).

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-depot/src/delta.rs, tests/delta.rs
- FOUND commits: d2bb5f475, f03b6cf33
