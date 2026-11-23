---
phase: 87-engine-wine-and-tools
plan: 55
subsystem: engine
tags: [rust, shims, rustinvoke, steam-bridge, run-tool, abort, crossover-bin-dir, twin, d-03, d-15, d-24]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the Rust run_tool and cancel registry (87-44), the CrossOver bin-dir locator and its shell arm (87-54), the decision shims and steamEngineDeps facts resolver (87-54)
provides:
  - src/backend/enginewine/runTool.ts shims rustRunTool and cancelRunTool (schedule rows, deletedBy 97)
  - src/backend/storeManagers/steam/engine/rustRunTool.ts createRustRunTool, the bridge's RunTool over Rust with its (tool, args, {timeoutMs, signal}) signature, a cancel id per run and engine_cancel on abort
  - src/backend/enginewine/decision.ts shim resolveCrossoverBinDir (deletedBy 98) and steam/engine/crossoverBinDir.ts, which folds a failed call into "not installed"
  - twin additions isNonCrossover and engineLogLabel in enginewine/twin.ts (deletedBy 96) pinned to Rust by selection_twin.json
  - src/common/types/engine.ts RunTool, RunToolResult, RunnerTool, EngineSelection, NonCrossoverEngine, NonCrossoverSelection, FallbackReason
  - rustInvoke channels engine_run_tool and engine_cancel (shell arms, strict one-object decode); channel count 183 -> 185
affects: [87-56, 87-57, 96, 97, 98]

actuals:
  tokens: 63000
  tasks: 2
  commits: 2

plan_head_before: 8b290698c05aeb257282c9a4e5782a7afe8847f2
plan_head_after: 908c204a7aa243ec6acdf3fdc2c1342e93301eaf

tech-stack:
  added: []
  patterns:
    - "an AbortSignal crosses rustInvoke as a cancel id: the factory names each run, sends engine_cancel when the signal aborts and re-sends it (bounded, no timer) while Rust answers that the id is not registered yet"
    - "a shim that cannot be a closure factory stays one returned call, and the closure that builds the legacy call signature lives outside enginewine/ over it (as steam/engine/bridgeDeadline.ts did in 87-54)"
    - "a lookup the TS locator never let reject is wrapped once (crossoverBinDir) so every site keeps that behaviour"

key-files:
  created:
    - src/backend/enginewine/runTool.ts
    - src/backend/storeManagers/steam/engine/rustRunTool.ts
    - src/backend/storeManagers/steam/engine/crossoverBinDir.ts
    - src/backend/enginewine/__tests__/runToolShim.test.ts
    - src/backend/storeManagers/steam/__tests__/rustRunTool.test.ts
    - src/backend/storeManagers/steam/__tests__/crossoverBinDir.test.ts
    - src-tauri/crates/gamelib-engine/tests/fixtures/vectors/selection_twin.json
  modified:
    - src/common/types/engine.ts
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/enginewine/decision.ts
    - src/backend/enginewine/twin.ts
    - src/backend/engine/engineTypes.ts
    - src/backend/engine/runTool.ts
    - src/backend/appshell/appManagement.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/storeManagers/steam/gameBridgeLaunch.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/gameLaunchOverlay.ts
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/bridgeBottleLifecycle.ts
    - src/backend/storeManagers/steam/provisionBottle.ts
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src-tauri/crates/gamelib-engine/tests/twin_vectors.rs

key-decisions:
  - "The plan's rustRunTool(deps) -> RunTool cannot be a schedule shim (a shim body is one returned requestRustInvoke call and its first statement cannot be a closure). rustRunTool keeps its schedule name and is the one-call shim rustRunTool(deps, {tool, args, timeoutMs, cancelId}); the RunTool closure is createRustRunTool in steam/engine/rustRunTool.ts. 87-57's list names rustRunTool and cancelRunTool in enginewine/runTool.ts, which holds."
  - "engine_run_tool joins the sidecar's unbounded list: the bridge's runner clone is a cp -R of a CrossOver bundle that carries its own timeoutMs, and the TS runner it replaces had no cap beyond that. Rust bounds every run by that timeout, engine_cancel and the app shutdown. engine_cancel stays bounded."
  - "An abort whose cancel arrives before Rust registered the id (answer false) is re-sent up to five times, each a round trip, rather than lost; no timer is armed (sidecar exit contract)."
  - "The Rust-backed RunTool never rejects, as the TS one never did: a transport failure or a reply that is not the five-field result resolves as a refusal in stderr."
  - "The async bin-dir lookup is Rust's for every site that has a transport; the sync fast path bottle.ts reads inline (resolveCrossoverWine) stays the boot's TS locator. bottle.ts keeps a local SteamCrossoverLocator type, and the boot's steam-bottle facade sends its async half through crossoverBinDir, so bottle.ts's isCrossoverInstalled is Rust-backed without a new dep."
  - "isNonCrossover and engineLogLabel are pinned to Rust by a new selection_twin.json (83 vectors per group) replayed by twinVectors.test.ts and twin_vectors.rs against EngineSelection::engine and ::log_label, not folded into engine_twin.json, because the log label never answers null or false and the old file's anti-vacuity rule requires both."
  - "engine/engineTypes.ts stays as a re-export of the moved types and the two twin helpers so the TS engine compiles until 87-56 deletes it."

