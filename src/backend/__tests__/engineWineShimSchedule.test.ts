/**
 * The Phase 87 survivor schedule (87-03, D-15, D-23 and D-24).
 *
 * D-15: once the engine and wine services are ported, their TS survives only as one of four scheduled
 * shapes, each with a deletion phase. This test lists every one, so a survivor cannot exist
 * unscheduled and cannot outlive its row.
 *
 * - shim: one returned typed `requestRustInvoke` call whose arguments are built from the shim's
 *   parameters (the 86 shape rule, `checkShimShape`).
 * - resolver (D-23): `const` declarations that gather TS-only inputs, then exactly one returned typed
 *   call. The resolvers live in `src/backend/sidecar/engineWineResolvers.ts`.
 * - twin (D-24): a synchronous TS copy of a Rust-owned pure function, pinned to Rust by shared
 *   vectors. A twin row names the `vectors` test file that exercises it, and that test must import
 *   the twin's file.
 * - view (D-24): a write-through mirror of Rust's in-memory state, pinned the same way.
 *
 * `deletedBy` is the phase that deletes the row, an integer in 87..99. 87 marks an intra-phase shim
 * that a TS module still alive inside Phase 87 uses; 87-56 asserts no 87 row remains
 * (`noIntraPhaseRowsLeft`), and 87-57 compares the final schedule item by item with the D-22, D-23
 * and D-24 survivor list.
 *
 * Discovery, in both directions against the in-scope rows (by file and name): every exported value
 * binding (a function or a const, never a type) under `src/backend/enginewine/`, every function
 * holding a `requestRustInvoke(RUST_ENGINE_*` or `RUST_WINE_*` call outside that directory, and every
 * export of `src/backend/sidecar/engineWineResolvers.ts`. An exported `register*` helper that only
 * installs `ipc.on` or `ipc.handle` listeners is covered only when a row in the same file names it in
 * its `wiring` list. Twin and view rows whose file lies outside that scope (launcher.ts,
 * commandRunner.ts, compatibility_layers.ts) are checked by file, export and vectors instead.
 *
 * The schedule started empty and the directory did not exist, so the discovered set equalled it and
 * the test was green from the first commit; 87-18 adds the first two rows. The planted fixtures keep
 * each detector proven rather than vacuous (82 D-05).
 *
 * Floor: the walk read 611 non-test .ts/.tsx files under src/backend when measured on 2026-11-22
 * (86-05). The floor sits under that so later deletions cannot trip it; never lower it.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import {
  checkShimShape,
  findExportedValues,
  findImporters,
  findRustCalls,
  REPO_ROOT,
  walkStripped
} from 'backend/testUtils/infoPortGate'
import type { ShimRow, StrippedFile } from 'backend/testUtils/infoPortGate'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const BACKEND_FILES_FLOOR = 400
const ENGINEWINE_DIR = 'src/backend/enginewine'
const RESOLVERS_FILE = 'src/backend/sidecar/engineWineResolvers.ts'
const CHANNEL_PREFIXES = ['RUST_ENGINE_', 'RUST_WINE_'] as const

interface ScheduleRow extends ShimRow {
  /** The exported name (a function, or a const for a view). */
  name: string
  /** Repo-relative file holding it. */
  file: string
  /** Shims and resolvers: the `RUST_ENGINE_*` or `RUST_WINE_*` constant its one typed call sends. */
  channel?: string
  /** Twins and views: the repo-relative test file that pins the row to Rust; it must import `file`. */
  vectors?: string
  /**
   * `register*` helpers in `file` that only install this row's `ipc.on` or `ipc.handle` listeners.
   * A helper is covered by being named here, by a row in the same file.
   */
  wiring?: readonly string[]
  /** Repo-relative non-test files that import `file`. */
  callers: readonly string[]
  /** The phase that deletes this row, 87..99. 87 is an intra-phase shim; 87-56 asserts none remain. */
  deletedBy: number
}

/** Every non-test importer of `launcher.ts` and of `commandRunner.ts` (the twin check is per file). */
const LAUNCHER_IMPORTERS: readonly string[] = [
  'src/backend/services/types.ts',
  'src/backend/sidecar/bootstrap.ts',
  'src/backend/storeManagers/index.ts'
]
/** Every non-test importer of `utils/compatibility_layers.ts` (the twin check is per file). */
const COMPATIBILITY_LAYERS_IMPORTERS: readonly string[] = [
  'src/backend/config.ts',
  'src/backend/launcher.ts',
  'src/backend/sidecar/bootstrap.ts',
  'src/backend/storeManagers/gog/games.ts',
  'src/backend/storeManagers/legendary/games.ts',
  'src/backend/storeManagers/nile/games.ts',
  'src/backend/utils.ts'
]
/**
 * Every non-test importer of `enginewine/twin.ts` (the check is per file, so every twin row lists them all):
 * the launcher and the five `games.ts` (`engineKeyFor`), the settings and install flows (the override
 * validation and the import settings), the engine flows, the engine TS alive until 87-56 (87-42 adds `prepareBottle`),
 * and (87-43) every bridge file that used to reach the helpers through the re-exporting engine modules.
 * 87-55 adds `engine/engineTypes.ts`, which re-exports the two selection helpers for the TS engine until 87-56, and
 * `gameLaunchOverlay.ts`, which takes `isNonCrossover` from here now.
 */
const ENGINE_TWIN_IMPORTERS: readonly string[] = [
  'src/backend/engine/bottleLedger.ts',
  'src/backend/engine/demoStatus.ts',
  'src/backend/engine/engineDecision.ts',
  'src/backend/engine/engineEligibility.ts',
  'src/backend/engine/enginePins.ts',
  'src/backend/engine/engineState.ts',
  'src/backend/engine/engineTypes.ts',
  'src/backend/engine/fallbackEngine.ts',
  'src/backend/engine/gameEngineState.ts',
  'src/backend/engine/gamePrefix.ts',
  'src/backend/engine/launchSettings.ts',
  'src/backend/engine/perGameBottle.ts',
  'src/backend/engine/prepareBottle.ts',
  'src/backend/engine/toolSettings.ts',
  'src/backend/launcher.ts',
  'src/backend/sidecar/engineWineResolvers.ts',
  'src/backend/sidecar/installFlowRegistration.ts',
  'src/backend/sidecar/settingsFlowRegistration.ts',
  'src/backend/storeManagers/gog/games.ts',
  'src/backend/storeManagers/legendary/games.ts',
  'src/backend/storeManagers/nile/games.ts',
  'src/backend/storeManagers/sideload/games.ts',
  'src/backend/storeManagers/steam/bottle.ts',
  'src/backend/storeManagers/steam/bottledSteam.ts',
  'src/backend/storeManagers/steam/bridge/bridgeConfig.ts',
  'src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts',
  'src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts',
  'src/backend/storeManagers/steam/bridge/shimGenerate.ts',
  'src/backend/storeManagers/steam/bridge/shimPlacement.ts',
  'src/backend/storeManagers/steam/bridgeBottle.ts',
  'src/backend/storeManagers/steam/bridgeBottleLifecycle.ts',
  'src/backend/storeManagers/steam/bridgeKnownFixes.ts',
  'src/backend/storeManagers/steam/bridgeWineTools.ts',
  'src/backend/storeManagers/steam/directLaunch/directLaunchProbes.ts',
  'src/backend/storeManagers/steam/engine/pinnedEngine.ts',
  'src/backend/storeManagers/steam/gameBridgeLaunch.ts',
  'src/backend/storeManagers/steam/gameBridgeWineLaunch.ts',
  'src/backend/storeManagers/steam/gameEngineDialogs.ts',
  'src/backend/storeManagers/steam/gameInstallBridge.ts',
  'src/backend/storeManagers/steam/gameLaunch.ts',
  'src/backend/storeManagers/steam/gameLaunchOverlay.ts',
  'src/backend/storeManagers/steam/provisionBottle.ts',
  'src/backend/storeManagers/storeManagerCommon/games.ts'
]
/**
 * Every non-test importer of `enginewine/tools.ts` (the check is per file, so every row of that file lists them all):
 * the launcher, the Steam bridge's known fixes and the still-TS engine's `installRemove` (87-56 deletes the last).
 */
