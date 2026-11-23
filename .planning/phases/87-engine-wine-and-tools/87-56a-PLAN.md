---
phase: 87-engine-wine-and-tools
plan: 56a
type: execute
wave: 36
depends_on: ["87-56"]
files_modified:
  - src-tauri/crates/gamelib-engine/src/tool_settings.rs
  - src-tauri/crates/gamelib-engine/src/lib.rs
  - src-tauri/crates/gamelib-engine/tests/golden_config.rs
  - src-tauri/src/engine_dispatch.rs
  - src-tauri/src/ipc_contract.rs
  - src/common/types/sidecarTransport.ts
  - src/common/types/ipc/rustInvoke.ts
  - src/common/types/ipc/ipcSchemaSnapshot.json
  - src/common/types/engine.ts
  - src/backend/sidecar/sidecarRpc.ts
  - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/__tests__/dialogOptionForwarding.test.ts
  - src/backend/enginewine/toolSettings.ts
  - src/backend/enginewine/fallback.ts
  - src/backend/enginewine/__tests__/toolSettingsShim.test.ts
  - src/backend/enginewine/__tests__/fallbackShim.test.ts
  - src/backend/services/winetricksTarget.ts
  - src/backend/services/__tests__/winetricksTarget.test.ts
  - src/backend/services/gameCommandFacts.ts
  - src/backend/services/__tests__/gameCommandFacts.test.ts
  - src/backend/storeManagers/steam/bridgeWineTools.ts
  - src/backend/storeManagers/steam/__tests__/bridgeWineTools.test.ts
  - src/backend/storeManagers/steam/engine/steamEngineDeps.ts
  - src/backend/storeManagers/steam/__tests__/steamEngineDeps.test.ts
  - src/backend/storeManagers/steam/engine/pinnedEngine.ts
  - src/backend/storeManagers/steam/__tests__/pinnedEngine.test.ts
  - src/backend/storeManagers/steam/gameInstall.ts
  - src/backend/storeManagers/steam/gameLaunch.ts
  - src/backend/storeManagers/steam/gameEngineDialogs.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/stores/__tests__/settingsFamily.test.ts
  - src/backend/__tests__/engineWineShimSchedule.test.ts
  - src/backend/__tests__/engineWinePortComplete.test.ts
autonomous: true
requirements: [SVC-02]
estimate:
  tokens: 98000
  raw_tokens: 98000
  tasks: 3
  confidence: low
  # basis: chars/4 of what the executor reads, writes and sees in verify output, measured 2026-11-24 at HEAD 136ea8983: fixed 28k (workflow, summary template, CONTEXT slice, this plan) + T1 32k (Rust deps + tests, one channel through five layers, the importer map) + T2 18k (one Rust op + channel, three callers) + T3 20k (one channel, the download wrapper, targeted games.test.ts edits). Over the 100k smart-zone line is advisory; games.test.ts is 18,658 lines and must never be read whole.
must_haves:
  truths:
    - "87-52 regression closed (owner 87-56a, D-23): during a live non-Steam launch on a fallback engine, a Winetricks apply, its catalog and installed list, and a Run EXE or Wine tool on that game act on the launch's engine. Rust `tool_settings::CtxToolSettingsDeps` reads the live selection from `EngineCtx.registry` and the per-launch overlay from `EngineCtx.launch_settings` (it answered 'no live selection' and 'no bottle created' at HEAD), and `services/winetricksTarget.ts` and `services/gameCommandFacts.ts` reach it through the `resolveEngineToolSettings` shim; a Rust test with a registered fallback selection and a bottle overlay context answers the overlay settings, not the stored override's engine, and fails against the HEAD deps"
    - "Cluster A (D-03, D-15): no non-test file outside src/backend/engine imports toolSettings, engineConfig, engineDecision, engineEligibility, gamePrefix, launchSettings or perGameBottle; the Steam Wine-tool path resolves a non-CrossOver engine through the `resolveNonCrossoverEngine` shim over the new `engine_non_crossover_engine` op; `wineManagerReleases` and `engine/engineServices` are imported outside the engine directory only by services/engineServices.ts, which 87-56c deletes"
    - "Cluster B (D-01, D-10): every Steam first-need pinned-engine download (install, launch, DRM restore, redist) runs in Rust through the `ensureFallbackEngine` shim, an AbortSignal crossing as a cancel id and `engine_cancel`; Rust emits the `gameStatusUpdate` engine-download sequence; no file outside src/backend/engine imports fallbackEngine or pinnedEngineProgress or reads the engine runtime's fallback member, and the synchronous pinned-engine reads go through the D-24 twin"
    - "The 87-56 lesson: `describe('engineOutsideImporters')` in engineWinePortComplete.test.ts pins the measured importer map of every non-test module under src/backend/engine (written first, green at the starting HEAD) and the engine-runtime member reads outside the directory, so an unlisted caller fails a test instead of surfacing at a deletion"
    - "Each new shim is a schedule row in the same commit: `resolveEngineToolSettings` and `resolveNonCrossoverEngine` (shim, 98), `ensureFallbackEngine` (shim, 96); the rustInvoke channel count goes 185 -> 188"
  artifacts:
    - path: "src/backend/enginewine/toolSettings.ts"
      provides: "resolveEngineToolSettings and resolveNonCrossoverEngine shims"
    - path: "src/backend/enginewine/fallback.ts"
      provides: "ensureFallbackEngine shim"
    - path: "src/backend/storeManagers/steam/engine/pinnedEngine.ts"
      provides: "pinnedEngineReader (twin-backed sync reads) and ensurePinnedEngineThroughRust (cancel id over engine_cancel, never rejects)"
    - path: "src/backend/__tests__/engineWinePortComplete.test.ts"
      provides: "engineOutsideImporters describe"
      contains: "engineOutsideImporters"
  key_links:
    - from: "src/backend/services/winetricksTarget.ts"
      to: "src-tauri/crates/gamelib-engine/src/tool_settings.rs"
      via: "resolveEngineToolSettings -> engine_resolve_tool_settings -> CtxToolSettingsDeps reading EngineCtx.registry and launch_settings"
      pattern: "resolveEngineToolSettings"
    - from: "src/backend/storeManagers/steam/gameInstall.ts"
      to: "src-tauri/crates/gamelib-engine/src/fallback/ensure.rs"
      via: "ensurePinnedEngineThroughRust -> ensureFallbackEngine -> engine_fallback_ensure; abort -> cancelRunTool -> engine_cancel"
      pattern: "ensurePinnedEngineThroughRust"
  prohibitions:
    - statement: "MUST NOT revive any deleted TS module, add a jest.mock call (backend-di-ceilings), lower a floor, or widen an allow-list or the importer map to pass a gate"
      status: unresolved
      reason: "spec-less fallback; enforced by engineOutsideImporters, backend-di-ceilings and review; no wired check descriptor"
