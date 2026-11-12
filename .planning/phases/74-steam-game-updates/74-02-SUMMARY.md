---
phase: 74-steam-game-updates
plan: 02
subsystem: steam-depot
tags: [rust, depot, delta, journal, resume, fallback]
requires:
  - phase: 74-steam-game-updates
    provides: delta::run_delta chunk-level update (plan 01)
provides:
  - commit journal at <steamapps>/gamelib-delta/<appId>.json (commit-resume discriminator)
  - DeltaMode::CommitResume and FileFallback produced
  - 1026 ACF with the OLD InstalledDepots GIDs on a commit-phase failure
  - retired-depot file deletion at commit
affects: [74-03, 74-06, 74-09, 74-10]
tech-stack:
  added: []
  patterns: [journal-gated resume, fallback routing via DeltaRoute]
key-files:
  created:
    - src-tauri/crates/gamelib-depot/tests/delta_resume.rs
    - src-tauri/crates/gamelib-depot/tests/delta_fallback.rs
    - src-tauri/crates/gamelib-depot/tests/support/delta_env.rs
  modified:
    - src-tauri/crates/gamelib-depot/src/delta.rs
    - src-tauri/crates/gamelib-depot/src/download.rs
key-decisions:
  - "Journal matches the job (new GIDs + fromManifest) -> commit-resume; any mismatch, malformed or unreadable journal -> file_fallback"
  - "A resume that fails or is cancelled before its own commit also finalizes 1026 with old GIDs (tree is already mixed)"
  - "Old GIDs in a failure ACF include retired depots (so the retry can still send them as retired)"
  - "Fresh runs never hash targets; only a matching journal triggers the already-new sha1 check"
patterns-established:
  - "run_delta returns DeltaRoute { Done(Box<Outcome>), Fallback }; download.rs re-runs a cloned job with fromManifest/retiredDepots cleared"
requirements-completed: [STEAM-02, STEAM-02a, STEAM-02b]
duration: 40min
completed: 2026-11-12
---

# Phase 74 Plan 02: Delta resume, commit-failure ACF and fallbacks Summary

**Journal-driven commit-resume for the chunk-level delta, 1026 ACF with the old GIDs on commit failure, D-14 file-level fallback when the old manifest is gone, and retired-depot cleanup, all in `gamelib-depot`.**

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1. Resume and failure tests (RED) | 0a3e68430 | delta_resume (5), delta_fallback (3), shared `support/delta_env.rs`; 4+3 failed against plan 01 code, `stale_temps_cleaned_on_fresh_run` already passed (build_file overwrites temps) |
| 2. Journal, resume, fallback, retired depots | ffc536732 | delta.rs / download.rs |
| 2b. Clippy fix | bb70ea417 | `DeltaRoute::Done(Box<Outcome>)` for `large_enum_variant` |

## Verification

- `cargo test -p gamelib-depot` all green (incl. delta 11, delta_resume 5, delta_fallback 3, job_install 12); `cargo test -p gamelib-depot-cli` green
- `cargo fmt -p gamelib-depot --check` clean; `cargo clippy -p gamelib-depot --all-targets` zero warnings
- prettier has no Rust parser, `cargo fmt` is the formatter gate. The two fallback tests that hit a 404 old manifest take about 12 s each due to the fetcher's 8-attempt retry backoff.

## Deviations from Plan

**1. [Rule 2 - Missing critical] Resume failing before its own commit also writes 1026.** After a kill mid-commit the ACF still says `4` over a half-new tree; a resume that then fails or is cancelled before commit would have left that. It now finalizes 1026 with the old GIDs (fresh runs still leave the ACF untouched, as planned).

**2. Fixture helpers shared via `tests/support/delta_env.rs`** (copy of plan 01's inline helpers plus journal/temp/hide-manifest helpers) instead of duplicating them in both new files; `tests/delta.rs` left as is.

**3. Fallback signalling.** `run_delta` wraps a private `delta_body` that sets a `fallback` flag instead of every early return being rewrapped; `DeltaRoute` is the public result.

## Known Stubs

None.

## Threat Flags

None beyond the plan model: T-74-07 (journal parsed by `deny_unknown_fields` struct, all ids numeric-checked, malformed = stale = full reconcile), T-74-08 (retired deletes use the same containment + case-folded ownership rule; unavailable retired manifest deletes nothing, tested), T-74-09 (1026 + kept journal, tested).

## Self-Check: PASSED

- FOUND: delta_resume.rs, delta_fallback.rs, support/delta_env.rs, 74-02-SUMMARY.md
- FOUND commits: 0a3e68430, ffc536732, bb70ea417
