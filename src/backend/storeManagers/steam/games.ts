import axios from 'axios'
import { shell } from 'electron'
import { existsSync } from 'graceful-fs'
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
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { getFileSize } from 'backend/utils'
import type LogWriter from 'backend/logger/log_writer'
import { GameConfig } from 'backend/game_config'
import { sendFrontendMessage } from '../../ipc'
import { steamMetadataStore } from './electronStores'
import { library, pendingFetches } from './state'
import { startInstallPolling, startUninstallPolling } from './library'

const STEAM_CDN_BASE = 'https://cdn.cloudflare.steamstatic.com/steam/apps'
const STEAM_STORE_API = 'https://store.steampowered.com/api/appdetails'

/**
 * Build a validated steam:// protocol URL.
 *
 * Returns the URL only when appId is a pure decimal integer string (/^\d+$/).
 * Non-numeric appIds (injected strings, path traversal, shell metacharacters)
 * are rejected here — this is the single chokepoint that mitigates appId
 * injection into steam:// URLs (threat T-03-01).
 *
 * Reused by install/uninstall (plan 03-02) for the same guard.
 */
export function buildSteamProtocolUrl(
  verb: 'rungameid' | 'install' | 'uninstall',
  appId: string
): string | null {
  if (!/^\d+$/.test(appId)) {
    logWarning(
      `SteamGame: rejected non-numeric appId "${appId}" — not constructing steam:// URL (T-03-01)`,
      LogPrefix.Steam
    )
    return null
  }
  return `steam://${verb}/${appId}`
}

/**
 * Parse a storage size from the Steam store appdetails `pc_requirements.minimum`
 * HTML string (e.g. "<li><strong>Storage:</strong> 15 GB available space</li>").
 *
 * The raw HTML is never eval'd or rendered to the DOM — a bounded regex extracts
 * only the numeric size and unit (T-06-02 mitigation).
 *
 * Returns the byte count (Math.round) or undefined when no figure is found.
 */
export function parseSteamStorageRequirement(
  htmlText: string | undefined
): number | undefined {
  if (!htmlText || typeof htmlText !== 'string') return undefined
  // Matches: "15 GB available space", "512 MB available space", "1.5 TB available space"
  const match = htmlText.match(
    /(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)\s+available\s+space/i
  )
  if (!match) return undefined
  const value = parseFloat(match[1])
  const unit = match[2].toUpperCase()
  const multipliers: Record<string, number> = {
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4
  }
  return Math.round(value * (multipliers[unit] ?? 1))
}

/**
 * Returns a human-readable install size string for a Steam game.
 *
 * Fast path (no network): if the game is already installed and `install_size`
 * is present in GameInfo, parse and return it via getFileSize.
 *
 * Pre-install estimate: call the public Steam store appdetails API, parse
 * the `pc_requirements.minimum` HTML for a storage figure, and return it via
 * getFileSize. Falls back to '?? MB' when no figure is obtainable (D-03).
 *
 * appId is guarded with /^\d+$/ before any network request (T-06-01).
 */
export async function getSteamInstallSize(
  appId: string,
  gameInfo?: GameInfo
): Promise<string> {
  // Fast path: already installed — use the ACF-verified size, no network needed
  if (gameInfo?.is_installed && gameInfo?.install?.install_size) {
    const bytes = parseInt(gameInfo.install.install_size, 10)
    if (!isNaN(bytes) && bytes > 0) return getFileSize(bytes)
  }

  // Guard: non-numeric appId rejected before constructing any URL (T-06-01)
  if (!/^\d+$/.test(appId)) {
    logWarning(
      `getSteamInstallSize: rejected non-numeric appId "${appId}" (T-06-01)`,
      LogPrefix.Steam
    )
    return '?? MB'
  }

  // Pre-install estimate: parse storage requirement from store API
  try {
    const resp = await axios.get(`${STEAM_STORE_API}?appids=${appId}`)
    const data = resp.data?.[appId]?.data
    // Guard: pc_requirements may be [] for F2P/DLC/tool apps (Pitfall 5)
    const minHtml = data?.pc_requirements?.minimum
    const bytes = parseSteamStorageRequirement(minHtml)
    if (bytes && bytes > 0) return getFileSize(bytes)
  } catch (err) {
    logWarning(
      [`getSteamInstallSize: store API fetch failed for appId ${appId}:`, err],
      LogPrefix.Steam
    )
  }

  return '?? MB'
}

export default class SteamGame implements Game {
  private readonly appId: string

  constructor(appId: string) {
    this.appId = appId
  }

