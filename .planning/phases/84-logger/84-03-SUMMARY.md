---
phase: 84-logger
plan: 03
subsystem: infra
tags: [rust, typescript, sidecar, logging, forwarder, stdout-frame, backpressure, calibration, tracer]

requires:
  - phase: 84-logger
    provides: "gamelib-log crate, the TS golden and the shared logFrameVectors.json (84-01, 84-02)"
provides:
  - "shell: init_native_logger after the single-instance guard, the kind:log reader arm (route_log_frame, handle_log_frame)"
  - "sidecar: LogForwarder (bounded drop-oldest queue, 50 ms / 32 KiB frames, backpressure, unref'd tick) and stringifyLogValue; the TS general writer is gone"
  - "sidecarRpc.logTransport and the shared frame types and LOG_FRAME_KIND in sidecarTransport.ts"
  - "measured batch and cap calibration replacing research assumption A2"
affects: [84-04, 84-05, 84-07, 84-08, 84-09]

actuals:
  tokens: 27000
  tasks: 3
  commits: 3
plan_head_before: df963579be7a154237ac18e539272caa69f77d79
plan_head_after: 654a8e5371c05c362ce341722d5ce0319f74f4f0

tech-stack:
  added: ["gamelib-log as a path dependency of the shell (no registry crate)"]
  patterns:
    - "TS call -> forwarder queue -> kind:log stdout frame -> shell reader (parse, validate, try_send) -> writer thread -> file"
    - "one process-wide forwarder instance in logger/index.ts; forwarder.ts and stringifyLogValue.ts hold no module state"
    - "transport.send returns false = accepted but pause (or held until an output attaches); it throws only when the frame was not taken"
    - "onReady coalesces into the tick instead of one tiny frame per drain"

key-files:
  created:
    - src/backend/logger/forwarder.ts
    - src/backend/logger/stringifyLogValue.ts
    - src/backend/logger/__tests__/forwarder.test.ts
    - src/backend/logger/__tests__/forwarderGolden.test.ts
    - src/backend/logger/__tests__/forwarderCalibration.test.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/src/main.rs
    - src-tauri/src/sidecar.rs
    - src/common/types/sidecarTransport.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/stdinEofRelease.ts
    - src/backend/logger/index.ts
    - src/backend/logger/paths.ts
    - src/backend/sidecar/__tests__/sidecarStdoutFramesOnly.test.ts
    - src/backend/sidecar/__tests__/bootstrapWirings.test.ts
    - src/backend/sidecar/__tests__/loggerFlows.test.ts
    - src/backend/sidecar/__tests__/stdinEofRelease.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - meta/backendDiCeilings/sidecar-tests-flows-4.json
    - meta/backendDiCeilings/sidecar-tests-boot.json
  deleted:
    - src/backend/sidecar/__tests__/loggerCallSiteGuard.test.ts

key-decisions:
  - "A clipped entry keeps its marker INSIDE the shell's 1,048,576-unit cap (cut at cap minus 64, surrogate-safe), because the shell rejects a whole frame over the cap"
  - "An unattached sidecarRpc.logTransport holds the frame (not drops it) and returns false; onReady fires when start() attaches the output"
  - "onReady coalesces into the 50 ms tick (immediate only when a settle is waiting): measured 400 -> 227 frames/s under the chatter profile"
  - "The calibrated constants stay at the first-guess values: 50 ms tick, 32 KiB frame, 4,000 entries, 8 MiB"
  - "Shell log-frame tests live in sidecar.rs's existing tests module (tauriShellSource enumerates co-located test mods by name)"

patterns-established:
  - "Golden replay on both sides of a seam: forwarderGolden.test.ts (TS frames == entries.json) and sidecar::tests::log_frame_golden (the same frames through route_log_frame == expected gamelib.log)"
  - "A suite that formerly read a TS-written log file asserts on a captured frame or on the sidecar's own output frames"

requirements-completed: [FND-05]

