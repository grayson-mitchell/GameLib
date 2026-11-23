---
phase: 87-engine-wine-and-tools
plan: 42
subsystem: wine
tags: [rust, gamelib-engine, shims, selection-view, bottle-ops, ledger, d-03, d-15, d-24]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the bottle marker, lifecycle, switch, fallback creation and restore ops of gamelib-engine (87-38 to 87-41), the D-24 twin and the survivor schedule (87-03, 87-39)
provides:
  - enginewine/bottles.ts shims prepareBottleForEngine, killBottleWineServerWith, removeCreatedBottleDir, createFallbackBottle, cancelFallbackBottle, reconcileBottleEngineMarker, recordPinnedBottleEngine, recordCrossoverBottleEngine, markGameRunning, markGameStopped, clearEngineSelection (each a schedule row, deletedBy 96)
  - enginewine/selectionView.ts engineSelectionView (get, apply, clear, reset) and registerEngineSelectionView, with the vectors test over selection_registry.json
  - eleven rustInvoke channels (RUST_ENGINE_BOTTLE_*, RUST_ENGINE_LEDGER_MARK_*, RUST_ENGINE_SELECTION_CLEAR) with strict shell arms, and the Rust-to-sidecar send channel engineSelectionChanged
  - gamelib-engine ops engine_ledger_mark_running, engine_ledger_mark_stopped, engine_selection_clear, engine_bottle_cancel_create; the registry change hook and quiet setters
  - engine/prepareBottle.ts, engine/engineSync.ts and engine/fallbackBottleCall.ts, the caller-side halves around the one-call shims
affects: [87-43, 87-56, 96]

actuals:
  tokens: 47600
  tasks: 2
  commits: 2

plan_head_before: 331c784ae9ed597b3deef7018ee3498a72f5835d
plan_head_after: cf492c6978166df20bbc254f4d5c8aadbfd581ec

tech-stack:
  added: []
  patterns:
    - "a TS callback becomes a value in the shim's one object argument; what cannot be a value (the pin download, the status update, the view write) is one caller-side helper shared by every caller, never part of the shim body (checkShimShape)"
    - "a state Rust owns and a sync TS reader needs is a write-through view: written from op replies and from a shell-originated frame, and every TS write also reaches Rust; a Rust write that fails is logged, never fatal to cleanup"
    - "an op-initiated registry change is quiet (its reply carries it); only a change Rust makes on its own sends engineSelectionChanged"
    - "a jest stand-in for Rust's bottle ops runs the retained TS reference (bottlePrimitives) over the test's own spawn and paths, so spawn-trace and tree assertions are unchanged until 87-43 deletes the reference"

key-files:
  created:
    - src/backend/enginewine/bottles.ts
    - src/backend/enginewine/selectionView.ts
    - src/backend/enginewine/__tests__/selectionView.test.ts
    - src/backend/enginewine/__tests__/bottlesShim.test.ts
    - src/backend/engine/prepareBottle.ts
    - src/backend/engine/engineSync.ts
    - src/backend/engine/fallbackBottleCall.ts
    - src/backend/engine/__tests__/prepareBottle.test.ts
    - src/backend/engine/__tests__/engineSync.test.ts
    - src/backend/engine/__tests__/fallbackBottleCall.test.ts
    - src/backend/testUtils/fakeBottleRust.ts
  modified:
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/src/bottles/registry.rs
    - src-tauri/crates/gamelib-engine/src/bottles/switch.rs
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/ipc/sidecarInternal.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/sidecarRpc.ts

