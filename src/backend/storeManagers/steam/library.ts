import {
  GameInfo,
  ExecResult,
  InstallPlatform,
  InstallInfo,
  LaunchOption
} from 'common/types'
import { LibraryManager } from 'common/types/game_manager'
import { logInfo, logError, logWarning, LogPrefix } from 'backend/logger'
import { join } from 'path'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import { parse } from '@node-steam/vdf'
import { getSteamLibraries } from 'backend/utils'
import { sendFrontendMessage } from '../../ipc'
import { notify } from '../../dialog/dialog'
import i18next from 'i18next'
import { SteamUser } from './user'
import {
  steamLibraryStore,
  steamMetadataStore,
  steamSyncStore
} from './electronStores'
import { runOnceWhenOnline } from 'backend/online_monitor'
import { library } from './state'
import SteamGame from './games'

export default class SteamLibraryManager implements LibraryManager {
  /**
   * On startup: load the cached library immediately, resume any in-progress
   * install polls (D-07), then trigger a background sync when online and
   * logged in (D-01 / D-09).
   */
  async init(): Promise<void> {
    // One-time migration: portrait library capsule replaced the cropped
    // landscape capsule. Rewrite any stale art URLs already in the caches so
    // existing libraries pick up the new art without a manual cache clear.
    this.migrateStaleArtUrls()

    const cached = steamLibraryStore.get('games', [])
    if (cached.length) {
      library.clear()
      cached.forEach((g) => {
        library.set(g.app_name, g)
        sendFrontendMessage('pushGameToLibrary', g)
      })
      logInfo(
        `Steam: loaded ${cached.length} games from cache`,
        LogPrefix.Steam
      )
    }

    // Resume polling for any in-progress downloads detected on disk (D-07).
    // Wrapped in try/catch so a scan failure never blocks startup.
    try {
      const downloadingIds = await scanDownloadingAppIds()
      for (const appId of downloadingIds) {
        logInfo(
          `Steam: resuming install poll for appId ${appId} (download in progress on startup)`,
          LogPrefix.Steam
        )
        startInstallPolling(appId)
      }
    } catch (err) {
      logWarning(
        [
          'Steam: scanDownloadingAppIds failed during init, skipping resume:',
          err
        ],
        LogPrefix.Steam
      )
    }

    // Background sync once per session (D-01 / D-03)
    if (SteamUser.isLoggedIn()) {
      runOnceWhenOnline(() => this.refresh())
    }
  }

  getGame(id: string): SteamGame {
    return new SteamGame(id)
  }

  /**
   * Rewrite cached `art_square` URLs from the old landscape capsule
   * (capsule_616x353) to the portrait library capsule (library_600x900) in both
   * the per-game metadata cache and the persisted library list. Idempotent — a
   * no-op once every entry has been migrated. Done in place so games keep their
   * art (the new URL resolves for the same appId) with no blank-art flash.
   */
  private migrateStaleArtUrls(): void {
    const OLD_ART = 'capsule_616x353.jpg'
    const NEW_ART = 'library_600x900.jpg'

    // Per-game metadata cache (refresh() rebuilds art_square from here, so this
    // must be fixed or the next sync would re-apply the old URL).
    for (const [appId, meta] of steamMetadataStore.entries()) {
      if (meta?.art_square?.includes(OLD_ART)) {
        steamMetadataStore.set(appId, {
          ...meta,
          art_square: meta.art_square.replace(OLD_ART, NEW_ART)
        })
      }
    }

    // Persisted library list (what init() loads and pushes to the frontend).
    const games = steamLibraryStore.get('games', [])
    let changed = false
    const migrated = games.map((game) => {
      if (game.art_square?.includes(OLD_ART)) {
        changed = true
        return {
          ...game,
          art_square: game.art_square.replace(OLD_ART, NEW_ART)
        }
      }
      return game
    })
    if (changed) {
      steamLibraryStore.set('games', migrated)
      logInfo(
        `Steam: migrated ${migrated.filter((g) => g.art_square.includes(NEW_ART)).length} cached cover URLs to portrait art`,
        LogPrefix.Steam
      )
    }
  }

