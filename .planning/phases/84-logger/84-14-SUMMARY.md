---
phase: 84-logger
plan: 14
subsystem: logging
tags: [rust, gamelib-log, writer, sanitiser, rate-limiter, golden-harness, gap-closure, G-84-1, G-84-4]

requires:
  - phase: 84-logger
    provides: the gamelib-log writer, sanitiser, limiter and golden harness reviewed in 84-REVIEW.md and 84-UAT.md
provides:
  - golden tokenise that normalises a whole Windows path (space in a folder name) to the end of its line (G-84-1)
  - renderer object values and native-origin entries cut at their caps with the shared marker (WR-04)
  - a drop report that counts entries, not channel messages (IN-01)
  - owed rotations for non-general targets whose frame was dropped on a full channel (WR-05, Rust half)
  - limiter windows anchored at the entry timestamp clamped to the Logger clock (IN-02)
affects: [84-15, 84-18]

actuals:
  tokens: 5400
  tasks: 3
  commits: 3

plan_head_before: 46dff281035e3dc2274a3a13fd48ccb04d1a5e0c
plan_head_after: 6a385ab97521eac3430cc99e3d1b5dc5db48d7ff

tech-stack:
  added: []
  patterns:
    - "One UTF-16 cutting rule (sanitize::truncate_utf16) shared by the renderer sanitiser and the native-entry cap"
    - "A lost rotation is a debt: Logger::send records it in a shared deduplicated set and WriterState::write_batch pays it on the target's next batch"
    - "The limiter is fed min(entry ts, Logger clock); the line is still formatted from the entry's own ts and tz"

key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-log/tests/golden.rs
    - src-tauri/crates/gamelib-log/src/sanitize.rs
    - src-tauri/crates/gamelib-log/src/writer.rs
    - src-tauri/crates/gamelib-log/src/limiter.rs

key-decisions:
  - "Owed rotations are an Arc<Mutex<Vec<LogTarget>>> shared by Logger and WriterState (LogTarget is not Hash); a poisoned lock is recovered with into_inner, never a panic on the logging path"
  - "The frame path (Logger::submit) is not re-cut at LOG_ENTRY_MAX_UTF16: the frame parser already rejects an over-cap entry, so only submit_line (native origin) cuts"
  - "A dropped general-target batch owes nothing: gamelib.log rotates once per Logger"

requirements-completed: [FND-05]

coverage:
  - id: D1
    description: "The golden harness's tokenise ends a LOGDIR path at a line break or quote, so a Windows path with a space is compared whole (proven on every OS by a pure unit test)"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-log/tests/golden.rs#tokenise_normalises_a_windows_path_with_a_space_to_the_end_of_the_line"
        status: pass
      - kind: unit
        ref: "src-tauri/crates/gamelib-log/tests/golden.rs#tokenise_ends_a_path_at_a_quote"
        status: pass
    human_judgment: true
    rationale: "The windows-latest CI leg itself (case chunks-wine-header) is re-proven on CI by 84-18 after an operator-authorised push; it cannot be observed from this Mac"
  - id: D2
    description: "Renderer object values and native entries are cut at LOG_TEXT_MAX / LOG_ENTRY_MAX_UTF16 with the truncation marker"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-log/src/sanitize.rs#an_object_value_is_cut_at_the_text_cap_with_a_marker"
        status: pass
      - kind: unit
        ref: "src-tauri/crates/gamelib-log/src/writer.rs#a_native_entry_over_the_entry_cap_is_cut_with_a_marker"
        status: pass
    human_judgment: false
  - id: D3
    description: "The writer's lines-dropped report counts entries in the dropped frames"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-log/src/writer.rs#the_drop_report_counts_entries_not_messages"
        status: pass
    human_judgment: false
  - id: D4
    description: "A frame dropped on a full channel no longer loses its rotation: the target's next batch rotates and logs Logging to file(s)"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-log/src/writer.rs#a_rotation_in_a_dropped_frame_is_applied_to_the_next_batch_for_that_target"
        status: pass
      - kind: unit
        ref: "src-tauri/crates/gamelib-log/src/writer.rs#a_dropped_general_batch_owes_no_rotation"
        status: pass
    human_judgment: false
  - id: D5
    description: "A sender timestamp in the future cannot hold a rate-limit window open past the Logger clock"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src-tauri/crates/gamelib-log/src/writer.rs#a_future_timestamp_cannot_hold_a_window_open_past_the_logger_clock"
        status: pass
      - kind: integration
        ref: "cargo test -p gamelib-log --test limiter_golden"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-11-21
