---
phase: 87-engine-wine-and-tools
plan: 52
subsystem: engine
tags: [rust, launch-step, shims, resolver, rustinvoke, d-01, d-15, d-23, fnd-06]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the Rust launch step, deadline and watch, launch settings overlay and engine state ops (87-47 to 87-51)
provides:
  - src/backend/enginewine/launch.ts shims selectEngineForLaunch, armEngineLaunchDeadline, endEngineLaunch, getLaunchSettings
  - src/backend/launchEngineStep.ts (reply narrowing, the reply's log lines, launchSettingsFor)
  - resolver getEngineState in sidecar/engineWineResolvers.ts, steamEngineStateFacts in steamEngineDeps.ts
  - rustInvoke channels engine_launch_select (unbounded), engine_launch_arm_deadline, engine_launch_end, engine_launch_settings_get, engine_state_get
affects: [87-53, 87-54, 87-55, 87-56, 88, 92, 98]

actuals:
  tokens: 25000
  tasks: 3
  commits: 5

plan_head_before: d875fcbbba7c6e69b6caab820e8ca940cb875f21
plan_head_after: 69f708d29d52c6ce2d244fea084a1188a20ba93a

tech-stack:
  added: []
  patterns:
    - "a launch's engine step is one typed call whose reply carries the launch settings and the log lines; the caller writes the lines to the gamelib log and its own launch log and runs on the reply's settings"
    - "a resolver that must answer null for a game TypeScript knows is ineligible sends a null identity instead of branching before its one call, so the shape rule (consts, then one returned call) holds"

key-files:
  created:
    - src/backend/enginewine/launch.ts
    - src/backend/launchEngineStep.ts
  modified:
    - src/backend/launcher.ts
    - src/backend/storeManagers/gog/setup.ts
    - src/backend/storeManagers/nile/setup.ts
    - src/backend/storeManagers/gog/games.ts
    - src/backend/storeManagers/nile/games.ts
    - src/backend/storeManagers/legendary/games.ts
    - src/backend/storeManagers/sideload/games.ts
    - src/backend/storeManagers/storeManagerCommon/games.ts
    - src/backend/sidecar/engineWineResolvers.ts
    - src/backend/sidecar/engineFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/storeManagers/steam/engine/steamEngineDeps.ts
    - src/backend/testUtils/testHostServices.ts
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json

key-decisions:
  - "The reply is narrowed and its logLines written in launchEngineStep.ts, not in the shim: the shim body must stay one returned typed call (D-06). Each line goes to the gamelib log as `Engine: <key> <line>` (what the TS writeLog did) and to the caller's game launch log when it has one."
  - "launchSettingsFor(deps, key, stored) wraps the getLaunchSettings shim and checks the reply is an object, so the eleven call sites stay one await each and none casts."
  - "getEngineState sends {identity, facts?}: identity is null for a native game, a Browser install, an unknown runner or a failing library lookup (Rust answers null), facts only for a bottle-runtime title. Rust refuses a host that is not macOS itself, so the TS isMac check is gone."
  - "armEngineLaunchDeadline is awaited with a logged catch in prepareWineLaunch (its enclosing function is async) rather than fire-and-forget: a failed arm must not fail a launch that is otherwise ready, and the order against the launch is deterministic."
  - "endEngineLaunch is awaited in releaseEngine with a logged catch: a failed release (the app is quitting) must not replace the launch's own result or error."
  - "The Steam state facts are named steamEngineStateFacts, because 87-54 plans a steamEngineFacts for the decision arguments."

patterns-established:
  - "an empty registration file is allowed to exist for one plan only through a named REGISTERS_NOTHING set in ipcDomainCensus and NO_COUNT_CLAIM in flowRegistrationCensus"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "D-01: a non-Steam launch on macOS runs its engine step in Rust: launcher.ts builds the bag {runner, appName, title, installPath, platform, isNative, settings, offline}, awaits one engine_launch_select call, writes each reply logLine to the gamelib log and the game launch log, runs on the reply's launchSettings, skips the self-healing Wine check for an engine-controlled launch and releases the selection with engine_launch_end in the launch's finally and on a failed start; skip, legacy and refused behave as before"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/launcher.engineStep.test.ts (8 cases, fake requestRustInvoke with recorded replies)"
        status: pass
      - kind: unit
        ref: "src/backend/engine/__tests__/launcherOverlayCensus.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-01: GOG and Amazon setup select with purpose setup through the launch shims, skip the self-heal for an engine-controlled setup, run on the overlay read from Rust and release in a finally"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/gog/__tests__/setup.engine.test.ts (10 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-15: every getLaunchSettings call site (launcher prepareWineLaunch, the five non-Steam games.ts launch and stop paths, gog and nile setup) is an awaited async read from Rust; the launcher's main site takes the select reply's value"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/managerOverlayCensus.test.ts, launcherOverlayCensus.test.ts"
        status: pass
      - kind: other
        ref: "test \"$(grep -rln \"engine/launchEngine'\\|engineRuntime.launchSettings\" src/backend/storeManagers src/backend/launcher.ts | wc -l)\" -eq 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-23: getEngineState is a scheduled resolver (row deletedBy 98): one engine_state_get call with the identity (null for an ineligible game) and, for a Steam title, the bridge facts; registered once by registerEngineWineResolvers, its handle gone from engineFlowRegistration.ts"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/engineWineResolvers.test.ts#getEngineState (16 cases)"
        status: pass
      - kind: unit
        ref: "engineWineShimSchedule.test.ts, registrationOncePerBoot.test.ts, flowRegistrationCensus.test.ts, ipcDomainCensus.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "The five channels are in the IPC contract: strict one-object decode, shell arms, engine_launch_select unbounded in the sidecar, the generated contract and schema snapshot current"
    requirement: SVC-02
    verification:
      - kind: other
        ref: "pnpm check:ipc-contract; cargo test --bin gamelib-shell engine_dispatch (30, every arm: bad-args and not-ready); rustInvokeSchemas.test.ts (172 channels); tauriShellSource.test.ts (172 arms)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A real non-Steam launch on a Mac (a CrossOver and a fallback launch, a refused launch, the deadline notice, the engine badge after a launch, GOG setup in its bottle) runs through the new path in the built app"
    verification: []
    human_judgment: true
    rationale: "The tests use a fake transport and recording sinks; no running app was driven. The live gate after the switch-over is the phase's live-gate item 1."

duration: 60 min (approximate, host clock 16:15 to 17:20 UTC, 2026-11-23)
completed: 2026-11-24
---

# Phase 87 Plan 52: Non-Steam engine step, launch settings and getEngineState reach Rust Summary

**The launcher and GOG/Amazon setup run the launch-time engine step in Rust through four `enginewine/launch.ts` shims, every non-Steam launch-settings read is an awaited Rust call, and the renderer's `getEngineState` is a D-23 resolver sending one `engine_state_get`.**

## Performance

- **Duration:** about 60 min
- **Tasks:** 3 (tracer, auto, TDD)
- **Commits:** 5 (measured from the ledger base `d875fcbbb`)
- **Files modified:** 38 (2 created)

## Accomplishments

- **Task 1 (tracer):** five rustInvoke channels were added over the whole plan; this task added `engine_launch_select` (unbounded, it may download the 228 MB engine and wait on a dialog), `_arm_deadline`, `_end` and, early, `_settings_get` (the launcher's own settings read needed it in the same commit). `launcher.ts` no longer imports `./engine/launchEngine`. The tracer `<verify>` is automated only, so no checkpoint; the full backend jest run (14,247 tests) stayed green at every commit.
- **Task 2:** gog and nile setup go through `runLaunchEngineStep`, `endEngineLaunch` and `launchSettingsFor`; the five `games.ts` files read launch settings from Rust. `testHostServices` answers `skip` and the stored settings, as Rust does with nothing selected, so the dozens of store-manager suites that never script Rust keep their behaviour.
- **Task 3 (TDD):** red commit (resolver tests plus the channel plumbing), then the resolver, `steamEngineStateFacts`, the handlers wiring, and `engineFlowRegistration.ts` registering nothing.

## Task Commits

1. **Task 1 (tracer): launcher selects its engine in Rust** - `24ef92482` (feat)
2. **Task 2: GOG and Amazon setup, and every getLaunchSettings site** - `1c8583835` (feat)
3. **Task 3 red: resolver cases and the engine_state_get channel** - `4e0259c86` (test)
4. **Task 3 green: the getEngineState resolver** - `8c8256780` (feat)
5. **Rename: steamEngineStateFacts** - `69f708d29` (refactor)

## A1 record: every getLaunchSettings site

Every enclosing function was already async, so none of the 11 sites needed an enclosing function to become async (the plan's prohibition holds).

| Site | Enclosing function | Resolution |
| --- | --- | --- |
| `launcher.ts` `runLaunchEventCallback` | async | the select reply's `launchSettings` (no second call; asserted in the test) |
| `launcher.ts` `prepareWineLaunch` | async | `await launchSettingsFor(deps, key, await game.getSettings())` |
| `storeManagerCommon/games.ts` `launchGame` | async | awaited `launchSettingsFor` |
| `gog/games.ts` `launch` | async | awaited |
| `gog/games.ts` `stop` | async | awaited |
| `nile/games.ts` `launch` | async | awaited |
| `nile/games.ts` `stop` | async | awaited |
| `legendary/games.ts` `launch` | async | awaited |
| `legendary/games.ts` `stop` | async | awaited |
| `sideload/games.ts` `stop` | async | awaited |
| `gog/setup.ts`, `nile/setup.ts` `setup` | async | awaited, over the setup's own `stored` (not the reply's value, because the setup's `stored` is `gameConfigs.get(appName).config`, not `game.getSettings()`) |

The sync call sites of the plan's `armEngineLaunchDeadline` and `endEngineLaunch` are also inside async functions (`prepareWineLaunch`, `releaseEngine`), so both are awaited with a logged catch rather than `void`.

## Which owner serves the engine state after this plan

- **Non-Steam launches:** Rust. `engine_launch_select` records the decision in Rust's state (`record_launch_decision`), and the renderer's `getEngineState` reads Rust's state.
- **Steam launches (transitional):** `steam/gameLaunch.ts` still records its decisions in the TS `engineState` service, but the renderer's `getEngineState` now reads Rust's state for a Steam title too (with the facts from `steamEngineStateFacts`). Until 87-54 moves Steam's `recordLaunchDecision` to Rust, the Steam badge does not see a Steam launch's recorded decision (the fallback label and the notices a Steam launch produces); the pre-flight-driven part of the badge is Rust's already. 87-54 owns this ("decisions, deadlines and the state they record flip together").

## Log lines that reach no log now

The step's `logLines` (engine, version and reason lines, D-13) are written to gamelib.log and the game log by the caller, so those still arrive. Lines Rust writes only through `ctx.log` (which is `None` in the app, no `EngineLog`) reach no log; the TS wrote each with `logWarning` or `logInfo` to gamelib.log:

- `Engine: <key> has no valid prefix; not launching`
- `Engine: <key> bottle "<name>" could not be created: <error>`
- `Engine: <key> launch blocked before pre-flight while offline (...)`
- `Engine: <key> engine override <id> is unavailable: <detail>`
- `Engine: <key> the engine pin table cannot be read (...); not launching`
- `Engine: <key> engine selection was rejected (...); not launching`
- `Engine: <key> could not switch back to CrossOver (...); not launching`
- `Engine: <key> DXVK setup failed (...); continuing`
- `Engine: <key> cannot switch engine (...); not launching`
- the registry's `Engine: <key> uses <label>`, the ledger lines, and the deadline lines listed in 87-51's summary.

A refusal still shows its dialog; only the log line is missing. Whether to wire an engine log into `gamelib.log` was not decided here (carry-forward from 87-48 to 87-51, still open).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `engine_launch_settings_get` landed in Task 1, not Task 2**
- **Found during:** Task 1
- **Issue:** `launcher.ts`'s `prepareWineLaunch` read its settings from the TS registry, which no launch fills any more once the step is Rust's; leaving it for Task 2 would have left the first commit launching on the stored engine.
- **Fix:** the channel and shim came with the tracer; Task 2 added the other ten sites.
- **Commit:** `24ef92482`

**2. [Rule 3 - Blocking] Files outside the plan's list**
- `src/backend/launchEngineStep.ts` (new: the reply narrowing, the log lines and `launchSettingsFor`; the shim bodies must stay one call), `sidecar/sidecarRpc.ts` (`engine_launch_select` joins the unbounded list), `sidecar/handlers.ts` (the resolver's Steam facts dep), `steamEngineDeps.ts` (`steamEngineStateFacts`), `testUtils/testHostServices.ts`, and the census and ledger tests that pin the changed shapes: `launcherOverlayCensus`, `managerOverlayCensus`, `dialogOptionForwarding`, `rustInvokeSchemas`, `tauriShellSource`, `ipcDomainCensus`, `flowRegistrationCensus`, `gog/setup.engine`, `launcher_launchSingleFlight` (touched and reverted), and the `backendDiCeilings` shards (three jest.mock counts shrank).
- **Commits:** `24ef92482`, `1c8583835`, `8c8256780`

**3. [Rule 3 - Blocking] The empty `engineFlowRegistration.ts` fails two censuses**
- **Found during:** Task 3
- **Issue:** `ipcDomainCensus` (a) requires every registration file to register a channel and `bootSourceShape` requires a `deps` parameter. The plan keeps the file until 87-53.
- **Fix:** `REGISTERS_NOTHING` in `ipcDomainCensus`, `NO_COUNT_CLAIM` and a zero count in `flowRegistrationCensus`, `Async:getEngineState` joins the owner-less allowlist (70 -> 71). 87-53 deletes the file and these entries together (file count in (a) goes 20 -> 19).
- **Commit:** `8c8256780`

**4. [Rule 1 - Naming] steamEngineFacts renamed to steamEngineStateFacts**
- 87-54 plans a `steamEngineFacts` for the decision arguments, a different set of values.
- **Commit:** `69f708d29`

**Total deviations:** 4 (3 Rule 3, 1 naming). **Impact:** none on the goals.

## Issues Encountered

- The first test run after the switch failed in the dozens of store-manager suites that build their deps from `createTestManagerDeps`: their default Rust transport answered `undefined`. The test host now answers the two launch channels as Rust does with no launch selected.
- `git checkout HEAD~1 -- <file>` (to revert a test edit) ran the post-checkout `pnpm i` hook once; it found nothing to download.

## Known follow-ups

- **Wine tools during a live non-Steam launch.** `engine/toolSettings.ts` (TS, deleted in 87-56) still reads the TS registry and overlay context for `hasLiveSelection`/`overlay`. A launch is selected in Rust now and nothing mirrors it into the TS registry, so while a non-Steam game runs on a fallback engine, the Winetricks/Run EXE target resolves from the stored override as before the launch, not from the launch's engine. The Rust `tool_settings` sees the live selection; whoever switches `services/winetricksTarget.ts` and `gameCommandFacts.ts` to it (not named in 87-53 to 87-56) closes this. Not applied here: mirroring into the view would also need the TS overlay context, which the plan's scope does not cover.
- The bridge's `engineDeadlineFired` handler and the Steam arms are 87-54.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-87-53 (tampering, launch-select args): mitigated; the five requests are one-object tuples on the TS side and `deny_unknown_fields` structs in Rust with length-bounded runner, app name and title, the engine key is derived there, and `engine_state_get` decodes `identity` and `facts` strictly. T-87-SC accepted: no new package.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

87-53 can forward the dialog acks and delete `engineFlowRegistration.ts` (with `REGISTERS_NOTHING`, its `NO_COUNT_CLAIM` entry, its census row and its `handlers.ts` call). 87-54 owns the Steam decision, deadline and state-record flips and the `engineDeadlineFired` handler.

## Self-Check: PASSED

- Commits `24ef92482`, `1c8583835`, `4e0259c86`, `8c8256780` and `69f708d29` are ancestors of HEAD; `commits: 5` measured from the ledger base `d875fcbbb`.
- `src/backend/enginewine/launch.ts` and `src/backend/launchEngineStep.ts` exist.
- Acceptance greps: `from './engine/launchEngine'` in `launcher.ts` 0, `from 'backend/engine/launchEngine'` in `gog/setup.ts` 0, `'getEngineState'` in `engineFlowRegistration.ts` outside comments 0.
- `pnpm exec jest src/backend` (606 suites, 14,247 tests), `pnpm exec jest src/common meta src/frontend/state`, `pnpm codecheck`, `pnpm check:ipc-contract`, `pnpm backend-di-ceilings`, `cargo test --bin gamelib-shell engine_dispatch` (30) and `rustfmt --check` on the two shell files pass; `npx prettier --check` passes over every changed path (`ipcSchemaSnapshot.json` is prettier-ignored, so no check is carried for it).

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