  /**
   * Fetch the full owned game list + playtime from Steam CM, merge local ACF
   * install state, push each game to the frontend, persist the list and sync
   * timestamp.  Falls back to the cached library if the CM call fails (D-09).
   */
  async refresh(): Promise<ExecResult | null> {
    // The steam-user client is in-memory and dies on app restart — reconnect
    // from the persisted refresh token before syncing.
    const connected = await SteamUser.ensureConnected()
    const client = SteamUser.getClient()
    if (!connected || !client || !client.steamID) {
      logWarning(
        'Steam client not ready, skipping library refresh',
        LogPrefix.Steam
      )
      return null
    }

    // ── Step 1: fetch owned games + playtime from Steam CM ────────────────
    let ownedApps: Array<{
      appid: number
      name: string
      playtime_forever: number
      img_icon_url?: string
      /** Unix seconds — exists at runtime in CPlayer_GetOwnedGames_Response_Game but omitted from @types/steam-user */
      rtime_last_played?: number
    }> = []
    try {
      const result = await client.getUserOwnedApps(client.steamID, {
        includePlayedFreeGames: true
      })
      ownedApps = result.apps
      logInfo(`Steam: fetched ${ownedApps.length} owned games`, LogPrefix.Steam)
    } catch (err) {
      logError(['Steam getUserOwnedApps failed:', err], LogPrefix.Steam)
      // Offline / CM-unreachable fallback — serve cached library (D-09)
      const cached = steamLibraryStore.get('games', [])
      cached.forEach((g) => sendFrontendMessage('pushGameToLibrary', g))
      return { stdout: '', stderr: String(err) }
    }

    // ── Step 2: build install-state map from ACF manifests on disk ────────
    const installedMap = await buildInstalledMap()

    // ── Step 3: build and push one GameInfo per owned game ────────────────
    library.clear()
    for (const app of ownedApps) {
      const appIdStr = String(app.appid)
      const installedData = installedMap.get(app.appid)
      const cachedMeta = steamMetadataStore.get(appIdStr)

      const gameInfo: GameInfo = {
        runner: 'steam',
        app_name: appIdStr,
        title: app.name,
        // Seed artwork from metadata cache so previously fetched art survives resync
        art_cover: cachedMeta?.art_cover ?? '',
        art_square: cachedMeta?.art_square ?? '',
        is_installed: !!installedData,
        install: installedData
          ? {
              install_path: installedData.installPath,
              install_size: installedData.sizeOnDisk,
              platform: 'Windows' as const
            }
          : {},
        extra: {
          reqs: [],
          // cachedMeta.extra preserves about/genres/art metadata from prior fetches.
          // Playtime and last-played must reflect the latest sync (fresh wins over stale),
          // so dynamic Steam fields are placed AFTER the spread to override any cached values.
          ...(cachedMeta?.extra ?? {}),
          steamPlaytimeMinutes: app.playtime_forever,
          steamLastPlayed: app.rtime_last_played ?? 0
        },
        canRunOffline: true,
        installable: true,
        store_url: `https://store.steampowered.com/app/${app.appid}/`
      }

      library.set(appIdStr, gameInfo)
      sendFrontendMessage('pushGameToLibrary', gameInfo)
    }

    // ── Step 4: persist library list and sync timestamp ───────────────────
    steamLibraryStore.set('games', Array.from(library.values()))
    steamSyncStore.set('syncedAt', Date.now())
    logInfo(
      `Steam library sync complete: ${library.size} games`,
      LogPrefix.Steam
    )
    return { stdout: `${library.size} games synced`, stderr: '' }
  }

  /**
   * Returns the GameInfo for a given appName.  Delegates to SteamGame so that
   * the lazy metadata fetch (artwork, description, genres — LIB-04) is
   * triggered regardless of whether callers use the library manager or the
   * per-game entry point.  Falls back to the persisted library cache when the
   * in-memory Map has not been populated yet (e.g. before init() fires).
   */
  getGameInfo(appName: string, _forceReload?: boolean): GameInfo | undefined {
    // Delegate to SteamGame — reads shared library Map and fires lazy fetch
    // (fetchMetadataIfNeeded) when art_cover is empty (plan 02-03)
    const fromGame = new SteamGame(appName).getGameInfo()
    if (fromGame.app_name) return fromGame

    // Fallback: consult persistent cache (useful if init() hasn't fired yet)
    const cached = steamLibraryStore.get('games', [])
    return cached.find((g) => g.app_name === appName)
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
    // Phase 3: install operations
  }

