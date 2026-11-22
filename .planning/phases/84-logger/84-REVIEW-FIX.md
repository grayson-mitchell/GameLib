---
phase: 84-logger
fixed_at: 2026-11-22T00:00:00Z
review_path: /Users/graysonmitchell/Projects/GameLib/.planning/phases/84-logger/84-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 84: Code Review Fix Report (round 2)

**Fixed at:** 2026-11-22
**Source review:** /Users/graysonmitchell/Projects/GameLib/.planning/phases/84-logger/84-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (WR-08, IN-05, IN-06, IN-07, IN-08, IN-09, IN-10; `fix_scope: all`)
- Fixed: 7
- Skipped: 0

Verification ran in the main checkout (`workflow.use_worktrees` is `false`), on a tree shared with a concurrent
Phase 85 session. Every commit staged explicit paths only. `src-tauri/src/main.rs` carried that session's uncommitted
hunks, so the IN-07 and IN-08 commits stage only this fix's hunks (a blob built from the index copy), and nothing of
the other session was staged, stashed or reverted.

## Fixed Issues

### WR-08: A rotation owed after a rejected Promise message can rotate away the session's already-written lines

**Files modified:** `src/backend/logger/targetWriter.ts`, `src/backend/logger/__tests__/targetWriter.test.ts`
**Commit:** 1790bba62
**Applied fix:** `#logBase` now converts the message with `stringifyLogValue` itself. A Promise-valued message is
chained on the writer's `#tail` exactly like `writeString` (owing the rotation on rejection), so a later write queues
behind it and the owed rotation lands on the first entry queued after the rejection, never one already written.
Synchronous messages keep the direct path. This is the review's first option, with the thenable test done by the
existing conversion (it also covers arrays that contain a Promise) rather than `typeof message !== 'object'`.
**Tests (written first, both confirmed failing before the fix):**
- `a Promise message that rejects keeps later writes behind it, so the owed rotation precedes them (WR-08)`: the
  mandated scenario. `logError(promise)` is the writer's first call, `writeString('current session line')` follows,
  the Promise rejects, then a third write; asserts one batch with `rotate: true` carrying the current-session line
  first, so nothing already written is rotated away.
- `a Promise message in a structured call keeps the writer order (WR-08)`: the resolved case keeps call order.

### IN-05: Refused entries vanish with no trace

**Files modified:** `src/backend/logger/forwarder.ts`, `src/backend/logger/__tests__/forwarder.test.ts`
**Commit:** 5020002a4
**Applied fix:** `enqueue` now queues one general `[Backend]` WARNING per distinct (target kind, reason) pair
(`log entry refused: <reason> (<kind> target)`), kind and reason only, never the target's own text; an unrecognised
kind prints as `unknown`. The set is instance state and bounded.
**Tests:** `reports a refused target once per kind and reason, naming no target text (IN-05)` (failed before). The
existing WR-01 refusal test now filters the report lines out.

### IN-06: Remaining paths that lose a rotation without owing it

**Files modified:** (b) `src/backend/logger/forwarder.ts`, `src/backend/logger/__tests__/forwarder.test.ts`;
(a) `src-tauri/crates/gamelib-log/src/frame.rs`, `src-tauri/crates/gamelib-log/src/writer.rs`, `src-tauri/src/sidecar.rs`
**Commits:** 1192c510a (b), 1438bbd0f (a)
**Applied fix:** Both halves fixed.
- (b) `emit` calls `oweRotation(target)` when it drops an empty body after `rotate` was claimed.
- (a) New `frame::rotating_targets(&Value)` reads the valid non-general `rotate: true` claims of a raw frame, and
  `route_log_frame` owes them (new public `Logger::owe_rotation`, which `Logger::send` now also uses) when
  `parse_frame` rejects the frame.
**Tests (both failed before):** `an empty first line that makes no entry passes its rotate claim on (IN-06)`;
`log_frame_rejection_owes_the_rotation_its_batches_claimed` (an existing `launch.log` is rotated by the next valid
frame after a rejected one); `rotating_targets_reads_only_the_valid_non_general_claims`.

### IN-07: Two native entry points with opposite escaping rules, enforced only by a comment

