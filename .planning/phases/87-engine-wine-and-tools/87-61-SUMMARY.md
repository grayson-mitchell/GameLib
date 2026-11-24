---
phase: 87-engine-wine-and-tools
plan: 61
subsystem: engine-log
tags: [engine-log, gamelib-log, redaction, privacy, svc-02, gap-closure, rust, tauri-shell]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-59's finding that build_ctx called no with_log, and 87-60's re-run contract that reads the engine lines from gamelib.log"
provides:
  - "ShellEngineLog: the shell's EngineLog, so every engine and wine crate line reaches gamelib.log as a [Shell] line at the crate's own level"
  - "EngineLineRedactor: six-rule redaction (home to ~, account word, secret and account pairs, argument lines to a count, URL userinfo and query, 512-unit cap) applied before the write"
  - "shell_log_at / shell_log_at_to in main.rs, the level-explicit twin of shell_log"
  - "shellLogCategoryOnly.test.ts scans shell_log_at( and requires redact( output, so the engine log cannot bypass the 84-17 rule"
affects: [87-62, 87-63, 87-69, 87-HUMAN-UAT required literals]

actuals:
  tokens: 14300
  tasks: 3
  commits: 5

plan_head_before: 90517f9e55c506a96d75d55b24c2412589811a82
plan_head_after: d175b6f2f5dc8a2cdb9974108323e6a3b08bb542
commits: 5

tech-stack:
  added: []
  patterns:
    - "Redact-then-sink: a log route for crate-composed text writes only the redactor's output, enforced by a source-text gate"
    - "Hand-written byte scanners instead of a regex crate (the shell has none)"

key-files:
  created:
    - src-tauri/src/engine_log.rs
  modified:
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/main.rs
    - src-tauri/crates/gamelib-log/src/sanitize.rs
    - src/backend/__tests__/shellLogCategoryOnly.test.ts

key-decisions:
  - "The default sink is a literal crate::shell_log_at(level, &redacted) call inside ShellEngineLog::write (a test-only Option sink replaces it), so the category-only gate sees the real call and can require the redactor's output there."
  - "Header-style values (authorization, and cookie after a colon) run to the end of the line; every other unquoted value ends at whitespace, a quote, a closer, a comma, a semicolon or an ampersand. A value that is itself a secret containing a comma or space leaks its tail; this is a stated limit, not a hidden one."
  - "gamelib_log::sanitize::truncate_utf16 is widened from pub(crate) to pub so the shell reuses the one cut rule and marker rather than copying it."
  - "Only the home directory and account name are removed from paths. Other absolute paths (the CrossOver app path, temp directories) and game keys and bottle names stay, because they are not the operator's identity and the 87-69 item 2 live count is the check on that."

requirements-completed: [SVC-02]

duration: about 12 min of executor wall clock
completed: 2026-11-24
---

# Phase 87 Plan 61: Engine log wired into gamelib.log, redacted Summary

**The shell's engine context now has a log: every line the engine and wine crates write through `ctx.log` reaches gamelib.log as a `[Shell]` line at the crate's level, after a six-rule redactor that renders the home as `~`, removes the account name, secret and account values, full argument lines, URL queries and over-long text, with a source-text gate that makes `shell_log_at` unusable for anything that has not been through it.**

## Performance

- **Duration:** about 12 min (10:17:50Z to 10:29:32Z, plus summary)
- **Tasks:** 3 (tracer, TDD, gate and census)
- **Files modified:** 6 (1 created, 5 modified); 1034 lines in engine_log.rs, 14 in engine_dispatch.rs, 26 in main.rs, 1 in sanitize.rs, 171 added in the TS gate

## Accomplishments