  changeVersionPinnedStatus(_appName: string, _status: boolean): void {
    // Phase 3: install operations
  }

  /**
   * Steam install state is always derived from ACF on disk (D-10).
   * This method is intentionally a no-op — callers that need to reconcile
   * install badges should use refreshInstallState() instead.
   * The LibraryManager interface requires this method, but for Steam the
   * source of truth is always the ACF StateFlags bit 4, never a boolean flag.
   */
  installState(_appName: string, _state: boolean): void {
    // Intentional no-op: Steam install state derives from ACF (D-10).
    // Use refreshInstallState() to reconcile badges from live ACF data.
  }

  /**
   * Re-reads ACF manifests from disk via buildInstalledMap() and pushes
   * updated install badges to the frontend for any game whose is_installed
   * state actually changed since the last read.
   *
   * This is the D-01/D-02 reconciliation path:
   *  - D-01: triggered by BrowserWindow 'focus' (main.ts), not by polling.
   *  - D-02: badges flip only after confirmed ACF data; never optimistically
   *    from a click.
   *
   * Only games whose state changed are pushed (avoids flooding the frontend).
   * The GameInfo install shape matches refresh() when installed:
   *   install_path, install_size, platform: 'Windows'
   * and is set to {} when not installed.
   */
  async refreshInstallState(): Promise<void> {
    const installedMap = await buildInstalledMap()

    for (const [appIdStr, gameInfo] of library.entries()) {
      const appId = parseInt(appIdStr, 10)
      const installedData = installedMap.get(appId)
      const isNowInstalled = !!installedData

      if (gameInfo.is_installed !== isNowInstalled) {
        const updated: GameInfo = {
          ...gameInfo,
          is_installed: isNowInstalled,
          install: isNowInstalled
            ? {
                install_path: installedData.installPath,
                install_size: installedData.sizeOnDisk,
                platform: 'Windows' as const
              }
            : {}
        }
        library.set(appIdStr, updated)
        sendFrontendMessage('pushGameToLibrary', updated)
      }
    }
  }

  getLaunchOptions(_appName: string): LaunchOption[] {
    return []
  }
}

/**
 * Reads all Steam library paths and returns a Map from AppID (number) to
 * install data for games whose ACF StateFlags has bit 4 set
 * (0x4 = FullyInstalled). Skips missing directories and corrupt ACF files
 * without throwing (T-2-01 mitigation).
 *
 * Exported for unit testing.
 */
export async function buildInstalledMap(): Promise<
  Map<number, { installPath: string; sizeOnDisk: string }>
