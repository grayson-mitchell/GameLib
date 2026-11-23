---
phase: 87-engine-wine-and-tools
plan: 56
subsystem: engine
tags: [rust, engine-ts-deletion, partial, split, d-06, d-21, enginePortComplete]
status: halted

requires:
  - phase: 87-engine-wine-and-tools
    provides: 87-52..87-55 switched the launch step, dialogs, deadline, process watch, decision, state and RunTool callers to Rust or the twin
provides:
  - the TS launch step, launch deadline, game-process watch, engine dialogs and pin download deleted with their tests and the launchEngine oracle
  - describe('enginePortComplete') in src/backend/__tests__/engineWinePortComplete.test.ts, red and listing what is still live
  - processListing moved beside its one reader (storeManagers/steam/)
affects: [87-56a, 87-56b, 87-56c, 87-57, 87-58, 87-59]

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff)
actuals:
  tokens: 44000
  tasks: 1
  commits: 2

plan_head_before: 3ef87d8fa3eac242530fcadc4a9fa1c8d063441d
plan_head_after: b8add83a44605b2ba3e75c1c8b8eae31251fadc8

tech-stack:
  added: []
  patterns:
    - "a deletion plan whose premise (every caller already switched) is checked against live non-test importers before the first delete; the check found clusters A-F still live"

key-files:
  created:
    - src/backend/__tests__/engineWinePortComplete.test.ts
  modified:
    - src/backend/engine/engineRuntime.ts
    - src/backend/engine/engineEligibility.ts
    - src/backend/engine/__tests__/engineRuntime.test.ts
    - src/backend/enginewine/twin.ts
    - src/backend/launchEngineStep.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/testUtils/testEngineRuntime.ts
    - src/backend/storeManagers/steam/bottleProcessMonitor.ts
    - src/backend/__tests__/diPhaseGates.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
  deleted:
    - src/backend/engine/launchEngine.ts
    - src/backend/engine/launchDeadline.ts
    - src/backend/engine/gameProcessWatch.ts
    - src/backend/engine/engineDialogs.ts
    - src/backend/engine/pinEngine.ts
    - src/backend/engine/__tests__/oracle/launchEngine.oracle.test.ts
    - src/backend/engine/__tests__/legacyBottleUntouched.test.ts
    - meta/backendDiCeilings/engine.json

key-decisions:
  - "Option 2 (user): the remainder of 87-56 splits into three plans inserted before 87-57: 87-56a (clusters A and B), 87-56b (clusters C, D and E), 87-56c (cluster F and the finish)"
  - "87-56 closes as a partial (status halted): its must-haves are NOT met and move to 87-56a/b/c; SVC-02 stays open"

requirements-completed: []

duration: not recorded (two executors across a checkpoint; this closing pass ~10 min)
completed: 2026-11-23
---

# Phase 87 Plan 56: Engine TS, boot steps and the notices store deleted (PARTIAL) Summary

**The safe half of the engine TS deletion landed (launch step, deadline, process watch, dialogs, pin download and their oracle, 4,394 lines out); the plan's premise that every caller had switched was false for six clusters, so the empty-directory goal moves to 87-56a/b/c by user decision.**

## Status: partial completion, deferred by user decision

This plan is closed as a partial. Of its two tasks, Task 1 (the tracer) deleted what could be deleted safely and then stopped at a blocking decision checkpoint; Task 2 (boot steps, notices store registration, store gates) was not started. The user chose Option 2 at the checkpoint: split the remainder into three plans. The items below are **deferred by user decision**, not failed work, and are not recorded as a failed self-check.

### Must-haves of 87-56: met or not