---

<objective>
Switch clusters A (tool settings) and B (the pinned-engine download) of the 87-56 remainder to the existing Rust
engine, and close the unowned 87-52 regression: the Winetricks and Run EXE target of a non-Steam game follows the
engine its live launch is on.

Purpose: D-03/D-15 (callers reach Rust through scheduled shims) and D-01/D-10 (the first-need download is Rust's, with
the same events), measured against live importers first, the lesson 87-56 recorded.
Output: three channels with shell arms, three shims, the Steam download wrapper, the Rust tool-settings deps wired to the
live selection, the switched callers and the `engineOutsideImporters` gate. No engine module is deleted here: every A/B
module that loses its last outside caller is still imported by other engine files and by the multi-cluster oracles,
which 87-56c deletes whole with the directory.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/phases/87-engine-wine-and-tools/87-56-SUMMARY.md
Read 87-CONTEXT.md D-01, D-03, D-10, D-15, D-17, D-23 and D-24 only. Read 87-55-SUMMARY.md "Call sites and their
ripple" and its deviations 1-3 (the shim-shape rule, the unbounded list, the cancel re-send).
Skill("gamelib-conventions"): the `<verify>` prettier rule and the Rust shutdown contract apply.

<assumption_delta_decision>
The detector fired on "fallback" (the pinned fallback engine of Phase 59). Primary noun: the engine selection
(`EngineSelection`: crossover, pinned or wine-manager), generalised in 59/61. Decision: no-change. This plan moves
callers to Rust; it introduces no second case.
</assumption_delta_decision>
</context>

## Measured live importers (HEAD 136ea8983, 2026-11-24)

Measured by resolving every import, dynamic import and require under src/ and meta/ (alias `backend/...` and relative
forms). "Outside" means outside src/backend/engine; testUtils files count as tests.

| Module (src/backend/engine/) | Cluster | Live non-test importers outside | Engine-internal importers | Test importers outside | This plan |
| --- | --- | --- | --- | --- | --- |
| toolSettings | A | services/gameCommandFacts.ts, services/winetricksTarget.ts, storeManagers/steam/bridgeWineTools.ts | none | services/__tests__/gameCommandFacts.test.ts (jest.mock) | T1 winetricksTarget; T2 gameCommandFacts, bridgeWineTools |
| engineConfig | A | storeManagers/steam/engine/steamEngineDeps.ts (the stored-override read, EngineConfigDeps type) | engineDecision, engineState, gameEngineState, gamePrefix, toolSettings | stores/__tests__/settingsFamily.test.ts | T2 |
| engineDecision | A | none | engineConfig, engineServices, engineState, gameEngineState, perGameBottle, toolSettings | sidecar/__tests__/engineStateWiring.test.ts (type) | 87-56c |
| engineEligibility | A | none | toolSettings | none | 87-56c |
| gamePrefix | A | none | gameEngineState, toolSettings | none | 87-56c |
| launchSettings | A | none | engineRuntime, toolSettings | none | 87-56c |
| perGameBottle | A | none | engineRuntime, gameEngineState, gamePrefix, toolSettings | none | 87-56c |
| wineManagerReleases | A | services/engineServices.ts (plumbing: builds EngineServices) | engineDecision | none | 87-56c deletes services/engineServices.ts |
| engineServices (type EngineServices; not in the 87-56 cluster table) | A | services/engineServices.ts, storeManagers/steam/bridgeWineTools.ts, storeManagers/steam/engine/steamEngineDeps.ts | engineDecision, gameEngineState, perGameBottle, toolSettings | steam/__tests__/bridgeWineTools.test.ts | T2 bridgeWineTools, steamEngineDeps; 87-56c the rest |
| fallbackEngine | B | none by import; member reads of the runtime's `fallback`: gameInstall.ts 1, gameLaunch.ts 2, gameEngineDialogs.ts 2, bridgeWineTools.ts 1 | engineConfig, engineDecision, engineRuntime, pinnedEngineProgress | steam/__tests__/games.test.ts (jest.mock of the module) | T2 bridgeWineTools; T3 the rest |
| pinnedEngineProgress | B | storeManagers/steam/gameInstall.ts | perGameBottle | none | T3 |