const TOOLS_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/launcher.ts',
  'src/backend/services/engineServices.ts',
  'src/backend/storeManagers/steam/bridgeKnownFixes.ts'
]
/** Every non-test importer of `enginewine/bottles.ts` (the check is per file, so every row of that file lists them all). */
const BOTTLES_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/engine/engineDecision.ts',
  'src/backend/engine/engineSync.ts',
  'src/backend/engine/fallbackBottleCall.ts',
  'src/backend/engine/perGameBottle.ts',
  'src/backend/engine/prepareBottle.ts',
  'src/backend/storeManagers/steam/bridgeBottleLifecycle.ts',
  'src/backend/storeManagers/steam/gameBridgeLaunch.ts'
]
/** Every non-test importer of `enginewine/launch.ts` (the check is per file, so every row of that file lists them all). */
const LAUNCH_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/launchEngineStep.ts',
  'src/backend/launcher.ts',
  'src/backend/sidecar/appShellFlowRegistration.ts',
  'src/backend/storeManagers/gog/setup.ts',
  'src/backend/storeManagers/nile/setup.ts'
]
/**
 * Every non-test importer of `enginewine/decision.ts` (the check is per file, so every row of that file lists them all):
 * the Steam launch and its engine adapter (87-54), the CrossOver bin-dir lookup (87-55) and the still-TS decision module, which takes its types from here
 * until 87-56 deletes it.
 */
const DECISION_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/engine/engineDecision.ts',
  'src/backend/enginewine/state.ts',
  'src/backend/storeManagers/steam/engine/crossoverBinDir.ts',
  'src/backend/storeManagers/steam/engine/engineDecisionReply.ts',
  'src/backend/storeManagers/steam/engine/steamEngineDeps.ts',
  'src/backend/storeManagers/steam/gameBridgeLaunch.ts',
  'src/backend/storeManagers/steam/gameEngineDialogs.ts',
  'src/backend/storeManagers/steam/gameInstallBridge.ts',
  'src/backend/storeManagers/steam/gameLaunch.ts'
]
/**
 * Every non-test importer of `enginewine/runTool.ts` (the check is per file, so both rows list them): the one `RunTool`
 * factory over the two shims (87-55).
 */
const RUN_TOOL_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/storeManagers/steam/engine/rustRunTool.ts'
]
/**
 * Every non-test importer of `enginewine/toolSettings.ts` (the check is per file, so every row of that file lists them
 * all): the Winetricks and Run EXE target, the sideload Run installer's pending install and the Steam Wine-tool engine
 * (87-56a).
 */
const TOOL_SETTINGS_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/services/gameCommandFacts.ts',
  'src/backend/services/winetricksTarget.ts',
  'src/backend/storeManagers/steam/bridgeWineTools.ts'
]
/**
 * Every non-test importer of `enginewine/state.ts` (the check is per file, so every row of that file lists them all): the
 * Steam launch, its overlay policy and the wine launch that publishes the overlay exit notice.
 */
const STATE_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/storeManagers/steam/gameBridgeWineLaunch.ts',
  'src/backend/storeManagers/steam/gameLaunch.ts',
  'src/backend/storeManagers/steam/gameLaunchOverlay.ts'
]
/** Every non-test importer of `enginewine/deadline.ts` (the check is per file, so every row of that file lists them all). */
const DEADLINE_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/sidecar/handlers.ts',
  'src/backend/storeManagers/steam/engine/bridgeDeadline.ts',
  'src/backend/storeManagers/steam/gameBridgeWineLaunch.ts'
]
const COMMAND_RUNNER_IMPORTERS: readonly string[] = [
  'src/backend/services/types.ts',
  'src/backend/sidecar/bootstrap.ts',
  'src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts'
]

/**
 * Rows are added by the plan that creates the survivor, in the same commit. Each row needs its file,
 * name, shape and callers; shims and resolvers a channel; twins and views a vectors test.
 */
