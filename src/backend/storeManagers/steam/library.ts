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
          steamPlaytimeMinutes: app.playtime_forever,
          ...(cachedMeta?.extra ?? {})
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

  installState(_appName: string, _state: boolean): void {
    // Phase 3: install operations
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
