import type { Dialogs } from 'backend/host/dialogs'
import {
  GameInfo,
  Runner,
  WrapperEnv,
  ExecResult,
  GameSettings,
  LaunchParams,
  StatusPromise
} from 'common/types'
// This handles launching games, prefix creation etc..

import type { GlobalConfigSlice } from './config'
import type { GameConfigs } from './game_config'
import type { Notifications } from './host/notifications'
import type { AppState } from './host/appState'
import type { AppInfo, AppPaths } from './process/context'
import { existsSync } from 'graceful-fs'

import { sendGameStatusUpdate, askForceUninstall } from './utils'
import type { StoreLaunchHooks } from 'backend/storeManagers'
import { hasCapability, isStore } from 'common/storeCapabilities'
import {
  createGameLogWriter,
  logError,
  logInfo,
  LogPrefix,
  logWarning
} from './logger'
import type { GameCommandSource } from './services/gameCommandFacts'
import type {
  CommandRunner,
  SpawnAsync,
  StoreManagers,
  Stores
} from './services/types'
import type { ProcessRunner } from './process/types'
import type { OnlineMonitor } from './online_monitor'
import type { DialogBoxDeps } from './dialog/dialog'
import { validWine } from './enginewine/wineCore'
import { recordPlaySession } from './runsForMe'
import { addRecentGame } from './info/recentGames'
import {
  getKnownFixesEnvVariables as getKnownFixesEnvVariablesShim,
  setupEnvVars as setupEnvVarsShim,
  setupWineEnvVars as setupWineEnvVarsShim,
  setupWrapperEnvVars as setupWrapperEnvVarsShim,
  setupWrappers as setupWrappersShim,
  verifyWinePrefix as verifyWinePrefixShim
} from './launchrust/builders'
import {
  settleEnvMap,
  settleKnownFixEnv,
  settleVerifyPrefixReply,
  settleWordList
} from './launchBuilderReply'
import { isCLINoGui, isMac } from './constants/environment'
import { endEngineLaunch } from './enginewine/launch'
import { runLaunchEngineStep } from './launchEngineStep'

import type { AppRuntimeSlice } from './appRuntime'
import type LogWriter from './logger/targetWriter'
import type { RustInvokeDeps } from './host/rustInvokeDeps'
import {
  checkWineBeforeLaunch,
  prepareLaunch as prepareLaunchAdapter,
  prepareWineLaunch as prepareWineLaunchAdapter
} from './launchAdapters'

/** What the launcher is built from (66.1, D-02): constructed once per boot by createStoreManagers. */
export interface LauncherDeps
  extends
    DialogBoxDeps,
    RustInvokeDeps,
    AppRuntimeSlice<'events' | 'launchFlights'> {
  /** Also the boot's display-ack table (the engine step's refused-launch dialogs, 66.4-18). */
  dialogs: DialogBoxDeps['dialogs'] & Pick<Dialogs, 'displayAcks'>
  /** Late-bound: filled by createStoreManagers after the launcher is built, read at call time only. */
  libraryManagers: StoreManagers['library']
  launchHooks: Record<Runner, StoreLaunchHooks>
  commandRunner: CommandRunner
  /** The boot process runner: the gamescope --help probe runs through it. */
  runner: Pick<ProcessRunner, 'run'>
  spawnAsync: SpawnAsync
  stores: Pick<Stores, 'kvs' | 'runsForMe'>
  config: Pick<
    GlobalConfigSlice,
    'getSettings' | 'getAlternativeWine' | 'setSetting'
  >
  gameConfigs: Pick<GameConfigs, 'get'>
  appInfo: Pick<AppInfo, 'version'>
  onlineMonitor: Pick<OnlineMonitor, 'isOnline'>
  /** The boot's store root: the stored game config is read through it (85-15). */
  storeRoot?: GameCommandSource['storeRoot']
  paths: GameCommandSource['paths'] &
    Pick<
      AppPaths,
      | 'toolsPath'
      | 'configPath'
      | 'userData'
      | 'publicDir'
      | 'runtimePath'
      | 'appFolder'
      | 'flatpakHome'
      | 'sharedWinePrefix'
      | 'galaxyCommunicationExePath'
      | 'gamesConfigPath'
      | 'userHome'
      | 'fixesPath'
      | 'bundledFixesPath'
      | 'localFixesPath'
      | 'knownFixOverlaysPath'
      | 'defaultUmuPath'
    >
  /** The Steam bottle slice the Steam Wine-tool resolver reads (66.3-15). */
  steamBottle: GameCommandSource['steamBottle']
  steamLaunchRuntime: GameCommandSource['steamLaunchRuntime']
  notifications: Pick<Notifications, 'show'>
  appState: Pick<
    AppState,
    | 'raiseMainWindow'
    | 'raiseMainWindowForInAppDialog'
    | 'hideMainWindow'
    | 'exit'
    | 'wakeLock'
  >
}