Rust ops (checked in `gamelib-engine` `OPS` and `src-tauri/src/engine_dispatch.rs`):

| Op | Shell arm and channel at HEAD | This plan |
| --- | --- | --- |
| engine_resolve_tool_settings | none | T1 adds; its `CtxToolSettingsDeps` answered `has_live_selection` false, `overlay` = stored and `ensure_game_bottle` false, so a switch alone would NOT close the 87-52 regression and would stop a Winetricks apply creating a missing bottle; T1 wires all three |
| engine_non_crossover_engine | op does not exist | T2 adds it over the existing `tool_settings::non_crossover_engine_for` (the Steam Wine-tool path needs it; no other op answers it) |
| engine_fallback_ensure | none | T3 adds (unbounded: a ~228 MB first-need download) |
| engine_fallback_is_installed | none | not wired: every caller reads synchronously, and the D-24 twin `isPinnedEngineInstalled` (87-39, vectors) answers it; an async shim would have no caller |
| engine_cancel | arm, channel and shim `cancelRunTool` (87-55) | reused by T3; one cancel registry serves run_tool and the fallback download |
| engine_launch_settings_get | arm, channel and shim (87-52) | not needed: the overlay read moves inside Rust tool_settings |
| engine_cx_demo_status | none | not needed by any caller here |

