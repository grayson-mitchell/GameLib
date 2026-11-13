import type { ManagerDeps } from 'backend/services/types'
import {
  ExecResult,
  ExtraInfo,
  GameInfo,
  GameSettings,
  InstallArgs,
  InstallProgress,
  LaunchOption
} from 'common/types'
import { Game, InstallResult } from 'common/types/game_manager'
import {
  LogPrefix,
  logDebug,
  logError,
  logInfo,
  logWarning,
  createGameLogWriter
} from 'backend/logger'
import { existsSync } from 'graceful-fs'
import { showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { t } from 'i18next'
import {
  getWineFlagsArray,
  isUmuSupported
} from 'backend/utils/compatibility_layers'
import shlex from 'shlex'
import { nileLaunchCommandParts } from '../runnerLaunchArgv'
import {
  moveOnUnix,
  moveOnWindows,
  sendGameStatusUpdate,
  sendProgressUpdate,
  shutdownWine
} from 'backend/utils'
import {
  addShortcuts as addShortcutsUtil,
  removeShortcuts as removeShortcutsUtil
} from '../../shortcuts/shortcuts/shortcuts'
import { removeNonSteamGame } from 'backend/shortcuts/nonesteamgame/nonesteamgame'
import type { ShortcutsDeps } from 'backend/shortcuts/utils'
import setup from './setup'
import { getUmuId } from 'backend/wiki_game_info/umu/utils'
import { isWindows } from 'backend/constants/environment'

import { readKnownFixLaunchOverrides } from 'backend/knownFixLaunch'
import type LogWriter from 'backend/logger/log_writer'
import { engineKeyFor } from 'backend/engine/gameKey'

export default class NileGameManager implements Game {
  private readonly id: string

  constructor(
    id: string,
    private readonly deps: ShortcutsDeps &
      Pick<
        ManagerDeps,
        | 'libraryManagers'
        | 'infoCaches'
        | 'onlineMonitor'
        | 'engineState'
        | 'engineRuntime'
        | 'versioning'
        | 'paths'
        | 'steamBottle'
        | 'steamLaunchRuntime'
        | 'launcher'
        | 'commandRunner'
        | 'spawnAsync'
        | 'aborts'
        | 'toolsState'
        | 'runner'
        | 'config'
        | 'dialogs'
        | 'appState'
        | 'notifications'
        | 'sendFrontendMessage'
        | 'gameConfigs'
        | 'appInfo'
        | 'appRuntime'
        | 'requestRustInvoke'
      > & {
        stores: Pick<
          ManagerDeps['stores'],
          'kvs' | 'wineManager' | 'wikiGameInfo' | 'crossoverIndex'
        >
      }
  ) {
    this.id = id
  }

  async getSettings(): Promise<GameSettings> {
    const gameConfig = this.deps.gameConfigs.get(this.id)
    return gameConfig.config || (await gameConfig.getSettings())
  }

  getGameInfo(): GameInfo {
    const info = this.deps.libraryManagers.nile.getGameInfo(this.id)
    if (!info) {
      logError(
        [
          'Could not get game info for',
          `${this.id},`,
          'returning empty object. Something is probably gonna go wrong soon'
        ],
        LogPrefix.Nile
      )
      return {
        app_name: '',
        runner: 'nile',
        art_cover: '',
        art_square: '',
        install: {},
        is_installed: false,
        title: '',
        canRunOffline: false
      }
    }
    return info
  }

  async getExtraInfo(): Promise<ExtraInfo> {
    const info = this.getGameInfo()
    return {
      reqs: [],
      about: info?.description
        ? {
            description: info.description,
            shortDescription: info.description
          }
        : undefined,
      releaseDate: info?.extra?.releaseDate
    }
  }

  async importGame(folderPath: string): Promise<ExecResult> {
    const importLogWriter = await createGameLogWriter(
      this.id,
      'nile',
      'import',
      {
        disableLogs: this.deps.config.getSettings().disableLogs,
        verboseLogs: false
      }
    )
    const res = await this.deps.libraryManagers.nile.runRunnerCommand(
      ['import', '--path', folderPath, this.id],
      {
        abortId: this.id,
        logWriters: [importLogWriter],
        logMessagePrefix: `Importing ${this.id}`
      }
    )

    if (res.abort) {
      return res
    }

    if (res.error) {
      logError(['Failed to import', `${this.id}:`, res.error], LogPrefix.Nile)
      return res
    }

    const errorMatch = res.stderr.match(/ERROR \[IMPORT]:\t(.*)/)
    if (errorMatch) {
      logError(
        ['Failed to import', `${this.id}:`, errorMatch[1]],
        LogPrefix.Nile
      )
      return {
        ...res,
        error: errorMatch[1]
      }
    }

    try {
      void this.addShortcuts().catch((error) =>
        logWarning(
          ['Could not add shortcuts for', this.id, error],
          LogPrefix.Nile
        )
      )
      this.deps.libraryManagers.nile.installState(this.id, true)
    } catch (error) {
      logError(['Failed to import', `${this.id}:`, error], LogPrefix.Nile)
    }

    return res
  }

  private defaultTmpProgress = () => ({
    bytes: '',
    eta: '',
    percent: undefined,
    diskSpeed: undefined,
    downSpeed: undefined
  })
  private tmpProgress: InstallProgress | undefined = undefined

  onInstallOrUpdateOutput(action: 'installing' | 'updating', data: string) {
    if (!this.tmpProgress) {
      this.tmpProgress = this.defaultTmpProgress()
    }
    const progress = this.tmpProgress

    // parse log for percent
    if (!progress.percent) {
      const percentMatch = data.match(/Progress: (\d+\.\d+) /m)

      progress.percent = !Number.isNaN(Number(percentMatch?.at(1)))
        ? Number(percentMatch?.at(1))
        : undefined
    }

    // parse log for eta
    if (progress.eta === '') {
      const etaMatch = data.match(/ETA: (\d\d:\d\d:\d\d)/m)
      progress.eta = etaMatch?.[1] ?? ''
    }

    // parse log for game download progress
    if (progress.bytes === '') {
      const bytesMatch = data.match(/Downloaded: (\S+) MiB/m)
      progress.bytes =
        bytesMatch && bytesMatch?.length >= 2 ? `${bytesMatch[1]}MB` : ''
    }

    // parse log for download speed
    if (!progress.downSpeed) {
      const downSpeedMBytes = data.match(/Download\t- (\S+.) MiB/m)
      progress.downSpeed = !Number.isNaN(Number(downSpeedMBytes?.at(1)))
        ? Number(downSpeedMBytes?.at(1))
        : undefined
    }

    // parse disk write speed
    if (!progress.diskSpeed) {
      const diskSpeedMBytes = data.match(/Disk\t- (\S+.) MiB/m)
      progress.diskSpeed = !Number.isNaN(Number(diskSpeedMBytes?.at(1)))
        ? Number(diskSpeedMBytes?.at(1))
        : undefined
    }

    // only send to frontend if all values are updated
    if (
      Object.values(progress).every(
        (value) => !(value === undefined || value === '')
      )
    ) {
      logInfo(
        [
          `Progress for ${this.getGameInfo().title}:`,
          `${progress.percent}%/${progress.bytes}/${progress.eta}`.trim(),
          `Down: ${progress.downSpeed}MB/s / Disk: ${progress.diskSpeed}MB/s`
        ],
        LogPrefix.Nile
      )

      sendProgressUpdate(this.deps, {
        appName: this.id,
        runner: 'nile',
        status: action,
        progress
      })

      // reset
      this.tmpProgress = this.defaultTmpProgress()
    }
  }

  async install({ path }: InstallArgs): Promise<InstallResult> {
    const { maxWorkers } = this.deps.config.getSettings()
    const workers = maxWorkers ? ['--max-workers', `${maxWorkers}`] : []

    const commandParts = ['install', '--base-path', path, ...workers, this.id]

    const onOutput = (data: string) => {
      this.onInstallOrUpdateOutput('installing', data)
    }

    const installLogWriter = await createGameLogWriter(
      this.id,
      'nile',
      'install',
      {
        disableLogs: this.deps.config.getSettings().disableLogs,
        verboseLogs: false
      }
    )
    const res = await this.deps.libraryManagers.nile.runRunnerCommand(
      commandParts,
      {
        abortId: this.id,
        logWriters: [installLogWriter],
        onOutput,
        logMessagePrefix: `Installing ${this.id}`
      }
    )

    if (res.abort) {
      return { status: 'abort' }
    }

    if (res.error) {
      if (!res.error.includes('signal')) {
        logError(['Failed to install', this.id, res.error], LogPrefix.Nile)
      }
      return { status: 'error', error: res.error }
    }
    void this.addShortcuts().catch((error) =>
      logWarning(
        ['Could not add shortcuts for', this.id, error],
        LogPrefix.Nile
      )
    )
    this.deps.libraryManagers.nile.installState(this.id, true)
    const metadata = this.deps.libraryManagers.nile.getInstallMetadata(this.id)

    if (isWindows) {
      await setup(this.deps, this.id, metadata?.path)
    }

    return { status: 'done' }
  }

  isNative(): boolean {
    return isWindows
  }

  /**
   * Adds a desktop shortcut to $HOME/Desktop and to /usr/share/applications
   * so that the game can be opened from the start menu and the desktop folder.
   * Both can be disabled with addDesktopShortcuts and addStartMenuShortcuts
   * @async
   * @public
   */
  async addShortcuts(fromMenu?: boolean) {
    return addShortcutsUtil(this.deps, this, fromMenu)
  }

  /**
   * Removes a desktop shortcut from $HOME/Desktop and to $HOME/.local/share/applications
   * @async
   * @public
   */
  async removeShortcuts() {
    return removeShortcutsUtil(this.deps, this)
  }

  async launch(
    logWriter: LogWriter,
    launchArguments?: LaunchOption,
    args: string[] = []
  ): Promise<boolean> {
    const gameSettings =
      this.deps.engineRuntime.launchSettings.getLaunchSettings(
        engineKeyFor(this.getGameInfo().runner, this.id),
        await this.getSettings()
      )
    const gameInfo = this.getGameInfo()

    const {
      success: launchPrepSuccess,
      failureReason: launchPrepFailReason,
      rpcClient,
      mangoHudCommand,
      gameModeBin,
      gameScopeCommand
    } = await this.deps.launcher.prepareLaunch(
      gameSettings,
      logWriter,
      gameInfo
    )

    if (!launchPrepSuccess) {
      logWriter.logError(['Launch aborted:', launchPrepFailReason])
      this.deps.launcher.launchCleanup()
      showDialogBoxModalAuto(this.deps, {
        title: t('box.error.launchAborted', 'Launch aborted'),
        message: launchPrepFailReason!,
        type: 'ERROR'
      })
      return false
    }

    let exeOverrideFlag: string[] = []
    if (launchArguments?.type === 'altExe') {
      exeOverrideFlag = ['--override-exe', launchArguments.executable]
    } else if (gameSettings.targetExe) {
      exeOverrideFlag = ['--override-exe', gameSettings.targetExe]
    }

    // Known-fix launchArgs / exeOverride (quick 261029-mbl). Precedence:
    // altExe > user targetExe > known-fix exeOverride > default.
    const knownFix = readKnownFixLaunchOverrides(
      this.deps,
      this.id,
      'nile',
      gameInfo.install.install_path
    )
    if (knownFix.exeOverride) {
      if (exeOverrideFlag.length) {
        logInfo(
          `Known-fix exeOverride for ${this.id} not used, the user's executable setting wins`,
          LogPrefix.Nile
        )
      } else {
        exeOverrideFlag = ['--override-exe', knownFix.exeOverride]
      }
    }

    let commandEnv = {
      ...process.env,
      ...this.deps.launcher.setupWrapperEnvVars({
        appName: this.id,
        appRunner: 'nile'
      }),
      ...(isWindows
        ? {}
        : this.deps.launcher.setupEnvVars(
            gameSettings,
            gameInfo.install.install_path
          )),
      ...this.deps.launcher.getKnownFixesEnvVariables(this.id, 'nile')
    }

    const wrappers = this.deps.launcher.setupWrappers(
      gameSettings,
      mangoHudCommand,
      gameModeBin,
      gameScopeCommand
    )

    let wineFlag: string[] = wrappers.length
      ? ['--wrapper', shlex.join(wrappers)]
      : []

    if (!this.isNative()) {
      // -> We're using Wine/Proton on Linux or CX on Mac
      const {
        success: wineLaunchPrepSuccess,
        failureReason: wineLaunchPrepFailReason,
        envVars: wineEnvVars
      } = await this.deps.launcher.prepareWineLaunch(this, logWriter)
      if (!wineLaunchPrepSuccess) {
        logWriter.logError(['Launch aborted:', wineLaunchPrepFailReason])
        if (wineLaunchPrepFailReason) {
          showDialogBoxModalAuto(this.deps, {
            title: t('box.error.launchAborted', 'Launch aborted'),
            message: wineLaunchPrepFailReason,
            type: 'ERROR'
          })
        }
        return false
      }

      commandEnv = {
        ...commandEnv,
        ...wineEnvVars
      }

      if (await isUmuSupported(this.deps, gameSettings)) {
        const umuId = await getUmuId(
          this.deps,
          gameInfo.app_name,
          gameInfo.runner
        )
        if (umuId) {
          commandEnv['GAMEID'] = umuId
        }
      }

      wineFlag = [
        ...(await getWineFlagsArray(
          this.deps,
          gameSettings,
          shlex.join(wrappers)
        )),
        '--wine-prefix',
        gameSettings.winePrefix
      ]
    }

    const launchArgumentsArgs =
      launchArguments &&
      (launchArguments.type === undefined || launchArguments.type === 'basic')
        ? launchArguments.parameters
        : ''

    const commandParts = nileLaunchCommandParts({
      exeOverrideFlag,
      wineFlag,
      launchArgumentArgs: launchArgumentsArgs,
      launcherArgs: gameSettings.launcherArgs,
      knownFixLaunchArgs: knownFix.launchArgs,
      id: this.id,
      args
    })

    sendGameStatusUpdate(this.deps, {
      appName: this.id,
      runner: 'nile',
      status: 'playing'
    })

    const { error } = await this.deps.libraryManagers.nile.runRunnerCommand(
      commandParts,
      {
        abortId: this.id,
        env: commandEnv,
        wrappers,
        logMessagePrefix: `Launching ${gameInfo.title}`,
        logWriters: [logWriter]
      }
    )

    if (error) {
      logError(['Error launching game:', error], LogPrefix.Nile)
    }

    this.deps.launcher.launchCleanup(rpcClient)

    return !error
  }

  async moveInstall(newInstallPath: string): Promise<InstallResult> {
    const gameInfo = this.getGameInfo()
    logInfo(`Moving ${gameInfo.title} to ${newInstallPath}`, LogPrefix.Nile)

    const moveImpl = isWindows ? moveOnWindows : moveOnUnix
    const moveResult = await moveImpl(this.deps, newInstallPath, gameInfo)

    if (moveResult.status === 'error') {
      const { error } = moveResult
      logError(
        ['Error moving', gameInfo.title, 'to', newInstallPath, error],
        LogPrefix.Nile
      )
      return { status: 'error', error }
    }

    await this.deps.libraryManagers.nile.changeGameInstallPath(
      this.id,
      moveResult.installPath
    )
    return { status: 'done' }
  }

  async repair(): Promise<ExecResult> {
    const installInfo = this.getGameInfo()
    const { install_path } = installInfo.install ?? {}

    if (!install_path) {
      const error = `Could not find install path for ${this.id}`
      logError(error, LogPrefix.Nile)
      return {
        stderr: '',
        stdout: '',
        error
      }
    }

    logDebug([this.id, 'is installed at', install_path], LogPrefix.Nile)
    const repairLogWriter = await createGameLogWriter(
      this.id,
      'nile',
      'repair',
      {
        disableLogs: this.deps.config.getSettings().disableLogs,
        verboseLogs: false
      }
    )
    const res = await this.deps.libraryManagers.nile.runRunnerCommand(
      ['verify', '--path', install_path, this.id],
      {
        abortId: this.id,
        logWriters: [repairLogWriter],
        logMessagePrefix: `Repairing ${this.id}`
      }
    )

    if (res.error) {
      logError(['Failed to repair', `${this.id}:`, res.error], LogPrefix.Nile)
    }

    return res
  }

  async syncSaves(): Promise<string> {
    // Amazon Games doesn't support cloud saves
    return ''
  }

  // FIXME: This doesn't respect the `RemoveArgs` passed to it
  async uninstall(): Promise<ExecResult> {
    const commandParts = ['uninstall', this.id]

    const res = await this.deps.libraryManagers.nile.runRunnerCommand(
      commandParts,
      {
        abortId: this.id,
        logMessagePrefix: `Uninstalling ${this.id}`
      }
    )

    if (res.error) {
      logError(
        ['Failed to uninstall', `${this.id}:`, res.error],
        LogPrefix.Nile
      )
    } else if (!res.abort) {
      await removeShortcutsUtil(this.deps, this)
      await removeNonSteamGame(this.deps, this)
      this.deps.libraryManagers.nile.installState(this.id, false)
    }
    this.deps.sendFrontendMessage('refreshLibrary', 'nile')
    return res
  }

  async update(): Promise<InstallResult> {
    const { maxWorkers } = this.deps.config.getSettings()
    const workers = maxWorkers ? ['--max-workers', `${maxWorkers}`] : []

    const commandParts = ['update', ...workers, this.id]

    const onOutput = (data: string) => {
      this.onInstallOrUpdateOutput('updating', data)
    }

    const updateLogWriter = await createGameLogWriter(
      this.id,
      'nile',
      'update',
      {
        disableLogs: this.deps.config.getSettings().disableLogs,
        verboseLogs: false
      }
    )
    const res = await this.deps.libraryManagers.nile.runRunnerCommand(
      commandParts,
      {
        abortId: this.id,
        logWriters: [updateLogWriter],
        onOutput,
        logMessagePrefix: `Updating ${this.id}`
      }
    )

    if (res.abort) {
      return { status: 'abort' }
    }

    if (res.error) {
      if (!res.error.includes('signal')) {
        logError(['Failed to update', this.id, res.error], LogPrefix.Nile)
      }
      return { status: 'error', error: res.error }
    }

    sendGameStatusUpdate(this.deps, {
      appName: this.id,
      runner: 'nile',
      status: 'done'
    })

    return { status: 'done' }
  }

  async forceUninstall() {
    this.deps.libraryManagers.nile.removeFromInstalledConfig(this.id)
  }

  async stop(stopWine = true) {
    this.deps.runner.killTracked({ runner: 'nile', key: this.id })

    if (stopWine && !this.isNative()) {
      const gameSettings =
        this.deps.engineRuntime.launchSettings.getLaunchSettings(
          engineKeyFor(this.getGameInfo().runner, this.id),
          await this.getSettings()
        )
      await shutdownWine(this.deps, gameSettings)
    }
  }

  async isGameAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const info = this.getGameInfo()
      resolve(
        Boolean(
          info?.is_installed &&
          info.install.install_path &&
          existsSync(info.install.install_path)
        )
      )
    })
  }
}
