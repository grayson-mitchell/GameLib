---
phase: 87-engine-wine-and-tools
plan: 35
subsystem: wine
tags: [winetricks, resolvers, d-23, d-14, d-15, d-06, native-channel, rustinvoke, shim, sidecar]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the winetricks catalog, install and apply guard (87-32); the apply queue and its quit contract, ops wine_winetricks_apply, _queue_state and _cancel_remaining (87-33); the first D-23 resolvers, the shell's host facts and the tools shim file (87-34)
provides:
  - winetricksQueueState and winetricksCancelRemaining as native wine-slice channels ([runner, appName], the runner enum, fixed-literal rejections) over the Rust queue
  - RUST_WINE_WINETRICKS_APPLY, _AVAILABLE, _INSTALLED, _INSTALL and _LIST_INSTALLED with zod, generated contract and rust_dispatch arms (apply, available and install unbounded in the sidecar); the shell adds the wine host facts
  - winetricksApply, winetricksAvailable and winetricksInstalled resolvers in engineWineResolvers.ts (deletedBy 98)
  - winetricksInstallVerbs and winetricksListInstalled shims in enginewine/tools.ts (deletedBy 88), used by the launcher and the Steam bridge's known fixes
  - services/winetricksTarget.ts, the one place TypeScript decides which Wine environment a game's Winetricks calls act on
affects: [87-36, 87-37, 87-56]

actuals:
  tokens: 23300
  tasks: 2
  commits: 2

plan_head_before: 3f944a40cab458c444c7de2bfa8828c87baefe3e
plan_head_after: f6c30810c20e131f5780960e5f27be5f5963e009

tech-stack:
  added: []
  patterns:
    - "a Winetricks resolver gathers the game's Wine environment as one const (the tool settings, or the reason there are none) and makes exactly one typed call; the environment decision stays in TypeScript (services/winetricksTarget.ts) until the config and engine state it reads move in Phase 98"
    - "the shell supplies the wine host facts to every Winetricks arm, so the sidecar's tuple carries only the target and the verbs"
    - "a list of verbs installs in the shell arm one verb after another (a verb that is no verb counts as failed and never reaches the crate), so the shim stays one returned call"

key-files:
  created:
    - src/backend/services/winetricksTarget.ts
    - src/backend/enginewine/__tests__/winetricksShim.test.ts
  modified:
    - src-tauri/src/wine_dispatch.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/wineTools.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/common/types/sidecarTransport.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/sidecar/engineWineResolvers.ts
    - src/backend/sidecar/wineToolsFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/enginewine/tools.ts
    - src/backend/launcher.ts
    - src/backend/storeManagers/steam/bridgeKnownFixes.ts
    - src/backend/services/toolsFrom.ts

key-decisions:
  - "The shell, not the sidecar, supplies the wine host facts (process environment, Darwin release) to every Winetricks arm, as for DXVK in 87-34; the zod tuples are the target (and verbs) only"
  - "The TS decision of which Wine environment a game's tools act on stays TypeScript: services/winetricksTarget.ts is the old resolveGameToolSettings (Steam bottle resolver, or engine/toolSettings) answering settings or an unavailable reason, and it never throws (a resolver failure is logged and reads as unavailable, so a catalog read still answers the empty list the TS handler's swallow gave)"
  - "The apply and the catalog read resolve with ensureBottle true (a verb is a need that creates the bottle); the installed-list read with false"
  - "winetricksInstallVerbs takes the whole verb list in one call and the shell arm installs them one after another, so the shim is one returned typed call and the launcher's and the bridge's loops keep their sequential, failure-tolerant behaviour"
  - "The launcher passes its launch settings (the live engine selection already overlaid) as the target; this is what resolveToolSettings returned for it during a launch"
  - "The Steam bridge's known fixes (bridgeKnownFixes.ts) were routed to the new install shim inside this plan, so no Winetricks caller builds the TS tools any more"
  - "No in-process hook for the winetricks/done game status: nothing in the sidecar listens for gameStatusUpdate on the in-process bus (the only emitter is sendGameStatusUpdate, with no subscriber), so the Rust push is all there is to hear"