coverage:
  - id: D1
    description: "Tracer: a sidecar logInfo becomes a kind:log frame that the shell's reader arm hands to the native writer, byte-equal to the TS golden"
    requirement: FND-05
    verification:
      - kind: integration
        ref: "src/backend/logger/__tests__/forwarderGolden.test.ts (35 general-target cases == entries.json) and cargo test --bin gamelib-shell log_frame (golden replay through route_log_frame == expected/<id>/gamelib.log)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The writer is initialised only after the single-instance decision and before the reaper (a second launch cannot rotate gamelib.log)"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell fn_main (fn_main_starts_the_native_logger_after_the_single_instance_guard_and_before_the_reaper)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Forwarder never blocks or throws; bounded queue drops the oldest and reports the count; early boot lines kept; backpressure, throw-retry, batching, rotate batches, clip, call-time ts/tz, settle contract"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src/backend/logger/__tests__/forwarder.test.ts (21 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Calibration with a synthetic Wine-like emitter: zero drops on the burst and chatter profiles, bounded memory when the consumer stalls, replayed bytes equal input"
    requirement: FND-05
    verification:
      - kind: integration
        ref: "src/backend/logger/__tests__/forwarderCalibration.test.ts (3 profiles)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Both sides honour the shared frame vectors"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell log_frame_vectors (every valid vector routes, every invalid vector returns its reason)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Sidecar exit contract holds with the forwarder in the sidecar (unref'd tick, EOF flush adds no referenced handle)"
    requirement: FND-05
    verification:
      - kind: other
        ref: "pnpm smoke:sidecar PASS; pnpm smoke:exit-check -- --mode eof PASS (8 ms)"
        status: pass
    human_judgment: true
    rationale: "The live-mode exit check needs a running app across Cmd+Q and was INVALID here (no sidecar process found); a real Wine launch checking for `lines dropped` is 84-HUMAN-UAT item 4."

duration: 25 min
completed: 2026-11-21
status: complete
---

# Phase 84 Plan 03: Forwarder, log frame arm and shell init Summary

**A sidecar `logInfo` now reaches `gamelib.log` through the native writer, golden-identical, over a `kind:"log"` stdout frame and a bounded, backpressure-aware TS forwarder whose batch and cap numbers were measured, not assumed.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-11-21T04:46:54Z
- **Tasks:** 3 (one tracer, one TDD, one auto)
- **Files:** 46 changed over the span base..HEAD, of which this plan's are the 28 listed above (the span also holds four commits of a parallel quick task, see below)

## Accomplishments

- **Tracer (Task 1):** `init_native_logger` runs in `fn main` after both single-instance blocks and before the reaper (source-order test pins it); the reader's log arm parses, validates and `try_send`s (a rejected frame logs `log frame rejected: <category>` only); `LogForwarder` + `stringifyLogValue` replace the TS general writer, with `logForwarder` as `index.ts`'s one new module-state site (still the sanctioned 2); `sidecarRpc.logTransport` carries the frames and bootstrap binds it. The tracer gate (automated-only verify, end-of-phase mode) was re-run end to end before expansion.
- **Forwarder rules (Task 2):** drop-oldest at 4,000 entries / 8 MiB with a `log forwarder: N lines dropped (queue full)` WARNING, early-boot lines kept, unref'd tick, false-write pause until ready, throw retry, 32 KiB frames, rotate batches, call-time `ts`/`tz`, Promise ordering, and a settle that never rejects or hangs. 21 forwarder tests, 35 golden cases, 3 calibration profiles; the shell routes every shared valid vector and rejects every invalid one with its exact category.
- **Suites moved (Task 3):** the suites that read a TS-written `gamelib.log` now assert on captured frames; `loggerCallSiteGuard.test.ts` is retired with reasons; the EOF flush has its own ordering test.

## Calibration (replaces research assumption A2)

Measured by `forwarderCalibration.test.ts` with the defaults (tick 50 ms, frame 32 KiB, caps 4,000 entries / 8 MiB), 5 simulated seconds, every chunk sent to a game AND a runner target (as `commandRunner.ts` does), through a modelled pipe (16 KiB high-water mark, reader at 32 MiB/s). The pipe is a model of a Node stream, not a real `PassThrough`; the real transport is exercised end to end in `sidecarStdoutFramesOnly.test.ts` and the boot test.

| profile | input (both targets) | frames/s avg (max) | max queued | dropped |
|---|---|---|---|---|
| burst | 2 x 64 KiB chunks at 8 MiB/s (16 MiB/s in) | 256 (257) | 1 entry, 0.06 MiB | 0 |
| chatter | 2 x 20,000 x 100 B per second (3.81 MiB/s) | 227 (228) | 179 entries, 0.03 MiB | 0 |
| stalled (2 s) | burst, reader stops for 2 s | 179 (382) | 127 entries, 7.95 MiB | 386, all reported once the consumer resumed |

No draining profile dropped a line or came near a cap, so the constants stay at 50 ms / 32 KiB / 4,000 / 8 MiB. The 8 MiB byte cap binds first under a stalled reader (127 x 64 KiB chunks). Chatter first measured 400 frames/s because `onReady` pumped a tiny frame on every drain; coalescing `onReady` into the tick brought it to 227, inside the plan's bound (1000/50 + size-cut frames). Replaying each profile's frames through the per-chunk newline rule reproduces the input bytes (sha256 equal per target). The live check (84-HUMAN-UAT item 4, a real Wine launch searched for `lines dropped`) is still owed.

## loggerCallSiteGuard retirement

`src/backend/sidecar/__tests__/loggerCallSiteGuard.test.ts` guarded CR-01: a rejecting general-writer promise escaping the renderer log listener.

- Tests A and B drove a real ENOTDIR write failure through a mocked `logger/paths` and an unassigned writer. The general log is now the forwarder: `logErrorSettled` resolves on write, on the 2 s timeout or at once when unbound, and never rejects, so neither failure can occur.
- Test D's predicate (`hasExpressionBodyErrorWrapper`) was keyed on the removed general writer binding.
- Contract C (`logErrorSettled` returns a promise that resolves) moved into `forwarder.test.ts` ("settle" block: promise-returning siblings, resolves unbound, after `onWritten`, within `LOG_FLUSH_TIMEOUT_MS`, never rejects with a throwing transport).
- Gate trips handled in the same commit: its entry is gone from `STRUCTURALLY_CONTAINED_SUITES` and from `sidecar-tests-flows-4.json`; `sidecarStdoutFramesOnly` is lowered from 2 to 1 mocks in `sidecar-tests-boot.json`.

## Discovery-net suites

`grep -rlE "getLogFilePath|gamelib\.log|initHeadless|logErrorSettled|logInfoSettled" src/backend src/preload meta --include='*.test.ts'` named 50 suites. Run before the rewrites, 3 failed (bootstrapWirings, loggerFlows, loggerCallSiteGuard) and 48 passed unchanged (humble, gog, steam, sideload store-manager suites, tauriConf, tauriTransport, logWriter, loggerWriters, logGolden, logSecretGate, bridgeCensus, captureShellScrollback, dxvkEvidenceLines, and the other sidecar flow suites). `sidecarStdoutFramesOnly` was rebound by the plan although it still passed. The net missed one suite, `stdinEofRelease.test.ts`, because it names none of those strings but mocks the whole `../../logger` module; the full `src/backend/sidecar` and `src/backend/logger` run found it (see deviation 4). After the fixes: `src/backend/sidecar` + `src/backend/logger` 128 suites / 3,555 tests pass; the 70 suites that read `src-tauri` or `Cargo.*` (1,732 tests) pass.

## Task Commits

1. **Task 1: tracer** - `4b22f2869` (feat)
2. **Task 2: forwarder rules and calibration** - `15a6eb201` (feat)
3. **Task 3: suites moved, guard retired, gates** - `654a8e537` (test)

**Plan metadata:** the docs commit that carries this file.

The measured `rev-list --count df963579b..HEAD` is 7: three are this plan's, four are `quick-261121-o99` commits (`d8fc1bb25`, `099101f9e`, `81edc90b7`, `60f0b6762`) that a parallel session landed on `main` while this plan ran. `commits: 3` and `plan_head_after` name this plan's own last code commit.

## Decisions Made

See `key-decisions`. Two worth restating: the forwarder's frame contract is "false means accepted, pause" with the transport holding a frame that arrives before stdout is attached, and the shell's per-entry cap includes the clip marker.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A clip marker past the cap would get the whole frame rejected**
- **Found during:** Task 2 (writing the clip test against the shell's `entry_of`)
- **Issue:** the plan says an entry of cap+1 units is truncated "to the cap plus `…[truncated 1 bytes]`". The shell rejects any message over 1,048,576 UTF-16 units with `too-large` and drops the entire frame, so cap + marker would lose that entry and every other entry in its frame.
- **Fix:** the forwarder keeps `cap - 64` units (backing off one if the cut would split a surrogate pair) plus the marker, so the entry is at most `cap`; `N` counts the units cut. A test pins `LOG_ENTRY_MAX_UTF16 === logFrameVectors.maxEntryUtf16` and the surrogate-safe cut.
- **Files modified:** `src/backend/logger/forwarder.ts`, `forwarder.test.ts`
- **Commit:** `15a6eb201` (design in `4b22f2869`)

**2. [Rule 1 - Bug] `send` returning false before an output exists would lose or duplicate a frame**
- **Found during:** Task 1 (wiring `logTransport`)
- **Issue:** the plan has `send` return false while no output is attached, and the forwarder also treats false as "accepted but backed up". Taking that literally either drops the frame (removed from the queue, never written) or, if retried, duplicates it.
- **Fix:** an unattached transport holds the frame in the existing pre-attach buffer (now `{line, onWritten}` items, flushed in order by `attachOutput`, which then fires the `onReady` listeners) and returns false; the forwarder treats false uniformly as "accepted, pause until ready". The boot test shows the boot's own lines leave as log frames.
- **Files modified:** `src/backend/sidecar/sidecarRpc.ts`, `src/backend/logger/forwarder.ts`
- **Commit:** `4b22f2869`

**3. [Rule 3 - Blocking] Shell log-frame tests had to join the existing `mod tests`**
- **Found during:** Task 3 (`tauriShellSource.test.ts` failed after Task 2)
- **Issue:** the source gate enumerates co-located test modules by name; the separate `log_frame_tests` module I had added made it fail.
- **Fix:** moved the tests into `sidecar.rs`'s existing `mod tests` (names still contain `log_frame`).
- **Files modified:** `src-tauri/src/sidecar.rs`
- **Commit:** `654a8e537`

**4. [Rule 3 - Blocking] `stdinEofRelease.test.ts` mocks the logger module and lacked the flush**
- **Found during:** Task 3 (full `src/backend/sidecar` run; not named by the discovery grep)
- **Issue:** the suite's `jest.mock('../../logger')` has no `flushLogForwarder`, so every release test threw.
- **Fix:** added `flushLogForwarder` to the mock (jest.mock count unchanged at 1) and a test that the flush runs once, after the abort, the HTTP destroy and the last release log line.
- **Files modified:** `src/backend/sidecar/__tests__/stdinEofRelease.test.ts`
- **Commit:** `654a8e537`

### Design adjustments and process notes

- **`onReady` coalescing** is a change to Task 1's pump driven by the Task 2 calibration (see above); the forwarder tests were adjusted to advance the tick after `fireReady`.
- **The EOF flush (`void flushLogForwarder()` in `stdinEofRelease.ts`) landed in the Task 1 commit**, not Task 3, because Task 1's `index.ts` exports it and the key-link needs it; Task 3 added its ordering test.
- **Task 2 (`tdd="true`) had no committed RED.** The forwarder was written in the tracer, so the Task 2 tests went green on first run against it; I did not run a mutation check. They were written from the behavior list and assert the exact literals, but the strength of "fails when the rule is removed" is not demonstrated here.
- **`smoke:exit-check` was run with `--mode eof`** (the isolated arm: PASS, 8 ms). The default live mode reads the operator's real process table across a Cmd+Q and returned INVALID ("no sidecar process found before quit"); it is a live gate, not run here.
- **No `shell_diag` call in new code** (84-08 renames it): new shell lines use `shell_eprintln!` plus `gamelib_log::log(Prefix::Shell, ...)`.

**Total deviations:** 4 auto-fixed (2 bugs, 2 blocking). **Impact:** none on scope; both bugs were latent in the plan's wording and would have lost log lines in production.

## Known limitation (recorded, not fixed)

A single entry of up to 1,048,576 UTF-16 units made of characters that JSON escapes to six bytes (control characters) can exceed the shell's 4 MiB frame cap, and the shell then rejects that whole frame. The forwarder cuts frames by an estimated UTF-16 size, not by serialised bytes. Real chunks are far smaller (a Wine pipe read is tens of KiB), so this is an adversarial or binary-garbage case only. A fix would measure serialised bytes per entry in `#buildFrame`; not done to keep this plan to its scope.

## Gates at the last commit

`cargo test --bin gamelib-shell` 544 passed (5 `log_frame`, 2 `fn_main`); `rustfmt --check src/sidecar.rs` clean; the darwin clippy ratchet PASS with no ceiling change (`main.rs` and `sidecar.rs` added no warnings); `pnpm codecheck` clean; `pnpm lint` production PASS / tests PASS; `pnpm find-deadcode` PASS (312 baselined); `pnpm backend-di-ceilings` PASS; `pnpm build:sidecar` then `pnpm smoke:sidecar` PASS and `smoke:exit-check --mode eof` PASS; prettier `--file-info` showed every written non-Rust, non-lockfile path as not ignored and `--check` passed over them (`Cargo.toml` and `Cargo.lock` have no parser; `main.rs` and `sidecar.rs` are hand-matched to rustfmt, and `main.rs` is not fmt-clean as a whole before this plan either). No user-facing string changed, so the hardcoded-string and i18n gates were not run.

## Issues Encountered

- The working tree held unrelated uncommitted work throughout (Steam bridge, SteamEngineLaunchNotice, planning debris, a stray `.dxvk-cache`); none of it was staged. `phase70PassthroughCensus.test.ts` failed once inside the first very large parallel jest run and passed on every re-run, alone and inside the full `src/backend/sidecar` run; I treat it as load flakiness, not caused by this plan.
- The old `bootstrap.ts` comments still mention `heroicLogWriter` (historical prose); only `logger/index.ts` was required to be free of it.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-84-08 (parse_frame with `deny_unknown_fields`, closed sets, caps; category-only rejection log; the arm writes no file), T-84-09 / T-84-12 (bounded queue, try_send, unref'd tick, flush timeout, calibration), T-84-10 (primary-instance-only init pinned by a source-order test) each have a named test. T-84-SC: only the in-repo `gamelib-log` path dependency was added.

## Next Phase Readiness

- 84-04 can add the runner and game targets: `LogForwarder.enqueue(target, rotate, entry)` already takes typed targets and raw entries; index.ts's enqueue helpers are deferred to it (a helper with no importer is a knip finding).
- 84-09 owns the shell's exit flush (`gamelib_log::flush` in `handle_exit`'s finish); until then a shell-side exit does not wait for the writer thread.
- Owed live: 84-HUMAN-UAT item 4 (a real Wine launch, search for `lines dropped`) and the live-mode `smoke:exit-check`.

## Self-Check: PASSED

- Files exist: all created files FOUND (`forwarder.ts`, `stringifyLogValue.ts`, the three logger tests); `loggerCallSiteGuard.test.ts` ABSENT as intended.
- Commits are ancestors of HEAD: `4b22f2869`, `15a6eb201`, `654a8e537`.
- Acceptance: `fn init_native_logger` 1; `LOG_FRAME_KIND` in `sidecar.rs` 6; `bindLogTransport(` in `bootstrap.ts` 1; non-comment `unref` in `forwarder.ts` 3; `heroicLogWriter` in `index.ts` 0; top-level `let`/`var` in `forwarder.ts` 0; `flushLogForwarder(` in `stdinEofRelease.ts` 1; `"log"`/`LOG_FRAME_KIND` in `sidecarStdoutFramesOnly.test.ts` 5; `loggerCallSiteGuard` in `testContainment.test.ts` and `sidecar-tests-flows-4.json` 0; `readFileSync(logFilePath` in `bootstrapWirings.test.ts` 0; `lines dropped (queue full)` in `forwarder.ts` 1; `forwarderCalibration` in `forwarder.ts` 1; `logFrameVectors.json` in `sidecar.rs` 4; `forwarder.test.ts` 21 tests.