| Must-have | State |
| --- | --- |
| src/backend/engine empty (every file, tests and oracles deleted) | NOT met. 29 non-test files and the `__tests__` tree remain. Moves to 87-56a/b/c. |
| `describe('enginePortComplete')` red before, green after | Red before: DONE (written in d4b6f4d5b, trimmed to follow the deletions in b8add83a4). Green after: NOT met. Moves to 87-56c. |
| `noIntraPhaseRowsLeft` passes (no deletedBy-87 rows, no `enginewine/intraPhase.ts`) | NOT met. Moves to 87-56c. |
| `engineServices.ts`, `testEngineRuntime.ts`, `testEngineState.ts` deleted | NOT met. Moves to 87-56b / 87-56c. |
| `engine-state` and `engine-runtime` boot steps and the `steam_engine_notices` TS registration removed | NOT met (Task 2 not started). Moves to 87-56c. |
| Neither `GAMELIB_ENGINE` nor `GAMELIB_WINE` under src/ or src-tauri/src (noRollbackFlag) | Not re-measured in this plan; carried to 87-56c/87-57 with the sweep. |

SVC-02 is NOT marked complete and `requirements-completed` is empty.

## What was deleted (the two commits)

`plan_head_before` 3ef87d8fa3eac242530fcadc4a9fa1c8d063441d, `plan_head_after` b8add83a44605b2ba3e75c1c8b8eae31251fadc8, `commits: 2` (measured with `git rev-list --count`), 29 files, 99 insertions, 4,394 deletions.

1. `d4b6f4d5b` refactor(87-56): delete the TS launch step, its deadline, process watch, dialogs and pin download
   - Deleted: `engine/launchEngine.ts`, `launchDeadline.ts`, `gameProcessWatch.ts`, `engineDialogs.ts`, `pinEngine.ts`; their tests (`gameProcessWatch`, `launchDeadline`, `launchEngine.deadline`, `launchEngine`, `legacyBottleUntouched`) and `oracle/launchEngine.oracle.test.ts` (1,540 lines); `meta/backendDiCeilings/engine.json`.
   - Trimmed: `engineRuntime.ts` (+ its test), `engineEligibility.ts`, `enginewine/twin.ts`, `launchEngineStep.ts`, `sidecar/bootstrap.ts`, `testUtils/testEngineRuntime.ts`, `diPhaseGates.test.ts`, `engineWineShimSchedule.test.ts`, and one-line oracle header edits.
   - Added: `src/backend/__tests__/engineWinePortComplete.test.ts` with `describe('enginePortComplete')`.
2. `b8add83a4` refactor(87-56): the ps listing moves beside the one bottle process monitor that reads it
   - `engine/processListing.ts` and its test moved to `storeManagers/steam/`; `bottleProcessMonitor.ts` import updated; `enginePortComplete` list trimmed to match.

## Why the plan stopped: the premise was false

87-56 assumed 87-52..87-55 had switched the last caller of every file under `src/backend/engine`. The previous executor's live-importer check found six clusters that still have non-test callers. Deleting them would break the build or silently change behaviour, so it raised a decision checkpoint instead of lowering a gate or reviving anything.

### Cluster table (A-F)

