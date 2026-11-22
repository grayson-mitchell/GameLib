# Phase 87: Engine, Wine and tools - Context

**Gathered:** 2026-11-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Engine selection, per-game bottles and the Wine tooling move from the Node sidecar to Rust and
behave exactly as before on real engines (SVC-02). The phase ports `src/backend/engine/` (about
7.1k TS source lines, 9.2k test lines), `src/backend/wine/` (1.3k / 0.7k) and `src/backend/tools/`
(2.9k / 4.7k), and deletes their TS and their sidecar registrations
(`sidecar/engineFlowRegistration.ts`, `sidecar/wineToolsFlowRegistration.ts`, and the engine/wine
channels in `runnerMiscFlowRegistration.ts`) within the phase.

In scope: the CrossOver-first decision with the pinned Wine-Staging+DXVK fallback, CrossOver
detection and the trial/demo probe, per-game bottles and the bottle ledger, engine switching and
the `.gamelib-engine.json` markers, the fallback-engine download, the launch-time engine step
(`launchEngine`, `launchDeadline`, `gameProcessWatch`, `engineDialogs`, `launchSettings`), engine
state and notices, the wine-manager releases and runtimes downloads, the Winetricks queue, and the
DXVK/DXMT/vkd3d tools.

Out of scope: argv/env building and `launcher.ts` itself (88), GPU system info /
`utils/systeminfo/gpu` with the `pci_ids_*` caches (moved to 88 by D-05), and the Steam bridge
code that calls the engine (95–97; it reaches Rust through shims, D-03). The CrossOver
compatibility index and the umu lookup already ported in 86.

</domain>

<decisions>
## Implementation Decisions

### Where 87 ends
- **D-01:** **The launch-time engine step ports in 87.** `launchEngine.ts` (offline refusal,
  pre-flight with the G29 two-probe rule, fallback when CrossOver is missing/expired/broken,
  first-need download with progress, registration, the DXVK switch, the fallback toast) and its
  helpers `launchDeadline`, `gameProcessWatch`, `engineDialogs` and `launchSettings` move to Rust.
  `launcher.ts` and `storeManagers/{gog,nile}/setup.ts` call it through a typed `rustInvoke` shim
  until 88 ports them. Phase 88 owns only command-line/environment building. This keeps SC1 (live
  fallback) entirely inside 87.
- **D-02:** **Rust emits the engine dialogs and toasts.** `engineDialogs` keeps its rules (a dialog
  on every refused attempt; `showEngineNotice` never takes focus and never raises the window) and
  the `gamelib:steam.engine.toast.*` strings unchanged.