/** The display-sleep blocker id of one launcher instance (closure state, not module state). */
interface PowerState {
  displayId: number | null
}

type LaunchCtx = LauncherDeps & { power: PowerState }

/**
 * Ends the display sleep blocker this launcher holds, once, and clears the held id so the next launch starts its own.
 * Every end of a launch that began after the blocker started goes through here (87-73, RF2): the normal end, a refused
 * engine step, a rejected one and a failed Wine check.
 */
function releaseDisplaySleepBlock(deps: LaunchCtx): void {
  const id = deps.power.displayId
  if (id === null) return
  logInfo('Stopping Display Power Saver Blocker', LogPrefix.Backend)
  deps.appState.wakeLock.stop(id)
  deps.power.displayId = null
}

async function runLaunchEventCallback(
  deps: LaunchCtx,
  { appName, launchArguments, runner, skipVersionCheck, args }: LaunchParams
): StatusPromise {
  const game = deps.libraryManagers[runner].getGame(appName)
  const gameInfo = game.getGameInfo()

  if (
    gameInfo.install.install_path &&
    !existsSync(gameInfo.install.install_path)
  ) {
    await askForceUninstall(deps, game, appName)

    sendGameStatusUpdate(deps, {
      appName,
      runner,
      status: 'done'
    })

    return { status: 'abort' }
  }

  let gameSettings = await game.getSettings()
  const { autoSyncSaves, savesPath, gogSaves = [] } = gameSettings

  if (!launchArguments && gameSettings.lastUsedLaunchOption) {
    launchArguments = gameSettings.lastUsedLaunchOption
  }

  const { title } = gameInfo

  const { minimizeOnLaunch, noTrayIcon } = deps.config.getSettings()

  const startPlayingDate = new Date()

  const { tsStore } = deps.stores.kvs
  if (!tsStore.has(appName)) {
    tsStore.set(`${appName}.firstPlayed`, startPlayingDate.toISOString())
  }

  logInfo(`Launching ${title} (${appName})`, LogPrefix.Backend)

  if (autoSyncSaves && deps.onlineMonitor.isOnline()) {
    sendGameStatusUpdate(deps, {
      appName,
      runner,
      status: 'syncing-saves'
    })
    logInfo(`Downloading saves for ${title}`, LogPrefix.Backend)
    try {
      await game.syncSaves('--skip-upload', savesPath, gogSaves)
      logInfo(`Saves for ${title} downloaded`, LogPrefix.Backend)
    } catch (error) {
      logError(
        `Error while downloading saves for ${title}. ${error}`,
        LogPrefix.Backend
      )
    }
  }

  sendGameStatusUpdate(deps, {
    appName,
    runner,
    status: 'launching'
  })

  // "Hide GameLib for every launch" (quick 261108-kpc). macOS restores from the Dock, so it needs
  // no tray icon; elsewhere the tray is the way back.
  if (minimizeOnLaunch && (isMac || !noTrayIcon)) {
    deps.appState.hideMainWindow()
  }

  // Prevent display from sleep
  if (!deps.power.displayId) {
    logInfo('Preventing display from sleep', LogPrefix.Backend)
    deps.power.displayId = deps.appState.wakeLock.start('prevent-display-sleep')
  }

  const logWriter = await createGameLogWriter(appName, runner, 'launch', {
    disableLogs: deps.config.getSettings().disableLogs,
    verboseLogs: (await deps.gameConfigs.get(appName).getSettings()).verboseLogs
  })

  if (!gameSettings.verboseLogs) {
    await logWriter.logWarning('IMPORTANT: Logs are disabled', {
      forceLog: true
    })
    await logWriter.logWarning(
      "Turn on Verbose logs in the game's settings (Advanced tab) before reporting an issue.",
      { forceLog: true }
    )
  }

  const isNative = game.isNative()

  // Phase 61 (D-05, D-13): on macOS every non-Steam Windows launch runs the engine step before
  // any Wine check. It returns the engine this launch uses; nothing is persisted (D-08). The step is
  // Rust's (87-52, D-01): the reply carries the settings this launch runs with and the lines for the log.
  let engineStep: Awaited<ReturnType<typeof runLaunchEngineStep>>
  try {
    engineStep = await runLaunchEngineStep(
      deps,
      {
        runner,
        appName,
        title,
        installPath: gameInfo.install?.install_path,
        platform: gameInfo.install?.platform,
        isNative,
        settings: gameSettings,
        offline: !deps.onlineMonitor.isOnline()
      },
      logWriter
    )
  } catch (error) {
    // A launch whose engine step failed ends here: its status and its blocker end with it (87-73, RF2).
    releaseDisplaySleepBlock(deps)
    sendGameStatusUpdate(deps, {
      appName,
      runner,
      status: 'done'
    })
    await logWriter.close().catch(() => undefined)
    throw error
  }
  if (engineStep.kind === 'refused') {
    releaseDisplaySleepBlock(deps)
    sendGameStatusUpdate(deps, {
      appName,
      runner,
      status: 'done'
    })

    await logWriter.close()

    return { status: 'abort' }
  }
  const engineControlled = engineStep.kind === 'use'
  const engineKey = engineStep.kind === 'use' ? engineStep.key : null
  const releaseEngine = async () => {
    if (engineKey === null) return
    // A release that fails (the app is quitting) must not replace the launch's own result or error.
    await endEngineLaunch(deps, engineKey).catch((error: unknown) =>
      logWarning(
        `Engine: ${engineKey} could not release its launch: ${String(error)}`,
        LogPrefix.Backend
      )
    )
  }
  if (engineStep.kind === 'use') {
    // Everything that follows sees the overlay, never the stored settings.
    gameSettings = engineStep.launchSettings
  }

  // check if isNative, if not, check if wine is valid. An engine-controlled launch skips this:
  // the engine step already validated its Wine, and checkWineBeforeLaunch's self-heal would
  // persist a derived or fallback engine into wineVersion (D-08).
  if (!isNative && !engineControlled) {
    const isWineOkToLaunch = await checkWineBeforeLaunch(
      deps,
      gameInfo,
      gameSettings,
      logWriter
    )

    if (!isWineOkToLaunch) {
      logError(
        `Was not possible to launch using ${gameSettings.wineVersion.name}`,
        LogPrefix.Backend
      )

      releaseDisplaySleepBlock(deps)
      sendGameStatusUpdate(deps, {
        appName,
        runner,
        status: 'done'
      })

      await logWriter.close()

      return { status: 'error' }
    }

    // NOTE (WR-03): Steam does not reach launchEventCallback today. The sidecar
    // `launch` handler and the gamelib:// deep link both use dispatchSteamLaunch,
    // so this block is dead code for Steam; it is kept in place.
    // debug/steam-bottle-game-no-launch (Pitfall 6, real-game-launch gap):
    // checkWineBeforeLaunch's self-heal above persists any corrected
    // wineVersion via the game config's setSetting(...) — a
    // store a Steam bottle-eligible game's actual dispatch never reads
    // (dispatchToBottledSteam re-derives gameSettings fresh from
    // getSteamBottleSettings(), which is backed by steamBottleConfigStore,
    // not GameConfig). Without this, a self-heal here is a silent no-op for
    // the bottle and every subsequent install/launch/uninstall dispatch keeps
    // using the same broken wine. Mirrors provisionBottle()'s own
    // re-persist-after-checkWineBeforeLaunch step for its synthetic-appName
    // validation call. Steam's isNative() is false ONLY for a bottle-eligible
    // game, so this block is unreachable for native Steam games (Linux/
    // Windows) and for every other runner.
    await deps.launchHooks[runner].persistBottleWineVersion?.(
      gameSettings.wineVersion
    )
  }

  let launchedAt: number
  let command: Promise<boolean>
  try {
    await runBeforeLaunchScript(deps, gameInfo, gameSettings, logWriter)

    sendGameStatusUpdate(deps, {
      appName,
      runner,
      status: 'launching'
    })

    // Quick 261029-mkz: taken right at launch, NOT startPlayingDate (which
    // precedes pre-launch work) -- the play signal is time the game ran.
    launchedAt = Date.now()
    command = game.launch(logWriter, launchArguments, args, skipVersionCheck)

    await deps.launchHooks[runner].setPresence?.(appName)
  } catch (error) {
    // The engine selection must not outlive a launch that never got going.
    await releaseEngine()
    throw error
  }

  const launchResult = await command
    .catch(async (exception) => {
      logError(exception, LogPrefix.Backend)
      await logWriter.logError([
        `An exception occurred when launching the game:`
      ])
      await logWriter.logError(exception)

      return false
    })
    .finally(async () => {
      try {
        await runAfterLaunchScript(deps, gameInfo, gameSettings, logWriter)
        await logWriter.close()
      } finally {
        await releaseEngine()
      }
    })

  // Quick 261029-mkz (U-2): `await command` resolves when the game process
  // exits for the generic runners, so its duration is a play signal. Steam is
  // skipped: its launch promise tracks a steam:// hand-off or a bridge spawn,
  // not the game; bottleProcessMonitor records Steam sessions.
  if (!hasCapability(runner, 'playtimeTrackedExternally') && launchResult) {
    recordPlaySession(
      {
        stores: deps.stores,
        sendFrontendMessage: deps.sendFrontendMessage
      },
      appName,
      runner,
      Date.now() - launchedAt
    )
  }

  await deps.launchHooks[runner].clearPresence?.()
  // Stop display sleep blocker
  releaseDisplaySleepBlock(deps)

  // Update playtime and last played date
  const finishedPlayingDate = new Date()
  tsStore.set(`${appName}.lastPlayed`, finishedPlayingDate.toISOString())
  // Playtime of this session in minutes
  const sessionPlaytime =
    (finishedPlayingDate.getTime() - startPlayingDate.getTime()) / 1000 / 60
  const totalPlaytime =
    sessionPlaytime + tsStore.get(`${appName}.totalPlayed`, 0)
  tsStore.set(`${appName}.totalPlayed`, Math.floor(totalPlaytime))

  const { disablePlaytimeSync } = deps.config.getSettings()
  if (isStore(runner, 'gog')) {
    if (!disablePlaytimeSync) {
      await deps.libraryManagers.gog
        .getGame(appName)
        .updateGOGPlaytime(startPlayingDate, finishedPlayingDate)
    } else {
      logWarning(
        'Posting playtime session to server skipped - playtime sync disabled',
        { prefix: LogPrefix.Backend }
      )
    }
  }
  try {
    await addRecentGame(deps, gameInfo)
  } catch (error) {
    logWarning(['Recording recent game failed:', error], LogPrefix.Backend)
  }

  if (autoSyncSaves && deps.onlineMonitor.isOnline()) {
    sendGameStatusUpdate(deps, {
      appName,
      runner,
      status: 'done'
    })

    sendGameStatusUpdate(deps, {
      appName,
      runner,
      status: 'syncing-saves'
    })

    logInfo(`Uploading saves for ${title}`, LogPrefix.Backend)
    try {
      await game.syncSaves('--skip-download', savesPath, gogSaves)
      logInfo(`Saves uploaded for ${title}`, LogPrefix.Backend)
    } catch (error) {
      logError(
        `Error uploading saves for ${title}. Error: ${error}`,
        LogPrefix.Backend
      )
    }
  }

  sendGameStatusUpdate(deps, {
    appName,
    runner,
    status: 'done'
  })

  // Exit if we've been launched without UI
  if (isCLINoGui) {
    deps.appState.exit()
  }

  return { status: launchResult ? 'done' : 'error' }
}

