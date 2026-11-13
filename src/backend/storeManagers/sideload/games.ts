import {
  ExecResult,
  ExtraInfo,
  GameInfo,
  GameSettings,
  LaunchOption
} from 'common/types'
import { sendGameStatusUpdate, shutdownWine } from '../../utils'
import { logInfo, LogPrefix, logWarning } from 'backend/logger'
import { dirname } from 'path'
import { existsSync, rmSync } from 'graceful-fs'
import i18next from 'i18next'
import {
  addShortcuts as addShortcutsUtil,
  removeShortcuts as removeShortcutsUtil
} from '../../shortcuts/shortcuts/shortcuts'
import { notify } from '../../dialog/dialog'
import { launchGame } from 'backend/storeManagers/storeManagerCommon/games'
import { Game, InstallResult, RemoveArgs } from 'common/types/game_manager'
import { removePrefix } from 'backend/utils/uninstaller'
import { removeRecentGame } from 'backend/recent_games/recent_games'
import { isLinux, isMac, isWindows } from 'backend/constants/environment'
import { removeNonSteamGame } from 'backend/shortcuts/nonesteamgame/nonesteamgame'
import type { ManagerDeps } from 'backend/services/types'

import type LogWriter from 'backend/logger/log_writer'
import { engineKeyFor } from 'backend/engine/gameKey'

export default class SideloadGame implements Game {
  private readonly id: string

  constructor(
    id: string,
    private readonly deps: Pick<
      ManagerDeps,
      | 'libraryManagers'
      | 'stores'
      | 'launcher'
      | 'commandRunner'
      | 'spawnAsync'
      | 'runner'
      | 'config'
      | 'gameConfigs'
      | 'paths'
      | 'infoCaches'
      | 'engineRuntime'
      | 'versioning'
      | 'windowRaiser'
      | 'aborts'
      | 'imageTools'
      | 'dialogs'
      | 'appState'
      | 'notifications'
      | 'sendFrontendMessage'
      | 'appRuntime'
      | 'requestRustInvoke'
    >
  ) {
    this.id = id
  }

  getGameInfo(): GameInfo {
    const store = this.deps.stores.sideload.libraryStore.get('games', [])
    const info = store.find((app) => app.app_name === this.id)
    if (!info) {
      // @ts-expect-error TODO: As with LegendaryGame and GOGGame, handle this properly
      return {}
    }
    return info
  }

  async getSettings(): Promise<GameSettings> {
    return (
      this.deps.gameConfigs.get(this.id).config ||
      (await this.deps.gameConfigs.get(this.id).getSettings())
    )
  }

  async addShortcuts(fromMenu?: boolean): Promise<void> {
    return addShortcutsUtil(this.deps, this, fromMenu)
  }

  async removeShortcuts(): Promise<void> {
    return removeShortcutsUtil(this.deps, this)
  }

  async isGameAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const { install } = this.getGameInfo()

      if (install && install.platform === 'Browser') {
        resolve(true)
      }

      if (install && install.executable) {
        resolve(existsSync(install.executable))
      }
    })
  }

  async launch(
    logWriter: LogWriter,
    launchArguments?: LaunchOption,
    args: string[] = []
  ): Promise<boolean> {
    return launchGame(this.deps, this, logWriter, args)
  }

  async stop(): Promise<void> {
    const {
      install: { executable = undefined }
    } = this.getGameInfo()

    if (executable) {
      // Phase 72 D-13: keys match the trackKey passed at the launch spawn sites.
      this.deps.runner.killTracked({ runner: 'sideload', key: this.id })

      if (!this.isNative()) {
        this.deps.runner.killTracked({ runner: 'wine', key: this.id })
        const gameSettings =
          this.deps.engineRuntime.launchSettings.getLaunchSettings(
            engineKeyFor(this.getGameInfo().runner, this.id),
            await this.getSettings()
          )
        // Awaited: the old blocking spawnSync finished before stop() returned (66.2-11).
        await shutdownWine(this.deps, gameSettings)
      }
    }
  }

  async uninstall({
    shouldRemovePrefix,
    deleteFiles = false
  }: RemoveArgs): Promise<ExecResult> {
    sendGameStatusUpdate(this.deps, {
      appName: this.id,
      runner: 'sideload',
      status: 'uninstalling'
    })

    const old = this.deps.stores.sideload.libraryStore.get('games', [])
    const current = old.filter((a: GameInfo) => a.app_name !== this.id)

    const gameInfo = this.getGameInfo()
    const {
      title,
      install: { executable }
    } = gameInfo

    if (shouldRemovePrefix) {
      removePrefix(this.deps, this.id, 'sideload')
    }
    this.deps.stores.sideload.libraryStore.set('games', current)

    if (deleteFiles && executable !== undefined) {
      rmSync(dirname(executable), { recursive: true })
    }

    notify(this.deps, { title, body: i18next.t('notify.uninstalled') })

    removeShortcutsUtil(this.deps, this)
    removeRecentGame(this.deps, this.id)
    removeNonSteamGame(this.deps, this)

    sendGameStatusUpdate(this.deps, {
      appName: this.id,
      runner: 'sideload',
      status: 'done'
    })

    logInfo('finished uninstalling', LogPrefix.Backend)
    return { stderr: '', stdout: '' }
  }

  isNative(): boolean {
    const {
      install: { platform }
    } = this.getGameInfo()
    if (platform) {
      if (platform === 'Browser') {
        return true
      }

      if (isWindows) {
        return true
      }

      if (isMac && platform === 'Mac') {
        return true
      }

      // small hack, but needs to fix the typings
      const plat = platform.toLowerCase()
      if (isLinux && plat === 'linux') {
        return true
      }
    }

    return false
  }

  async getExtraInfo(): Promise<ExtraInfo> {
    logWarning(
      `getExtraInfo not implemented on Sideload Game Manager. called for ID = ${this.id}`
    )
    return {
      about: {
        description: '',
        shortDescription: ''
      },
      reqs: [],
      storeUrl: ''
    }
  }

  onInstallOrUpdateOutput() {
    logWarning(
      `onInstallOrUpdateOutput not implemented on Sideload Game Manager. called for ID = ${this.id}`
    )
  }

  async moveInstall(): Promise<InstallResult> {
    logWarning(
      `moveInstall not implemented on Sideload Game Manager. called for ID = ${this.id}`
    )
    return { status: 'error' }
  }

  async repair(): Promise<ExecResult> {
    logWarning(
      `repair not implemented on Sideload Game Manager. called for ID = ${this.id}`
    )
    return { stderr: '', stdout: '' }
  }

  async syncSaves(): Promise<string> {
    logWarning(
      `syncSaves not implemented on Sideload Game Manager. called for ID = ${this.id}`
    )
    return ''
  }

  async forceUninstall(): Promise<void> {
    logWarning(
      `forceUninstall not implemented on Sideload Game Manager. called for ID = ${this.id}`
    )
  }

  async install(): Promise<InstallResult> {
    logWarning(
      `install not implemented on Sideload Game Manager. called for ID = ${this.id}`
    )
    return { status: 'error' }
  }

  async importGame(): Promise<ExecResult> {
    return { stderr: '', stdout: '' }
  }

  async update(): Promise<{ status: 'done' | 'error' }> {
    return { status: 'error' }
  }
}
