---
phase: 87-engine-wine-and-tools
plan: 56a
subsystem: engine
tags: [rust, engine-ts-deletion, tool-settings, pinned-engine, shim, d-01, d-03, d-10, d-15, d-23, d-24, engineOutsideImporters]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: 87-47 Rust fallback download, 87-52 launch step and selection registry, 87-55 engine_cancel and the cancel-id pattern, 87-56 the live-importer lesson
provides:
  - the 87-52 regression closed in Rust: CtxToolSettingsDeps reads the live selection, the per-launch overlay and the per-game bottle flight from the engine context
  - three channels with shell arms and shims (engine_resolve_tool_settings, engine_non_crossover_engine, engine_fallback_ensure), 185 -> 188
  - the Steam first-need pinned-engine download in Rust (ensurePinnedEngineThroughRust) and pinnedEngineReader over the D-24 twin
  - describe('engineOutsideImporters'): the measured importer map of every src/backend/engine module and the runtime member reads outside it
affects: [87-56b, 87-56c, 87-57, 87-58, 87-59]

actuals:
  tokens: 43500
  tasks: 3
  commits: 5

plan_head_before: c0abd6b35cd15ada67ac47dc816f4b432ae965db
plan_head_after: 3e9429685f7f3dbd914ea68ba12e5a969c36e320

tech-stack:
  added: []
  patterns:
    - "an importer map written first and green at the starting HEAD (engineOutsideImporters), edited by every later switch in the same commit"
    - "a Rust deps trait whose async method borrows the deps (Fut<'a, bool>) so the context-backed impl can read the context"
    - "an AbortSignal crossing rustInvoke as a cancel id over engine_cancel, re-sent while Rust has no run registered, bounded, no timer"

key-files:
  created:
    - src/backend/enginewine/toolSettings.ts
    - src/backend/enginewine/fallback.ts
    - src/backend/enginewine/__tests__/toolSettingsShim.test.ts
    - src/backend/enginewine/__tests__/fallbackShim.test.ts
    - src/backend/services/__tests__/winetricksTarget.test.ts
    - src/backend/storeManagers/steam/engine/pinnedEngine.ts
    - src/backend/storeManagers/steam/__tests__/pinnedEngine.test.ts
  modified:
    - src-tauri/crates/gamelib-engine/src/tool_settings.rs
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/tests/golden_config.rs
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/engine.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/services/winetricksTarget.ts
    - src/backend/services/gameCommandFacts.ts
    - src/backend/storeManagers/steam/bridgeWineTools.ts
    - src/backend/storeManagers/steam/engine/steamEngineDeps.ts
    - src/backend/storeManagers/steam/gameInstall.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/gameEngineDialogs.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/__tests__/engineWinePortComplete.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts

key-decisions:
  - "ToolSettingsResult moves to common/types/engine.ts; engine/toolSettings.ts re-exports it so the engine keeps compiling until 87-56c"
  - "Native check stays in TS (winetricksTarget, gameCommandFacts): Rust's id resolver has no isNative input; every other eligibility rule is Rust's"
  - "ensurePinnedEngineThroughRust takes an optional clearStatus callback, run whenever Rust never got to send its closing done (transport failure, unreadable reply, a signal aborted before the request)"
  - "The sync pinned-engine reads (offline pre-checks, the Wine-tool marker read) go through pinnedEngineReader over the twin's isPinnedEngineInstalled; engine_fallback_is_installed stays unwired (no async caller)"
  - "games.test.ts answers the Rust transport (mockEnsurePinnedEngine receives the engine_fallback_ensure request) rather than mocking the TS fallback engine module; jest.mock count 44 -> 43"

requirements-completed: []

duration: not recorded (one session; no start stamp was taken)
completed: 2026-11-23
---

# Phase 87 Plan 56a: Clusters A and B over Rust, the 87-52 regression closed Summary

