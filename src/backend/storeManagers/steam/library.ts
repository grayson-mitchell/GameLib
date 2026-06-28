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
   * On startup: load the cached library immediately (D-02) then trigger a
   * background sync when online and logged in (D-01 / D-09).
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
      logInfo(`Steam: loaded ${cached.length} games from cache`, LogPrefix.Steam)
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
        return { ...game, art_square: game.art_square.replace(OLD_ART, NEW_ART) }
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
      logWarning('Steam client not ready, skipping library refresh', LogPrefix.Steam)
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
      const result = await client.getUserOwnedApps(client.steamID!, {
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
    logInfo(`Steam library sync complete: ${library.size} games`, LogPrefix.Steam)
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
                install_path: installedData!.installPath,
                install_size: installedData!.sizeOnDisk,
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
  const installed = new Map<number, { installPath: string; sizeOnDisk: string }>()
  const libraryPaths = await getSteamLibraries()

  for (const libPath of libraryPaths) {
    const steamappsDir = join(libPath, 'steamapps')
    if (!existsSync(steamappsDir)) continue

    let files: string[]
    try {
      files = readdirSync(steamappsDir) as string[]
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue

      try {
        const content = readFileSync(join(steamappsDir, file), 'utf-8')
        const parsed = parse(content as string)
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
  installPath?: string
  sizeOnDisk?: string
}> {
  throw new Error('readAcfState: not implemented — GREEN phase')
}

/**
 * Executes one polling tick for appId:
 *   'downloading' → sends gameStatusUpdate { status: 'installing' }
 *   'installed'   → updates library entry, sends pushGameToLibrary +
 *                   gameStatusUpdate { status: 'done' }, stops the poll
 *   'absent'      → no-op (grace/cap logic lives in startInstallPolling's callback)
 *
 * Exported for unit testing.
 */
export async function pollInstallOnce(appId: string): Promise<void> {
  throw new Error('pollInstallOnce: not implemented — GREEN phase')
}

/**
 * Starts an ACF polling loop for appId. Idempotent — calling twice has no
 * effect. The loop calls pollInstallOnce every intervalMs (default 3 000 ms).
 *
 * Stops automatically when:
 *   - state becomes 'installed' (via pollInstallOnce)
 *   - state has been 'absent' for GRACE_TICKS without ever seeing 'downloading'
 *     (user likely cancelled Steam's install dialog)
 *   - MAX_TICKS elapsed (D-01 focus backstop takes over)
 *
 * Exported for unit testing.
 */
export function startInstallPolling(appId: string, intervalMs = 3000): void {
  throw new Error('startInstallPolling: not implemented — GREEN phase')
}

/**
 * Stops the active polling loop for appId (clears the interval and removes the
 * activePolls entry). Safe to call when no poll is active (no-op).
 *
 * Exported for unit testing.
 */
export function stopInstallPolling(appId: string): void {
  throw new Error('stopInstallPolling: not implemented — GREEN phase')
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
  throw new Error('scanDownloadingAppIds: not implemented — GREEN phase')
}
