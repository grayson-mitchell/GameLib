---
phase: 84-logger
plan: 17
subsystem: logging
tags: [rust, gamelib-log, privacy, shell_log, gap-closure]
status: complete
requires:
  - phase: 84-logger
    provides: "84-16 escape_line_breaks in shell_log_to; shell lines in gamelib.log (84-08)"
provides:
  - "shell_log_detail(message, detail): message to gamelib.log, message plus detail to stderr"
  - "27 shell_log call sites converted to category-only messages"
  - "shellLogCategoryOnly.test.ts: source-text gate against external text in shell_log messages"
affects: [84-18]
tech-stack:
  added: []
  patterns:
    - "a shell diagnostic that would carry error, OS or path text uses shell_log_detail; the message is a category (operation plus kind/variant/class/bool/count)"
    - "dev spawn paths and env values go to stderr (shell_eprintln!), never gamelib.log"
key-files:
  created:
    - src/backend/__tests__/shellLogCategoryOnly.test.ts
  modified:
    - src-tauri/src/main.rs
    - src-tauri/src/keyring_dispatch.rs
    - src-tauri/src/terminate_veto.rs
    - src-tauri/src/macos_notifications.rs
    - src-tauri/src/sidecar.rs
    - src-tauri/src/macos_epic_embed/nav_delegate.rs
    - src/backend/__tests__/keyringDiagPersistence.test.ts
    - src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts
key-decisions:
  - "keyring failure category is the keyring::Error variant name (or the class of the keyring:<class>:<payload> string); the error Debug text stays as the stderr detail, so the developer transcript keeps the same information as before"
  - "the gate scans src-tauri/src itself rather than the shared tauriShellSource reader, because that reader excludes the macOS siblings where the notification and Epic-embed lines live"
  - "shell_log_detail_to(logger, message, detail) is the testable half, mirroring shell_log_to, so the log-half contract is tested through a real Logger"
requirements-completed: [FND-05]
duration: 25 min
completed: 2026-11-22
commits: 2
plan_head_before: 9264ca57c96af80bcd349b46366d57ceab73e689
plan_head_after: 6b2ecf847a276f2df32d4b5724661491f00f13dc
actuals:
  tokens: 10900
  tasks: 2
  commits: 2
---

# Phase 84 Plan 17: Category-only shell_log messages Summary

**Every shell diagnostic written to gamelib.log (the file `uploadLogFile` posts to dpaste.com) now carries a category instead of error text, an NSError description or an absolute path; the detail moves to stderr through the new `shell_log_detail`, and `shellLogCategoryOnly.test.ts` fails if one comes back.**

## Findings fixed

| Finding | Commits | Sites converted | Gate |
|---|---|---|---|
| WR-02 (privacy half) | 13d057271 (Task 1), 6b2ecf847 (Task 2) | 27: keyring_dispatch.rs 7, terminate_veto.rs 6, macos_notifications.rs 1, main.rs 3, sidecar.rs 7, nav_delegate.rs 3 | `src/backend/__tests__/shellLogCategoryOnly.test.ts` |

Threats T-84-51 (disclosure through shell_log call sites) and T-84-52 (regression) are mitigated.

## What changed

- `shell_log_detail(message, detail)` in main.rs (and its testable half `shell_log_detail_to`): stderr gets `[shell] <message>: <detail>`, gamelib.log gets `<message>` only (level read from the message, CR/LF neutralised by `shell_log_to`).
- keyring: `keyring_error_kind` (variant name) and `keyring_error_class` (the `<class>` of `keyring:<class>:...`); the seven failure lines are `keyring {channel} failed ({kind})` with the error as detail. The `keyring {channel}` count stays 9.
- quit routing and the five tauri menu failures keep their operation wording; the error is the detail. The notification authorization line logs `error=<none | NSError domain and code>`; the localized description still goes to `STARTUP_AUTH_ERROR`.
- main.rs: the FATAL spawn line logs the `io::ErrorKind`; the reaper line binds `kind` first (text unchanged); the deep-link failure logs `err (<ms>ms)`.
- sidecar.rs `spawn_sidecar_dev`: node, entry, cwd, GAMELIB_SHELL_EXE, GAMELIB_APP_ROOT, GAMELIB_STEAM_ROOT_DEFAULT and forward_args move to `shell_eprintln!` (as `spawn_sidecar_packaged` already does); gamelib.log keeps `spawning sidecar (dev): entry_exists=<bool> steam_root_source=<source> forward_args=<count>`. The FAILED line logs `<ErrorKind> (entry_exists=<bool>)` with the error and node path as detail.
- nav_delegate.rs: the two open_external hand-off failures and the navigation-failure line become `shell_log_detail` calls; the failure line logs `NSError domain=<d> code=<n>` and the localized description is the detail.
- keyringDiagPersistence.test.ts: pins moved to the new literals with exact counts (7 `failed ({kind})`, none of `failed: {e`; 14 calls = 7 plain + 7 detail); the leak-shape and double-prefix guards now match `shell_log_detail(` too, each with a synthetic positive control.
- macosEpicEmbedDiagPersistence.test.ts: the count of 30 now spans both call shapes (27 `crate::shell_log(` + 3 `crate::shell_log_detail(`), reason recorded in the file.

## The gate