> {
  const installed = new Map<
    number,
    { installPath: string; sizeOnDisk: string }
  >()
  const libraryPaths = await getSteamLibraries()

  for (const libPath of libraryPaths) {
    const steamappsDir = join(libPath, 'steamapps')
    if (!existsSync(steamappsDir)) continue

    let files: string[]
    try {
      files = readdirSync(steamappsDir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue

      try {
        const content = readFileSync(join(steamappsDir, file), 'utf-8')
        const parsed = parse(content)
        const state = parsed?.AppState
        if (!state) continue

        const appid = parseInt(state.appid, 10)
        const stateFlags = parseInt(state.StateFlags, 10)
        // Bit 4 (0x4) = FullyInstalled — bitmask, NOT equality (Pitfall 6)
        const isInstalled = (stateFlags & 4) !== 0

        if (isInstalled && !isNaN(appid)) {
          installed.set(appid, {
            installPath: join(steamappsDir, 'common', state.installdir ?? ''),
            sizeOnDisk: state.SizeOnDisk ?? '0'
          })
        }
      } catch {
        /* skip corrupt ACF — T-2-01 mitigation */
      }
    }
  }

  return installed
}

// ── Install polling lifecycle (D-07) ─────────────────────────────────────────

/** Module-level registry of active install polls, keyed by appId string. */
const activePolls = new Map<
  string,
  { timer: NodeJS.Timeout; ticks: number; seenDownloading: boolean }
>()

const GRACE_TICKS = 20 // ≈60 s at 3 000 ms default interval — stop if no manifest appeared
const MAX_TICKS = 7200 // ≈6 h at 3 000 ms default interval — absolute safety cap

/**
 * Reads the install state of a single appId from its ACF manifest.
 *
 * - 'installed':   manifest present and StateFlags bit 4 set (FullyInstalled)
 * - 'downloading': manifest present but bit 4 unset (download in flight)
 * - 'absent':      no manifest found for this appId in any library path
 *
 * Corrupt/unreadable manifests are skipped without throwing (T-2-01).
 * Exported for unit testing.
 */
export async function readAcfState(appId: string): Promise<{
  state: 'absent' | 'downloading' | 'installed'
  stateFlags?: number
  installPath?: string
  sizeOnDisk?: string
}> {
  const libraryPaths = await getSteamLibraries()

  for (const libPath of libraryPaths) {
    const steamappsDir = join(libPath, 'steamapps')
    if (!existsSync(steamappsDir)) continue

    const manifestFile = join(steamappsDir, `appmanifest_${appId}.acf`)
    if (!existsSync(manifestFile)) continue

    try {
      const content = readFileSync(manifestFile, 'utf-8')
      const parsed = parse(content)
      const state = parsed?.AppState
      if (!state) continue

      const stateFlags = parseInt(state.StateFlags, 10)
      if ((stateFlags & 4) !== 0) {
        return {
          state: 'installed',
          stateFlags,
          installPath: join(steamappsDir, 'common', state.installdir ?? ''),
          sizeOnDisk: state.SizeOnDisk ?? '0'
        }
      }
      return { state: 'downloading', stateFlags }
    } catch {
      continue // skip corrupt ACF (T-2-01)
    }
  }

  return { state: 'absent' }
}

/**
 * Executes one polling tick for appId:
 *   'downloading' → updates seenDownloading flag, sends gameStatusUpdate { status: 'installing' }
 *   'installed'   → updates library entry, sends pushGameToLibrary +
 *                   gameStatusUpdate { status: 'done' }, stops the poll
 *   'absent'      → no-op (grace/cap logic lives in startInstallPolling's callback)
 *
 * Exported for unit testing.
 */
export async function pollInstallOnce(appId: string): Promise<void> {
  const result = await readAcfState(appId)
  const poll = activePolls.get(appId)

  if (result.state === 'downloading') {
    if (poll) poll.seenDownloading = true
    sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'installing'
    })
  } else if (result.state === 'installed') {
    const existing = library.get(appId)
    if (existing) {
      const updated: GameInfo = {
        ...existing,
        is_installed: true,
        install: {
          install_path: result.installPath!,
          install_size: result.sizeOnDisk!,
          platform: 'Windows' as const
        }
      }
      library.set(appId, updated)
      sendFrontendMessage('pushGameToLibrary', updated)
    }
    sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'done'
    })
    // GAME-02: fire the confirmed completion toast here (ACF state verified) so
    // the user gets exactly one "Installation Finished" notification per install.
    // The DM pipeline toast is suppressed for steam — this is the sole source.
    notify({
      title: existing?.title ?? '',
      body: i18next.t('notify.install.finished', 'Installation Finished')
    })
    stopInstallPolling(appId)
    logInfo(
      `Steam: install polling complete for appId ${appId} — badge flipped to installed`,
      LogPrefix.Steam
    )
  }
  // 'absent': no message — grace/cap logic is in startInstallPolling's setInterval callback
}

/**
 * Starts an ACF polling loop for appId. Idempotent — calling twice has no
 * effect. The loop calls pollInstallOnce every intervalMs (default 3 000 ms).
 *
 * Stops automatically when:
 *   - state becomes 'installed' (via pollInstallOnce → stopInstallPolling)
 *   - state has been 'absent' for GRACE_TICKS without ever seeing 'downloading'
 *     (user likely cancelled Steam's install dialog — T-03-06 mitigation)
 *   - MAX_TICKS elapsed (D-01 focus backstop takes over — T-03-06 mitigation)
 *
 * Exported for unit testing.
 */
