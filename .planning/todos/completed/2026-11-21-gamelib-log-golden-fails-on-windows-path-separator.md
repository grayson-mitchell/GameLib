---
created: 2026-11-21T00:00:00.000Z
title: 'gamelib-log golden fails on Windows: chunks-wine-header writes a backslash in the per-game log path'
area: tests
severity: major
platform: windows
ready: code
status: CLOSED
resolution: 'Already fixed by 1c70a61c1 (84-14, G-84-1) on 2026-11-22; re-verified 2026-11-27 by quick 261127-wa3, no code change'
---

## Problem

Rust test run 44872994911 (main 5bd0c0b72), Windows leg only:
`rust_writer_matches_the_ts_golden` panics at `src-tauri/crates/gamelib-log/tests/golden.rs:191`,
case `chunks-wine-header`. The Rust writer logs
`Logging to file(s) ${LOGDIR}/games/Game Name_gog\launch.log`; the TS golden has
`.../Game Name_gog/launch.log`. ubuntu and macOS are green.

Introduced by Phase 84 (gamelib-log crate, 84-02 / 84-04). Found during Phase 82 UAT item 2
re-test; not a Phase 82 regression.

## Solution

Decide which side is canonical: either the Rust writer joins the logged path with `/` to match the
TS oracle, or the golden normalises separators on Windows. Do not weaken the golden to skip the case.

## Resolution (2026-11-27, quick 261127-wa3)

Already fixed. Nothing changed in this task.

The writer was never wrong. It logs the native path, `...\games\Game Name_gog\launch.log`, and
the golden's `tokenise` is meant to turn the `${LOGDIR}` tail into `/`. Before 1c70a61c1 it ended
the path at the first whitespace, so the space in `Game Name_gog` cut it short and left
`\launch.log`. Commit 1c70a61c1 (84-14, G-84-1, 2026-11-22) ends the path at a line break or a
quote instead, and two unit tests pin that rule:
`tokenise_normalises_a_windows_path_with_a_space_to_the_end_of_the_line` and
`tokenise_ends_a_path_at_a_quote`. The golden stays strict: no case is skipped.

Evidence:
- Local run on Windows 11: `cargo test -p gamelib-log --test golden` gives 4/4 passed.
- CI Rust test on windows-latest: `rust_writer_matches_the_ts_golden ... ok` in runs 46052246559
  (green), 46047359466 and 45956464586. Those two runs are red on Windows for other reasons:
  gamelib-launch `stub_game.rs:497` and `golden_wine_launch.rs:1864/1882`, not gamelib-log.