`shellLogCategoryOnly.test.ts` walks every `.rs` under `src-tauri/src` except the generated `ipc_contract.rs`, comment-strips with the shared stripper, extracts the balanced argument list of each `shell_log(` / `shell_log_detail(` call (first argument only for the latter) and fails on a named placeholder (`{e}`, `{err}`, `{error}`, `{description}`, `{cwd}`, `{node}`, `{entry}`, `{shell_exe}`, `{app_root}`, `{steam_root}`, `{forward_args...}`, with or without a spec), on `localizedDescription`, or on any of those names as a positional identifier outside a string literal. 31 tests: the scan itself, a non-vacuity test (macOS siblings reached, more than 50 plain and more than 10 detail calls found, generated file excluded), 21 positive controls, 6 negative controls, and definition and first-argument-only checks. Its header states the spellings it catches and that it is not a complete proof (it cannot see error text that arrives under another name, via a `String`-returning helper, a macro, or the `set_diag_sink` pointer).

## TDD record

- RED, Task 1: `shell_log_detail_keeps_the_detail_out_of_gamelib_log` against a stub that wrote the detail into the log half failed on the planned assertion (`the line is not the message alone: "... keyring k failed (platform-failure): secret-looking OS text"`); `keyring_error_kind_names_the_variant_only` and `keyring_error_class_names_the_class_only` failed on `left: "other" right: "no-entry"` / `"unavailable"` against stubs returning `other`; keyringDiagPersistence failed 2 tests (the call-count split and the literal pins). Semantic assessment: each target test executed and failed on the planned assertion, no build, fixture or zero-test fault. The cargo output is not in a format the `gsd_run check tdd-red-evidence` classifier supports, so no classifier verdict was recorded.
- RED, Task 2: `shellLogCategoryOnly.test.ts` failed with exactly 13 offences at HEAD after Task 1 (nav_delegate.rs 3, main.rs 3, sidecar.rs 7), matching the plan's prediction; the other 14 of the plan's 27 were already converted by Task 1.
- GREEN: both tasks' tests pass after the conversions.
- The plan specifies one commit per task (Rust tests live inline in the files being changed, and the RED-commit gate cannot see Rust), so there are no separate `test(84-17)` commits. Recorded here as the TDD-gate compliance note.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tauriShellSource.test.ts forbids a test naming `main.rs` as a quoted string**
- **Found during:** Task 2
- **Issue:** the new gate's non-vacuity test asserted `files` contains `'main.rs'`, which tripped "no test or meta script reads main.rs directly".
- **Fix:** dropped that one assertion; the gate still walks main.rs, and the non-vacuity test asserts the macOS siblings are reached and that call counts are large enough.
- **Files modified:** src/backend/__tests__/shellLogCategoryOnly.test.ts
- **Commit:** 6b2ecf847

**2. [Rule 3 - Blocking] macosEpicEmbedDiagPersistence count pin moved**
- **Found during:** Task 2
- **Issue:** converting three call sites to `crate::shell_log_detail(` dropped `crate::shell_log(` from 30 to 27. The plan anticipated this.
- **Fix:** the pin counts both shapes (total 30, detail 3) and the double-prefix regex covers `shell_log_detail`. Reason recorded in the file.
- **Files modified:** src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts
- **Commit:** 6b2ecf847

**3. Acceptance wording, not a code deviation:** `grep -c "fn shell_log_detail" main.rs` reports 4, not 1, because it also matches `shell_log_detail_to` and two test function names; `grep -c "fn shell_log_detail(" ` is 1. Likewise `grep -c 'cwd=' sidecar.rs` is 2 (the stderr lines of the dev and packaged paths); the plan's own criterion, `shell_log(&format!("  cwd=` count, is 0.

**Total deviations:** 2 auto-fixed (both Rule 3), 0 architectural. **Impact:** none on scope.

## Verification

- `cargo test --bin gamelib-shell`: 597 passed, 0 failed (the shell_log, keyring and terminate filters each ran non-zero tests).
- jest: shellLogCategoryOnly, keyringDiagPersistence, shellDiagPersistence, macosEpicEmbedDiagPersistence, tauriShellSource all pass (364 tests).
- `pnpm codecheck` passes; `rustfmt --edition 2021 --check` clean on keyring_dispatch.rs, terminate_veto.rs, macos_notifications.rs, sidecar.rs, nav_delegate.rs; main.rs has no diff in the lines this plan added (the crate is not fmt-clean as a whole); `prettier --check` clean on the three TS files after `--file-info` confirmed none is ignored.
- Acceptance: `failed: {e` 0 in keyring_dispatch.rs, `({e})` 0 and `{e} -- exiting` 0 in terminate_veto.rs, 9 `keyring {channel}` occurrences in the keyring handler bodies.
- Not run: a live check that the dev transcript shows the stderr detail and gamelib.log does not (the unit test proves the log half through a real Logger).

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or trust-boundary file access.

## Notes for follow-up

- The gamelib-conventions skill and `src-tauri/crates/README.md` do not yet mention `shell_log_detail` or the category-only rule; this plan did not edit them.
- `shell_eprintln!` lines elsewhere (tray, single-instance) already stay on stderr and are outside the gate by design.

## Self-Check: PASSED

Created and modified files exist; commits 13d057271 and 6b2ecf847 are ancestors of HEAD; `commits: 2` measured with `git rev-list --count` from the persisted ledger.
