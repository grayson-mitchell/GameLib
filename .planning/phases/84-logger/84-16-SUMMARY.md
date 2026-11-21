---
phase: 84-logger
plan: 16
subsystem: logging
tags: [rust, gamelib-log, tracing, shutdown, gap-closure]
status: complete
requires:
  - phase: 84-logger
    provides: "84-14 sanitize.rs changes; the native writer, bridges and run_exit"
provides:
  - "CR/LF escaped at every native log entry point (gamelib_log::log, both bridges, shell_log_to)"
  - "One [Shell] WARNING when install_bridges returns false"
  - "FinishContext.deadline + remaining_now(): the final flush fits the one 5 s budget"
affects: [84-17]
tech-stack:
  added: []
  patterns:
    - "native-origin text is escaped at the entry point; Logger::log stays verbatim for the renderer and frame paths"
    - "finish stage is handed a deadline Instant, not a duration measured at finish entry"
key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-log/src/sanitize.rs
    - src-tauri/crates/gamelib-log/src/lib.rs
    - src-tauri/crates/gamelib-log/src/bridge.rs
    - src-tauri/src/main.rs
    - src-tauri/crates/gamelib-core/src/shutdown.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - src-tauri/crates/README.md
    - .claude/skills/gamelib-conventions/SKILL.md
key-decisions:
  - "Escape at the native entry points, not inside Logger::log, because Logger::log also carries the renderer body (already sanitised; its object arm is multi-line by design and golden-pinned)"
  - "FinishContext.remaining was removed rather than kept beside deadline, so no caller can read the stale duration"
requirements-completed: [FND-05]
duration: 40 min
completed: 2026-11-22
commits: 5
plan_head_before: e173a5f8d02e56608a9682bbc7bc041a38d35250
plan_head_after: bbf189be0a47a5676ce21ebefba1c9b661801f41
actuals:
  tokens: 9000
  tasks: 3
  commits: 5
---

# Phase 84 Plan 16: Native log entry points, bridge warning, exit deadline Summary

**Shell and crate-bridge log lines now escape CR/LF before the writer, a failed bridge install logs one WARNING, and the exit finish stage flushes against a fixed deadline instead of a stale duration.**

## Findings fixed

| Finding | Commit | Test |
|---|---|---|
| WR-02 (writer half) | e7eb01597 (RED fdc5b6457) | `bridge::tests::a_bridged_message_with_line_breaks_is_written_on_one_line`, `tests::shell_log_to_escapes_line_breaks_in_the_message` (main.rs) |
| IN-03 | f5c3c9eef | `tests::a_failed_bridge_install_is_reported` (main.rs) |
| IN-04 | bbf189be0 (RED ce1f0689a) | `shutdown::tests::finish_flush_time_is_measured_from_the_deadline_not_from_finish_entry` |

## Accomplishments

- `sanitize::escape_line_breaks` is public; `gamelib_log::log`, `LogLayer::on_event`, `LogBridge::log` and `shell_log_to` pass text through it. The stderr echo in `shell_log` stays verbatim. Renderer and frame paths are untouched.
- `bridge_install_warning(bool)` is consumed by `init_native_logger`: a `false` from `install_bridges` writes one `WARN: crate diagnostics not bridged: ...` line naming steam-vent and reqwest.
- `FinishContext` carries `deadline: Instant` (run start plus `budget.total`) and `remaining_now()`. `handle_exit`'s finish closure ends with `gamelib_log::flush(ctx.remaining_now())`. The tauriShellSource gate, `crates/README.md` (twice) and the gamelib-conventions Rust shutdown text quote the new expression; `grep "ctx.remaining)"` across src-tauri, src/backend and the skill returns 0.

## TDD

RED observed for each target test on its own assertion (line-break not escaped; `expect` on the missing warning; `remaining_now` not shrinking). Task 1 and Task 3 have separate `test(84-16)` RED commits (Task 3's carries a stub `deadline`/`remaining_now` so the test compiles and fails on the assertion). Task 2's RED was run and observed locally against a stub helper but committed together with the implementation.

## Verification

- `cargo test -p gamelib-log` 79 + doc tests pass; clippy `-D warnings` and `cargo fmt --check` clean for gamelib-log and gamelib-core.
- `cargo test -p gamelib-core shutdown`: 14 passed. `cargo test --bin gamelib-shell`: 592 passed, 2 ignored.
- jest: tauriShellSource, quitTeardownWiring, sidecarShutdownFlagSource: 310 passed. Prettier check clean on the test and README (SKILL.md and main.rs are prettier-ignored / not-prettier, hand-matched; `rustfmt --check` reports no diff in main.rs itself).

## Deviations from Plan

**1. [Rule 1 - Bug] Task 1's new main.rs test was not rustfmt-clean**
- Found during: Task 1 commit review (`rustfmt --check src/main.rs`)
- Fix: reformatted the `assert_eq!`; shipped in the Task 2 commit (f5c3c9eef) rather than amending.

Otherwise none: the plan executed as written. The STATE.md, state.json and ROADMAP.md were not touched, per the orchestrator's override.

## Known Stubs

None.

## Threat Flags

None. T-84-48, T-84-49 and T-84-50 are mitigated by the three tasks above.

## Self-Check: PASSED

All five commits exist on main and are ancestors of HEAD; all eight modified files exist.
