---
phase: 87-engine-wine-and-tools
plan: 32
subsystem: wine
tags: [rust, winetricks, spec-runner, streamed-output, apply-guard, d-06, d-08, d-17, golden-replay]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the wine command core (wine_cmd env, valid and umu helpers, 87-10 to 87-24), the winetricks goldens and pure vectors recorded from the TS (87-10), ToolsState and the DXMT crate port (87-30, 87-31)
provides:
  - gamelib_wine::winetricks::{classify, env, guard, install, list_parse, metadata}, Winetricks' pure parsers and apply guard, the environment reports, the script download, one streamed run, the host and wine-version probes, the install with its single-flight slot and the catalog reads
  - SpecRunner::run_streamed (gamelib-core) with ChunkSink and Pipe, implemented by SpecProcRunner (gamelib-proc) over both pipes with a UTF-8 carry
  - ops wine_winetricks_install, wine_winetricks_available and wine_winetricks_installed (crate-only, no channel, no caller)
  - tests/winetricks_pure.rs (147 vectors plus 11 named incident tests) and tests/golden_winetricks.rs (all 59 non-queue 87-10 goldens)
affects: [87-33, 87-35, 87-37]

actuals:
  tokens: 46500
  tasks: 2
  commits: 2

plan_head_before: 466801bc4e66d1d769d1cc7ab55804590159c027
plan_head_after: b5ac62800475630444dba695d7da049454a023b4

tech-stack:
  added: []
  patterns:
    - "raw-chunk streaming through the one spawn seam: a default trait method that replays the captured output keeps every existing fake working, the app's runner overrides it"
    - "a hand-written pattern per JS regex, each with its ECMAScript semantics spelled out (whitespace set, ASCII digits, UTF-16 lengths, `.` stops at a line terminator), pinned by the TS vectors"
    - "the run's flush timer is a tokio interval raced beside the child, and the golden drives it on a paused clock (a scripted tick step is a one second sleep)"
    - "the launcher's three functions as a seam (Launcher), with the production HostLauncher over wine_cmd and the oracle's stubs in the golden"

key-files:
  created:
    - src-tauri/crates/gamelib-wine/src/winetricks/mod.rs
    - src-tauri/crates/gamelib-wine/src/winetricks/classify.rs
    - src-tauri/crates/gamelib-wine/src/winetricks/env.rs
    - src-tauri/crates/gamelib-wine/src/winetricks/install.rs
    - src-tauri/crates/gamelib-wine/src/winetricks/list_parse.rs
    - src-tauri/crates/gamelib-wine/src/winetricks/guard.rs
    - src-tauri/crates/gamelib-wine/src/winetricks/metadata.rs
    - src-tauri/crates/gamelib-wine/tests/winetricks_pure.rs
    - src-tauri/crates/gamelib-wine/tests/golden_winetricks.rs
  modified:
    - src-tauri/crates/gamelib-core/src/process.rs
    - src-tauri/crates/gamelib-proc/src/spec.rs
    - src-tauri/crates/gamelib-proc/tests/spec_runner.rs
    - src-tauri/crates/gamelib-wine/src/lib.rs
    - src-tauri/crates/gamelib-wine/src/tools/state.rs
    - src-tauri/crates/gamelib-wine/Cargo.toml

key-decisions:
  - "The spawn seam gained run_streamed (both pipes, raw chunks) rather than winetricks reading stdout lines: the plan's per-line callback sees only stdout, but winetricks writes its progress and curl's bare-CR meter to stderr, so a line callback would have lost both"
  - "The caller resolves the game (library lookup, bottle, the Steam resolver) and hands over Target { runner, app_name, ToolSettings::Resolved | Unavailable(reason) }, so the crate reaches no game store and the 87-35 flip supplies the resolution"
  - "The probes (dependencies, and wine version for list-all) run beside the child as the TS fire-and-forget calls did but are joined, so every report is final when the call returns; a probe that finishes after Done only updates its report"
  - "A verb reaches argv only if it has the verb shape; the install op checks it before any spawn, and the queue's full guard (membership, visibility) is in guard.rs for 87-33"
  - "Log text: the program is named by its file name and an I/O failure by a category word (T-87-09 spirit); winetricks' own output lines are logged verbatim, the one place the engine log carries free text, and wine's debug-channel noise is not logged (the engine log has no debug level) but still reaches the renderer"

