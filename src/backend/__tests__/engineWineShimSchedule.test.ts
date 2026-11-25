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
 * `deletedBy` is the phase that deletes the row: an integer in 87..99, or an inserted decimal phase the
 * roadmap declares (88.1, 88.2, 88.3, 90.1, 90.2 at 88-02; read from the `### Phase N.M:` headings of
 * `.planning/ROADMAP.md`, D-30). 87 marks an intra-phase shim
 * that a TS module still alive inside Phase 87 uses; 87-56c asserts no 87 row remains
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
/**
 * Directories whose exported values and typed Rust calls are discovered as schedule rows. 88 adds
 * `launchrust`, so every launch shim and twin is a row from the commit that creates it. A missing
 * directory contributes no files (the second does not exist until a 88 plan creates it).
 */
const SHIM_DIRS = [ENGINEWINE_DIR, 'src/backend/launchrust'] as const
const RESOLVERS_FILE = 'src/backend/sidecar/engineWineResolvers.ts'
const CHANNEL_PREFIXES = [
  'RUST_ENGINE_',
  'RUST_WINE_',
  'RUST_KNOWNFIX_',
  'RUST_LAUNCH_',
  'RUST_RUNNER_'
] as const

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
  /**
   * The phase that deletes this row: an integer in 87..99 or an inserted decimal phase the roadmap
   * declares. 87 is an intra-phase shim; 87-56c asserts none remain.
   */
  deletedBy: number
}

/** Every non-test importer of `launcher.ts` and of `commandRunner.ts` (the twin check is per file). */
const LAUNCHER_IMPORTERS: readonly string[] = [
  // 88.1-15: the interim prepare adapters take the `LauncherDeps` type.
  'src/backend/launchAdapters.ts',
  'src/backend/services/types.ts',
  // 88.1-08: bootstrap.ts no longer imports `launcher.ts` (its command-runner `wine` binding goes through the shims).
  'src/backend/storeManagers/index.ts',
  // 88.1-01: the launch oracle's fake deps import the `LauncherDeps` type to build the real Launcher over fakes.
  'src/backend/testUtils/launchOracle/fakeLauncherDeps.ts'
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
 * validation and the import settings), the engine flows (87-42 adds `prepareBottle`),
 * and (87-43) every bridge file that used to reach the helpers through the re-exporting engine modules.
 * 87-55 adds `gameLaunchOverlay.ts`, which takes `isNonCrossover` from here now. The TS engine's own importers of the
 * file (`src/backend/engine/*`) were deleted with the directory in 87-56c.
 */
const ENGINE_TWIN_IMPORTERS: readonly string[] = [
  'src/backend/sidecar/bootstrap.ts',
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
  'src/backend/storeManagers/steam/engine/engineSync.ts',
  'src/backend/storeManagers/steam/engine/pinnedEngine.ts',
  'src/backend/storeManagers/steam/engine/prepareBottle.ts',
  'src/backend/storeManagers/steam/gameBridgeLaunch.ts',
  'src/backend/storeManagers/steam/gameBridgeWineLaunch.ts',
  'src/backend/storeManagers/steam/gameEngineDialogs.ts',
  'src/backend/storeManagers/steam/gameInstallBridge.ts',
  'src/backend/storeManagers/steam/gameLaunch.ts',
  'src/backend/storeManagers/steam/gameLaunchOverlay.ts',
  'src/backend/storeManagers/steam/provisionBottle.ts',
  'src/backend/storeManagers/storeManagerCommon/games.ts',
  'src/backend/testUtils/testEngineTransport.ts'
]
/**
 * Every non-test importer of `enginewine/tools.ts` (the check is per file, so every row of that file lists them all):
 * the Steam bridge's known fixes (87-56c deleted the still-TS engine's `installRemove`, `services/engineServices.ts`; 88.1-15
 * moved the launcher's DXVK step and installed-packages line into Rust).
 */
const TOOLS_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/storeManagers/steam/bridgeKnownFixes.ts'
]
/**
 * Every non-test importer of `launchrust/builders.ts` (the check is per file, so every row of that file lists them
 * all): the launcher binds the shims into its members, which the three managers' `launch()` call (88.1-07), and the
 * command runner's `wine` binding calls three of them from `bootstrap.ts` (88.1-08).
 */
