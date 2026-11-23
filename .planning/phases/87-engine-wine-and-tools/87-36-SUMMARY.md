---
phase: 87-engine-wine-and-tools
plan: 36
subsystem: wine
tags: [resolvers, d-23, d-15, d-06, d-08, wine-command, call-tool, rustinvoke, sidecar, launcher]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: run_wine_command_for_game and call_tool ops with the Steam, native and command-shape guards (87-33); the wine_run_command op (87-24); the first D-23 resolvers, the Winetricks resolvers and services/winetricksTarget.ts (87-34, 87-35)
provides:
  - wine_run_command_for_game and wine_tool_call rustInvoke arms (RUST_WINE_RUN_COMMAND_FOR_GAME, RUST_WINE_TOOL_CALL, both unbounded in the sidecar) with zod, generated contract and rust_dispatch arms
  - runWineCommandForGame, runWineCommand and callTool resolvers in engineWineResolvers.ts (deletedBy 98), registered by registerEngineWineResolvers, which also holds the releasesInfoReady listener
  - services/gameCommandFacts.ts, the one place TypeScript reads the library, game config and Steam bottle markers for a wine command on a game
  - the launcher's known-fix runInPrefix step through the shared resolver, so launcher.ts names no toolsFrom
  - wineToolsFlowRegistration.ts deleted; callTool's registration out of runnerMiscFlowRegistration.ts
affects: [87-37, 87-56, 98]

actuals:
  tokens: 56000
  tasks: 2
  commits: 2

plan_head_before: 1bf1cfe2bb811df2b3a246904bf68c60fcbf0f18
plan_head_after: 40023b902b7ffc108c193c6061f78c534191c29f

tech-stack:
  added: []
  patterns:
    - "a wine command on a game is a resolver whose one const is `facts`: TypeScript gathers what only the library holds (steam eligibility, native flag, folder, install path, the tool settings or the reason there are none) and Rust judges every guard and spawns as a Helper"
    - "the facts gatherer keeps only the ORDER of the TS: it never resolves the tool settings (which creates the game's bottle) for a command a guard will refuse; it answers `unavailable` and Rust refuses on its own guard first"
    - "the post-command glue of callTool (GOG offline-installer check, pushGameToLibrary, the done status) runs in the registration after the resolver returns, in the TS order, so the resolver stays one returned typed call"

key-files:
  created:
    - src/backend/services/gameCommandFacts.ts
    - src/backend/services/__tests__/gameCommandFacts.test.ts
    - src/backend/dialog/__tests__/showDialogBoxModalAutoPushFailure.test.ts
  modified:
    - src-tauri/src/wine_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/ipc/wineTools.ts
    - src/common/types/ipc/runnerMisc.ts
    - src/backend/sidecar/engineWineResolvers.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/sidecar/runnerMiscFlowRegistration.ts
    - src/backend/launcher.ts
    - src/backend/services/winetricksTarget.ts
  deleted:
    - src/backend/sidecar/wineToolsFlowRegistration.ts
    - src/backend/sidecar/__tests__/wineToolsFlows.test.ts

key-decisions:
  - "The facts gatherer is a new module (services/gameCommandFacts.ts), not logic in the resolver: a resolver may hold only const declarations and one returned call, and the order of the TS (guards first, then the bottle-creating settings resolution) needs branches"
  - "services/winetricksTarget.ts gained the throwing resolveToolTarget; resolveWinetricksTarget is now its never-throwing wrapper. A wine command lets a resolver failure reach the renderer as the TS handler did; a catalog read still swallows it"
  - "callTool on Windows reads the game like any platform (the `tool` option), so a Windows game is native and Rust refuses it, as the TS did; only the renderer's runWineCommandForGame has the Windows direct-spawn branch"
  - "The launcher builds the resolver's two-field deps inline (requestRustInvoke and gameCommandFacts over its own engineSource), so it needs no ipc registry; the resolver's deps are split so WineCommandResolverDeps is the launcher-sized slice"
  - "The dialog push-failure pin (showDialogBoxModalAuto never raises an unhandled rejection) was about dialog.ts, not the deleted registration, so it moved to dialog/__tests__ instead of being deleted with wineToolsFlows.test.ts"
  - "Census floors that counted the deleted file were lowered by one each, with the deletion recorded beside the floor (flow registrations 24 to 23, boot-source files 25 to 24, ipcDomainCensus files 21 to 20, owned list 68 to 67)"

