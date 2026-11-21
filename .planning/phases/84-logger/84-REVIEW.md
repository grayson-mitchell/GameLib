---
phase: 84-logger
reviewed: 2026-11-21T00:00:00Z
depth: standard
files_reviewed: 82
files_reviewed_list:
  - src-tauri/crates/gamelib-log/src/writer.rs
  - src-tauri/crates/gamelib-log/src/frame.rs
  - src-tauri/crates/gamelib-log/src/format.rs
  - src-tauri/crates/gamelib-log/src/sanitize.rs
  - src-tauri/crates/gamelib-log/src/limiter.rs
  - src-tauri/crates/gamelib-log/src/bridge.rs
  - src-tauri/crates/gamelib-log/src/prefix.rs
  - src-tauri/crates/gamelib-log/src/lib.rs
  - src-tauri/crates/gamelib-core/src/store.rs
  - src-tauri/crates/gamelib-core/src/paths.rs
  - src-tauri/crates/gamelib-core/src/shutdown.rs
  - src-tauri/src/log_dispatch.rs
  - src-tauri/src/log_upload.rs
  - src-tauri/src/native_router.rs
  - src-tauri/src/native_handlers.rs
  - src-tauri/src/sidecar.rs
  - src-tauri/src/main.rs
  - src-tauri/src/shell_open.rs
  - src/backend/logger/forwarder.ts
  - src/backend/logger/targetWriter.ts
  - src/backend/logger/stringifyLogValue.ts
  - src/backend/logger/index.ts
  - src/backend/sidecar/sidecarRpc.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/stdinEofRelease.ts
  - (remaining scoped files: mechanical import/rename codemod, skimmed via diff; see review-src.txt)
findings:
  critical: 0
  warning: 7
  info: 4
  total: 11
  necessity: 0
status: issues_found
---

# Phase 84: Code Review Report

**Reviewed:** 2026-11-21
**Depth:** standard
**Files Reviewed:** 82 (the new/heavily changed Rust and TS logger files read in full; the mechanical `shell_diag` to `shell_log` and `LogWriter` import renames read as diffs)
**Status:** issues_found

## Summary

The native writer, frame validator, limiter, bridges, store and upload handlers are carefully built: the target is
always a typed descriptor resolved through `log_file`, the frame is validated whole, callers never block, and the
writer thread is panic-isolated. No injection or path-traversal route was found. The defects are about silent log loss
and a few trust-boundary gaps that this phase newly created:

- the sidecar frame path loses whole batches for one malformed entry (lone surrogate, unknown prefix/runner);
- the shell's own and crate-bridge lines are written without line-break neutralisation, and now land in the file users
  upload to a public paste service;
- the store's "atomic with direct fallback" persist can truncate the live file when disk is full;
- renderer `{name,message,stack}` objects bypass the 65,536-unit cut the module documents.

Known/accepted items from the SUMMARYs (1M control-char entry over the 4 MiB frame cap, empty first non-general call
not rotating in Rust, `exit finished` logged before the deadline line) were not re-reported. The structural (fallow)
pre-pass was not provided. No necessity findings.

## Warnings

### WR-01: One malformed entry drops the whole 32 KiB batch, including unrelated lines and other targets

**File:** `src/backend/logger/forwarder.ts:195-217` (producer), `src-tauri/crates/gamelib-log/src/frame.rs:173-202` (reject-whole)
**Issue:** The shell rejects the entire `kind:"log"` frame on the first bad field, and the TS forwarder validates nothing
before batching. Two concrete ways an otherwise-good frame is lost:

1. **Lone surrogates.** `JSON.stringify` writes a lone surrogate as `"\ud83d"`. `serde_json` refuses it
   ("lone leading surrogate in hex escape"), so `serde_json::from_str` fails in `start_reader`
   (`sidecar.rs`, `Err(_)` arm) and the whole line is treated as a non-JSON diagnostic and printed to stderr
   (`[sidecar:out] ...`, discarded under LaunchServices). Any `slice`/`substring` of logged text in the app can produce
   a lone half. `clipText` guards its own cut but nothing guards other callers. No vector in
   `logFrameVectors.json` or the forwarder tests covers this.
2. **Unknown prefix or runner.** `LogPrefix` is typed as `string` (`constants.ts`), so any string compiles; an entry whose
   prefix is not in `Prefix::ALL`, or a game/runner target with a runner outside `LogRunner`, makes `parse_frame` return
   `Prefix`/`Runner` and the frame is dropped. The only trace is one rate-limited `log frame rejected: prefix` line that
   does not say which lines were lost.