// WR-03: a second concurrent launch of the same runner+app joins the first
// before any launcher-level work runs. Deliberately a plain (non-async) arrow
// so the in-flight check precedes runLaunchEventCallback's first await. No
// notify on join: the span covers the whole play session for these runners.
const launchEventCallback = (
  deps: LaunchCtx,
  params: LaunchParams
): StatusPromise =>
  deps.appRuntime.launchFlights.singleFlightLaunch(
    params.runner,
    params.appName,
    () => {
      logInfo(
        `Launch of ${params.appName} (${params.runner}) already in progress; joining it (WR-03)`,
        LogPrefix.Backend
      )
    },
    () => runLaunchEventCallback(deps, params)
  )

async function runBeforeLaunchScript(
  deps: Pick<LauncherDeps, 'commandRunner'>,
  gameInfo: GameInfo,
  gameSettings: GameSettings,
  logWriter: LogWriter
) {
  if (!gameSettings.beforeLaunchScriptPath) {
    return true
  }

  await logWriter.writeString(
    `Running script before ${gameInfo.title} (${gameSettings.beforeLaunchScriptPath})\n`
  )

  return deps.commandRunner.runScriptForGame(
    gameInfo,
    gameSettings,
    'before',
    logWriter
  )
}

async function runAfterLaunchScript(
  deps: Pick<LauncherDeps, 'commandRunner'>,
  gameInfo: GameInfo,
  gameSettings: GameSettings,
  logWriter: LogWriter
) {
  if (!gameSettings.afterLaunchScriptPath) {
    return true
  }

  await logWriter.writeString(
    `Running script after ${gameInfo.title} (${gameSettings.afterLaunchScriptPath})\n`
  )
  return deps.commandRunner.runScriptForGame(
    gameInfo,
    gameSettings,
    'after',
    logWriter
  )
}

