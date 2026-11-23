import {
  ExecResult,
  ExtraInfo,
  GameInfo,
  GameSettings,
  LaunchOption
} from 'common/types'
import { sendGameStatusUpdate, shutdownWine } from '../../utils'
import { logInfo, LogPrefix, logWarning } from 'backend/logger'
import { basename, dirname } from 'path'
import { existsSync } from 'graceful-fs'
import i18next from 'i18next'
import {
  addShortcuts as addShortcutsUtil,
  removeShortcuts as removeShortcutsUtil
} from '../../shortcuts/shortcuts/shortcuts'
import { notify } from '../../dialog/dialog'
import { launchGame } from 'backend/storeManagers/storeManagerCommon/games'
import { Game, InstallResult, RemoveArgs } from 'common/types/game_manager'
import {
  checkRemoval,
  firstBlockingItem,
  guardedRemoveTree
} from 'backend/safety/rustSafety'
import {
  collectKnownInstalls,
  knownInstallKey,
  titleForKnownKey
} from 'backend/safety/knownInstalls'
import { protectedRootsFor } from 'backend/safety/protectedRoots'
import { pushRemovalRefusal } from 'backend/safety/refusal'
import type { SafetyRequest } from 'common/types/safety'
import { removeRecentGame } from 'backend/info/recentGames'
import { isLinux, isMac, isWindows } from 'backend/constants/environment'
import { removeNonSteamGame } from 'backend/shortcuts/nonesteamgame/nonesteamgame'
import type { ManagerDeps } from 'backend/services/types'

import type LogWriter from 'backend/logger/targetWriter'
import { engineKeyFor } from 'backend/enginewine/twin'

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

  private pushRefusal(
    outcome: 'refused' | 'failed',
    title: string,
    reason: Parameters<typeof pushRemovalRefusal>[1]['reason'],
    otherKey?: string
  ) {
    const otherTitle = otherKey
      ? titleForKnownKey(this.deps, otherKey)
      : undefined
    pushRemovalRefusal(this.deps, {
      kind: 'uninstall',
      outcome,
      reason,
      title,
      appName: this.id,
      runner: 'sideload',
      ...(otherTitle ? { otherTitle } : {})
    })
  }

  async uninstall({ deleteFiles = false }: RemoveArgs): Promise<ExecResult> {
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

    // Phase 82 (D-22): the prefix is removed by uninstallGameCallback, through the guarded path
    // (sideload is not a client-handoff store). The only GameLib-side recursive delete here is the
    // game's own folder, and only when the user asked for the files to go.

    let folderRequest: SafetyRequest | undefined
    if (deleteFiles && executable !== undefined) {
      folderRequest = {
        targets: [
          {
            id: 'folder',
            path: dirname(executable),
            kind: 'sideload-folder',
            executable: basename(executable)
          }
        ],
        knownInstalls: collectKnownInstalls(this.deps, {
          runner: 'sideload',
          appName: this.id
        }),
        selfKey: knownInstallKey('sideload', this.id),
        protectedRoots: protectedRootsFor(this.deps)
      }
      // Checked BEFORE the library entry is touched: a refusal leaves the entry and the files
      // alone and the tile back at rest. (The Linux exec-bit rule can over-refuse a folder that
      // holds helper scripts or libraries; the notice says the folder may be shared.)
      const check = await checkRemoval(this.deps, folderRequest)
      if (check.overall !== 'yes') {
        const blocking = firstBlockingItem(check)
        const reason = blocking?.reason ?? 'bad-reply'
        this.pushRefusal('refused', title, reason, blocking?.otherKey)
        return { stdout: '', stderr: reason, refused: true }
      }
    }

    if (folderRequest) {
      const removed = await guardedRemoveTree(this.deps, folderRequest)
      if (removed.outcome !== 'removed') {
        const reason = removed.reason ?? 'bad-reply'
        if (removed.outcome === 'refused') {
          // IN-03: the verdict changed between the two Rust calls and nothing was deleted (no
          // external process runs on this path), so this is a refusal, not a failure.
          this.pushRefusal('refused', title, reason, removed.otherKey)
          return { stdout: '', stderr: reason, refused: true }
        }
        // The delete ran or its effect is unconfirmed: keep the library entry so a retry works.
        this.pushRefusal('failed', title, reason, removed.otherKey)
        return { stdout: '', stderr: reason, failed: true }
      }
    }
    this.deps.stores.sideload.libraryStore.set('games', current)

    notify(this.deps, { title, body: i18next.t('notify.uninstalled') })

    removeShortcutsUtil(this.deps, this)
    // Recent-games bookkeeping is Rust's now and can reject (a transport or store failure); the
    // uninstall already succeeded, so it is logged and never turned into an uninstall failure.
    removeRecentGame(this.deps, this.id).catch((error: unknown) => {
      logWarning(
        [`removing ${this.id} from recent games failed:`, error],
        LogPrefix.Backend
      )
    })
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