patterns-established:
  - "ToolsState owns the winetricks environment reports and the typed parsed script metadata"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "Every pure vector of winetricks_pure.json gives the same answer in Rust (list parse, verb shape, line classifier, chunk split, wine version and the unsupported rule, apply guard with its maximum and each rejection, visibility, metadata, needs-GUI and the pinned script excerpt digest)"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-wine --features testing --test winetricks_pure (27 tests, 147 vectors)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The 87-10 winetricks goldens replay: script download online and its offline skip, list-available and list-installed on a bottle and a prefix, the catalog cache, install with streamed progress, the missing-dependency and unsupported-wine notices, a failing verb, a signal, a spawn error dialog, umu and Proton, and the two probes"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_winetricks (59 non-queue cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "winetricks and which run through the SpecRunner as Helpers with raw-chunk streaming feeding the classifier, and a verb that fails the shape check never reaches a spawn"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-proc --test spec_runner run_streamed_sees_both_pipes_raw run_streamed_never_cuts_a_character_in_half"
        status: pass
      - kind: unit
        ref: "gamelib-wine lib tests the_winetricks_install_op_refuses_a_bad_argument_before_any_spawn"
        status: pass
    human_judgment: false
  - id: D4
    description: "The three ops exist crate-only with no channel and no caller (D-06); the queue lands in 87-33 and every caller flips in 87-35"
    requirement: SVC-02
    verification: []
    human_judgment: true
    rationale: "Absence of a caller is a property of the whole repository at the phase close; 87-35 and the phase verifier check it, no test here can assert the lack of a future wire"

duration: 28min
completed: 2026-11-23
---

# Phase 87 Plan 32: Winetricks in the crate Summary

**Winetricks' parsers, apply guard, environment reports, catalog reads and a streamed install now run in `gamelib-wine` with all 147 pure vectors and all 59 non-queue goldens replaying, over a new raw-chunk streaming method on the one spawn seam.**

## Performance

- **Duration:** 28 min (the start time was not recorded at the beginning of the run; taken from the close of 87-31)
- **Completed:** 2026-11-23T10:14Z
- **Tasks:** 2 of 2
- **Files:** 9 created, 6 modified

## Accomplishments