/** Launcher members; pure helpers stay module-level because they need no deps. */
export interface Launcher {
  prepareLaunch(
    ...a: DropFirst<Parameters<typeof prepareLaunchAdapter>>
  ): ReturnType<typeof prepareLaunchAdapter>
  prepareWineLaunch(
    ...a: DropFirst<Parameters<typeof prepareWineLaunchAdapter>>
  ): ReturnType<typeof prepareWineLaunchAdapter>
  setupEnvVars(
    gameSettings: GameSettings,
    installPath?: string
  ): Promise<Record<string, string>>
  setupWrapperEnvVars(wrapperEnv: WrapperEnv): Promise<Record<string, string>>
  setupWineEnvVars(
    gameSettings: GameSettings,
    gameId?: string
  ): Promise<Record<string, string>>
  setupWrappers(
    gameSettings: GameSettings,
    mangoHudCommand?: string[],
    gameModeBin?: string,
    gameScopeCommand?: string[]
  ): Promise<string[]>
  launchEventCallback(params: LaunchParams): StatusPromise
  getKnownFixesEnvVariables(
    appName: string,
    runner: Runner
  ): Promise<Record<string, string>>
  validWine(
    ...a: DropFirst<Parameters<typeof validWine>>
  ): ReturnType<typeof validWine>
  verifyWinePrefix(gameSettings: GameSettings): Promise<{ res: ExecResult }>
  /**
   * The boot's sidecar -> Rust request leg, which the launcher already holds (LauncherDeps extends
   * RustInvokeDeps). Exposed so a flow that builds `RustInvokeDeps` for a Rust-backed shim (the
   * recent-games writes in the Steam launch dispatch) reads it from the launcher it already receives.
   */
  readonly requestRustInvoke: RustInvokeDeps['requestRustInvoke']
}