Because `buildFrame` packs up to `LOG_BATCH_MAX_BYTES` of entries from several targets into one frame, the collateral loss
is up to 32 KiB of unrelated lines, possibly including a game transcript.
**Fix:** Sanitise at the single producer. In `LogForwarder.enqueue`, after `clipEntry`, replace lone surrogates
(`text.toWellFormed()` on Node 20+, else a `/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g`
replace with U+FFFD) on `raw` and `line.msg`. Validate `prefix` against the closed set (fall back to `Backend`) and
`runner` against the six runners before queueing. Optionally have the Rust side drop only the offending batch or entry and
count it instead of rejecting the frame whole.

### WR-02: Shell and crate-bridge lines are written with raw CR/LF, and now land in the file users upload

**File:** `src-tauri/crates/gamelib-log/src/format.rs:28-54`, `src-tauri/crates/gamelib-log/src/bridge.rs:169-181,226-235`, `src-tauri/src/main.rs` (`shell_log`, e.g. the deep-link arm `err={e}`)
**Issue:** `format_line` appends `body` verbatim. This phase added two native sources that carry text the renderer-sanitiser
never sees: `shell_log` (which interpolates sidecar error strings, e.g. `delivered OS deep link to sidecar: err={e}`, and
keyring errors) and the tracing/`log` bridges (`message` fields from steam-vent, hyper, reqwest, which can echo
server-supplied text via `record_str` / `record.args()`). A newline in any of them writes a second, forgeable line such as
`(12:34:56) [ERROR]:   [Backend]: ...` into `gamelib.log`. This is the same class as IN-04 that criterion 1 closed for
the renderer, reopened at the new entry points. `log_upload.rs` escapes per call site (`one_line`), which shows the writer
does not do it centrally.

Related privacy delta: the shell's diagnostics used to go to `gamelib-shell.log`, which has no upload path. They now go to
`gamelib.log`, which `uploadLogFile` posts to public dpaste.com. Lines such as `cwd=`, `GAMELIB_APP_ROOT=`, the sidecar
spawn line and `err={e}` therefore leave the machine on upload.
**Fix:** Neutralise at the writer for non-TS sources. Either add `escape_line_breaks` to the `Shell` and bridge sinks (the
function already exists in `sanitize.rs`), or make `Logger::log` (the native-origin entry point) escape `\r`/`\n` while
`submit_line`/`Entry::Raw` stay verbatim for the TS-compatible paths. Review which `shell_log` call sites interpolate
external text (`err={e}`) and keep only a category.

### WR-03: Store persist can truncate the live file when the temp write fails (data loss)

**File:** `src-tauri/crates/gamelib-core/src/store.rs:181-202`
**Issue:** `persist_atomic` writes `<file>.tmp-<pid>` then renames. If the temp write fails (disk full, quota, permissions on
a new tmp name), `atomic` is `Err` and the code falls through to `write_private(path, ...)`, which opens the real file with
`.truncate(true)` and then fails the same way. The result is an empty or partial `uploadedLogs.json` on disk while the
in-memory value is rolled back by the caller, so memory and disk disagree and the previous contents are gone. The fallback
was kept from the TS store for the "rename blocked by a Windows reader" case; it is only safe when the temp file was fully
written.
**Fix:** Run the direct write only when the temp write succeeded and the rename failed:
```rust
let tmp_written = write_private(&tmp, serialized.as_bytes());
let atomic = tmp_written.as_ref().map(|_| ()).map_err(|e| io::Error::from(e.kind()))
    .and_then(|()| rename(&tmp, path));
if atomic.is_ok() { return Ok(()); }
let _ = fs::remove_file(&tmp);
if tmp_written.is_err() { return atomic; }   // disk full: leave the live file alone
write_private(path, serialized.as_bytes())
```
Phase 85 widens this owner to real stores, so fix it before then.

### WR-04: Renderer `{name,message,stack}` objects bypass the documented 65,536-unit cut

