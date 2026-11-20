---
phase: 74-steam-game-updates
plan: 16
subsystem: steam-depot-delta
tags: [rust, delta, gap-closure, WR-09, IN-03]
requires: []
provides:
  - is_definitive_old_manifest_failure gate for the D-14 fallback
  - run_commit skips retired-file removal after any commit failure
affects: [gamelib-depot]
key-files:
  modified:
    - src-tauri/crates/gamelib-depot/src/delta.rs
    - src-tauri/crates/gamelib-depot/tests/delta_fallback.rs
    - src-tauri/crates/gamelib-depot/tests/support/delta_env.rs
decisions:
  - "Only ManifestDecode, ManifestUnavailable and CdnHttp 404/410 take the whole-install fallback; all else fails the run retryably"
metrics:
  tasks: 2
  files: 3
completed: 2026-11-13
---

# Phase 74 Plan 16: Delta fallback gate and commit-failure removals Summary

The delta falls back to a whole-install reconcile only when the old manifest is definitively gone, and a commit with any failure no longer removes retired files.

## What changed

- **WR-09.** `is_definitive_old_manifest_failure` (delta.rs) is true for `ManifestDecode`, `ManifestUnavailable` (which also covers "no request code", so that still falls back) and `CdnHttp` with 404/410. The old-manifest arm is now:
  `Some(Err(FetchError::Failed(f))) if is_definitive_old_manifest_failure(&f) => { warn; *fallback = true; Cancelled shell }`
  followed by `Some(Err(FetchError::Failed(f))) => return fail_outcome(&job.job_id, f, started)`.
  Resume path: this point is reached on a resume, but the earlier new-manifest load already returns a bare `fail_outcome` there, and no file is touched before this point, so I used the same bare `fail_outcome`. The journal is not modified, so the retry resumes normally.
- **IN-03.** In `run_commit` the `plan.removed` loop sits inside `if failures.is_empty() { ... } else if !plan.removed.is_empty() { warning "skipped removing N retired file(s) ..." }` (delta.rs ~691). The journal is kept on failure, and the existing resume path re-plans removals, so no new state was needed.
- Test helper `Env::fail_old_manifest(depot_id, status)`: one scripted `Reply::Status` (the fake CDN repeats the last reply, which outlasts fetch.rs's 8 attempts).
- New tests in delta_fallback.rs: `transient_old_manifest_failure_fails_without_fallback`, `transient_old_manifest_failure_keeps_retired_depot_files`, `commit_rename_failure_removes_no_retired_file`. The rename-failure test lives in delta_fallback.rs, not delta_resume.rs.

## Verification

- `cargo test -p gamelib-depot -p gamelib-depot-cli`: all green. The 503 tests take about 12 s each because of fetch.rs backoff.
- Clippy ratchet: PASS (darwin, toolchain 1.99.1), no rise.
- Prettier: `.rs` files have `inferredParser: null`, so no prettier check applies.
- `graphify update .` run.

## Deviations from Plan

None in behavior. Both tasks share delta.rs, so they were committed together in one commit (c488b0c8b) rather than two.

## Threat coverage

T-74-58 and T-74-59 mitigated and tested. Known stubs: none.

## Self-Check: PASSED
