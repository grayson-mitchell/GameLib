---
phase: 84-logger
reviewed: 2026-11-22T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src-tauri/crates/README.md
  - src-tauri/crates/gamelib-log/src/bridge.rs
  - src-tauri/crates/gamelib-log/src/frame.rs
  - src-tauri/crates/gamelib-log/src/lib.rs
  - src-tauri/crates/gamelib-log/src/writer.rs
  - src-tauri/crates/gamelib-steamcm/src/refresh/owned_demos.rs
  - src-tauri/src/log_dispatch.rs
  - src-tauri/src/main.rs
  - src-tauri/src/sidecar.rs
  - src/backend/__tests__/shellLogCategoryOnly.test.ts
  - src/backend/logger/__tests__/forwarder.test.ts
  - src/backend/logger/__tests__/targetWriter.test.ts
  - src/backend/logger/forwarder.ts
  - src/backend/logger/targetWriter.ts
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
  necessity: 0
status: issues_found
---

# Phase 84: Code Review Report (round 3)

**Reviewed:** 2026-11-22
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Round 3 reviews the round-2 fix commits (1790bba62, 5020002a4, 1192c510a, 1438bbd0f, 6535f3135, 3eebffe5b,
7ff92181a, 7eea6b58d) and the quick-task `Logger::hold()` handshake (7dc3d632b). Phase 85 store hunks in
`main.rs`, `sidecar.rs` and `log_dispatch.rs` and the concurrent session's uncommitted files were left out of
scope. Verification run: `npx jest src/backend/logger src/backend/__tests__/shellLogCategoryOnly.test.ts`
(7 suites, 154 tests pass) and `cargo test -p gamelib-log` (all pass).

All eight round-2 findings are closed as the findings described them, and the Rust halves (IN-06 a, IN-07,
IN-08, IN-09, the `hold()` handshake) are sound. The two defects below are both side effects of the WR-08 fix:
by chaining Promise-valued structured messages inside `LogWriter`, the fix moved them out of the forwarder's
own chain bookkeeping, and two properties the forwarder guaranteed for those messages no longer hold.

## Round-2 fix verification

- **WR-08 (1790bba62): closes the finding, with two regressions (WR-09, WR-10).** `#logBase` converts the
  message synchronously, chains a Promise body on `#tail`, owes the rotation on rejection, and a later write
  queues behind it, so the owed rotation reaches the first entry queued after the rejection. Both new tests
  assert exactly that and pass. `stringifyLogValue` never throws, so the new synchronous conversion cannot
  throw into a caller.
- **IN-05 (5020002a4): closed.** One general WARNING per (kind, reason), kind and reason only, never the
  target text; an unrecognised kind prints as `unknown`; the set is instance state and bounded (a few pairs).
  `logLine` for the general target cannot recurse into `enqueue`'s refusal branch.
- **IN-06 (1192c510a, 1438bbd0f): closed.** (b) `emit` owes the rotation when an empty body makes no entry.
  (a) `rotating_targets` reads only valid non-general claims and `route_log_frame` owes them on a reject; the
  unit test and the end-to-end `launch.log` test cover it. A raw frame that fails `serde_json::from_str`
  never reaches `route_log_frame` and still cannot owe anything, but its content is unreadable, so no claim
  can be recovered from it.
- **IN-07 (6535f3135): closed.** `Logger::log` escapes CR/LF; the only verbatim caller is
  `log_dispatch::write_renderer_log` via `log_body`. The sole other `Logger::log` callers (`shell_log_to`,
  the bridge sinks, `gamelib_log::log`) are native text, and escaping twice is a no-op because the escape
  emits no CR or LF.
- **IN-08 (3eebffe5b): closed.** `BridgesInstalled { tracing, log }` replaces the combined bool, and the
  warning names only the missing bridge. `install_bridges` has no other caller.
