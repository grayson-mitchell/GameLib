---
phase: 84-logger
plan: 12
subsystem: logging
tags: [rust, store, log-upload, gap-closure, G-84-4]

requires:
  - phase: 84-logger
    provides: StoreHost / Store persist (store.rs) and the dpaste upload handler (log_upload.rs) reviewed in 84-REVIEW.md
provides:
  - persist_atomic that never truncates the live store file after a failed temp write (WR-03)
  - validate_paste_url that returns the parsed URL's serialisation (WR-07)
affects: [85-store-host-config-and-versioned-migrations, 84-18]

actuals:
  tokens: 2600
  tasks: 2
  commits: 4

plan_head_before: 6035b72b194d02ee46660770f811cc940c3acf0a
plan_head_after: 415b972065bce834bff362ceb436710b0dc9d396

tech-stack:
  added: []
  patterns:
    - "Persist fallback arms are distinct: a failed temp write returns the error; only temp-written-then-rename-failed falls back to a direct write"

key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-core/src/store.rs
    - src-tauri/src/log_upload.rs

key-decisions:
  - "WR-03 fix follows 84-REVIEW.md exactly: temp-write failure returns early after removing the temp file; the direct-write fallback is kept only for a failed rename"
  - "WR-07 fix follows 84-REVIEW.md exactly: return parsed.to_string(); callers unchanged"

requirements-completed: [FND-05]

coverage:
  - id: D1
    description: "A failed temp write in persist_atomic leaves the live store file byte-identical and returns the error; the in-memory value rolls back"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-core/src/store.rs#when_the_temp_write_fails_the_live_file_is_left_untouched"
        status: pass
      - kind: unit
        ref: "src-tauri/crates/gamelib-core/src/store.rs#a_failed_persist_rolls_the_in_memory_value_back_and_fires_nothing"
        status: pass
      - kind: unit
        ref: "src-tauri/crates/gamelib-core/src/store.rs#when_the_rename_fails_the_content_is_written_directly_and_no_temp_file_remains"
        status: pass
    human_judgment: false
  - id: D2
    description: "validate_paste_url returns the normalised URL, so the stored key, emitted event, log line and delete target carry no raw tab or line break"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src-tauri/src/log_upload.rs#log_upload_returns_the_parsed_url_not_the_raw_text"
        status: pass
      - kind: unit
        ref: "src-tauri/src/log_upload.rs#log_upload_records_the_normalised_url_when_the_response_embeds_a_line_break"
        status: pass
      - kind: unit
        ref: "src-tauri/src/log_upload.rs#log_upload_paste_urls_are_https_on_exactly_dpaste_com"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-11-22
status: complete
---

# Phase 84 Plan 12: WR-03 and WR-07 fixes Summary

**persist_atomic no longer truncates the live store file when the temp write fails, and validate_paste_url returns the parsed URL so a dpaste response with an embedded tab or line break cannot reach the store, the renderer event or the log.**

## Performance

- **Duration:** 14 min
- **Tasks:** 2 (a tracer task and an auto task, both TDD)
- **Files modified:** 2
- **Commits:** 4 (RED then GREEN per task)

## Accomplishments

- WR-03: `persist_atomic` now treats the temp write and the rename separately. A temp-write failure removes the temp file and returns the original `io::Error` without touching the live file; the direct-write fallback runs only when the temp file was fully written and the rename failed (the Windows open-reader case). The doc comment states both arms. `Store::set`/`remove` already rolled back on `Err`, unchanged.
- WR-07: `validate_paste_url` keeps its scheme, host, credential and port checks and returns `parsed.to_string()`; doc comment updated. Callers are unchanged: the upload handler already stores, emits and logs the returned value, and delete re-validates the stored key.

## Findings fixed

| Finding | Commit (fix) | Commit (RED test) | Test |
|---------|--------------|-------------------|------|
| WR-03 | `8f0e3e12f` | `2600b3dc8` | `when_the_temp_write_fails_the_live_file_is_left_untouched` (gamelib-core store) |
| WR-07 | `415b97206` | `27ee3dac1` | `log_upload_returns_the_parsed_url_not_the_raw_text`, `log_upload_records_the_normalised_url_when_the_response_embeds_a_line_break` (gamelib-shell log_upload) |

