---
phase: quick-261128-9fj
plan: 01
subsystem: shortcuts
tags: [macos, run-sh, shell-quoting, golden-deltas, gamelib-shortcuts]
requires: []
provides:
  - macOS run.sh that survives an apostrophe in an app name or runner
  - text/deltas.json (recordDelta format) and its application in both text replays
affects: [gamelib-shortcuts]
tech-stack:
  added: []
  patterns: [delta-applied golden replay (one substitution in the TS bytes), argv-level shell proof]
key-files:
  created:
    - src-tauri/crates/gamelib-shortcuts/tests/run_sh_quoting.rs
    - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/text/deltas.json
    - .planning/todos/pending/2026-11-28-linux-desktop-exec-writes-app-name-and-runner-unencoded.md
  modified:
    - src-tauri/crates/gamelib-shortcuts/src/mac.rs
    - src-tauri/crates/gamelib-shortcuts/src/launch_url.rs
    - src-tauri/crates/gamelib-shortcuts/src/linux.rs
    - src-tauri/crates/gamelib-shortcuts/tests/golden_text.rs
    - src-tauri/crates/gamelib-shortcuts/tests/golden_add.rs
    - .planning/todos/completed/2026-11-24-macos-shortcut-run-sh-breaks-on-single-quote-in-app-name.md (moved from pending/)
decisions:
  - "run_sh_url escapes ' as %27 over the whole URL; encode_uri_component and launch_url are untouched (Windows .lnk goldens pin them)"
  - "text/deltas.json is hand-written in recordDelta's format because 94-24 deleted the shortcuts oracle harness; no recorded case file is edited"
  - "Linux .desktop Exec= defect left alone and tracked in its own pending todo"
metrics:
  duration: ~35m
  completed: 2026-11-28
status: complete
commits: 3
plan_head_before: 0f3d39f1686aea1cce0ae174289a7fda790074ca
plan_head_after: 5bc0831be2fe4c64cae8f8056a73aaf5766ccc04
actuals:
  tokens: 30000
  tasks: 2
  commits: 3
---

# Phase quick-261128-9fj Plan 01: macOS run.sh apostrophe escape Summary

The macOS `run.sh` now writes `'` as `%27` inside its single-quoted launch URL (`run_sh_url` in `mac.rs`), so an app name or runner holding an apostrophe launches instead of breaking the shell quoting; the shared encoder and the Windows/Linux output are untouched.

## Commits

| Hash | Message |
| ---- | ------- |
| `6cc668288` | test(quick-261128-9fj): run.sh quoting and argv round trip for apostrophe names (RED) |
| `a186254d9` | fix(quick-261128-9fj): macOS run.sh writes ' as %27 in its single-quoted launch URL |
| `5bc0831be` | docs(quick-261128-9fj): run.sh apostrophe fix documented; todo closed, Linux Exec= split out |

## RED failures at HEAD (`0f3d39f16`), by test and case

Six cases: `a'b'; touch pwned; '`/legendary, plainapp/`a'b"c`, `Rock'n'Roll`/legendary, the `darwin-everything-*` appName/gog, `O'`/sideload, and the control plainapp/legendary.

- `the_command_line_holds_one_single_quoted_url_that_decodes_to_the_inputs`: 5 of 6 fail (every apostrophe case holds 3 to 5 quotes, not 2). Control passes.
- `run_sh_parses_under_sh_and_bash`: 4 of 6 fail (`a'b'; touch pwned; '`, `a'b"c`, the everything name, `O'`; `unexpected EOF while looking for matching`). `Rock'n'Roll` parses and the control parses.
- `the_shell_hands_the_shortcut_exactly_one_url_argument`: 5 of 6 fail. The four odd-apostrophe cases are "not run" (bash -n rejects them first). `Rock'n'Roll` passes the parse and fails here: the shell delivered `appName=RocknRoll`. Control passes.

## Golden failures between GREEN and the delta

With `run_sh_url` in and no delta yet: `golden_text` darwin iconless 7 of 48 differ, darwin with-icon 1 of 18 differs, `golden_add::every_text_golden_replays_through_the_op` 8 of 132 differ. The 8 are exactly `darwin-everything-{gog,legendary,nile,sideload,steam}`, `darwin-plain-r-quotes`, `darwin-single-quote-legendary` and `darwin-single-quote-legendary-icon`. Nothing else went red. After `text/deltas.json` and `with_text_delta` in both replays, all pass.

## Final counts

- `cargo test -p gamelib-shortcuts --no-fail-fast`: 200 passed, 0 failed, 1 ignored (HEAD baseline 196 passed, 1 ignored). golden_text 9, golden_add 35, run_sh_quoting 3, lib 97.
- `cargo +1.99.1 clippy -p gamelib-shortcuts --all-targets -- -D warnings`: exit 0. `cargo fmt --check`: clean.
- `shortcutsFixtureRedaction.test.ts`: 8 passed. `pnpm planning-gates`: 12/12.
- `npx prettier --file-info` probe over every written path: 0 paths prettier would check (all `.planning` or `tests/fixtures` ignored, `.rs` has no parser), so no `npx prettier --check` was run; `cargo fmt` is the formatter.
- The shell-spawn tests use `env_clear()` plus a fresh `FakeHome` per case and `Command::output()`.

## Deviations from Plan

None - plan executed exactly as written. Small implementation choices: the three tests collect failures across all cases and fail once naming each (so the RED record is per case), and `run_sh_quoting.rs` carries a `cfg_attr(not(unix), allow(dead_code, unused_imports))` so the Unix-only helpers do not warn on Windows. HEAD at start was `0f3d39f16` (the plan was measured at `c25d9ca19`); none of the crate files had changed between them.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: tests/run_sh_quoting.rs, tests/fixtures/golden/text/deltas.json, the completed todo, the new pending Linux todo.
- FOUND commits `6cc668288`, `a186254d9`, `5bc0831be` (ancestors of HEAD).
- `git diff` over `launch_url.rs` and `linux.rs` shows only `//!` lines; `add.rs`, `steam/mod.rs` and every recorded golden case file are unchanged.