key-decisions:
  - "`registerSelection: true` is passed on every prepare and the reply's selection is applied to the view (87-40/87-41 carry-forward). The TS launch still registers the decided selection BEFORE the switch through `engineRuntime.registry.setEngineSelection` (validating, backed by the view), because a `dxvk-failed` refusal on a built-in engine keeps launching on the selection that was set and Rust registers only on `ok`; Rust's registry therefore holds a selection only once a prepare succeeded, and that gap closes when the launch select moves to Rust (Phase 88)."
  - "`ensure_pin` (carry-forward): no engine is downloaded in Rust yet, so `engine/prepareBottle.ts` supplies it. Rust refuses a restore whose DXVK source is missing with `dxvk-failed` / `no DXVK source to restore ...` BEFORE it stops, installs or writes anything (a Rust unit test pins that); the helper then runs the caller's TS `ensurePinEngine` (the marker's pin, else the current pin; the Steam callers' progress-reporting `restorePinEngine`, the non-Steam launch's `ensurePinEngine` from the switch services) and asks Rust once more. Without a download callback the refusal stands."
  - "A TS `AbortSignal` on a fallback creation is a cancel id: `engine_bottle_create_fallback` takes an optional `cancelId` and `engine_bottle_cancel_create` ends that creation; the Rust creation cleans up exactly what it made. A cancel that lands before Rust has registered the id is lost and the creation runs to its end (documented in fallbackBottleCall.ts)."
  - "The running-games ledger and the selection registry are written twice: the TS mirror at once (engineDecision still reads the ledger and the launch settings still read the registry synchronously) and Rust through the shim after, in `engine/engineSync.ts`. Sync callbacks (the monitor's onStopped, the wine launch's settle handlers) start the Rust half and move on; a Rust write that fails is logged and never stops a cleanup."
  - "The boot's selections are `engineSelectionView` (`EngineRuntimeDeps.selections`, passed by the 'engine-runtime' boot step); a runtime built without one keeps a private map, which is what the isolation tests and the engine oracles use."
  - "`engineSelectionChanged` is a shell-originated send channel: schema in sidecarInternalSendArgs, caller `shell`, absent from the renderer allow-list (rendererAllowList.test.ts proves it, T-87-41); the sidecar re-validates the frame and drops a malformed one."
  - "Registry changes a TS-initiated op makes are quiet (`PrepareArgs.register_quietly`, `Registry::*_quiet`); only a change Rust makes on its own sends the frame. Nothing in Rust changes the registry on its own yet (the deadline and exit belong to Phase 88), so the hook is wired and tested but silent in the live app today."
  - "Unreadable markers are rewritten (goldens parity, a pending user decision): unchanged (87-38)."

patterns-established:
  - "no new `jest.mock` in a test: the backend-di ceilings reject it, so new tests spy (`jest.spyOn`) and games.test.ts swapped its two new module mocks for spies"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "The Steam launch prepares its bottle in Rust through one shim (prepareBottleForEngine), with the pin download, the status update and the view write around it, and the sync view sees the resulting selection"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/prepareBottle.test.ts; src/backend/enginewine/__tests__/bottlesShim.test.ts; src/backend/storeManagers/steam/__tests__/games.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "engineSelectionView replays every selection_registry.json sequence the way Rust answers it, applies and clears a selection from Rust's engineSelectionChanged frame, and drops a malformed frame; the frame is not renderer-reachable"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/enginewine/__tests__/selectionView.test.ts; src/backend/sidecar/__tests__/rendererAllowList.test.ts; src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts"
        status: pass
      - kind: unit
        ref: "src-tauri/src/engine_dispatch.rs#a_registry_change_sends_one_selection_changed_frame_and_a_quiet_one_sends_none; gamelib-engine registry.rs#the_change_hook_hears_a_notifying_change_and_not_a_quiet_one"
        status: pass
    human_judgment: false
  - id: D3
    description: "The kill, removal, fallback creation (with cancel), reconcile, record, ledger and selection-clear shims each send one typed call, are scheduled rows, and every caller (bridge lifecycle, launch, still-TS decision, launch step and per-game bottle) is rewired; no sync function became async to read a selection"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts; src/backend/enginewine/__tests__/bottlesShim.test.ts; src/backend/engine/__tests__/engineSync.test.ts; src/backend/engine/__tests__/fallbackBottleCall.test.ts"
        status: pass
      - kind: unit
        ref: "pnpm exec jest src/backend (14563 passed); src-tauri: cargo test -p gamelib-engine --features testing (179 passed), cargo test --bin gamelib-shell engine_dispatch"
        status: pass
    human_judgment: false
  - id: D4
    description: "A real Steam launch, install and DRM launch on a Mac through the Rust bottle ops, with a live CrossOver and wineserver (the jest tests run the callers against recording fakes; nothing here runs Wine)"
    verification: []
    human_judgment: true
    rationale: "No live Mac run was made; the switch, creation and removal replay Rust goldens against scripted spawns, and the caller wiring is proved against fakes. The live check belongs to 87-43 or a UAT of the phase."

