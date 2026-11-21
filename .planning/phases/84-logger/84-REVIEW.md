---
phase: 84-logger
reviewed: 2026-11-22T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - src-tauri/crates/README.md
  - src-tauri/crates/gamelib-core/src/shutdown.rs
  - src-tauri/crates/gamelib-core/src/store.rs
  - src-tauri/crates/gamelib-log/src/bridge.rs
  - src-tauri/crates/gamelib-log/src/lib.rs
  - src-tauri/crates/gamelib-log/src/limiter.rs
  - src-tauri/crates/gamelib-log/src/sanitize.rs
  - src-tauri/crates/gamelib-log/src/writer.rs
  - src-tauri/crates/gamelib-log/tests/golden.rs
  - src-tauri/src/keyring_dispatch.rs
  - src-tauri/src/log_upload.rs
  - src-tauri/src/macos_epic_embed/nav_delegate.rs
  - src-tauri/src/macos_notifications.rs
  - src-tauri/src/main.rs
  - src-tauri/src/sidecar.rs
  - src-tauri/src/terminate_veto.rs
  - src/backend/__tests__/cargoFeatures.test.ts
  - src/backend/__tests__/keyringDiagPersistence.test.ts
  - src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts
  - src/backend/__tests__/shellLogCategoryOnly.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/logger/__tests__/forwarder.test.ts
  - src/backend/logger/__tests__/targetWriter.test.ts
  - src/backend/logger/forwarder.ts
  - src/backend/logger/index.ts
  - src/backend/logger/targetWriter.ts
  - CLAUDE.md
findings:
  critical: 0
  warning: 1
  info: 6
  total: 7
  necessity: 0
status: issues_found
---

# Phase 84: Code Review Report (round 2)

**Reviewed:** 2026-11-22
**Depth:** standard
**Files Reviewed:** 26 source and test files (plus CLAUDE.md for conventions)
**Status:** issues_found

This report supersedes the round-1 report. The round-1 report stays in git history at `16074a253`.

## Summary

Round 2 covers the Phase 84 gap-closure changes (plans 84-12 to 84-17 and pin commit `a0401bbc6`), read as diffs against
`16074a253` and then in context. Hunks from other phases (Phase 100 `LONG_RUNNING_CHANNELS`, Phase 85 store entries in
the README and `cargoFeatures` list) were not reviewed.

I also ran the checks that bear on the changes:

- `cargo test -p gamelib-log -p gamelib-core` passes.
- `cargo test --bin gamelib-shell` over the shell_log, keyring_error, log_upload and bridge tests passes.
- `cargo check --bin gamelib-shell --tests` (the macOS-only NSError code compiles on this host) and `cargo clippy` on the
  two crates are clean.
- The logger jest suites and the four persistence gates pass (185 tests).
- A scan of every `shell_log(` call for named, positional, `.display()` and path/url-shaped arguments found no external
  text still reaching `gamelib.log` through the shell's own diagnostics.
- `jiff` is built without its `logging` feature (`cargo tree -e features`), so it cannot re-enter the `log` bridge.

All 11 round-1 findings are fixed correctly. I found no critical defect and no regression in the Rust fixes. One TS
regression-shaped defect is new: the WR-05 "owed rotation" can rotate a live session's lines away (WR-01 below). The
remaining items are residuals and maintainability points.

Conventions (CLAUDE.md): every new timer in the forwarder is `unref`'d and cleared; no new spawn, task or exit work was
added in Rust, so the sidecar-exit and Rust-shutdown conventions hold. No necessity findings.

## Round-1 finding verdicts