  /**
   * Returns the Heroic GameConfig defaults for this game.
   * autoSyncSaves resolves false by default — Steam Cloud is Steam-managed;
   * launcher.ts:151 skips syncSaves when autoSyncSaves is false.
   * Analog: nile/games.ts lines 65-68.
   */
  async getSettings(): Promise<GameSettings> {
    const gameConfig = GameConfig.get(this.appId)
    return gameConfig.config || (await gameConfig.getSettings())
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
      // Portrait library capsule (2:3) — matches the portrait game tile. The
      // landscape capsule_616x353 only filled a cropped center strip of the tile.
      const art_square = `${artBase}/library_600x900.jpg`

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

  /**
   * Returns the in-memory GameInfo.extra (populated by fetchMetadataIfNeeded)
   * or a safe default when extra is absent.
   * Analog: nile/games.ts lines 95-107.
   */
  async getExtraInfo(): Promise<ExtraInfo> {
    const info = this.getGameInfo()
    return (
      info.extra ?? {
        reqs: [],
        about: { description: '', shortDescription: '' }
      }
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

  /**
   * Delegates install to the Steam client via the steam://install protocol.
   * The appId is validated by buildSteamProtocolUrl (T-03-01 mitigation) before
   * any URL is constructed.
   *
   * Does NOT call sendProgressUpdate — Steam owns the download with its own UI.
   * Install state is never optimistically flipped on click (D-02); badge
   * reconciliation happens when the user tabs back (focus → ACF re-read, D-01).
   */
  async install(_args: InstallArgs): Promise<InstallResult> {
    const url = buildSteamProtocolUrl('install', this.appId)
    if (!url) {
      return { status: 'error', error: `Invalid appId: ${this.appId}` }
    }

    logInfo(
      `SteamGame: delegating install for appId ${this.appId} via ${url}`,
      LogPrefix.Steam
    )
    await shell.openExternal(url)

    // Start ACF polling so the install progress and completion are surfaced
    // in GamerLib without requiring a focus round-trip (D-07). The poller
    // sends 'installing' / 'done' status updates to the frontend and flips
    // the badge when StateFlags bit 4 is set. Install state is never
    // optimistically flipped here (D-02) — only ACF confirms.
    startInstallPolling(this.appId)

    return { status: 'done' }
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

  /**
   * Delegates launching to the Steam client via the steam://rungameid protocol.
   * The appId is validated by buildSteamProtocolUrl (T-03-01 mitigation) before
   * any URL is constructed or passed to shell.openExternal.
   *
   * isNative() returns true, so launcher.ts skips checkWineBeforeLaunch —
   * Proton selection is fully delegated to Steam (GAME-04 / D-06).
   *
   * Does NOT call sendGameStatusUpdate — Steam client owns the 'playing' state.
   */
  async launch(
    _logWriter: LogWriter,
    _launchArguments?: LaunchOption,
    _args?: string[],
    _skipVersionCheck?: boolean
  ): Promise<boolean> {
    const url = buildSteamProtocolUrl('rungameid', this.appId)
    if (!url) {
      // Non-numeric appId — rejection already logged by buildSteamProtocolUrl
      return false
    }

    logInfo(
      `SteamGame: launching appId ${this.appId} via ${url}`,
      LogPrefix.Steam
    )
    await shell.openExternal(url)
    return true
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

  /**
   * Delegates uninstall to the Steam client via the steam://uninstall protocol.
   * The appId is validated by buildSteamProtocolUrl (T-03-01 mitigation).
   *
   * Does NOT show a GamerLib confirmation dialog — Steam owns its own confirm
   * dialog (D-05). Install state is never optimistically flipped from a click
   * (D-02); badges flip only after confirmed ACF data. After the URL fires we
   * poll the ACF (D-07) so the badge updates to not-installed without a focus
   * round-trip; the focus re-read (D-01) remains as a backstop.
   */
  async uninstall(_args: RemoveArgs): Promise<ExecResult> {
    const url = buildSteamProtocolUrl('uninstall', this.appId)
    if (!url) {
      return { stdout: '', stderr: `Invalid appId: ${this.appId}` }
    }

    logInfo(
      `SteamGame: delegating uninstall for appId ${this.appId} via ${url}`,
      LogPrefix.Steam
    )
    await shell.openExternal(url)

    // Poll ACF so the badge flips to not-installed when Steam removes the
    // appmanifest, without requiring a focus round-trip (D-07). Symmetric to
    // install polling. State is never optimistically flipped here (D-02).
    startUninstallPolling(this.appId)

    return { stdout: '', stderr: '' }
  }

  async update(): Promise<InstallResult> {
    logWarning(
      `SteamGame.update not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
    return { status: 'error', error: 'Steam library not implemented until Phase 2' }
  }

  /**
   * Force-removes the game from the in-memory library Map and notifies the
   * frontend to update its install badge immediately (is_installed: false).
   * This is for cases where Steam's own uninstall dialog has already completed
   * but the in-memory state has not been reconciled via the focus ACF re-read.
   * Analog: gog/games.ts lines 1282-1288.
   */
  async forceUninstall(): Promise<void> {
    const info = this.getGameInfo()
    library.delete(this.appId)
    sendFrontendMessage('pushGameToLibrary', { ...info, is_installed: false })
    logInfo(
      `SteamGame: force-uninstalled appId ${this.appId} from in-memory library`,
      LogPrefix.Steam
    )
  }

  /**
   * No-op — Steam owns the process lifecycle for its games.
   * GamerLib cannot observe or terminate Steam game processes.
   * Analog: gog/games.ts lines 1291-1295.
   */
  async stop(_stopWine?: boolean): Promise<void> {
    logWarning(
      `SteamGame.stop: Steam owns process lifecycle for appId ${this.appId}; no-op`,
      LogPrefix.Steam
    )
  }

  /**
   * Checks if the game is installed and its install_path exists on disk.
   * Uses existsSync from graceful-fs (same as nile/gog analogs).
   * Analog: nile/games.ts lines 570-580, gog/games.ts lines 1298-1313.
   */
  async isGameAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const info = this.getGameInfo()
      resolve(
        Boolean(
          info?.is_installed &&
            info.install?.install_path &&
            existsSync(info.install.install_path)
        )
      )
    })
  }
}