patterns-established:
  - "a deps slice that only needed the TS locator becomes Pick<EngineRuntime, 'requestRustInvoke'>, and the test fake answers engine_cx_resolve_bin_dir (createFakeBottleRust({crossoverBinDir}), createTestEngineRuntime default null)"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "D-03 and Pitfall 10: the Steam bridge runs its tools (cp, xattr, codesign, plutil, ps) in Rust through rustRunTool and cancelRunTool, the RunTool call signature (tool, args, {timeoutMs, signal}) unchanged for the ten consumer files, abort sending engine_cancel for the run's id"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/rustRunTool.test.ts (6: result shape, allowlist refusal, pre-aborted signal, abort sends engine_cancel, cancel re-sent until registered, never rejects)"
        status: pass
      - kind: unit
        ref: "src/backend/enginewine/__tests__/runToolShim.test.ts (3)"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts (shape, callers and discovery for rustRunTool and cancelRunTool)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-04 and D-15: CrossOver's bin directory is found by Rust for the app shell's App Management probe, provisionBottle (2), bridgeBottleLifecycle (2), the DRM and overlay detect step and the Steam bottle's async lookup, through one never-rejecting wrapper over the resolveCrossoverBinDir shim"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/crossoverBinDir.test.ts (9), src/backend/enginewine/__tests__/decisionShim.test.ts (resolveCrossoverBinDir), src/backend/appshell/__tests__/appManagement.test.ts (default lookup: path, null, empty, wrong type, failed call)"
        status: pass
      - kind: unit
        ref: "provisionBottle.test.ts, bridgeBottleLifecycle.test.ts and bridgeRemovalSafety.test.ts over a fake Rust that answers engine_cx_resolve_bin_dir"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-24: the engine types the bridge needs live in src/common/types/engine.ts, isNonCrossover and engineLogLabel are twins pinned to Rust by 83 shared vectors each, and no storeManagers or appshell file imports engine/(launchDeadline|engineState|engineDecision|runTool|crossoverLocation|engineTypes)"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/enginewine/__tests__/twinVectors.test.ts (selection_twin.json block, 4) and cargo test -p gamelib-engine --test twin_vectors (selection_twin, 3)"
        status: pass
      - kind: other
        ref: "grep -rlE \"engine/(launchDeadline|engineState|engineDecision|runTool|crossoverLocation|engineTypes)'\" src/backend/storeManagers src/backend/appshell | grep -v __tests__ | wc -l == 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "engine_run_tool and engine_cancel are in the IPC contract: strict one-object decode, shell arms, the generated contract current, channel counts 183 -> 185"
    requirement: SVC-02
    verification:
      - kind: other
        ref: "pnpm check:ipc-contract; cargo test --bin gamelib-shell engine_dispatch (30, both arms in the bad-args and not-ready loops); rustInvokeSchemas.test.ts (185); tauriShellSource.test.ts (185 arms)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A real Mac Steam bridge launch (a DRM title's runner clone and re-sign, an overlay setup, aborting a launch mid clone) runs its tools through the new path in the built app"
    verification: []
    human_judgment: true
    rationale: "The tests use fake transports and a fake Rust runner; no running app was driven. The Rust run_tool is covered by the crate's own tests (run_tool_arms.rs) but the wire from a real sidecar to a real cp -R, and a real engine_cancel racing its registration, is not asserted end to end. The live gate after the switch-over is the phase's live-gate item 1."

