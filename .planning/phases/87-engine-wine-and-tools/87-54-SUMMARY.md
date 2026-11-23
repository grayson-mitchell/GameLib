---
phase: 87-engine-wine-and-tools
plan: 54
subsystem: engine
tags: [rust, shims, rustinvoke, steam-bridge, launch-deadline, engine-state, facts-resolver, d-03, d-15, d-17]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the Rust decision, deadline and engine-state ops (87-45 to 87-51), the launch shims and the getEngineState resolver (87-52), the dialog ack forwarding (87-53)
provides:
  - src/backend/enginewine/decision.ts shims decideLaunchEngine, decideCreationEngine, preflightCrossover, isCrossoverMissing (schedule rows, deletedBy 96) and the CrossoverPreflight, LaunchDecision and CreationDecision types
  - src/backend/enginewine/state.ts shims recordLaunchDecision (96), publishOverlayNotice and publishOverlayExitNotice (97)
  - src/backend/enginewine/deadline.ts shims armBridgeDeadline and cancelBridgeDeadline (96), the bridgeDeadlines callback view and registerEngineDeadlineFired (wiring of the armBridgeDeadline row)
  - rustInvoke channels engine_decide_launch, _decide_creation, _preflight_crossover, _is_crossover_missing, engine_cx_resolve_bin_dir (arm only, its shim is 87-55's), engine_state_record_decision, _publish_overlay_notice, _publish_overlay_exit_notice, engine_deadline_arm, _cancel
  - the shell-to-sidecar frame engineDeadlineFired {key, reason} (schema, caller shell, not renderer-sendable)
  - steamEngineDeps.ts as a facts resolver (steamEngineFacts, steamWineBinHints, steamEngineStateFacts)
affects: [87-55, 87-56, 96, 97, 98]

actuals:
  tokens: 23000
  tasks: 2
  commits: 2

plan_head_before: 02618a3337178744216989ba852dfa241b9bfd5c
plan_head_after: 027199e5da357e6df596b39921b04adca41fe979

tech-stack:
  added: []
  patterns:
    - "the facts a TS decision read through callbacks (stored override, monitor phase, wine-binary hints, the bridge's bottle and eligibility) are gathered into one value by the Steam adapter and travel as the op's arguments; no Rust code calls TS for state"
    - "a Rust-to-TS signal (the bridge deadline) is one shell-originated frame that a registered listener dispatches to a callback map the bridge filled when it armed: validated again in the listener, unknown keys ignored, never renderer-sendable"
    - "a shim returns unknown (its body is one call); the call site narrows the reply through engineDecisionReply.ts rather than casting"

key-files:
  created:
    - src/backend/enginewine/decision.ts
    - src/backend/enginewine/state.ts
    - src/backend/enginewine/deadline.ts
    - src/backend/storeManagers/steam/engine/engineDecisionReply.ts
    - src/backend/storeManagers/steam/engine/bridgeDeadline.ts
    - src/backend/enginewine/__tests__/decisionShim.test.ts
    - src/backend/enginewine/__tests__/stateShim.test.ts
    - src/backend/enginewine/__tests__/deadline.test.ts
    - src/backend/storeManagers/steam/__tests__/engineDecisionReply.test.ts
    - src/backend/storeManagers/steam/__tests__/bridgeDeadline.test.ts
  modified:
    - src/backend/storeManagers/steam/engine/steamEngineDeps.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/gameBridgeLaunch.ts
    - src/backend/storeManagers/steam/gameBridgeWineLaunch.ts
    - src/backend/storeManagers/steam/gameEngineDialogs.ts
    - src/backend/storeManagers/steam/gameInstallBridge.ts
    - src/backend/storeManagers/steam/gameLaunchOverlay.ts
    - src/backend/engine/engineDecision.ts
    - src/backend/engine/launchDeadline.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/common/types/engine.ts
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/ipc/sidecarInternal.ts
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs

key-decisions:
  - "The five engine decision ops were added with the tracer, and so were the three state writes and every decision caller. The plan put the other callers and the state shims in Task 2, but src/backend/storeManagers/steam/__tests__/games.test.ts mocks the decision module once and is at its jest.mock ceiling (a ratchet that only shrinks), so a half-migrated file would have needed a second mock. Task 2 is the deadline."
  - "armBridgeDeadline takes {key} and cancelBridgeDeadline {key, reason}: the Rust ops have no `kind` (the bridge kind is fixed) and take a closed cancel reason. The plan's {key, kind} would be refused by the strict decode."
  - "The handle a launch reads synchronously (`deadline.state`, `deadline.cancel(reason)`) is built outside enginewine/ (steam/engine/bridgeDeadline.ts), because a shim body must stay one returned call and the module's callbacks are reached through the shim module object, which is what lets a test spy them."
  - "A handle superseded by a new arm for the same key is marked cancelled in TS only. Rust supersedes its own deadline at the arm, and a cancel op sent for the old one could reach Rust after (or race with) the new arm and stand the new deadline down."
  - "A refused arm (bad key, shutdown) stands the handle down and resolves it: the launch carries on with no deadline, as it ran before a deadline existed, rather than failing for it."
  - "A reply that is not a well-formed decision or pre-flight throws (engineDecisionReply.ts) instead of letting a launch run on a guess. isCrossoverMissing is the exception: only `true` counts, as the TS (an unknown never refuses, G25)."
  - "engine_decide_launch and engine_preflight_crossover join the sidecar's unbounded list: two 15 s demo-status probes, a 2 s settle and a capped wineserver stop after each can pass the generic 60 s cap, and the TS they replace had no cap. Their sub-steps carry their own limits in Rust and the app shutdown ends them."
  - "The bridgeDeadlines Map is sanctioned module state (moduleStateCensus, one site, deleted in 96) on the precedent of engineSelectionView."
  - "The record, the notices and the deadline arm are awaited with the failure logged; none fails a launch that is otherwise ready."

patterns-established:
  - "a shim file that hands out a Rust-owned type also owns the type (decision.ts defines CrossoverPreflight, LaunchDecision, CreationDecision; the still-TS engineDecision.ts re-exports them until 87-56)"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "D-03 and D-15: the Steam bridge's launch decision, creation decision, CrossOver pre-flight and missing check are made in Rust from TS-gathered facts through four scheduled shims, with every call site listed below; steamEngineDeps.ts is a facts resolver with no callbacks"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/enginewine/__tests__/decisionShim.test.ts, src/backend/storeManagers/steam/__tests__/engineDecisionReply.test.ts, src/backend/storeManagers/steam/__tests__/games.test.ts (772)"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts (shape, callers and discovery for the four rows)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-03: the Steam launch records its decision in Rust (the engine badge reads the same state), and the overlay setup and exit notices are pushed from Rust; the 87-52 transitional gap is closed"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/enginewine/__tests__/stateShim.test.ts, games.test.ts (recordLaunchDecision, publishOverlayNotice and publishOverlayExitNotice cases through the spied shims)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-17: a bridge launch's deadline is armed in Rust; when it fires Rust sends engineDeadlineFired {key, reason} and registerEngineDeadlineFired dispatches it to the callback the bridge stored when it armed; arm, fire, cancel and an unknown key are tested, and the channel is not renderer-sendable"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/enginewine/__tests__/deadline.test.ts (12 cases), src/backend/storeManagers/steam/__tests__/bridgeDeadline.test.ts (6), games.test.ts 'launch deadline' (11, driven by a fake Rust deadline on the fake clock)"
        status: pass
      - kind: unit
        ref: "src/backend/sidecar/__tests__/rendererAllowList.test.ts#engineDeadlineFired, src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Twelve rustInvoke channels and the engineDeadlineFired frame are in the IPC contract: strict one-object decode, shell arms, the generated contract current, channel counts 173 -> 183"
    requirement: SVC-02
    verification:
      - kind: other
        ref: "pnpm check:ipc-contract; cargo test --bin gamelib-shell engine_dispatch (30, every arm in the bad-args and not-ready loops); rustInvokeSchemas.test.ts (183 channels); tauriShellSource.test.ts (183 arms)"
        status: pass
    human_judgment: false
  - id: D5
    description: "After this plan no storeManagers or appshell file imports the TS engine decision, deadline or state module"
    requirement: SVC-02
    verification:
      - kind: other
        ref: "grep -rlE \"engine/(launchDeadline|engineState|engineDecision)'\" src/backend/storeManagers src/backend/appshell | grep -v __tests__ | wc -l == 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "A real Steam bridge launch on a Mac (a healthy CrossOver launch, a fallback-engine launch with its toast, a deadline that fires with no game process, an overlay setup failure, an overlay exit notice, and the engine badge after each) runs through the new path in the built app"
    verification: []
    human_judgment: true
    rationale: "The tests use fake transports, spied shims and a fake Rust deadline; no running app was driven. The Rust ops are covered by the crate's own tests, but the wire from a real sidecar to a real Rust deadline firing engineDeadlineFired is not asserted end to end. The live gate after the switch-over is the phase's live-gate item 1."

duration: 100 min (approximate, host clock 16:15 to 18:00 UTC, 2026-11-23)
completed: 2026-11-24
---

# Phase 87 Plan 54: Steam bridge decisions, deadlines and state writes reach Rust Summary

**The Steam bridge makes its launch and creation engine decisions, its CrossOver pre-flight, its decision record and its overlay notices in Rust through seven scheduled shims, and its launch deadline is Rust's timer, delivering `engineDeadlineFired` to the callback the bridge stored when it armed, with `steamEngineDeps` reduced to a facts resolver.**

## Performance

- **Duration:** about 100 min
- **Tasks:** 2 (tracer, auto)
- **Commits:** 2 (measured from the ledger base `02618a333`)
- **Files modified:** 36 (10 created)

## Accomplishments

- **Task 1 (tracer):** `enginewine/decision.ts` and `state.ts` shims; eight rustInvoke channels with shell arms (decision ops, the bin-dir arm for 87-55, and the three state writes); `steamEngineFacts` gathers the stored override, the monitor phase and the wine-binary hints; `engineDecisionReply.ts` narrows the replies; every Steam caller of the decision, the pre-flight, the missing check and the state writes calls a shim. The Steam launch records its decision in Rust, so the engine badge and the bridge agree. The tracer's `<verify>` is automated only, so no checkpoint was synthesized: the full verify list was re-run green before Task 2 started.
- **Task 2:** `enginewine/deadline.ts` (arm and cancel shims, the `bridgeDeadlines` callback view, `registerEngineDeadlineFired`), `steam/engine/bridgeDeadline.ts` (the handle the launch reads synchronously), the `engineDeadlineFired` frame schema (shell caller), the listener registered once from `handlers.ts`, `LAUNCH_DEADLINE_MS` in `common/types/engine.ts`.

## Task Commits

1. **Task 1 (tracer): decisions, pre-flight and state writes through shims** - `cd40a6f6e` (feat)
2. **Task 2: deadlines through the Rust event** - `027199e5d` (feat)

## Call sites and their ripple (D-03, D-15)

Every site was already inside an async function, so none needed an enclosing function made async. The one exception is `notifyOverlaySetupFailed`, which was sync and is now `async`; its seven callers (three in `gameLaunchOverlay.ts`, two in `gameLaunch.ts`, two in `gameBridgeWineLaunch.ts`) were all inside async functions and now `await` it.

| Shim | Site | Resolution |
| --- | --- | --- |
| `decideLaunchEngine` | `gameLaunch.ts` `selectLaunchEngine` | `launchDecisionFrom(await decideLaunchEngine(deps, {key, bottleName, ...steamEngineFacts(deps, appId)}))` |
| `decideLaunchEngine` | `gameInstallBridge.ts` `resolveInstallEngineSettings` | the same, with the bridge bottle name |
| `decideCreationEngine` | `gameInstallBridge.ts` inline provisioning | `creationDecisionFrom` unwraps `{decision, createCapMs}` |
| `preflightCrossover` | `gameLaunch.ts` bottled Steam launch | `preflightFrom(...)` with `steamWineBinHints(deps)`; no key (the bottled client has none) |
| `preflightCrossover` | `gameBridgeLaunch.ts` DRM launch | `preflightFrom(...)` with the title's hints |
| `isCrossoverMissing` | `gameLaunch.ts` offline pre-check | only `true` refuses (an unknown never does, G25) |
| `isCrossoverMissing` | `gameEngineDialogs.ts` `drmOfflinePrecheck` | the same |
| `recordLaunchDecision` | `gameLaunch.ts` `selectLaunchEngine` | awaited in try/catch: a refused record logs a warning and the launch goes on; facts from `steamEngineStateFacts` |
| `publishOverlayNotice` | `gameLaunchOverlay.ts` `notifyOverlaySetupFailed` | awaited in try/catch; the OS notification goes out either way |
| `publishOverlayExitNotice` | `gameBridgeWineLaunch.ts` | the sync grace-timer path now starts `reportOverlayExit()` (not awaited by its caller); the in-app push precedes the OS notification inside it |
| `armBridgeDeadline` / `cancelBridgeDeadline` | `gameBridgeWineLaunch.ts` through `steam/engine/bridgeDeadline.ts` | the callback is stored, then the arm awaited; the nine `deadline?.cancel(...)` sites are unchanged because the handle keeps `state` and `cancel` |
| `LAUNCH_DEADLINE_MS` | `gameLaunch.ts` `onBridgeLaunchDeadline` | imported from `common/types/engine` |

**A2 (the `pushed` boolean) is confirmed log-only:** both notice call sites only write it into a `pushed=` log line; nothing branches on it.

`steamDecisionServices`, `steamDecisionDeps`, `steamEngineStateDeps` and `getSteamEngineState` are deleted from `steamEngineDeps.ts` (no caller was left; `getSteamEngineState` had none). `steamEngineStateFacts` now computes the facts directly instead of building the TS engine state's callback deps, so the module no longer imports `engine/engineState` or `engine/engineDecision`. `handlers.ts` passes it only `{stores, paths}`.

`bridgeBottle.ts` and `bridgeWineTools.ts`, listed in the plan, needed no change: they read only `engineSelectionView`, not the decision, deadline or state modules.

## Log lines that no longer reach gamelib.log

The shell has no `EngineLog` (`ctx.log` is `None`), so lines Rust writes through it go nowhere. The user-relevant Steam-path lines the TS writers used to produce and that stopped when their caller moved:

- `Engine: key <appId> bottle creation engine <kind> (presence check only; ...)` (the creation decision). `SteamGame: bridge bottle creation engine for appId <id>: <kind>` is still written by the caller.
- `Engine: --demo-status <reason> for bottle <name> (attempt n/2); inconclusive, retrying once` and `Engine: could not stop wineserver after a failed probe: <error>` (the G29 retry and the failed-probe cleanup, for the bottled Steam and DRM pre-flights and the launch decision). The decision's own `logLines` (engine, version, untested build) are still written by `selectLaunchEngine`.
- `Engine: launch deadline fired for key <k> after <n> ms (no game process seen)`. `SteamGame: appId <id> launch deadline fired (<engine>); stopping the bottle` is still written by `onBridgeLaunchDeadline`.
- `Engine: engine state publisher failed`, `overlay notice publisher failed`, `overlay exit notice publisher failed` (a publish failing inside Rust; the caller's `pushed=false` line is still written).

Kept TS-side on purpose: `Engine: launch deadline for key <k> cancelled (<reason>)` (written by the handle's cancel) and `no process monitor started; launch deadline stood down (monitor-unavailable)` (passed in by the launch). If an engine log is wired into gamelib.log later, the cancel line would then be written twice (once here, once by Rust); whoever wires it drops this one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 took every decision caller and the three state shims**
- **Found during:** Task 1
- **Issue:** `games.test.ts` mocks the decision module once and sits at its jest.mock ceiling, so repointing only `gameLaunch.ts`'s decision call in the tracer would have left half the file on `engine/engineDecision` and the other half on the shim, needing a second mock the ratchet forbids. `steamEngineStateDeps` also spread the decision deps, so deleting them and keeping the state record in TS could not both hold.
- **Fix:** all decision callers, the state shims and the facts-resolver cleanup landed in Task 1; Task 2 holds the deadline. The mock was repointed (`backend/enginewine/decision`), the state and deadline shims are spied, not mocked, so the file's jest.mock count is unchanged (1691).
- **Commit:** `cd40a6f6e`

**2. [Rule 1 - Bug in the plan] `armBridgeDeadline(deps, {key, kind})` and `cancelBridgeDeadline(deps, key)`**
- **Issue:** the Rust ops take `{key}` and `{key, reason}`; a `kind` field is refused by the strict decode and the cancel needs the closed reason.
- **Fix:** `armBridgeDeadline(deps, {key})`, `cancelBridgeDeadline(deps, {key, reason})`.
- **Commit:** `027199e5d`

**3. [Rule 2 - Missing critical] Two channels need no 60 s cap**
- **Issue:** `engine_decide_launch` and `engine_preflight_crossover` can run two 15 s probes with a capped wineserver stop after each (about 62 s worst case), more than the sidecar's generic cap; the TS had none.
- **Fix:** both joined `UNBOUNDED_RUST_CHANNELS` with the reason in the file comment and in `dialogOptionForwarding.test.ts`.
- **Commit:** `cd40a6f6e`

**4. [Rule 3 - Blocking] Files outside the plan's list**
- `steam/engine/engineDecisionReply.ts` and `steam/engine/bridgeDeadline.ts` (new: a shim body is one call, so reply narrowing and the deadline handle cannot live in the shims), `common/types/ipc/sidecarInternal.ts` (the frame's schema and its shell caller), `sidecar/sidecarRpc.ts`, `engine/engineDecision.ts` (takes its three types from `decision.ts`), `engine/launchDeadline.ts` (re-exports the constant), `sidecar/handlers.ts`, and the tests that pin the changed shapes: `moduleStateCensus` (the sanctioned `deadline.ts` Map), `dialogOptionForwarding`, `rendererAllowList`, `ipcSchemas/sidecarInternal`, `rustInvokeSchemas`, `tauriShellSource`, plus `engine_dispatch.rs`, which holds the shell arms the plan lists under `rust_dispatch.rs`.
- **Commits:** `cd40a6f6e`, `027199e5d`

**5. Acceptance criterion `grep -c RUST_ENGINE_DECIDE_LAUNCH decision.ts == 1` reads 2**
- A shim file imports the constant and uses it, which is two lines; every other shim file (`launch.ts`, `bottles.ts`) reads the same. The substance of the criterion (the constant is the channel the shim sends) holds. All other acceptance criteria pass: the storeManagers and appshell import grep is 0 (was 6) and `deadline.test.ts` has 12 cases.

**Total deviations:** 5 (1 Rule 1, 1 Rule 2, 2 Rule 3, 1 criterion note). **Impact:** none on the goals.

## Issues Encountered

- `git restore` of two files (to take Task 1's `steamEngineDeps.ts` back to a clean base) ran the post-checkout `pnpm i` hook once; it found nothing to download.
- `STATE.md` and `ROADMAP.md` carried another session's uncommitted planning edits (the phase 90 split), which are not part of this plan's changes.

## Known follow-ups

- **Wine tools during a live fallback-engine launch (carry-forward from 87-52, still open).** `engine/toolSettings.ts`, `services/winetricksTarget.ts` and `gameCommandFacts.ts` still read the TS registry and overlay. This plan did not touch them. The Rust `tool_settings` sees the live selection; whoever switches those readers closes it (not named in 87-55 or 87-56).
- **The `engine_cx_resolve_bin_dir` channel and its shell arm exist with no shim**: its first shim (`resolveCrossoverBinDir`) is 87-55's, with the seven call sites it names.
- Still-live TS engine modules until 87-56: `bottleLedger`, `engineRegistry`, `perGameBottle`, `gamePrefix`, `pinEngine.ts`, `fallbackEngine.ts`, `engineState.ts`, `toolSettings.ts`, plus `engineDecision.ts` and `launchDeadline.ts`, which now have no Steam caller.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-87-55 (spoofing, `engineDeadlineFired`): mitigated. The frame is a shell-caller send channel absent from the renderer allow-list (`rendererAllowList.test.ts`), is validated again in the listener (strict object, one reason word), and the callback map holds only keys the bridge armed, so a frame for an unknown, fired or cancelled key is ignored. T-87-SC accepted: no new package.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

87-55 can add the `resolveCrossoverBinDir` shim over the arm that is already in the shell, move `RunTool` and the engine types to `common/types/engine`, and repoint the remaining consumers; it edits `decision.ts`, so it can import the types defined there. After it, `src/backend/engine` has no live caller outside what 87-56 deletes.

## Self-Check: PASSED

- Commits `cd40a6f6e` and `027199e5d` are ancestors of HEAD; `commits: 2` measured from the ledger base `02618a333`.
- Created files exist: the five source files and five test files listed in the frontmatter.
- Acceptance: the storeManagers and appshell engine-import grep is 0; `pnpm exec jest src/backend src/common` (632 suites, 14,897 tests), `pnpm codecheck`, `pnpm check:ipc-contract`, `pnpm backend-di-ceilings` (jestMock 1691, unchanged), `cargo test --bin gamelib-shell engine_dispatch` (30) and `rustfmt --check` on the two shell files pass; `npx prettier --check` passes over every changed path (`ipc_contract.rs` and `ipcSchemaSnapshot.json` are generated and ignored).

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
