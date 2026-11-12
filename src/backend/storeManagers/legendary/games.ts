import { copyFileSync, existsSync } from 'graceful-fs'
import axios from 'axios'

import {
  ExecResult,
  ExtraInfo,
  GameInfo,
  InstallArgs,
  InstallPlatform,
  InstallProgress,
  LaunchOption
} from 'common/types'
import type { LegendaryManagerDeps } from './library'
import { checkInstalledMacArch } from 'backend/macArch/recovery'
import {
  downloadFile,
  moveOnUnix,
  moveOnWindows,
  sendGameStatusUpdate,
  sendProgressUpdate,
  shutdownWine
} from '../../utils'
import {
  logError,
  logInfo,
  logWarning,
  LogPrefix,
  createGameLogWriter
} from 'backend/logger'
import {
  addShortcuts as addShortcutsUtil,
  removeShortcuts as removeShortcutsUtil
} from '../../shortcuts/shortcuts/shortcuts'
import { join } from 'path'
import { removeNonSteamGame } from '../../shortcuts/nonesteamgame/nonesteamgame'
import shlex from 'shlex'
import { legendaryLaunchArgumentFields } from '../runnerLaunchArgv'
import { readKnownFixLaunchOverrides } from 'backend/knownFixLaunch'
import { t } from 'i18next'
import { showDialogBoxModalAuto } from '../../dialog/dialog'
import { createBoundedOutputCapture } from 'backend/signInProbe/classify'
import {
  LEGENDARY_LAUNCH_OUTPUT_CAP,
  classifyLegendaryLaunchFailure,
  legendaryLaunchFailureDialog
} from './launchFailure'
import { Catalog, Product } from 'common/types/epic-graphql'
import { Game } from 'common/types/game_manager'
import {
  AllowedWineFlags,
  getWineFlags,
  isUmuSupported
} from 'backend/utils/compatibility_layers'
import {
  LegendaryAppName,
  LegendaryPlatform,
  NonEmptyString,
  PositiveInteger
} from './commands/base'
import { LegendaryCommand } from './commands'
import { getUmuId } from 'backend/wiki_game_info/umu/utils'
import thirdParty from './thirdParty'
import { Path } from 'backend/schemas'
import { mkdirSync } from 'fs'
import { deriveLegendaryPaths } from './constants'
import { isCLINoGui, isMac, isWindows } from 'backend/constants/environment'

import type LogWriter from 'backend/logger/log_writer'
import { engineKeyFor } from 'backend/engine/gameKey'

export default class LegendaryGame implements Game {
  private readonly appName: LegendaryAppName

  constructor(
    appName: LegendaryAppName,
    private readonly deps: LegendaryManagerDeps
  ) {
    this.appName = appName
  }

