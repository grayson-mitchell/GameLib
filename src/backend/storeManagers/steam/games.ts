import {
  ExtraInfo,
  GameInfo,
  GameSettings,
  ExecResult,
  InstallArgs,
  LaunchOption
} from 'common/types'
import { GOGCloudSavesLocation } from 'common/types/gog'
import { Game, InstallResult, RemoveArgs } from 'common/types/game_manager'
import { logWarning, LogPrefix } from 'backend/logger'
import type LogWriter from 'backend/logger/log_writer'

export default class SteamGame implements Game {
  private readonly appId: string

  constructor(appId: string) {
    this.appId = appId
  }

  async getSettings(): Promise<GameSettings> {
    throw new Error(
      `SteamGame.getSettings not implemented until Phase 2 (appId: ${this.appId})`
    )
  }

  getGameInfo(): GameInfo {
    throw new Error(
      `SteamGame.getGameInfo not implemented until Phase 2 (appId: ${this.appId})`
    )
  }

  async getExtraInfo(): Promise<ExtraInfo> {
    throw new Error(
      `SteamGame.getExtraInfo not implemented until Phase 2 (appId: ${this.appId})`
    )
  }

  async importGame(): Promise<ExecResult> {
    logWarning(
      `SteamGame.importGame not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
    return { stdout: '', stderr: 'Steam library not implemented until Phase 2' }
  }

  onInstallOrUpdateOutput(
    _action: 'installing' | 'updating',
    _data: string,
    _totalDownloadSize: number
  ): void {
    logWarning(
      `SteamGame.onInstallOrUpdateOutput not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
  }

  async install(_args: InstallArgs): Promise<InstallResult> {
    logWarning(
      `SteamGame.install not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
    return { status: 'error', error: 'Steam library not implemented until Phase 2' }
  }

  isNative(): boolean {
    return true
  }

  async addShortcuts(_fromMenu?: boolean): Promise<void> {
    logWarning(
      `SteamGame.addShortcuts not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
  }

  async removeShortcuts(): Promise<void> {
    logWarning(
      `SteamGame.removeShortcuts not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
  }

  async launch(
    _logWriter: LogWriter,
    _launchArguments?: LaunchOption,
    _args?: string[],
    _skipVersionCheck?: boolean
  ): Promise<boolean> {
    logWarning(
      `SteamGame.launch not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
    return false
  }

  async moveInstall(_newInstallPath: string): Promise<InstallResult> {
    logWarning(
      `SteamGame.moveInstall not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
    return { status: 'error', error: 'Steam library not implemented until Phase 2' }
  }

  async repair(): Promise<ExecResult> {
    logWarning(
      `SteamGame.repair not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
    return { stdout: '', stderr: 'Steam library not implemented until Phase 2' }
  }

  async syncSaves(
    _arg: string,
    _path: string,
    _gogSaves?: GOGCloudSavesLocation[]
  ): Promise<string> {
    logWarning(
      `SteamGame.syncSaves not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
    return 'Steam library not implemented until Phase 2'
  }

  async uninstall(_args: RemoveArgs): Promise<ExecResult> {
    logWarning(
      `SteamGame.uninstall not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
    return { stdout: '', stderr: 'Steam library not implemented until Phase 2' }
  }

  async update(): Promise<InstallResult> {
    logWarning(
      `SteamGame.update not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
    return { status: 'error', error: 'Steam library not implemented until Phase 2' }
  }

  async forceUninstall(): Promise<void> {
    logWarning(
      `SteamGame.forceUninstall not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
  }

  async stop(_stopWine?: boolean): Promise<void> {
    logWarning(
      `SteamGame.stop not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
  }

  async isGameAvailable(): Promise<boolean> {
    return false
  }
}