patterns-established:
  - "a resolver shared with the launcher takes the narrowest deps slice (requestRustInvoke and one facts function), so a non-sidecar caller needs no registry"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "runWineCommandForGame (renderer and the launcher's known-fix runInPrefix step) gathers the game's facts, sends one typed call, and Rust judges the command shape, the Steam per-game-bottle guard, the native guard and the install-path guard before any spawn; the command travels exactly as sent, wait is false with runinprefix for the renderer and carries the caller's wait only for a pending install, and Rust's refusal reaches the caller"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/engineWineResolvers.test.ts (runWineCommandForGame, the renderer channel)"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell wine_dispatch (the_run_command_for_game_arm_takes_one_object_and_answers_not_ready_before_install); gamelib-wine run_for_game_guard (87-33, 25 tests, the Rust guards)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The facts gatherer reads the library entry in the TS order and never resolves the tool settings (which creates the game's bottle) for a Steam title without its own bottle, a native game, a game with no install path, or a pending install of a non-sideload; a pending sideload resolves from the game config; Windows reads no game for a renderer command"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/services/__tests__/gameCommandFacts.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "runWineCommand fills absent gameSettings keys from the global settings (payload keys win) and makes one typed RUST_WINE_RUN_COMMAND call; callTool makes one RUST_WINE_TOOL_CALL call, then the GOG offline-installer check, the library push and the done status run in the TS order, none of it after a Rust rejection; the releasesInfoReady listener is registered once and a rejected check is logged"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/engineWineResolvers.test.ts (runWineCommand, callTool and its renderer channel, the releasesInfoReady listener)"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell wine_dispatch (the_tool_call_arm_takes_one_object_and_answers_not_ready_before_install)"
        status: pass
    human_judgment: false
  - id: D4
    description: "wineToolsFlowRegistration.ts is deleted, no wine-tools channel is registered twice, and no live path calls the TS tools code (createTools has no non-test caller) or services/toolsFrom.ts, so 87-37 can delete both with tools/"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "registrationOncePerBoot, flowRegistrationCensus, ipcDomainCensus, runnerSliceRegistration, invokeReturnValueSweep, engineWineShimSchedule (nine resolver rows, deletedBy 98)"
        status: pass
    human_judgment: false
  - id: D5
    description: "From the Wine settings and game page: the Wine tool buttons (winecfg, Run EXE), Run installer on a sideload game, a launch's known-fix run-in-prefix step and the renderer's runWineCommand run in a real prefix on a Mac or Linux machine, and a Steam game without its own bottle is refused"
    verification: []
    human_judgment: true
    rationale: "No test starts the app, a sidecar, the renderer and a real wine together; the Rust guards and spawns are proven by the crate's tests, the arms and channels by unit tests, and the facts decision by the TS tests, but the wiring needs one run on a Mac or Linux machine (live-gate item 4)"

duration: 19min
completed: 2026-11-24
---

# Phase 87 Plan 36: The wine-command family flips to Rust Summary

**`runWineCommandForGame`, `runWineCommand` and `callTool` are D-23 resolvers over two new Rust arms (`wine_run_command_for_game`, `wine_tool_call`), the launcher's known-fix step goes through the same resolver, `releasesInfoReady` is heard by `registerEngineWineResolvers`, and `wineToolsFlowRegistration.ts` is gone, so no live path runs the TS tools code or `services/toolsFrom.ts`.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-11-24T00:06Z
- **Completed:** 2026-11-24T00:26Z
- **Tasks:** 2 of 2
- **Files:** 3 created, 13 production files modified, 2 deleted, plus 22 test and census files

## Accomplishments

