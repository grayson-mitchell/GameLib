---
phase: quick-261127-u6h
plan: 01
subsystem: launch
tags: [gamelib-log, redaction, prohibition-1, golden-delta]
requires:
  - phase: 88.2
    provides: "the Rust runner and wine launch variant whose gamelib.log lines this reduces"
provides:
  - "general-log form of the runner's three gamelib.log lines (runner and deep absolute args by file name, env as names)"
  - "Wine command's three gamelib.log lines with no path"
  - "test-side oracle (tests/log_oracle/mod.rs) and the general-log-paths-and-env-reduced delta in both replays"
affects: [gamelib-launch, gamelib-wine, golden/runner, golden/wine_launch]
tech-stack:
  added: []
  patterns: ["named golden delta with a test-side oracle that never calls production code"]
key-files:
  created:
    - src-tauri/crates/gamelib-launch/tests/log_oracle/mod.rs
  modified:
    - src-tauri/crates/gamelib-launch/src/runner/redact.rs
    - src-tauri/crates/gamelib-launch/src/runner/call_runner.rs
    - src-tauri/crates/gamelib-launch/src/runner/wine_command.rs
    - src-tauri/crates/gamelib-wine/src/wine_cmd/command.rs
    - src-tauri/crates/gamelib-launch/tests/golden_runner.rs
    - src-tauri/crates/gamelib-launch/tests/golden_wine_launch.rs
    - src-tauri/crates/gamelib-launch/tests/fixtures/golden/runner/deltas.json
    - src-tauri/crates/gamelib-launch/tests/fixtures/golden/wine_launch/deltas.json
key-decisions:
  - "Golden diff is two deltas.json entries plus replay code, not re-recorded JSON: the TS recorders were deleted in 88.2-24 (686537757), so the recorded events.json stay as the TS wrote them and the replays derive the expected line with a test-side oracle"
  - "Only absolute paths of two or more segments are reduced; Windows switches (/S, /VERYSILENT) share the one-segment shape"
  - "Abort command and Error running command lines are in scope with Running command"
requirements-completed:
  - "quick:261127-u6h"
status: complete
actuals:
  tokens: 40000
  tasks: 3
  commits: 3
plan_head_before: bac11b68941fb4de6862ef7b40241dd5b16d3790
plan_head_after: 685d0237217fbdc528b89c246d9386c4666d9f85
completed: 2026-11-27
---

# Phase quick-261127-u6h Plan 01: Keep profile paths and env values out of gamelib.log Summary

**The runner's and the Wine command's gamelib.log lines now name runners and deep absolute arguments by file name and the added env by variable name only, replayed against the unedited TS goldens under a named delta with a test-side oracle.**

## What changed

- `redact.rs`: `redact_parts` (the exact-element redaction, split out of the loop; the PowerShell arm is chosen once), `file_name_of`, `is_reducible_path`, `reduce_part`, `reduce_in_text`, `changed_env_names`, with unit tests.
- `call_runner.rs`: `general_log_command` builds the general-log form (runner file name, reduced arguments, ` (env: NAME, NAME)` last, PowerShell shape kept); the `Running command` / logMessagePrefix line, `Abort command` and `Error running command` use it, and the Error line names a failed spawn's program by file name (the OS text after it is kept). The per-game writers' header and every result field (`fullCommand`, `error`, `stderr`) still carry the full credential-free text.
- `wine_command.rs` and gamelib-wine `PreparedWine::debug_parts` (now `Vec<String>`): `Running Wine command:` reduces each part, `Wine command failed to run:` names the program by file name, the `wineserver --wait` warning names the prefix's folder.
- Both todos moved to `.planning/todos/completed/` with a Resolution.

## Why the golden diff is two deltas.json entries and replay code

"Re-record the goldens" cannot be done literally: the TS recorders (`runner.oracle.test.ts`, `runnerWine.oracle.test.ts`, `runnerTrace.ts`) were deleted with the TS runner in 88.2-24, and the replays read the recorded slices as the TS's record. This crate's mechanism for a deliberate Rust difference is a named delta (precedents: `wine-path-error-line`, `epic-status-log-fixed-text`). No `expected/**`, `cases.json` or `MANIFEST.json` file changed (verified with `git diff --stat` against the base commit: 0). `tests/log_oracle/mod.rs` derives the expected lines from the recorded text without calling `gamelib_launch`.

## Changed-line counts

Runner replay: exactly 54 recorded lines in 32 cases, wine_launch replay: exactly 21 lines in 21 cases. Both match the plan's prototype, so no line needed investigating.

## Verification run

- `cargo test -p gamelib-launch --lib runner::` 50 passed (redact tests 15).
- `cargo test -p gamelib-launch --test golden_redaction --test golden_runner` 3 + 8 passed.
- `cargo test -p gamelib-launch --test golden_wine_launch` 12 passed.
- `cargo test -p gamelib-wine` and `cargo test -p gamelib-launch` (whole crate): all suites 0 failed.
- `cargo +1.99.1 clippy -p gamelib-launch -p gamelib-wine --all-targets`: 0 warnings. `cargo fmt -p gamelib-launch -p gamelib-wine --check`: exit 0.
- `pnpm -s planning-gates`: 12/12.
- Guard mutation: restoring `{prefix} {safe_command}` in the general line made 32 of 93 runner cases fail; reverted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `Option::is_none_or` in the oracle tripped clippy's MSRV lint**
- **Found during:** Task 1 verify
- **Issue:** `is_none_or` is stable since 1.82, the crate MSRV is 1.77.2 (1 clippy warning)
- **Fix:** `prev.map_or(true, ...)`
- **Files modified:** tests/log_oracle/mod.rs
- **Commit:** b171b3eee (folded into the Task 1 commit before it was made)

**2. [Process] Task 1 `general_log_command` unit tests were written together with the code**
- The `redact.rs` tests were run RED first (19 compile errors) as planned; the three `call_runner.rs` `general_log_command` tests were added in the same edit as the function, so they have no recorded red run. The runner golden replay does have one: the guard mutation above.

Otherwise the plan was executed as written.

### Notes

- `commits: 3` in the frontmatter counts this plan's three commits (b171b3eee, b26f42dd8, 685d02372). `git rev-list --count bac11b689..HEAD` reads 7 because a concurrent quick task (261127-upb) landed four commits in between.
- Commits went to `main` with `git.allow_default_branch_commits: true` set in `.planning/config.json`.
- The Task 3 todo-move commit was made as the plan specifies; the SUMMARY, STATE and PLAN are left for the orchestrator's docs commit.

## Follow-ups (not done)

- A path embedded after something other than `=` (a `-Dname:/path` form, a `PATH`-like list) is not reduced.
- The result's `fullCommand` and `error` still reach the TS with the full text; nothing found logs `fullCommand`, but TS callers that log a result's `error` (a spawn failure's names the program path) were not audited.
- The IN-04 redaction gap (`--flag=value`) is unchanged.
- No live-app check was made.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- Created `tests/log_oracle/mod.rs`: found. Commits b171b3eee, b26f42dd8, 685d02372 are ancestors of HEAD.