- **The sink exists (Task 1, tracer).** `build_ctx` calls `.with_log(Arc::new(ShellEngineLog::for_home(&user_home)))`. The tracer test dispatches `engine_bottle_kill_wineserver` with bottle `../escape` through a context whose log writes to a real `gamelib_log::writer::Logger` on a `FakeHome`: it spawns nothing and gamelib.log gets exactly one `[WARNING]` `[Shell]` line containing `killBottleWineServerWith: refusing unsafe bottle`. With no logger installed (`gamelib_log::global()` is `None`, every other shell test) the same op writes nothing to disk and does not panic.
- **The redactor (Task 2, TDD).** Six rules in a fixed order, no regex crate: (1) the home in plain, `file://` and wine `Z:` forms to `~`, with a component-boundary check so `/Users/gwendolen` is not `/Users/gwen`; (2) the account name (home's last component, plus `USER` or `USERNAME` when it differs) as a whole ASCII word, case-insensitive, to `<user>`, skipped under two characters; (3) values of secret-shaped and account-shaped `key=value` / `key: value` pairs to `<redacted>`, key kept; (4) `args=`, `argv=`, `cmd=`, `command=`, `commandParts=`, `Wine Command:` segments to `args=<redacted N>` (N from a quote-aware, nesting-aware element count, `?` when not a list); (5) `http`/`https` URL userinfo dropped and query to `?<redacted>`; (6) the cut to 512 UTF-16 units with `gamelib_log::sanitize::truncate_utf16`. The user's required test `a_line_with_home_account_and_args_comes_out_redacted` passes, and a second pass over redacted text changes nothing.
- **The gate (Task 3).** `shellLogCategoryOnly.test.ts` now extracts `shell_log_at(` calls (message is the second argument), applies the placeholder rules, and requires `redact(` on the same statement or a binding assigned from `redact(` in the same function. 9 new controls, a non-vacuity test that the walk finds the call in `engine_log.rs`, and a header that says what the engine log route is and what the gate cannot see. Mutation check: changing `&redacted` to `line` in engine_log.rs fails the gate naming `engine_log.rs:40`.
- **The three IMPOSSIBLE literals have a sink.** Each gate literal survives redaction, one test per literal (see the table).

### Gate-literal survival (Task 2 acceptance: each of the eight has a passing test)

| Literal | Written by | Test |
|---|---|---|
| `[engine-notice] ... display=pending` | the real `show_engine_dialog` through a ctx with the shell's log | `the_refusal_dialog_line_keeps_its_display_pending_literal` |
| `[engine-notice] ... raise=false` (notice line) | the real `show_engine_notice` | `the_deadline_notice_line_keeps_its_raise_false_literal` |
| `Engine: downloading <kind> <version>` | format string copied from `fallback/ensure.rs:587` | `the_engine_download_lines_keep_their_literals` |
| `Engine: verifying <kind>` | `ensure.rs:623` | same test |
| `Engine: extracting <kind>` | `ensure.rs:645` | same test |
| `launch deadline fired (` and `... pushed=true raise=false` | `launch/deadline.rs:234`, `:273` | `the_launch_deadline_lines_keep_their_literals` |
| `launch blocked before pre-flight while offline (crossover-missing)` | `launch/step.rs:510` | `the_offline_gate_warning_keeps_its_literal` |
| `Not creating DXMT copy of` | `gamelib-wine/tools/dxmt.rs:136`, with a fake-HOME path that must come out as `~` | `the_dxmt_skip_line_keeps_its_literal_and_loses_its_profile_path` |

Two are written by the crates' real public builders. The other six are private functions deep in the crates, so their text is written through the shell log with the format copied from the cited line; if a crate changes its wording, the corresponding 87-69 live check (item 2) is the backstop, not these tests.

## Census of the crate log call sites (Task 3)

Method: a script over every non-test `.rs` file in `gamelib-engine/src` and `gamelib-wine/src` (cut at the first `#[cfg(test)]`, `testing.rs` excluded, comments stripped), matching the crates' helpers (`log_info`, `log_warn`, `log_error`, `info`, `warn`, `error`, `write_log`) and `.info(` / `.warn(` / `.error(` / `.write_log(`, skipping definitions and the helper bodies that forward a bare `line`. Each call's argument text was classified by what it interpolates, then the heuristic's false positives were corrected by hand (below). 209 call sites; the same crates also write through `Step::write_log` / `Step::warn`, which prefix `Engine: <key>` and are counted at their call sites.

| Class | Sites | Notes |
|---|---|---|
| Fixed text only (incl. counts, booleans, enum words) | 107 | |
| A game key or bottle name, a version, a tool name | 62 | `[engine-notice] key=...`, `engine marker for "<bottle>"`, `Engine: <key> launch deadline ...` |
| An error string (a crate or OS error's Display) | 32 | may carry an io error and a path inside it |
| A path (basename or prefix) | 3 | `bottles/switch.rs:318` (basename), `tools/dxvk.rs:429` (`target.prefix`), `tools/dxvk.rs:678` (`wine_prefix` and the failure list) |
| Process stderr or stdout | 4 | named below |
| An argv line | 1 | named below |
| **Total** | **209** | |

Named, because the redactor (not the site) is what covers them. None is edited here (D-06: no TS revived; crate behaviour unchanged):

- **argv:** `gamelib-wine/src/winetricks/install.rs:665` (`Running <winetricks> <args joined>`).
- **stderr or stdout:** `gamelib-engine/src/bottles/lifecycle.rs:131` (`wineserver -k ... failed {stderr}`), `:317` (`cxbottle create threw {stderr}`), `:334` (`cxbottle.conf not produced ... {stderr}`), and `gamelib-wine/src/winetricks/install.rs:362` (the first line of `wine --version`).
- **path carriers inside the error-string class:** `tools/dxmt.rs:136` (`{winemac_path}`), `tools/dxvk.rs:634` (`reg_file.display()`), and the `{error}` sites whose io error holds a path (`tools/dxvk.rs:455, 490, 496, 504, 523, 551, 572, 602`, `tools/install_tool.rs:188`, `runtimes.rs:322`).
- Also error-text-bearing: `launch/watch.rs:244` (`{message}` of a process-listing failure) and `launch/step.rs:484, 540, 552, 661, 674, 680, 688` (`{error}` and `{detail}` from the switch and DXVK paths).

False positives corrected by hand: five `args.<field>` interpolations (`bottles/switch.rs:447`, `wine_cmd/command.rs:502, 514, 550, 562`) matched the argv pattern but interpolate an args struct's `runner`, `app_name` or `bottle_name`; `fallback/prune.rs:206` and `manager/install.rs:165` matched the path pattern but write a count and a fixed sentence.

No site interpolates a store account name, a token or a URL with a query (the crates' `sinks.rs` rule held at every site that was classified as fixed or key/name), which is what the plan's flagged assumption about the account name relied on.

## Task Commits

1. **Task 1: tracer, one crate line through the shell's engine context into a real gamelib.log** - `620fcd7da` (feat)
2. **Task 2: redaction rules** - RED `017163c80` (test), GREEN `cf9339d33` (feat); no refactor commit
3. **Task 3: category-only gate extended to shell_log_at, census** - `d175b6f2f` (test)

**Plan metadata:** the docs commit that follows this file.

`commits: 5` is the measured `git rev-list --count 90517f9e5..HEAD` at SUMMARY time. Four are this plan's. The fifth, `aee277787` (`docs(phase-88): research, post-research decisions D-26..D-29 and validation strategy`), landed on `main` between Tasks 2 and 3 from another session and touches no file this plan owns.

## TDD Gate Compliance

Task 2 carries `tdd="true"` in a `type: execute` plan (`workflow.tdd_mode` is false). Sequence: `test(87-61)` RED `017163c80`, then `feat(87-61)` GREEN `cf9339d33`, no REFACTOR. Both gates present, GREEN descends from RED.

**RED evidence.** `cargo test --bin gamelib-shell engine_log::tests`: 9 failed, 5 passed (the 5 are Task 1's tests plus the home-form tests, which pass because Task 1 already implemented rule 1). The 9 failures are each on the planned assertion, e.g. `a_full_argument_line_is_replaced_by_its_count` left `run args=[] done` where `run args=<redacted 0> done` was planned, `a_secret_shaped_value_is_replaced_and_its_key_kept` left `before token=hunter2 after`, and the required test failed on `the account survived`. No compile error, no zero-test discovery, no fixture fault: the target tests were discovered and failed on assertions.

**Evidence classifier not run.** `gsd_run check tdd-red-evidence` has adapters for TAP, JUnit, swift-testing, `unittest` and `go test`; `cargo test` text is none of them and `cargo nextest` (JUnit) is not installed on this machine, so no record could be submitted without fabricating a format. The semantic assessment above was done by hand from the real output; the survival tests were left out of the RED commit on purpose because they are regression guards that pass before any rule exists.

## Files Created/Modified

- `src-tauri/src/engine_log.rs` - `ShellEngineLog` (`for_home`, test-only `with_sink`, `impl EngineLog`), `EngineLineRedactor` (`new`, `for_home`, `for_home_with_user`, `redact`), `ENGINE_LINE_MAX`, 27 tests
- `src-tauri/src/engine_dispatch.rs` - `build_ctx` wires the log; `a_built_context_carries_the_engine_log`
- `src-tauri/src/main.rs` - `mod engine_log;`, `shell_log_at`, `shell_log_at_to`, and `engine_log.rs` added to `SHELL_SOURCE_FILES` / `SHELL_SOURCE_PARTS`
- `src-tauri/crates/gamelib-log/src/sanitize.rs` - `truncate_utf16` made `pub`
- `src/backend/__tests__/shellLogCategoryOnly.test.ts` - the `shell_log_at` extraction, the redactor-output rule, controls, header

## Decisions Made

See `key-decisions` above. The user's 2026-11-24 privacy decision (redacted engine lines in the uploadable log) was settled before this plan, so no checkpoint was raised.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `truncate_utf16` was `pub(crate)` in gamelib-log**
- **Found during:** Task 2 (rule 6, the cut)
- **Issue:** the plan says to reuse `gamelib_log::sanitize::truncate_utf16`, but the function was crate-private, so the shell could not call it and copying it would let the two cut rules drift.
- **Fix:** widened to `pub` (one word). `sanitize` was already a `pub mod`.
- **Files modified:** `src-tauri/crates/gamelib-log/src/sanitize.rs` (not in the plan's `files_modified`)
- **Verification:** `cargo test -p gamelib-log` 82 passed; the cap test asserts the marker text.
- **Committed in:** `cf9339d33`

**2. [Rule 3 - Blocking] `shell_source_files_names_every_shell_module_file` failed on the new module**
- **Found during:** Task 2 (full `cargo test --bin gamelib-shell`)
- **Issue:** the pre-existing guard requires every shell `.rs` file to be named in `SHELL_SOURCE_FILES` and `SHELL_SOURCE_PARTS`.
- **Fix:** added `engine_log.rs` to both lists in main.rs's test module.
- **Files modified:** `src-tauri/src/main.rs`
- **Verification:** full shell suite 864 passed, 0 failed.
- **Committed in:** `cf9339d33`

**3. [Rule 1 - Bug] `Option::is_none_or` used under a 1.77.2 MSRV**
- **Found during:** Task 2 (clippy `incompatible_msrv`)
- **Fix:** replaced with `!after.chars().next().is_some_and(continues_word)`, caught before the GREEN commit, so no separate commit.
- **Files modified:** `src-tauri/src/engine_log.rs`

**4. [Rule 1 - Bug] The URL rule was not idempotent**
- **Found during:** Task 2 (`redacting_a_redacted_line_changes_nothing`)
- **Issue:** a second pass over `?<redacted>` appended another `<redacted>` because the URL scan stopped at `<`.
- **Fix:** an already-masked query is kept whole. Fixed before the GREEN commit.
- **Files modified:** `src-tauri/src/engine_log.rs`

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bugs in this plan's own new code)
**Impact on plan:** none on scope; the two blocking fixes touch one word and two list entries outside the plan's file list.

## Issues Encountered

- `cargo test` text is not a format the TDD RED classifier reads (see the compliance section).
- `pnpm exec jest` printed a pnpm install and husky banner on one run; nothing outside `.planning` changed in git status.

## Known Stubs

None.

## Limits of the redactor (stated, not hidden)

- It removes the operator's home, account and the classes above. It does not remove other absolute paths (CrossOver's app path, temp directories), game keys, bottle names, or titles a crate interpolates. Item 2 of the 87-69 contract counts the engine-origin lines for the home, the account and token shapes; it is the live check on that.
- A secret that is not key-shaped (free prose) is not recognised. An unquoted secret value containing a comma, a space or an ampersand loses only its head.
- Windows home forms (`C:\Users\x`, `file:///C:/Users/x`) are generated but only unix-style homes are unit-tested here.
- `shell_log_at` also echoes the redacted line on stderr as `[shell] ...`, like `shell_log`; nothing unredacted reaches either sink.
- The gate cannot see a redactor called but discarded, a `String` helper that returns redacted text under another name, a binding made in a different function, or a macro (stated in the test header).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 87-63 can read the offline gate's warning from gamelib.log, and 87-69 can score the three formerly IMPOSSIBLE literals from `[Shell]` lines. The literals are CONDITIONAL in `87-RERUN-1-HUMAN-UAT.md` with `re-check: 87-69 Task 1`, which is where the shipped build proves them.
- wine_dispatch.rs and its tests are unchanged (`build_ctx`'s signature is the same), so 87-62 in the same wave is not blocked.

## Self-Check: PASSED

- `src-tauri/src/engine_log.rs` exists; `engine_dispatch.rs` has `.with_log(` outside comments (1); `main.rs` has `^mod engine_log;` once (1); `grep -c 'fn redact'` is 5.
- Commits `620fcd7da`, `017163c80`, `cf9339d33`, `d175b6f2f` are ancestors of HEAD.
- `git diff --stat 90517f9e5..HEAD -- src-tauri/Cargo.toml src-tauri/Cargo.lock` prints nothing (no new dependency).
- Plan verification: `cargo test --bin gamelib-shell engine_log` 27 passed; `engine_dispatch` 31 passed with every pre-existing test green; `shell_log` 7 passed; full shell suite 864 passed; `shellLogCategoryOnly.test.ts` 45 passed; prettier `--check` clean and the path is not ignored; `rustfmt --edition 2021 --check` clean on engine_log.rs and engine_dispatch.rs.

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