- **Tracer (Task 1):** a wine command on a game end to end. The renderer's `runWineCommandForGame` and the launcher's known-fix `runInPrefix` step both call the `runWineCommandForGame` resolver, which gathers the game's facts through `services/gameCommandFacts.ts` and makes one typed call on `RUST_WINE_RUN_COMMAND_FOR_GAME`; the shell adds the wine host facts, and the crate runs the shape, Steam, native and install-path guards before it spawns as a Helper (and carries the Windows argv-array branch). The sidecar handle left `wineToolsFlowRegistration.ts` in the same commit and `launcher.ts` lost its last `toolsFrom` use. The tracer gate (automated-only verify) was re-run and passed before Task 2.
- **The facts gatherer:** the TS `runWineCommandOnGame` ran its guards before resolving the tool settings, and resolving them creates the game's bottle. A resolver may hold only consts and one call, so the order lives in `gatherGameCommandFacts`: a Steam title without its own bottle, a native game or a game with no install path answers `unavailable` without resolving (Rust refuses first, with the TS's log line); a pending install is sideload only and resolves from the game config; Windows reads no game for a renderer command.
- **The resolvers (Task 2):** `runWineCommand` spreads `config.getSettings()` under `gameSettings` and makes one `RUST_WINE_RUN_COMMAND` call; `callTool` makes one `RUST_WINE_TOOL_CALL` call and the registration then runs the GOG offline-installer check, `pushGameToLibrary` and the `done` status in the TS order, none of it after a Rust rejection. `registerEngineWineResolvers` also registers the `releasesInfoReady` listener.
- **The deletion:** `wineToolsFlowRegistration.ts` and its test are gone, `callTool` left `runnerMiscFlowRegistration.ts`, and the nine resolver rows (three each from 87-34, 87-35, 87-36) are scheduled for Phase 98.
- **Caller-free:** `createTools` (the TS tools) has no non-test caller and `services/toolsFrom.ts` has no importer at all now, so 87-37 can delete both with `tools/`, `winetricksQueue` and the TS gates.

## Task Commits

1. **Task 1 (tracer): a wine command on a game end to end through Rust, from the renderer and the launcher's known-fix step** - `43124c745` (feat)
2. **Task 2: runWineCommand and callTool resolvers, the releases listener, and the wine tools cluster's registration file deleted** - `40023b902` (feat)

## Verification