const SCHEDULE: readonly ScheduleRow[] = [
  // 87-18 (D-15): the launcher's pre-launch runtime step. Phase 88 moves launch into Rust and deletes both.
  {
    name: 'isRuntimeInstalled',
    file: 'src/backend/enginewine/runtimes.ts',
    shape: 'shim',
    channel: 'RUST_WINE_RUNTIME_IS_INSTALLED',
    callers: ['src/backend/launcher.ts'],
    deletedBy: 88
  },
  {
    name: 'downloadRuntime',
    file: 'src/backend/enginewine/runtimes.ts',
    shape: 'shim',
    channel: 'RUST_WINE_RUNTIME_DOWNLOAD',
    callers: ['src/backend/launcher.ts'],
    deletedBy: 88
  },
  // 87-20 (D-15): the wine manager. utils.ts's default-wine download (checkWineBeforeLaunch, reached from the
  // launch path and the bottle provisioning) and the `releasesInfoReady` listener go with Phase 88's launch
  // port; the sidecar's refresh at the `releasesInfoReady` listener goes with the config in Phase 98. `callers`
  // lists every importer of the file (the check is per file), so each of the four rows names both (87-26: config.ts
  // no longer imports it, the empty-list refresh inside `getAlternativeWine` is Rust's own).
  {
    name: 'updateWineVersionInfos',
    file: 'src/backend/enginewine/wineManager.ts',
    shape: 'shim',
    channel: 'RUST_WINE_MANAGER_REFRESH',
    callers: [
      'src/backend/sidecar/engineWineResolvers.ts',
      'src/backend/utils.ts'
    ],
    deletedBy: 98
  },
  {
    name: 'installWineVersion',
    file: 'src/backend/enginewine/wineManager.ts',
    shape: 'shim',
    channel: 'RUST_WINE_MANAGER_INSTALL',
    callers: [
      'src/backend/sidecar/engineWineResolvers.ts',
      'src/backend/utils.ts'
    ],
    deletedBy: 88
  },
  {
    name: 'listWineReleases',
    file: 'src/backend/enginewine/wineManager.ts',
    shape: 'shim',
    channel: 'RUST_WINE_MANAGER_LIST',
    callers: [
      'src/backend/sidecar/engineWineResolvers.ts',
      'src/backend/utils.ts'
    ],
    deletedBy: 88
  },
  {
    name: 'wineReleasesInfoReady',
    file: 'src/backend/enginewine/wineManager.ts',
    shape: 'shim',
    channel: 'RUST_WINE_RELEASES_INFO_READY',
    callers: [
      'src/backend/sidecar/engineWineResolvers.ts',
      'src/backend/utils.ts'
    ],
    deletedBy: 88
  },
  // 87-24 (D-15, D-22): the wine core. `validWine` is the one async TS reach (the launcher's wine check,
  // checkWineBeforeLaunch and the command runner's binding); Phase 88 moves launch into Rust and deletes it.
  {
    name: 'validWine',
    file: 'src/backend/enginewine/wineCore.ts',
    shape: 'shim',
    channel: 'RUST_WINE_VALID',
    callers: [
      'src/backend/launcher.ts',
      'src/backend/sidecar/bootstrap.ts',
      'src/backend/utils.ts'
    ],
    deletedBy: 88
  },
  // 87-26 (D-15, D-22): wine discovery. `discoverAlternativeWine` is the one async TS reach into the Rust discovery
  // (config.ts's `getAlternativeWine`, which utils.ts and the Steam install form call), deleted with the config in
  // Phase 98. `discoverCrossover` is an intra-phase shim for the still-TS engine's CrossOver locator
  // (`engine/crossoverLocation.ts`); 87-56 deletes the engine TS and removes the row (`deletedBy` 87).
  {
    name: 'discoverAlternativeWine',
    file: 'src/backend/enginewine/wineDiscovery.ts',
    shape: 'shim',
    channel: 'RUST_WINE_DISCOVER_ALTERNATIVES',
    callers: ['src/backend/config.ts'],
    deletedBy: 98
  },
  {
    name: 'discoverCrossover',
    file: 'src/backend/enginewine/intraPhase.ts',
    shape: 'shim',
    channel: 'RUST_WINE_DISCOVER_CROSSOVER',
    callers: ['src/backend/engine/crossoverLocation.ts'],
    deletedBy: 87
  },
  // 87-31 (D-17): the online monitor's status, written through to `EngineCtx.online` at boot and on every
  // change. The monitor itself (the probing) stays TS until the config and its callers move in Phase 98.
  {
    name: 'setEngineOnline',
    file: 'src/backend/enginewine/engineOnline.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_SET_ONLINE',
    callers: ['src/backend/sidecar/bootstrap.ts'],
    deletedBy: 98
  },
  // 87-42 (D-03, D-15): the bottle shims. The engine switch is one typed call into Rust; the TS callbacks became values
  // and the pin download, the status update and the selection view are `engine/prepareBottle.ts`'s work around it.
  // The Steam launch, the DRM launch, the install's redist step and the still-TS launch step call it through
  // `prepareBottle`; Phase 96 moves the last Steam callers into Rust and deletes the shim.
  {
    name: 'prepareBottleForEngine',
    file: 'src/backend/enginewine/bottles.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_BOTTLE_PREPARE',
    callers: BOTTLES_SHIM_IMPORTERS,
    deletedBy: 96
  },
  // 87-42 (D-03, D-15): the rest of the bottle shims. Each is one typed call; the callers are the bridge's bottle
  // lifecycle, the launch and the still-TS engine files that reach Rust through `engine/engineSync.ts`,
  // `engine/fallbackBottleCall.ts` and the files listed. `callers` is every importer of the file (the check is per file).
  {
    name: 'killBottleWineServerWith',
    file: 'src/backend/enginewine/bottles.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_BOTTLE_KILL_WINESERVER',
    callers: BOTTLES_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'removeCreatedBottleDir',
    file: 'src/backend/enginewine/bottles.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_BOTTLE_REMOVE_CREATED',
    callers: BOTTLES_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'createFallbackBottle',
    file: 'src/backend/enginewine/bottles.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_BOTTLE_CREATE_FALLBACK',
    callers: BOTTLES_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'cancelFallbackBottle',
    file: 'src/backend/enginewine/bottles.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_BOTTLE_CANCEL_CREATE',
    callers: BOTTLES_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'reconcileBottleEngineMarker',
    file: 'src/backend/enginewine/bottles.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_BOTTLE_RECONCILE_MARKER',
    callers: BOTTLES_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'recordPinnedBottleEngine',
    file: 'src/backend/enginewine/bottles.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_BOTTLE_RECORD_PINNED',
    callers: BOTTLES_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'recordCrossoverBottleEngine',
    file: 'src/backend/enginewine/bottles.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_BOTTLE_RECORD_CROSSOVER',
    callers: BOTTLES_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'markGameRunning',
    file: 'src/backend/enginewine/bottles.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_LEDGER_MARK_RUNNING',
    callers: BOTTLES_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'markGameStopped',
    file: 'src/backend/enginewine/bottles.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_LEDGER_MARK_STOPPED',
    callers: BOTTLES_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'clearEngineSelection',
    file: 'src/backend/enginewine/bottles.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_SELECTION_CLEAR',
    callers: BOTTLES_SHIM_IMPORTERS,
    deletedBy: 96
  },
  // 87-52 (D-01, D-15): the launch shims. The launcher and the GOG and Amazon setup run the engine step of a non-Steam
  // launch in Rust through `launchEngineStep.ts` (which narrows the reply and writes its lines) while Phase 88 still builds
  // the argv and the environment in TS. The launcher's own arm of the deadline goes away with its launch (88); the setup
  // runs, and the settings reads of every store manager, go in 92.
  {
    name: 'selectEngineForLaunch',
    file: 'src/backend/enginewine/launch.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_LAUNCH_SELECT',
    callers: LAUNCH_SHIM_IMPORTERS,
    deletedBy: 92
  },
  {
    name: 'armEngineLaunchDeadline',
    file: 'src/backend/enginewine/launch.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_LAUNCH_ARM_DEADLINE',
    callers: LAUNCH_SHIM_IMPORTERS,
    deletedBy: 88
  },
  {
    name: 'endEngineLaunch',
    file: 'src/backend/enginewine/launch.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_LAUNCH_END',
    callers: LAUNCH_SHIM_IMPORTERS,
    deletedBy: 92
  },
  {
    name: 'getLaunchSettings',
    file: 'src/backend/enginewine/launch.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_LAUNCH_SETTINGS_GET',
    callers: LAUNCH_SHIM_IMPORTERS,
    deletedBy: 92
  },
  // 87-53 (D-02): the renderer's `dialogDisplayed` send is still the app shell's, so an ack id Rust's engine dialogs
  // issued (the `engine:` prefix) is forwarded to Rust by the shell registration until the dialogs move native (98).
  {
    name: 'engineDialogDisplayed',
    file: 'src/backend/enginewine/launch.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_DIALOG_DISPLAYED',
    callers: LAUNCH_SHIM_IMPORTERS,
    deletedBy: 98
  },
  // 87-54 (D-03, D-15): the Steam bridge's engine decisions. The bridge gathers the stored override, the monitor's phase
  // and the wine-binary hints as values (`steamEngineFacts`), makes one call, and narrows the reply
  // (`engineDecisionReply.ts`); Phase 96 moves the bridge's launch into Rust and deletes the shims.
  {
    name: 'decideLaunchEngine',
    file: 'src/backend/enginewine/decision.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_DECIDE_LAUNCH',
    callers: DECISION_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'decideCreationEngine',
    file: 'src/backend/enginewine/decision.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_DECIDE_CREATION',
    callers: DECISION_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'preflightCrossover',
    file: 'src/backend/enginewine/decision.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_PREFLIGHT_CROSSOVER',
    callers: DECISION_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'isCrossoverMissing',
    file: 'src/backend/enginewine/decision.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_IS_CROSSOVER_MISSING',
    callers: DECISION_SHIM_IMPORTERS,
    deletedBy: 96
  },
  // 87-55 (D-04, D-15): where CrossOver's bin directory is. The bridge's call sites (`steam/engine/crossoverBinDir.ts`, which
  // folds a rejection into "not installed" as the TS locator did) and the app shell's App Management probe ask Rust; the
  // sync fast path `bottle.ts` reads inline stays the boot's TS locator until 87-56. Phase 98 moves the lookup's last
  // callers (the App Management probe, with the settings flows) into Rust.
  {
    name: 'resolveCrossoverBinDir',
    file: 'src/backend/enginewine/decision.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_CX_RESOLVE_BIN_DIR',
    callers: DECISION_SHIM_IMPORTERS,
    deletedBy: 98
  },
  // 87-54 (D-03, D-15): the Steam bridge's engine-state writes. The launch records what it used (`recordLaunchDecision`,
  // with the bridge's facts as values) and the overlay setup and exit notices are pushed over the last state; Rust
  // pushes `engineStateChanged` itself. Phase 96 moves the launch's decision record, Phase 97 the overlay's notices.
  {
    name: 'recordLaunchDecision',
    file: 'src/backend/enginewine/state.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_STATE_RECORD_DECISION',
    callers: STATE_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'publishOverlayNotice',
    file: 'src/backend/enginewine/state.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_STATE_PUBLISH_OVERLAY_NOTICE',
    callers: STATE_SHIM_IMPORTERS,
    deletedBy: 97
  },
  {
    name: 'publishOverlayExitNotice',
    file: 'src/backend/enginewine/state.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_STATE_PUBLISH_OVERLAY_EXIT_NOTICE',
    callers: STATE_SHIM_IMPORTERS,
    deletedBy: 97
  },
  // 87-54 (D-17, D-24): a Steam bridge launch's deadline. Rust owns the timer and sends `engineDeadlineFired`; the bridge
  // stores its callback when it arms (`steam/engine/bridgeDeadline.ts`) and `registerEngineDeadlineFired`, named here in
  // `wiring`, dispatches the frame to it. The callbacks and the state the launch reads synchronously stay in the
  // `bridgeDeadlines` view until Phase 96 moves the bridge into Rust.
  {
    name: 'armBridgeDeadline',
    file: 'src/backend/enginewine/deadline.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_DEADLINE_ARM',
    wiring: ['registerEngineDeadlineFired'],
    callers: DEADLINE_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'cancelBridgeDeadline',
    file: 'src/backend/enginewine/deadline.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_DEADLINE_CANCEL',
    callers: DEADLINE_SHIM_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'bridgeDeadlines',
    file: 'src/backend/enginewine/deadline.ts',
    shape: 'view',
    vectors: 'src/backend/enginewine/__tests__/deadline.test.ts',
    callers: DEADLINE_SHIM_IMPORTERS,
    deletedBy: 96
  },
  // 87-55 (D-03, Pitfall 10): the Steam bridge's tool runs. The `RunTool` call signature `(tool, args, {timeoutMs, signal})`
  // is kept by `steam/engine/rustRunTool.ts`, which names each run with a cancel id and sends `engine_cancel` for it when
  // the signal aborts; Phase 97 moves the bridge's runner setup into Rust and deletes the shims.
  {
    name: 'rustRunTool',
    file: 'src/backend/enginewine/runTool.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_RUN_TOOL',
    callers: RUN_TOOL_SHIM_IMPORTERS,
    deletedBy: 97
  },
  {
    name: 'cancelRunTool',
    file: 'src/backend/enginewine/runTool.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_CANCEL',
    callers: RUN_TOOL_SHIM_IMPORTERS,
    deletedBy: 97
  },
  // 87-56a (D-03, D-23): the settings a Wine tool acts on for a game. Rust reads the live selection and the per-launch
  // overlay from its own registry, so a Winetricks apply or a Run EXE during a live fallback-engine launch acts on the
  // launch's engine. `services/winetricksTarget.ts` narrows the reply; Phase 98 moves the config reads it gathers into Rust.
  {
    name: 'resolveEngineToolSettings',
    file: 'src/backend/enginewine/toolSettings.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_RESOLVE_TOOL_SETTINGS',
    callers: TOOL_SETTINGS_SHIM_IMPORTERS,
    deletedBy: 98
  },
  // 87-56a: the engine an id runs on, for the Steam Wine-tool path (`steam/bridgeWineTools.ts`).
  {
    name: 'resolveNonCrossoverEngine',
    file: 'src/backend/enginewine/toolSettings.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_NON_CROSSOVER_ENGINE',
    callers: TOOL_SETTINGS_SHIM_IMPORTERS,
    deletedBy: 98
  },
  // 87-42 (D-24): the engine selection view, the write-through mirror of Rust's registry. The sync bridge reads
  // (`getBridgeBottleSettings` and the launch settings) stay sync; `registerEngineSelectionView` installs the one
  // `engineSelectionChanged` listener Rust's own registry changes reach it through.
  {
    name: 'engineSelectionView',
    file: 'src/backend/enginewine/selectionView.ts',
    shape: 'view',
    vectors: 'src/backend/enginewine/__tests__/selectionView.test.ts',
    wiring: ['registerEngineSelectionView'],
    callers: [
      'src/backend/engine/engineSync.ts',
      'src/backend/engine/prepareBottle.ts',
      'src/backend/sidecar/bootstrap.ts',
      'src/backend/sidecar/handlers.ts',
      'src/backend/storeManagers/steam/bridgeBottle.ts',
      'src/backend/storeManagers/steam/bridgeBottleLifecycle.ts',
      'src/backend/storeManagers/steam/bridgeWineTools.ts',
      'src/backend/storeManagers/steam/gameBridgeWineLaunch.ts',
      'src/backend/storeManagers/steam/gameLaunch.ts',
      'src/backend/storeManagers/steam/gameLaunchOverlay.ts',
      'src/backend/testUtils/testEngineRuntime.ts'
    ],
    deletedBy: 96
  },
  // 87-34 (D-23): the DXVK family's resolvers. `toggleDXVK` is the first, registered by
  // `registerEngineWineResolvers` (named in `wiring`, one owner, D-06); the TS-only input is the game's merged
  // settings. Phase 98 deletes the resolvers with the config and the game-config store they read.
  {
    name: 'toggleDXVK',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['gameSettings'],
    channel: 'RUST_WINE_DXVK_INSTALL_REMOVE',
    wiring: ['registerEngineWineResolvers'],
    callers: ['src/backend/launcher.ts', 'src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  {
    name: 'toggleDXVKNVAPI',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['gameSettings'],
    channel: 'RUST_WINE_DXVK_INSTALL_REMOVE',
    callers: ['src/backend/launcher.ts', 'src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  {
    name: 'toggleVKD3D',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['gameSettings'],
    channel: 'RUST_WINE_DXVK_INSTALL_REMOVE',
    callers: ['src/backend/launcher.ts', 'src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  // 87-52 (D-23): the renderer's `getEngineState`. TypeScript gathers the library's native and Browser facts and a Steam
  // title's bridge facts as one request value, then makes the one typed call; Rust derives the rest. Phase 98 deletes it
  // with the config and the library it reads.
  {
    name: 'getEngineState',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['request'],
    channel: 'RUST_ENGINE_STATE_GET',
    callers: ['src/backend/launcher.ts', 'src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  // 87-34 (D-15): the DXVK shim. The launcher's DXVK step and the still-TS engine's `installRemove`
  // (`services/engineServices.ts`, which 87-56 deletes with the engine TS) reach the Rust op through it; Phase 88
  // moves launch into Rust and deletes it.
  {
    name: 'dxvkInstallRemove',
    file: 'src/backend/enginewine/tools.ts',
    shape: 'shim',
    channel: 'RUST_WINE_DXVK_INSTALL_REMOVE',
    callers: TOOLS_SHIM_IMPORTERS,
    deletedBy: 88
  },
  // 87-35 (D-15): the Winetricks shims. The launcher's known-fix install and its installed-packages log line, and the
  // Steam bridge's known fixes, reach the Rust Winetricks ops through them with the settings they already hold; Phase
  // 88 moves launch into Rust and deletes them. `callers` is every importer of the file (the check is per file).
  {
    name: 'winetricksInstallVerbs',
    file: 'src/backend/enginewine/tools.ts',
    shape: 'shim',
    channel: 'RUST_WINE_WINETRICKS_INSTALL',
    callers: TOOLS_SHIM_IMPORTERS,
    deletedBy: 88
  },
  {
    name: 'winetricksListInstalled',
    file: 'src/backend/enginewine/tools.ts',
    shape: 'shim',
    channel: 'RUST_WINE_WINETRICKS_LIST_INSTALLED',
    callers: TOOLS_SHIM_IMPORTERS,
    deletedBy: 88
  },
  // 87-35 (D-23): the Winetricks family's resolvers, registered by the same `registerEngineWineResolvers`. The
  // TS-only input is the Wine environment a game's tools act on (`target`: the tool settings or the reason there are
  // none, decided by `services/winetricksTarget.ts` from the game config, the live launch selection and the bottle
  // markers); Phase 98 deletes the resolvers with the config and the engine state those read.
  {
    name: 'winetricksApply',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['target'],
    channel: 'RUST_WINE_WINETRICKS_APPLY',
    callers: ['src/backend/launcher.ts', 'src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  {
    name: 'winetricksAvailable',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['target'],
    channel: 'RUST_WINE_WINETRICKS_AVAILABLE',
    callers: ['src/backend/launcher.ts', 'src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  {
    name: 'winetricksInstalled',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['target'],
    channel: 'RUST_WINE_WINETRICKS_INSTALLED',
    callers: ['src/backend/launcher.ts', 'src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  // Every resolver row now lists `launcher.ts` among its callers: it imports `engineWineResolvers.ts` for
  // `runWineCommandForGame` (87-36), and the importer check is per file.
  // 87-36 (D-23): the wine command on a game. `facts` is the game's library entry and tool settings
  // (`services/gameCommandFacts.ts`: the native flag, the folder and install path, the Steam eligibility and the
  // resolved settings or the reason there are none); every guard, the command-shape check and the spawn are Rust's.
  // The renderer's channel and the launcher's known-fix `runInPrefix` step both call it. Phase 98 deletes it with the
  // library and the config those read.
  {
    name: 'runWineCommandForGame',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['facts'],
    channel: 'RUST_WINE_RUN_COMMAND_FOR_GAME',
    callers: ['src/backend/launcher.ts', 'src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  // 87-36 (D-23): the renderer's `runWineCommand` (`command` is the payload with the global settings spread under its
  // `gameSettings`) and the Wine tool buttons' `callTool` (`facts` as above; the GOG offline-installer check, the
  // library push and the `done` status run in the registration after it, in the TS order). Phase 98 deletes both with
  // the config and the library they read; the sync-callback `runWineCommand` of `commandRunner.ts` stays a twin.
  {
    name: 'runWineCommand',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['command'],
    channel: 'RUST_WINE_RUN_COMMAND',
    callers: ['src/backend/launcher.ts', 'src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  {
    name: 'callTool',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['facts'],
    channel: 'RUST_WINE_TOOL_CALL',
    callers: ['src/backend/launcher.ts', 'src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  // 87-26 (D-22 deviation, for the checker and the operator): `getDefaultWineBinary` is read synchronously by
  // `getFactoryDefaults` in config.ts before any rustInvoke transport exists, so it cannot become an async shim over
  // the Rust `default_wine_from_path`; it stays as a twin pinned to the shared `default_wine.json` vectors that
  // `golden_discovery.rs` replays against the Rust side, and goes with the config in Phase 98.
  {
    name: 'getDefaultWineBinary',
    file: 'src/backend/utils/compatibility_layers.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/defaultWineTwin.test.ts',
    callers: COMPATIBILITY_LAYERS_IMPORTERS,
    deletedBy: 98
  },
  // 87-24 (D-22 deviation, for the checker and the operator): the sync `setupEnvVars` and `setupWineEnvVars` (called
  // synchronously from the launch paths) and the command runner's `runWineCommand` (its `onSpawn` hands callers a live
  // ChildHandle) cannot become same-signature async shims without rewriting Phase 88-92 launch code, so these three
  // TS twins stay, pinned to the Rust `wine_env` and `wine_command` goldens that one oracle test records and both languages replay.
  {
    name: 'setupEnvVars',
    file: 'src/backend/launcher.ts',
    shape: 'twin',
    vectors: 'src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts',
    callers: LAUNCHER_IMPORTERS,
    deletedBy: 88
  },
  {
    name: 'setupWineEnvVars',
    file: 'src/backend/launcher.ts',
    shape: 'twin',
    vectors: 'src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts',
    callers: LAUNCHER_IMPORTERS,
    deletedBy: 88
  },
  {
    name: 'createCommandRunner',
    file: 'src/backend/commandRunner.ts',
    shape: 'twin',
    vectors: 'src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts',
    callers: COMMAND_RUNNER_IMPORTERS,
    deletedBy: 88
  },
  // 87-28 (D-24 extended, for the checker and the operator): the non-bridge sync pure helpers of the engine
  // configuration. They are called synchronously from the launch paths (`engineKeyFor`: launcher.ts and the five
  // games.ts, Phase 92) and from the settings and install flows' engine-override validation (Phase 98), so they
  // cannot become async shims; each lives once in `enginewine/twin.ts`, pinned to Rust by the shared
  // `engine_twin.json` vectors that `twinVectors.test.ts` and `gamelib-engine`'s `twin_vectors.rs` both replay.
  // `callers` is every importer of the file (the check is per file). `perGameBottleName` is the naming rule the
  // bottle functions share: the engine TS alive until 87-56 (gamePrefix, gameEngineState, through
  // perGameBottle.ts) calls it, so it is an intra-phase row that 87-56 makes private; the plan named four rows.
  {
    name: 'engineKeyFor',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 92
  },
  // 87-55 (D-24): the engine selection's two pure helpers, which the bridge calls inline (a type guard in the bottle and
  // launch code, the launch-log line in the deadline handler). Rust owns them as `EngineSelection::engine` and
  // `log_label`; `selection_twin.json` pins the two sides (`twinVectors.test.ts` and `twin_vectors.rs`). They go with the
  // bridge's launch in Phase 96.
  {
    name: 'isNonCrossover',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'engineLogLabel',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'isWritableEngineOverride',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 98
  },
  {
    name: 'importEngineSettings',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 98
  },
  {
    name: 'getPerGameBottleNameFor',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 98
  },
  {
    name: 'perGameBottleName',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 87
  },
  // 87-39 (D-24): the bridge's sync pure bottle helpers, moved out of `bottlePrimitives`, `engineSwitch` and
  // `fallbackEngine` into `enginewine/twin.ts` and pinned to the Rust `bottles::paths`, `bottles::marker`,
  // `bottles::pin_marker`, `engines` and `tool_settings` by the shared `bottle_twin.json` vectors that
  // `twinVectors.test.ts` and `twin_vectors.rs` both replay. The launch path and the bridge call them inline, so
  // they stay synchronous until Phase 96 moves the Steam bridge; `ENGINE_PINS` and `pinById` read the
  // `common/enginePins.json` the Rust crate reads. The six `deletedBy: 87` rows are the helpers the still-TS marker
  // writers and pinned-engine installer share with the readers: intra-phase, 87-56 deletes their callers and makes
  // them private (the plan named ten rows).
  {
    name: 'getBottleDir',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'sanitizeBottleName',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'isBottleProvisioned',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'buildFallbackGameSettings',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'readBottleEngineMarkerKind',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'readBottleEngineMarkerSummary',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'restoreNeedsAbsentPin',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'isPinnedEngineInstalled',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'ENGINE_PINS',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'pinById',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'isInside',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 87
  },
  {
    name: 'readEngineMarker',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 87
  },
  {
    name: 'hasStagingDxvk',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 87
  },
  {
    name: 'isContradictedCrossover',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 87
  },
  {
    name: 'pinMarkerMatches',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 87
  },
  {
    name: 'pinnedEnginePaths',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 87
  }
]

const key = (file: string, name: string): string => `${file}#${name}`

/** True for the files discovery reads exports from: the enginewine directory and the resolvers file. */
const inScopeFile = (path: string): boolean =>
  path.startsWith(`${ENGINEWINE_DIR}/`) || path === RESOLVERS_FILE

/** `file#name` for every survivor the schedule must list, found in `files`. */
function discover(files: readonly StrippedFile[]): string[] {
  const found = new Set<string>()
  for (const f of files) {
    if (inScopeFile(f.path) && /\.tsx?$/.test(f.path)) {
      for (const name of findExportedValues(f.path, f.code)) {
        found.add(key(f.path, name))
      }
    }
  }
  for (const call of findRustCalls(
    files.filter((f) => !f.path.startsWith(`${ENGINEWINE_DIR}/`)),
    CHANNEL_PREFIXES
  )) {
    found.add(key(call.path, call.fn))
  }
  return [...found].sort()
}

/**
 * `file#name` the in-scope rows cover: a row's own name, and every `register*` helper in its file
 * that it lists in `wiring`. Twin and view rows outside the discovery scope are not in this set.
 */
function scheduledKeys(schedule: readonly ScheduleRow[]): string[] {
  const keys = new Set<string>()
  for (const row of schedule) {
    const isTwinOrView = row.shape === 'twin' || row.shape === 'view'
    if (isTwinOrView && !inScopeFile(row.file)) continue
    keys.add(key(row.file, row.name))
    for (const w of row.wiring ?? []) keys.add(key(row.file, w))
  }
  return [...keys].sort()
}

/** Both directions of the set-equality check. */
function diff(
  discovered: readonly string[],
  scheduled: readonly string[]
): { unscheduled: string[]; orphaned: string[] } {
  return {
    unscheduled: discovered.filter((k) => !scheduled.includes(k)),
    orphaned: scheduled.filter((k) => !discovered.includes(k))
  }
}

/** Why `row.wiring` is not valid: each entry must be a `register*` name the file exports. */
function wiringProblems(row: ScheduleRow, source: string): string[] {
  const exported = findExportedValues(row.file, source)
  const problems: string[] = []
  for (const w of row.wiring ?? []) {
    if (!/^register[A-Z0-9]/.test(w)) {
      problems.push(`${row.name}: wiring '${w}' is not a register* helper`)
    } else if (!exported.includes(w)) {
      problems.push(`${row.name}: wiring '${w}' is not exported by ${row.file}`)
    }
  }
  return problems
}

/**
 * Why a twin or view row is not pinned to Rust: its file must exist, export its name, and name a
 * `vectors` test that exists and imports the file. Empty when the row is sound.
 */
function twinViewProblems(
  row: ScheduleRow,
  base: string = REPO_ROOT
): string[] {
  const label = `${row.name} (${row.shape})`
  const filePath = join(base, row.file)
  if (!existsSync(filePath))
    return [`${label}: file ${row.file} does not exist`]
  const problems: string[] = []
  const source = readFileSync(filePath, 'utf8')
  if (!findExportedValues(row.file, source).includes(row.name)) {
    problems.push(`${label}: ${row.file} does not export '${row.name}'`)
  }
  if (row.vectors === undefined || row.vectors === '') {
    problems.push(`${label}: no vectors test names how it is pinned to Rust`)
    return problems
  }
  const vectorsPath = join(base, row.vectors)
  if (!existsSync(vectorsPath)) {
    problems.push(`${label}: vectors test ${row.vectors} does not exist`)
    return problems
  }
  const vectorsRaw = readFileSync(vectorsPath, 'utf8')
  const asFile: StrippedFile = {
    path: row.vectors,
    raw: vectorsRaw,
    code: vectorsRaw
  }
  if (findImporters([asFile], row.file).length === 0) {
    problems.push(
      `${label}: vectors test ${row.vectors} does not import ${row.file}`
    )
  }
  return problems
}

/** Why a row's `deletedBy` is not an integer in 87..99. */
function deletedByProblems(schedule: readonly ScheduleRow[]): string[] {
  return schedule
    .filter(
      (r) =>
        !Number.isInteger(r.deletedBy) || r.deletedBy < 87 || r.deletedBy > 99
    )
    .map(
      (r) =>
        `${key(r.file, r.name)}: deletedBy ${String(r.deletedBy)} is not an integer in 87..99`
    )
}

/**
 * 87-56 calls this over the final schedule: throws naming every row still marked `deletedBy: 87`,
 * an intra-phase shim that a TS module alive inside Phase 87 used and that must be gone by the end.
 */
export function noIntraPhaseRowsLeft(
  schedule: readonly Pick<ScheduleRow, 'name' | 'file' | 'deletedBy'>[]
): void {
  const left = schedule
    .filter((r) => r.deletedBy === 87)
    .map((r) => key(r.file, r.name))
  if (left.length > 0) {
    throw new Error(
      `intra-phase rows (deletedBy 87) still scheduled: ${left.join(', ')}`
    )
  }
}

const planted = (path: string, code: string): StrippedFile => ({
  path,
  raw: code,
  code
})

const backendWalk = walkStripped(['src/backend'], { ext: /\.tsx?$/ })
const allWalk = walkStripped(['src', 'meta'], { ext: /\.tsx?$/ })

describe('engineWineShimSchedule', () => {
  it('anti-vacuity: the walk read a real src/backend tree', () => {
    assertAtOrAboveFloor(
      'engineWineShimSchedule src/backend files',
      backendWalk.count,
      BACKEND_FILES_FLOOR
    )
  })

  it('the discovered survivors equal the in-scope schedule rows, by file and name', () => {
    expect(diff(discover(allWalk.files), scheduledKeys(SCHEDULE))).toEqual({
      unscheduled: [],
      orphaned: []
    })
  })

  it('every row has a unique file and name', () => {
    const keys = SCHEDULE.map((r) => key(r.file, r.name))
    expect(new Set(keys).size).toBe(keys.length)
  })

  // One loop per check rather than `it.each`, so an empty schedule does not trip jest's empty-table refusal.
  it('every shim and resolver row has the shape it claims and sends its row channel', () => {
    const calls = findRustCalls(allWalk.files, CHANNEL_PREFIXES)
    for (const row of SCHEDULE) {
      if (row.shape !== 'shim' && row.shape !== 'resolver') continue
      const source = readFileSync(join(REPO_ROOT, row.file), 'utf8')
      expect({
        row: row.name,
        problems: checkShimShape(source, row.name, row, CHANNEL_PREFIXES)
      }).toEqual({ row: row.name, problems: [] })
      const sent = calls.find((c) => c.path === row.file && c.fn === row.name)
      expect({ row: row.name, channel: sent?.constant }).toEqual({
        row: row.name,
        channel: row.channel
      })
    }
  })

  it('every twin and view row exists, exports its name and is pinned by a vectors test that imports it', () => {
    for (const row of SCHEDULE) {
      if (row.shape !== 'twin' && row.shape !== 'view') continue
      expect({ row: row.name, problems: twinViewProblems(row) }).toEqual({
        row: row.name,
        problems: []
      })
    }
  })

  it('every wiring entry is an exported register* helper in the row file', () => {
    for (const row of SCHEDULE) {
      if (!row.wiring || row.wiring.length === 0) continue
      const source = readFileSync(join(REPO_ROOT, row.file), 'utf8')
      expect({ row: row.name, problems: wiringProblems(row, source) }).toEqual({
        row: row.name,
        problems: []
      })
    }
  })

  it('every row is scheduled for deletion in an integer phase 87..99', () => {
    expect(deletedByProblems(SCHEDULE)).toEqual([])
  })

  it('every row is imported by exactly its listed callers', () => {
    for (const row of SCHEDULE) {
      expect({
        row: row.name,
        importers: findImporters(allWalk.files, row.file).sort()
      }).toEqual({ row: row.name, importers: [...row.callers].sort() })
    }
  })
})

describe('engineWineShimSchedule detector (planted fixtures)', () => {
  const SHIM =
    'export async function f(deps, a) { return deps.requestRustInvoke(RUST_ENGINE_X, [{ a }]) }'

  describe('discovery set-equality', () => {
    it('with no rows and no enginewine directory the discovered set is empty and equals the schedule', () => {
      expect(diff(discover([]), scheduledKeys([]))).toEqual({
        unscheduled: [],
        orphaned: []
      })
      expect(
        diff(
          discover([planted('src/backend/a.ts', 'export const a = 1')]),
          scheduledKeys([])
        )
      ).toEqual({ unscheduled: [], orphaned: [] })
    })

    it('a planted unscheduled exported function in a temp enginewine directory fails set equality', () => {
      const dir = mkdtempSync(join(tmpdir(), 'engine-wine-shim-schedule-'))
      try {
        mkdirSync(join(dir, ENGINEWINE_DIR), { recursive: true })
        writeFileSync(
          join(dir, ENGINEWINE_DIR, 'things.ts'),
          `${SHIM}\nexport const g = 1\nfunction hidden() {}\n`
        )
        const walk = walkStripped(['src/backend'], {
          base: dir,
          ext: /\.tsx?$/
        })
        expect(walk.count).toBe(1)
        expect(diff(discover(walk.files), [])).toEqual({
          unscheduled: [
            `${ENGINEWINE_DIR}/things.ts#f`,
            `${ENGINEWINE_DIR}/things.ts#g`
          ],
          orphaned: []
        })
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('discovers exported values (functions, consts, classes) and never a type', () => {
      const file = planted(
        `${ENGINEWINE_DIR}/mixed.ts`,
        [
          'export function fn() {}',
          'export const value = 1',
          'export const arrow = () => 1',
          'export class Holder {}',
          'export type Alias = string',
          'export interface Shape { a: string }',
          'export { fn as renamed }',
          'export type { Alias as Other }',
          'const local = 1'
        ].join('\n')
      )
      expect(discover([file])).toEqual([
        `${ENGINEWINE_DIR}/mixed.ts#Holder`,
        `${ENGINEWINE_DIR}/mixed.ts#arrow`,
        `${ENGINEWINE_DIR}/mixed.ts#fn`,
        `${ENGINEWINE_DIR}/mixed.ts#renamed`,
        `${ENGINEWINE_DIR}/mixed.ts#value`
      ])
    })

    it('a planted registerX export that no row lists in wiring fails set equality, and passes once a row in the same file lists it', () => {
      const file = planted(
        `${ENGINEWINE_DIR}/wire.ts`,
        `${SHIM}\nexport function registerX(ipc) { ipc.handle('x', () => 1) }`
      )
      const row: ScheduleRow = {
        name: 'f',
        file: `${ENGINEWINE_DIR}/wire.ts`,
        shape: 'shim',
        channel: 'RUST_ENGINE_X',
        callers: [],
        deletedBy: 98
      }
      expect(diff(discover([file]), scheduledKeys([row]))).toEqual({
        unscheduled: [`${ENGINEWINE_DIR}/wire.ts#registerX`],
        orphaned: []
      })
      expect(
        diff(
          discover([file]),
          scheduledKeys([{ ...row, wiring: ['registerX'] }])
        )
      ).toEqual({ unscheduled: [], orphaned: [] })
    })

    it('a wiring entry in another file does not cover a register helper, and a non-register name is refused', () => {
      const file = planted(
        `${ENGINEWINE_DIR}/wire.ts`,
        'export function registerX(ipc) { ipc.on("x", () => 1) }'
      )
      const elsewhere: ScheduleRow = {
        name: 'h',
        file: `${ENGINEWINE_DIR}/other.ts`,
        shape: 'shim',
        channel: 'RUST_ENGINE_X',
        callers: [],
        deletedBy: 98,
        wiring: ['registerX']
      }
      expect(
        diff(discover([file]), scheduledKeys([elsewhere])).unscheduled
      ).toEqual([`${ENGINEWINE_DIR}/wire.ts#registerX`])
      const row: ScheduleRow = {
        name: 'f',
        file: `${ENGINEWINE_DIR}/wire.ts`,
        shape: 'shim',
        channel: 'RUST_ENGINE_X',
        callers: [],
        deletedBy: 98,
        wiring: ['f', 'registerGone']
      }
      expect(
        wiringProblems(row, `${SHIM}\nexport function registerX() {}`)
      ).toEqual([
        "f: wiring 'f' is not a register* helper",
        `f: wiring 'registerGone' is not exported by ${ENGINEWINE_DIR}/wire.ts`
      ])
    })

    it('a row with no discovered survivor fails the check', () => {
      const file = planted(`${ENGINEWINE_DIR}/things.ts`, SHIM)
      const rows: ScheduleRow[] = [
        {
          name: 'f',
          file: `${ENGINEWINE_DIR}/things.ts`,
          shape: 'shim',
          channel: 'RUST_ENGINE_X',
          callers: [],
          deletedBy: 98
        },
        {
          name: 'gone',
          file: `${ENGINEWINE_DIR}/things.ts`,
          shape: 'shim',
          channel: 'RUST_ENGINE_Y',
          callers: [],
          deletedBy: 98
        }
      ]
      expect(diff(discover([file]), scheduledKeys(rows))).toEqual({
        unscheduled: [],
        orphaned: [`${ENGINEWINE_DIR}/things.ts#gone`]
      })
    })

    it('an outside call is discovered by the function holding it, for RUST_ENGINE_ and RUST_WINE_ but no other prefix', () => {
      const engine = planted(
        'src/backend/launch/engine.ts',
        'export function useEngine(deps) { return deps.requestRustInvoke(RUST_ENGINE_Z, []) }'
      )
      const wine = planted(
        'src/backend/launch/wine.ts',
        'export const useWine = (deps) => { deps.list.forEach(() => deps.requestRustInvoke(RUST_WINE_Z, [])) }'
      )
      const info = planted(
        'src/backend/launch/info.ts',
        'export function useInfo(deps) { return deps.requestRustInvoke(RUST_INFO_Z, []) }'
      )
      expect(discover([engine, wine, info])).toEqual([
        'src/backend/launch/engine.ts#useEngine',
        'src/backend/launch/wine.ts#useWine'
      ])
      expect(diff(discover([engine]), [])).toEqual({
        unscheduled: ['src/backend/launch/engine.ts#useEngine'],
        orphaned: []
      })
    })

    it('every export of the resolvers file is discovered, and a sibling sidecar file is not', () => {
      const resolvers = planted(
        RESOLVERS_FILE,
        'export async function getEngineState(deps) { return deps.requestRustInvoke(RUST_ENGINE_STATE, []) }\nexport const toggleDXVK = 1\nexport type T = string'
      )
      const sibling = planted(
        'src/backend/sidecar/other.ts',
        'export const notScanned = 1'
      )
      expect(discover([resolvers, sibling])).toEqual([
        `${RESOLVERS_FILE}#getEngineState`,
        `${RESOLVERS_FILE}#toggleDXVK`
      ])
    })
  })

  describe('shim shape with the engine and wine channel prefixes', () => {
    it('a planted shim passes as shape shim for a RUST_ENGINE_ and a RUST_WINE_ channel', () => {
      expect(
        checkShimShape(SHIM, 'f', { shape: 'shim' }, CHANNEL_PREFIXES)
      ).toEqual([])
      expect(
        checkShimShape(
          'export const g = (deps, a) => deps.requestRustInvoke(RUST_WINE_Y, [a])',
          'g',
          { shape: 'shim' },
          CHANNEL_PREFIXES
        )
      ).toEqual([])
    })

    it('a planted shim body with two requestRustInvoke calls fails checkShimShape', () => {
      const twice =
        'export async function f(deps, a) { await deps.requestRustInvoke(RUST_ENGINE_X, [a]); return deps.requestRustInvoke(RUST_WINE_Y, [a]) }'
      expect(
        checkShimShape(twice, 'f', { shape: 'shim' }, CHANNEL_PREFIXES)
      ).toEqual([expect.stringContaining('holds 2 requestRustInvoke calls')])
    })

    it('a planted call to an info channel or an unrelated channel fails for the engine prefixes', () => {
      const info =
        'export async function f(deps, a) { return deps.requestRustInvoke(RUST_INFO_X, [a]) }'
      expect(
        checkShimShape(info, 'f', { shape: 'shim' }, CHANNEL_PREFIXES)
      ).toEqual([
        expect.stringContaining(
          'the first argument must be a RUST_ENGINE_* or RUST_WINE_* constant'
        )
      ])
    })

    it('the default prefix stays RUST_INFO_ so the 86 schedule is unchanged', () => {
      expect(
        checkShimShape(
          'export async function f(deps, a) { return deps.requestRustInvoke(RUST_INFO_X, [a]) }',
          'f',
          { shape: 'shim' }
        )
      ).toEqual([])
      expect(checkShimShape(SHIM, 'f', { shape: 'shim' })).toEqual([
        expect.stringContaining('the first argument must be a RUST_INFO_*')
      ])
    })

    it('a planted resolver passes with its const inputs and an engine channel', () => {
      const src =
        'export async function r(deps, id) { const settings = await load(id); return deps.requestRustInvoke(RUST_ENGINE_Y, [{ settings }]) }'
      expect(
        checkShimShape(
          src,
          'r',
          { shape: 'resolver', inputs: ['settings'] },
          CHANNEL_PREFIXES
        )
      ).toEqual([])
    })
  })

  describe('twin and view rows', () => {
    const makeTree = (
      files: Record<string, string>
    ): { dir: string; cleanup: () => void } => {
      const dir = mkdtempSync(join(tmpdir(), 'engine-wine-shim-schedule-'))
      for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true })
        writeFileSync(join(dir, path), content)
      }
      return {
        dir,
        cleanup: () => rmSync(dir, { recursive: true, force: true })
      }
    }

    const TWIN: ScheduleRow = {
      name: 'getBottleDir',
      file: 'src/backend/launcher.ts',
      shape: 'twin',
      vectors: 'src/backend/__tests__/bottleVectors.test.ts',
      callers: [],
      deletedBy: 96
    }

    it('a twin whose file exports its name and whose vectors test imports the file passes', () => {
      const { dir, cleanup } = makeTree({
        [TWIN.file]: 'export function getBottleDir() { return 1 }',
        [TWIN.vectors as string]:
          "import { getBottleDir } from 'backend/launcher'\nit('x', () => getBottleDir())"
      })
      try {
        expect(twinViewProblems(TWIN, dir)).toEqual([])
        expect(twinViewProblems({ ...TWIN, shape: 'view' }, dir)).toEqual([])
      } finally {
        cleanup()
      }
    })

    it('a planted twin row with no vectors field fails', () => {
      const { dir, cleanup } = makeTree({
        [TWIN.file]: 'export function getBottleDir() { return 1 }'
      })
      try {
        const { vectors: _omit, ...noVectors } = TWIN
        void _omit
        expect(twinViewProblems(noVectors, dir)).toEqual([
          expect.stringContaining('no vectors test names how it is pinned')
        ])
      } finally {
        cleanup()
      }
    })

    it('a planted twin row whose vectors test file does not exist fails', () => {
      const { dir, cleanup } = makeTree({
        [TWIN.file]: 'export function getBottleDir() { return 1 }'
      })
      try {
        expect(twinViewProblems(TWIN, dir)).toEqual([
          expect.stringContaining('vectors test')
        ])
        expect(twinViewProblems(TWIN, dir)[0]).toContain('does not exist')
      } finally {
        cleanup()
      }
    })

    it('a twin row whose vectors test does not import the twin file fails, a sibling import is not enough', () => {
      const { dir, cleanup } = makeTree({
        [TWIN.file]: 'export function getBottleDir() { return 1 }',
        [TWIN.vectors as string]:
          "import { x } from 'backend/launcherMore'\nit('x', () => x)"
      })
      try {
        expect(twinViewProblems(TWIN, dir)).toEqual([
          expect.stringContaining('does not import src/backend/launcher.ts')
        ])
      } finally {
        cleanup()
      }
    })

    it('a twin row whose file does not export its name, or does not exist, fails', () => {
      const { dir, cleanup } = makeTree({
        [TWIN.file]: 'function getBottleDir() { return 1 }',
        [TWIN.vectors as string]: "import 'backend/launcher'"
      })
      try {
        expect(twinViewProblems(TWIN, dir)).toEqual([
          expect.stringContaining("does not export 'getBottleDir'")
        ])
        expect(
          twinViewProblems({ ...TWIN, file: 'src/backend/missing.ts' }, dir)
        ).toEqual([expect.stringContaining('does not exist')])
      } finally {
        cleanup()
      }
    })

    it('a twin row outside the discovery scope is not part of the set-equality check', () => {
      expect(scheduledKeys([TWIN])).toEqual([])
      expect(
        scheduledKeys([{ ...TWIN, file: `${ENGINEWINE_DIR}/bottlePaths.ts` }])
      ).toEqual([`${ENGINEWINE_DIR}/bottlePaths.ts#getBottleDir`])
    })
  })

  describe('deletedBy', () => {
    const row = (deletedBy: number): ScheduleRow => ({
      name: 'f',
      file: `${ENGINEWINE_DIR}/f.ts`,
      shape: 'shim',
      channel: 'RUST_ENGINE_X',
      callers: [],
      deletedBy
    })

    it('a deletedBy outside 87..99, or not an integer, fails', () => {
      expect(deletedByProblems([row(87), row(99), row(93)])).toEqual([])
      for (const bad of [86, 100, 0, 92.5, Number.NaN]) {
        expect(deletedByProblems([row(bad)])).toHaveLength(1)
      }
    })

    it('noIntraPhaseRowsLeft fails while a row has deletedBy 87 and passes once none does', () => {
      expect(() => noIntraPhaseRowsLeft([row(87), row(98)])).toThrow(
        /intra-phase rows.*f\.ts#f/
      )
      expect(() => noIntraPhaseRowsLeft([row(88), row(98)])).not.toThrow()
      expect(() => noIntraPhaseRowsLeft([])).not.toThrow()
    })
  })

  it('self-test: an empty directory walks no files and fails the schedule floor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'engine-wine-shim-schedule-'))
    try {
      const walk = walkStripped(['src/backend'], { base: dir })
      expect(walk.count).toBe(0)
      expect(() =>
        assertAtOrAboveFloor(
          'engineWineShimSchedule src/backend files',
          walk.count,
          BACKEND_FILES_FLOOR
        )
      ).toThrow(/engineWineShimSchedule src\/backend files/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
