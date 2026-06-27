import {
  GameInfo,
  ExecResult,
  InstallPlatform,
  InstallInfo,
  LaunchOption
} from 'common/types'
import { LibraryManager } from 'common/types/game_manager'
import { logInfo, LogPrefix } from 'backend/logger'
import SteamGame from './games'

export default class SteamLibraryManager implements LibraryManager {
  async init(): Promise<void> {
    logInfo('Steam library manager initialized (Phase 1 stub)', LogPrefix.Steam)
  }

  getGame(id: string): SteamGame {
    return new SteamGame(id)
  }

  async refresh(): Promise<ExecResult | null> {
    logInfo(
      'Steam library refresh not implemented until Phase 2',
      LogPrefix.Steam
    )
    return null
  }

  getGameInfo(
    _appName: string,
    _forceReload?: boolean
  ): GameInfo | undefined {
    return undefined
  }

  async getInstallInfo(
    _appName: string,
    _installPlatform: InstallPlatform,
    _options: {
      branch?: string
      build?: string
      lang?: string
      retries?: number
    }
  ): Promise<InstallInfo | undefined> {
    return undefined
  }

  async listUpdateableGames(): Promise<string[]> {
    return []
  }

  async changeGameInstallPath(
    _appName: string,
    _newPath: string
  ): Promise<void> {
    // no-op in Phase 1
  }

  changeVersionPinnedStatus(_appName: string, _status: boolean): void {
    // no-op in Phase 1
  }

  installState(_appName: string, _state: boolean): void {
    // no-op in Phase 1
  }

  getLaunchOptions(_appName: string): LaunchOption[] {
    return []
  }
}