duration: 19 min
completed: 2026-11-24
---

# Phase 87 Plan 55: Steam bridge tool runs, CrossOver lookups and engine types reach Rust Summary

**The Steam bridge runs cp, xattr, codesign, plutil and ps in Rust through a `RunTool` that keeps its `(tool, args, {timeoutMs, signal})` signature (an abort sends `engine_cancel` for the run's id), finds CrossOver's bin directory through Rust, and takes its engine types from `common/types/engine` and its two selection helpers from the twin.**

## Performance

- **Duration:** about 19 min (2026-11-23T18:04Z to 18:23Z)
- **Tasks:** 2 (tracer, auto)
- **Commits:** 2 (the ledger base `8b290698c` to HEAD reads 5 because another session committed three `docs(94)` commits between mine)
- **Files modified:** 45 in the second commit, 17 in the first (7 created)

## Accomplishments

- **Task 1 (tracer):** `engine_run_tool` and `engine_cancel` channels with shell arms; `enginewine/runTool.ts` shims; `createRustRunTool` (cancel id per run, `engine_cancel` on abort, never rejects); `RunTool` and its result type moved to common; `gameBridgeLaunch.ts` builds its `RunTool` over Rust. The tracer's `<verify>` is automated only, so no checkpoint was synthesized: the whole verify list was re-run green before Task 2 started.
- **Task 2:** the other two construction sites, the CrossOver bin-dir shim and its seven consumers, the type moves, the twin additions with vectors, the schedule rows and the test fakes.

## Task Commits

1. **Task 1 (tracer): tool runs through shims with abort over engine_cancel** - `6bb4fc2c6` (feat)
2. **Task 2: the other construction sites, bin-dir shim, types and twin** - `908c204a7` (feat)

## Call sites and their ripple (D-03, D-15)

Every site was already inside an async function; none needed a caller made async. `crossoverBinDir` keeps the TS locator's "never rejects" behaviour, so no caller gained a new failure mode.

| Shim | Site | Resolution |
| --- | --- | --- |
| `rustRunTool` / `cancelRunTool` | `gameBridgeLaunch.ts` DRM launch | `runTool: createRustRunTool(steamGame.deps)` |
| the same | `gameLaunch.ts` DRM prefetch | the same |
| the same | `gameLaunchOverlay.ts` overlay setup | the same |
| `resolveCrossoverBinDir` | `appManagement.ts` default lookup | `crossoverBinDir(deps)`; `AppManagementDeps` now takes `requestRustInvoke` (the `runner` and `engineRuntime` fields are gone), so `registerAppShellFlows`, `handlers.ts` and `runnerSliceRegistration.test.ts` stop passing `engineRuntime` |
| the same | `provisionBottle.ts` `killBottleWineServer` | `crossoverBinDir(deps.engineRuntime, {hintWineBins})` |
| the same | `provisionBottle.ts` `provisionBottle` | with `wineVersion` as a first hint |
| the same | `bridgeBottleLifecycle.ts` `removePerGameBridgeBottle`, `provisionBridgeBottle` | the same, with and without `wineVersion` |
| the same | `bridge/drm/runnerCrossover.ts` `defaultResolveBinDir` (also used by `overlayRunnerClone.ts`) | `crossoverBinDir(deps.engineRuntime)` |
| the same | `bottle.ts` `isCrossoverInstalled` | the boot's facade in `bootstrap.ts` sends the async half through `crossoverBinDir` |
| type imports | 10 consumer files (`gameInstall`, `games`, `gameDrmLaunch`, `gameEngineDialogs`, `gameInstallBridge`, `gameLaunch`, `bridgeWineTools`, `bridgeBottle`, `bridgeBottleLifecycle`, `steamEngineDeps`, seven `bridge/drm` and `bridge/overlay` files, `bottle.ts`) | `common/types/engine` (or `enginewine/twin` for `isNonCrossover` and `engineLogLabel`, including three dynamic imports) |

`steamEngineDeps.ts`, which the plan lists as a bin-dir site, has no lookup (87-54 reduced it to a facts resolver); it needed only the `EngineSelection` import repointed.

## Log lines that no longer reach gamelib.log

The shell has no `EngineLog`, so nothing Rust logs reaches `gamelib.log`. The tool runner wrote no log lines. What stops:

- `resolveCrossoverBinDirAsync: discoverCrossover failed` (a failed Spotlight search for CrossOver, written by the TS locator). Rust's lookup swallows a failed discovery silently. `crossoverBinDir: the CrossOver lookup failed` is written when the whole call fails (the transport or `not-ready`), which is a different, rarer event.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `rustRunTool(deps)` returning a `RunTool` cannot be a schedule shim**
- **Found during:** Task 1
- **Issue:** the shape rule requires a shim body to be one returned `requestRustInvoke` call; a factory returning a closure is not. The plan names the factory `rustRunTool` and also schedules it as a shim.
- **Fix:** `rustRunTool` and `cancelRunTool` are the two one-call shims with the plan's names and phase (97); the `RunTool` closure is `createRustRunTool` in `steam/engine/rustRunTool.ts`, the precedent of `steam/engine/bridgeDeadline.ts` (87-54). 87-57's list ("runTool.ts: rustRunTool, cancelRunTool (shim, 97)") still holds.
- **Commit:** `6bb4fc2c6`

**2. [Rule 2 - Missing critical] `engine_run_tool` needs no 60 s cap**
- **Issue:** a CrossOver runner clone is a multi-minute `cp -R` with its own `timeoutMs`; the sidecar's generic 60 s would have failed it where the TS had no cap.
- **Fix:** `RUST_ENGINE_RUN_TOOL` joined `UNBOUNDED_RUST_CHANNELS` with the reason in the file comment and in `dialogOptionForwarding.test.ts`. `engine_cancel` stays bounded.
- **Commit:** `6bb4fc2c6`

**3. [Rule 2 - Missing critical] An abort could be lost to the registration race**
- **Issue:** a cancel that reaches Rust before the run registered its id answers `false` and the run then goes on unaborted.
- **Fix:** the factory re-sends the cancel (at most five times, each a round trip, no timer) while Rust answers `false` and the run has not finished.
- **Commit:** `6bb4fc2c6`

**4. [Rule 3 - Blocking] Files outside the plan's list**
- `steam/engine/crossoverBinDir.ts` (new: a shim resolves `unknown` and can reject, so the narrowing and the never-rejects wrapper cannot live in the shim), `sidecar/bootstrap.ts` (the steam-bottle facade), `sidecar/handlers.ts` and `sidecar/appShellFlowRegistration.ts` (`engineRuntime` no longer reaches the App Management probe), `bottle.ts` (a local `SteamCrossoverLocator` replaces the `crossoverLocation` type import), `engine/engineTypes.ts` and `engine/runTool.ts` (re-export the moved types so the TS engine compiles until 87-56), `enginewine/{bottles,decision,selectionView,state}.ts` (types from common), `testUtils/fakeBottleRust.ts` and `testUtils/testEngineRuntime.ts` (answer the lookup), `sidecarRpc.ts`, `dialogOptionForwarding`, `rustInvokeSchemas` and `tauriShellSource` tests (the new channels), `twin_vectors.rs` and the new `selection_twin.json` (the vectors pin), `engine_dispatch.rs` (the shell arms the plan lists under `rust_dispatch.rs`), and the tests that built the old locator fixture (`appManagement`, `provisionBottle`, `bridgeBottleLifecycle`, `bridgeRemovalSafety`, `runnerSliceRegistration`).
- **Commits:** `6bb4fc2c6`, `908c204a7`

**5. Acceptance criterion `grep -c "export type RunTool" src/common/types/engine.ts == 1`**
- A `RunToolResult` type alias would have made it 2, so `RunToolResult` is an `interface`. The criterion reads 1.

**Total deviations:** 5 (2 Rule 2, 2 Rule 3, 1 criterion note). **Impact:** none on the goals.

## Issues Encountered

- `STATE.md`, `ROADMAP.md` and several `.planning` files carried another session's uncommitted edits, and that session committed three `docs(94)` commits during this plan. None are part of this plan's changes; only this plan's files were staged, by explicit path.

## Carry-forward for 87-56 and later (read before deleting the engine)

- **The plan's D-06 truth over-claims.** The acceptance grep (six engine modules, `'`-terminated) is 0, but `src/backend/engine` still has non-test importers outside it: `engineRuntime` (type-only, 10 Steam files and `services/types.ts`), `prepareBottle` (`gameLaunch`, `gameInstallBridge`, `gameEngineDialogs`, `steamEngineDeps`), `engineSync` (`gameLaunch`, `gameBridgeWineLaunch`, `gameBridgeLaunchGate`), `engineServices`, `engineConfig` and `toolSettings` (`steamEngineDeps`, `bridgeWineTools`, `services/winetricksTarget`, `services/gameCommandFacts`), `fallbackBottleCall` (`bridgeBottleLifecycle`), `pinnedEngineProgress` (`gameInstall`), `processListing` (`bottleProcessMonitor`), `offlineRefusal` (`gameLaunch`, `gameEngineDialogs`), `engineNoticeStore` and `engineState` (services, stores), and the pure `engineIds` and `gameKey` (`twin.ts`, `decision.ts`, `gameLaunch`, `bridgeWineTools`). None are 87-55's to switch; 87-56 must account for them before it deletes the directory.
- **The sync CrossOver fast path is still the boot's TS locator.** `bottle.ts` `resolveCrossoverWine` calls `deps.crossover.resolveCrossoverBinDir(...)` synchronously (existsSync over the hinted bins, the memo and the two default installs) and cannot become async. `createCrossoverLocator` is on 87-56's delete list, so 87-56 needs a sync twin of that fast path (the Rust `CrossoverLocator::resolve_bin_dir_sync` with vectors) or a rewrite of `resolveCrossoverWine`, and the bootstrap facade still builds the locator.
- **Two Rust CrossOver locators coexist, unchanged.** The older `EngineCtx.crossover_bin_dir` hook (used by `game_engine`, the engine config, the switch, `per_game` and `tool_settings`, and many golden tests that inject it) and the newer `crossover::locate::CrossoverLocator` (the decision and now `engine_cx_resolve_bin_dir`). Collapsing them touches those Rust callers and their goldens, so it was not folded into a TS shim plan; the two answer from the same rules.
- **`runner` in the DRM and overlay deps is dead.** `DetectCrossoverDeps.runner`, `DrmSetupOverrides.runner` and the overlay's `detectCrossoverForOverlay` deps kept the field, which only the bin-dir lookup read; the callers still pass it. 87-56 or 97 can drop the field with the callers.
- **Rust ops without shell arms or channels.** `engine_cx_demo_status`, `engine_fallback_ensure` and `engine_fallback_is_installed` still have no rustInvoke channel or shell arm. No caller this plan switched needs them.
- **`engine/toolSettings.ts` (87-52, unowned) is untouched.** `toolSettings`, `services/winetricksTarget.ts` and `gameCommandFacts.ts` still read the TS registry and overlay, so the Winetricks and Run EXE target keeps using the stored override during a live fallback-engine launch. This plan did not touch them; it remains open and unowned.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-87-87 (elevation, `rustRunTool` from bridge code): mitigated. The shim passes `tool` and `args` only; Rust's five-program allowlist, isolated profile (eight variables at a fresh 0700 directory, empty stdin, 1 MiB output cap) and cancel-id grammar apply to every call, and a program outside the list is an answer that spawns nothing (`rustRunTool.test.ts` and the crate's `run_tool_arms.rs`). T-87-SC accepted: no new package.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

87-56 can delete the TS engine once it deals with the carry-forward list above: the importers that remain, the sync CrossOver fast path and the `engineTypes.ts` and `engine/runTool.ts` re-exports this plan left for it.

## Self-Check: PASSED

- Commits `6bb4fc2c6` and `908c204a7` are ancestors of HEAD.
- Created files exist: the three source files, three test files and `selection_twin.json`.
- Acceptance: `grep -c "export type RunTool" src/common/types/engine.ts` is 1; `createRunTool` outside comments in `gameBridgeLaunch.ts` is 0; the storeManagers and appshell engine-import grep is 0 (was 21) and the `engine/runTool'` grep is 0 (was 10).
- `pnpm exec jest src/backend src/common` (635 suites, 14,928 tests), `pnpm codecheck`, `pnpm check:ipc-contract`, `pnpm backend-di-ceilings` (jestMock 1691, unchanged), `cargo test --bin gamelib-shell engine_dispatch` (30), `cargo test -p gamelib-engine --test twin_vectors` (9) and `--test run_tool_arms` (6), `rustfmt --check` on the changed Rust files, and `npx prettier --check` over every changed path pass (`ipc_contract.rs`, `ipcSchemaSnapshot.json` and the vector JSON are generated or ignored).

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