patterns-established:
  - "a native queue channel decodes [runner, appName] before the context is looked at, so a bad call is rejected the same way before and after the install and a rejection never echoes the value"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "winetricksQueueState and winetricksCancelRemaining are native wine channels over the Rust queue: [runner, appName] with the runner enum and a bounded non-empty appName decode first, a rejection is a fixed literal that never echoes the value, a game with no run answers an idle state, and no sidecar handle or zod key remains"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell wine_dispatch (a_queue_key_is_a_runner_and_a_non_empty_app_name..., the_queue_channels_answer_the_one_queue_over_a_real_context...), native_manifest_vectors_valid_accept_invalid_reject"
        status: pass
      - kind: unit
        ref: "src/backend/sidecar/__tests__/wineToolsFlows.test.ts (the Winetricks family is registered elsewhere, never here), nativeChannelOwnership.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "winetricksApply, winetricksAvailable and winetricksInstalled are resolvers: each gathers the game's Wine environment as one const (bottle-creating for apply and the catalog, not for the installed read) and makes one typed call whose channel and arguments are pinned; the verbs reach the Rust guard exactly as the renderer sent them; a Rust refusal reaches the renderer"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/engineWineResolvers.test.ts"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts (shape, channel, callers and deletedBy of every row)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The five Rust arms validate their arguments before the context is looked at (a target object, a verb list of at most 1024 strings), add the shell's own host facts, answer not-ready before the install, and the install arm answers one outcome word per verb with a verb that is no verb counted as failed without reaching the crate"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell wine_dispatch (the_winetricks_apply_arm..., the_catalog_arms..., the_install_arm...); the whole bin suite (826 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The launcher's known-fix install and installed-packages log line and the Steam bridge's winetricks known fixes call the winetricksInstallVerbs and winetricksListInstalled shims with the settings and ids they hold; no Winetricks call builds the TS tools; the launcher and bridge tests, and the schedule rows (shims, deletedBy 88), pass"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/enginewine/__tests__/winetricksShim.test.ts, steamBridgeKnownFixes.test.ts, launcher.engineStep.test.ts, launcher_launchSingleFlight.test.ts, engineWineShimSchedule.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "A Winetricks apply from the Wine settings screen on a real prefix runs through the Rust queue, the screen reads that same queue, a launch installs its known-fix verbs, and the queue events (winetricksQueueChanged, progressOfWinetricks, installing-winetricks-component) reach the renderer"
    verification: []
    human_judgment: true
    rationale: "No test starts the app, a sidecar, the renderer and a real winetricks together; the ops are proven by the crate's goldens (87-32, 87-33), the arms and channels by unit tests, and the resolver's environment decision by its TS tests, but the wiring needs one run on a Mac or Linux machine (live-gate item 4)"

duration: 12min
completed: 2026-11-23
---

# Phase 87 Plan 35: The Winetricks family flips to Rust Summary

**The queue's state and cancel are native wine channels, apply, available and installed are D-23 resolvers over five new Rust arms, and the launcher and the Steam bridge's known fixes install and list Winetricks packages through two shims, so the renderer reads the one Rust queue it applies through and no live path runs the TS Winetricks code.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-23T10:53:39Z
- **Completed:** 2026-11-23T11:06Z
- **Tasks:** 2 of 2
- **Files:** 2 created, 18 production files modified, plus 14 test and census files

## Accomplishments

- **Tracer (Task 1):** a Winetricks apply end to end. `winetricksApply` resolves the game's Wine environment, makes one typed call on `RUST_WINE_WINETRICKS_APPLY` (the shell adds the wine host facts), and the crate's apply guard and queue run it; `winetricksQueueState` and `winetricksCancelRemaining` answer from the same queue as native `wine` channels. The three sidecar handles, the two zod keys and the TS queue wiring left `wineToolsFlowRegistration.ts` in the same commit. The tracer gate (automated-only verify) was re-run and passed before Task 2.
- **The resolvers and the environment decision:** `winetricksAvailable` and `winetricksInstalled` landed in the tracer commit beside apply, since a TS catalog read beside a Rust queue would have broken D-06 for the renderer. The decision of which bottle or prefix a game's tools act on (`services/winetricksTarget.ts`) is the old `resolveGameToolSettings`, answering settings or an `unavailable` reason as Rust's target; the Steam bottle resolver stays the entry for a bottle-runtime store.
- **The five arms:** `rpc_wine_winetricks_apply`, `_available`, `_installed`, `_install` and `_list_installed` decode strictly, add `wine_run_host()`, and answer `<op>:not-ready` before the install. `_install` takes a target and a verb list and installs the verbs one after another, answering one outcome word per verb.
- **The shims (Task 2):** `winetricksInstallVerbs` and `winetricksListInstalled`, each one returned call. The launcher's known-fix install and installed-packages log line use them with the launch settings; `bridgeKnownFixes.ts` uses the install shim with the bridge bottle's settings, which removed its last `toolsFrom` use.
- **Schedule and census:** rows for the three resolvers (deletedBy 98) and the two shims (deletedBy 88); the `dxvkInstallRemove` row's callers now include `bridgeKnownFixes.ts`. The registration, return-value, domain, runner-slice, schema and unbounded-channel censuses and the shell's arm count (154) follow the moved channels.