**A non-Steam game's Winetricks and Run EXE target now follows the engine its live launch is on (Rust reads the live selection, overlay and bottle flight), and the Steam first-need engine download runs in Rust through a scheduled shim with cancel-id aborts; an importer-map gate pins every remaining caller of src/backend/engine.**

SVC-02 is NOT marked complete: it closes with 87-56c (the engine directory is still not empty). `requirements-completed` is empty.

## Performance

- **Tasks:** 3 of 3
- **Files modified:** 36 outside `.planning/` (1,868 insertions, 344 deletions; the three task commits touched 61 file entries between them)
- **Completed:** 2026-11-23T20:22Z

## Accomplishments

- **87-52 regression closed (D-23).** `CtxToolSettingsDeps` answered "no live selection" and "no bottle created" at HEAD. It now reads `has_live_selection` from `ctx.registry`, the `overlay` from `ctx.launch_settings`, and creates a missing bottle through `CtxStepDeps::ensure_game_bottle` (decide the creation engine, then the per-game flight). `a_live_selection_wins_over_the_stored_override` registers a pinned fallback selection plus a bottle overlay context and asserts engine settings from the overlay (the fallback wine, bottle name, DXVK off); it fails against the HEAD deps at its first assertion. `gamelib-wine`'s DXVK toggle shares the deps and gains the same live view.
- **Cluster A switched.** `winetricksTarget` (non-Steam), `gameCommandFacts` (sideload pending install) reach `engine_resolve_tool_settings` through `resolveEngineToolSettings`; the Steam Wine-tool path resolves a pinned or Wine Manager engine through `resolveNonCrossoverEngine` over the new `engine_non_crossover_engine` op; `readSteamEngineOverride` reads both override keys with one `readStoredTitleConfig` call. `bridgeWineTools` and `steamEngineDeps` no longer import the engine's config, tool-settings or services modules.
- **Cluster B switched.** `ensureBuiltInEngineForInstall` (install, launch, DRM restore, redist all go through it) calls `ensurePinnedEngineThroughRust`: the pin id and a cancel id cross to `engine_fallback_ensure`; an abort sends `engine_cancel` (re-sent up to five times while Rust answers false, no timer); it never rejects; the two gamelib.log lines the TS reporter wrote are kept. Rust sends the `gameStatusUpdate` engine-download sequence. `gameLaunch` and `gameEngineDialogs` read the installed check and the marker context through `pinnedEngineReader`.
- **The 87-56 lesson.** `describe('engineOutsideImporters')` pins the importer map of all 29 modules under `src/backend/engine` (written first, green at the starting HEAD) and the engine-runtime member reads outside the directory, with planted self-tests.

## Task Commits

1. **Task 1 (tracer): importer map, Rust live deps, channel, shim, winetricksTarget** - `9a49f455e` (feat)
2. **Task 2: the sideload installer, the Steam Wine-tool engine, the stored-override read** - `1d957e5fa` (feat)
3. **Task 3: the Steam first-need download through Rust** - `3e9429685` (feat)

`commits: 5` is the measured `git rev-list --count c0abd6b35..HEAD`. Three are this plan's; the other two (`64dca1776`, `a3010a8a0`, both `docs(94)`) were committed by another session into the same range.

## Counts

