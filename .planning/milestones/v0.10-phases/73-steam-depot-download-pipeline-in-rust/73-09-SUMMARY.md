---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 09
subsystem: backend
tags: [steam-depot, rust, tokio, download, progress-events]
requires: [73-03, 73-04, 73-05, 73-06, 73-07]
provides:
  - download::write_file (chunks -> positional writes -> whole-file SHA1 -> modes)
  - download::run_files (bounded workers, run-scoped stall give-up, structural re-verify)
  - download::run_install (manifests -> collisions -> reconcile -> heal -> workers -> finalize)
  - events::ProgressEmitter (throttle, heartbeat, coalesced warnings, seq)
  - run_job and the depot_job_run dispatch op
affects: [73-10, 73-11]
key-files:
  created:
    - src-tauri/crates/gamelib-depot/tests/job_install.rs
  modified:
    - src-tauri/crates/gamelib-depot/src/download.rs
    - src-tauri/crates/gamelib-depot/src/events.rs
    - src-tauri/crates/gamelib-depot/src/lib.rs
key-decisions:
  - "ChunkSource trait (Fetcher in production, in-memory in unit tests) instead of a concrete Fetcher in RunCtx"
  - "A failed or cancelled file drains its in-flight chunk tasks before returning: spawn_blocking work cannot be aborted, so draining is what makes 'no writes after run_job returns' true"
  - "Outcome failures are reordered primary-first and capped at OUTCOME_FAILURE_CAP (100)"
  - "Warning events: identical messages coalesce (count, at most 1/s), hard cap 50 frames then one 'suppressed' frame; emitter.close() silences everything after the Outcome"
  - "Mode notes (hidden-flag no-ops, Mach-O fallback notices) are aggregated into one 'file mode notes: N' warning, not one frame per file"
  - "Non-install modes return an error Outcome until 73-10 adds verify_only/select_files"
requirements-completed: [P73-A, P73-D, D-04, D-06, D-07, D-11]
duration: 55min
completed: 2026-11-09
---

# Phase 73 Plan 09: Install job, progress events and depot_job_run Summary

The Rust install job now runs end to end over the synthetic CDN: every file is written at its chunk offsets with `write_all_at`/`seek_write`, whole-file SHA1 checked, modes applied, symlinks contained, then one `acf::finalize` call on completed, cancelled and error paths; `depot_job_run` is a dispatch op returning the `Outcome`.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 | cda6128b9 | `write_file`, `run_files`, `run_install`, `ProgressEmitter` (events.rs was needed to compile download.rs, so it landed here) |
| 2 | 03761a617 | `run_job` runtime, `depot_job_run` in `OPS`, `tests/job_install.rs` |

## Verification

- `cargo test -p gamelib-depot` green (69 lib, 8 `job_install`, plus earlier suites); `cargo +1.99.1 clippy -p gamelib-depot --all-targets -- -D warnings` clean; cargo fmt applied.
- Named tests pass: `out_of_order_chunks_assemble`, `whole_file_sha1_mismatch_is_file_failure`, `enospc_maps_to_disk_full`, `stale_dir_cleared`, `install_zip_deflate_matches_fixture`, `events_throttle_and_heartbeat`, `cancel_still_finalizes_1026`, `no_writes_after_return`, `from_manifest_rejected_without_network`. Also `failed_file_still_finalizes_1026`, `manifests_load_before_any_chunk_and_collisions_warn`, `dispatch_runs_the_job_op`, and emitter unit tests on a paused clock.
- Acceptance greps: `write_all_at|seek_write` 5, `TS origin` 2, `emit(` in download.rs 0, `depot_job_run` in `OPS` 1.

## Deviations from Plan

**1. [Rule 3 - Blocking] Test encoder reuse.** Unit tests in download.rs need the integration tests' chunk encoder. An inline-module `#[path]` cannot resolve through a non-existent directory, so it is included once at file level as `#[cfg(test)] mod test_encode`.

**2. [Rule 3 - Blocking] `NullHost` moved to `events::test_support`.** The acceptance grep requires zero `emit(` in download.rs, and a `JobHost` test double must define `fn emit`.

**3. Task split.** `events.rs` belongs to Task 2 in the plan but download.rs depends on it, so it was committed with Task 1.

No other deviations. `write_file` takes a `FileJob` (depot id, key, manifest, index, seed) rather than `(ctx, root, file)`, because the chunk fetch needs the depot key and host-rotation seed.

## Behaviour notes for downstream plans

- `delta_unsupported`, bad-mode and install-root errors return before any event and without finalize (no download attempted). Manifest load failure or cancel during manifest load also skips finalize, as TS does (finalize only after the plan is built).
- `attemptedDepots` sizes are post-collision-drop, matching `expected.json` for `multi-depot-collision` (1500 / 1350). `ownerAppId` and `appinfoRank` (depot index) feed `detect_path_collisions` as 73-08 documented.
- `stats.pathCollisions` = resolved + unresolved collision paths.
- `should_finalize_after_throw` is not called: the pre-download exits return before the finalize call, so the gate is structural.
- No `HostSummary` event is emitted yet (Fetcher exposes no per-host totals).
- Verified on macOS only; the Windows branches (`seek_write`, `symlink_file`, error codes 112/39) compile-gated but not run here.

## Known Stubs

None.

## Threat Flags

None. T-73-31..35 mitigations are in place: all paths through `resolve_contained_path`, per-chunk then whole-file SHA1 before modes, throttled and capped events, decode semaphore `max(1, min(cpus-1, 4))` with 2 async workers, cancel checked per file/chunk/backoff, warnings carry host/path text only.

## Self-Check: PASSED

- FOUND: download.rs, events.rs, lib.rs, tests/job_install.rs
- FOUND commits: cda6128b9, 03761a617