type DropFirst<T extends unknown[]> = T extends [unknown, ...infer R]
  ? R
  : never

/** The launcher, built once per boot with its own deps (D-02). */
export function createLauncher(deps: LauncherDeps): Launcher {
  // Inherits deps (not a copy), so a getter-backed deps object stays call-time.
  const ctx = Object.assign(Object.create(deps) as LauncherDeps, {
    power: { displayId: null } as PowerState
  }) as LaunchCtx
  return {
    prepareLaunch: (...a) => prepareLaunchAdapter(deps, ...a),
    prepareWineLaunch: (...a) => prepareWineLaunchAdapter(deps, ...a),
    setupEnvVars: async (gameSettings, installPath) =>
      settleEnvMap(
        await setupEnvVarsShim(deps, gameSettings, installPath),
        'setupEnvVars'
      ),
    setupWrapperEnvVars: async (wrapperEnv) =>
      settleEnvMap(
        await setupWrapperEnvVarsShim(deps, wrapperEnv),
        'setupWrapperEnvVars'
      ),
    setupWineEnvVars: async (gameSettings, gameId) =>
      settleEnvMap(
        await setupWineEnvVarsShim(deps, gameSettings, gameId),
        'setupWineEnvVars'
      ),
    setupWrappers: async (
      gameSettings,
      mangoHudCommand,
      gameModeBin,
      gameScopeCommand
    ) =>
      settleWordList(
        await setupWrappersShim(
          deps,
          gameSettings,
          mangoHudCommand,
          gameModeBin,
          gameScopeCommand
        ),
        'setupWrappers'
      ),
    launchEventCallback: (params) => launchEventCallback(ctx, params),
    getKnownFixesEnvVariables: async (appName, runner) =>
      settleKnownFixEnv(
        await getKnownFixesEnvVariablesShim(deps, appName, runner)
      ),
    validWine: (...a) => validWine(deps, ...a),
    verifyWinePrefix: async (gameSettings) =>
      settleVerifyPrefixReply(
        await verifyWinePrefixShim(deps, gameSettings),
        'verifyWinePrefix'
      ),
    // A getter, so a getter-backed deps object stays call-time like the members above.
    get requestRustInvoke() {
      return deps.requestRustInvoke
    }
  }
}
