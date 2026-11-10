import {
  GameInfo,
  Runner,
  EnviromentVariable,
  WrapperEnv,
  WrapperVariable,
  ExecResult,
  LaunchPreperationResult,
  RpcClient,
  WineInstallation,
  GameSettings,
  LaunchParams,
  StatusPromise
} from 'common/types'
// This handles launching games, prefix creation etc..

import i18next from 'i18next'
import { existsSync, mkdirSync } from 'graceful-fs'
import { join, dirname } from 'path'

import {
  constructAndUpdateRPC,
  isEpicServiceOffline,
  removeQuoteIfNecessary,
  sendGameStatusUpdate,
  checkWineBeforeLaunch,
  isMacSonomaOrHigher,
  askForceUninstall
} from './utils'
import type { StoreLaunchHooks } from 'backend/storeManagers'
import { hasCapability, isStore } from 'common/storeCapabilities'
import {
  createGameLogWriter,
  logError,
  logInfo,
  LogPrefix,
  logWarning
} from './logger'
import { GlobalConfig } from './config'
import {
  engineServicesFrom,
  toolsFrom,
  type EngineServicesSource
} from './services/engineServices'
import type {
  CommandRunner,
  SpawnAsync,
  StoreManagers,
  Stores
} from './services/types'
import shlex from 'shlex'
import type { ProcessRunner } from './process/types'
import { buildGameScopeCommand, probeGamescopeHelp } from './gamescopeCommand'
import { isOnline } from './online_monitor'
import { showDialogBoxModalAuto } from './dialog/dialog'
import { readFileSync, writeFileSync } from 'fs'
import { searchForExecutableOnPath } from './utils/os/path'
import { download, isInstalled } from './wine/runtimes/runtimes'
import { recordPlaySession } from './runsForMe'
import { getUmuPath, isUmuSupported } from './utils/compatibility_layers'
import { copyFile } from 'fs/promises'
import { app, powerSaveBlocker } from 'backend/platform'
import { addRecentGame } from './recent_games/recent_games'
import { readKnownFixes } from './knownFixes'
import { applyKnownFixProfileRegistry } from './knownFixesRegistry'
import { knownFixProfileOverlayEnv, logKnownFixEnv } from './knownFixOverlays'
import {
  defaultUmuPath,
  sharedWinePrefix,
  flatpakHome,
  galaxyCommunicationExePath,
  gamesConfigPath,
  runtimePath,
  userHome
} from './constants/paths'
import {
  isCLINoGui,
  isLinux,
  isMac,
  isSteamDeckGameMode,
  isWindows,
  isSteamDeck,
  isFlatpak,
  flatpakRuntimeVersion
} from './constants/environment'
import { formatSystemInfo, getSystemInfo } from './utils/systeminfo'
import { gameAnticheatInfo } from './anticheat/utils'
import {
  armEngineLaunchDeadline,
  endEngineLaunch,
  selectEngineForLaunch
} from './engine/launchEngine'
import { getLaunchSettings } from './engine/launchSettings'
import { engineKeyFor } from './engine/gameKey'

import { singleFlightLaunch } from './launchSingleFlight'
import type { PartialDeep } from 'type-fest'
import type LogWriter from './logger/log_writer'
import { Game } from 'common/types/game_manager'

/** What the launcher is built from (66.1, D-02): constructed once per boot by createStoreManagers. */
export interface LauncherDeps {
  /** Late-bound: filled by createStoreManagers after the launcher is built, read at call time only. */
  libraryManagers: StoreManagers['library']
  launchHooks: Record<Runner, StoreLaunchHooks>
  commandRunner: CommandRunner
  /** The boot process runner: the gamescope --help probe runs through it. */
  runner: Pick<ProcessRunner, 'run'>
  spawnAsync: SpawnAsync
  stores: Pick<Stores, 'kvs' | 'wineManager' | 'runsForMe'>
}

/** The display-sleep blocker id of one launcher instance (closure state, not module state). */
interface PowerState {
  displayId: number | null
}

type LaunchCtx = LauncherDeps & { power: PowerState }