- **D-03:** **Bridge-used engine modules port now, and the bridge reaches them through shims.**
  `bottlePrimitives` (17 bridge callers), `engineSwitch`, `engineDecision`, `runTool`,
  `launchDeadline` and `engineState` get a Rust owner in 87. Their callers in
  `storeManagers/steam/**` (bridge, drm, overlay, directLaunch, `steamEngineDeps`) call typed
  `rustInvoke` shims with the same signature, following 86 D-05/D-06. Each shim is a row in the
  schedule test with its deleting phase (95, 96 or 97). **Research must count the synchronous call
  sites.** A sync TS helper becoming an async shim ripples through bridge code, and the plan must
  show each ripple, or keep a sync read where it is a pure read of a file Rust owns (the 86 "native
  read channel" shape). — **Reversibility:** costly — every shim and async ripple lives in bridge
  code until 95–97.
- **D-04:** **Two crates: `gamelib-engine` (+cli) and `gamelib-wine` (+cli).** `gamelib-engine` holds
  the decision, CrossOver detection and demo probe, bottles and ledger, engine switch and markers,
  the fallback engine, engine state and notices, and the launch step. `gamelib-wine` holds the
  wine-manager releases, the runtimes download, Winetricks (queue, environment, apply guard, list
  parse, output classifier) and the DXVK/DXMT/vkd3d tools. `gamelib-wine` may depend on
  `gamelib-engine` paths; never the reverse. Each has its own dispatch and `-cli`, Tauri-free (the
  Phase 63–86 crate pattern).
- **D-05:** **GPU system info moves to 88.** `utils/systeminfo/gpu` has one real consumer,
  `launcher.ts`. **Amend `82-STATE-OWNERSHIP.md`:** the `pci_ids_device` and `pci_ids_vendor` rows'
  "TS mirror deleted" cell moves from 87 to 88, recorded as an amendment with the reason (as 86
  D-04/D-27 did). Re-check the other 87-scheduled rows (`wineDownloaderInfoStore`,
  `steam_engine_notices`, `steam-engines-dir`) against D-03/D-04 in the same amendment.

### Rollback window
- **D-06:** **No `GAMELIB_ENGINE` flag. Each sub-slice's TS is deleted once its goldens pass.** The
  83 D-05 flag helper stays unbuilt. A dual path over shared bottles, ledger and markers is the
  riskier state. Sub-slices are engine decision + fallback + launch step, bottles + ledger + switch,
  wine downloads, and tools. Each one's TS and registrations are deleted in the same plan as its
  port or the next, once its goldens pass. The live gate at the end of the phase proves the whole
  set. A gate failure is fixed in Rust and nothing is revived. — **Reversibility:** costly —
  restoring a sub-slice means reviving its TS and registrations from git.
- **D-07:** **On-disk state is byte-compatible behind the StoreHost version gate.** Rust reads and
  writes the bottle ledger, `<bottle>/.gamelib-engine.json`, `cxbottle.conf` edits, engine notices
  and the `wine-downloader-info` store byte for byte as the TS does, reusing the Phase 85
  `store_version_gate` that already decides marker versions (`stores/bottleVersionGate.ts`). A
  marker written by a newer build is never overwritten. A corrupt marker or ledger is kept, never
  reset (FND-06). Goldens include a fixture set of bottles and markers as existing builds wrote
  them, including the `wine-manager` / null-pinId / retired-pin markers from 61 HUMAN-UAT item 4.
  — **Reversibility:** one-way — an on-disk format change would strand bottles written by released
  builds.

### Parity oracle
- **D-08:** **TS goldens plus selected Rust tests.** Before any Rust for a sub-slice, a TS harness
  records goldens over a scenario matrix:
  - engine decision: inputs (CrossOver present/missing/expired/broken/inconclusive, pins, the
    marker, the Automatic vs forced setting, offline) → choice, reason and log label;
  - bottles: create, reuse, remove and engine switch as before/after trees on a fake-HOME
    filesystem (`gamelib-testutil` `FakeHome`);
  - spawned commands: wine, wineserver, the CrossOver probes, winetricks and the DXVK/DXMT copy
    steps as argv/env/cwd traces;
  - downloads: the fallback engine, wine-manager releases (GitHub API) and lutris runtimes as
    replayed HTTP with pinned requests (86 D-09/D-10), plus the sha256 and contained-extraction
    outcomes.
  Rust replays the same inputs and must match. Separately, port the behavioural TS tests that
  record incidents as Rust tests (at minimum `legacyBottleUntouched`, sibling-safe removal, DXVK
  install/remove, the inconclusive pre-flight cases, `gameProcessWatch`'s match forms, and the
  Winetricks apply guard and output classifier). Source-text gate tests are dropped. `wine/`
  (0.5x test ratio) gets its harness and goldens committed first (SC3 of the 86 pattern). The
  goldens carry the Phase 82 D-05 vacuous-pass guards.
- **D-09:** **No new spike before planning.** The researcher works from spikes 059/060/068, the
  Phase 59 and 61 records and the spike findings skill (CrossOver detection, trial state, the
  fallback, process matching, the CrossOver-first/Staging policy). Research lists any behaviour the
  goldens cannot capture (wineserver timing, CrossOver adopting a fallback bottle, the trial
  licence read from the real HOME), and each one becomes a live-gate item.
- **D-10:** **Progress events are unchanged and the renderer is untouched.** Rust emits the same
  event names and payload shapes through `FrontendEmitter` (as 86 D-08) for engine and tool
  downloads, the Winetricks queue and the fallback engine's first-need progress. Goldens pin the
  event sequence of a replayed download (start → n×progress → done/error) and allow tolerance on
  how often progress events fire.

### Live gate on real engines
- **D-11:** **An operator live gate on macOS, authored before coding, with four items** (the
  Phase 59 method: `no-crossover.sb`, `nolicence.sb`, spike 060's `backdate.py`):
  1. **CrossOver healthy, then no-CrossOver fallback (SC1).** A non-Steam game (GOG or Epic) and a
     bridge Steam title through the D-03 shims. Healthy CrossOver stays on CrossOver
     (`reason=cx-healthy`). Under `no-crossover.sb` the pinned engine downloads with progress and
     the game runs on Staging+DXVK with the fallback toast and badge. Without the profile,
     CrossOver adopts the bottle again with the save intact. Include one D3D11 title (Planet
     Crafter or Avernum 6).
  2. **Expired trial → Staging.** With operator approval, one throwaway bottle backdated under
     `nolicence.sb`: the ≤7-day notice shows, and an expired trial routes to the built-in engine.
  3. **Bottles (SC2).** A second launch reuses the bottle. Removing one game's bottle leaves a
     sibling game's bottle and files untouched.
  4. **Tools and downloads (SC3).** A Winetricks verb runs from the queue with progress,
     DXVK/DXMT install and remove on a bottle, and a wine-manager download completes with
     progress.
  Items follow the offline-UAT memory shape (network off only for the action) wherever they test
  offline refusal.
- **D-12:** **The gate build is a signed Phase 87 build installed over a signed Phase 86 build**
  (86 D-15, 85 D-16). It proves existing bottles, markers and the ledger survive the upgrade, and
  that real CrossOver/wine/winetricks spawns work from the signed app. A dev build does not count.
- **D-13:** **Windows and Linux are covered by CI only** (86 D-16). Golden replay runs on the
  three-OS matrix. Wine-manager (Wine-GE/Proton) and runtimes downloads, which are Linux-facing,
  get their live check with Phase 99.

### Carried forward (already decided, not re-asked)
- **D-14:** A native channel never falls back to the sidecar. Its Rust serde struct
  (`deny_unknown_fields`, camelCase) is the schema, the zod entry is deleted with the TS
  registration, and the IPC snapshot is regenerated (83 D-04/D-06/D-07).
- **D-15:** TS callers use thin same-signature `rustInvoke` shims or D-24-style resolvers. The
  delete gate counts them and a schedule test lists each with its deleting phase (86 D-05/D-06/D-24).
- **D-16:** Quirks are copied for parity and each is filed as a todo with the three triage keys;
  a golden diff never mixes a port with a fix (86 D-03). Known candidates: 61 HUMAN-UAT WR-01
  (inconclusive pre-flight always launches on CrossOver / switches a wine-manager bottle) and
  WR-02 (the notice-only deadline raises the main window), whichever way they were resolved.
- **D-17:** Every spawn (wine, wineserver, CrossOver probes, winetricks, tar) goes through
  `gamelib-proc`. Tools and probes are `SpawnClass::Helper`; only what must outlive GameLib is
  `Game`, per 83 D-08 (a launched game's wine/wineserver tree survives; winetricks and downloads
  die). In-flight work holds a `gamelib_core::shutdown::global()` Registrant, exit work fits
  `ExitBudget::DEFAULT`, boot work is bounded, and there is no `PR_SET_PDEATHSIG` and no
  hand-rolled kill. Load `Skill("gamelib-conventions")` before planning.
- **D-18:** Two-profile rule: `demoStatus` is the declared real-profile arm (CrossOver reads its
  licence from the real HOME, spike 060), and `runTool` spawns with the isolated fake-HOME env. Rust
  keeps both arms, named and justified.
- **D-19:** Destructive operations (bottle removal) refuse when a check returns "unknown" and never
  touch a sibling, using the shared `gamelib-safety` path guards (FND-02, 82 D-06/D-07).
- **D-20:** CrossOver first, the pinned Wine-Staging+DXVK auto-fallback, the override is advanced
  and unsupported unless CrossOver, and no GPTK/DXMT engine (memory:
  steam-engine-crossover-first-staging-fallback). Bottled Steam is not a fallback target of the
  engine step (memory: bottled-steam-is-narrow-fallback; `launchEngine.ts` header).
- **D-21:** v0.11 rules: live gates are authored before coding, goldens are recorded from TS before
  porting, and the phase's last plan leaves no TS or registrations for any ported module except
  scheduled shims and resolvers.

### Post-research scope rulings (2026-11-23, answered after 87-RESEARCH.md)
- **D-22:** **The wine command core and macOS wine discovery port in 87, into `gamelib-wine`.** The
  env builders (`setupEnvVars` / `setupWineEnvVars`), `validWine` and `runWineCommand` (the
  `commandRunner` wine path), plus `utils/compatibility_layers.ts` discovery (`getCrossover`,
  `getAlternativeWine`, default wine), get a Rust owner here. Phase 88 extends them for argv/env
  building and `launcher.ts`, and does not re-port them. TS callers that 87 does not delete reach
  them through scheduled shims (D-15). — **Reversibility:** costly — moves the 87/88 boundary.
- **D-23:** **Scheduled resolver registrations are allowed, and SC4 is amended as 86 D-24 was.**
  Rust has no `GameSettings` default merge until 98, so one slim `engineWineResolvers.ts` keeps
  thin resolvers for `getEngineState`, `winetricksApply/Available/Installed`,
  `toggleDXVK/NVAPI/VKD3D`, `runWineCommand`, `runWineCommandForGame` and `callTool`. Each one is a
  schedule-test row with deleting phase 98. Every other engine/wine/tools registration, zod entry
  and TS module is deleted in 87. Amend ROADMAP SC4 to read "…deleted in this phase, except
  scheduled resolvers listed in the schedule test".
- **D-24:** **The sync pure-helper twin and `engineSelectionView` are approved scheduled survivors,
  deleted in 96.** The bridge's sync `bottlePrimitives` helpers (`getBottleDir`,
  `sanitizeBottleName`, `isBottleProvisioned`, `buildFallbackGameSettings`, …) stay as a TS pure
  twin, and the sync engine-selection read becomes a write-through `engineSelectionView`. Both are
  schedule-test rows (phase 96) and are pinned to Rust by shared cross-language test vectors so the
  twin cannot drift. This extends D-21's survivor list.
- **D-25:** **Technical defaults accepted:** (a) `gamelib-engine` owns a `DxvkInstaller` trait that
  `gamelib-wine` implements, keeping D-04's one-way dependency; (b) Rust computes the default wine
  from `PATH`; (c) `callTool` and `runWineCommandForGame` spawn as `SpawnClass::Helper`.

### Claude's Discretion
- The order sub-slices port within the phase (research may suggest bottles + ledger first, since
  the decision and the bridge shims depend on them).
- Module layout inside the two crates, op names and the channel shapes through the 83 router.
- The recorder and replay fixture format, where fixtures live, and how they're redacted.
- Whether a given sync bridge call site becomes async or reads a Rust-owned file synchronously
  (D-03), case by case with the count from research.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/ROADMAP.md` § "Phase 87: Engine, Wine and tools": goal and the 4 success criteria; § "v0.11 Phase Details": the rules for every port phase
- `.planning/REQUIREMENTS-v0.11.md`: SVC-02 (also FND-02, FND-04, FND-06)
- `.planning/research/v0.11/SUMMARY.md`: item 87, the ProcessRunner ruling (commandRunner and engine consumers port in 87/88), the hidden costs (wine 0.5x test ratio), the high-value oracles (engine 9.1k, tools 4.7k)
- `.planning/research/v0.11/ARCHITECTURE.md`, `STACK.md`, `PITFALLS.md`: slice E (engine), utility crates (`tokio::process`, `tar`+`flate2`, `plist`, `rust-ini`), pitfall 2 (path guards on delete)

### State ownership and prior contracts
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md`: the rows `wineDownloaderInfoStore`, `steam_engine_notices`, `steam-engines-dir`, `pci_ids_device`/`pci_ids_vendor` (amend to 88 per D-05)
- `.planning/phases/83-native-seam-gamelib-core-and-process-shutdown-contract/83-CONTEXT.md`: router, no-fallback, schema authority, the `*PortComplete` template, D-05 (flag helper stays unbuilt), D-08 (what counts as an orphan; a game's wine tree survives)
- `.planning/phases/85-store-host-config-and-versioned-migrations/85-CONTEXT.md`: the StoreHost, byte compatibility, corrupt handling, `store_version_gate`, the signed-build gate path (D-16)
- `.planning/phases/86-pure-leaf-services/86-CONTEXT.md`: the shim/resolver pattern and schedule test (D-05, D-06, D-24), the recorded-HTTP oracle with pinned requests (D-09, D-10), the TS golden harness for low-test slices (D-11), Rust-emitted events (D-08), the signed upgrade gate (D-15)

### Engine behaviour history (what "as before" means)
- `.planning/milestones/v0.9-phases/59-steam-engine-fallback-when-crossover-is-unavailable/`: CONTEXT, `59-UAT.md` and `59-HUMAN-UAT.md` (the live method: `no-crossover.sb`, `nolicence.sb`, `backdate.py`; healthy/fallback/adopt/trial items)
- `.planning/milestones/v0.10-phases/61-unified-macos-engine-for-all-stores/`: CONTEXT, `61-UAT.md`, `61-HUMAN-UAT.md` (WR-01/WR-02 decisions, live CrossOver items 13/14)
- `.planning/spikes/060-crossover-trial-expiry/` and spike 068 (process match shape), plus `Skill("spike-findings-gamelib")` sections (f) bridge engines and (i) macOS runtime signals

### Patterns to copy
- `src/backend/__tests__/*PortComplete.test.ts` (steamPolls, depot, logger, nativeSeam, and the 86 info gates): per-slice delete gates
- `src-tauri/crates/gamelib-steampoll` + `-cli`, `gamelib-store` + `-cli`, `gamelib-proc`, `gamelib-safety`, `gamelib-testutil`: crate + dispatch + cli shape, spawns, path guards, `FakeHome`
- `src-tauri/crates/README.md`: per-domain crate recipe, §2b destructive-path rules, §7 verification and deletion, §8 CI
- `CLAUDE.md` Conventions table + `Skill("gamelib-conventions")`: todo triage keys, fake-HOME isolation, the Rust shutdown contract, the `<verify>` prettier check

</canonical_refs>

<code_context>
## Existing Code Insights

### Modules (TS source lines)
- `engine/`: `engineSwitch` 1025, `engineDecision` 832, `launchEngine` 680, `engineState` 578, `fallbackEngine` 509, `perGameBottle` 405, `bottlePrimitives` 350, `toolSettings` 297, `engineConfig` 263, `gameEngineState` 249, `gameProcessWatch` 196, `launchDeadline` 142, `demoStatus` 137, `pinnedEngineProgress` 122, `launchSettings` 121, `crossoverLocation` 106, `engineDialogs` 103, `testedCrossoverVersions` 91, `runTool` 88, `engineRuntime` 81, `gamePrefix` 74, `enginePins` 73, `bottleLedger` 65, `gameKey` 64
- `wine/`: `manager/utils` 462, `manager/downloader/main` 371, `downloader/utilities` 257, `runtimes/util` 101, `runtimes/runtimes` 98 (lutris.net runtimes API)
- `tools/`: `index` 1788, `dxmt` 309, `winetricksQueue` 262, `winetricksOutputClassifier` 157, `winetricksListParse` 114, `winetricksApplyGuard` 88, `winetricksEnvironment` 82, `toolsState` 45, `machoExports` 37

### External TS callers (shim targets, D-01/D-03)
- `launchEngine`: `launcher.ts`, `storeManagers/gog/setup.ts`, `storeManagers/nile/setup.ts` (die in 88/92)
- `bottlePrimitives`: 17 files under `storeManagers/steam/` (bridge, `bridge/drm`, `bridge/overlay` shims, `directLaunch`); `engineSwitch`: 6 (`bridgeWineTools`, `bridgeBottleLifecycle`, `gameBridgeLaunch`, `gameEngineDialogs`, `gameLaunch`, `engine/steamEngineDeps`); `engineDecision`: 5; `runTool`: 10 (drm runners, overlay); `launchDeadline`: `gameLaunch`, `gameBridgeWineLaunch`; `engineState`: `launcher.ts`, `bootstrap.ts`, `steamEngineDeps`, `services/types.ts`
- wine/tools importers: `utils.ts`, `launcher.ts`, `config.ts`, `stores/createStores.ts`, `sidecar/bootstrap.ts`, `services/types.ts`, `testUtils/*`

### Sidecar registrations to delete
- `sidecar/engineFlowRegistration.ts` (150 lines), `sidecar/wineToolsFlowRegistration.ts` (482 lines), and the wine/runtimes channels in `sidecar/runnerMiscFlowRegistration.ts`, plus their zod entries; research maps every channel

### Integration points
- Renderer: `src/preload/api/wine.ts`, `screens/Settings/sections/WinetricksSettings/`, the engine badge, toast and notice surfaces on the game page (renderer unchanged per D-10)
- `stores/bottleVersionGate.ts` → Rust `store_version_gate` (already Rust-decided since 85 D-17)
- Engine-state boot step in `sidecar/bootstrap.ts` moves to Rust boot (bounded per D-17)

</code_context>

<specifics>
## Specific Ideas

- Gate titles: one GOG or Epic game, one bridge Steam title, one D3D11 title (Planet Crafter or
  Avernum 6), and a throwaway bottle for the trial backdate. The operator picks the exact titles.
- The trial backdate needs operator approval each time (Phase 59 item 6 precedent).

</specifics>

<deferred>
## Deferred Ideas

- GPU system info (`utils/systeminfo/gpu`, the `pci_ids_*` caches) → Phase 88 (D-05).
- Linux live check of wine-manager and runtimes downloads → Phase 99 (D-13).
- Fixing any quirk the port copies → individual todos (D-16).

### Reviewed Todos (not folded)
- `todo.match-phase 87` returned keyword matches only: packaged-app blank render, the gamelib-log
  Windows path golden (`chunks-wine-header`, a logger test, not engine), GOG Windows elevation,
  Steam move install, opt-in DLC, the steampoll watchdog flake, TS-launched games dying on SIGKILL
  (process lifetime; 88's launcher), unsigned Windows releases, x86 flat API parity, the
  protonfixes import tool. None is in this phase's domain.

</deferred>

---

*Phase: 87-engine-wine-and-tools*
*Context gathered: 2026-11-22*
