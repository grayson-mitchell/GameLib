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
import { isMac } from 'backend/constants/environment'
import { sendFrontendMessage } from '../../ipc'
import { steamMetadataStore } from './electronStores'
import {
  library,
  pendingFetches,
  acquireMetadataSlot,
  releaseMetadataSlot,
  METADATA_FETCH_TIMEOUT_MS
} from './state'
import { startInstallPolling, startUninstallPolling } from './library'
import {
  isBottleReady,
  tellBottledSteamToInstall,
  tellBottledSteamToLaunch,
  tellBottledSteamToUninstall,
  getSteamBottleSettings
} from './bottle'

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
 * Fast path (no network): if the game is already installed, `install_size`
 * is already a `getFileSize`-formatted string (persisted that way by
 * library.ts) — return it directly, no parse.
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
  // Fast path: already installed — install_size is already formatted, return
  // it directly (no parse, no network needed)
  if (gameInfo?.is_installed && gameInfo?.install?.install_size) {
    return gameInfo.install.install_size
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
   *
   * D-11/Phase 17: a confirmed-not-native macOS game resolves the dedicated
   * bottle's GameSettings (getSteamBottleSettings) instead of an empty
   * per-appId GameConfig — launcher.ts's pre-launch checkWineBeforeLaunch
   * (which now runs for these games since isNative() is false) must see the
   * bottle's real wineVersion/wineCrossoverBottle, not an empty config.
   */
  async getSettings(): Promise<GameSettings> {
    if (this.isBottleEligible()) {
      return getSteamBottleSettings()
    }
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

    // Trigger lazy metadata fetch as fire-and-forget side effect (D-04).
    // Also self-heal games cached before DETAIL-01 shipped: their art_cover is
    // populated (so the original guard skipped the fetch) but their platform
    // support was never captured. Re-fetch once when platformsCaptured is not yet
    // true — excluding delisted games, whose terminal branch returns before
    // capturing platforms (avoids a re-fetch loop). fetchMetadataIfNeeded's
    // pendingFetches dedup (T-2-03) absorbs repeated calls while a fetch is in flight.
    const cached = steamMetadataStore.get(this.appId)
    const platformsNeverCaptured =
      !existing.is_delisted && cached?.platformsCaptured !== true
    if (!existing.art_cover || platformsNeverCaptured) {
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
    // Notify the frontend a background metadata/art sync is starting (the first
    // pending fetch flips the indicator on; the last one flips it off below).
    if (pendingFetches.size === 0) {
      sendFrontendMessage('steamMetadataSyncing', { syncing: true })
    }
    pendingFetches.add(this.appId)

    // Throttle: wait for a concurrency slot so a cold cache doesn't open
    // hundreds of parallel Steam CDN connections at once (mass ETIMEDOUT).
    await acquireMetadataSlot()

    try {
      const resp = await axios.get(`${STEAM_STORE_API}?appids=${this.appId}`, {
        timeout: METADATA_FETCH_TIMEOUT_MS
      })

      const entry = resp.data?.[this.appId]
      const data = entry?.data

      if (entry?.success === false) {
        // GAP-B: Definitive verdict — Steam says this app no longer exists (delisted).
        // Persist the flag without wiping cached art/extra so the entry can be reverted
        // if Steam re-lists the app. Push the updated GameInfo so the frontend drops it live.
        const delistedInfo: GameInfo = { ...current, is_delisted: true }
        const existing = steamMetadataStore.get(this.appId)
        steamMetadataStore.set(this.appId, {
          ...(existing ?? { art_cover: '', art_square: '', extra: { reqs: [] } }),
          is_delisted: delistedInfo.is_delisted
        })
        library.set(this.appId, delistedInfo)
        sendFrontendMessage('pushGameToLibrary', delistedInfo)
        return
      }

      if (!data) {
        // Ambiguous / empty envelope — treat as transient (network, rate-limit).
        // MUST NOT set is_delisted here; a network blip must not hide owned games.
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

      // DETAIL-01: capture native platform support from appdetails.
      // Windows is the implicit baseline (no GameInfo flag); only mac/linux
      // native support is recorded onto the generic platform flags.
      const is_mac_native = !!data.platforms?.mac
      const is_linux_native = !!data.platforms?.linux

      const updated: GameInfo = {
        ...current,
        title: data.name ?? current.title,
        art_cover,
        art_square,
        is_mac_native,
        is_linux_native,
        // GAP-B: clear any stale delisted flag — the app is available again.
        is_delisted: false,
        extra
      }

      // Persist metadata for next session (D-05, indefinite cache).
      // platformsCaptured:true records that appdetails `platforms` was read, so
      // getGameInfo won't re-fetch this game again for platform data (self-heal once).
      steamMetadataStore.set(this.appId, {
        art_cover,
        art_square,
        extra,
        is_mac_native,
        is_linux_native,
        is_delisted: false,
        platformsCaptured: true
      })

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
      releaseMetadataSlot()
      pendingFetches.delete(this.appId)
      // Last pending fetch drained — turn the sync indicator off.
      if (pendingFetches.size === 0) {
        sendFrontendMessage('steamMetadataSyncing', { syncing: false })
      }
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
   *
   * Phase 17 (D-10/D-11): a confirmed-not-native macOS game routes through the
   * bottled Steam client instead of native steam:// — see isBottleEligible().
   */
  async install(_args: InstallArgs): Promise<InstallResult> {
    if (this.isBottleEligible()) {
      if (!isBottleReady()) {
        logInfo(
          `SteamGame: appId ${this.appId} is bottle-eligible but the bottle is not yet provisioned — requesting guided setup instead of installing`,
          LogPrefix.Steam
        )
        sendFrontendMessage('steamBottleSetupRequired', {
          appName: this.appId
        })
        // Nothing was installed and no ACF poller starts here — flag the
        // deferral so the DownloadManager clears the transient 'installing'
        // badge instead of leaving the game stuck "installing" (the guided
        // setup, or the user's "Not now", owns what happens next).
        return { status: 'done', deferredToSetup: true }
      }

      logInfo(
        `SteamGame: delegating install for appId ${this.appId} via the bottled Steam client`,
        LogPrefix.Steam
      )
      const result = await tellBottledSteamToInstall(this.appId)

      // Start bottle-scoped ACF polling (D-07) — the bottle's own steamapps
      // root is distinct from the native root (RESEARCH.md Pitfall 2).
      startInstallPolling(this.appId, { source: 'bottle' })

      return result.status === 'done'
        ? { status: 'done' }
        : { status: 'error', error: result.error }
    }

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

  /**
   * Per-OS confirmed-not-native check (D-11).
   *
   * Non-macOS (Linux/Windows) always returns true — those platforms keep the
   * native steam:// delegation unchanged; Proton is Steam's own concern.
   *
   * On macOS, returns true (native path) UNLESS the game has been CONFIRMED
   * not-native via a completed appdetails fetch: `platformsCaptured === true`
   * (a lazy-fetch has actually recorded platform data) AND `is_mac_native ===
   * false`. A never-synced entry defaults `is_mac_native` to false in
   * library.ts (D-11 nuance), which is ambiguous on its own — requiring
   * platformsCaptured===true prevents a freshly-synced game (whose real
   * platform support isn't known yet) from being misrouted into the bottle.
   */
  isNative(): boolean {
    return !this.isBottleEligible()
  }

  /**
   * True only for a CONFIRMED not-native macOS game (D-11) — the single
   * source of truth for whether install/launch/uninstall should route through
   * the bottled Steam client instead of the native steam:// path. Reused by
   * isNative() here; Phase 17 Plan 05 Task 2 also reuses it from
   * getSettings(), install(), launch(), and uninstall().
   */
  private isBottleEligible(): boolean {
    if (!isMac) return false
    const meta = steamMetadataStore.get(this.appId)
    return meta?.platformsCaptured === true && meta?.is_mac_native === false
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
   * isNative() returns true for non-eligible games, so launcher.ts skips
   * checkWineBeforeLaunch — Proton selection is fully delegated to Steam
   * (GAME-04 / D-06). For a bottle-eligible confirmed-not-native macOS game
   * (D-10/D-11), isNative() is false, so launcher.ts's launchEventCallback
   * runs checkWineBeforeLaunch BEFORE calling this method (using the
   * getSteamBottleSettings() result from getSettings()) — this method then
   * dispatches the actual launch to the bottled Steam client.
   *
   * Does NOT call sendGameStatusUpdate — Steam client owns the 'playing' state.
   */
  async launch(
    _logWriter: LogWriter,
    _launchArguments?: LaunchOption,
    _args?: string[],
    _skipVersionCheck?: boolean
  ): Promise<boolean> {
    if (this.isBottleEligible()) {
      if (!isBottleReady()) {
        logInfo(
          `SteamGame: appId ${this.appId} is bottle-eligible but the bottle is not yet provisioned — requesting guided setup instead of launching`,
          LogPrefix.Steam
        )
        sendFrontendMessage('steamBottleSetupRequired', {
          appName: this.appId
        })
        return false
      }

      logInfo(
        `SteamGame: launching appId ${this.appId} via the bottled Steam client`,
        LogPrefix.Steam
      )
      const result = await tellBottledSteamToLaunch(this.appId)
      return result.status === 'done'
    }

    const url = buildSteamProtocolUrl('rungameid', this.appId)
    if (!url) {
      // Non-numeric appId — rejection already logged by buildSteamProtocolUrl
      return false
    }

    logInfo(
      `SteamGame: launching appId ${this.appId} via ${url}`,
      LogPrefix.Steam
    )
    // Hand the steam:// URL to the Steam client WITHOUT bringing it to the
    // foreground (macOS/Windows). Activating Steam is what forces macOS to leave
    // GameLib's fullscreen Space (Console mode), causing a visible desktop-Space
    // flash before the game appears. With activate:false, Steam processes
    // rungameid in the background and the only Space switch is directly to the
    // game's own window. Ignored on Linux (no effect on Steam Deck game mode).
    await shell.openExternal(url, { activate: false })
    return true
  }

  async moveInstall(_newInstallPath: string): Promise<InstallResult> {
    logWarning(
      `SteamGame.moveInstall not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: 'Steam library not implemented until Phase 2'
    }
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
    if (this.isBottleEligible()) {
      if (!isBottleReady()) {
        logInfo(
          `SteamGame: appId ${this.appId} is bottle-eligible but the bottle is not yet provisioned — requesting guided setup instead of uninstalling`,
          LogPrefix.Steam
        )
        sendFrontendMessage('steamBottleSetupRequired', {
          appName: this.appId
        })
        return { stdout: '', stderr: '' }
      }

      logInfo(
        `SteamGame: delegating uninstall for appId ${this.appId} via the bottled Steam client`,
        LogPrefix.Steam
      )
      const result = await tellBottledSteamToUninstall(this.appId)

      // Bottle-scoped ACF polling (D-07) — distinct root from the native scan.
      startUninstallPolling(this.appId, { source: 'bottle' })

      return { stdout: '', stderr: result.error ?? '' }
    }

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
    return {
      status: 'error',
      error: 'Steam library not implemented until Phase 2'
    }
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
      // LIB-07: delisted game is non-available regardless of install state
      if (info?.is_delisted) {
        return resolve(false)
      }
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