| Cluster | Modules | Live non-test callers | Existing Rust ops / twins | What is missing |
| --- | --- | --- | --- | --- |
| A. Tool settings | `toolSettings`, `engineConfig`, `engineDecision`, `engineEligibility`, `gamePrefix`, `launchSettings`, `perGameBottle`, `wineManagerReleases` | `services/winetricksTarget`, `services/gameCommandFacts`, `steam/bridgeWineTools` | `engine_resolve_tool_settings`, `engine_launch_settings_get`, `enginewine/twin.ts` helpers | Shell rpc arms and rustInvoke channels for `engine_resolve_tool_settings`; shims; the three callers switched. This also closes the UNOWNED 87-52 item: Winetricks/Run EXE use the stored override during a live fallback-engine launch because the TS registry is not mirrored from the Rust selection. |
| B. Pinned-engine download | `fallbackEngine`, `pinnedEngineProgress` | `steam/gameInstall`, `prepareBottle`'s `ensurePinEngine`, `gameLaunch`, `gameEngineDialogs`, `bridgeWineTools` | `engine_fallback_ensure`, `engine_fallback_is_installed` (Rust `gamelib_engine::fallback`, single-flight per pin id) | Shell rpc arms, channels, shims (progress and cancel via `engine_cancel`); callers switched. `sweepStaleEngineTemps` is uncalled outside its tests (from 87-48). |
| C. Caller-side halves | `prepareBottle`, `engineSync`, `offlineRefusal`, `fallbackBottleCall` | Steam bridge launch/install paths | Rust owns the decision, creation and bottle ops; these are the Steam-specific halves around them | Relocate to `storeManagers/steam/engine/` (they are Steam caller code, not engine). |
| D. Runtime and state plumbing | `engineRuntime`, `engineState`, `engineNoticeStore` (incl. the sync CrossOver fast path in `steam/bottle.ts` `resolveCrossoverWine`) | `steam/bottle.ts`, sidecar boot, publish paths | `engine_state_get`, notices in Rust (87-49), `CrossoverLocator::resolve_bin_dir_sync` | Slim `engineRuntime` to `{requestRustInvoke}` plus the selection view; a sync CrossOver twin or a rewrite of `resolveCrossoverWine` before `createCrossoverLocator` can go. |
| E. Pure helpers | `engineIds`, `gameKey`, `enginePins`, `engineTypes`, `runTool`, `testedCrossoverVersions`, `demoStatus`, `crossoverLocation` | many importers across steam, services, ui | Rust has the same functions; some are pinned twins | Move to the twin or `src/common`, repoint importers, delete originals. |
| F. Oracles and fixtures | `oracle/engineConfig`, `engineState`, `engineDecision`, `fallbackEngine` oracle tests, `oracle/fixtureBottles` | oracle tests only (die with their subjects) | n/a | Delete whole after A-E; then `gameEngineState`, `engineState`, `engineNoticeStore`, the `engine-state`/`engine-runtime` boot steps and the TS `steam_engine_notices` registration, `engineServices.ts`, `testEngineRuntime/State`. |

Source of the cluster facts: the previous executor's checkpoint and the 87-43/87-47/87-48/87-52 carry-forward notes (reproduced below). The module lists were not re-derived in this closing pass beyond confirming the tree still holds them.

## The decision (Option 2) and the split

The user chose to split the remainder into three new plans inserted before 87-57. Planning them is done separately via `/gsd-plan-phase`; this plan did not write them.

- **87-56a** clusters A and B: tool settings and the pinned-engine download over the existing Rust ops (add channels, shims and arms, switch callers). Closes the UNOWNED 87-52 item.
- **87-56b** clusters C, D and E: relocate the Steam caller-side halves to `storeManagers/steam/engine/`, slim `engineRuntime` to `{requestRustInvoke}` plus the selection view, add a sync CrossOver twin (Rust has `CrossoverLocator::resolve_bin_dir_sync`) or rewrite `resolveCrossoverWine`, move pure helpers to the twin or `src/common`.
- **87-56c** cluster F and the finish: delete the oracles whole, `gameEngineState`, `engineState`, `engineNoticeStore`, the `engine-state`/`engine-runtime` boot steps and the `steam_engine_notices` TS registration; `noIntraPhaseRowsLeft` and `enginePortComplete` go green. 87-57's sweep follows.

## Deviations from Plan

### Rule 4 - Architectural premise false (checkpoint)

- **Found during:** Task 1 (tracer)
- **Issue:** the plan's must-have "every remaining file under src/backend/engine deleted" assumes no live callers; clusters A-F still have them.
- **Action:** deleted only what had no live caller, then returned a blocking decision checkpoint. User chose Option 2 (split). No gate lowered, no allow-list widened, no deleted module revived.
- **Commits:** d4b6f4d5b, b8add83a4
- **Related:** `processListing` was moved rather than deleted because `bottleProcessMonitor.ts` still reads it (b8add83a4).