## Task Commits

1. **Task 1 (tracer): a Winetricks apply from the renderer end to end through Rust, the queue's state and cancel native, three D-23 resolvers** - `71f9ea950` (feat)
2. **Task 2: winetricksInstallVerbs and winetricksListInstalled shims for the launcher and the Steam bridge's known fixes** - `f6c30810c` (feat)

## Verification

- Task 1 chain: `cargo test --bin gamelib-shell` (826 passed, which includes `native_manifest_vectors_valid_accept_invalid_reject` and every `wine_dispatch` test), `rustfmt --edition 2021 --check` over the three shell files, `pnpm check:ipc-contract` (current), the plan's jest list, `pnpm codecheck`, prettier over the written paths (none ignored). The plan's `cargo test --bin gamelib-shell rust_dispatch` filter matches no test (the file has none; its arms are proven by `wine_dispatch` tests and `tauriShellSource.test.ts`), so the whole bin suite was run instead.
- Task 2 chain: the plan's jest list (launcher.engineStep, launcher_launchSingleFlight, steamBridgeKnownFixes, the shim and schedule tests), `pnpm check:ipc-contract`, `pnpm codecheck`, prettier over the written paths.
- Whole `src/backend` and `src/common` jest tree: 646 suites, 15430 passed (the one failing source-text gate, `winetricksInstallPathInvariant`, was updated and passes).
- Acceptance: the non-comment counts of `'winetricksQueueState'`, `'winetricksApply'` and `'winetricksInstalled'` in `wineToolsFlowRegistration.ts` are 0; `grep -c winetricksInstallVerbs launcher.ts` is 2 (>= 1).
- Not run: a live apply or launch on a real prefix (coverage D5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The Winetricks target resolution needed a home**
- **Found during:** Task 1
- **Issue:** the Rust ops take the game's tool settings as a target, but which Wine environment a game's tools act on was a private function of `tools/index.ts` (`resolveGameToolSettings`), which 87-37 deletes, and `enginewine/` may export only scheduled rows. The resolvers could not call it, and no file in the plan's list held it.
- **Fix:** new `src/backend/services/winetricksTarget.ts` (`resolveWinetricksTarget`, the same Steam-bottle-or-`resolveToolSettings` decision, never throwing); `handlers.ts` builds the engine-services source from the boot services and injects it into the resolvers as `winetricksTarget`, so `engineWineResolvers.ts` imports only types.
- **Files modified:** `src/backend/services/winetricksTarget.ts` (new), `src/backend/sidecar/handlers.ts`, `src/backend/sidecar/engineWineResolvers.ts`
- **Commit:** `71f9ea950`

**2. [Rule 3 - Blocking] The three resolvers landed in Task 1, not two of them in Task 2**
- **Found during:** Task 1
- **Issue:** the plan splits the resolvers (`winetricksApply` in the tracer, `winetricksAvailable` and `winetricksInstalled` in Task 2), but a TS catalog read beside a Rust queue is the TS-and-Rust split D-06 forbids, and the contract regenerates once for the whole family.
- **Fix:** all three resolvers, their constants and arms, and the two shim channels (`RUST_WINE_WINETRICKS_INSTALL`, `_LIST_INSTALLED`) landed in the tracer commit; Task 2 holds the shims, the launcher and the bridge. Both tasks' acceptance criteria hold.
- **Commit:** `71f9ea950`

**3. [Rule 3 - Blocking] The install shim takes the verb list, not one verb**
- **Found during:** Task 2
- **Issue:** `wine_winetricks_install` takes one verb, while the plan's shim is `winetricksInstallVerbs(..., verbs)` and the schedule pins a shim to one returned call.
- **Fix:** the shell's `rpc_wine_winetricks_install` takes `[target, verbs]` and installs one after another, answering one outcome per verb; a verb that is no verb is `failed` without reaching the crate. The crate is unchanged.
- **Files modified:** `src-tauri/src/wine_dispatch.rs`
- **Commit:** `71f9ea950`

**4. [Rule 3 - Blocking] Files outside the plan's list**
- **Found during:** Tasks 1 and 2
- **Issue:** the unbounded channels need `sidecarRpc.ts` (and the `dialogOptionForwarding` pin), the moved channels moved census pins (`flowRegistrationCensus`, `ipcDomainCensus`, `invokeReturnValueSweep`, `runnerSliceRegistration`, `rustInvokeSchemas`, `tauriShellSource`, `ipcSchemas/wineTools`), the Steam bridge's known fixes still built Winetricks through `toolsFrom` (the carry-forward from 87-34), and the TS-queue source gate `winetricksInstallPathInvariant` named the launcher and the bridge as callers of `Winetricks.install(`.
- **Fix:** each edited in the same commit as the change that needs it. The bridge was routed to the new install shim; the gate now allows `Winetricks.install(` only in the dead TS queue and points its non-vacuity check at the resolvers file.
- **Commit:** `71f9ea950`, `f6c30810c`

---

**Total deviations:** 4 auto-fixed (4 blocking)
**Impact on plan:** one new small module and extra census pins; the plan's channel set, rows and ordering hold.

## Behaviour notes (parity differences)

- The apply resolves the game's Wine environment once, at apply, and every verb of the run uses it (87-33 recorded the same for the crate); the TS resolved per verb.
- A resolver failure in the environment decision answers `unavailable` (logged), where the TS `winetricksInstalled` handler would have let a thrown error reach the renderer; the catalog read swallowed every error in the TS too.
- The launcher passes its launch settings as the target; the TS `Winetricks.install` re-resolved through `resolveToolSettings`, which during a launch returned these same overlaid settings.

## Issues Encountered

None.

## Known Stubs

None.

## What remains for 87-36 and 87-37 (the carry-forward from 87-34)

- `src/backend/services/toolsFrom.ts` still exists. Its only live caller is `launcher.ts`'s known-fix `runInPrefix` step (`runWineCommandOnGame`), which 87-36 flips; nothing else imports it now. `bridgeKnownFixes.ts` no longer does (done in this plan), so 87-36 can drive the launcher's `toolsFrom` count to 0 and 87-37 can delete the file with the TS tools.
- The TS `Winetricks` object, its queue (`tools/winetricksQueue.ts`, still built by the `winetricks-queue` boot step) and its environment reports have no live caller or registration; 87-37 deletes them, together with `winetricksInstallPathInvariant.test.ts` and the `winetricksQueue` field of `BootServices`.
- `winetricksTarget.ts` imports `engine/toolSettings` and the Steam bottle resolver; those go when the engine TS goes (87-56) and the config moves (Phase 98), at which point the target is built in Rust.

## Threat Flags

None. T-87-79 is mitigated as planned: the Rust apply guard (verb shape, bounded count) runs before any verb reaches an argv, the resolvers pass values only, and the install arm refuses a verb that is no verb in the shell before the crate sees it. T-87-80 is mitigated: the queue channels decode `[runner, appName]` with the runner enum and fixed-literal rejections (manifest invalid vectors prove them), and the five `rustInvoke` tuples reach the crate's strict `TargetArg` (deny_unknown_fields). No new endpoint, path or trust boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 87-36 flips the wine-command family (`runWineCommand`, `runWineCommandForGame`, `callTool`) the same way and removes the launcher's last `toolsFrom` use.
- 87-37 deletes the TS tools and the TS queue with their gates.
- `graphify update .` was run.

## Self-Check: PASSED

- FOUND: `src/backend/services/winetricksTarget.ts`, `src/backend/enginewine/__tests__/winetricksShim.test.ts`, `src/backend/sidecar/engineWineResolvers.ts`, `src/backend/enginewine/tools.ts`
- FOUND: `71f9ea950`, `f6c30810c` (ancestors of HEAD; `git rev-list --count` from the plan ledger is 2)
