---
phase: 84-logger
plan: 04
subsystem: infra
tags: [rust, typescript, logging, facade, rate-limiter, golden, tracer, tdd]

requires:
  - phase: 84-logger
    provides: "gamelib-log crate and golden (84-01, 84-02), the TS forwarder, log frame arm and shell init (84-03)"
provides:
  - "src/backend/logger/targetWriter.ts: the per-target LogWriter facade (writeString, logDebug/Info/Warning/Error, close, target) over the forwarder; no TS code appends to a log file any more"
  - "logger/index.ts: enqueueLogEntry and logLine exports; getRunnerLogWriter and createGameLogWriter build typed targets; the gog redist writer is { kind: 'gogRedist' }"
  - "gamelib_log::limiter: RateLimiter (admit, expire, drain, take_evicted), Summary, LIMIT_WINDOW 60 s, LIMIT_BURST 5, LIMIT_MAX_KEYS 256, LIMIT_EXCERPT_CHARS 200"
  - "writer: the gamelib.log rate limiter wired into the writer loop (every message, a 5 s recv_timeout tick, flush)"
affects: [84-05, 84-07, 84-08, 84-09]

actuals:
  tokens: 17500
  tasks: 2
  commits: 4
plan_head_before: 2faf99a5e7eee5d0306de8c930d5e60ae7c18411
plan_head_after: 818bbce5a845afd7b8f720d9f8ca4af7bbeb4066

tech-stack:
  added: []
  patterns:
    - "TS facade keeps the old call-site API; rotate claimed synchronously per writer, the file bytes come from Rust"
    - "limiter owns no clock or file: the writer feeds it each entry's own timestamp and asks for closed windows"
    - "scripted-clock golden: script.json -> hand-written expected.gamelib.log, a barrier after every step"

key-files:
  created:
    - src/backend/logger/targetWriter.ts
    - src/backend/logger/__tests__/targetWriter.test.ts
    - src-tauri/crates/gamelib-log/src/limiter.rs
    - src-tauri/crates/gamelib-log/tests/limiter_golden.rs
    - src-tauri/crates/gamelib-log/tests/fixtures/limiter/script.json
    - src-tauri/crates/gamelib-log/tests/fixtures/limiter/expected.gamelib.log
  modified:
    - src/backend/logger/index.ts
    - src/backend/logger/__tests__/forwarderGolden.test.ts
    - src/backend/logger/__tests__/loggerWriters.test.ts
    - src/backend/storeManagers/gog/redist.ts
    - src-tauri/crates/gamelib-log/src/writer.rs
    - src-tauri/crates/gamelib-log/src/lib.rs
    - "19 import-specifier files (one line each): launcher.ts, commandRunner.ts, utils.ts, launchEngine.ts, storeManagers/{index,gog/games,legendary/games,legendary/setup,nile/games,sideload/games,storeManagerCommon/games}.ts, steam/{games,gameLaunch,launchDispatch,directLaunch/launchWithoutSteam}.ts, common/types.ts, common/types/game_manager.ts, __tests__/storeLaunchHooks.test.ts"

key-decisions:
  - "Task 1 is one typechecking commit: the old and new LogWriter are nominally distinct (ES #private fields), so the facade, index.ts's import swap, the construction sites and the specifier codemod landed together; codecheck is green at that commit"
  - "A writer queues later entries behind a pending Promise-valued message through its own tail chain (a pending counter), so a raw chunk and a structured line of one writer keep call order"
  - "Limiter key is a hash of (prefix, level, body); a window starts at the first occurrence's own timestamp and closes at start + 60 s; admit closes an elapsed window itself if expire was skipped"
  - "Limiter summaries are stamped by the Logger clock; an evicted key's summary is written right after the line that evicted it, the rest are drained oldest-window-first at flush"
  - "tick_for_tests is a plain pub method on Logger (an integration test cannot see cfg(test) items); it runs the writer's tick (expire at the clock's time) and waits"
  - "flush now closes every open window first, so a log that goes quiet still gets its summary at shutdown"