**Total deviations:** 1 (Rule 4, resolved by user decision). **Impact:** the plan's deletion goal is deferred to three follow-on plans; nothing shipped in 87-56 depends on the deferred work.

## Issues Encountered

The plan-time estimate (80k tokens, confidence low) and its "delete the directory" framing under-counted the live callers. The premise should have been checked against live non-test importers at planning time; 87-56a/b/c planning should do that check per cluster.

## Known Stubs

None added by this plan.

## Authentication Gates

None.

## User Setup Required

None.

## Next Phase Readiness

- 87-56a/b/c must be planned (`/gsd-plan-phase`) and executed before 87-57. 87-57 depends on 87-56 (halted), so it is reported blocked until the split plans complete.
- The 87-58/87-59 live gate inherits the live checks below.

## Carry-forward for 87-56a/b/c, 87-57 and the 87-58/87-59 live gate

Copied verbatim from the orchestrator notes. Live checks and the two open user decisions owed at 87-58 are in the first block; carry-forward notes in the second.

### Live checks and open decisions (live-checks.md)

- (from 87-31) Live: first releasesInfoReady logs exactly one "DXMT boot update: <word>" line, and the engine online flag arrives before it.
- (from 87-31) Behaviour change: Mac staging install rpc now awaits DXMT fetch+copy (TS ran it detached).
- (from 87-53) Live: a real engine dialog from the renderer -> ack -> a display=shown line in gamelib.log.
- (from 87-34) Live: toggle DXVK / DXVK-NVAPI / VKD3D on a real Wine prefix (not run by executor).
- (from 87-35) Live: a Winetricks apply / launch with known fixes on a real prefix (not run by executor).
- (from 87-36) Live: a Wine tool button (winecfg/runExe), Run installer, known-fix launch, and a Steam-game refusal on a real prefix (coverage D5).
- (from 87-37) Live: engine release decisions against a wine-releases list a real Rust refresh just wrote (<userData>/store/wine-downloader-info.json) (coverage D5).
- (DECISION from 87-38) Unreadable bottle marker: plan said "kept, never reset", but the 87-11 goldens record the TS overwriting it; executor followed the goldens (reconcile/record_pinned rewrite an unreadable marker; only `newer` is never touched). Stricter behaviour = one-line change in gate_allows_write + two goldens become deltas.
- (from 87-39) Live: CrossOver bottle create / wineserver kill / created-bottle removal on a real CrossOver (coverage D6).
- (from 87-42) Live: a Steam launch, Steam install and a DRM launch on the Mac through the Rust bottle ops (prepare/switch, ledger, selection view).
- (from 87-42) Known limit: a fallback-bottle cancel that lands before Rust registers the cancelId is lost; the creation then runs to its end.
- (from 87-44) Live: real CrossOver licence demo-status probe, plutil build read and codesign on a bundle via run_tool (coverage D5).
- (from 87-45) Live: the production CrossOver pre-flight (G29 two-probe rule) on a real Mac (coverage D5).
- (from 87-47) Live: a real first-need download of the pinned fallback engine (~228 MB) with progress in the renderer (coverage D5).
- (from 87-48) Live: boot with a stranded `<tools>/steam-engines/.tmp-*` dir — expect one shell line `engine temp sweep: <word> (removed <n>)` and the dir gone.
- (DECISION from 87-48) The shell has no EngineLog (ctx.log is None in the app), so Rust engine log lines (e.g. "Engine: removed N", refusals) go nowhere in the app. Wiring an engine log into the uploaded gamelib.log is a privacy decision (lines may carry paths) — unowned so far.
- (from 87-49) Live: dismiss an engine notice (now a native Rust channel); confirm the TS sidecar's store mirror sees it and it stays dismissed after restart. A real corrupt notices file leaves the badge usable (Rust keeps the file byte-for-byte and answers {ok:false} to a dismissal it can't record — TS replaced the file).
- (from 87-50) Live: engine refusal dialog raises the window every time; toast and notice never raise; a dialog ack reaches Rust (engine:<n> ack id) — coverage D4.
- (from 87-51) Live: a launch deadline firing (180 s, no game process) shows the notice without raising the window; process watch sees the real game pid (D5). Note the deadline/watch lines (cancelled/fired/stood down, gameProcessWatch ...) reach no log until the engine-log decision.
- (from 87-52) Live: a non-Steam launch through the Rust engine step (engine logLines in gamelib.log and the game log), GOG/Amazon setup, engine badge (D6).
- (REGRESSION RISK from 87-52, UNOWNED) During a live non-Steam launch on a fallback engine, Winetricks / Run EXE target resolves from the stored override, not the launch's engine: engine/toolSettings.ts reads the TS registry/overlay, and nothing mirrors the Rust selection into it. No plan 87-53..56 names switching winetricksTarget/gameCommandFacts to Rust tool_settings.
- (LOG GAP now real from 87-52) Rust-only step.warn lines (no valid prefix, bottle could not be created, launch blocked offline, override unavailable, pin table unreadable, selection rejected, could not switch back to CrossOver, DXVK setup failed, cannot switch engine) + registry/ledger + deadline/watch lines reach no log. TS equivalents did. Refusal dialogs still show.
- (from 87-54) Live: a real Steam bridge launch on the Mac: deadline firing end to end via engineDeadlineFired, overlay notices, engine badge after a Steam launch (D6).
- (from 87-55) Live: a real DRM runner clone through Rust run_tool, an abort mid-clone, and a cancel racing registration (live-gate item 1).