/** The tool wrappers bound to this launcher's own deps (tools module state is still module-level until 66.3). */
function engineSource(deps: LauncherDeps): EngineServicesSource {
  return {
    libraryManagers: deps.libraryManagers,
    commandRunner: deps.commandRunner,
    spawnAsync: deps.spawnAsync,
    runner: deps.runner,
    stores: deps.stores,
    // The pure env/validation helpers are module functions, so the tools need no handle on the
    // launcher being built (checker warning 6).
    launcher: { setupEnvVars, setupWineEnvVars, validWine }
  }
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
    await askForceUninstall(game, appName)

    sendGameStatusUpdate({
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

  const { minimizeOnLaunch, noTrayIcon } = GlobalConfig.get().getSettings()

  const startPlayingDate = new Date()

  const { tsStore } = deps.stores.kvs
  if (!tsStore.has(appName)) {
    tsStore.set(`${appName}.firstPlayed`, startPlayingDate.toISOString())
  }

  logInfo(`Launching ${title} (${appName})`, LogPrefix.Backend)

  if (autoSyncSaves && isOnline()) {
    sendGameStatusUpdate({
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

  sendGameStatusUpdate({
    appName,
    runner,
    status: 'launching'
  })

  // "Hide GameLib for every launch" (quick 261108-kpc). macOS restores from the Dock, so it needs
  // no tray icon; elsewhere the tray is the way back.
  if (minimizeOnLaunch && (isMac || !noTrayIcon)) {
    app.hideMainWindow()
  }

  // Prevent display from sleep
  if (!deps.power.displayId) {
    logInfo('Preventing display from sleep', LogPrefix.Backend)
    deps.power.displayId = powerSaveBlocker.start('prevent-display-sleep')
  }

  const logWriter = await createGameLogWriter(appName, runner)

  if (!gameSettings.verboseLogs) {
    await logWriter.logWarning('IMPORTANT: Logs are disabled', {
      forceLog: true
    })
    await logWriter.logWarning(
      "Enable verbose logs in Game's settings > Advanced tab > 'Enable verbose logs' before reporting an issue.",
      { forceLog: true }
    )
  }

  const isNative = game.isNative()

  // Phase 61 (D-05, D-13): on macOS every non-Steam Windows launch runs the engine step before
  // any Wine check. It returns the engine this launch uses; nothing is persisted (D-08).
  const engineStep = await selectEngineForLaunch(
    engineServicesFrom(engineSource(deps)),
    game,
    {
      offline: !isOnline(),
      logWriter
    }
  )
  if (engineStep.kind === 'refused') {
    sendGameStatusUpdate({
      appName,
      runner,
      status: 'done'
    })

    await logWriter.close()

    return { status: 'abort' }
  }
  const engineControlled = engineStep.kind === 'use'
  const engineKey = engineStep.kind === 'use' ? engineStep.key : null
  const releaseEngine = () => {
    if (engineKey !== null) endEngineLaunch(engineKey)
  }
  if (engineControlled) {
    // Everything that follows sees the overlay, never the stored settings.
    gameSettings = getLaunchSettings(engineKey, gameSettings)
  }

  // check if isNative, if not, check if wine is valid. An engine-controlled launch skips this:
  // the engine step already validated its Wine, and checkWineBeforeLaunch's self-heal would
  // persist a derived or fallback engine into wineVersion (D-08).
  if (!isNative && !engineControlled) {
    const isWineOkToLaunch = await checkWineBeforeLaunch(
      { stores: deps.stores },
      gameInfo,
      gameSettings,
      logWriter
    )

    if (!isWineOkToLaunch) {
      logError(
        `Was not possible to launch using ${gameSettings.wineVersion.name}`,
        LogPrefix.Backend
      )

      sendGameStatusUpdate({
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
    // wineVersion via GameConfig.get(gameInfo.app_name).setSetting(...) — a
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

    sendGameStatusUpdate({
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
    releaseEngine()
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
        releaseEngine()
      }
    })

  // Quick 261029-mkz (U-2): `await command` resolves when the game process
  // exits for the generic runners, so its duration is a play signal. Steam is
  // skipped: its launch promise tracks a steam:// hand-off or a bridge spawn,
  // not the game; bottleProcessMonitor records Steam sessions.
  if (!hasCapability(runner, 'playtimeTrackedExternally') && launchResult) {
    recordPlaySession(
      { stores: deps.stores },
      appName,
      runner,
      Date.now() - launchedAt
    )
  }

  await deps.launchHooks[runner].clearPresence?.()
  // Stop display sleep blocker
  if (deps.power.displayId !== null) {
    logInfo('Stopping Display Power Saver Blocker', LogPrefix.Backend)
    powerSaveBlocker.stop(deps.power.displayId)
  }

  // Update playtime and last played date
  const finishedPlayingDate = new Date()
  tsStore.set(`${appName}.lastPlayed`, finishedPlayingDate.toISOString())
  // Playtime of this session in minutes
  const sessionPlaytime =
    (finishedPlayingDate.getTime() - startPlayingDate.getTime()) / 1000 / 60
  const totalPlaytime =
    sessionPlaytime + tsStore.get(`${appName}.totalPlayed`, 0)
  tsStore.set(`${appName}.totalPlayed`, Math.floor(totalPlaytime))

  const { disablePlaytimeSync } = GlobalConfig.get().getSettings()
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
  await addRecentGame({ stores: { kvs: deps.stores.kvs } }, gameInfo)

  if (autoSyncSaves && isOnline()) {
    sendGameStatusUpdate({
      appName,
      runner,
      status: 'done'
    })

    sendGameStatusUpdate({
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

  sendGameStatusUpdate({
    appName,
    runner,
    status: 'done'
  })

  // Exit if we've been launched without UI
  if (isCLINoGui) {
    app.exit()
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
  singleFlightLaunch(
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

function filterGameSettingsForLog(
  originalSettings: GameSettings,
  notNative: boolean
): PartialDeep<GameSettings> {
  const gameSettings: PartialDeep<GameSettings> =
    structuredClone(originalSettings)

  // this is irrelevant for support
  delete gameSettings.enableQuickSavesMenu
  // if this is visible, it means verboseLogs is true, no need to print it
  delete gameSettings.verboseLogs

  // remove gamescope settings if it's disabled
  if (gameSettings.gamescope) {
    if (!gameSettings.gamescope.enableLimiter) {
      delete gameSettings.gamescope.fpsLimiter
      delete gameSettings.gamescope.fpsLimiterNoFocus
    }
    if (!gameSettings.gamescope.enableUpscaling) {
      delete gameSettings.gamescope.upscaleMethod
      delete gameSettings.gamescope.upscaleHeight
      delete gameSettings.gamescope.upscaleWidth
      delete gameSettings.gamescope.gameHeight
      delete gameSettings.gamescope.gameWidth
      delete gameSettings.gamescope.windowType
    }
  }

  // remove settings that are not used on Linux
  if (isLinux) {
    delete gameSettings.enableMsync
    delete gameSettings.wineCrossoverBottle
    delete gameSettings.advertiseAvxForRosetta

    if (notNative) {
      const wineVersion = gameSettings.wineVersion
      if (wineVersion) {
        if (wineVersion.type === 'proton') {
          delete gameSettings.autoInstallDxvk
          delete gameSettings.autoInstallVkd3d
        }
      }

      if (isSteamDeck) {
        delete gameSettings.autoInstallDxvkNvapi
      }
    } else {
      // remove settings that are not used on native Linux games
      delete gameSettings.wineVersion
      delete gameSettings.winePrefix
      delete gameSettings.autoInstallDxvk
      delete gameSettings.autoInstallDxvkNvapi
      delete gameSettings.autoInstallVkd3d
      delete gameSettings.enableFsync
      delete gameSettings.enableEsync
      delete gameSettings.enableFSR
      delete gameSettings.enableWineWayland
      delete gameSettings.enableHDR
      delete gameSettings.enableWoW64
      delete gameSettings.showFps
      delete gameSettings.enableDXVKFpsLimit
      delete gameSettings.eacRuntime
      delete gameSettings.battlEyeRuntime
      delete gameSettings.useGameMode
    }
  }

  // remove settings that are not used on Mac
  if (isMac) {
    delete gameSettings.useGameMode
    delete gameSettings.gamescope
    delete gameSettings.nvidiaPrime
    delete gameSettings.battlEyeRuntime
    delete gameSettings.eacRuntime
    delete gameSettings.enableFSR
    delete gameSettings.enableWineWayland
    delete gameSettings.enableHDR
    delete gameSettings.enableWoW64
    delete gameSettings.showMangohud
    delete gameSettings.disableUMU
    delete gameSettings.enableFsync

    if (notNative) {
      const wineType = gameSettings.wineVersion
      delete gameSettings.preferSystemLibs
      delete gameSettings.autoInstallVkd3d
      delete gameSettings.autoInstallDxvkNvapi
      if (wineType) {
        if (wineType.type === 'wine') {
          delete gameSettings.wineCrossoverBottle
          delete gameSettings.advertiseAvxForRosetta
          if (wineType.name?.includes('DXMT')) {
            delete gameSettings.autoInstallDxvk
          }
        }

        if (wineType.type === 'toolkit') {
          delete gameSettings.autoInstallDxvk
          delete gameSettings.wineCrossoverBottle
        }

        if (wineType.type === 'crossover') {
          delete gameSettings.autoInstallDxvk
          delete gameSettings.winePrefix
        }
      }
    } else {
      // remove settings that are not used on native Mac games
      delete gameSettings.enableDXVKFpsLimit
      delete gameSettings.wineVersion
      delete gameSettings.winePrefix
      delete gameSettings.wineCrossoverBottle
      delete gameSettings.advertiseAvxForRosetta
      delete gameSettings.autoInstallDxvk
      delete gameSettings.autoInstallDxvkNvapi
      delete gameSettings.autoInstallVkd3d
    }
  }

  // remove settings that are not used on Windows
  if (isWindows) {
    delete gameSettings.enableMsync
    delete gameSettings.enableFSR
    delete gameSettings.enableEsync
    delete gameSettings.enableFsync
    delete gameSettings.enableWineWayland
    delete gameSettings.enableHDR
    delete gameSettings.enableWoW64
    delete gameSettings.enableDXVKFpsLimit
    delete gameSettings.DXVKFpsCap
    delete gameSettings.autoInstallDxvk
    delete gameSettings.autoInstallDxvkNvapi
    delete gameSettings.autoInstallVkd3d
    delete gameSettings.gamescope
    delete gameSettings.useGameMode
    delete gameSettings.showMangohud
    delete gameSettings.showFps
    delete gameSettings.preferSystemLibs
    delete gameSettings.wineCrossoverBottle
    delete gameSettings.winePrefix
    delete gameSettings.wineVersion
    delete gameSettings.battlEyeRuntime
    delete gameSettings.eacRuntime
    delete gameSettings.nvidiaPrime
    delete gameSettings.disableUMU
    delete gameSettings.advertiseAvxForRosetta
  }

  return gameSettings
}

async function prepareLaunch(
  deps: LauncherDeps,
  gameSettings: GameSettings,
  logWriter: LogWriter,
  gameInfo: GameInfo
): Promise<LaunchPreperationResult> {
  const globalSettings = GlobalConfig.get().getSettings()

  let offlineMode = gameSettings.offlineMode || !isOnline()

  if (!offlineMode && isStore(gameInfo, 'legendary')) {
    offlineMode = await isEpicServiceOffline()
  }

  // R8 (Phase 49): an expired Epic store goes offline for games that can run
  // offline. The flag is read ONCE, here; a probe that latches it after this
  // point only affects the next launch, never one already in flight.
  offlineMode =
    deps.launchHooks[gameInfo.runner].resolveOfflineMode?.({
      offlineMode,
      runner: gameInfo.runner,
      canRunOffline: Boolean(gameInfo.canRunOffline)
    }) ?? offlineMode

  // Check if the game needs an internet connection
  if (!gameInfo.canRunOffline && offlineMode) {
    logWriter.logWarning(
      'Offline Mode is on but the game does not allow offline mode explicitly.'
    )
  }

  // Update Discord RPC if enabled
  let rpcClient = undefined
  if (globalSettings.discordRPC) {
    rpcClient = constructAndUpdateRPC(gameInfo)
  }

  await logWriter.logInfo([
    'Launching',
    `"${gameInfo.title}" (${gameInfo.runner})`
  ])
  const native = deps.libraryManagers[gameInfo.runner]
    .getGame(gameInfo.app_name)
    .isNative()
  await logWriter.logInfo(['Native?', native])

  const isThirdPartyManagedApp = gameInfo && !!gameInfo.thirdPartyManagedApp

  if (isThirdPartyManagedApp) {
    if (!isWindows) {
      let prefixOrBottleFolder: string | null = gameSettings.winePrefix
      if (isMac && gameSettings.wineVersion.type === 'crossover') {
        prefixOrBottleFolder = await getCrossoverBottleFolder(
          deps,
          gameSettings
        )
      }
      if (prefixOrBottleFolder)
        await logWriter.logInfo(['Installed in:', prefixOrBottleFolder])
    }

    await logWriter.logInfo([
      'Managed by a third-party app:',
      gameInfo.thirdPartyManagedApp,
      '\n\n'
    ])
  } else {
    const installPath = isStore(gameInfo, 'sideload')
      ? gameInfo.folder_name
      : gameInfo.install.install_path

    await logWriter.logInfo(['Installed in:', installPath, '\n\n'])
  }

  await logWriter.logInfo([
    'System Info:',
    getSystemInfo({
      libraryManagers: deps.libraryManagers,
      runner: deps.runner
    })
      .then(formatSystemInfo)
      .then((s) => `\n${s}\n\n`)
  ])

  await logWriter.logInfo([
    'Game Settings:',
    filterGameSettingsForLog(gameSettings, !native),
    '\n',
    `Stored at: ${join(gamesConfigPath, gameInfo.app_name + '.json')}`,
    '\n\n'
  ])

  const acInfoPromise = gameAnticheatInfo(gameInfo.namespace)
  logWriter.logInfo(
    acInfoPromise.then((info) =>
      info?.status ? `Anticheat Status: ${info.status}` : ''
    )
  )
  logWriter.logInfo([
    acInfoPromise.then((info) =>
      info?.anticheats ? `Anticheats: ${info.anticheats}\n\n` : ''
    )
  ])

  // If we're not on Linux, we can return here
  if (!isLinux) {
    return { success: true, rpcClient, offlineMode }
  }

  // Figure out where MangoHud/GameMode/Gamescope are located, if they're enabled
  let mangoHudCommand: string[] = []
  let gameModeBin: string | null = null
  const gameScopeCommand: string[] = []
  if (gameSettings.showMangohud && !isSteamDeckGameMode) {
    const mangoHudBin = await searchForExecutableOnPath('mangohud')
    if (!mangoHudBin) {
      let reason =
        'Mangohud is enabled, but `mangohud` executable could not be found on $PATH'
      if (isFlatpak) {
        reason = `${reason}. Make sure to install Mangohud's flatpak package with runtime ${flatpakRuntimeVersion} and restart GameLib.`
      }
      return {
        success: false,
        failureReason: reason
      }
    }

    mangoHudCommand = [mangoHudBin, '--dlsym']
  }

  if (gameSettings.useGameMode) {
    gameModeBin = await searchForExecutableOnPath('gamemoderun')
    if (!gameModeBin) {
      return {
        success: false,
        failureReason:
          'GameMode is enabled, but `gamemoderun` executable could not be found on $PATH'
      }
    }
  }

  if (
    (gameSettings.gamescope?.enableLimiter ||
      gameSettings.gamescope?.enableUpscaling) &&
    !isSteamDeckGameMode
  ) {
    const gameScopeBin = await searchForExecutableOnPath('gamescope')
    if (!gameScopeBin) {
      let warningMessage =
        'Gamescope is enabled, but `gamescope` executable could not be found on $PATH'
      if (isFlatpak) {
        warningMessage = `${warningMessage}. Make sure to install Gamescope's flatpak package with runtime ${flatpakRuntimeVersion}`
      }

      logWarning(warningMessage)
    } else {
      // Gamescope does not provide a version option; the --help text decides
      const stderr = await probeGamescopeHelp(deps.runner, gameScopeBin)

      gameScopeCommand.push(
        ...buildGameScopeCommand({
          bin: gameScopeBin,
          settings: gameSettings.gamescope,
          helpStderr: stderr,
          showMangohud: gameSettings.showMangohud
        })
      )
    }
  }

  if (
    (await isUmuSupported(gameSettings, false)) &&
    isOnline() &&
    !(await isInstalled('umu')) &&
    (await getUmuPath()) === defaultUmuPath
  ) {
    await download('umu')
  }

  return {
    success: true,
    rpcClient,
    mangoHudCommand,
    gameModeBin: gameModeBin ?? undefined,
    gameScopeCommand,
    offlineMode
  }
}

// Use Crossover's verbose output to extract the path of the game's configured bottle
async function getCrossoverBottleFolder(
  deps: Pick<LauncherDeps, 'commandRunner'>,
  gameSettings: GameSettings
) {
  const command = deps.commandRunner.runWineCommand({
    commandParts: [
      '--bottle',
      gameSettings.wineCrossoverBottle,
      '--verbose', // so it prints the WINEPREFIX env value
      'whoami' // using whoami because we have to call a command
    ],
    gameSettings,
    skipPrefixCheckIKnowWhatImDoing: true
  })

  return command
    .then((result) => {
      // match the `WINEPREFIX = .....` line to extract the bottle folder
      const bottleFolder = result.stderr.match(/WINEPREFIX = "(.*)"\n/)?.[1]
      if (bottleFolder !== undefined) return bottleFolder

      return null
    })
    .catch(() => {
      return null
    })
}

async function prepareWineLaunch(
  deps: LauncherDeps,
  game: Game,
  logWriter: LogWriter,
  // False for callers that do not merge tier-1 `envVariables` (the sideload
  // path), so the overlay base is not seeded from, and the log does not claim,
  // a tier-1 value that is never applied there.
  opts: { mergesTier1Env?: boolean } = {}
): Promise<{
  success: boolean
  failureReason?: string
  envVars?: Record<string, string>
  knownFixEnv?: Record<string, string>
}> {
  const gameInfo = game.getGameInfo()

  const gameSettings = getLaunchSettings(
    engineKeyFor(gameInfo.runner, gameInfo.app_name),
    await game.getSettings()
  )

  if (!(await validWine(gameSettings.wineVersion))) {
    const defaultWine = GlobalConfig.get().getSettings().wineVersion
    // now check if the default wine is valid as well
    if (!(await validWine(defaultWine))) {
      return { success: false }
    }
  }

  // Verify that the CrossOver bottle exists
  if (isMac && gameSettings.wineVersion.type === 'crossover') {
    const bottleExists = existsSync(
      join(
        userHome,
        'Library/Application Support/CrossOver/Bottles',
        gameSettings.wineCrossoverBottle,
        'cxbottle.conf'
      )
    )
    if (!bottleExists) {
      showDialogBoxModalAuto({
        title: i18next.t(
          'box.error.cx-bottle-not-found.title',
          'CrossOver bottle not found'
        ),
        message: i18next.t(
          'box.error.cx-bottle-not-found.message',
          `The CrossOver bottle "{{bottle_name}}" does not exist, can't launch!`,
          { bottle_name: gameSettings.wineCrossoverBottle }
        ),
        type: 'ERROR'
      })
      return {
        success: false,
        failureReason: `CrossOver bottle "${gameSettings.wineCrossoverBottle}" does not exist`
      }
    }
  }

  logWriter.logInfo(
    toolsFrom(engineSource(deps))
      .Winetricks.listInstalled(game)
      .then((installedPackages) => {
        const packagesString = installedPackages.join(', ')
        return `Winetricks packages: ${packagesString}\n\n`
      })
  )

  // We only want to log this for legendary on Linux
  // On windows, the overlay is installed globally
  // On mac, the overlay doesn't work
  const checkEOSOverlayStatusPromise = isLinux
    ? deps.launchHooks[gameInfo.runner].isOverlayEnabled?.(gameInfo.app_name)
    : undefined
  if (checkEOSOverlayStatusPromise) {
    // The first time a game runs, the overlay is not enabled yet at this point
    void logWriter.logInfo(
      checkEOSOverlayStatusPromise.then(
        (enabled) => `EOS Overlay: ${enabled ? 'Enabled' : 'Not enabled'}`
      )
    )
  }

  if (gameSettings.offlineMode && !gameInfo.canRunOffline) {
    void logWriter.logWarning(
      "Warning: 'offlineMode' is turned on but the game does not support offline mode. Disable 'offlineMode' in the game's settings."
    )
  }

  await verifyWinePrefix(deps, gameSettings)
  const experimentalFeatures =
    GlobalConfig.get().getSettings().experimentalFeatures

  let hasUpdated = false

  let prefixOrBottleFolder: string | null = gameSettings.winePrefix
  if (isMac && gameSettings.wineVersion.type === 'crossover') {
    prefixOrBottleFolder = await getCrossoverBottleFolder(deps, gameSettings)
  }

  // we check this because if the Crossover's bottle is not configured
  // properly, this path will be null
  if (prefixOrBottleFolder) {
    const appsNamesPath = join(prefixOrBottleFolder, 'installed_games')
    if (!existsSync(appsNamesPath)) {
      mkdirSync(prefixOrBottleFolder, { recursive: true })
      writeFileSync(appsNamesPath, JSON.stringify([gameInfo.app_name]), 'utf-8')
      hasUpdated = true
    } else {
      const installedGames: string[] = JSON.parse(
        readFileSync(appsNamesPath, 'utf-8')
      )
      if (!installedGames.includes(gameInfo.app_name)) {
        installedGames.push(gameInfo.app_name)
        writeFileSync(appsNamesPath, JSON.stringify(installedGames), 'utf-8')
        hasUpdated = true
      }
    }
  }

  if (hasUpdated) {
    logInfo(
      ['Created/Updated Wineprefix at', gameSettings.winePrefix],
      LogPrefix.Backend
    )
    await deps.launchHooks[gameInfo.runner].prepareLaunch?.(
      gameInfo.app_name,
      logWriter
    )

    await installFixes(deps, gameInfo.app_name, gameInfo.runner)
  }

  // Tier-2 profile registry, every launch (Decision 1, quick 261026-j6x).
  await applyKnownFixProfileRegistry(
    { commandRunner: deps.commandRunner },
    gameInfo.app_name,
    gameInfo.runner,
    gameSettings
  )

  // Tier-2 overlays (quick 261027-n77): installed on demand, env merged last.
  const tier1Env =
    opts.mergesTier1Env === false
      ? {}
      : getKnownFixesEnvVariables(gameInfo.app_name, gameInfo.runner)
  const knownFixEnv = await knownFixProfileOverlayEnv(
    gameInfo.app_name,
    gameInfo.runner,
    gameSettings,
    tier1Env
  )
  const knownFixEnvLine = logKnownFixEnv(
    `${gameInfo.runner} ${gameInfo.app_name}`,
    [
      ...Object.entries(tier1Env).map(([key, value]) => ({
        key,
        value: String(value),
        source: 'tier-1'
      })),
      ...Object.entries(knownFixEnv).map(([key, value]) => ({
        key,
        value,
        source: 'overlay'
      }))
    ],
    LogPrefix.Backend
  )
  if (knownFixEnvLine) void logWriter.logInfo(knownFixEnvLine)

  try {
    if (
      isStore(gameInfo, 'gog') &&
      experimentalFeatures?.cometSupport !== false
    ) {
      const galaxyCommWinePath =
        'C:\\ProgramData\\GOG.com\\Galaxy\\redists\\GalaxyCommunication.exe'
      const communicationDest = await deps.commandRunner.getWinePath({
        path: galaxyCommWinePath,
        gameSettings,
        variant: 'unix'
      })

      if (!existsSync(communicationDest)) {
        mkdirSync(dirname(communicationDest), { recursive: true })
        await copyFile(galaxyCommunicationExePath, communicationDest)
        await deps.commandRunner.runWineCommand({
          commandParts: [
            'sc',
            'create',
            'GalaxyCommunication',
            `binpath=${galaxyCommWinePath}`
          ],
          gameSettings,
          protonVerb: 'runinprefix'
        })
      }
    }
  } catch (err) {
    logError([
      'Failed to install GalaxyCommunication dummy into the prefix:',
      err
    ])
  }

  // If DXVK/VKD3D installation is enabled, install it
  if (gameSettings.wineVersion.type === 'wine') {
    const tools = toolsFrom(engineSource(deps))
    if (gameSettings.autoInstallDxvk) {
      await tools.DXVK.installRemove(gameSettings, 'dxvk', 'backup')
    }
    if (isLinux && gameSettings.autoInstallDxvkNvapi) {
      await tools.DXVK.installRemove(gameSettings, 'dxvk-nvapi', 'backup')
    }
    if (isLinux && gameSettings.autoInstallVkd3d) {
      await tools.DXVK.installRemove(gameSettings, 'vkd3d', 'backup')
    }
  }

  if (
    gameSettings.eacRuntime &&
    isOnline() &&
    !(await isInstalled('eac_runtime'))
  ) {
    await download('eac_runtime')
  }

  if (
    gameSettings.battlEyeRuntime &&
    isOnline() &&
    !(await isInstalled('battleye_runtime'))
  ) {
    await download('battleye_runtime')
  }

  const envVars = setupWineEnvVars(gameSettings, gameInfo.folder_name)

  // Phase 61-16 (D-18): after installFixes and the known-fix overlay env, so prerequisite
  // installers never count against the deadline (RESEARCH Pitfall 3).
  armEngineLaunchDeadline(
    engineServicesFrom(engineSource(deps)),
    game,
    engineKeyFor(gameInfo.runner, gameInfo.app_name)
  )

  return {
    success: true,
    envVars: { ...envVars, ...knownFixEnv },
    knownFixEnv
  }
}

async function installFixes(
  deps: LauncherDeps,
  appName: string,
  runner: Runner
) {
  const knownFixes = readKnownFixes(appName, runner)

  if (!knownFixes) return

  if (knownFixes.winetricks) {
    sendGameStatusUpdate({
      appName,
      runner: runner,
      status: 'winetricks'
    })

    for (const winetricksPackage of knownFixes.winetricks) {
      await toolsFrom(engineSource(deps)).Winetricks.install(
        runner,
        appName,
        winetricksPackage
      )
    }
  }

  if (knownFixes.runInPrefix) {
    const gameInfo = deps.libraryManagers[runner].getGame(appName).getGameInfo()

    sendGameStatusUpdate({
      appName,
      runner: runner,
      status: 'redist',
      context: 'FIXES'
    })

    for (const filePath of knownFixes.runInPrefix) {
      const fullPath = join(gameInfo.install.install_path!, filePath)
      await toolsFrom(engineSource(deps)).runWineCommandOnGame(
        runner,
        appName,
        {
          commandParts: [fullPath],
          wait: true,
          protonVerb: 'run'
        }
      )
    }
  }
}

function getKnownFixesEnvVariables(appName: string, runner: Runner) {
  const knownFixes = readKnownFixes(appName, runner)

  return knownFixes?.envVariables || {}
}

/**
 * Maps general settings to environment variables
 * @param gameSettings The GameSettings to get the environment variables for
 * @returns A big string of environment variables, structured key=value
 */
export function setupEnvVars(gameSettings: GameSettings, installPath?: string) {
  const ret: Record<string, string> = {}
  if (gameSettings.nvidiaPrime) {
    ret.DRI_PRIME = '1'
    ret.__NV_PRIME_RENDER_OFFLOAD = '1'
    ret.__GLX_VENDOR_LIBRARY_NAME = 'nvidia'
  }

  if (isMac && gameSettings.showFps) {
    ret.MTL_HUD_ENABLED = '1'
  }

  if (isLinux && installPath) {
    // Used by steam runtime to mount the game directory to the container
    ret.STEAM_COMPAT_INSTALL_PATH = installPath
  }

  if (gameSettings.enviromentOptions) {
    gameSettings.enviromentOptions.forEach((envEntry: EnviromentVariable) => {
      ret[envEntry.key] = removeQuoteIfNecessary(envEntry.value)
    })
  }

  // setup LD_PRELOAD if not defined
  // fixes the std::log_error for Fall Guys
  // thanks to https://github.com/Diyou
  if (!process.env.LD_PRELOAD && !ret.LD_PRELOAD) {
    ret.LD_PRELOAD = ''
  }

  return ret
}

/**
 * Maps launcher info to environment variables for consumption by wrappers
 * @param wrapperEnv The info to be added into the environment variables
 * @returns Environment variables
 */
// Per-store GAMEID source env. steam sets neither, as before.
const wrapperStoreEnv: Record<Runner, Record<string, string>> = {
  gog: { HEROIC_APP_SOURCE: 'gog', STORE: 'gog' },
  legendary: { HEROIC_APP_SOURCE: 'epic', STORE: 'egs' },
  nile: { HEROIC_APP_SOURCE: 'amazon', STORE: 'amazon' },
  sideload: { HEROIC_APP_SOURCE: 'sideload' },
  steam: {}
}

function setupWrapperEnvVars(wrapperEnv: WrapperEnv) {
  const ret: Record<string, string> = {}

  ret.HEROIC_APP_NAME = wrapperEnv.appName
  ret.HEROIC_APP_RUNNER = wrapperEnv.appRunner
  ret.GAMEID = 'umu-0'

  Object.assign(ret, wrapperStoreEnv[wrapperEnv.appRunner])

  return ret
}

/**
 * Maps Wine-related settings to environment variables
 * @param gameSettings The GameSettings to get the environment variables for
 * @param gameId If Proton and the Steam Runtime are used, the SteamGameId variable will be set to `heroic-gameId` if it's unset
 * @returns A Record that can be passed to execAsync/spawn
 */
export function setupWineEnvVars(gameSettings: GameSettings, gameId = '0') {
  const { wineVersion, winePrefix, wineCrossoverBottle } = gameSettings

  const ret: Record<string, string> = {}

  // Add WINEPREFIX / STEAM_COMPAT_DATA_PATH / CX_BOTTLE
  const steamInstallPath = join(flatpakHome, '.steam', 'steam')
  switch (wineVersion.type) {
    case 'wine': {
      ret.WINEPREFIX = winePrefix

      // Disable Winemenubuilder to not mess with file associations
      const wmbDisableString = 'winemenubuilder.exe=d'
      // If the user already set WINEDLLOVERRIDES, append to the end
      const dllOverridesVar = gameSettings.enviromentOptions.find(
        ({ key }) => key.toLowerCase() === 'winedlloverrides'
      )
      if (dllOverridesVar) {
        ret[dllOverridesVar.key] =
          dllOverridesVar.value + ';' + wmbDisableString
      } else {
        ret.WINEDLLOVERRIDES = wmbDisableString
      }

      break
    }
    case 'proton':
      ret.STEAM_COMPAT_CLIENT_INSTALL_PATH = steamInstallPath
      ret.WINEPREFIX = winePrefix
      ret.STEAM_COMPAT_DATA_PATH = winePrefix
      ret.PROTONPATH = dirname(gameSettings.wineVersion.bin)
      break
    case 'crossover':
      ret.CX_BOTTLE = wineCrossoverBottle
      break
    case 'toolkit':
      ret.WINEPREFIX = winePrefix
      break
  }

  if (gameSettings.showFps) {
    if (isMac) ret.MTL_HUD_ENABLED = '1'
    else ret.DXVK_HUD = 'fps'
  }
  if (gameSettings.enableDXVKFpsLimit) {
    ret.DXVK_FRAME_RATE = gameSettings.DXVKFpsCap
  }
  if (gameSettings.enableFSR) {
    ret.WINE_FULLSCREEN_FSR = '1'
    ret.WINE_FULLSCREEN_FSR_STRENGTH =
      gameSettings.maxSharpness?.toString() || '2'
  } else {
    ret.WINE_FULLSCREEN_FSR = '0'
  }
  if (gameSettings.enableEsync && wineVersion.type !== 'proton') {
    ret.WINEESYNC = '1'
  }
  if (!gameSettings.enableEsync && wineVersion.type === 'proton') {
    ret.PROTON_NO_ESYNC = '1'
  }
  if (
    isMac &&
    (gameSettings.enableMsync || wineVersion.name.endsWith('-DXMT'))
  ) {
    ret.WINEMSYNC = '1'
    // This is to solve a problem with d3dmetal
    if (wineVersion.type === 'toolkit') {
      ret.WINEESYNC = '1'
    }
  }
  if (isLinux && gameSettings.enableFsync && wineVersion.type !== 'proton') {
    ret.WINEFSYNC = '1'
  }
  if (isLinux && !gameSettings.enableFsync && wineVersion.type === 'proton') {
    ret.PROTON_NO_FSYNC = '1'
  }
  if (isLinux && gameSettings.enableWineWayland) {
    if (wineVersion.type === 'proton') {
      ret.PROTON_ENABLE_WAYLAND = '1'
      if (gameSettings.enableHDR) {
        ret.PROTON_ENABLE_HDR = '1'
      }
    } else {
      ret.DISPLAY = ''
      if (gameSettings.enableHDR) {
        ret.DXVK_HDR = '1'
      }
    }
  }
  if (isLinux && gameSettings.enableWoW64) {
    if (wineVersion.type === 'proton') {
      ret.PROTON_USE_WOW64 = '1'
    } else {
      ret.WINEARCH = 'wow64'
    }
  }
  if (wineVersion.type === 'proton') {
    if (gameSettings.autoInstallDxvkNvapi) {
      ret.PROTON_ENABLE_NVAPI = '1'
      ret.DXVK_NVAPI_ALLOW_OTHER_DRIVERS = '1'
    }
    // proton 9 enabled NVAPI by default
    else {
      ret.PROTON_DISABLE_NVAPI = '1'
    }
  }
  if (
    isLinux &&
    gameSettings.autoInstallDxvkNvapi &&
    wineVersion.type === 'wine'
  ) {
    ret.DXVK_ENABLE_NVAPI = '1'
    ret.DXVK_NVAPI_ALLOW_OTHER_DRIVERS = '1'
  }
  if (isLinux && gameSettings.eacRuntime) {
    ret.PROTON_EAC_RUNTIME = join(runtimePath, 'eac_runtime')
  }
  if (isLinux && gameSettings.battlEyeRuntime) {
    ret.PROTON_BATTLEYE_RUNTIME = join(runtimePath, 'battleye_runtime')
  }
  if (wineVersion.type === 'proton') {
    // If we don't set this, GE-Proton tries to guess the AppID from the prefix path, which doesn't work in our case
    ret.STEAM_COMPAT_APP_ID = process.env.STEAM_COMPAT_APP_ID || '0'
    ret.SteamAppId = process.env.SteamAppId || ret.STEAM_COMPAT_APP_ID
    // This sets the name of the log file given when setting PROTON_LOG=1
    ret.SteamGameId = process.env.SteamGameId || `heroic-${gameId}`
    ret.PROTON_LOG_DIR = flatpakHome
    // add back default wine/dxvk debug logging
    if (gameSettings?.verboseLogs) {
      if (
        !gameSettings?.enviromentOptions.find((env) => env.key === 'WINEDEBUG')
      )
        ret.WINEDEBUG = '+fixme'
      if (
        !gameSettings?.enviromentOptions.find(
          (env) => env.key === 'DXVK_LOG_LEVEL'
        )
      )
        ret.DXVK_LOG_LEVEL = 'info'
      if (
        !gameSettings?.enviromentOptions.find(
          (env) => env.key === 'VKD3D_DEBUG'
        )
      )
        ret.VKD3D_DEBUG = 'fixme'
    }
  }
  if (!gameSettings.preferSystemLibs && wineVersion.type === 'wine') {
    // https://github.com/ValveSoftware/Proton/blob/4221d9ef07cc38209ff93dbbbca9473581a38255/proton#L1091-L1093
    if (!process.env.ORIG_LD_LIBRARY_PATH) {
      ret.ORIG_LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH ?? ''
    }

    const { lib32, lib } = wineVersion
    if (lib32 && lib) {
      // append wine libs at the beginning
      ret.LD_LIBRARY_PATH = [lib, lib32, process.env.LD_LIBRARY_PATH]
        .filter(Boolean)
        .join(':')

      // https://github.com/ValveSoftware/Proton/blob/4221d9ef07cc38209ff93dbbbca9473581a38255/proton#L1099
      // NOTE: Proton does not make sure that these folders exist first, I believe we should :^)
      const gstp_path_lib64 = join(lib, 'gstreamer-1.0')
      const gstp_path_lib32 = join(lib32, 'gstreamer-1.0')
      if (existsSync(gstp_path_lib64) && existsSync(gstp_path_lib32)) {
        ret.GST_PLUGIN_SYSTEM_PATH_1_0 = gstp_path_lib64 + ':' + gstp_path_lib32
      }

      // https://github.com/ValveSoftware/Proton/blob/4221d9ef07cc38209ff93dbbbca9473581a38255/proton#L1097
      const winedll_path_lib64 = join(lib, 'wine')
      const winedll_path_lib32 = join(lib32, 'wine')
      if (existsSync(winedll_path_lib64) && existsSync(winedll_path_lib32)) {
        ret.WINEDLLPATH = winedll_path_lib64 + ':' + winedll_path_lib32
      }
    } else if (!(isMac && !lib && !lib32)) {
      // 59-HUMAN-UAT H3: a wine with no lib paths configured (the built-in
      // engine) is not "missing" them, and on macOS this block only sets
      // LD_LIBRARY_PATH, which dyld ignores. Skipping the log leaves the env
      // byte-identical.
      logError(
        [
          `Couldn't find all library folders of ${wineVersion.name}!`,
          `Missing ${lib32} and/or ${lib}!`,
          `Falling back to system libraries!`
        ].join('\n')
      )
    }
  }
  if (
    gameSettings.advertiseAvxForRosetta &&
    isMac &&
    wineVersion.type === 'toolkit'
  ) {
    ret.ROSETTA_ADVERTISE_AVX = '1'
  }
  // Workaround for Steam Input virtual gamepad not working for games launched through HGL from Steam
  // using deprecated WineGE/ProtonGE releases (<= 8.x) following SDL behavior change on version >= 2.30
  // (included with flatpak Freedesktop runtime 24.08 or newer)
  // https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/issues/4708
  // https://github.com/libsdl-org/SDL/issues/14410
  // https://gitlab.com/freedesktop-sdk/freedesktop-sdk/-/issues/1818
  if (
    isLinux &&
    /(GE|Wine|Proton)-(Proton[7-8]|[4-7].*-GE|GE-4.[0-9]*)/.test(
      wineVersion.name
    )
  ) {
    ret.SteamVirtualGamepadInfo = ''
    logWarning(
      `Deprecated Wine-GE/Proton-GE release (<= 8.x) detected. Applying workaround for Steam Input virtual gamepad detection.`
    )
  }
  return ret
}

function setupWrappers(
  gameSettings: GameSettings,
  mangoHudCommand?: string[],
  gameModeBin?: string,
  gameScopeCommand?: string[]
): Array<string> {
  const wrappers: string[] = []

  // let gamescope be first wrapper always
  if (gameScopeCommand) {
    wrappers.push(...gameScopeCommand)
  }

  if (gameSettings.wrapperOptions) {
    gameSettings.wrapperOptions.forEach((wrapperEntry: WrapperVariable) => {
      wrappers.push(wrapperEntry.exe)
      wrappers.push(...shlex.split(wrapperEntry.args ?? ''))
    })
  }
  if (mangoHudCommand && gameScopeCommand?.length === 0) {
    wrappers.push(...mangoHudCommand)
  }
  if (gameModeBin) {
    wrappers.push(gameModeBin)
  }
  return wrappers.filter((n) => n)
}

/**
 * Checks if the game's selected Wine version exists
 * @param wineVersion an object of type WineInstallation with binary path and name to check
 * @returns true if the wine version exists, false if it doesn't
 */
export async function validWine(
  wineVersion: WineInstallation
): Promise<boolean> {
  if (!wineVersion) {
    return false
  }

  logInfo(
    `Checking if wine version exists: ${wineVersion.name}`,
    LogPrefix.Backend
  )

  // verify if necessary binaries exist
  const { bin, wineserver, type } = wineVersion
  const necessary = type === 'wine' ? [bin, wineserver] : [bin]
  const haveAll = necessary.every((binary) => existsSync(binary as string))

  if (isMac && type === 'toolkit') {
    const isMacOSUpToDate = isMacSonomaOrHigher()
    const isGPTKCompatible: boolean = isMacOSUpToDate
    if (!isGPTKCompatible) {
      return false
    }
  }

  // if wine version does not exist, use the default one
  if (!haveAll) {
    return false
  }

  return true
}

/**
 * Verifies that a Wineprefix exists by running 'wineboot --init'
 * @param gameSettings The settings of the game to verify the Wineprefix of
 * @returns stderr & stdout of 'wineboot --init'
 */
export async function verifyWinePrefix(
  deps: { commandRunner: Pick<CommandRunner, 'runWineCommand'> },
  settings: GameSettings
): Promise<{ res: ExecResult }> {
  const { winePrefix = sharedWinePrefix, wineVersion } = settings

  const isValidWine = await validWine(wineVersion)

  if (!isValidWine) {
    return { res: { stdout: '', stderr: '' } }
  }

  if (wineVersion.type === 'crossover') {
    return { res: { stdout: '', stderr: '' } }
  }

  if (!existsSync(winePrefix) && !(await isUmuSupported(settings))) {
    mkdirSync(winePrefix, { recursive: true })
  }

  // If the registry isn't available yet, things like DXVK installers might fail. So we have to wait on wineboot then
  const systemRegPath =
    wineVersion.type === 'proton'
      ? join(winePrefix, 'pfx', 'system.reg')
      : join(winePrefix, 'system.reg')
  const haveToWait = !existsSync(systemRegPath)

  const command = deps.commandRunner.runWineCommand({
    commandParts: (await isUmuSupported(settings))
      ? ['createprefix']
      : ['wineboot', '--init'],
    wait: haveToWait,
    gameSettings: settings,
    protonVerb: 'run',
    skipPrefixCheckIKnowWhatImDoing: true
  })

  return command
    .then((result) => {
      return { res: result }
    })
    .catch((error) => {
      logError(['Unable to create Wineprefix: ', error], LogPrefix.Backend)
      throw error
    })
}

function launchCleanup(_deps: LauncherDeps, rpcClient?: RpcClient) {
  if (rpcClient) {
    rpcClient.destroy()
    logInfo('Stopped Discord Rich Presence', LogPrefix.Backend)
  }
}

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
    ...a: DropFirst<Parameters<typeof prepareLaunch>>
  ): ReturnType<typeof prepareLaunch>
  launchCleanup(
    ...a: DropFirst<Parameters<typeof launchCleanup>>
  ): ReturnType<typeof launchCleanup>
  prepareWineLaunch(
    ...a: DropFirst<Parameters<typeof prepareWineLaunch>>
  ): ReturnType<typeof prepareWineLaunch>
  setupEnvVars: typeof setupEnvVars
  setupWrapperEnvVars: typeof setupWrapperEnvVars
  setupWineEnvVars: typeof setupWineEnvVars
  setupWrappers: typeof setupWrappers
  launchEventCallback(params: LaunchParams): StatusPromise
  getKnownFixesEnvVariables: typeof getKnownFixesEnvVariables
  validWine: typeof validWine
  verifyWinePrefix(
    ...a: DropFirst<Parameters<typeof verifyWinePrefix>>
  ): ReturnType<typeof verifyWinePrefix>
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
    prepareLaunch: (...a) => prepareLaunch(deps, ...a),
    launchCleanup: (...a) => launchCleanup(deps, ...a),
    prepareWineLaunch: (...a) => prepareWineLaunch(deps, ...a),
    setupEnvVars,
    setupWrapperEnvVars,
    setupWineEnvVars,
    setupWrappers,
    launchEventCallback: (params) => launchEventCallback(ctx, params),
    getKnownFixesEnvVariables,
    validWine,
    verifyWinePrefix: (...a) => verifyWinePrefix(deps, ...a)
  }
}