- **IN-09 (7ff92181a): closed.** The gate scans every `diag(` producer in `gamelib-steamcm` and is
  non-vacuous. I read the multi-line `diag(` calls and none carries external text now. The one real case
  (`{e:?}` in the demos failure) writes `kind_name(&e)`. The README section states the bridge boundary.
- **IN-10 (7eea6b58d): doc is accurate for the forwarder's own chains but is now overstated for writer-held
  Promise messages (see WR-09).**
- **Quick task 7dc3d632b (`Logger::hold()`): sound.** `entered` is acked inside the arm before parking;
  `hold()` panics after `GENEROUS` instead of hanging; `hold_returns_only_once_the_writer_is_parked` passes.

## Warnings

### WR-09: `flush()` no longer waits for a Promise-valued structured message, so the fatal-exit guard can lose it

**File:** `src/backend/logger/targetWriter.ts:168-185` (cause), `src/backend/logger/forwarder.ts:394-449` (doc and wait)
**Issue:** Before 1790bba62 a structured call with a Promise message reached `LogForwarder.logLine`, which
registered it in `#chains`. `flush()` calls `#settleChains`, which waits on exactly that map, so a pending
message was awaited (bounded by `LOG_FLUSH_TIMEOUT_MS`) before the final frame. Now the writer holds the
Promise on its own `#tail` and calls `logLine` only after it resolves, so the forwarder's `#chains` never
sees it. A `flush()` taken while such a message is pending (the `uncaughtException` guard, and
`releaseOnStdinEof`) returns at once and the line, plus every later write queued behind it on that writer,
is lost at exit. The IN-10 doc rewrite ("It always waits for the Promise-valued messages in flight first")
is therefore wrong for these messages. `writeString` with a Promise already had this gap; WR-08 widened it
to the structured calls, which is a regression for them.
**Fix:** Make the writer's chain visible to the forwarder rather than a second private one. Smallest change:
have the writer register its pending link with the forwarder, for example an `index.ts` wrapper
`trackLogSettle(link: Promise<unknown>)` that adds it to a forwarder-owned `Set` which `#settleChains`
awaits with the same deadline, and call it from `#extend`. Alternatively keep `body` going through
`logForwarder.logLine` (so `#chains` holds it) and make the writer hold later writes behind a
forwarder-exposed settle promise. Add a test that `flush()` with a pending `writer.logInfo(slow)` resolves
only after `slow` settles (or the timeout), and update the `flush` doc if the scope stays narrower.

### WR-10: A line behind a Promise message is timestamped when the chain reaches it, not when it was logged (D-12)

**File:** `src/backend/logger/targetWriter.ts:160-183`
**Issue:** D-12 says a TS line's timestamp is taken where it originates. `LogForwarder.logLine` stamps `ts`
and `tz` on entry. In `#logBase` the Promise branch now calls `logLine` inside the `.then` that runs after
the Promise settles, and the synchronous-but-queued branch (`#pending > 0`) calls it after the chain
drains. Both are stamped at that later moment. For the Promise-valued line itself this is new: before
1790bba62 the forwarder stamped it at call time, then held it. A message that takes 30 s to settle, and
every line the writer logs in that window, is written with a timestamp 30 s late and out of step with
lines from other writers and with the sidecar's own events. (The queued synchronous branch pre-dates
WR-08 but is the same defect and shares its fix.)
**Fix:** Take the clock at the call, and enqueue a finished entry after the wait instead of calling
`logLine` late. In `#logBase`, before any chaining:
```ts
const ts = Date.now()
const tz = -new Date(ts).getTimezoneOffset()
```
then, where the body is known (immediately for a string, after settle for a Promise), send
`enqueueLogEntry(this.#target, rotate, { line: { ts, tz, level, prefix, msg } })` and apply the
empty-body rule there (`if (msg.length === 0) { if (rotate) oweLogRotation(this.#target); return }`).
Alternatively add optional `ts`/`tz` arguments to `LogForwarder.logLine` and `index.logLine`. Add a test
using fake timers: log a Promise message, advance 30 s, resolve it, and assert the entry's `ts` equals the
call-time clock.

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
