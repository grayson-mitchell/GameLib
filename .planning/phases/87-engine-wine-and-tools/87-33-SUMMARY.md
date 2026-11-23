---
phase: 87-engine-wine-and-tools
plan: 33
subsystem: wine
tags: [rust, winetricks, apply-queue, shutdown, run-wine-command-for-game, call-tool, guards, d-06, d-08, d-17, d-25, golden-replay]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the winetricks parsers, apply guard, environment reports, streamed install and catalog reads (87-32); the wine command core and run_wine_command (87-10 to 87-24); ToolsState (87-30)
provides:
  - gamelib_wine::winetricks::queue, the sequential apply queue (one run per boot, state pushes, cancel remaining, failure handling, quit contract) over the install of 87-32
  - gamelib_wine::wine_cmd::command::run_wine_command_for_game with assert_command_parts, ForGameArgs and ForGameError
  - gamelib_wine::tools::call_tool::call_tool (winecfg, runExe)
  - ops wine_winetricks_apply, wine_winetricks_queue_state, wine_winetricks_cancel_remaining, wine_run_command_for_game and wine_tool_call (crate-only, no channel, no caller)
  - WineCtx and ToolsState as cloneable handles on shared state, and WineCtx::winetricks_queue
  - tests/run_for_game_guard.rs (25 behavioural tests) and the 17 queue goldens replayed in tests/golden_winetricks.rs
affects: [87-35, 87-36, 87-37]

actuals:
  tokens: 24600
  tasks: 2
  commits: 2

plan_head_before: c98499287b9441aca90287db1a278fff22fcbd06
plan_head_after: def930699089c777ea858b8e6a87d1d729e8fbb2

tech-stack:
  added: []
  patterns:
    - "a detached run owns a cloned context: WineCtx and ToolsState are handles whose every field is shared, so an op can answer at once while its run goes on"
    - "the run's first verb is started inside apply, so the answer is never older than a push already sent; the rest runs in a tokio task holding a shutdown Registrant and racing the shutdown token"
    - "a drop guard ends the run however the task ends (finished, quit, panic), the equivalent of the TS finally"
    - "the environment listener holds the queue weakly, so the queue and the reports it reads do not keep each other alive"

key-files:
  created:
    - src-tauri/crates/gamelib-wine/src/winetricks/queue.rs
    - src-tauri/crates/gamelib-wine/src/tools/call_tool.rs
    - src-tauri/crates/gamelib-wine/tests/run_for_game_guard.rs
  modified:
    - src-tauri/crates/gamelib-wine/src/lib.rs
    - src-tauri/crates/gamelib-wine/src/ctx.rs
    - src-tauri/crates/gamelib-wine/src/tools/state.rs
    - src-tauri/crates/gamelib-wine/src/tools/mod.rs
    - src-tauri/crates/gamelib-wine/src/winetricks/mod.rs
    - src-tauri/crates/gamelib-wine/src/wine_cmd/command.rs
    - src-tauri/crates/gamelib-wine/tests/golden_winetricks.rs

key-decisions:
  - "The queue state lives in WineCtx (82 row winetricks-queue, owner gamelib-wine); WineCtx and ToolsState became cloneable handles (Arc inside) so the detached run owns a context while the op answers"
  - "The caller resolves the game's tool settings once at apply (OwnedTarget) and every verb of the run uses them; the TS resolved per verb from a store this crate may not reach"
  - "A quit marks the verb in flight and the pending ones cancelled, ends the run with the done push and done game status, frees the component slot and releases the wine-winetricks registrant; the cut-off verb's Helper child is gamelib-proc's to reap"
  - "The queue holds the emitter it was built with rather than the engine context, so a test that swaps the engine's shutdown through Arc::get_mut after WineCtx::new keeps working"
  - "The game status goes out as the gameStatusUpdate push; the TS also fed an in-process event bus, which stays the TS glue's until 87-35"
  - "run_wine_command_for_game takes the Steam eligibility, native flag, folder, install path and resolved settings as facts from the caller (the library and the bridge are not reachable from this crate); the guards are the TS's, in the TS order, behind the command-shape guard"
  - "assert_command_parts adds the plan's bounds (256 entries, 4096 characters each) to the TS shape check, counting characters not bytes; the TS had no bound"
  - "run_wine_command_for_game also carries the TS handler's Windows branch (the program itself, an argv array, never a shell) so the op replaces the handler whole"