status: complete
---

# Phase 84 Plan 14: gamelib-log gap closure Summary

**Golden-harness Windows-path fix plus four 84-REVIEW findings in the gamelib-log writer and sanitiser (entry caps, entry-counted drop report, owed rotations, clock-clamped limiter), each with a regression test.**

## Performance

- **Duration:** about 25 min
- **Started:** 2026-11-21T18:15:00Z
- **Completed:** 2026-11-21T18:42:00Z
- **Tasks:** 3
- **Files modified:** 4 (all in `src-tauri/crates/gamelib-log`)

## Findings fixed

| Finding | Commit | Test(s) |
| ------- | ------ | ------- |
| G-84-1 (harness `tokenise` cut a Windows path at a space) | `1c70a61c1` | `tokenise_normalises_a_windows_path_with_a_space_to_the_end_of_the_line`, `tokenise_ends_a_path_at_a_quote` (golden.rs) |
| WR-04 (renderer object values and native entries uncapped) | `720fb9d86` | `an_object_value_is_cut_at_the_text_cap_with_a_marker` (sanitize.rs), `a_native_entry_over_the_entry_cap_is_cut_with_a_marker` (writer.rs) |
| IN-01 (drop report counted messages) | `720fb9d86` | `the_drop_report_counts_entries_not_messages` (writer.rs) |
| WR-05, Rust half (dropped frame lost its rotation) | `6a385ab97` | `a_rotation_in_a_dropped_frame_is_applied_to_the_next_batch_for_that_target`, `a_dropped_general_batch_owes_no_rotation` (writer.rs) |
| IN-02 (future sender stamp held a limiter window open) | `6a385ab97` | `a_future_timestamp_cannot_hold_a_window_open_past_the_logger_clock` (writer.rs) |

## Accomplishments

- G-84-1: `tokenise` now ends a `${LOGDIR}` path at `\n`, `\r`, `'` or `"` instead of any whitespace, so
  `${LOGDIR}/games/Game Name_gog\launch.log` is normalised to the end of the line. The writer, the fixtures and
  NOTES.md are unchanged. The new Windows-shaped test is a plain `#[test]` on the pure function, so it runs on
  macOS and Linux too.
- WR-04: `truncate_text` is now `sanitize::truncate_utf16(value, limit)` (crate-visible, same surrogate and
  marker rules); the Object arm cuts each value at `LOG_TEXT_MAX` before `pretty_object`, and
  `Logger::submit_line` cuts at `frame::LOG_ENTRY_MAX_UTF16`. The sanitize module doc now says what is cut where.
- IN-01: `Logger::send` adds the entry count of the dropped message's batches; the report text
  `log writer: {n} lines dropped (ingest full)` is unchanged.
- WR-05 (Rust half): `Logger` and `WriterState` share an owed-rotation set; a dropped non-general
  `rotate: true` batch records its target and the target's next batch rotates and logs `Logging to file(s)`.
  The TS half (queue eviction and the rejected Promise message) is plan 84-15.
- IN-02: `WriterState::limit` anchors `expire` and `admit` at `min(entry ts, Logger clock)`; limiter.rs's module
  doc says why. The line is still formatted from the entry's own `ts` and `tz`.

## Task Commits

1. **Task 1: tracer, G-84-1 tokenise** - `1c70a61c1` (fix; test and predicate change in one commit, see RED evidence)
2. **Task 2: WR-04 caps, IN-01 drop count** - `720fb9d86` (fix)
3. **Task 3: WR-05 owed rotations, IN-02 clock clamp** - `6a385ab97` (fix)