- rustInvoke channels 185 -> 188 (`engine_resolve_tool_settings` and `engine_fallback_ensure` on the sidecar's unbounded list, `engine_non_crossover_engine` bounded).
- Schedule rows added: `resolveEngineToolSettings` (shim, deletedBy 98), `resolveNonCrossoverEngine` (shim, 98), `ensureFallbackEngine` (shim, 96). **For 87-57:** its EXPECTED_SURVIVORS table does not list these three. `steam/engine/pinnedEngine.ts` was added to the twin rows' and the runTool rows' importer lists.
- `jest.mock` count: `gameCommandFacts.test.ts` 5 -> 4, `games.test.ts` 44 -> 43 (ceiling shards lowered as the ratchet requires; none raised).

## What is left in the importer map (input to 87-56b/c)

Outside importers still present (all intended for 87-56b/c): `engineIds` (decision.ts, twin.ts, bridgeWineTools.ts, gameLaunch.ts), `engineNoticeStore` (createStores.ts), `engineRuntime` (ten Steam and boot files), `engineServices` and `wineManagerReleases` (services/engineServices.ts only, which 87-56c deletes), `engineState` (launcher.ts, services/types.ts, bootstrap.ts), `engineSync` (three Steam files), `fallbackBottleCall`, `gameKey` (twin.ts), `offlineRefusal`, `prepareBottle`. Runtime member reads outside: `bootstrap.ts` (`crossover`) and `gameLaunch.ts` (`registry`). `toolSettings`, `engineConfig`, `engineDecision`, `engineEligibility`, `gamePrefix`, `launchSettings`, `perGameBottle`, `fallbackEngine` and `pinnedEngineProgress` have no outside importer; they remain only because other engine files and the multi-cluster oracles import them (87-56c deletes the directory).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dispatch arms in `rust_dispatch.rs`**
- **Found during:** Task 1 (and again in 2 and 3)
- **Issue:** the shell routes each generated channel variant to its arm in `src-tauri/src/rust_dispatch.rs`, a file the plan's `files_modified` did not list; without the match arm the generated enum does not compile.
- **Fix:** one arm per new channel, calling the new `engine_dispatch::rpc_*` function.
- **Files modified:** `src-tauri/src/rust_dispatch.rs`
- **Committed in:** 9a49f455e, 1d957e5fa, 3e9429685

**2. [Rule 3 - Blocking] Ceiling shards lowered**
- **Found during:** Tasks 2 and 3
- **Issue:** `pnpm backend-di-ceilings` fails when a ceiling is above the real jest.mock count ("shrank"). Repointing the gameCommandFacts mocks and deleting the TS fallback-engine mock removed one each.
- **Fix:** lowered `meta/backendDiCeilings/sidecar-tests-wineTools.json` (5 -> 4) and `storeManagers.steam.json` (44 -> 43). No floor lowered, no ceiling raised.
- **Committed in:** 1d957e5fa, 3e9429685

**3. [Rule 2 - Missing critical] `clearStatus` on the download wrapper**
- **Found during:** Task 3
- **Issue:** Rust sends the closing `done` status only when the request reaches it. A transport failure, an unreadable reply or a signal aborted before the request would leave the renderer on `engine-download` (the TS reporter always sent `done`).
- **Fix:** `ensurePinnedEngineThroughRust` takes an optional `clearStatus` callback run in exactly those cases; `ensureBuiltInEngineForInstall` passes a `done` status send. Covered in `pinnedEngine.test.ts`.
- **Committed in:** 3e9429685

**4. [Rule 3 - Blocking] `SteamWineToolsSource` instead of the engine services**
- **Found during:** Task 2
- **Issue:** `EngineServicesSource` carries `config`, not `globalGameSettings`, so the Steam Wine-tool path cannot take the engine's `EngineServices` and let `winetricksTarget` hand its source straight through.
- **Fix:** `SteamWineToolsSource` (paths, steam bottle and launch slices, `config`, the runtime's registry and transport) exported from `bridgeWineTools.ts`; `steamPrepareFacts` and `steamEngineFacts` take equally slim local types, derived from `BridgeBottleDeps` so no new `engineRuntime` importer appears in the map.
- **Committed in:** 1d957e5fa

**5. [Test restructuring] games.test.ts progress-sequence tests**
- **Found during:** Task 3
- **Issue:** four tests asserted the TS reporter's status sequence from `onProgress` calls the TS fallback engine made, and three asserted a terminal `done` that the TS reporter (now Rust) sent.
- **Fix:** the transport fake answers `engine_fallback_ensure` with a `PinnedEngineResult` and records `engine_cancel`; the dedupe test and the G21 download test assert the request and what the install itself sends (`creating-bottle`, `installing`); the "real two-archive progress" test is removed because the weighted percent, verify, unpack and setting-up sequence is covered by `fallback/progress.rs` (`the_percent_is_weighted_across_both_archives_and_never_goes_down`, `a_repeated_context_is_sent_once_and_setting_up_follows_only_after_a_status`, `a_failure_and_an_abort_are_logged_and_end_with_done`); the terminal-`done` assertions after a Rust failure or abort are dropped for the same reason; fake `signal: 'mock-signal'` strings became real `AbortController` signals (the wrapper attaches an abort listener).
- **Committed in:** 3e9429685

---

**Total deviations:** 5 (two blocking-file additions, two blocking fixes, one missing-critical, plus the test restructuring). **Impact on plan:** no scope creep; no gate lowered or widened, no jest.mock added, no deleted module revived.

### Verification note (not a code deviation)

`cargo fmt --check -p gamelib-shell` fails on 172 hunks, all in the generated `src-tauri/src/ipc_contract.rs` (one-line match arms the generator emits unwrapped). It failed the same way at the starting HEAD for the lines that pre-existed; the hand-written files (`engine_dispatch.rs`, `rust_dispatch.rs`) and `gamelib-engine` are rustfmt-clean. Left as is: the file is `@generated` and `pnpm check:ipc-contract` (which regenerates it byte for byte) is the gate for it.

## Authentication Gates

None.

## Known Stubs

None added by this plan. (Searched the created and modified files for hardcoded empty values, placeholder text and unwired components.)

## Threat Flags

None. The new surface is the three planned channels and matches the plan's threat register: the requests are strict (`deny_unknown_fields`, one object), `engine_fallback_ensure` names a pin id and never a URL or path, and the two unbounded channels carry written reasons in `sidecarRpc.ts` and `dialogOptionForwarding.test.ts`.

## Live checks owed (carry to the 87-58/87-59 live gate)

1. A Winetricks apply and a Run EXE during a live non-Steam fallback-engine launch act on the launch's engine (the 87-52 regression; Rust-tested, not run live).
2. A real Steam first-need download shows progress in the renderer and an abort mid-download leaves no `.tmp-*` directory under `<tools>/steam-engines`.
3. A Steam engine-download failure (offline) and a transport-level failure both leave the renderer off `engine-download` (Rust's `done`, or the wrapper's `clearStatus`).

## Self-Check

- Created files exist: `src/backend/enginewine/toolSettings.ts`, `src/backend/enginewine/fallback.ts`, the two shim tests, `src/backend/services/__tests__/winetricksTarget.test.ts`, `src/backend/storeManagers/steam/engine/pinnedEngine.ts`, `src/backend/storeManagers/steam/__tests__/pinnedEngine.test.ts`: verified below.
- Commits `9a49f455e`, `1d957e5fa`, `3e9429685` on HEAD ancestry: verified below.
- Acceptance greps: `engineOutsideImporters` present; `fn has_live_selection(&self, _key` gone; `a_live_selection_wins_over_the_stored_override` passes; `engine_resolve_tool_settings` in `engine_dispatch.rs` x2; `engine_non_crossover_engine` in `lib.rs` x7; `readStoredGameConfig`, `engineRuntime.fallback` (steamEngineDeps, bridgeWineTools, gameLaunch, gameEngineDialogs, gameInstall), `ensurePinnedEngineReportingStatus` (gameInstall) and `backend/engine/fallbackEngine` (games.test.ts) all 0; both count assertions 188; `backend-di-ceilings` PASS at jestMock=1661.
- Full runs at the last commit: `pnpm exec jest src/backend src/common` 633 suites passed (14,836 tests), `pnpm codecheck` clean, `pnpm check:ipc-contract` current, `cargo test -p gamelib-engine --lib` 189 passed, `cargo test --bin gamelib-shell engine_dispatch` 30 passed, `golden_config` and the `gamelib-wine` dxvk tests pass, scoped `npx prettier --check` over every file written is clean.

## Self-Check: PASSED

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-23*