patterns-established:
  - "D-15 scope is structural: only Entry::Line on the general target reaches the limiter; raw chunks and every other target are untouched, pinned by tests that send 100 identical raw chunks and 100 identical game lines"

requirements-completed: [FND-05]

coverage:
  - id: D1
    description: "A game launch log is produced by the Rust writer from the TS facade, byte-equal to the golden, with the same rotate and close behaviour (every game, runner, gogRedist, close and rotate case in cases.json)"
    requirement: FND-05
    verification:
      - kind: integration
        ref: "src/backend/logger/__tests__/forwarderGolden.test.ts (non-general line, chunks, rotate and close cases == entries.json) and cargo test -p gamelib-log --test golden"
        status: pass
    human_judgment: false
  - id: D2
    description: "The facade keeps the old parity rules: disabled sends nothing, forceLog on a disabled writer sends and claims the rotation, first accepted entry carries rotate (same tick), second instance rotates again, close then every write rejects, general never rotates, invalid appName refused with one WARNING"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src/backend/logger/__tests__/targetWriter.test.ts (13 tests) and loggerWriters.test.ts (6 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No production TS file imports the old writer module; the tree typechecks at the Task 1 commit"
    requirement: FND-05
    verification:
      - kind: other
        ref: "grep -rln \"logger/log_writer'\" src meta -> 0 files; pnpm codecheck exit 0 at 4aa7f6cde"
        status: pass
    human_judgment: false
  - id: D4
    description: "A repeating gamelib.log line is written 5 times per 60 s window then summarised; bounds, eviction, quiet-log tick and flush summaries, counter bodies and excerpt are pinned"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "gamelib-log limiter::tests (10), writer::limiter_scope (7), tests/limiter_golden.rs against fixtures/limiter/expected.gamelib.log (5 scripted cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-15: nothing a user uploads is altered: 100 identical raw chunks to a game log and 100 identical game lines all land; raw chunks to the general target are not limited"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "writer::limiter_scope::a_hundred_identical_raw_chunks_to_a_game_log_all_land (asserts 100 lines)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Origin 80 A-IN-01: 10,000 identical WARNING lines over 10 minutes produce 5 lines plus one summary per window"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "limiter::tests::ten_thousand_identical_lines_over_ten_minutes_write_five_plus_one_summary_per_window and writer::limiter_scope::a_flood_of_identical_warnings_is_five_lines_plus_one_summary_per_window (50 written, 10 summaries of 995)"
        status: pass
    human_judgment: false

duration: 40 min
completed: 2026-11-21
status: complete
---

# Phase 84 Plan 04: Runner, per-game and gog-redist logs through the native writer; gamelib.log rate limiter Summary

**Every runner, per-game and gog-redist log is now written by Rust through a `LogWriter` facade that keeps the old call-site API (19 import lines moved mechanically), and a repeating `gamelib.log` line is limited to 5 per 60 s window plus one counted summary, proven by a scripted-clock golden.**

## Performance

- **Duration:** 40 min
- **Tasks:** 2 (one tracer, one TDD)
- **Files:** 30 changed over the span base..HEAD (1,790 insertions, 72 deletions); no parallel commits landed in the span

## Accomplishments

- **Tracer (Task 1):** `targetWriter.ts` is the per-target facade over the 84-03 forwarder: `writeString` sends a raw entry per chunk, the four level methods send a `line` entry (formatted by Rust from the call-time clock), `close()` sends the closing marker. `index.ts` builds typed `game` and `runner` targets and exports `enqueueLogEntry` and `logLine`; `redist.ts` uses `{ kind: 'gogRedist' }` and no longer knows the path (D-20). The type swap, the 19-file specifier codemod and the facade landed in one commit so the tree typechecks (`4aa7f6cde`). `forwarderGolden.test.ts` now replays every non-general case in `cases.json` (line, chunks, rotate, close) through the facade and compares the batches, rotate flags and entries to `entries.json`.
- **Limiter (Task 2):** `limiter.rs` keys lines by (prefix, level, body), counts per 60 s window from the first occurrence, writes the first 5, and returns a summary (`<first 200 chars> (repeated K more times)`) when a window closes. The writer applies it only to general-target `Line` entries, closes elapsed windows on every message, on a 5 s `recv_timeout` tick and at flush, and caps tracking at 256 keys with oldest-window eviction (summary written with the eviction). RED was a hand-written scripted-clock golden that failed on its assertion; GREEN made it pass; the script was then extended (two levels, a counter in the body, a 300-char excerpt, a quiet flush) with a hand-written expectation.
- **Measured:** 10,000 identical WARNING lines over 600 s -> 50 written and 10 summaries (each `repeated 995 more times`: 1,000 lines per window, 5 written), through both the limiter alone and the writer.

## Task Commits

1. **Task 1: tracer, facade + type swap + codemod** - `4aa7f6cde` (feat) - TASK1_SHA for the one-line-per-codemod-file check: `git diff --stat 4aa7f6cde^..4aa7f6cde` shows 1 changed line per codemod file except redist.ts (5), index.ts, and the new or rewritten tests
2. **Task 2 RED: failing limiter golden** - `8b8d79df0` (test)
3. **Task 2 GREEN: limiter and writer wiring** - `890cae651` (feat)
4. **Task 2: scope, tick, eviction and flood cases, extended golden** - `818bbce5a` (test)

**Plan metadata:** the docs commit that carries this file.

## Decisions Made

See `key-decisions`. The one worth restating: `flush` now drains the limiter, so shutdown (which flushes) always writes the last summary, and a test that wants a barrier without draining uses `tick_for_tests`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The codemod covered 19 files, not 20**
- **Found during:** Task 1 (re-measuring the specifier grep, as the plan asked)
- **Issue:** the plan counted 20 import lines (18 production, 2 tests); 84-03 had already moved `sidecarStdoutFramesOnly.test.ts` off the old writer, so the live count was 19 (18 production files including redist.ts, and one test), and that suite needed no edit.
- **Fix:** the sed ran over exactly the grep's list; the re-run grep returns 0 files. `sidecarStdoutFramesOnly.test.ts` is unchanged (it still passes).
- **Commit:** `4aa7f6cde`

**2. [Rule 3 - Blocking] `tick_for_tests` had to be a public method, and exists in the RED commit as a barrier stub**
- **Found during:** Task 2 RED
- **Issue:** the plan allows "a test-only `Logger::tick_for_tests()`"; an integration test under `tests/` cannot see `#[cfg(test)]` items, and a RED test that names a missing symbol is INVALID_RED (build failure, not an assertion failure).
- **Fix:** `pub fn tick_for_tests(&self, within) -> bool` is a plain public barrier method. In the RED commit it was the same barrier as flush (no limiter yet), so the golden compiled and failed on its assertion (7 warnings written, no summary); in GREEN it became `Msg::Tick` (expire at the clock's time, then ack).
- **Commits:** `8b8d79df0`, `890cae651`

**3. [Rule 3 - Note] The limiter unit tests were committed with the implementation, not as a separate RED**
- **Issue:** the plan's "then add the remaining behavior cases as unit tests (RED), and make them pass (GREEN)" implies a second RED. The limiter's unit tests live in `limiter.rs` next to the code and were written with it, so they were never observed red on their own; the scripted golden (the criterion-3 evidence) was.
- **Mitigation:** the later `test(84-04)` commit adds writer-level cases (scope, tick, flush, flood, eviction) that exercise the writer wiring, not only `limiter.rs`.

### Known limitations (not fixed, recorded)

- A non-general writer whose very first call has an empty message claims the rotation but the forwarder drops the empty line, so no `rotate: true` batch is sent and Rust does not rotate that file until the next writer instance. The old writer rotated in that case. `84-03`'s forwarder owns the empty-line rule; the golden `NOTES.md` describes the empty-batch-with-rotate frame as the oracle's behaviour, but no golden case exercises it for a non-general target, and a game or runner log's first call is never empty in practice.
- Ordering between a raw chunk with a pending Promise and a later structured line of the same writer is held by the facade's tail chain; a Promise-valued message to `logLine` itself is still ordered by the forwarder's per-target chain. The two chains are not joined for a line whose message is a Promise issued while a raw Promise is also pending (not used anywhere).

**Total deviations:** 3 auto-handled (all Rule 3), 2 limitations recorded. **Impact:** none on the plan's goal.

## Authentication Gates

None.

## Gates run

- `pnpm codecheck`: exit 0 (at `4aa7f6cde` and at the last commit).
- `pnpm lint`: production PASS, tests PASS (0 errors).
- `pnpm backend-di-ceilings`: PASS (`jestMock=1863`, no new `jest.mock` in any new or rewritten suite; `meta/backendDiCeilings/logger.json` unchanged).
- `pnpm steam-line-ceiling`: PASS (202 files).
- Jest: the six named suites plus `logGolden`, `moduleStateCensus`, `loggerWriters`, `targetWriter`, `forwarderGolden` pass; `--findRelatedTests` over `logger/index.ts`, `targetWriter.ts`, `gog/redist.ts` ran 368 suites / 7,936 tests, all passing.
- Cargo: `cargo test -p gamelib-log` (54 unit, 2 golden, 1 limiter golden), `clippy -p gamelib-log --all-targets -- -D warnings`, `cargo fmt -p gamelib-log --check`, and `cargo test --bin gamelib-shell log_frame` (5) all pass.
- `npx prettier --check` over every prettier-visible path written (all `ignored: false`): clean. `expected.gamelib.log` has no prettier parser; Rust files are covered by `cargo fmt`.
- **`pnpm find-deadcode` FAILS on a pre-existing, unrelated finding:** `unresolved | src/backend/testUtils/__tests__/yieldUntil.test.ts | ../yieldUntil`. That file is an untracked test from another session (it appeared in the working tree during this plan and is not in the starting git status); `../yieldUntil` does not exist. It is not caused by this plan, and no finding names `enqueueLogEntry`, `logLine` or `log_writer.ts`. Left alone per the dirty-tree rule.
- `pnpm planning-gates`, hardcodedStringGate and genI18nGateScope were not run (no todo, no user-facing string).

## Known Stubs

None. (`tick_for_tests` is a real public barrier method, not a stub, after GREEN.)

## Threat Flags

None. T-84-11, T-84-13, T-84-18 and T-84-19 are mitigated as planned: redaction stays at the TS call sites (the facade sends raw chunks unchanged), the facade refuses an invalid appName before sending (one general WARNING per writer), the limiter bounds `gamelib.log` growth, and transcripts are never limited.

## Next Phase Readiness

Ready for 84-05 (shell router, ipc types, upload path; shares wave 4 and touches none of this plan's files) and then 84-07 (deletes `log_writer.ts` and the oracle). `log_writer.ts` is now imported only by its own test and the oracle suites.

## Self-Check: PASSED

- `src/backend/logger/targetWriter.ts`, `targetWriter.test.ts`, `limiter.rs`, `limiter_golden.rs`, `fixtures/limiter/script.json`, `fixtures/limiter/expected.gamelib.log`: all present.
- Commits `4aa7f6cde`, `8b8d79df0`, `890cae651`, `818bbce5a` are ancestors of HEAD; `git log` shows the `test(84-04)` commit before the `feat(84-04)` commit for `limiter_golden.rs`.
- Acceptance greps: `export default class LogWriter` 1, `End of log` 1, facade file-write calls 0, module-level `let|var` 0, `from './log_writer'` in index.ts 0, old-specifier files 0, `kind: 'gogRedist'` in redist.ts 1, `gog-redist.log` in redist.ts code 0; `repeated` in expected.gamelib.log 5; `pub struct RateLimiter` 1; 100-line raw-chunk test passes.