**File:** `src-tauri/crates/gamelib-log/src/sanitize.rs:154` (and module doc at lines 1-7)
**Issue:** The module states strings are cut at `LOG_TEXT_MAX`, but `renderer_body` applies `sanitize_text` only to the `Text`
and `List` arms. The `Object` arm calls `pretty_object` on the raw values, so a renderer `stack` of any size is written in
full (and on the native path `Logger::log` has no per-entry cap, unlike the sidecar path's 1 MiB clip). The old TS sanitiser
had the same gap, but it is now the Rust "trust boundary" and a compromised or buggy renderer can fill the disk with unique
(so non-dedupable) lines.
**Fix:** Truncate each object value with `truncate_text` before `pretty_object` (escaping is already done by
`serde_json::to_string`), and cap the entry in `Logger::log`/`submit_line` at `LOG_ENTRY_MAX_UTF16` as the frame path does.

### WR-05: A dropped or skipped rotating entry silently skips rotation

**File:** `src/backend/logger/forwarder.ts:302-316` (`#enforceCaps`), `src/backend/logger/targetWriter.ts:112-126`, `src-tauri/crates/gamelib-log/src/writer.rs:164-181`
**Issue:** `rotate: true` rides only on a writer's first accepted entry, claimed once. Three paths lose it permanently:
(a) `#enforceCaps` drops the oldest queued entry, which is often that first entry, so the launch log is never rotated and the
new launch is appended to the previous one; (b) `Logger::send` drops a whole frame when the 4,096-message channel is full;
(c) `writeString` claims the rotation before awaiting a Promise-valued message, and if that promise rejects `send` never runs.
This is distinct from the accepted "empty first call" item. A user then uploads a launch log that mixes two sessions.
**Fix:** Do not consume the claim until the entry is queued (carry the claim to the next entry when the first is dropped or
its promise rejects), and when `#enforceCaps` evicts an entry with `rotate: true`, set `rotate` on the next surviving entry
of the same target.

### WR-06: `LogForwarder.flush` promises a bounded wait but the chain wait is unbounded

**File:** `src/backend/logger/forwarder.ts:253-274` (doc at 248-252, `index.ts:50-61`)
**Issue:** The doc says `flush` resolves "after at most `LOG_FLUSH_TIMEOUT_MS`" and that the fatal guard "must not hang". The
`while (this.#chains.size > 0) await Promise.all(...)` loop has no timeout: a Promise-valued log message that never settles
(`logError(pendingPromise)`) keeps its key in `#chains` forever and `flush` never resolves. The caller in `processGuards.ts`
has its own outer bound, so the process still exits, but `releaseOnStdinEof` and any new caller rely on the stated contract,
and the queued lines behind the stuck chain are never flushed at EOF.
**Fix:** Race the chain wait against `LOG_FLUSH_TIMEOUT_MS` (an unref'd timer), then continue to the transport flush.

### WR-07: `validate_paste_url` stores and returns the raw response text, not the parsed URL

**File:** `src-tauri/src/log_upload.rs:155-164`
**Issue:** The check parses `trimmed` but returns `trimmed.to_string()`. The WHATWG parser strips embedded tab and newline
characters and percent-encodes spaces, so a response such as `https://dpaste.com/AB\nCD` validates yet the stored key and
the URL pushed to the renderer (`logFileUploaded`, later opened via `openExternal`) contain the raw control character. The
host check holds, but the returned string is not the one that was validated.
**Fix:** `plain.then(|| parsed.to_string())` so what is stored, emitted and later re-validated is the normalised URL.

## Info

### IN-01: Writer counts messages as "lines" in its drop report

**File:** `src-tauri/crates/gamelib-log/src/writer.rs:177-181,298-307`
**Issue:** `dropped` is incremented once per rejected channel message (a whole frame, a Flush, or a Tick), but
`report_drops` logs `{n} lines dropped`. A 200-entry frame lost to a full channel reads as one dropped line.
**Fix:** Count entries (`batches.iter().map(|b| b.entries.len()).sum()`) in `submit`, or word the report as "messages".

### IN-02: Limiter windows key off sender-supplied timestamps

**File:** `src-tauri/crates/gamelib-log/src/limiter.rs:107-121,160-165`
**Issue:** `admit` anchors a window at the entry's own `ts`, while `expire` from the tick/handle path uses the Logger clock. A
sidecar entry whose `ts` is far in the future creates a slot that never expires against the real clock (it stays until it is
the oldest of 256 keys), so its suppressed count is never summarised until eviction or `drain`. Frame `ts` is not clamped in
`frame.rs`.
**Fix:** Clamp `ts` to `now` (or `now + small skew`) when a frame is parsed, or anchor the window on the Logger clock.

### IN-03: `install_bridges` failure is silent

**File:** `src-tauri/src/main.rs` (`init_native_logger`), `src-tauri/crates/gamelib-log/src/bridge.rs:243-255`
**Issue:** The return value of `install_bridges` is discarded. If another global tracing subscriber or `log` logger was
installed first (a plugin), all steam-vent/reqwest diagnostics vanish with no line saying so.
**Fix:** Log one `[Shell]` WARNING when it returns `false`.

### IN-04: `ExitBudget` remaining is computed before finish's own work

**File:** `src-tauri/crates/gamelib-core/src/shutdown.rs` (`run_exit`, `FinishContext`), `src-tauri/src/main.rs` (`handle_exit` finish closure)
**Issue:** `ctx.remaining` is `total - elapsed` measured when finish starts, but finish first runs the reaper disarm, power
assertion release and socket cleanup, then logs, then flushes for the full `ctx.remaining`. The flush can therefore run past
the 5 s budget by the time those steps took. Likely small, but the "one 5 s budget" contract is not exact.
**Fix:** Pass a deadline (`Instant`) instead of a duration, and flush for `deadline.saturating_duration_since(now)`.

---

_Reviewed: 2026-11-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