- Task 1 chain: `grep -c toolsFrom launcher.ts` is 0, the plan's jest list (engineWineResolvers, wineToolsFlows, engineWineShimSchedule, registrationOncePerBoot, launcher.engineStep) plus the new gameCommandFacts test, `cargo test --bin gamelib-shell` (827 passed; the plan's `rust_dispatch` filter matches no test, as in 87-35, so the whole bin suite ran), `rustfmt --edition 2021 --check`, `pnpm check:ipc-contract`, `pnpm codecheck`, prettier over the written paths (none ignored).
- Task 2 chain: `test ! -e wineToolsFlowRegistration.ts`, the plan's jest list (the resolver, schedule, registration-once, flowRegistrationCensus, ipcDomainCensus and runnerMisc suites), `cargo test --bin gamelib-shell` (828 passed), rustfmt, `pnpm check:ipc-contract`, `pnpm codecheck`, prettier over the written paths.
- Whole `Backend` and `Common` jest projects: 15423 passed, 0 failed (13 skipped, pre-existing).
- Acceptance: `grep -c toolsFrom launcher.ts` is 0; the non-comment count of `'callTool'` in `runnerMiscFlowRegistration.ts` is 0; the schedule holds nine resolver rows with `deletedBy: 98`.
- Not run: a live Wine tool button, Run installer or launch on a real prefix (coverage D5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The facts need a module, not resolver logic**
- **Found during:** Task 1
- **Issue:** the plan's resolver reads "const facts (the Steam eligibility, `game.isNative()`, folder name, install path, pending install, the merged settings), then one typed call". The schedule gate allows only const declarations before the call, and the TS order (never resolve the bottle-creating settings for a command a guard will refuse) needs branches.
- **Fix:** new `src/backend/services/gameCommandFacts.ts` (`gatherGameCommandFacts`), injected into the resolvers as `gameCommandFacts` (from `handlers.ts` and from the launcher over its own `engineSource`). `services/winetricksTarget.ts` gained the throwing `resolveToolTarget`; `resolveWinetricksTarget` is its never-throwing wrapper.
- **Files modified:** `src/backend/services/gameCommandFacts.ts` (new), `src/backend/services/winetricksTarget.ts`, `src/backend/sidecar/handlers.ts`, `src/backend/launcher.ts`
- **Commit:** `43124c745`

**2. [Rule 1 - Bug] callTool on Windows would have changed behaviour**
- **Found during:** Task 2
- **Issue:** Rust's `call_tool` goes through `run_wine_command_for_game`, whose Windows branch spawns the program directly. The TS `callTool` never had that branch (every game is native on Windows, so the tool was a refused no-op), so winecfg or a Run EXE on Windows would have started spawning.
- **Fix:** the facts gatherer takes a `tool` option; on Windows a tool button reads the game as on any platform, the game is native, and Rust refuses it.
- **Files modified:** `src/backend/services/gameCommandFacts.ts`, `src/backend/sidecar/engineWineResolvers.ts`
- **Commit:** `40023b902`

**3. [Rule 3 - Blocking] Files outside the plan's list**
- **Found during:** Tasks 1 and 2
- **Issue:** the new arms, the moved channels and the deleted file each move census pins and floors the plan's list does not name: `dialogOptionForwarding`, `tauriShellSource`, `rustInvokeSchemas`, `flowRegistrationCensus`, `invokeReturnValueSweep`, `ipcDomainCensus`, `runnerSliceRegistration`, `runnerMiscFlows`, `registrationOncePerBoot`, `bootSourceShape`, `diPhaseGates`, `electronReachLedger`, `testContainment`, `sidecarRpc.ts`, `runnerMiscFlowRegistration.ts`.
- **Fix:** each edited in the commit that needs it. Floors that counted the deleted file were lowered by one each with the deletion recorded beside the floor; the `schedule` test lists `launcher.ts` among the callers of every resolver row (the importer check is per file).
- **Commit:** `43124c745`, `40023b902`

**4. [Rule 2 - Missing critical] The dialog push-failure pin was not about the deleted registration**
- **Found during:** Task 2
- **Issue:** `wineToolsFlows.test.ts` also held the only test that `showDialogBoxModalAuto` raises no unhandled rejection when the frontend push fails, a property of `dialog.ts`. Deleting the file whole would have lost it.
- **Fix:** moved to `src/backend/dialog/__tests__/showDialogBoxModalAutoPushFailure.test.ts`.
- **Commit:** `40023b902`

**5. [Rule 1 - Bug] An unused import in a file the plan edits**
- **Found during:** Task 2
- **Issue:** `src/common/types/ipc/wineTools.ts` carried an unused `WineInstallation` import (an eslint error left by 87-24).
- **Fix:** removed.
- **Commit:** `40023b902`

---

**Total deviations:** 5 auto-fixed (2 blocking, 2 bug, 1 missing critical)
**Impact on plan:** one new small module; the plan's channels, rows and order hold.

## Behaviour notes (parity differences)

- A malformed `commandParts` from the renderer is now rejected by the Rust shape guard after the facts are gathered (the TS rejected it first). Gathering a game's facts for a malformed command can create that game's bottle, which a legitimate call would do too; the command itself never spawns.
- `callTool` with a tool name outside `winecfg` and `runExe` no longer reaches a no-op-plus-`done` path: Rust's tool enum refuses it. The registry's zod `toolName` enum already rejects it before the handler in production, so it is not reachable from the renderer.
- A resolver failure in the facts (a game the library does not know, a config read) rejects, as the TS handlers did; the Winetricks reads still swallow theirs.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. T-87-33 is mitigated as planned: the Rust shape guard on `commandParts` (a non-empty array of at most 256 strings of at most 4096 characters), the Steam per-game-bottle guard and the native guard run before any spawn, an argv array is the only way to a child, and the Helper class holds. The two new arms decode strictly (`deny_unknown_fields`) behind the shell's own wine host facts; no new endpoint, path or trust boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `services/toolsFrom.ts` is now caller-free (no importer remains), and `createTools` has no non-test caller. 87-37 can delete `src/backend/tools`, `services/toolsFrom.ts`, the TS queue (`tools/winetricksQueue.ts` with the `winetricks-queue` boot step and the `winetricksQueue` field of `BootServices`), `runWineCommandOnGameGuard.test.ts` and `winetricksInstallPathInvariant.test.ts` with their gates.
- `graphify update .` was run.

## Self-Check: PASSED

- FOUND: `src/backend/services/gameCommandFacts.ts`, `src/backend/services/__tests__/gameCommandFacts.test.ts`, `src/backend/dialog/__tests__/showDialogBoxModalAutoPushFailure.test.ts`, `src/backend/sidecar/engineWineResolvers.ts`
- ABSENT (deleted as planned): `src/backend/sidecar/wineToolsFlowRegistration.ts`, `src/backend/sidecar/__tests__/wineToolsFlows.test.ts`
- FOUND: `43124c745`, `40023b902` (ancestors of HEAD; `git rev-list --count` from the plan ledger is 2)