| Round 1 | Verdict | Notes |
|---|---|---|
| WR-01 malformed entry drops a batch | Fixed | `sanitiseEntry` (lone surrogates, prefix to `Backend`) and `logTargetRefusal` (runner, type, appName incl. `isWellFormed`) cover every field the shell rejects from a TS producer; the `LogPrefix` set is a subset of `Prefix::ALL`. The runner and type sets are pinned to `paths.rs`. See IN-01 for the silent refusal. |
| WR-02 shell and bridge lines with raw CR/LF, uploaded | Fixed | `gamelib_log::log`, `shell_log_to` and both bridges escape; `shell_log_detail` keeps error text on stderr; `shellLogCategoryOnly` walks every `.rs` file. Residuals are IN-03 and IN-05. |
| WR-03 store persist truncates on temp-write failure | Fixed | A failed temp write now returns before the live file is opened. The rename-failed fallback is unchanged and remains safe. |
| WR-04 renderer object values bypass the cut | Fixed | Object values are cut with `truncate_text`; keys are limited to `name`/`message`/`stack` by the deserialiser. `Logger::submit_line` also caps native entries. |
| WR-05 dropped or skipped rotation | Fixed with a residual | Rust half is correct (owed set, deduplicated, general never owes). TS half has a new ordering hole, WR-01 below, plus IN-02. |
| WR-06 unbounded flush chain wait | Fixed | One deadline across chain and transport waits; both timers `unref`'d and cleared. See IN-06 for a stale doc sentence. |
| WR-07 `validate_paste_url` returns raw text | Fixed | Returns `parsed.to_string()`; the store key, emitted URL and log line all carry the normalised value. |
| IN-01 "lines dropped" counts messages | Fixed | `send` counts the entries a lost frame carried. |
| IN-02 limiter windows on sender timestamps | Fixed | `anchor = ts.min(clock.now_ms())`; the line itself keeps its own `ts`. |
| IN-03 `install_bridges` failure silent | Fixed | `bridge_install_warning`. See IN-04 for an inaccuracy in its wording. |
| IN-04 `ExitBudget` remaining is stale | Fixed | `FinishContext` carries a deadline `Instant`; `remaining_now()` is read at flush time. The README and the pinned `tauriShellSource` regex were updated together. |

## Warnings

### WR-01: A rotation owed after a rejected Promise message can rotate away the session's already-written lines

**File:** `src/backend/logger/forwarder.ts:306-312` (owe on rejection), `:346` (spend on next enqueue); `src/backend/logger/targetWriter.ts:108-111,152-154`
**Issue:** The WR-05 fix assumes nothing for the target is queued between the claim and the rejection, so that "carry the
rotation to the next entry" is the same as "rotate before the first entry". That holds for `writeString`, which chains
behind `#tail`. It does not hold for `#logBase`. When the first call on a rotating writer is `logError(promise)`, `#pending`
is 0, so `#logBase` calls `logLine` directly with the Promise body and does not extend `#tail`. The forwarder holds the
line in its own `#chains`, while a following `writeString('x')` sees `#pending === 0` and enqueues at once with
`rotate=false`. When the Promise then rejects, `oweRotation` runs and the third write consumes the owed flag
(`this.#owedRotations.delete(key) || rotate`), so `launch.log` is rotated to `.old` after `x` was already written (or sent).
Before the fix the rotation was lost and the file was appended to the previous session. After the fix the live session's own
lines are moved out of the log users upload. Likelihood is low (it needs a rejecting Promise as the first call on a rotating
game writer), but the result is silent loss of current-session content.
**Fix:** Make the writer own ordering for Promise messages in `#logBase` too, so a later write cannot overtake it:
```ts
// #logBase: treat a thenable like writeString does
if (this.#pending === 0 && typeof message !== 'object') { logLine(...); return }
this.#extend(
  this.#tail
    .then(() => message)
    .then(
      (text) => logLine(this.#target, rotate, level, prefix, text),
      () => { if (rotate) oweLogRotation(this.#target) }
    )
)
```
Alternatively stamp each owed claim with the enqueue count for its key at claim time and only owe when no entry for that key
has been queued since.

## Info

### IN-01: Refused entries vanish with no trace; `refusedTotal` is never read

**File:** `src/backend/logger/forwarder.ts:334-337,426` and `src/backend/logger/index.ts` (no consumer)
**Issue:** `enqueue` drops an entry whose target `logTargetRefusal` rejects and only increments `#refusedTotal`. Nothing in
production reads `stats().refusedTotal` (only a test does). The one user-visible trace is the constructor WARNING in
`LogWriter`, and `LogWriter` is the only producer today and already refuses, so the forwarder-level check is unreachable on
current call paths. A future direct `enqueueLogEntry` caller would lose lines with no log line saying so.
**Fix:** Emit one rate-limited `[Backend]` WARNING the first time a target is refused (target kind and reason only), or
report `refusedTotal` alongside the `lines dropped` line.

