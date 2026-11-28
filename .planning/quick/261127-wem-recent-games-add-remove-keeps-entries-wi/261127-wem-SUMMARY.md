---
phase: quick-261127-wem
plan: 01
subsystem: gamelib-info recent games
tags: [rust, recent-games, golden, keep-rule]
status: complete
requirements:
  - "quick:261127-wem"
  - "todo:2026-11-22-recent-games-drops-entries-with-empty-appname"
key-files:
  modified:
    - src-tauri/crates/gamelib-info/src/recent.rs
    - src-tauri/crates/gamelib-info/tests/golden_recent.rs
    - src-tauri/src/info_dispatch.rs
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json
  renamed:
    - fixtures golden/recent/expected/remove-drops-empty-appname-entry -> remove-keeps-empty-appname-entry (3 files)
    - fixtures state/recent/remove-drops-empty-appname-entry -> remove-keeps-empty-appname-entry (1 file)
commits: 2
plan_head_before: 7b7194b759d3102c1b72abf3c73c99a890f4fede
plan_head_after: 3f5119a8109ff5715334cf562f2ae0263762652b
actuals:
  tasks: 2
  commits: 2
---

# Quick 261127-wem: recent-games add/remove keeps entries that are not the game

`recent::keeps` now drops only an object whose `appName` is a string equal to the game. Every other stored entry
(missing, empty, null, false or 0 appName, a truthy non-string appName, a bare string, an array) survives both add and
remove. There is no remove-once path.

## Commits

- `48cd1e575` fix: the rule, docs, unit test, two hand-re-derived goldens (one renamed), both concurrent tests (15 paths)
- `3f5119a81` test: `every_entry_that_is_not_the_game_survives_add_and_remove` (1 path)

## Test counts

| Command | HEAD before | RED (pins changed, rule not) | Final |
| --- | --- | --- | --- |
| `gamelib-info --test golden_recent` | 12 passed | 10 passed, 2 failed | 13 passed |
| `gamelib-info --lib recent::` | 3 passed | 2 passed, 1 failed | 3 passed |
| `gamelib-shell info_dispatch::tests::` | 54 passed | 53 passed, 1 failed | 54 passed |
| jest fixtureRedaction + infoPortComplete | 214 | n/a | 214 passed |

RED failures: golden_recent `every_golden_case_matches_the_ts_bytes_and_payloads` (add-over-empty-appname-entry) and
`a_concurrent_add_and_remove_both_take_effect`; lib `recent::tests::keeps_drops_only_the_game_itself`; shell
`info_dispatch::tests::a_launch_add_and_a_native_remove_on_two_threads_both_land`. This is the expected shape. Clippy
(`-D warnings`), `cargo fmt -p gamelib-info --check` and `rustfmt --edition 2021 --check src/info_dispatch.rs` are clean.

## Guard mutation (Task 2)

Temporarily restoring a falsy-appName drop in `keeps` (empty string dropped, any non-matching-string shape dropped) made
`every_entry_that_is_not_the_game_survives_add_and_remove` FAIL (list was `[new, keep]` against the ten-entry
expectation). Undone with `git show HEAD:path > path`; `git diff --quiet` on recent.rs exited 0.

## Deviations from Plan

1. **[Rule 3 - Blocking] Directory rename blocked.** `git mv` of the two `remove-drops-empty-appname-entry` directories
   failed with "Permission denied" (Windows handle). Moved the four files individually with `git mv` into freshly made
   `remove-keeps-empty-appname-entry` directories and `rmdir`ed the empty old ones. Git records the same four renames.
2. **[Rule 1 - lint] clippy `cloned_ref_to_slice_refs`** on `&[new.clone()]` in the new test; replaced with
   `std::slice::from_ref(&new)` and amended into the (unpushed) test commit, so the final test commit is `3f5119a81`.
3. `rustfmt` rewrapped the new shell assertion in info_dispatch.rs onto one line (formatter gate); no behavior change.
4. The new test sits directly after `a_concurrent_add_and_remove_both_take_effect` and before `many_concurrent_adds_all_land`.

The commits are on `main`; `.planning/config.json` has `git.allow_default_branch_commits: true`. Both followed the
orchestrator's direction (no worktree).

## Known Stubs

None.

## Threat Flags

None.

## Notes

`graphify update .` was started (it ran past 3 minutes and moved to the background); `graphify-out` shows no tracked
changes in `git status`, so nothing to commit.

## Self-Check: PASSED

Commits `48cd1e575` and `3f5119a81` exist; the 15-path and 1-path commit contents were verified; renamed fixtures
present and old ones absent.