Surprises against the 87-56 cluster table: the Rust tool-settings deps were never wired to the live selection;
engineConfig and engine/engineServices have live Steam callers the table did not list; no op answered
nonCrossoverEngineFor; games.test.ts mocks the TS fallback engine module and is 18,658 lines.

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Tracer — a non-Steam game's Winetricks target resolves in Rust on the live selection: the importer map first, then Rust deps, channel, arm, shim and winetricksTarget</name>
  <files>src/backend/__tests__/engineWinePortComplete.test.ts, src-tauri/crates/gamelib-engine/src/tool_settings.rs, src-tauri/crates/gamelib-engine/tests/golden_config.rs, src-tauri/src/engine_dispatch.rs, src-tauri/src/ipc_contract.rs, src/common/types/sidecarTransport.ts, src/common/types/ipc/rustInvoke.ts, src/common/types/ipc/ipcSchemaSnapshot.json, src/common/types/engine.ts, src/backend/sidecar/sidecarRpc.ts, src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts, src/backend/__tests__/tauriShellSource.test.ts, src/backend/__tests__/dialogOptionForwarding.test.ts, src/backend/enginewine/toolSettings.ts, src/backend/enginewine/__tests__/toolSettingsShim.test.ts, src/backend/services/winetricksTarget.ts, src/backend/services/__tests__/winetricksTarget.test.ts, src/backend/__tests__/engineWineShimSchedule.test.ts</files>
  <precondition>describe('engineOutsideImporters'), written first from this plan's measured table, passes at the starting HEAD; if it fails, a live importer exists that this plan does not account for: stop and return a checkpoint naming the importer (the 87-56 lesson), never widen the map to make it pass</precondition>
  <read_first>
    - This plan's "Measured live importers" table and Rust ops table
    - src/backend/__tests__/engineWinePortComplete.test.ts (tsWalk, runSlice, the planted self-tests) and src/backend/testUtils/infoPortGate.ts `findImporters`
    - src-tauri/crates/gamelib-engine/src/tool_settings.rs (ToolSettingsDeps, CtxToolSettingsDeps, resolve_tool_settings_for_id) and tests/golden_config.rs around its ToolSettingsDeps impl (about line 420)
    - src-tauri/crates/gamelib-engine/src/launch/settings.rs `get_launch_settings` and its test `a_crossover_selection_takes_the_contexts_bin_dir_over_its_own` (how a test registers a selection and an overlay context)
    - src-tauri/crates/gamelib-engine/src/launch/step.rs `CtxStepDeps::ensure_game_bottle` and the `Fut` alias; src-tauri/crates/gamelib-engine/src/lib.rs the `engine_resolve_tool_settings` arm and `ToolSettingsRequest`
    - src-tauri/src/engine_dispatch.rs the `rpc_cx_resolve_bin_dir` rows in both lists (87-55 pattern); src/common/types/sidecarTransport.ts the `RUST_ENGINE_RUN_TOOL` block; src/common/types/ipc/rustInvoke.ts the `engineOpRequest` entries; src/backend/sidecar/sidecarRpc.ts `UNBOUNDED_RUST_CHANNELS`
    - src/backend/services/winetricksTarget.ts and src/backend/engine/toolSettings.ts `resolveToolSettings` (the native check it adds before the id resolver)
    - src/backend/__tests__/engineWineShimSchedule.test.ts row format and `RUN_TOOL_SHIM_IMPORTERS`
  </read_first>
  <behavior>
    - engineOutsideImporters: the map's keys equal the non-test modules under src/backend/engine; each module's importers outside the directory (non-test, not testUtils) equal its listed set; the engine-runtime member reads outside the directory equal their listed set; a planted importer and a planted member read are each reported
    - Rust: with a pinned fallback selection registered for `gog:1` and a bottle overlay context, `resolve_tool_settings_for_id` over `CtxToolSettingsDeps` answers engine settings from the overlay (the fallback engine's wine), not the stored override's CrossOver; with no selection it answers as before; `ensure_bottle` true on an unprovisioned bottle goes through the per-game bottle flight and a failed creation answers `bottle-not-created`
    - `engine_resolve_tool_settings` answers the TS `ToolSettingsResult` JSON through the shell arm; the arm is in the bad-args and not-ready loops
    - winetricksTarget: a native game answers stored settings with no Rust call; a non-native GOG game's target is the Rust reply's settings; a Rust `unavailable` keeps its reason word; a rejected call makes `resolveWinetricksTarget` answer `no-engine`
  </behavior>
  <action>
    First add `describe('engineOutsideImporters')` to engineWinePortComplete.test.ts: a const `ENGINE_OUTSIDE_IMPORTERS`
    keyed by module basename for every non-test file under src/backend/engine, each value the sorted repo-relative
    importer list from this plan's table (empty lists written out, never derived), checked with `findImporters` over
    `tsWalk` files that start with `src/`, are outside src/backend/engine and testUtils and are not `.test.` files; a
    second const `ENGINE_RUNTIME_MEMBER_READS` listing each outside file that reads the runtime's ledger, registry,
    crossover, fallback, launchSettings or perGameBottle member (directly or through `requireEngineRuntime(...)`) over
    comment-stripped code, which at HEAD is bootstrap.ts (crossover), gameLaunch.ts (fallback, registry),
    gameEngineDialogs.ts, gameInstall.ts and bridgeWineTools.ts (fallback); a keys-equal-modules test; and planted
    self-tests for both scans. Run it green at HEAD (the precondition). Every later switch in 87-56a/b/c edits these
    lists in the same commit.

    Rust (D-23 regression fix): in tool_settings.rs make `CtxToolSettingsDeps` answer `has_live_selection` from
    `ctx.registry.get_engine_selection`, `overlay` from `ctx.launch_settings.get_launch_settings(ctx, Some(key), stored)`
    and `ensure_game_bottle` through `launch::step::CtxStepDeps`'s per-game bottle creation (decide the creation engine,
    then the flight; `Done` is true). `BoxFuture` is `'static`, so give the trait method a future bound to `&self`
    (the step module's `Fut<'a, bool>` shape) and update the golden_config.rs impl's signature only. Rewrite the module
    comment's "not yet wired" paragraph. Add unit tests for the behaviour above, one named
    `a_live_selection_wins_over_the_stored_override`. gamelib-wine's DXVK toggle uses the same deps, so it gains the same
    live view (the TS registry-backed parity).

    Channel: `RUST_ENGINE_RESOLVE_TOOL_SETTINGS` = `engine_resolve_tool_settings` in sidecarTransport.ts, its
    `engineOpRequest` zod entry, `pnpm gen:ipc-contract`, the shell arm in both engine_dispatch.rs lists, counts 185 ->
    186 in rustInvokeSchemas.test.ts and tauriShellSource.test.ts, and the channel on `UNBOUNDED_RUST_CHANNELS` with its
    reason (an `ensureBottle` call may create a bottle and download the pinned engine; the TS had no cap) mirrored in
    dialogOptionForwarding.test.ts. Move the `ToolSettingsResult` type to src/common/types/engine.ts.

    Shim: src/backend/enginewine/toolSettings.ts `resolveEngineToolSettings(deps, {runner, appName, platform?, stored,
    ensureBottle})`, one returned typed call; schedule row (shim, 98, callers the file's importers) and
    toolSettingsShim.test.ts. In winetricksTarget.ts the non-Steam branch keeps the native check (a native game answers
    stored), then calls the shim with `{requestRustInvoke: source.engineRuntime.requestRustInvoke}` and narrows the reply
    in a local exported `toolSettingsResultFrom` (a reply that is not one of the three shapes rejects, as a TS failure
    did). The Steam branch is unchanged until Task 2. Add winetricksTarget.test.ts over an injected fake transport (no
    jest.mock). Remove winetricksTarget.ts from the toolSettings row of the importer map.
  </action>
  <verify>
    <automated>pnpm exec jest --runTestsByPath src/backend/__tests__/engineWinePortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/enginewine/__tests__/toolSettingsShim.test.ts src/backend/services/__tests__/winetricksTarget.test.ts src/backend/sidecar/__tests__/engineWineResolvers.test.ts src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/dialogOptionForwarding.test.ts && cd src-tauri && cargo test -p gamelib-engine --lib tool_settings && cargo test -p gamelib-engine --test golden_config && cargo test -p gamelib-wine dxvk && cargo test --bin gamelib-shell engine_dispatch && cargo fmt --check -p gamelib-engine -p gamelib-shell && cd .. && pnpm check:ipc-contract && pnpm codecheck && npx prettier --check src/backend/__tests__/engineWinePortComplete.test.ts src/common/types/sidecarTransport.ts src/common/types/ipc/rustInvoke.ts src/common/types/engine.ts src/backend/sidecar/sidecarRpc.ts src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/dialogOptionForwarding.test.ts src/backend/enginewine/toolSettings.ts src/backend/enginewine/__tests__/toolSettingsShim.test.ts src/backend/services/winetricksTarget.ts src/backend/services/__tests__/winetricksTarget.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts</automated>
    <fails_when>non-zero exit; jest prints "failed" (engineOutsideImporters red means an unlisted importer: stop at the checkpoint); cargo prints "test result: FAILED" or "Diff in"; check:ipc-contract reports a stale file; codecheck reports an error; prettier prints "Code style issues found"</fails_when>
  </verify>
  <acceptance_criteria>
    - `grep -c "engineOutsideImporters" src/backend/__tests__/engineWinePortComplete.test.ts` >= 1 [HEAD=0 EXPECT>=1 @136ea8983]
    - `grep -cF "fn has_live_selection(&self, _key" src-tauri/crates/gamelib-engine/src/tool_settings.rs` == 0 (the HEAD impl ignored its key) [HEAD=1 EXPECT==0 @136ea8983]
    - `grep -c "a_live_selection_wins_over_the_stored_override" src-tauri/crates/gamelib-engine/src/tool_settings.rs` >= 1 and that test passes [HEAD=0 EXPECT>=1 @136ea8983]
    - `grep -c "engine_resolve_tool_settings" src-tauri/src/engine_dispatch.rs` >= 2 [HEAD=0 EXPECT>=2 @136ea8983]
    - rustInvokeSchemas.test.ts and tauriShellSource.test.ts assert 186 [HEAD=185 EXPECT==186 @136ea8983]
  </acceptance_criteria>
  <done>A non-Steam game's Winetricks target is decided in Rust from the live selection, proven by a Rust test that fails against the HEAD deps, and the importer map guards every later switch.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: The rest of cluster A: the sideload Run installer, the Steam Wine-tool engine (new op `engine_non_crossover_engine`) and the stored-override read</name>
  <files>src-tauri/crates/gamelib-engine/src/lib.rs, src-tauri/src/engine_dispatch.rs, src-tauri/src/ipc_contract.rs, src/common/types/sidecarTransport.ts, src/common/types/ipc/rustInvoke.ts, src/common/types/ipc/ipcSchemaSnapshot.json, src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts, src/backend/__tests__/tauriShellSource.test.ts, src/backend/enginewine/toolSettings.ts, src/backend/enginewine/__tests__/toolSettingsShim.test.ts, src/backend/services/winetricksTarget.ts, src/backend/services/gameCommandFacts.ts, src/backend/services/__tests__/gameCommandFacts.test.ts, src/backend/storeManagers/steam/bridgeWineTools.ts, src/backend/storeManagers/steam/__tests__/bridgeWineTools.test.ts, src/backend/storeManagers/steam/engine/steamEngineDeps.ts, src/backend/storeManagers/steam/__tests__/steamEngineDeps.test.ts, src/backend/storeManagers/steam/engine/pinnedEngine.ts, src/backend/stores/__tests__/settingsFamily.test.ts, src/backend/__tests__/engineWineShimSchedule.test.ts, src/backend/__tests__/engineWinePortComplete.test.ts</files>
  <read_first>
    - src/backend/services/gameCommandFacts.ts (the pending-install branch) and its test's existing jest.mock of the TS tool-settings module
    - src/backend/storeManagers/steam/bridgeWineTools.ts in full and its test
    - src/backend/storeManagers/steam/engine/steamEngineDeps.ts `readSteamEngineOverride` and `steamPrepareFacts`; src/backend/storeManagers/steam/titleSettings.ts `readStoredTitleConfig`; src/backend/engine/engineConfig.ts the stored-config reader (to confirm the two answer the same for a numeric appId)
    - src-tauri/crates/gamelib-engine/src/tool_settings.rs `non_crossover_engine_for`, src-tauri/crates/gamelib-engine/src/engines.rs `NonCrossoverEngine` (serde camelCase)
    - src/backend/enginewine/twin.ts `BottleReadContext`, `isPinnedEngineInstalled`, `readBottleEngineMarkerKind`; src/backend/engine/fallbackEngine.ts `pinnedEngineRoot` (the `<toolsPath>/steam-engines` root)
  </read_first>
  <behavior>
    - gameCommandFacts: a sideload pending install sends `{runner: 'sideload', appName, platform: 'Windows', stored, ensureBottle: true}` to the shim and maps its reply as before; an installed game still goes through `resolveToolTarget`
    - engine_non_crossover_engine `{engineId}` answers the pin's or Wine Manager build's NonCrossoverEngine when installed, null otherwise, bad-args for any other shape
    - resolveSteamWineToolSettings: a non-CrossOver marker or a pinned/wine-manager override resolves the engine through the shim; a null answer is `unavailable` `no-engine`; the own-bottle rules are unchanged
    - readSteamEngineOverride answers the same value as before for the generic and the older Steam key (settingsFamily's mirror case still passes through the new reader)
    - pinnedEngineReader(paths).isPinnedEngineInstalled(pin) equals the twin's answer for `<toolsPath>/steam-engines`
  </behavior>
  <action>
    Rust: add op `engine_non_crossover_engine` to gamelib-engine (sorted into `OPS`, a strict `{engineId}` request
    struct, the arm calling `tool_settings::non_crossover_engine_for`, a null answer for not installed) with dispatch
    tests whose names contain `non_crossover` (the verify filters on it); `RUST_ENGINE_NON_CROSSOVER_ENGINE` channel, zod entry, contract regenerated, shell arm in both lists, counts
    186 -> 187 (bounded: a read). Shim `resolveNonCrossoverEngine(deps, {engineId})` in enginewine/toolSettings.ts with
    a schedule row (shim, 98) and shim tests.

    New src/backend/storeManagers/steam/engine/pinnedEngine.ts with `pinnedEngineReader(paths)`: the
    `BottleReadContext['fallback']` pair built from the twin's pure `isPinnedEngineInstalled` over
    `join(paths.toolsPath, 'steam-engines')` (the root the TS fallback engine and Rust use). Add the file to the twin
    rows' importer list.

    gameCommandFacts.ts: the pending-install branch calls `resolveEngineToolSettings` and the shared
    `toolSettingsResultFrom`; repoint the test's existing jest.mock target to the shim module (the call count does not
    rise) or replace it with an injected transport. bridgeWineTools.ts: `nonCrossoverEngine` becomes async over
    `resolveNonCrossoverEngine`, `markerKind` reads through `pinnedEngineReader(services.paths)`, the result type is the
    common `ToolSettingsResult`, and the services parameter becomes a local `SteamWineToolsSource` type (paths,
    globalGameSettings, steamBottle, steamLaunchRuntime, engineRuntime transport) instead of the engine's EngineServices;
    winetricksTarget.ts's Steam branch passes its source straight through. steamEngineDeps.ts: `readSteamEngineOverride`
    reads the generic key through `readStoredTitleConfig` (one read serves both keys) and `steamPrepareFacts` takes a
    local slim type, so the file stops importing the engine's config and services modules (its prepareBottle type stays
    for 87-56b). settingsFamily.test.ts: the engine-override assertions go through `readStoredTitleConfig`.
    Update the importer map: toolSettings, engineConfig and engine/engineServices lose these callers; the fallback
    member read of bridgeWineTools.ts goes.
  </action>
  <!-- planner-discipline-allow: readStoredGameConfig -->
  <verify>
    <automated>pnpm exec jest --runTestsByPath src/backend/__tests__/engineWinePortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/enginewine/__tests__/toolSettingsShim.test.ts src/backend/enginewine/__tests__/twinVectors.test.ts src/backend/services/__tests__/gameCommandFacts.test.ts src/backend/services/__tests__/winetricksTarget.test.ts src/backend/storeManagers/steam/__tests__/bridgeWineTools.test.ts src/backend/storeManagers/steam/__tests__/steamEngineDeps.test.ts src/backend/stores/__tests__/settingsFamily.test.ts src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts src/backend/__tests__/tauriShellSource.test.ts && cd src-tauri && cargo test -p gamelib-engine --lib non_crossover && cargo test --bin gamelib-shell engine_dispatch && cargo fmt --check -p gamelib-engine -p gamelib-shell && cd .. && pnpm check:ipc-contract && pnpm codecheck && pnpm backend-di-ceilings && npx prettier --check src/common/types/sidecarTransport.ts src/common/types/ipc/rustInvoke.ts src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts src/backend/__tests__/tauriShellSource.test.ts src/backend/enginewine/toolSettings.ts src/backend/enginewine/__tests__/toolSettingsShim.test.ts src/backend/services/winetricksTarget.ts src/backend/services/gameCommandFacts.ts src/backend/services/__tests__/gameCommandFacts.test.ts src/backend/storeManagers/steam/bridgeWineTools.ts src/backend/storeManagers/steam/__tests__/bridgeWineTools.test.ts src/backend/storeManagers/steam/engine/steamEngineDeps.ts src/backend/storeManagers/steam/__tests__/steamEngineDeps.test.ts src/backend/storeManagers/steam/engine/pinnedEngine.ts src/backend/stores/__tests__/settingsFamily.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/__tests__/engineWinePortComplete.test.ts</automated>
    <fails_when>non-zero exit; jest prints "failed"; cargo prints "test result: FAILED" or "Diff in"; check:ipc-contract reports a stale file; codecheck reports an error; backend-di-ceilings prints FAIL or a ratchet increase; prettier prints "Code style issues found"</fails_when>
  </verify>
  <acceptance_criteria>
    - `grep -v '^\s*\(//\|\*\)' src/backend/storeManagers/steam/engine/steamEngineDeps.ts | grep -c "readStoredGameConfig"` == 0 [HEAD=2 EXPECT==0 @136ea8983]
    - `grep -v '^\s*\(//\|\*\)' src/backend/storeManagers/steam/bridgeWineTools.ts | grep -cF "engineRuntime.fallback"` == 0 [HEAD=1 EXPECT==0 @136ea8983]
    - `grep -c "engine_non_crossover_engine" src-tauri/crates/gamelib-engine/src/lib.rs` >= 2 [HEAD=0 EXPECT>=2 @136ea8983]
    - engineOutsideImporters lists no outside importer for toolSettings or engineConfig, and only services/engineServices.ts for engine/engineServices and wineManagerReleases
  </acceptance_criteria>
  <!-- planner-discipline-allow: engineRuntime.fallback -->
  <done>Cluster A has no live caller outside the engine directory except the services builder 87-56c deletes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Cluster B: the Steam first-need engine download through Rust, and the fallback member's last readers</name>
  <files>src-tauri/src/engine_dispatch.rs, src-tauri/src/ipc_contract.rs, src/common/types/sidecarTransport.ts, src/common/types/ipc/rustInvoke.ts, src/common/types/ipc/ipcSchemaSnapshot.json, src/backend/sidecar/sidecarRpc.ts, src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts, src/backend/__tests__/tauriShellSource.test.ts, src/backend/__tests__/dialogOptionForwarding.test.ts, src/backend/enginewine/fallback.ts, src/backend/enginewine/__tests__/fallbackShim.test.ts, src/backend/storeManagers/steam/engine/pinnedEngine.ts, src/backend/storeManagers/steam/__tests__/pinnedEngine.test.ts, src/backend/storeManagers/steam/gameInstall.ts, src/backend/storeManagers/steam/gameLaunch.ts, src/backend/storeManagers/steam/gameEngineDialogs.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, src/backend/__tests__/engineWineShimSchedule.test.ts, src/backend/__tests__/engineWinePortComplete.test.ts</files>
  <read_first>
    - src/backend/engine/pinnedEngineProgress.ts (the TS reporter: its result shape and its two log lines) and src-tauri/crates/gamelib-engine/src/lib.rs the `engine_fallback_ensure` arm and `FallbackEnsureRequest` (pinId, appName, runner, cancelId?)
    - src-tauri/crates/gamelib-engine/src/fallback/progress.rs head comment (the event sequence Rust emits, `done` on failure or abort)
    - src/backend/storeManagers/steam/engine/rustRunTool.ts (the cancel-id pattern: re-send while Rust answers false, no timer, never reject)
    - src/backend/storeManagers/steam/gameInstall.ts `ensureBuiltInEngineForInstall`; the offline pre-check blocks in gameLaunch.ts `selectLaunchEngine` and gameEngineDialogs.ts `drmOfflinePrecheck`
    - games.test.ts by grep only (never read whole): `mockEnsurePinnedEngine`, `mockIsPinnedEngineInstalled`, the jest.mock of the TS fallback engine module near line 972, and the two progress-status tests near line 7281
  </read_first>
  <behavior>
    - ensurePinnedEngineThroughRust resolves Rust's PinnedEngineResult; a reply of any other shape or a transport failure resolves `{ok: false, aborted: false, reason: 'download-failed', error}`; it never rejects
    - an aborted signal sends engine_cancel for the run's cancel id (re-sent while Rust answers false, bounded, no timer); a pre-aborted signal answers aborted with no download request
    - an aborted result logs the TS info line and a failure the TS warning line, so gamelib.log keeps both
    - ensureBuiltInEngineForInstall maps ok, aborted and failure exactly as before for its five callers
  </behavior>
  <action>
    `RUST_ENGINE_FALLBACK_ENSURE` channel, zod entry, contract regenerated, shell arm in both lists, counts 187 -> 188,
    and the channel on `UNBOUNDED_RUST_CHANNELS` with its reason (a first-need ~228 MB download bounded by its cancel id
    and the app shutdown, D-17) mirrored in dialogOptionForwarding.test.ts. Shim `ensureFallbackEngine(deps, {pinId,
    appName, runner, cancelId?})` in enginewine/fallback.ts with a schedule row (shim, 96) and fallbackShim.test.ts.

    In pinnedEngine.ts add `ensurePinnedEngineThroughRust(deps, {pin, appName, runner, signal?})` on the rustRunTool.ts
    pattern, cancelling through the existing `cancelRunTool` shim (engine_cancel is the one cancel registry; add the file
    to the runTool rows' importer list), narrowing the reply field by field, and writing the TS reporter's two log
    lines. Rust sends the `gameStatusUpdate` events itself; no in-process listener exists for them (measured).
    gameInstall.ts `ensureBuiltInEngineForInstall` calls it with the engine runtime's transport instead of the shared TS
    reporter. gameLaunch.ts and gameEngineDialogs.ts read `isPinnedEngineInstalled` and the switch context's fallback
    through `pinnedEngineReader(steamGame.deps.paths)`. Add pinnedEngine.test.ts over a fake transport.

    games.test.ts: replace the jest.mock of the TS fallback engine module with a `jest.spyOn` on the pinnedEngine module
    (or delete it where the twin mock already answers), moving `mockEnsurePinnedEngine` to PinnedEngineResult values and
    `mockIsPinnedEngineInstalled` to the twin's `isPinnedEngineInstalled`; the two tests that asserted the TS reporter's
    status sequence move their assertion to the wrapper's request (the sequence is Rust's, covered by progress.rs tests).
    The jest.mock count must not rise. Update the importer map (pinnedEngineProgress loses gameInstall.ts; the fallback
    member reads list keeps only bootstrap.ts crossover and gameLaunch.ts registry) and write the SUMMARY's live-check
    lines: (1) a Winetricks apply and a Run EXE during a live non-Steam fallback-engine launch act on the launch's
    engine; (2) a real Steam first-need download shows progress and an abort mid-download leaves no temp directory.
  </action>
  <verify>
    <automated>pnpm exec jest --runTestsByPath src/backend/__tests__/engineWinePortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/enginewine/__tests__/fallbackShim.test.ts src/backend/storeManagers/steam/__tests__/pinnedEngine.test.ts src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/dialogOptionForwarding.test.ts && pnpm exec jest src/backend src/common --silent && cd src-tauri && cargo test --bin gamelib-shell engine_dispatch && cargo fmt --check -p gamelib-shell && cd .. && pnpm check:ipc-contract && pnpm codecheck && pnpm backend-di-ceilings && npx prettier --check src/common/types/sidecarTransport.ts src/common/types/ipc/rustInvoke.ts src/backend/sidecar/sidecarRpc.ts src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/dialogOptionForwarding.test.ts src/backend/enginewine/fallback.ts src/backend/enginewine/__tests__/fallbackShim.test.ts src/backend/storeManagers/steam/engine/pinnedEngine.ts src/backend/storeManagers/steam/__tests__/pinnedEngine.test.ts src/backend/storeManagers/steam/gameInstall.ts src/backend/storeManagers/steam/gameLaunch.ts src/backend/storeManagers/steam/gameEngineDialogs.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/__tests__/engineWinePortComplete.test.ts</automated>
    <fails_when>non-zero exit; jest prints "failed" or a suite fails to run; cargo prints "test result: FAILED" or "Diff in"; check:ipc-contract reports a stale file; codecheck reports an error; backend-di-ceilings prints FAIL or a jestMock increase; prettier prints "Code style issues found"</fails_when>
  </verify>
  <acceptance_criteria>
    - `grep -v '^\s*\(//\|\*\)' src/backend/storeManagers/steam/gameInstall.ts | grep -c "ensurePinnedEngineReportingStatus"` == 0 [HEAD=2 EXPECT==0 @136ea8983]
    - `grep -v '^\s*\(//\|\*\)' src/backend/storeManagers/steam/gameLaunch.ts | grep -cF "engineRuntime.fallback"` == 0 [HEAD=2 EXPECT==0 @136ea8983]
    - `grep -v '^\s*\(//\|\*\)' src/backend/storeManagers/steam/gameEngineDialogs.ts | grep -cF "engineRuntime.fallback"` == 0 [HEAD=2 EXPECT==0 @136ea8983]
    - `grep -cF "backend/engine/fallbackEngine" src/backend/storeManagers/steam/__tests__/games.test.ts` == 0 [HEAD=1 EXPECT==0 @136ea8983]
    - rustInvokeSchemas.test.ts and tauriShellSource.test.ts assert 188 [HEAD=185 EXPECT==188 @136ea8983]
    - `pnpm backend-di-ceilings` passes with jestMock at or below its HEAD value
  </acceptance_criteria>
  <!-- planner-discipline-allow: ensurePinnedEngineReportingStatus -->
  <!-- planner-discipline-allow: engineRuntime.fallback -->
  <!-- planner-discipline-allow: backend/engine/fallbackEngine -->
  <done>No Steam path downloads the engine in TypeScript; clusters A and B have no live caller outside the engine directory except the services builder 87-56c deletes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar -> Rust engine ops | runner, appName, stored settings, engine ids and pin ids come from sidecar code |
| Rust fallback download -> disk | a 228 MB archive is fetched, verified and extracted under the tools path |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-87-89 | Tampering | engine_resolve_tool_settings with ensureBottle | medium | mitigate | strict `deny_unknown_fields` decode; Rust derives the engine key and bottle name itself (engine_key_for, the sanitiser) and creates only through the existing per-game flight; a native or Browser title never reaches the op |
| T-87-90 | Tampering | engine_fallback_ensure | high | mitigate | the request names a pin id only; Rust resolves it in its own pin table, verifies size and sha256 and contains the extraction (87-47); the TS sends no URL or path |
| T-87-91 | Denial of Service | two unbounded channels | medium | mitigate | each run is bounded by its cancel id (engine_cancel), the app shutdown registrant (D-17) and, for the bottle, the creation timeout; the reasons are written beside UNBOUNDED_RUST_CHANNELS and pinned by dialogOptionForwarding.test.ts |
| T-87-92 | Information Disclosure | engine_non_crossover_engine reply | low | accept | answers wine and DXVK paths under the user's own tools directory to the same user's sidecar, as the TS did |
| T-87-SC | Tampering | package installs | low | accept | no new package |
</threat_model>

<verification>
- engineOutsideImporters, the schedule, the shims, the Steam folder and the full backend and common jest pass; the Rust
  tool-settings, golden_config and dispatch tests pass; the IPC contract is current; codecheck and backend-di-ceilings
  pass.
</verification>

<success_criteria>
The Winetricks and Run EXE target follows a live fallback-engine launch (the 87-52 regression is closed with a test),
and clusters A and B reach Rust through scheduled shims (D-01, D-03, D-10, D-15, D-23), measured by
engineOutsideImporters.
</success_criteria>

## Artifacts this phase produces

- Rust: `CtxToolSettingsDeps` live arms (registry, launch overlay, per-game bottle flight); op `engine_non_crossover_engine`; test `a_live_selection_wins_over_the_stored_override`
- Channels and shell arms: `RUST_ENGINE_RESOLVE_TOOL_SETTINGS` (unbounded), `RUST_ENGINE_NON_CROSSOVER_ENGINE`, `RUST_ENGINE_FALLBACK_ENSURE` (unbounded); count 185 -> 188
- Shims and schedule rows: `src/backend/enginewine/toolSettings.ts` `resolveEngineToolSettings` (98), `resolveNonCrossoverEngine` (98); `src/backend/enginewine/fallback.ts` `ensureFallbackEngine` (96)
- `src/backend/storeManagers/steam/engine/pinnedEngine.ts`: `pinnedEngineReader`, `ensurePinnedEngineThroughRust`
- `toolSettingsResultFrom` in `services/winetricksTarget.ts`; `ToolSettingsResult` type in `src/common/types/engine.ts`
- `describe('engineOutsideImporters')` with `ENGINE_OUTSIDE_IMPORTERS` and `ENGINE_RUNTIME_MEMBER_READS`
- Tests: toolSettingsShim, fallbackShim, winetricksTarget, pinnedEngine
- For 87-57: three new schedule rows its EXPECTED_SURVIVORS table does not list (record them in the SUMMARY)

<output>
Create `.planning/phases/87-engine-wine-and-tools/87-56a-SUMMARY.md` when done
</output>