const LAUNCH_BUILDER_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/launcher.ts',
  'src/backend/sidecar/bootstrap.ts'
]
/** Every non-test importer of `launchrust/prepare.ts` (the check is per file): the interim prepare adapters (88.1-15). */
const LAUNCH_PREPARE_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/launchAdapters.ts'
]
/**
 * Every non-test importer of `launchrust/knownFixes.ts` (the check is per file, so every row of that file lists them
 * all): the three managers' `launch()` and the download manager's install-time fetch (88-12), and the shared
 * launcher's per-launch registry fixes and overlay env (88-13), and the Steam bridge's registry fixes and overlay env
 * (88-14), and the two Steam library call sites of the opt-in detected-fix report (88-15).
 */
const KNOWN_FIX_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/downloadmanager/utils.ts',
  'src/backend/storeManagers/gog/games.ts',
  'src/backend/storeManagers/legendary/games.ts',
  'src/backend/storeManagers/nile/games.ts',
  'src/backend/storeManagers/steam/bridgeInstallState.ts',
  'src/backend/storeManagers/steam/bridgeKnownFixes.ts',
  'src/backend/storeManagers/steam/library/macArch.ts'
]
/**
 * Every non-test importer of `launchrust/knownFixTwins.ts` (the check is per file, so every row of that file lists them
 * all): the launcher's `installFixes` and `getKnownFixesEnvVariables` and its env log line, and storeManagerCommon's
 * `withKnownFixEnv` (88-13), and the Steam bridge's known-fix application (the profile and launch-override reads, the
 * env lookup) and the steamclient layer install (the overlay archive reader) (88-14), and the Steam library's
 * synchronous readers (the DRM and macArch known-fix hints, the overlay launch gate, the shared-redist install)
 * (88-15), and the two build scripts that write and verify overlay archives (`readOverlayTarGz`, `buildOverlayTarGz`),
 * which imported the deleted TS `knownFixOverlayArchive` module until 88-16.
 */
const KNOWN_FIX_TWIN_IMPORTERS: readonly string[] = [
  'meta/buildOverlayArchive.ts',
  'meta/buildSteamClientLayerArchive.ts',
  'src/backend/launcher.ts',
  'src/backend/storeManagers/steam/bridge/drm/steamclientLayerInstall.ts',
  'src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts',
  'src/backend/storeManagers/steam/bridgeKnownFixes.ts',
  'src/backend/storeManagers/steam/drmKnownFix.ts',
  'src/backend/storeManagers/steam/gameLaunchOverlay.ts',
  'src/backend/storeManagers/steam/macArchKnownFix.ts',
  'src/backend/storeManagers/storeManagerCommon/games.ts'
]
/** Every non-test importer of `enginewine/bottles.ts` (the check is per file, so every row of that file lists them all). */
const BOTTLES_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/storeManagers/steam/bridgeBottleLifecycle.ts',
  'src/backend/storeManagers/steam/engine/engineSync.ts',
  'src/backend/storeManagers/steam/engine/fallbackBottleCall.ts',
  'src/backend/storeManagers/steam/engine/prepareBottle.ts',
  'src/backend/storeManagers/steam/gameBridgeLaunch.ts',
  // 87-65 (F3): shutdownWine routes a CrossOver bottle overlay's Stop to the bottle's wineserver kill.
  'src/backend/utils.ts',
  // 87-70 (F5): removePrefix routes a non-Steam game's own per-game bottle to the crate's removal op.
  'src/backend/utils/uninstaller.ts'
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
 * the Steam launch and its engine adapter (87-54) and the CrossOver bin-dir lookup (87-55); the still-TS decision module
 * that took its types from here went with the engine directory in 87-56c.
 */