patterns-established:
  - "a refusal is the TS's empty result plus one log line naming runner and app (never a path or the command); a shape error is a fixed op error and logs nothing"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "The apply queue runs sequentially in Rust with the TS's order, cancel and failure behaviour: all 17 queue goldens (apply with a fresh and a cached catalog, de-duplication, the busy refusals including the same-tick one, the six invalid payloads, cancel mid-queue, a failing verb, a spawn error, an environment warning during a run) match on result, events with revisions, logs, launcher calls, spawns, requests and the tree"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_winetricks (every_queue_case_replays, three_verbs_apply_through_the_queue)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A quit cancels the running verb and drops the rest: the run ends with the done push and done game status, the component slot is freed, no later verb spawns, and the wine-winetricks registrant is released within the drain"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-wine --features testing --test golden_winetricks a_quit_cancels_the_running_verb_and_drops_the_rest"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Steam per-game-bottle guard (Pitfall 5), the native guard, the no-install-path guard, the pending-install (sideload only) guard and the commandParts shape and size guard are Rust behavioural tests, each proven in both directions, and a refused command starts no child"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-wine --features testing --test run_for_game_guard (25 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "callTool's winecfg and runExe spawn the TS's argv and working directory with wait false, through the same guards"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "run_for_game_guard.rs winecfg_spawns_wine_with_winecfg_and_does_not_wait, run_exe_spawns_the_exe_in_its_own_directory, run_exe_without_an_exe_runs_nothing, a_tool_goes_through_the_same_guards"
        status: pass
    human_judgment: false
  - id: D5
    description: "The five ops exist crate-only with no channel and no caller (D-06); the queue channels and the Winetricks resolvers flip in 87-35 and the wine-command resolvers in 87-36"
    requirement: SVC-02
    verification: []
    human_judgment: true
    rationale: "Absence of a caller is a property of the whole repository at the phase close; 87-35, 87-36 and the phase verifier check it, no test here can assert the lack of a future wire"

duration: 17min
completed: 2026-11-23
---

# Phase 87 Plan 33: The apply queue and the wine-command-for-game ops Summary

**The Winetricks apply queue (sequential verbs, state pushes with a rising revision, cancel remaining, a quit that cuts the running verb and ends the run) and `run_wine_command_for_game` / `call_tool` behind the Steam, native and command-shape guards now run in `gamelib-wine`, with all 17 queue goldens replaying and the TS incident tests ported as 25 behavioural tests.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-11-23T10:16:18Z
- **Completed:** 2026-11-23T10:34Z
- **Tasks:** 2 of 2
- **Files:** 3 created, 7 modified

## Accomplishments

- **Tracer (Task 1):** three verbs applied through the Rust queue end to end: the apply guard, the catalog read, the sequential spawns of 87-32's install, every state push, the `winetricks` then `done` game status, the reply holding the first verb already `installing` at revision 3. The same pass replays every queue golden.
- **The queue (`winetricks/queue.rs`):** one run per boot with a run counter, a single-flight latch set before the catalog read awaits (two applies in the same tick: one accepted, one busy), a boot-wide snapshot revision, the environment listener that pushes a report change even with no run, cancel remaining (the running verb finishes), and failure handling that never stops the rest. The run holds a `wine-winetricks` registrant and races the shutdown token; a drop guard ends the run on a quit or a panic.
- **Guards in front of a wine command (`run_wine_command_for_game`):** the command-shape guard first (non-empty array of strings, at most 256 entries of 4096 characters), then Pitfall 5, native, no install path, no usable wine, and the sideload-only pending install; a refusal is the empty result and one log line.
- **`call_tool`:** `winecfg` and `runExe` as wine commands with `wait` false and the exe's directory as the start folder (`path.parse(exe).dir`); the GOG offline-installer check, `pushGameToLibrary` and the final `gameStatusUpdate done` stay in the TS glue.
- **Ops:** `wine_winetricks_apply` (guard first), `wine_winetricks_queue_state`, `wine_winetricks_cancel_remaining`, `wine_run_command_for_game`, `wine_tool_call`, all crate-only.

## Task Commits

1. **Task 1 (tracer): winetricks apply queue tracer, three verbs applied through Rust with cancel, state pushes and quit contract** - `2e61bdb97` (feat)
2. **Task 2: run_wine_command_for_game and call_tool with the Steam, native and command-shape guards** - `def930699` (feat)

## Verification