**Plan metadata:** the docs commit that adds this SUMMARY.

## RED evidence

Each test was written and run before its fix; each failed on the planned assertion.

- Task 1: both `tokenise_*` tests failed with `left: "...Game Name_gog\\launch.log..."` against
  `right: "...Game Name_gog/launch.log..."` (the part after the space kept its backslashes). Semantic assessment:
  the target tests executed and failed on the planned assertion, not a build or fixture fault.
- Task 2: `the_drop_report_counts_entries_not_messages` failed `left: 5001, right: 5200` (905 dropped messages plus 4,096
  written lines; per-message counting); `a_native_entry_over_the_entry_cap_is_cut_with_a_marker` failed on
  `marker missing`; `an_object_value_is_cut_at_the_text_cap_with_a_marker` failed with the untruncated stack.
- Task 3: `a_rotation_in_a_dropped_frame_...` failed because `launch.log.old` was empty (no rotation);
  `a_future_timestamp_cannot_hold_a_window_open_past_the_logger_clock` failed because the summary was not
  written before a flush.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] Test-authoring fixes found while writing the RED tests**
- **Found during:** Tasks 1 and 2
- **Issue:** `serde_json::json!` orders object keys alphabetically, so the object-cap test could not assert the
  sender's key order through `json!`; two writer-test count assertions counted a letter that also appears in the
  line prefix or marker (`Backend`, `bytes`); clippy's `manual_pattern_char_comparison` rejected the closure
  form of the new `find` predicate.
- **Fix:** built the object test from a JSON string (`serde_json::from_str`), compared the last token of the line
  instead of counting characters, and used `find(['\n', '\r', '\'', '"'])`.
- **Files modified:** tests/golden.rs, src/sanitize.rs, src/writer.rs
- **Committed in:** `1c70a61c1`, `720fb9d86`, `6a385ab97`

**2. [Process] The drop-report test's `lines dropped` match was narrowed in the Task 3 commit**
- **Issue:** the plan's acceptance criterion wants `grep -c "lines dropped (ingest full)" writer.rs` unchanged at 2.
  The Task 2 test matched the full phrase (count 3). A failed `sed` in the Task 2 commit command meant the
  narrowing did not land until Task 3's commit.
- **Fix:** the test matches `lines dropped` only; the count is 2 at the end of the plan, as at HEAD.
- **Committed in:** `6a385ab97`

---

**Total deviations:** 2 (1 test-authoring Rule 1, 1 process note). **Impact on plan:** none on production behaviour.
No existing test relied on a future-stamped entry anchoring a window, so no clock-driving rewrite of an existing test
was needed, and no assertion was weakened.

## Verification

- `cd src-tauri && cargo test -p gamelib-log`: 78 lib tests, 4 golden tests (`rust_writer_matches_the_ts_golden`,
  `rust_sanitiser_matches_the_ts_golden_for_every_renderer_case` and the two new `tokenise_*`), the limiter golden
  and doc tests, all pass. The four heaviest new writer tests ran five times in a row with no flake.
- `cargo clippy -p gamelib-log --all-targets -- -D warnings` clean; `cargo fmt -p gamelib-log --check` clean.
- The windows-latest leg is not exercised here; 84-18 proves it on CI after an operator-authorised push.
- Prettier: every path written is `.rs`, which has no prettier parser, so no prettier check is carried (cargo fmt is
  the formatter gate).

## Known Stubs

None.

## Threat Flags

None. T-84-42, T-84-43 and T-84-44 are mitigated as planned; no new network, auth or file-access surface.

## Issues Encountered

None beyond the test-authoring fixes above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

84-15 (TS half of WR-05) and 84-18 (windows leg on CI) can proceed. Phase 85 shares this branch; STATE.md,
state.json and ROADMAP.md were not touched by this plan, as instructed.

---
*Phase: 84-logger*
*Completed: 2026-11-21*

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-log/tests/golden.rs, src/sanitize.rs, src/writer.rs, src/limiter.rs
- FOUND commits: 1c70a61c1, 720fb9d86, 6a385ab97 (ancestors of HEAD)