const DECISION_SHIM_IMPORTERS: readonly string[] = [
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
 * factory over the two shims (87-55) and the pinned-engine download's cancel (87-56a, one cancel registry).
 */
const RUN_TOOL_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/storeManagers/steam/engine/pinnedEngine.ts',
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
 * Every non-test importer of `enginewine/fallback.ts` (the check is per file): the Steam first-need download wrapper
 * (87-56a).
 */
const FALLBACK_SHIM_IMPORTERS: readonly string[] = [
  'src/backend/storeManagers/steam/engine/pinnedEngine.ts'
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
export const SCHEDULE: readonly ScheduleRow[] = [
  // 87-18 (D-15): the launcher's pre-launch runtime step. Phase 88 moves launch into Rust and deletes both.
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
    // Last call site: utils.ts:1131, `downloadDefaultWine`, which 88.1 ports (D-28, D-30); the resolver caller goes with the same sub-phase.
    deletedBy: 88.1
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
    // Last call site: utils.ts:1107, `downloadDefaultWine`, which 88.1 ports (D-28, D-30).
    deletedBy: 88.1
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
    // Only caller: the `releasesInfoReady` listener in engineWineResolvers.ts:426, emitted by utils/releases.ts; not a launch path, so it goes with the resolvers in 98 (88-02, RESEARCH open question 8).
    deletedBy: 98
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
    // Last reach: the command runner's `validWine` binding (commandRunner.ts:302, sidecar/bootstrap.ts:1893), ported in 88.2 (D-30).
    deletedBy: 88.2
  },
  // 87-26 (D-15, D-22): wine discovery. `discoverAlternativeWine` is the one async TS reach into the Rust discovery
  // (config.ts's `getAlternativeWine`, which utils.ts and the Steam install form call), deleted with the config in
  // Phase 98. The intra-phase `discoverCrossover` shim (`enginewine/intraPhase.ts`, for the still-TS engine's CrossOver
  // locator) went with the engine TS in 87-56c.
  {
    name: 'discoverAlternativeWine',
    file: 'src/backend/enginewine/wineDiscovery.ts',
    shape: 'shim',
    channel: 'RUST_WINE_DISCOVER_ALTERNATIVES',
    callers: ['src/backend/config.ts'],
    deletedBy: 98
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
  // and the pin download, the status update and the selection view are `steam/engine/prepareBottle.ts`'s work around it.
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
  // 87-70 (F5, the user's 2026-11-24 gap decision 5): the non-Steam uninstall removes a game's own per-game bottle
  // through the crate op. Its one caller is `utils/uninstaller.ts` `removePrefix`, which serves every non-Steam
  // runner; no ROADMAP section names that file (Phase 91 ports Epic and Phase 92 GOG, Amazon and sideload, each as
  // "uninstall a game"), so it goes with the join phase, 98, like the other shims whose callers have no single owner.
  {
    name: 'removeGameBottle',
    file: 'src/backend/enginewine/bottles.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_BOTTLE_REMOVE_PER_GAME',
    callers: BOTTLES_SHIM_IMPORTERS,
    deletedBy: 98
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
  // sync fast path `bottle.ts` reads inline is the twin `crossoverBinDirSync` (87-56b). Phase 98 moves the lookup's last
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
  // 87-56a (D-01, D-10): the Steam first-need pinned-engine download. `steam/engine/pinnedEngine.ts` names each run with a
  // cancel id and sends `engine_cancel` for it when the signal aborts; Rust sends the `engine-download` statuses itself.
  {
    name: 'ensureFallbackEngine',
    file: 'src/backend/enginewine/fallback.ts',
    shape: 'shim',
    channel: 'RUST_ENGINE_FALLBACK_ENSURE',
    callers: FALLBACK_SHIM_IMPORTERS,
    deletedBy: 96
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
      'src/backend/sidecar/handlers.ts',
      'src/backend/storeManagers/steam/bridgeBottle.ts',
      'src/backend/storeManagers/steam/bridgeBottleLifecycle.ts',
      'src/backend/storeManagers/steam/bridgeWineTools.ts',
      'src/backend/storeManagers/steam/engine/engineSync.ts',
      'src/backend/storeManagers/steam/engine/prepareBottle.ts',
      'src/backend/storeManagers/steam/gameBridgeWineLaunch.ts',
      'src/backend/storeManagers/steam/gameLaunch.ts',
      'src/backend/storeManagers/steam/gameLaunchOverlay.ts',
      // 87-56c: the test transport empties the view per test.
      'src/backend/testUtils/testEngineTransport.ts'
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
    callers: ['src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  {
    name: 'toggleDXVKNVAPI',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['gameSettings'],
    channel: 'RUST_WINE_DXVK_INSTALL_REMOVE',
    callers: ['src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  {
    name: 'toggleVKD3D',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['gameSettings'],
    channel: 'RUST_WINE_DXVK_INSTALL_REMOVE',
    callers: ['src/backend/sidecar/handlers.ts'],
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
    callers: ['src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  // 87-34 (D-15): the DXVK shim. The launcher's DXVK step and the Steam bridge's known fixes reach the Rust op through it
  // (the still-TS engine's `installRemove` went with `services/engineServices.ts` in 87-56c); Phase 88
  // moves launch into Rust and deletes it.
  // 87-35 (D-15): the Winetricks shims. The launcher's known-fix install and its installed-packages log line, and the
  // Steam bridge's known fixes, reach the Rust Winetricks ops through them with the settings they already hold; Phase
  // 88 moves launch into Rust and deletes them. `callers` is every importer of the file (the check is per file).
  {
    name: 'winetricksInstallVerbs',
    file: 'src/backend/enginewine/tools.ts',
    shape: 'shim',
    channel: 'RUST_WINE_WINETRICKS_INSTALL',
    callers: TOOLS_SHIM_IMPORTERS,
    // The Steam bridge still calls it (bridgeKnownFixes.ts:290), so it outlives 88.1's launcher.ts:1198 caller and goes with the bridge in 97 (88-02).
    deletedBy: 97
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
    callers: ['src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  {
    name: 'winetricksAvailable',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['target'],
    channel: 'RUST_WINE_WINETRICKS_AVAILABLE',
    callers: ['src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  {
    name: 'winetricksInstalled',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['target'],
    channel: 'RUST_WINE_WINETRICKS_INSTALLED',
    callers: ['src/backend/sidecar/handlers.ts'],
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
    callers: ['src/backend/sidecar/handlers.ts'],
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
    callers: ['src/backend/sidecar/handlers.ts'],
    deletedBy: 98
  },
  {
    name: 'callTool',
    file: 'src/backend/sidecar/engineWineResolvers.ts',
    shape: 'resolver',
    inputs: ['facts'],
    channel: 'RUST_WINE_TOOL_CALL',
    callers: ['src/backend/sidecar/handlers.ts'],
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
  // 87-57: the oracle harness (`testUtils/engineWineOracle/`) is trimmed to what that one oracle test imports and is deleted with
  // these twins' vector test in Phase 88.
  {
    name: 'setupEnvVars',
    file: 'src/backend/launcher.ts',
    shape: 'twin',
    vectors: 'src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts',
    callers: LAUNCHER_IMPORTERS,
    // Twin of the launcher's env builder, ported to Rust in 88.1 (D-30).
    deletedBy: 88.1
  },
  {
    name: 'setupWineEnvVars',
    file: 'src/backend/launcher.ts',
    shape: 'twin',
    vectors: 'src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts',
    callers: LAUNCHER_IMPORTERS,
    // Twin of the launcher's wine env builder, ported to Rust in 88.1 (D-30).
    deletedBy: 88.1
  },
  {
    name: 'createCommandRunner',
    file: 'src/backend/commandRunner.ts',
    shape: 'twin',
    vectors: 'src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts',
    callers: COMMAND_RUNNER_IMPORTERS,
    // Twin of the command runner, ported to Rust in 88.2 (D-30).
    deletedBy: 88.2
  },
  // 87-28 (D-24 extended, for the checker and the operator): the non-bridge sync pure helpers of the engine
  // configuration. They are called synchronously from the launch paths (`engineKeyFor`: launcher.ts and the five
  // games.ts, Phase 92) and from the settings and install flows' engine-override validation (Phase 98), so they
  // cannot become async shims; each lives once in `enginewine/twin.ts`, pinned to Rust by the shared
  // `engine_twin.json` vectors that `twinVectors.test.ts` and `gamelib-engine`'s `twin_vectors.rs` both replay.
  // `callers` is every importer of the file (the check is per file). `perGameBottleName` is the naming rule the
  // bottle functions share; it was an intra-phase row until 87-56c deleted the engine TS that called it and made it private.
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
  // 87-39 (D-24): the bridge's sync pure bottle helpers, moved out of `bottlePrimitives`, `engineSwitch` and
  // `fallbackEngine` into `enginewine/twin.ts` and pinned to the Rust `bottles::paths`, `bottles::marker`,
  // `bottles::pin_marker`, `engines` and `tool_settings` by the shared `bottle_twin.json` vectors that
  // `twinVectors.test.ts` and `twin_vectors.rs` both replay. The launch path and the bridge call them inline, so
  // they stay synchronous until Phase 96 moves the Steam bridge; `ENGINE_PINS` and `pinById` read the
  // `common/enginePins.json` the Rust crate reads. The helpers the marker
  // writers and pinned-engine installer shared with the readers were intra-phase rows until 87-56c deleted their callers
  // and made them private (the plan named ten rows).
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
  // 87-56b (D-24): the Steam bottle's synchronous CrossOver read and the override grammar. Rust owns them as
  // `CrossoverLocator::resolve_bin_dir_sync` and `ids::parse_engine_override`; `bottle_twin.json` and
  // `override_twin.json` pin the two sides (`twinVectors.test.ts` here, `twin_vectors.rs` in Rust). The first goes
  // with the bridge's launch in Phase 96, the second with the settings and install flows in Phase 98.
  {
    name: 'crossoverBinDirSync',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 96
  },
  {
    name: 'parseEngineOverride',
    file: 'src/backend/enginewine/twin.ts',
    shape: 'twin',
    vectors: 'src/backend/enginewine/__tests__/twinVectors.test.ts',
    callers: ENGINE_TWIN_IMPORTERS,
    deletedBy: 98
  },
  // 88-12 (D-01, D-03): the known-fix shims. The managers keep their `launch()` until 91 and 92 and read the game's
  // known-fix launch overrides from Rust through this shim (legendary leaves in 91, gog and nile in 92, so the row goes
  // with the last of them); `settleKnownFixLaunchOverrides` narrows the untyped answer. `callers` is every importer.
  {
    name: 'readKnownFixLaunchOverrides',
    file: 'src/backend/launchrust/knownFixes.ts',
    shape: 'shim',
    channel: 'RUST_KNOWNFIX_LAUNCH_OVERRIDES',
    callers: KNOWN_FIX_SHIM_IMPORTERS,
    deletedBy: 92
  },
  // 88-12 (D-01, D-03): the download manager's fire-and-forget remote fixes fetch at install time. It is called from
  // `downloadmanager/utils.ts`, which the download manager's own phase (93) deletes.
  {
    name: 'fetchRemoteKnownFixes',
    file: 'src/backend/launchrust/knownFixes.ts',
    shape: 'shim',
    channel: 'RUST_KNOWNFIX_FETCH_REMOTE',
    callers: KNOWN_FIX_SHIM_IMPORTERS,
    deletedBy: 93
  },
  // 88-13 (D-03): the launcher's per-launch tier-2 registry fixes and overlay env. `prepareWineLaunch` awaits both; 88.1
  // moves `prepare_wine_launch` into Rust, which calls the two ops in-process, so both rows go with it
  // (`settleKnownFixRegistry` and `settleKnownFixOverlayEnv` keep a rejected call from failing the launch).
  // 88-14 (D-03): the Steam bridge's registry fixes and overlay env. `applySteamBridgeKnownFixes` awaits both inside its
  // existing async body (`settleKnownFixRegistry` and `settleKnownFixOverlayEnv` keep a rejected call from failing a
  // launch). The bridge's known-fix application is TS until 97 deletes the bridge's TS known-fix modules, so both rows go
  // with it.
  {
    name: 'applyRegistryFixes',
    file: 'src/backend/launchrust/knownFixes.ts',
    shape: 'shim',
    channel: 'RUST_KNOWNFIX_APPLY_REGISTRY',
    callers: KNOWN_FIX_SHIM_IMPORTERS,
    deletedBy: 97
  },
  {
    name: 'resolveKnownFixOverlayEnv',
    file: 'src/backend/launchrust/knownFixes.ts',
    shape: 'shim',
    channel: 'RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV',
    callers: KNOWN_FIX_SHIM_IMPORTERS,
    deletedBy: 97
  },
  // 88-15 (D-03): the opt-in detected-fix report. The Steam library's two detector hooks (the CEG probe in
  // `bridgeInstallState.persistBridgeDrmSignal`, the Mach-O check in `library/macArch.applyMacArchVerdict`) call it
  // fire-and-forget with a logged rejection; `enabled` is their `shareDetectedFixes === true` setting fact (config is
  // TS until 98). The bridge's launch files import bridgeInstallState, so the row goes with them in 97.
  {
    name: 'reportDetectedFix',
    file: 'src/backend/launchrust/knownFixes.ts',
    shape: 'shim',
    channel: 'RUST_KNOWNFIX_REPORT_DETECTED',
    callers: KNOWN_FIX_SHIM_IMPORTERS,
    deletedBy: 97
  },
  // 88.1-07 (D-01, D-19): the launch builders the managers call. The managers' `launch()` awaits each member of the
  // launcher, which `createLauncher` binds to these shims and narrows through `launchBuilderReply.ts`. They go when
  // 91 (legendary) and 92 (gog and nile) move the launch flow into Rust, which calls the builders in process.
  {
    name: 'setupWrapperEnvVars',
    file: 'src/backend/launchrust/builders.ts',
    shape: 'shim',
    channel: 'RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS',
    callers: LAUNCH_BUILDER_SHIM_IMPORTERS,
    // legendary's launch leaves in 91, gog's and nile's in 92
    deletedBy: 92
  },
  {
    name: 'setupEnvVars',
    file: 'src/backend/launchrust/builders.ts',
    shape: 'shim',
    channel: 'RUST_LAUNCH_SETUP_ENV_VARS',
    callers: LAUNCH_BUILDER_SHIM_IMPORTERS,
    // legendary's launch leaves in 91, gog's and nile's in 92
    deletedBy: 92
  },
  {
    name: 'setupWrappers',
    file: 'src/backend/launchrust/builders.ts',
    shape: 'shim',
    channel: 'RUST_LAUNCH_SETUP_WRAPPERS',
    callers: LAUNCH_BUILDER_SHIM_IMPORTERS,
    // legendary's launch leaves in 91, gog's and nile's in 92
    deletedBy: 92
  },
  {
    name: 'getKnownFixesEnvVariables',
    file: 'src/backend/launchrust/builders.ts',
    shape: 'shim',
    channel: 'RUST_LAUNCH_KNOWN_FIX_ENV',
    callers: LAUNCH_BUILDER_SHIM_IMPORTERS,
    // legendary's launch leaves in 91, gog's and nile's in 92
    deletedBy: 92
  },
  // 88.1-08 (D-01, D-19, 87 D-22): the wine env and the prefix check. The save-path sync and the GOG and Amazon setup reach
  // them through the launcher's members, and the command runner's `wine` binding through `bootstrap.ts`; they go when
  // the save sync and the setup modules leave (92).
  {
    name: 'setupWineEnvVars',
    file: 'src/backend/launchrust/builders.ts',
    shape: 'shim',
    channel: 'RUST_LAUNCH_SETUP_WINE_ENV_VARS',
    callers: LAUNCH_BUILDER_SHIM_IMPORTERS,
    // save_sync and the setup modules leave in 92
    deletedBy: 92
  },
  {
    name: 'verifyWinePrefix',
    file: 'src/backend/launchrust/builders.ts',
    shape: 'shim',
    channel: 'RUST_LAUNCH_VERIFY_WINE_PREFIX',
    callers: LAUNCH_BUILDER_SHIM_IMPORTERS,
    // save_sync and the setup modules leave in 92
    deletedBy: 92
  },
  // 88.1-15 (D-01, D-19, D-30): the prepare step. The Launcher's `prepareLaunch` is bound to the interim adapter in
  // `launchAdapters.ts`, which gathers the TS-only facts, makes this one call and replays the log; 88.3 replaces the adapter
  // and the managers' launch leaves in 91 and 92.
  {
    name: 'prepareLaunch',
    file: 'src/backend/launchrust/prepare.ts',
    shape: 'shim',
    channel: 'RUST_LAUNCH_PREPARE',
    callers: LAUNCH_PREPARE_SHIM_IMPORTERS,
    // legendary's launch leaves in 91, gog's and nile's in 92
    deletedBy: 92
  },
  {
    name: 'prepareWineLaunchBegin',
    file: 'src/backend/launchrust/prepare.ts',
    shape: 'shim',
    channel: 'RUST_LAUNCH_PREPARE_WINE_BEGIN',
    callers: LAUNCH_PREPARE_SHIM_IMPORTERS,
    // legendary's launch leaves in 91, gog's and nile's in 92
    deletedBy: 92
  },
  {
    name: 'prepareWineLaunchFinish',
    file: 'src/backend/launchrust/prepare.ts',
    shape: 'shim',
    channel: 'RUST_LAUNCH_PREPARE_WINE_FINISH',
    callers: LAUNCH_PREPARE_SHIM_IMPORTERS,
    // legendary's launch leaves in 91, gog's and nile's in 92
    deletedBy: 92
  },
  // 88-13 (87 D-24): the synchronous known-fix twins, for callers 88 cannot make async. `installFixes` and
  // `getKnownFixesEnvVariables` read the tier-1 fix inline in the launcher until 88.1/97 move them; the env log line goes
  // with them. `withKnownFixEnv` builds the settings storeManagerCommon launches with, which the sideload and
  // store-manager phase (92) replaces. Each is pinned to the Rust `golden/reader` and `golden/overlay_install` answers by
  // `knownFixTwins.vectors.test.ts`.
  {
    name: 'readKnownFixes',
    file: 'src/backend/launchrust/knownFixTwins.ts',
    shape: 'twin',
    vectors: 'src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts',
    callers: KNOWN_FIX_TWIN_IMPORTERS,
    deletedBy: 97
  },
  {
    name: 'formatKnownFixEnvLine',
    file: 'src/backend/launchrust/knownFixTwins.ts',
    shape: 'twin',
    vectors: 'src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts',
    callers: KNOWN_FIX_TWIN_IMPORTERS,
    deletedBy: 97
  },
  {
    name: 'logKnownFixEnv',
    file: 'src/backend/launchrust/knownFixTwins.ts',
    shape: 'twin',
    vectors: 'src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts',
    callers: KNOWN_FIX_TWIN_IMPORTERS,
    deletedBy: 97
  },
  {
    name: 'withKnownFixEnv',
    file: 'src/backend/launchrust/knownFixTwins.ts',
    shape: 'twin',
    vectors: 'src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts',
    callers: KNOWN_FIX_TWIN_IMPORTERS,
    deletedBy: 92
  },
  // 88-14 (87 D-24): the Steam bridge's synchronous known-fix reads, which `applySteamBridgeKnownFixes` and
  // `steamBridgeLaunchCommandParts` make inline (the tier-2 profile for the shim-feature lines and the registry and
  // overlay gates, the launch overrides for the wine command, the merged-env lookup for the overlay base values), the
  // overlay archive reader the steamclient layer install verifies a download with and the writer its test builds
  // fixture archives with. Each is pinned to the Rust `golden/reader`, `golden/launch_overrides`,
  // `golden/overlay_install` and `golden/overlay_archive` answers by `knownFixTwins.vectors.test.ts`; 97 deletes the
  // bridge's TS known-fix modules and these go with it.
  {
    name: 'readKnownFixProfile',
    file: 'src/backend/launchrust/knownFixTwins.ts',
    shape: 'twin',
    vectors: 'src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts',
    callers: KNOWN_FIX_TWIN_IMPORTERS,
    deletedBy: 97
  },
  {
    name: 'readKnownFixLaunchOverridesSync',
    file: 'src/backend/launchrust/knownFixTwins.ts',
    shape: 'twin',
    vectors: 'src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts',
    callers: KNOWN_FIX_TWIN_IMPORTERS,
    deletedBy: 97
  },
  {
    name: 'lastEnvOption',
    file: 'src/backend/launchrust/knownFixTwins.ts',
    shape: 'twin',
    vectors: 'src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts',
    callers: KNOWN_FIX_TWIN_IMPORTERS,
    deletedBy: 97
  },
  {
    name: 'readOverlayTarGz',
    file: 'src/backend/launchrust/knownFixTwins.ts',
    shape: 'twin',
    vectors: 'src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts',
    callers: KNOWN_FIX_TWIN_IMPORTERS,
    deletedBy: 97
  },
  {
    name: 'buildOverlayTarGz',
    file: 'src/backend/launchrust/knownFixTwins.ts',
    shape: 'twin',
    vectors: 'src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts',
    callers: KNOWN_FIX_TWIN_IMPORTERS,
    deletedBy: 97
  }
]

const key = (file: string, name: string): string => `${file}#${name}`

/** True for a file under one of the shim directories (enginewine, and launchrust from 88). */
const inShimDir = (path: string): boolean =>
  SHIM_DIRS.some((dir) => path.startsWith(`${dir}/`))

/** True for the files discovery reads exports from: the shim directories and the resolvers file. */
const inScopeFile = (path: string): boolean =>
  inShimDir(path) || path === RESOLVERS_FILE

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
    files.filter((f) => !inShimDir(f.path)),
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

const ROADMAP_FILE = '.planning/ROADMAP.md'

/**
 * The legal `deletedBy` values (D-30): the integers 87..99 plus every inserted decimal phase the
 * roadmap declares with a `### Phase N.M:` heading whose N lies in 87..99. `roadmap` is the text of
 * `ROADMAP.md`; a missing file contributes no decimal phase.
 */
function allowedDeletedBy(roadmap: string): ReadonlySet<number> {
  const allowed = new Set<number>()
  for (let n = 87; n <= 99; n++) allowed.add(n)
  for (const m of roadmap.matchAll(/^### Phase (\d+)\.(\d+):/gm)) {
    const major = Number(m[1])
    if (major >= 87 && major <= 99) allowed.add(Number(`${m[1]}.${m[2]}`))
  }
  return allowed
}

const ROADMAP_TEXT = existsSync(join(REPO_ROOT, ROADMAP_FILE))
  ? readFileSync(join(REPO_ROOT, ROADMAP_FILE), 'utf8')
  : ''
const ALLOWED_DELETED_BY = allowedDeletedBy(ROADMAP_TEXT)

/** Why a row's `deletedBy` is not a phase in 87..99 (an integer, or a decimal the roadmap declares). */
function deletedByProblems(
  schedule: readonly ScheduleRow[],
  allowed: ReadonlySet<number> = ALLOWED_DELETED_BY
): string[] {
  return schedule
    .filter((r) => !allowed.has(r.deletedBy))
    .map(
      (r) =>
        `${key(r.file, r.name)}: deletedBy ${String(r.deletedBy)} is not a phase in 87..99`
    )
}

/**
 * 87-56c calls this over the final schedule (`enginePortComplete`, in `engineWinePortComplete.test.ts`): throws naming every row still marked `deletedBy: 87`,
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

/**
 * The rows `phase` deletes (`deletedBy === phase`). Each 88.x sub-phase finds its own rows with this,
 * so a plan deleting a slice names exactly the rows it owes (D-30).
 */
export function rowsDueIn<T extends Pick<ScheduleRow, 'deletedBy'>>(
  schedule: readonly T[],
  phase: number
): T[] {
  return schedule.filter((r) => r.deletedBy === phase)
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

  it('every row is scheduled for deletion in a roadmap phase in 87..99', () => {
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

    it('88 discovery: launchrust exports are rows, and RUST_KNOWNFIX_, RUST_LAUNCH_ and RUST_RUNNER_ calls outside the shim directories are discovered', () => {
      const shim = planted(
        'src/backend/launchrust/prepare.ts',
        'export function prepareRust(deps) { return deps.requestRustInvoke(RUST_LAUNCH_PREPARE, []) }'
      )
      expect(discover([shim])).toEqual([
        'src/backend/launchrust/prepare.ts#prepareRust'
      ])
      expect(diff(discover([shim]), scheduledKeys([])).unscheduled).toEqual([
        'src/backend/launchrust/prepare.ts#prepareRust'
      ])
      for (const prefix of ['KNOWNFIX', 'LAUNCH', 'RUNNER']) {
        const outside = planted(
          `src/backend/other/${prefix.toLowerCase()}.ts`,
          `export function use${prefix}(deps) { return deps.requestRustInvoke(RUST_${prefix}_Z, []) }`
        )
        expect(discover([outside])).toEqual([
          `src/backend/other/${prefix.toLowerCase()}.ts#use${prefix}`
        ])
      }
      const scheduled: ScheduleRow = {
        name: 'prepareRust',
        file: 'src/backend/launchrust/prepare.ts',
        shape: 'shim',
        channel: 'RUST_LAUNCH_PREPARE',
        callers: [],
        deletedBy: 88.1
      }
      expect(diff(discover([shim]), scheduledKeys([scheduled]))).toEqual({
        unscheduled: [],
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
          'the first argument must be a RUST_ENGINE_* or RUST_WINE_* or RUST_KNOWNFIX_* or RUST_LAUNCH_* or RUST_RUNNER_* constant'
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

    it('a deletedBy that is not a roadmap phase in 87..99 fails', () => {
      expect(deletedByProblems([row(87), row(99), row(93)])).toEqual([])
      for (const bad of [86, 100, 0, 92.5, 88.4, 88.15, Number.NaN]) {
        expect(deletedByProblems([row(bad)])).toHaveLength(1)
      }
      expect(deletedByProblems([row(88.4)])[0]).toMatch(
        /deletedBy 88\.4 is not a phase in 87\.\.99/
      )
    })

    it('an inserted decimal phase passes only when the roadmap declares it', () => {
      expect(deletedByProblems([row(88.1)])).toEqual([])
      expect(deletedByProblems([row(88.4)])).toHaveLength(1)
      const fixture = allowedDeletedBy(
        '### Phase 88.4: A planted phase (INSERTED)\n### Phase 12.3: outside the window\n'
      )
      expect(deletedByProblems([row(88.4)], fixture)).toEqual([])
      expect(deletedByProblems([row(12.3)], fixture)).toHaveLength(1)
      expect(deletedByProblems([row(88.1)], allowedDeletedBy(''))).toHaveLength(
        1
      )
    })

    it('the real roadmap declares the five inserted decimal phases', () => {
      for (const d of [88.1, 88.2, 88.3, 90.1, 90.2]) {
        expect(ALLOWED_DELETED_BY.has(d)).toBe(true)
      }
      expect(ALLOWED_DELETED_BY.has(34.7)).toBe(false)
      expect(ALLOWED_DELETED_BY.has(999.2)).toBe(false)
    })

    it('rowsDueIn returns the rows whose deletedBy equals the phase, and only those', () => {
      const rows = [row(88.1), row(88.2), row(88.1), row(98)]
      expect(rowsDueIn(rows, 88.1)).toHaveLength(2)
      expect(rowsDueIn(rows, 88.2)).toHaveLength(1)
      expect(rowsDueIn(rows, 88)).toEqual([])
      expect(rowsDueIn([], 98)).toEqual([])
      expect(rowsDueIn(SCHEDULE, 88)).toEqual([])
      // 88.1-15 retired every row the TS prepare steps called; what is left is what 88.1-16 and 88.1-17 remove.
      expect(
        rowsDueIn(SCHEDULE, 88.1)
          .map((r) => r.name)
          .sort()
      ).toEqual([
        'installWineVersion',
        'listWineReleases',
        'setupEnvVars',
        'setupWineEnvVars'
      ])
      expect(rowsDueIn(SCHEDULE, 88.2).length).toBeGreaterThanOrEqual(2)
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
