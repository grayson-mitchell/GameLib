import axios from 'axios'
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
import { sendFrontendMessage } from '../../ipc'
import { steamMetadataStore } from './electronStores'
import { library, pendingFetches } from './state'

const STEAM_CDN_BASE = 'https://cdn.cloudflare.steamstatic.com/steam/apps'
const STEAM_STORE_API = 'https://store.steampowered.com/api/appdetails'

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

  /**
   * Returns the in-memory library entry for this game synchronously.
   * When artwork is missing (first access), fires a non-blocking metadata
   * fetch as a side effect — caller gets the current entry immediately
   * and the frontend receives an updated push once the fetch resolves.
   */
  getGameInfo(): GameInfo {
    const existing = library.get(this.appId)
    if (!existing) return {} as GameInfo

    // Trigger lazy metadata fetch as fire-and-forget side effect (D-04)
    if (!existing.art_cover) {
      void this.fetchMetadataIfNeeded(existing)
    }

    return existing
  }

  /**
   * Fetches title, description, genres, and artwork from the Steam store
   * appdetails API.  Deduplicates concurrent calls via module-level
   * `pendingFetches` Set (T-2-03 mitigation): the appId is added to the Set
   * BEFORE the first await so subsequent synchronous callers see it immediately.
   *
   * On success: caches metadata in steamMetadataStore (D-05) and pushes the
   * enriched GameInfo to the frontend via sendFrontendMessage.
   * On failure: logs a warning and returns silently (no throw).
   */
  private async fetchMetadataIfNeeded(current: GameInfo): Promise<void> {
    // Guard: if a fetch is already in-flight for this appId, return immediately
    // (pendingFetches.add MUST come before the await — prevents T-2-03 race)
    if (pendingFetches.has(this.appId)) return
    pendingFetches.add(this.appId)

    try {
      const resp = await axios.get(
        `${STEAM_STORE_API}?appids=${this.appId}`
      )

      const data = resp.data?.[this.appId]?.data
      if (!data) {
        // Game may be delisted or API temporarily unavailable
        return
      }

      const artBase = `${STEAM_CDN_BASE}/${this.appId}`
      const art_cover = `${artBase}/header.jpg`
      const art_square = `${artBase}/capsule_616x353.jpg`

      // Build extra — preserve existing fields (especially steamPlaytimeMinutes)
      // T-2-02: short_description stored as plain string only, never HTML-parsed
      const extra: ExtraInfo = {
        ...current.extra,
        reqs: current.extra?.reqs ?? [],
        about: {
          description: data.short_description ?? '',
          shortDescription: data.short_description ?? ''
        },
        genres: (data.genres ?? []).map(
          (g: { id: string; description: string }) => g.description
        )
      }

      const updated: GameInfo = {
        ...current,
        title: data.name ?? current.title,
        art_cover,
        art_square,
        extra
      }

      // Persist metadata for next session (D-05, indefinite cache)
      steamMetadataStore.set(this.appId, { art_cover, art_square, extra })

      // Update in-memory library so subsequent getGameInfo calls return enriched data
      library.set(this.appId, updated)

      // Push enriched entry to frontend — GameCard re-renders with real art + title
      sendFrontendMessage('pushGameToLibrary', updated)
    } catch (err) {
      logWarning(
        [`Steam metadata fetch failed for appId ${this.appId}:`, err],
        LogPrefix.Steam
      )
    } finally {
      pendingFetches.delete(this.appId)
    }
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