### IN-02: Remaining paths that lose a rotation without owing it

**File:** `src-tauri/src/sidecar.rs:375-387` (`handle_log_frame`), `src/backend/logger/forwarder.ts:294-297` (`emit`)
**Issue:** WR-05's principle is "do not spend a rotate claim on an entry that never reaches a frame". Two paths still do.
(a) A frame the shell rejects in `parse_frame` (for example the accepted over-cap control-character case) is never submitted,
so its `rotate: true` is lost; only `Logger::send` owes rotations. (b) `emit` returns early for an empty message after
`rotate` was claimed (`logInfo('')` as a writer's first call), so that claim is spent on nothing. If (b) is covered by the
accepted "empty first call" item, ignore it; that item was recorded against the Rust side.
**Fix:** For (a), have `route_log_frame` owe the rotate flags of a rejected frame before the parse error is returned (the
batches are not parsed, so a cheap pre-scan of `batch[*].rotate` and target would be needed), or document the residual. For
(b), call `oweRotation(target)` when `emit` drops an empty body.

### IN-03: Two native entry points with opposite escaping rules, enforced only by a comment

**File:** `src-tauri/crates/gamelib-log/src/lib.rs:38-46`, `src-tauri/crates/gamelib-log/src/writer.rs:149-153`, `src-tauri/src/main.rs:585-590`
**Issue:** `gamelib_log::log` escapes CR/LF, but the public `Logger::log` is verbatim. `shell_log_to` has to remember to call
`escape_line_breaks` itself because it takes a `&Logger`. The next native caller of `Logger::log` reintroduces the WR-02 forgery.
The renderer path needs the verbatim form only because its object body is multi-line on purpose.
**Fix:** Make `Logger::log` escape, and give `log_dispatch` an explicit verbatim method (for example `log_body`) used only
for sanitised renderer bodies. The existing tests then cover the safe default.

### IN-04: The bridge-install warning claims all crate diagnostics are lost when only one bridge may have failed

**File:** `src-tauri/crates/gamelib-log/src/bridge.rs:243-255`, `src-tauri/src/main.rs:669-683`
**Issue:** `install_bridges` returns `tracing_set && log_set`. If only the `log` logger was already taken, the tracing layer
is installed and steam-vent diagnostics still arrive, yet the warning says steam-vent, reqwest and the rest "will not reach
gamelib.log". The reverse also holds. The warning then misdirects whoever reads it.
**Fix:** Return the two booleans (or a small enum) and name which bridge is missing: `tracing` (steam-vent, gamelib-steamcm)
or `log` (reqwest).

### IN-05: Residual free text reaches the uploaded file through paths the new gate does not cover

**File:** `src-tauri/src/steamcm_dispatch.rs:342-349` (`steamcm_diag`), `src-tauri/crates/gamelib-log/src/bridge.rs:177-181,231-235`, `src/backend/__tests__/shellLogCategoryOnly.test.ts:121-140`
**Issue:** WR-02's privacy delta was that `gamelib.log` is posted to a public paste service. 84-17 closes it for `shell_log`
and `shell_log_detail`, and the gate only scans those two names. `steamcm_diag` and the tracing/`log` bridges still write
crate-authored text (peer, URL and error strings at WARN and above) into the same file, with only CR/LF handled. I read the
current `diag(` call sites in `gamelib-steamcm` and they are categories, so this is a judgment call about future drift, not a
demonstrated leak. The disposition records WR-02 as fixed without this boundary being stated.
**Fix:** Add `steamcm_diag` to the gate's call list, and state in the README that bridge output is crate text and uploaded as
is (or redact URL query strings in the bridge sink).

### IN-06: `flush` doc says it returns at once with no transport, but it first waits on the chains

**File:** `src/backend/logger/forwarder.ts:363-371`
**Issue:** The comment says flush resolves "or at once when no transport is bound". `flush` awaits `#settleChains` first, up
to `LOG_FLUSH_TIMEOUT_MS`, before it checks `#transport === null`. With a stuck Promise message and no transport, a caller
waits the full timeout, not zero.
**Fix:** Reword: "returns after the chain wait (bounded) and, with no transport, without a transport wait", or check
`#transport === null` before waiting on the chains if a quick return is wanted.

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