duration: not timed (start time was not captured)
completed: 2026-11-24
---

# Phase 87 Plan 42: Bottle, ledger and selection callers switched to Rust Summary

**Every bridge and engine caller of the bottle switch, creation, kill, removal, marker, ledger and selection now reaches the gamelib-engine ops through one-call shims in `enginewine/bottles.ts`, and the synchronous selection reads stay synchronous through the D-24 `engineSelectionView`, a write-through mirror of Rust's registry fed by op replies and by Rust's own `engineSelectionChanged` frame; the TS bottle primitives and engine switch have no live non-test caller left.**

## Performance

- **Tasks:** 2 of 2 (Task 1 a tracer whose `<verify>` is automated only, re-run end to end before Task 2, no checkpoint)
- **Files:** 61 changed across the two code commits (2768 insertions, 244 deletions)

## Accomplishments

- **Tracer (Task 1):** channel `engine_bottle_prepare` (and the other ten) through the contract, strict zod, shell arms and the unbounded list; the `prepareBottleForEngine` shim; `engineSelectionView`; `engine/prepareBottle.ts` (pin-download retry, `onSwitching` from the reply's `changed`, view apply); `selectLaunchEngine` prepares through them. The Rust registry gained a change hook wired to `engineSelectionChanged` in `build_ctx`, quiet setters for op-initiated changes, and the ops `engine_ledger_mark_running`, `engine_ledger_mark_stopped`, `engine_selection_clear` and `engine_bottle_cancel_create`.
- **Remaining shims and callers (Task 2):** the other ten shims, `engine/engineSync.ts`, `engine/fallbackBottleCall.ts`, the bridge and still-TS engine files rewired, the view's frame listener registered once from `handlers.ts`, the per-file ripple below.
- **Non-vacuity:** the vectors test fails if the view ignores a clear or applies a refused set; the frame tests fail if a malformed frame is applied; `rendererAllowList.test.ts` fails if `engineSelectionChanged` joins the renderer set. Count floors and the schedule's both-direction discovery are unchanged.

## Task Commits

1. **Task 1 (tracer): prepareBottleForEngine from the Steam launch through one shim into Rust, the selection view and the engine bottle, ledger and selection ops** - `86fbdfa0a` (feat)
2. **Task 2: the remaining bottle, ledger and selection callers reach Rust through shims, sync reads stay sync through the selection view** - `cf492c697` (feat)

## Per-file ripple (what each caller change touched)

| File | Change |
| --- | --- |
| `storeManagers/steam/gameLaunch.ts` | prepare through `prepareBottle` with `steamPrepareFacts` values; every clear is `await dropEngineSelection`; the deadline reads `engineSelectionView.get` and clears with an await |
| `storeManagers/steam/gameInstallBridge.ts` | redist-step prepare through `prepareBottle`; `discardNewBridgeBottle` awaited (now async, takes the Rust deps) |
| `storeManagers/steam/gameEngineDialogs.ts` | DRM-launch prepare through `prepareBottle` with the status update |
| `storeManagers/steam/gameBridgeLaunch.ts` | `reconcileBottleEngineMarker` shim over `engineRuntime` |
| `storeManagers/steam/gameBridgeLaunchGate.ts` | the not-started clear is `await dropEngineSelection` |
| `storeManagers/steam/gameBridgeWineLaunch.ts` | selection read from the view; `markGameRunning` awaited (`recordGameRunning`); the monitor's onStopped and the wine settle handlers (sync) start the Rust half with `void`; the catch awaits both |
| `storeManagers/steam/gameLaunchOverlay.ts`, `bridgeWineTools.ts`, `bridgeBottle.ts` | selection reads are `engineSelectionView.get`; `getBridgeBottleSettings` stays sync |
| `storeManagers/steam/bridgeBottleLifecycle.ts` | kill via a local `killWith` over the shim (x2), `removeCreatedBottleDir` awaited (x5, incl. `discardNewBridgeBottle`), fallback creation via `createFallbackBottleCancellable`, pinned and CrossOver markers via the shims; `BottleLifecycleDeps.engineRuntime` also needs `requestRustInvoke` |
| `engine/launchEngine.ts` | prepare dep is `prepareBottle` (values, `ensurePinEngine` from `switchDeps`); `refuse` is async; ledger and clears through `engineSync`; `endEngineLaunch` is async |
| `launcher.ts`, `storeManagers/gog/setup.ts`, `storeManagers/nile/setup.ts` | `endEngineLaunch` / `releaseEngine` awaited |
| `engine/engineDecision.ts` | `killCrossoverWineserverWith` takes the engine runtime and calls the kill shim |
| `engine/perGameBottle.ts` | `createCrossoverBottle` kill and removal via the shims (its deps gain `engineRuntime`); the fallback creation via `createFallbackBottleCancellable` |
| `engine/engineRuntime.ts` | `EngineRuntimeDeps.selections`; `bootstrap.ts` passes `engineSelectionView` |
| `engine/engineRegistry.ts` | `createEngineRegistry(store)` over a `SelectionStore` (the view in the boot, a private map otherwise) |
| `sidecar/handlers.ts` | one `registerEngineSelectionView(ipc)` call |

`engineSwitch.ts`, `bottlePrimitives.ts` and the `switcher` that `engineRuntime.ts` still builds have no live non-test caller; 87-43 deletes them.

## Decisions Made

See `key-decisions` above (selection registration and the pre-switch TS set, `ensure_pin`, the cancel id, the double write, the boot's selections, the send channel, quiet changes).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] A fallback creation could no longer be cancelled**
- **Found during:** Task 2 (bridgeBottleLifecycle `createFallbackBottle`)
- **Issue:** the TS creation took the install's `AbortSignal` (59-REVIEW CR-01: abort stops the wineserver and removes what the call created); the Rust op ran with no cancel, so Cancel during a bridge bottle creation would have done nothing.
- **Fix:** optional `cancelId` on `engine_bottle_create_fallback`, op `engine_bottle_cancel_create` (channel `RUST_ENGINE_BOTTLE_CANCEL_CREATE`, shim `cancelFallbackBottle`, schedule row), `engine/fallbackBottleCall.ts` turning the signal into the id. A cancel that lands before Rust registered the id is lost (documented).
- **Files modified:** gamelib-engine `lib.rs`, the contract files, `enginewine/bottles.ts`, `engine/fallbackBottleCall.ts`
- **Verification:** `the_cancel_op_ends_the_creation_that_registered_its_id` (Rust), `fallbackBottleCall.test.ts`, the lifecycle tests' abort cases (the fake maps the cancel to an abort)
- **Committed in:** 86fbdfa0a, cf492c697

**2. [Rule 3 - Blocking] The Rust half (ledger, clear and cancel ops, registry hook, all eleven channels) landed in Task 1's commit**
- **Found during:** Task 1
- **Issue:** the plan puts the registry hook and the later channels in Task 2, but the schedule's both-direction discovery and the contract generator want the Rust ops, the shell arms and the pins together, and the tracer's own verify chain runs the shell tests.
- **Fix:** Task 1's commit carries the whole Rust side and the contract; Task 2 is TypeScript only. The selection view's schedule row and its vectors test also moved into Task 1 (the schedule demands the test file exist when the row does, the plan allowed this).
- **Committed in:** 86fbdfa0a

**3. [Rule 3 - Blocking] The module-state census sanctions the view's Map**
- **Found during:** Task 1
- **Issue:** the plan fixes the view as "a module Map"; the D-66.4-02 census rejects any module state outside a sanctioned list.
- **Fix:** `src/backend/enginewine/selectionView.ts: 1` added to the sanctioned list in `moduleStateCensus.test.ts` with its reason and its Phase 96 deletion.
- **Committed in:** 86fbdfa0a

**4. [Rule 1 - Bug avoided] The literal acceptance `grep -c RUST_ENGINE_BOTTLE_PREPARE bottles.ts == 1` cannot hold**
- **Issue:** the name must appear in the import and in the call, so the count is 2 (`HEAD=error:2` in the plan is the same measurement). The intent, one call site, holds.
- **Fix:** none; recorded here.

**5. [Rule 3 - Blocking] The test seams moved with the callers**
- `engine/__tests__/oracle/*`, `perGameBottle.test.ts`, `bridgeBottle.test.ts`, `bridgeBottleLifecycle.test.ts`, `launchEngine.test.ts`, `legacyBottleUntouched.test.ts`, `engineDecision.test.ts` and `games.test.ts` now stand in for Rust's bottle ops with `testUtils/fakeBottleRust.ts`, which runs the retained TS reference (`bottlePrimitives`) over the test's own `spawnAsync` and paths, so every spawn-trace and tree assertion is unchanged; `testEngineRuntime.ts` and `fakeBottleGateRust.ts` answer the ledger and clear channels; `createTestEngineRuntime` shares (and empties) the process-wide view unless `privateSelections` is set. Where a test could not keep its assertion it was reworded: the signal reaching the spawn is now "the signal that reached the spawn is aborted" (the cancel id), `legacyBottleUntouched` proves what `selectEngineForLaunch` itself leaves alone with a stub prepare (the marker handling is the Rust goldens' and `switch_incidents.rs`'s, 87-41; this closes the carry-forward that the launch-step half belonged here). `games.test.ts` uses two `jest.spyOn` instead of two new `jest.mock` (the backend-di ceiling).
- **Committed in:** 86fbdfa0a, cf492c697

---

**Total deviations:** 5 (1 Rule 2, 3 Rule 3, 1 criterion recorded)
**Impact on plan:** all necessary for correctness (a lost cancel) or to keep the gates and tests honest; no scope beyond the plan's callers.

## Issues Encountered

- `getBridgeBottleSettings` still calls `crossoverSettings`-style values eagerly (`steamPrepareFacts` computes them before the call, only for a switch to CrossOver); the TS switch computed them lazily during the restore. The registered selection the facts read is unchanged by the switch, so the value is the same.
- The monitor phase is read once before the call instead of at the busy check; a game that starts in between is still refused by Rust's own ledger check.
- `.planning/WINDOWS.md` row 3 table/JSON mismatch left alone as instructed.

## Known Stubs

None. No stub, skipped test or unrun verify was left.

## Threat Flags

| Flag | File | Description |
| --- | --- | --- |
| threat_flag: new-send-channel | src/common/types/ipc/sidecarInternal.ts | `engineSelectionChanged` is Rust to sidecar only, strictly schemed, caller `shell`, not in the renderer allow-list (T-87-41 mitigated and tested) |
| threat_flag: new-op-surface | src-tauri/src/engine_dispatch.rs | eleven rustInvoke arms take one object the crate decodes strictly (deny-unknown-fields, absolute programs, clean names, engine inside the engine roots, cancel ids 1 to 64 of `[A-Za-z0-9_-]`) |

## Self-Check: PASSED

- Files created exist: bottles.ts, selectionView.ts, selectionView.test.ts, bottlesShim.test.ts, prepareBottle.ts, engineSync.ts, fallbackBottleCall.ts, their tests and fakeBottleRust.ts (all under `src/backend`).
- Commits `86fbdfa0a` and `cf492c697` are ancestors of HEAD; `commits: 2` measured from the ledger base `331c784ae`.
- `grep -rn getEngineSelection src/backend/storeManagers | grep -v __tests__` is 0; selectionView.test.ts passes every vector sequence; `pnpm exec jest src/backend` 14563 passed; `cargo test -p gamelib-engine --features testing` 179 passed; `pnpm codecheck`, `pnpm check:ipc-contract`, `pnpm backend-di-ceilings`, `pnpm steam-line-ceiling`, `pnpm planning-gates` pass.

## Next Phase Readiness

Ready for 87-43: repoint the sync pure helpers' imports to the twin and delete `bottlePrimitives.ts`, `engineSwitch.ts`, the `switcher`, `engineRegistry`'s private store and `fakeBottleRust`'s TS reference together. A live Mac run of a Steam launch, an install and a DRM launch through these ops is still owed.

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