export function startInstallPolling(appId: string, intervalMs = 3000): void {
  if (activePolls.has(appId)) return // idempotent

  logInfo(
    `Steam: starting install polling for appId ${appId} (interval ${intervalMs}ms)`,
    LogPrefix.Steam
  )

  const entry = {
    timer: null as unknown as NodeJS.Timeout,
    ticks: 0,
    seenDownloading: false
  }

  const timer = setInterval(async () => {
    entry.ticks++

    // Absolute safety cap — stop after MAX_TICKS and rely on the D-01 focus backstop
    if (entry.ticks >= MAX_TICKS) {
      logWarning(
        `Steam: install polling for appId ${appId} hit safety cap (${MAX_TICKS} ticks); relying on D-01 focus backstop`,
        LogPrefix.Steam
      )
      stopInstallPolling(appId)
      return
    }

    await pollInstallOnce(appId)

    // pollInstallOnce may have stopped the poll (state became 'installed')
    if (!activePolls.has(appId)) return

    // Grace window: if no manifest ever appeared after GRACE_TICKS, the user
    // probably cancelled Steam's install dialog — stop to avoid endless polling
    if (!entry.seenDownloading && entry.ticks >= GRACE_TICKS) {
      logWarning(
        `Steam: install polling for appId ${appId} stopped after grace window (${GRACE_TICKS} ticks) — no manifest detected; user may have cancelled`,
        LogPrefix.Steam
      )
      stopInstallPolling(appId)
    }
  }, intervalMs)

  entry.timer = timer
  activePolls.set(appId, entry)
}

/**
 * Stops the active polling loop for appId (clears the interval and removes the
 * activePolls entry). Safe to call when no poll is active (no-op).
 *
 * Exported for unit testing.
 */
export function stopInstallPolling(appId: string): void {
  const poll = activePolls.get(appId)
  if (!poll) return
  clearInterval(poll.timer)
  activePolls.delete(appId)
  logInfo(`Steam: stopped install polling for appId ${appId}`, LogPrefix.Steam)
}

// ── Uninstall polling lifecycle (D-07, symmetric to install) ─────────────────

/** Module-level registry of active uninstall polls, keyed by appId string. */
const activeUninstallPolls = new Map<
  string,
  { timer: NodeJS.Timeout; ticks: number; seenUninstalling: boolean }
>()

/** Steam EAppState bit 0x800 (2048) = actively uninstalling. */
const STATE_UNINSTALLING = 2048

/**
 * Executes one uninstall polling tick for appId:
 *   'absent'  → manifest gone = uninstall complete: flip the library entry to
 *               not-installed, send pushGameToLibrary + gameStatusUpdate { done },
 *               and stop the poll.
 *   present   → still on disk: if actively uninstalling (StateFlags bit 0x800 set,
 *               or bit 4 cleared mid-removal) send gameStatusUpdate { uninstalling }.
 *               A plain installed manifest (no 0x800) means uninstall hasn't started
 *               or was cancelled — handled by the grace logic in startUninstallPolling.
 *
 * Install state is never optimistically flipped (D-02) — only an absent manifest
 * (confirmed removal) flips the badge. Exported for unit testing.
 */
export async function pollUninstallOnce(appId: string): Promise<void> {
  const result = await readAcfState(appId)
  const poll = activeUninstallPolls.get(appId)

  if (result.state === 'absent') {
    const existing = library.get(appId)
    if (existing) {
      const updated: GameInfo = {
        ...existing,
        is_installed: false,
        install: {}
      }
      library.set(appId, updated)
      sendFrontendMessage('pushGameToLibrary', updated)
    }
    sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'done'
    })
    // GAME-03: fire the confirmed completion toast here (manifest confirmed absent) so
    // the user gets exactly one "Game Uninstalled" notification per uninstall.
    // The uninstaller callback toast is suppressed for steam — this is the sole source.
    notify({
      title: existing?.title ?? '',
      body: i18next.t('notify.uninstalled', 'Game Uninstalled')
    })
    stopUninstallPolling(appId)
    logInfo(
      `Steam: uninstall polling complete for appId ${appId} — badge flipped to not-installed`,
      LogPrefix.Steam
    )
    return
  }

  const uninstalling =
    result.state === 'downloading' ||
    ((result.stateFlags ?? 0) & STATE_UNINSTALLING) !== 0
  if (uninstalling) {
    if (poll) poll.seenUninstalling = true
    sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'uninstalling'
    })
  }
}