- Task 1 chain: `cargo test -p gamelib-wine --features testing --test golden_winetricks` (8 tests, including `every_queue_case_replays` over all 17 queue goldens and the quit test) and `cargo test -p gamelib-wine winetricks::` pass; clippy `-D warnings` and `cargo fmt --check` are clean. The tracer gate was re-run (automated-only verify) before Task 2 started: still passing.
- Task 2 chain: `--test run_for_game_guard` (25 tests), the whole crate suite (169 unit tests plus every golden suite), clippy and fmt pass. Also `cargo check --bin gamelib-shell` and `cargo test -p gamelib-wine-cli` pass.
- Acceptance: `grep -c wine_winetricks_cancel_remaining lib.rs` is 3 and `grep -c wine_tool_call lib.rs` is 3 (both >= 1); the golden MANIFEST count is 76 (>= 10) and all 17 queue cases replay.
- Non-vacuity: disabling the Pitfall 5 condition failed four of the guard tests before it was restored.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A detached run needs an owned context**
- **Found during:** Task 1
- **Issue:** the ops take `&WineCtx`, but `apply` must answer at once while the run goes on, which needs a `'static` task.
- **Fix:** `WineCtx` and `ToolsState` are cloneable handles on shared state (every field an `Arc` or an `Arc` inside); the queue lives in `WineCtx::winetricks_queue`. `ToolsState` gained a shared `installing` slot handle for the queue's `busy` flag.
- **Files modified:** `src/ctx.rs`, `src/tools/state.rs` (the latter not in the plan's list)
- **Commit:** `2e61bdb97`

**2. [Rule 1 - Bug] The first design broke an existing test**
- **Found during:** Task 1
- **Issue:** the queue first held the `Arc<EngineCtx>`, which made `golden_wine_core`'s `Arc::get_mut(&mut ctx.engine)` fail ("the engine is not shared yet").
- **Fix:** the queue holds the emitter it was built with instead (the engine context's at `WineCtx::new`, which is when the shell has installed its own).
- **Files modified:** `src/winetricks/queue.rs`, `src/ctx.rs`
- **Commit:** `2e61bdb97`

**3. [Rule 2 - Missing critical] The command-shape guard gained the plan's bounds**
- **Found during:** Task 2
- **Issue:** the TS `assertCommandParts` checks only shape, but the plan (T-87-77, the research's input-validation row) requires at most 256 entries of 4096 characters.
- **Fix:** `assert_command_parts` enforces both, counting characters not bytes; the edge passes and one more is refused.
- **Files modified:** `src/wine_cmd/command.rs`
- **Commit:** `def930699`

**4. [Rule 2 - Missing critical] The TS handler's Windows branch moved in with the op**
- **Found during:** Task 2
- **Issue:** `runWineCommandForGame`'s handler spawned the command directly on Windows (no wine there), so an op that replaced only the wine path would have left a TS spawn behind in 87-36.
- **Fix:** on Windows `run_wine_command_for_game` spawns the program with its arguments as an argv array (never a shell), after the same shape guard; one test pins it.
- **Files modified:** `src/wine_cmd/command.rs`
- **Commit:** `def930699`

**Documented parity differences (pinned in the golden's comparison):**
- The game status is the `gameStatusUpdate` push; the oracle's sink recorded it as `queue:sendGameStatus`, and the TS also fed an in-process bus (the TS glue's until 87-35).
- Settings are resolved once at `apply`, not per verb.
- The oracle handled a chunk synchronously; the Rust run drains its channel when polled, so the harness's cancel and apply-again steps yield first.

---

**Total deviations:** 4 auto-fixed (1 blocking, 1 bug, 2 missing critical) plus 3 documented parity differences
**Impact on plan:** the context-handle change is the only edit outside the planned files and is additive; the bounds and the Windows branch are inside the planned guard and op.

## Issues Encountered

- The full suite run exceeded the foreground time limit once (the CLI tests spawn processes); it completed in the background and again in the foreground.
- `graphify update .` could not run (`graphify` is not on this machine's PATH); the knowledge graph is not refreshed by this plan.

## Known Stubs

None.

## Threat Flags

None. T-87-77 (elevation through verbs and commandParts) is mitigated as planned: the shape, Steam and native guards run before any spawn and an argv array is the only way to a child; T-87-78 (the queue at quit) is mitigated by the registrant and the shutdown race, with a test. The Windows branch is parity with the TS handler, not new surface.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 87-35 flips the queue channels (`winetricksApply`, `winetricksGetQueueState`, `winetricksCancelRemaining`) and the Winetricks resolvers: it supplies the `Target` (library lookup, bottle, the Steam resolver), the host facts, and a game-status hook if the in-process event bus must still hear `winetricks` and `done`. The apply op takes `[request, verbs, host?]`; the state and cancel ops take `{runner, appName}`.
- 87-36 flips `runWineCommandForGame` and `callTool`: the resolver reads the library and the Steam bridge (`isSteamWineToolsEligible`, `isNative`, folder, install path), resolves the settings with the bottle ensured, makes one `wine_run_command_for_game` or `wine_tool_call`, then does the GOG offline-installer check, `pushGameToLibrary` and the final `gameStatusUpdate done` in the TS order.
- 87-37 drops the source-text gate `runWineCommandOnGameGuard` with `tools/`.

## Self-Check: PASSED

- FOUND: `winetricks/queue.rs`, `tools/call_tool.rs`, `tests/run_for_game_guard.rs` (created); `tests/golden_winetricks.rs`, `lib.rs`, `ctx.rs`, `tools/state.rs`, `tools/mod.rs`, `winetricks/mod.rs`, `wine_cmd/command.rs` (modified)
- FOUND: `2e61bdb97`, `def930699` (ancestors of HEAD; `git rev-list --count` from the plan ledger is 2)

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-23*