### Carry-forward notes (carry.md)

- (from 87-43, for 87-56) 87-43 could NOT delete four modules the still-TS launch step calls synchronously: engine/bottleLedger, engineRegistry (incl. createEngineRegistry's private store), engine/perGameBottle, engine/gamePrefix (+ their tests), plus engine/pinEngine.ts, the enginePins.ts re-export, oracle/fixtureBottles.ts. 87-56's engine-gate deletion must remove them with launchEngine.ts. legacyBottleUntouched.test.ts was kept and repointed.
- (from 87-37, for 87-56) engine/wineManagerReleases.ts reads <userData>/store/wine-downloader-info.json directly; delete with the engine TS in 87-56.
- (from 87-39, for 87-56) twin.ts exports six extra helpers as deletedBy:87 rows; make them private in 87-56.
- (from 87-40/41/42) No engine is downloaded in Rust yet: prepareBottle runs the TS pin download (restorePinEngine / ensurePinEngine, now engine/pinEngine.ts) and re-asks Rust when it answers `no DXVK source to restore`. Callers register the switch's returned selection.
- `pnpm backend-di-ceilings` rejects new jest.mock calls — use jest.spyOn or injected seams.
- Avoid `git checkout -- <file>` (post-checkout hook runs pnpm i). .planning/WINDOWS.md row 3 has a pre-existing table/JSON mismatch; leave it.
- (from 87-44, for 87-55) The four new ops engine_cx_resolve_bin_dir, engine_cx_demo_status, engine_run_tool, engine_cancel have NO shell rpc arms yet; 87-55 registers them when it switches the bridge's RunTool and CrossOver bin-dir callers. Two Rust CrossOver locators coexist until then: the shell's older locate_crossover_bin_dir behind EngineCtx.crossover_bin_dir, and the new crossover::locate::CrossoverLocator — 87-55 should collapse to one.
- (from 87-44) crossover::tested_versions has dismiss_untested_notice over a NoticeStore trait (87-49's notices store can implement it).
- (from 87-45, for 87-46) The whole launch decision (incl. WR-01 cx-inconclusive) is already ported in gamelib-engine/src/decision/ and 118/122 decision goldens replay; 87-46 mostly has the offline gate, decision_incidents.rs and verification left. golden_decision.rs does not yet read the `gate` or `launch` fields of a launch item; offline_launch_certainly_blocked is already ported in gamelib_engine::offline. engine_decide_launch takes only the stored override and monitor phase (pins/marker_view are read in Rust; `pins` arg = bad-args).
- (from 87-45) New decision ops (engine_decide_launch, engine_decide_creation, engine_list_override_options, engine_preflight_crossover, engine_is_crossover_missing) have no shell rpc arms yet.
- (from 87-46, for 87-50) The offline gate (gamelib_engine::offline / decision::offline::launch_outcome) is verified against every launch golden but NOT composed into a production function; 87-50 composes it inline, as launchEngine.ts does.
- (from 87-47) Rust now has gamelib_engine::fallback (ensure_pinned_engine[_in/_detailed], single-flight per pin id, engine-fallback registrant; prune::remove_guarded; Flights::active_installs). Ops engine_fallback_ensure / engine_fallback_is_installed (no shell rpc arms yet — 87-55, cancel via engine_cancel). Nothing calls it yet: TS pinEngine.ts / fallbackEngine.ts / pinnedEngineProgress.ts still download until 87-56.
- (from 87-47, for 87-48) The three boot-sweep goldens are named in SWEEP_CASES in golden_fallback.rs for 87-48; reuse prune::remove_guarded and Flights::active_installs.
- (from 87-47, for 87-50) CtxPerGameDeps::ensure_pin in Rust still answers Failed("the pinned engine is not installed"); 87-50 (or the per-game path) should call ensure_pinned_engine there, mapping Ready / aborted / failure to PinOutcome.
- (from 87-48) The shell has NO EngineLog: ctx.log is None in the app, so gamelib-engine's own log lines go nowhere at runtime. Wiring an engine log into the uploaded gamelib.log is an open privacy decision (lines may carry paths); if your plan ports engine log lines a user would need, say in the SUMMARY whether they reach any log.
- (from 87-48) engine/fallbackEngine.ts's sweepStaleEngineTemps is now uncalled outside its own tests (delete in 87-56).
- (from 87-49, for 87-50/87-52) Rust gamelib_engine::state::{notices, engine_state, publish} exists: get_engine_state(GameFacts, StateProbes), non_steam_facts, engine_state_get op whose `facts` carries a Steam-bridge game's, record_launch_decision, preflight cache (60 s unhealthy TTL), single flight per bottle, seq counter. Until 87-50/87-52 switch callers, the TS engineState.ts and Rust hold SEPARATE preflight caches and seq counters (both read the one notices file). engineState.ts is still live in TS until 87-56. dismissEngineNotice is already native.
- (from 87-50, for 87-51) launch/step.rs select_engine_for_launch exists; LaunchState (launch/mod.rs), ctx.launch_state.take_ledger_bottle, ctx.launch_settings (LaunchSettingsRegistry) and ctx.registry are ready for the deadline/process watch/end of launch. The 24 deadline goldens (end/arm/advance/registry-clear/quit steps) are pinned as left for 87-51 in golden_launch.rs. DisplayAcks logs unconfirmed dialogs after 15 s from a shutdown-registered task.
- (from 87-50, for 87-52/87-55) No shell rpc arms for engine_launch_select / engine_dialog_displayed yet; the sidecar's dialogDisplayed handler does not forward `engine:` ack ids to Rust (87-55 per 87-50; check your plan — 87-53 forwards renderer engine dialog acks). TS launcher still runs its own selectEngineForLaunch (87-52 switches it). CtxPerGameDeps::ensure_pin now really downloads via fallback::ensure_pinned_engine.
- (from 87-51, for 87-52) Rust ops engine_launch_arm_deadline, engine_launch_end, engine_deadline_arm, engine_deadline_cancel, engine_launch_settings_get exist (no shell rpc arms yet — 87-55 per 87-51). The sidecar has no `engineDeadlineFired` handler yet; it must run onBridgeLaunchDeadline (bridge launches get engineDeadlineFired {key, reason:"no-game-process"} via ui.send_to_sidecar). Until callers switch, the TS launcher arms its own deadline and watch. Arming ops answer `<op>:not-shared` unless the ctx was shared (the shell now calls ctx.share()). A quit ends deadline tasks and their entry in Rust (TS left them pending).
- (from 87-52, for 87-53) engineFlowRegistration.ts now registers nothing; delete it, and remove the REGISTERS_NOTHING entry in ipcDomainCensus and the NO_COUNT_CLAIM entry in flowRegistrationCensus (census file count 20 -> 19).
- (from 87-52, for 87-54) Steam launches still record decisions in the TS engineState service, while the renderer's getEngineState now reads Rust for Steam too — the Steam badge misses a Steam launch's recorded decision until 87-54 moves Steam's recordLaunchDecision. 87-54 also owns the sidecar's engineDeadlineFired handler (must run onBridgeLaunchDeadline). The Steam state facts helper is named steamEngineStateFacts (87-54 plans steamEngineFacts).
- (from 87-52, UNOWNED) engine/toolSettings.ts still reads the TS registry/overlay for hasLiveSelection/overlay; nothing mirrors the Rust selection into the TS registry, so during a live non-Steam fallback-engine launch the Winetricks/Run EXE target uses the stored override. If your plan touches winetricksTarget/gameCommandFacts/toolSettings, switch them to the Rust tool_settings (which sees the live selection) or say explicitly in the SUMMARY that it remains open. **Owner now: 87-56a.**
- (from 87-53) engine_dialog_displayed now has a shell arm and the sidecar forwards `engine:` acks to Rust; engineFlowRegistration.ts is deleted. Live UAT item: a real engine dialog -> ack -> `display=shown` line in gamelib.log.
- Quick task 261124-8f3 (bottle-port quirks: sanitise / is_bottle_provisioned) edited gamelib-engine engines.rs, lib.rs, golden_bottles.rs, bottle goldens/deltas, bottle_twin.json and src/backend/enginewine/twin.ts. Read its commits/summary under .planning/quick/261124-8f3-*/ before touching those files.
- (from 87-54) Steam bridge decision/creation/pre-flight/state/deadline now go through Rust shims (enginewine/decision.ts, state.ts, deadline.ts). engine_cx_resolve_bin_dir has its channel and shell arm but NO shim yet — 87-55's. engine_decide_launch and engine_preflight_crossover are on the sidecar's unbounded list.
- (from 87-54) Another session may have UNCOMMITTED edits in .planning/STATE.md and .planning/ROADMAP.md (phase 90 split, total_phases, state_head). Commit only your own hunks (build them into the index, e.g. git add -p or apply a patch to the index); never sweep the other session's hunks in, never discard them.

The orchestrator kept its live-check list in two files; both are merged above (the first close-out pass saw only the three-line one). The open user decisions are the lines tagged DECISION, REGRESSION RISK and LOG GAP. The REGRESSION RISK (Winetricks / Run EXE target during a live fallback-engine launch) is now owned by 87-56a.

## Self-Check

Scope of the check: what this plan actually shipped (the two commits and this SUMMARY). The deferred must-haves are recorded above as deferred by user decision and are not counted as failures.

- Commit d4b6f4d5b on HEAD ancestry: verified below.
- Commit b8add83a4 on HEAD ancestry: verified below.
- `src/backend/__tests__/engineWinePortComplete.test.ts` exists: verified below.
- Deleted modules (`launchEngine.ts`, `launchDeadline.ts`, `gameProcessWatch.ts`, `engineDialogs.ts`, `pinEngine.ts`) absent from `src/backend/engine`: verified below.

## Self-Check: PASSED (for shipped scope; remaining must-haves deferred to 87-56a/b/c by user decision)

---
*Phase: 87-engine-wine-and-tools*
*Closed partial: 2026-11-23*