/**
 * Starts an ACF polling loop for an in-progress uninstall. Idempotent.
 *
 * Stops automatically when:
 *   - the manifest disappears (uninstall complete) via pollUninstallOnce
 *   - the game is still installed and no active uninstall was ever observed
 *     after GRACE_TICKS (user likely cancelled Steam's confirm dialog) — clears
 *     any transient status, leaving the badge installed
 *   - MAX_TICKS elapsed (D-01 focus backstop takes over — T-03-06 mitigation)
 *
 * Exported for unit testing.
 */
export function startUninstallPolling(appId: string, intervalMs = 3000): void {
  if (activeUninstallPolls.has(appId)) return // idempotent

  logInfo(
    `Steam: starting uninstall polling for appId ${appId} (interval ${intervalMs}ms)`,
    LogPrefix.Steam
  )

  const entry = {
    timer: null as unknown as NodeJS.Timeout,
    ticks: 0,
    seenUninstalling: false
  }

  const timer = setInterval(async () => {
    entry.ticks++

    // Absolute safety cap — stop after MAX_TICKS and rely on the D-01 focus backstop
    if (entry.ticks >= MAX_TICKS) {
      logWarning(
        `Steam: uninstall polling for appId ${appId} hit safety cap (${MAX_TICKS} ticks); relying on D-01 focus backstop`,
        LogPrefix.Steam
      )
      stopUninstallPolling(appId)
      return
    }

    await pollUninstallOnce(appId)

    // pollUninstallOnce may have stopped the poll (manifest absent = complete)
    if (!activeUninstallPolls.has(appId)) return

    // Cancellation/timeout: if no active uninstall was ever observed after the
    // grace window, the user probably cancelled Steam's confirm dialog — clear
    // any transient status and stop (badge stays installed).
    if (!entry.seenUninstalling && entry.ticks >= GRACE_TICKS) {
      logWarning(
        `Steam: uninstall polling for appId ${appId} stopped after grace window (${GRACE_TICKS} ticks) — no uninstall detected; user may have cancelled`,
        LogPrefix.Steam
      )
      sendFrontendMessage('gameStatusUpdate', {
        appName: appId,
        runner: 'steam',
        status: 'done'
      })
      stopUninstallPolling(appId)
    }
  }, intervalMs)

  entry.timer = timer
  activeUninstallPolls.set(appId, entry)
}

/**
 * Stops the active uninstall polling loop for appId (clears the interval and
 * removes the registry entry). Safe to call when no poll is active (no-op).
 *
 * Exported for unit testing.
 */
export function stopUninstallPolling(appId: string): void {
  const poll = activeUninstallPolls.get(appId)
  if (!poll) return
  clearInterval(poll.timer)
  activeUninstallPolls.delete(appId)
  logInfo(
    `Steam: stopped uninstall polling for appId ${appId}`,
    LogPrefix.Steam
  )
}

/**
 * Scans all Steam library paths for appmanifest_*.acf files whose StateFlags
 * has bit 4 UNSET (download in progress), and filters to those appIds that
 * are present in the in-memory library Map.
 *
 * Used by SteamLibraryManager.init() to resume polling after an app restart.
 * Exported for unit testing.
 */
export async function scanDownloadingAppIds(): Promise<string[]> {
  const libraryPaths = await getSteamLibraries()
  const downloadingIds: string[] = []

  for (const libPath of libraryPaths) {
    const steamappsDir = join(libPath, 'steamapps')
    if (!existsSync(steamappsDir)) continue

    let files: string[]
    try {
      files = readdirSync(steamappsDir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue

      try {
        const content = readFileSync(join(steamappsDir, file), 'utf-8')
        const parsed = parse(content)
        const state = parsed?.AppState
        if (!state) continue

        const appid = parseInt(state.appid, 10)
        if (isNaN(appid)) continue

        const appIdStr = String(appid)
        const stateFlags = parseInt(state.StateFlags, 10)
        // Bit 4 unset = not fully installed (download in progress or other non-installed state)
        if (
          !isNaN(stateFlags) &&
          (stateFlags & 4) === 0 &&
          library.has(appIdStr)
        ) {
          downloadingIds.push(appIdStr)
        }
      } catch {
        /* skip corrupt ACF */
      }
    }
  }

  return downloadingIds
}