**Files modified:** `src-tauri/crates/gamelib-log/src/writer.rs`, `src-tauri/crates/gamelib-log/src/lib.rs`,
`src-tauri/src/log_dispatch.rs`, `src-tauri/src/main.rs`
**Commit:** 6535f3135
**Applied fix:** `Logger::log` now escapes CR/LF (the safe default). A new `Logger::log_body` is the explicit verbatim
form, used only by `log_dispatch` for the already-sanitised renderer body. `gamelib_log::log` and `shell_log_to` no
longer escape themselves. (Escaping is idempotent, so the bridges, which still escape before their sink, are
unaffected.)
**Test (failed before):** `log_escapes_line_breaks_by_default_and_log_body_keeps_a_sanitised_body_verbatim`. The
existing `log_dispatch` multi-line object tests and the `shell_log_to` escape test still pass.

### IN-08: The bridge-install warning claims all crate diagnostics are lost when only one bridge may have failed

**Files modified:** `src-tauri/crates/gamelib-log/src/bridge.rs`, `src-tauri/src/main.rs`
**Commit:** 3eebffe5b
**Applied fix:** `install_bridges` returns `BridgesInstalled { tracing, log }` (with `all()`), and
`bridge_install_warning` names only the missing bridge: tracing (steam-vent, gamelib-steamcm) or log (reqwest and the
other `log` crates), or both. This commit also rustfmt-wraps the `shell_log_to` call from the IN-07 commit.
**Tests:** `the_bridge_warning_names_only_the_bridge_that_is_missing` and the reworked
`a_failed_bridge_install_is_reported` (written first; they failed to compile before the type existed), plus the
reworked `install_bridges_sets_the_log_ceiling...` in the crate.

### IN-09: Residual free text reaches the uploaded file through paths the new gate does not cover

**Files modified:** `src/backend/__tests__/shellLogCategoryOnly.test.ts`, `src-tauri/crates/README.md`,
`src-tauri/crates/gamelib-steamcm/src/refresh/owned_demos.rs`
**Commit:** 7ff92181a
**Applied fix:** Adding the name `steamcm_diag` to the call list would have been vacuous (the shell never calls it;
it is passed to `set_diag_sink` as a pointer), so the gate now scans the producers: every `diag(` call in
`gamelib-steamcm`, held to the same category-only rule, with `kind_name(&e)` treated as the classifier. The README
(section 13) states that bridge output is crate text, WARN and above, uploaded as is, with only CR/LF escaped.
The new gate found a real case the review had not: the licensed-demos failure line wrote the `CmError` Debug text
(`{e:?}`, which for `Io` and `Protocol` carries a string). It now writes `kind_name(&e)`; the error text still goes to
the caller's `demosFailure` result, not the log.
**Tests:** the new `every diag( message in gamelib-steamcm is category-only` gate (failed before the owned_demos fix),
its non-vacuity and matcher controls, and the steamcm tests `a_demos_failure_diag_names_the_category_never_the_error_text`
and the updated `a_demos_failure_reaches_the_diag_sink` (failed before).

### IN-10: `flush` doc says it returns at once with no transport, but it first waits on the chains

**Files modified:** `src/backend/logger/forwarder.ts`
**Commit:** 7eea6b58d
**Applied fix:** The doc comment now says flush always waits for the Promise-valued messages in flight first
(bounded), then returns without a transport wait when none is bound. Doc-only, no test.

## Verification

All run in the main checkout, after the last commit:

- `npx jest src/backend/logger src/backend/__tests__/keyringDiagPersistence.test.ts src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts`: 8 suites, 146 tests passed.
- `npx jest src/backend/__tests__/shellLogCategoryOnly.test.ts tauriShellSource.test.ts loggerPortComplete.test.ts cargoFeatures.test.ts`: 4 suites, 389 tests passed.
- `npx tsc --noEmit` (the `codecheck` main config): no errors.
- `npx prettier --check` over every TS and Markdown path written: clean.
- `cargo test -p gamelib-log -p gamelib-core`: 82 + 26 lib tests plus the integration tests, all passed.
- `cargo test -p gamelib-steamcm`: 309 passed, 3 ignored.
- `cargo test --bin gamelib-shell` for `shell_log`, `log_` and `bridge` filters: 7, 76 and 3 passed (includes
  `log_frame_*` in `sidecar.rs` and `log_dispatch`). The shell binary built with the other session's in-progress files
  in the tree.
- `cargo clippy -p gamelib-log -p gamelib-steamcm --all-targets -- -D warnings`: clean.
- `cargo fmt -p gamelib-log -p gamelib-steamcm -- --check`: clean. `rustfmt --check` on `main.rs` and `sidecar.rs`
  reports nothing for those two files (it also prints diffs in other files that are not part of this work).

---

_Fixed: 2026-11-22_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
