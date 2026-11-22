---
phase: quick-261123-bax
plan: 01
subsystem: gamelib-info (recent games)
tags: [rust, recent-games, golden, operator-ruling]
status: complete
requires: []
provides:
  - "recent::add caps the stored games.recent list at 50 (MAX_STORED)"
key-files:
  modified:
    - src-tauri/crates/gamelib-info/src/recent.rs
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/after/store/config.json
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/events.json
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/result.json
    - src-tauri/crates/gamelib-info/tests/golden_recent.rs
    - .planning/todos/completed/2026-11-22-recent-games-list-is-unbounded.md (moved from pending/)
decisions:
  - "Cap 50, trim on add only; list and remove never trim (operator ruling 2026-11-23)"
metrics:
  completed: 2026-11-23
actuals:
  tasks: 3
  commits: 3
plan_head_before: 73c354d8961d23c5a26c2ff4e5e0ee7aef349a16
plan_head_after: cf1ec2291cb3be7e30e6ac03d4cd147e410b7a75
---

# Quick 261123-bax: cap the stored recent-games list at 50 on add

`recent::add` now runs retain, insert(0), `truncate(MAX_STORED = 50)`, then write, so the file, `info_recent_list` and the `recentGamesChanged` payload all carry the trimmed list. `list` and `remove` are unchanged and never trim.

## Commits

| Task | Commit | Paths |
| ---- | ------ | ----- |
| 1 (tracer) cap + re-derived golden | `6e44d4e64` | recent.rs, cases.json, 3 expected files |
| 2 boundary tests | `bb1b96742` | golden_recent.rs |
| 3 todo closed | `cf1ec2291` | rename pending -> completed with Ruling and Resolution |

Note: `plan_head_before..HEAD` holds 4 commits. The extra one, `6dc952fb3` (quick-261123-bbi), is the concurrent task's commit landing in the same tree; `commits: 3` counts only this plan's own.

## Evidence

- Golden derivation: scratchpad Python script (not in repo). Round-trip guard passed for all 3 expected files (tab indent no trailing newline for config.json; 2-space plus newline for events/result). Derived list (app1 + first 49 before entries) equalled the first 50 of the old 61-entry golden; the dropped tail was exactly app149..app159. The diff of the three files is pure deletions (55 lines each).
- RED (Task 1, golden changed before code): `every_golden_case_matches_the_ts_bytes_and_payloads` FAILED on `sixty-entry-list` (store/config.json differed: 61 entries written against 50 expected); 7 passed, 1 failed.
- GREEN after the cap: `golden_recent` 8 passed; `--lib recent::` 3 passed; clippy `-D warnings` clean; `cargo fmt --check` exit 0; jest fixtureRedaction + infoPortComplete 209 passed; all grep/awk region checks held (trim only inside `add`, length bullet gone).
- Task 2: `golden_recent` 12 passed. Mutation (cap 49): the four new tests FAILED, plus the sixty-entry-list golden case (5 failed, 7 passed); cap restored to 50 and `git diff --quiet` on recent.rs confirmed no diff; 12 passed again.
- `pnpm planning-gates`: 12/12. `graphify update .` run.
- Formatter: prettier ignores the four fixture paths and has no parser for `.rs` (`inferredParser: null`), so no `prettier --check` was carried; `cargo fmt -p gamelib-info --check` is the gate.

## Deviations from Plan

None - plan executed as written. The only tooling note: `cargo fmt -p gamelib-info` was run once on the new test code (it reflowed my helper formatting) before the Task 2 commit.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

All three commits are ancestors of HEAD; each commit's file list matched its task's exact paths; no unrelated dirty file was staged.