  /**
   * Alias for `LegendaryLibrary.getGameInfo(appName)`
   *
   * @returns GameInfo
   */
  getGameInfo(): GameInfo {
    const info = this.deps.libraryManagers.legendary.getGameInfo(this.appName)
    if (!info) {
      logError(
        [
          'Could not get game info for',
          `${this.appName},`,
          'returning empty object. Something is probably gonna go wrong soon'
        ],
        LogPrefix.Legendary
      )
      return {
        app_name: '',
        runner: 'legendary',
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

  private async getProductSlug(namespace: string, title: string) {
    // If you want to change this graphql query, make sure it works for these games:
    // Rocket League
    // Alba - A Wildlife Adventure
    const graphql = {
      query: `{
          Catalog {
            catalogNs(namespace: "${namespace}") {
              mappings (pageType: "productHome") {
                pageSlug
                pageType
              }
            }
          }
      }`
    }

    try {
      const result = await axios(
        'https://launcher.store.epicgames.com/graphql',
        {
          data: graphql,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) EpicGamesLauncher'
          },
          method: 'POST'
        }
      )

      const res = result.data.data.Catalog as Catalog
      const slugMapping = res.catalogNs.mappings.find(
        (mapping) => mapping.pageType === 'productHome'
      )

      if (slugMapping) {
        return slugMapping.pageSlug
      } else {
        return this.slugFromTitle(title)
      }
    } catch (error) {
      logError(error, LogPrefix.Legendary)
      return this.slugFromTitle(title)
    }
  }

  private async getExtraFromAPI(slug: string): Promise<ExtraInfo | null> {
    let lang = this.deps.stores.kvs.configStore.get('language', '')
    if (lang === 'pt') {
      lang = 'pt-BR'
    }
    if (lang === 'zh_Hans') {
      lang = 'zh-CN'
    }
    if (lang === 'es') {
      lang = 'es-ES'
    }

    const epicUrl = `https://store-content.ak.epicgames.com/api/${lang}/content/products/${slug}`

    try {
      const { data } = await axios({ method: 'GET', url: epicUrl })
      logInfo('Getting Info from Epic API', LogPrefix.Legendary)

      const about = data?.pages?.find(
        (e: { type: string }) => e.type === 'productHome'
      )

      if (about) {
        return {
          about: about.data.about,
          reqs: about.data.requirements.systems[0].details,
          releaseDate: about.data.meta.releaseDate?.substring(0, 19),
          storeUrl: `https://www.epicgames.com/store/product/${slug}`
        }
      } else {
        return null
      }
    } catch (error) {
      logError(
        ['Failed to get info from Epic API:', error],
        LogPrefix.Legendary
      )
      return null
    }
  }

  private async getExtraFromGraphql(
    namespace: string,
    slug: string
  ): Promise<ExtraInfo | null> {
    const graphql = {
      query: `{
        Product {
          sandbox(sandboxId: "${namespace}") {
            configuration {
              ... on StoreConfiguration {
                configs {
                  shortDescription
                  technicalRequirements {
                    macos {
                      minimum
                      recommended
                      title
                    }
                    windows {
                      minimum
                      recommended
                      title
                    }
                  }
                }
              }
            }
          }
        }
      }`
    }

    try {
      const result = await axios(
        'https://launcher.store.epicgames.com/graphql',
        {
          data: graphql,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) EpicGamesLauncher'
          },
          method: 'POST'
        }
      )

      const res = result.data.data.Product as Product

      const configuration = res.sandbox.configuration[0]

      if (!configuration) {
        return null
      }

      const requirements = configuration.configs.technicalRequirements.windows

      if (requirements) {
        return {
          about: {
            description: configuration.configs.shortDescription,
            shortDescription: ''
          },
          reqs: requirements,
          storeUrl: `https://www.epicgames.com/store/product/${slug}`
        }
      } else {
        return null
      }
    } catch (error) {
      logError(error, LogPrefix.Legendary)
      return null
    }
  }

  private slugFromTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z ]/g, '')
      .replaceAll(' ', '-')
  }

  private emptyExtraInfo = {
    about: {
      description: '',
      shortDescription: ''
    },
    reqs: [],
    storeUrl: ''
  }
  /**
   * Get extra info from Epic's API.
   *
   */
  async getExtraInfo(): Promise<ExtraInfo> {
    const { namespace, title } = this.getGameInfo()
    if (namespace === undefined) return this.emptyExtraInfo

    const cachedExtraInfo =
      this.deps.stores.legendary.gameInfoStore.get(namespace)
    if (cachedExtraInfo) {
      return cachedExtraInfo
    }
    if (!this.deps.onlineMonitor.isOnline()) {
      return this.emptyExtraInfo
    }

    const slug = await this.getProductSlug(namespace, title)

    // try the API first, it works for most games
    let extraData = await this.getExtraFromAPI(slug)

    // if the API doesn't work, try graphql
    if (!extraData) {
      extraData = await this.getExtraFromGraphql(namespace, slug)
    }

    // if we have data, store it and return
    if (extraData) {
      this.deps.stores.legendary.gameInfoStore.set(namespace, extraData)
      return extraData
    } else {
      logError('Error Getting Info from Epic API', LogPrefix.Legendary)
      return {
        about: {
          description: '',
          shortDescription: ''
        },
        reqs: [],
        storeUrl: ''
      }
    }
  }

  /**
   * Alias for the per-game config `.config`
   * If it doesn't exist, uses getSettings() instead.
   *
   * @returns GameConfig
   */
  async getSettings() {
    return (
      this.deps.gameConfigs.get(this.appName).config ||
      (await this.deps.gameConfigs.get(this.appName).getSettings())
    )
  }

  /**
   * Parent folder to move app to.
   * Amends install path by adding the appropriate folder name.
   */
  async moveInstall(
    newInstallPath: string
  ): Promise<{ status: 'done' } | { status: 'error'; error: string }> {
    const gameInfo = this.getGameInfo()
    logInfo(`Moving ${gameInfo.title} to ${newInstallPath}`, LogPrefix.Gog)

    const moveImpl = isWindows ? moveOnWindows : moveOnUnix
    const moveResult = await moveImpl(this.deps, newInstallPath, gameInfo)

    if (moveResult.status === 'error') {
      const { error } = moveResult
      logError(
        ['Error moving', gameInfo.title, 'to', newInstallPath, error],
        LogPrefix.Legendary
      )

      return { status: 'error', error }
    }

    await this.deps.libraryManagers.legendary.changeGameInstallPath(
      this.appName,
      moveResult.installPath
    )
    return { status: 'done' }
  }

  // used when downloading games, store the download size read from Legendary's output
  private currentDownloadSize: number | undefined

  getCurrentDownloadSize() {
    return this.currentDownloadSize
  }

  setCurrentDownloadSize(size: number) {
    this.currentDownloadSize = size
  }

  private defaultTmpProgres = () => ({
    bytes: '',
    eta: '',
    percent: undefined,
    diskSpeed: undefined,
    downSpeed: undefined
  })
  private tmpProgress: InstallProgress | undefined

  onInstallOrUpdateOutput(
    action: 'installing' | 'updating',
    data: string,
    totalDownloadSize: number
  ) {
    const downloadSizeMatch = data.match(/Download size: ([\d.]+) MiB/)

    // store the download size, needed for correct calculation
    // when cancel/resume downloads
    const downloadSizeStr = downloadSizeMatch?.[1]
    if (downloadSizeStr) {
      this.currentDownloadSize = parseFloat(downloadSizeStr)
    }

    if (!this.tmpProgress) {
      this.tmpProgress = this.defaultTmpProgres()
    }

    const progress = this.tmpProgress

    // parse log for eta
    if (progress.eta === '') {
      const etaMatch = data.match(/ETA: (\d\d:\d\d:\d\d)/m)
      progress.eta = etaMatch?.[1] ?? ''
    }

    // parse log for game download progress
    if (progress.bytes === '') {
      const bytesMatch = data.match(/Downloaded: (\S+.) MiB/m)
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

    // original is in bytes, convert to MiB with 2 decimals
    totalDownloadSize =
      Math.round((totalDownloadSize / 1024 / 1024) * 100) / 100

    // calculate percentage
    if (progress.bytes !== '') {
      const downloaded = parseFloat(progress.bytes)
      const downloadCache = totalDownloadSize - (this.currentDownloadSize ?? 0)
      const totalDownloaded = downloaded + downloadCache
      const newPercent =
        Math.round((totalDownloaded / totalDownloadSize) * 10000) / 100
      progress.percent = newPercent >= 0 ? newPercent : undefined
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
        LogPrefix.Legendary
      )

      sendProgressUpdate(this.deps, {
        appName: this.appName,
        runner: 'legendary',
        status: action,
        progress: progress
      })

      // reset
      this.tmpProgress = this.defaultTmpProgres()
    }
  }

  /**
   * Update game.
   * Does NOT check for online connectivity.
   */
  async update(): Promise<{ status: 'done' | 'error' }> {
    sendGameStatusUpdate(this.deps, {
      appName: this.appName,
      runner: 'legendary',
      status: 'updating'
    })
    const { maxWorkers, downloadNoHttps } = this.deps.config.getSettings()
    const installPlatform = this.getGameInfo().install.platform!
    const info = await this.deps.libraryManagers.legendary.getInstallInfo(
      this.appName,
      installPlatform
    )

    const command: LegendaryCommand = {
      subcommand: 'update',
      appName: this.appName,
      '-y': true,
      '--skip-sdl': true
    }
    if (maxWorkers) command['--max-workers'] = PositiveInteger.parse(maxWorkers)
    if (downloadNoHttps) command['--no-https'] = true

    const onOutput = (data: string) => {
      this.onInstallOrUpdateOutput(
        'updating',
        data,
        info.manifest?.download_size
      )
    }

    const updateLogWriter = await createGameLogWriter(
      this.appName,
      'legendary',
      'update',
      {
        disableLogs: this.deps.config.getSettings().disableLogs,
        verboseLogs: false
      }
    )
    const res = await this.deps.libraryManagers.legendary.runRunnerCommand(
      command,
      {
        abortId: this.appName,
        logWriters: [updateLogWriter],
        onOutput,
        logMessagePrefix: `Updating ${this.appName}`
      }
    )

    sendGameStatusUpdate(this.deps, {
      appName: this.appName,
      runner: 'legendary',
      status: 'done'
    })

    if (res.error) {
      logError(
        ['Failed to update', `${this.appName}:`, res.error],
        LogPrefix.Legendary
      )
      return { status: 'error' }
    }
    return { status: 'done' }
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

  /**
   * Install game.
   * Does NOT check for online connectivity.
   */
  async install({ path, sdlList, platformToInstall }: InstallArgs): Promise<{
    status: 'done' | 'error' | 'abort'
    error?: string
  }> {
    const gameInfo = this.getGameInfo()
    if (gameInfo.thirdPartyManagedApp) {
      if (gameInfo.isEAManaged) {
        return this.installEA(gameInfo, platformToInstall)
      } else if (gameInfo.isUbisoftManaged) {
        return this.installUbisoft(gameInfo, platformToInstall)
      }

      logError(
        ['Third party app', gameInfo.thirdPartyManagedApp, 'not supported'],
        LogPrefix.Legendary
      )
      return { status: 'error' }
    }
    const { maxWorkers, downloadNoHttps } = this.deps.config.getSettings()
    const info = await this.deps.libraryManagers.legendary.getInstallInfo(
      this.appName,
      platformToInstall
    )

    const command: LegendaryCommand = {
      subcommand: 'install',
      appName: this.appName,
      '--platform': LegendaryPlatform.parse(platformToInstall),
      '--base-path': Path.parse(path),
      '--skip-dlcs': true,
      '-y': true
    }
    if (maxWorkers) command['--max-workers'] = PositiveInteger.parse(maxWorkers)
    if (downloadNoHttps) command['--no-https'] = true
    if (sdlList?.length)
      command.sdlList = sdlList.map((tag) => NonEmptyString.parse(tag))
    else command['--skip-sdl'] = true

    const onOutput = (data: string) => {
      this.onInstallOrUpdateOutput(
        'installing',
        data,
        info.manifest?.download_size
      )
    }

    const installLogWriter = await createGameLogWriter(
      this.appName,
      'legendary',
      'install',
      {
        disableLogs: this.deps.config.getSettings().disableLogs,
        verboseLogs: false
      }
    )
    let res = await this.deps.libraryManagers.legendary.runRunnerCommand(
      command,
      {
        abortId: this.appName,
        logWriters: [installLogWriter],
        onOutput,
        logMessagePrefix: `Installing ${this.appName}`
      }
    )

    // try to run the install again with higher memory limit
    if (res.stderr.includes('MemoryError:')) {
      command['--max-shared-memory'] = PositiveInteger.parse(5000)
      res = await this.deps.libraryManagers.legendary.runRunnerCommand(
        command,
        {
          abortId: this.appName,
          logWriters: [installLogWriter],
          onOutput
        }
      )
    }

    if (res.abort) {
      return { status: 'abort' }
    }

    if (res.error) {
      if (!res.error.includes('signal')) {
        logError(
          ['Failed to install', `${this.appName}:`, res.error],
          LogPrefix.Legendary
        )
      }
      return { status: 'error', error: res.error }
    }
    void this.addShortcuts().catch((error) =>
      logWarning(
        ['Could not add shortcuts for', this.appName, error],
        LogPrefix.Legendary
      )
    )

    if (isMac && LegendaryPlatform.parse(platformToInstall) === 'Mac') {
      this.deps.libraryManagers.legendary.refreshInstalled()
      const installed = this.deps.libraryManagers.legendary.getGameInfo(
        this.appName,
        true
      )?.install
      const installPath = installed?.install_path
      if (installPath) {
        // Fire-and-forget: never delays the done status (quick 261029-t39).
        // library.ts is imported lazily: it imports this module.
        void import('./library').then(({ applyLegendaryMacArch }) =>
          checkInstalledMacArch({
            deps: this.deps,
            runner: 'legendary',
            appName: this.appName,
            installPath,
            executable: installed?.executable,
            title: gameInfo.title,
            apply: (appName, verdict) =>
              applyLegendaryMacArch(this.deps, appName, verdict),
            prompt: true
          })
        )
      }
    }

    return { status: 'done' }
  }

  private async installEA(
    gameInfo: GameInfo,
    platformToInstall: string
  ): Promise<{
    status: 'done' | 'error' | 'abort'
    error?: string
  }> {
    logInfo('Getting EA App installer', LogPrefix.Legendary)
    const { epicRedistPath } = deriveLegendaryPaths(this.deps.paths)
    const installerPath = join(epicRedistPath, 'EAappInstaller.exe')

    if (!existsSync(epicRedistPath)) {
      mkdirSync(epicRedistPath, { recursive: true })
    }

    if (!existsSync(installerPath)) {
      try {
        await downloadFile({
          url: 'https://origin-a.akamaihd.net/EA-Desktop-Client-Download/installer-releases/EAappInstaller.exe',
          dest: installerPath
        })
      } catch (e) {
        return { status: 'error', error: `${e}` }
      }
    }

    if (isWindows) {
      const process = await this.deps.spawnAsync(installerPath, [
        'EAX_LAUNCH_CLIENT=0',
        'IGNORE_INSTALLED=1'
      ])

      if (process.code !== null && process.code === 3) {
        return { status: 'abort' }
      }
    }

    await thirdParty.addInstalledGame(
      this.deps.paths,
      gameInfo.app_name,
      platformToInstall
    )

    return { status: 'done' }
  }

  async installUbisoft(
    gameInfo: GameInfo,
    platformToInstall: string
  ): Promise<{
    status: 'done' | 'error' | 'abort'
    error?: string
  }> {
    logInfo('Getting Ubisoft installer', LogPrefix.Legendary)
    const { epicRedistPath } = deriveLegendaryPaths(this.deps.paths)
    const installerPath = join(epicRedistPath, 'UbisoftConnectInstaller.exe')

    if (!existsSync(epicRedistPath)) {
      mkdirSync(epicRedistPath, { recursive: true })
    }

    if (!existsSync(installerPath)) {
      try {
        await downloadFile({
          url: 'https://static3.cdn.ubi.com/orbit/launcher_installer/UbisoftConnectInstaller.exe',
          dest: installerPath
        })
      } catch (e) {
        return { status: 'error', error: `${e}` }
      }
    }

    if (isWindows) {
      const process = await this.deps.spawnAsync(installerPath, ['/S'])

      if (process.code !== null && process.code === 3) {
        return { status: 'abort' }
      }
    }

    await thirdParty.addInstalledGame(
      this.deps.paths,
      gameInfo.app_name,
      platformToInstall
    )

    return { status: 'done' }
  }

  async uninstall(): Promise<ExecResult> {
    const gameInfo = this.getGameInfo()
    if (gameInfo.thirdPartyManagedApp) {
      await thirdParty.removeInstalledGame(this.deps.paths, this.appName)
      return { stdout: '', stderr: '' }
    }

    const command: LegendaryCommand = {
      subcommand: 'uninstall',
      appName: this.appName,
      '-y': true
    }

    const res = await this.deps.libraryManagers.legendary.runRunnerCommand(
      command,
      {
        abortId: this.appName,
        logMessagePrefix: `Uninstalling ${this.appName}`
      }
    )

    if (res.error) {
      logError(
        ['Failed to uninstall', `${this.appName}:`, res.error],
        LogPrefix.Legendary
      )
    } else if (!res.abort) {
      this.deps.libraryManagers.legendary.installState(this.appName, false)
      await removeShortcutsUtil(this.deps, this)
      await removeNonSteamGame(this.deps, this)
    }
    this.deps.sendFrontendMessage('refreshLibrary', 'legendary')
    return res
  }

  /**
   * Repair game.
   * Does NOT check for online connectivity.
   */
  async repair(): Promise<ExecResult> {
    const { maxWorkers, downloadNoHttps } = this.deps.config.getSettings()

    const command: LegendaryCommand = {
      subcommand: 'repair',
      appName: this.appName,
      '-y': true,
      '--skip-sdl': true
    }
    if (maxWorkers) command['--max-workers'] = PositiveInteger.parse(maxWorkers)
    if (downloadNoHttps) command['--no-https'] = true

    const repairLogWriter = await createGameLogWriter(
      this.appName,
      'legendary',
      'repair',
      {
        disableLogs: this.deps.config.getSettings().disableLogs,
        verboseLogs: false
      }
    )
    const res = await this.deps.libraryManagers.legendary.runRunnerCommand(
      command,
      {
        abortId: this.appName,
        logWriters: [repairLogWriter],
        logMessagePrefix: `Repairing ${this.appName}`
      }
    )

    if (res.error) {
      logError(
        ['Failed to repair', `${this.appName}:`, res.error],
        LogPrefix.Legendary
      )
    }
    return res
  }

  async importGame(
    folderPath: string,
    platform: InstallPlatform
  ): Promise<ExecResult> {
    const command: LegendaryCommand = {
      subcommand: 'import',
      appName: this.appName,
      installationDirectory: Path.parse(folderPath),
      '--with-dlcs': true,
      '--platform': LegendaryPlatform.parse(platform)
    }

    logInfo(`Importing ${this.appName}.`, LogPrefix.Legendary)

    const logWriter = await createGameLogWriter(
      this.appName,
      'legendary',
      'import',
      {
        disableLogs: this.deps.config.getSettings().disableLogs,
        verboseLogs: false
      }
    )
    const res = await this.deps.libraryManagers.legendary.runRunnerCommand(
      command,
      {
        abortId: this.appName,
        logWriters: [logWriter]
      }
    )
    void this.addShortcuts().catch((error) =>
      logWarning(
        ['Could not add shortcuts for', this.appName, error],
        LogPrefix.Legendary
      )
    )
    const errorMatch = res.stderr.match(/^.*ERROR:.*$/gm)?.join('') ?? ''
    res.error = (res.error ?? '') + errorMatch
    if (res.error) {
      logError(
        ['Failed to import', `${this.appName}:`, res.error],
        LogPrefix.Legendary
      )
    }
    return res
  }

  /**
   * Sync saves.
   * Does NOT check for online connectivity.
   */
  async syncSaves(arg: string, path: string): Promise<string> {
    if (!path) {
      logError(
        'No path provided for SavesSync, check your settings!',
        LogPrefix.Legendary
      )
      return 'No path provided.'
    }

    const command: LegendaryCommand = {
      subcommand: 'sync-saves',
      appName: this.appName,
      [arg]: true,
      '--save-path': Path.parse(path),
      '-y': true
    }

    let fullOutput = ''
    const res = await this.deps.libraryManagers.legendary.runRunnerCommand(
      command,
      {
        abortId: this.appName,
        logMessagePrefix: `Syncing saves for ${this.getGameInfo().title}`,
        onOutput: (output) => (fullOutput += output)
      }
    )

    if (res.error) {
      logError(
        ['Failed to sync saves for', `${this.appName}:`, res.error],
        LogPrefix.Legendary
      )
    }
    return fullOutput
  }

  async launch(
    logWriter: LogWriter,
    launchArguments?: LaunchOption,
    args: string[] = [],
    skipVersionCheck = false
  ): Promise<boolean> {
    const gameSettings =
      this.deps.engineRuntime.launchSettings.getLaunchSettings(
        engineKeyFor(this.getGameInfo().runner, this.appName),
        await this.getSettings()
      )
    const gameInfo = this.getGameInfo()

    const {
      success: launchPrepSuccess,
      failureReason: launchPrepFailReason,
      rpcClient,
      mangoHudCommand,
      gameModeBin,
      gameScopeCommand,
      offlineMode
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

    const languageCode =
      gameSettings.language ||
      this.deps.stores.kvs.configStore.get('language', '')

    let commandEnv = {
      ...process.env,
      ...this.deps.launcher.setupWrapperEnvVars({
        appName: this.appName,
        appRunner: 'legendary'
      }),
      ...this.deps.launcher.setupEnvVars(
        gameSettings,
        gameInfo.install.install_path
      ),
      ...this.deps.launcher.getKnownFixesEnvVariables(this.appName, 'legendary')
    }

    // Use the wrapper EXE to launch games.
    if (
      ![undefined, '0', 'false'].includes(commandEnv['USE_FAKE_EPIC_EXE']) &&
      existsSync(this.deps.paths.fakeEpicExePath)
    ) {
      if (isWindows) {
        commandEnv['LEGENDARY_WRAPPER_EXE'] = this.deps.paths.fakeEpicExePath
      } else {
        // on linux and mac, we copy the fake exe
        const fakeExeWinPath = 'C:\\windows\\command\\EpicGamesLauncher.exe'
        const fakeEpicExePathInPrefix =
          await this.deps.commandRunner.getWinePath({
            path: fakeExeWinPath,
            gameSettings,
            variant: 'unix'
          })

        // we copy the file inside the prefix to avoid permission issues
        if (!existsSync(fakeEpicExePathInPrefix))
          copyFileSync(this.deps.paths.fakeEpicExePath, fakeEpicExePathInPrefix)
        commandEnv['LEGENDARY_WRAPPER_EXE'] = fakeExeWinPath
      }
    }

    const wrappers = this.deps.launcher.setupWrappers(
      gameSettings,
      mangoHudCommand,
      gameModeBin,
      gameScopeCommand
    )

    let wineFlags: AllowedWineFlags = wrappers.length
      ? { '--wrapper': NonEmptyString.parse(shlex.join(wrappers)) }
      : {}

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

      wineFlags = await getWineFlags(
        this.deps,
        gameSettings,
        shlex.join(wrappers)
      )
    }

    const appNameToLaunch =
      launchArguments?.type === 'dlc'
        ? launchArguments.dlcAppName
        : this.appName

    const launchArgumentArgs =
      launchArguments &&
      (launchArguments.type === undefined || launchArguments.type === 'basic')
        ? launchArguments.parameters
        : undefined

    // Known-fix launchArgs / exeOverride (quick 261029-mbl).
    const knownFix = readKnownFixLaunchOverrides(
      this.appName,
      'legendary',
      gameInfo.install.install_path
    )
    const command: LegendaryCommand = {
      subcommand: 'launch',
      appName: LegendaryAppName.parse(appNameToLaunch),
      ...legendaryLaunchArgumentFields({
        args,
        launchArgumentArgs,
        launcherArgs: gameSettings.launcherArgs,
        knownFixLaunchArgs: knownFix.launchArgs
      }),
      ...wineFlags
    }
    if (skipVersionCheck) command['--skip-version-check'] = true
    if (languageCode) command['--language'] = NonEmptyString.parse(languageCode)
    if (launchArguments?.type === 'altExe')
      command['--override-exe'] = launchArguments.executable
    else if (gameSettings.targetExe)
      command['--override-exe'] = Path.parse(gameSettings.targetExe)
    else if (knownFix.exeOverride)
      command['--override-exe'] = Path.parse(knownFix.exeOverride)
    if (offlineMode) command['--offline'] = true
    if (isCLINoGui) command['--skip-version-check'] = true
    if (gameInfo.isEAManaged) command['--origin'] = true
    if (gameInfo.isUbisoftManaged) command['--ubisoft'] = true

    sendGameStatusUpdate(this.deps, {
      appName: this.appName,
      runner: 'legendary',
      status: 'playing'
    })

    // Quick 261111-8b5: onOutput makes this run non-joinable in callRunner
    // (WR-01), which is safe because launcher.ts single-flights launches
    // (WR-03). The capture is bounded and its text is never logged.
    const launchOutput = createBoundedOutputCapture(LEGENDARY_LAUNCH_OUTPUT_CAP)
    const { error, abort } =
      await this.deps.libraryManagers.legendary.runRunnerCommand(command, {
        abortId: this.appName,
        env: commandEnv,
        wrappers: wrappers,
        logMessagePrefix: `Launching ${gameInfo.title}`,
        logWriters: gameSettings.verboseLogs ? [logWriter] : [],
        onOutput: (chunk) => launchOutput.onOutput(chunk)
      })

    this.deps.launcher.launchCleanup(rpcClient)

    const loginFailure = classifyLegendaryLaunchFailure({
      output: launchOutput.text(),
      errored: Boolean(error),
      aborted: Boolean(abort)
    })
    if (loginFailure) {
      logWriter.logError([
        'Launch failed: Epic sign-in failed (',
        loginFailure,
        ')'
      ])
      showDialogBoxModalAuto(
        this.deps,
        legendaryLaunchFailureDialog(loginFailure, gameInfo.title)
      )
    }

    return !error
  }

  isNative(): boolean {
    const gameInfo = this.getGameInfo()

    if (isWindows) {
      return true
    }

    if (isMac && gameInfo?.install?.platform === 'Mac') {
      return true
    }

    return false
  }

  async forceUninstall() {
    // Modify Legendary installed.json file:
    try {
      await this.deps.libraryManagers.legendary.runRunnerCommand(
        {
          subcommand: 'uninstall',
          appName: this.appName,
          '-y': true,
          '--keep-files': true
        },
        {
          abortId: this.appName
        }
      )

      this.deps.sendFrontendMessage('refreshLibrary', 'legendary')
    } catch (error) {
      logError(
        [
          `Error reading ${deriveLegendaryPaths(this.deps.paths).legendaryInstalled}, could not complete operation:`,
          error
        ],
        LogPrefix.Legendary
      )
    }
  }

  // Could be removed if legendary handles SIGKILL and SIGTERM for us
  // which is send via AbortController
  async stop(stopWine = true) {
    // Phase 72 D-13: kill the tracked legendary child for this app, not a name pattern.
    this.deps.runner.killTracked({ runner: 'legendary', key: this.appName })

    if (stopWine && !this.isNative()) {
      const gameSettings =
        this.deps.engineRuntime.launchSettings.getLaunchSettings(
          engineKeyFor(this.getGameInfo().runner, this.appName),
          await this.getSettings()
        )
      await shutdownWine(this.deps, gameSettings)
    }
  }

  async isGameAvailable(): Promise<boolean> {
    const info = this.getGameInfo()
    if (!info.is_installed) return false
    if (info.install.install_path && existsSync(info.install.install_path))
      return true
    return false
  }
}