- **Tracer (Task 1):** one `winetricks -q vcrun2019` end to end. The script is present, the five `which` probes run, winetricks streams its stdout and stderr (an info line, curl's meter redrawn by bare CR, a one second tick flush, a wine noise line), every line is classified, `progressOfWinetricks` goes out per flush and ends in a single `['Done']` with `failed: false`, and the `installing-winetricks-component` events bracket it. The golden matches on result, launcher calls, logs, events, spawns, requests and the tree. The same pass replays every install and download case.
- **Seam extension:** `SpecRunner::run_streamed(spec, ChunkSink)` hands the raw text of both pipes to a callback. `SpecProcRunner` implements it by tapping both pumps, holding back a multi-byte character cut by a read boundary. The default implementation replays the captured output after the run, so every fake runner in the tree is unchanged.
- **Pure ports (Task 2):** `list_parse`, `guard` (with `WINETRICKS_APPLY_MAX_VERBS = 100`, the verb shape and the visibility rule) and `metadata` (`w_metadata` and the needs-GUI derivation, with field order kept so the pinned 567-verb excerpt hashes the same as the TS). Each JS regular expression is written out by hand with its semantics spelled explicitly.
- **Catalog reads:** `list_available` runs `list-all` with `LANG=C` and `LC_ALL=C`, annotates from the script on disk, filters to visible verbs and caches the list the guard validates against (an empty list is never cached); `catalog_for` serves the cache; `list_installed` reads the bottle's `winetricks.log` (the `pfx` subdirectory for a Proton umu does not run).
- **Ops:** `wine_winetricks_install`, `wine_winetricks_available` and `wine_winetricks_installed`, all crate-only.

## Task Commits

1. **Task 1 (tracer): winetricks tracer, one verb installed end to end with streamed, classified progress** - `d3dff4f96` (feat)
2. **Task 2: winetricks pure parsers, apply guard, metadata and the catalog reads** - `b5ac62800` (feat)

## Verification

- Task 1 chain: `cargo test -p gamelib-wine --features testing --test golden_winetricks` passes (the tracer gate re-run after the second task: still passes); `cargo clippy -p gamelib-wine --all-targets --features testing -- -D warnings` and `cargo fmt -p gamelib-wine --check` clean. Also `cargo test -p gamelib-core -p gamelib-proc -p gamelib-engine` (including two new `run_streamed` tests against real children) and `cargo check --bin gamelib-shell` pass.
- Task 2 chain: `--test winetricks_pure --test golden_winetricks` pass; `cargo test -p gamelib-wine winetricks::` passes (unit tests of classify, env, guard, list_parse, metadata and mod); the whole crate suite is green (163 unit tests plus the golden suites).
- Acceptance: `grep -c WINETRICKS_APPLY_MAX_VERBS guard.rs` is 8 (>= 1); winetricks_pure.rs passes every vector.
- Non-vacuity: a one-word change to a logged message failed the golden (`download-online-fresh: logs`) before it was reverted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The spawn seam could not stream stderr or raw chunks**
- **Found during:** Task 1
- **Issue:** the plan says winetricks runs "through the SpecRunner as Helpers with a per-line callback feeding the classifier". `SpecRunner::run`'s `on_line` sees stdout lines only, split on `\n`; winetricks writes its `Executing ...` lines and curl's bare-CR progress meter to stderr, so the classifier would have received neither.
- **Fix:** an additive `run_streamed` method with a `ChunkSink` and `Pipe` on the trait in gamelib-core, a default that replays captured output, and the real implementation in `SpecProcRunner` (both pipes, UTF-8 carry). Two tests run it against real children.
- **Files modified:** `gamelib-core/src/process.rs`, `gamelib-proc/src/spec.rs`, `gamelib-proc/tests/spec_runner.rs`
- **Commit:** `d3dff4f96`

**2. [Rule 3 - Blocking] The goldens need a streaming, ticking, recording runner and the launcher as a seam**
- **Found during:** Task 1
- **Issue:** `ScriptedSpecRunner` cannot stream chunks, tick or throw, and the oracle's recorded env carries the launcher stubs' variables (`ORACLE_SETUP_ENV`), so the crate's launcher functions had to be replaceable.
- **Fix:** a `Launcher` trait (production `HostLauncher` over `wine_cmd`) and an `OracleRunner` in `golden_winetricks.rs` (streams, sleeps on the paused clock for a tick, records spawns in the oracle's shape). `tokio`'s `test-util` feature is enabled for the crate's dev build only (no new crate).
- **Files modified:** `winetricks/mod.rs`, `tests/golden_winetricks.rs`, `Cargo.toml`
- **Commit:** `d3dff4f96`

**3. [Rule 1 - Documented differences from the TS, each pinned in the golden's comparison]**
- The `User-Agent` of the script request is the GameLib one; the oracle's axios client sent `HeroicGamesLauncher/0.0.0-test`. The golden hands the replay the recorded value and asserts the request carried the GameLib agent.
- Log lines name the program by file name and carry a category word for an I/O failure, not Node's error text; wine's debug-channel noise is not logged (no debug level on `EngineLog`).
- The TS's probes and the child were concurrent, so its spawn trace is in completion order; the Rust joins them and the golden compares the spawns as a set. The launcher stubs are asked only for the platform's own environment (the TS built both).
- The script is written through a `.part` file and a rename, so a script is never half written when next run.
- When the host has no `PATH`, the child's `PATH` is the wine directory alone (the TS produced `<dir>:undefined`).

---

**Total deviations:** 2 auto-fixed (both blocking) plus 1 group of documented parity differences
**Impact on plan:** the seam extension is the only change outside the planned files and is additive; every other file is in the plan's list (the plan's list omits `tools/state.rs` and `Cargo.toml`, touched for the typed script metadata and the paused-clock dev feature).

## Issues Encountered

- A first replay of the tick through `tokio::time::advance` flushed in one test shape and not in another (a spawned task versus the test body); `advance` does not wake timers deterministically there. A scripted tick is now a one second `sleep` on the paused clock, which the runtime auto-advances to the next timer, and the run's own interval branch is polled before the child's, so the flush always precedes the next chunk. Both shapes pass.
- The oracle's tracer never reports `PATH` or `LANG` as unset for the probe ops; the golden's comparison ignores those two names on both sides.

## Known Stubs

None.

## Threat Flags

None. T-87-31 (verbs to argv) is mitigated as planned: the install op refuses a verb without the verb shape before any spawn, every spawn is an argv array through the seam (never a shell), and the full guard with the 100-verb maximum, catalog membership and the hidden-verb recheck is ported and pinned for the queue. T-87-32 (the downloaded script) is accepted and unchanged, as recorded in the plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 87-33 can build the queue on `winetricks::{guard, env, install}`: the environment reports have their one change-listener slot (`ToolsState::winetricks_env.on_changed`), `catalog_for` and `assert_apply_payload` are ready, and `install` takes an `on_line` callback. The queue goldens (the 17 `queue-*` cases) are not replayed here: `golden_winetricks.rs` skips the `queue` op and its helpers (`OracleRunner`, `Events`, `Run`) are written to be reused.
- 87-35 supplies what the TS read from the game store: the `Target` (library lookup, bottle, the Steam resolver), the host facts and the shell's emitter and UI sinks.

## Self-Check: PASSED

- FOUND: winetricks/mod.rs, classify.rs, env.rs, install.rs, list_parse.rs, guard.rs, metadata.rs, tests/winetricks_pure.rs, tests/golden_winetricks.rs (created); core process.rs, proc spec.rs and spec_runner.rs, wine lib.rs, tools/state.rs, Cargo.toml (modified)
- FOUND: `d3dff4f96`, `b5ac62800` (ancestors of HEAD; `git rev-list --count` from the plan ledger is 2)

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-23*
