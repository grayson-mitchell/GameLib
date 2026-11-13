---
phase: quick-261114-gki
plan: 01
subsystem: gamelib-depot (Rust delta update)
tags: [delta, bridge-update, pause-resume, temps]
requirements: [TODO-2026-11-13-bridge-update-resume-keeps-verified-temps]
key-files:
  modified:
    - src-tauri/crates/gamelib-depot/src/delta.rs
    - src-tauri/crates/gamelib-depot/tests/delta_resume.rs
    - src-tauri/crates/gamelib-depot/tests/delta.rs
    - src-tauri/crates/gamelib-depot/tests/support/delta_env.rs
    - src-tauri/crates/gamelib-depot/tests/support/fake_cdn.rs
    - .planning/todos/completed/2026-11-13-bridge-update-resume-keeps-verified-temps.md
commits:
  - a4f46948d test (RED)
  - 51f47623d fix (GREEN)
  - 5f7e350da docs (todo closed)
completed: 2026-11-14
---

# Quick 261114-gki: Keep SHA-verified temps when a bridge update is paused

A paused delta update now keeps every temp that passed its whole-file SHA-1, and the next run of
the same target build re-hashes and reuses them, so only the missing bytes are fetched.

## What changed

- `delta.rs`: new `TempLedger` (`{steamapps}/gamelib-delta/{appId}.temps.json`, camelCase,
  `deny_unknown_fields`, keyed on target `newGids`, names in manifest form). Helpers
  `read_temp_ledger`, `write_temp_ledger`, `discard_temp_ledger`, `ledger_temp`, and a shared
  `write_state_file` factored out of `write_journal` (behaviour unchanged, ledger uses its own tmp name).
- Reuse pass replaces the unconditional temp deletion: with a matching, well-formed ledger a temp is
  reused iff size and SHA-1 match the new manifest; every other temp (non-ledger, mismatched, orphaned
  ledger names, `already` temps) is deleted. A mismatched target logs a warning and starts clean.
  Cancel during the re-hash returns Cancelled and leaves the ledger.
- Prebuilt works stay in `works` (commit and report include them) but are skipped by the plan pass
  and the build pool, so their chunks are never requested. Counters `done_bytes` and `files_done`
  are seeded, one forced progress frame is emitted, and a "resuming paused update: reusing N
  verified files (M bytes)" warning is logged.
- Build pool yields `(index, result)`; `verified` is tracked per work. The pre-commit cleanup is split:
  pause keeps verified non-empty temps and writes the ledger (or removes it when none are kept; a
  ledger write failure deletes the kept temps and warns); error deletes everything. The duplicate
  deletion was dropped, and `remove_temps` removed as unused.
- Ledger is removed before the commit; both fallback returns (stale journal, old manifest
  unavailable) sweep ledger and kept temps first.
- Tests: `pause_keeps_verified_temps_and_resume_skips_them`, `resume_rebuilds_mismatched_temps`
  (flip and truncate variants), `changed_target_starts_clean`, `error_deletes_all_temps`;
  `stale_journal_falls_back` and `delta_cancel_before_commit_keeps_old` extended. Helpers
  `Env::temp_ledger_path`, `Env::write_temp_ledger`, `FakeCdn::replies`.

## Verification

- RED: the 5 new/extended resume tests failed on the old code for the expected reasons.
- GREEN: `cargo test -p gamelib-depot` fully passes; the delta and delta_resume suites passed 5
  consecutive runs (no flake in the timing-based pause test).
- `cargo fmt -p gamelib-depot -- --check` clean. clippy (1.99.1, `--all-targets`) on the touched
  files: 0 warnings before and after.
- `pnpm planning-gates` 12/12 pass. Prettier check omitted per plan (Rust and prettier-ignored
  `.planning` paths; no parser).

## Deviations from Plan

None. One note: the pause test waits for b/c temps to hold their new bytes, then sleeps 400ms so
the whole-file SHA-1 finishes before cancelling, because the temp content is complete slightly before
verification.

## Known gaps

The operator has NOT live-verified a pause and resume on a real bridge update; coverage is the
crate integration tests only. The orphan-journal todo and the estimate accuracy gap remain out of scope.

## Self-Check: PASSED

Commits a4f46948d, 51f47623d, 5f7e350da exist; delta.rs contains `TempLedger`, `temps.json`,
`resuming paused update`; the "never reused" comment is gone.