84-18 copies these into 84-REVIEW-DISPOSITION.md.

## TDD Gate Compliance

Both tasks ran RED, then GREEN; there was no REFACTOR commit.

- **RED, WR-03 (`2600b3dc8`):** `cargo test -p gamelib-core store::` ran 13 tests; the target `when_the_temp_write_fails_the_live_file_is_left_untouched` FAILED at store.rs:452 on `assert!(store.set("https://dpaste.com/NEW1", json!(1)).is_err())` (set returned Ok because the direct-write fallback truncated and rewrote the live file), the other 12 passed. Semantic assessment: the target executed and failed on the planned assertion for the intended reason (not a compile, fixture or zero-test fault). `gsd_run check tdd-red-evidence` was not used: cargo test console output is not one of its supported report formats, so the verdict above is the executor's own, from the unmodified output.
- **RED, WR-07 (`27ee3dac1`):** `cargo test --bin gamelib-shell log_upload`: `log_upload_returns_the_parsed_url_not_the_raw_text` FAILED (left `Some("https://dpaste.com/AB\nCD")`, right `Some("https://dpaste.com/ABCD")`) and `log_upload_records_the_normalised_url_when_the_response_embeds_a_line_break` FAILED (left `"https://dpaste.com/AB\nCD"`, right `"https://dpaste.com/ABCD"`); 24 others passed. Same semantic assessment; same caveat on the classifier.
- **GREEN:** `8f0e3e12f` (store, 13/13 pass) and `415b97206` (log_upload, 26/26 pass).

## Task Commits

1. Task 1 RED `2600b3dc8` test(84-12); GREEN `8f0e3e12f` fix(84-12) (tracer: verified end to end through `Store::set`, expanded to Task 2 only after the tracer test and the two neighbouring store tests passed)
2. Task 2 RED `27ee3dac1` test(84-12); GREEN `415b97206` fix(84-12)

## Verification

- `cargo test -p gamelib-core store::` 13 passed (the three named store tests listed ok); `cargo clippy -p gamelib-core --all-targets -- -D warnings` clean; `cargo fmt -p gamelib-core --check` clean.
- `cargo test --bin gamelib-shell log_upload` 26 passed (both new tests and `log_upload_paste_urls_are_https_on_exactly_dpaste_com` ok); `rustfmt --edition 2021 --check src/log_upload.rs` clean.
- No prettier check: `.rs` has no prettier parser, per the plan's `<verify>` notes.
- No file deletions in any commit. Only the two plan files were staged, by name.

## Deviations from Plan

None - plan executed exactly as written. (Each task produced a RED and a GREEN commit rather than one, per the TDD reference; the plan's explicit-path commit scope was kept for all four.)

## Coordination

85-09's files clause is met: this plan is the only Phase 84 gap-closure plan that modifies `src-tauri/crates/gamelib-core/src/store.rs` or `src-tauri/src/log_upload.rs`, and both changes are committed. The literal parenthetical of 85-09's precondition (every `gap_closure: true` PLAN in 84-logger has a SUMMARY) stays unmet until 84-18-SUMMARY.md exists, and 84-18 holds an operator push checkpoint. Which reading 85-09's executor applies is the operator's call; no Phase 85 file was edited. STATE.md, state.json and ROADMAP.md were deliberately left untouched (orchestrator override for this run); the orchestrator updates ROADMAP plan progress.

## Known Stubs

None.

## Threat Flags

None. T-84-38 (persist_atomic DoS) and T-84-39 (paste URL tampering) are mitigated as planned and covered by the new tests.

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-core/src/store.rs, src-tauri/src/log_upload.rs
- FOUND commits: 2600b3dc8, 8f0e3e12f, 27ee3dac1, 415b97206 (all ancestors of HEAD)
