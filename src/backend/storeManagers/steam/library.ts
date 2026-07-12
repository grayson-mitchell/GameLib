import {
  GameInfo,
  ExecResult,
  InstallArgs,
  InstallPlatform,
  InstallInfo,
  LaunchOption
} from 'common/types'
import { LibraryManager } from 'common/types/game_manager'
import { logInfo, logError, logWarning, LogPrefix } from 'backend/logger'
import { join, resolve, relative, isAbsolute } from 'path'
import { dialog } from 'electron'
import { spawnSync, execFileSync } from 'child_process'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import { parse } from '@node-steam/vdf'
import { isWindows, isMac, isLinux } from 'backend/constants/environment'
import { userHome } from 'backend/constants/paths'
import { getSteamLibraries, getFileSize } from 'backend/utils'
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
import {
  getBottleSteamappsDir,
  getSteamBottleSettings,
  isBottleProvisioned
} from './bottle'

/**
 * Which Steam client's steamapps root an ACF scan/poll should target.
 * 'native' (default) preserves all pre-Phase-17 behavior; 'bottle' scans the
 * dedicated CrossOver bottle's own steamapps dir instead (RESEARCH.md Pitfall 2
 * — the two roots must never be conflated).
 */
export type AcfSource = 'native' | 'bottle'

/** Shared options shape for both install/uninstall poller start functions. */
type PollOptions = { intervalMs?: number; source?: AcfSource }

/**
 * Resolves the bottle's own steamapps dir from the dedicated Steam bottle's
 * stored GameSettings (falls back to DEFAULT_STEAM_BOTTLE_NAME internally via
 * getSteamBottleSettings()). Single chokepoint so every bottle-aware scan
 * roots at the same path.
 */
function getBottleSteamappsRoot(): string {
  return getBottleSteamappsDir(getSteamBottleSettings().wineCrossoverBottle)
}

// DETAIL-01 gap-fix: Steam installs the depot for the host OS, so the installed
// build reflects the platform GameLib is running on. Report that instead of a
// hardcoded 'Windows' (which made a Mac install read "Windows"). 'Mac'/'linux'/
// 'Windows' are all valid InstallPlatform members matched by the frontend's
// platform detection (['osx','Mac'] / ['linux','Linux']).
function hostInstallPlatform(): InstallPlatform {
  if (isMac) return 'Mac'
  if (isLinux) return 'linux'
  return 'Windows'
}

// Pitfall 3 fix: a bottle-installed game is a Windows depot running under
// Wine/CrossOver — it must ALWAYS report 'Windows', regardless of host OS.
// Only a native-sourced install object should ever consult hostInstallPlatform().
function installPlatformForSource(source: AcfSource): InstallPlatform {
  if (source === 'bottle') return 'Windows'
  return hostInstallPlatform()
}

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

    // Start the running-game poller (GAME-05 / D-06). Idempotent, so a re-init
    // is safe. Stopped on app quit from main.ts. Because the Electron main
    // process only runs while the app is open, this satisfies "poll only while
    // the app window is open" without per-window tracking.
    startRunningPoll()
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

    // ── Step 2: build install-state map(s) from ACF manifests on disk ─────
    // Bottle-aware (GAP-17-BOTTLE-PLAY-REVERT): this full resync can be
    // triggered mid-session (e.g. the launch-completion 'done' status), so it
    // must reconcile bottle-installed games the same way refreshInstallState()
    // does — otherwise a bottle-only-installed game's is_installed gets
    // clobbered back to false by this native-only scan every time it runs.
    const installedMap = await buildInstalledMap()
    const bottleInstalledMap =
      isMac && isBottleProvisioned() ? await buildBottleInstalledMap() : null

    // ── Step 3: build and push one GameInfo per owned game ────────────────
    library.clear()
    for (const app of ownedApps) {
      const appIdStr = String(app.appid)
      const nativeInstalledData = installedMap.get(app.appid)
      const bottleInstalledData = bottleInstalledMap?.get(app.appid)
      // Native always wins when present — never double-count/conflate the
      // two roots (mirrors refreshInstallState()'s reconciliation).
      const installedData = nativeInstalledData ?? bottleInstalledData
      const source: AcfSource = nativeInstalledData ? 'native' : 'bottle'
      const cachedMeta = steamMetadataStore.get(appIdStr)

      const gameInfo: GameInfo = {
        runner: 'steam',
        app_name: appIdStr,
        title: app.name,
        // Seed artwork from metadata cache so previously fetched art survives resync
        art_cover: cachedMeta?.art_cover ?? '',
        art_square: cachedMeta?.art_square ?? '',
        // DETAIL-01: seed native platform flags from the metadata cache so the
        // platform icons survive a resync (fetchMetadataIfNeeded populates these)
        is_mac_native: cachedMeta?.is_mac_native ?? false,
        is_linux_native: cachedMeta?.is_linux_native ?? false,
        // GAP-B: seed the persisted delisted verdict so it survives a library resync
        is_delisted: cachedMeta?.is_delisted ?? false,
        // CR-01 fix: seed the persisted Mach-O ground-truth verdict so a
        // cached '32' survives every startup/resync. Default MUST be
        // 'unknown' (never '32') — a missing/blank cache can never be
        // coerced into a 32-bit verdict (T-18-05-02, false-flag-safe
        // invariant from MAC32-01).
        mac_arch: cachedMeta?.mac_arch ?? 'unknown',
        // Phase 17 D-08 reconciliation: mirrors platformsCaptured so the
        // frontend bottle indicator matches the backend D-11 routing gate.
        steamPlatformsCaptured: cachedMeta?.platformsCaptured ?? false,
        is_installed: !!installedData,
        install: installedData
          ? {
              install_path: installedData.installPath,
              install_size: getFileSize(Number(installedData.sizeOnDisk)),
              // GAP-17-BOTTLE-PLAY-REVERT: platform must reflect which root
              // actually matched (native vs bottle), never hardcoded — a
              // bottle-installed game must always report 'Windows' (Pitfall 3).
              platform: installPlatformForSource(source)
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
   * 17-03 (MACSTEAM-05): when isMac && isBottleProvisioned(), ALSO diffs each
   * library entry against buildBottleInstalledMap() (the dedicated CrossOver
   * bottle's own ACF root) and reconciles bottle-installed games with
   * install.platform: 'Windows' (Pitfall 3) — never the host OS. Bottle
   * reconciliation is gated strictly behind isBottleProvisioned() (T-17-03: a
   * missing/unprovisioned bottle is a no-op, not a repeated failing scan) and
   * is skipped entirely on Linux/Windows or an un-provisioned macOS, leaving
   * the native-only reconciliation byte-for-byte unchanged in those cases.
   * The native map always takes precedence for a given appId — a bottle
   * result is only consulted when the native scan found nothing for that
   * appId, so the two roots are never double-counted or conflated.
   *
   * Only games whose state changed are pushed (avoids flooding the frontend).
   * The GameInfo install shape matches refresh() when installed:
   *   install_path, install_size, platform ('Windows' always for a bottle
   *   install; host-OS-derived for a native install)
   * and is set to {} when not installed.
   */
  async refreshInstallState(): Promise<void> {
    const installedMap = await buildInstalledMap()
    const bottleInstalledMap =
      isMac && isBottleProvisioned() ? await buildBottleInstalledMap() : null

    for (const [appIdStr, gameInfo] of library.entries()) {
      const appId = parseInt(appIdStr, 10)
      const nativeInstalledData = installedMap.get(appId)
      const bottleInstalledData = bottleInstalledMap?.get(appId)
      // Native always wins when present — never double-count/conflate the two roots.
      const installedData = nativeInstalledData ?? bottleInstalledData
      const source: AcfSource = nativeInstalledData ? 'native' : 'bottle'
      const isNowInstalled = !!installedData

      if (gameInfo.is_installed !== isNowInstalled) {
        const updated: GameInfo = {
          ...gameInfo,
          is_installed: isNowInstalled,
          install: isNowInstalled
            ? {
                install_path: installedData.installPath,
                install_size: getFileSize(Number(installedData.sizeOnDisk)),
                platform: installPlatformForSource(source)
              }
            : {}
        }
        library.set(appIdStr, updated)
        // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately so the in-memory
        // Map and the on-disk cache never diverge (mirrors refresh() and
        // gog/library.ts's installedGamesStore.set-immediately-after-mutate
        // pattern) — otherwise an app restart before the next full refresh()
        // would read a stale is_installed from steamLibraryStore.
        steamLibraryStore.set('games', Array.from(library.values()))
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

// ── macOS arch ground-truth check (MAC32-03) ─────────────────────────────────
// Post-install Mach-O binary inspection is the ONLY detector in this phase
// that may ever assert mac_arch === '32'. Steam's manual osarch metadata
// proved absent/unreliable on every macOS launch entry (18-01 finding,
// retired) and the pre-install store-API min-OS heuristic (games.ts
// macArchFromMinOS) structurally never returns '32' either — this is the
// correctness backstop that catches an i386-only mac depot Steam left
// un-tagged.

/**
 * Runs `lipo -archs` on the given binary — argv-form execFileSync (command +
 * array, never a shell-interpolated string; T-18-03-01) mirroring the
 * windowsRunningAppId/linuxFallbackRunningAppId convention above. Falls back
 * to `file` when lipo throws (not installed / binary lipo doesn't recognize).
 * Returns [] when BOTH tools fail — inconclusive, NEVER a 32-bit verdict on
 * its own (verdictFromArchs below is the sole place that turns an arch list
 * into a '32'/'64' answer). Exported for unit testing.
 */
export function machOArchsOf(binaryPath: string): string[] {
  try {
    const output = execFileSync('lipo', ['-archs', binaryPath], {
      encoding: 'utf8',
      timeout: 5000
    })
    return output.trim().split(/\s+/).filter(Boolean)
  } catch {
    try {
      const output = execFileSync('file', [binaryPath], {
        encoding: 'utf8',
        timeout: 5000
      })
      const archs: string[] = []
      if (/\bx86_64\b/.test(output)) archs.push('x86_64')
      if (/\barm64\b/.test(output)) archs.push('arm64')
      if (/\bi386\b/.test(output)) archs.push('i386')
      return archs
    } catch {
      return [] // neither tool available/succeeded — inconclusive, NOT 32-bit
    }
  }
}

/**
 * Maps a Mach-O arch list to a verdict. A universal binary (any x86_64/arm64
 * slice present) is runnable — '64' wins even alongside an i386 slice. Empty
 * input is inconclusive: null, never '32' (T-18-03-03 — the false-flag-safe
 * invariant at this subprocess boundary). Exported for unit testing.
 */
export function verdictFromArchs(archs: string[]): '32' | '64' | null {
  if (archs.length === 0) return null // inconclusive — do not overwrite existing hint
  if (archs.includes('x86_64') || archs.includes('arm64')) return '64'
  if (archs.includes('i386')) return '32'
  return null
}

/**
 * Locates the installed Mach-O binary to inspect. Prefers a supplied launch
 * executable path (resolved relative to installPath); otherwise scans
 * installPath for a top-level *.app bundle and returns its
 * Contents/MacOS/<first file>. Containment (T-18-03-04): a supplied
 * launchExecutable that escapes installPath's own subtree — via `..`
 * segments or an absolute path — is rejected (logged + skipped), not just
 * join()'d; `join()` alone does not prevent `../../` traversal. Never
 * throws, returns null (log+skip at the call site) on any miss. Exported
 * for unit testing.
 */
export function locateMachOBinary(
  installPath: string,
  launchExecutable?: string
): string | null {
  if (launchExecutable) {
    // T-18-03-04: reject any candidate that escapes installPath's subtree.
    // resolve() honors an absolute launchExecutable and collapses '..'
    // segments; relative() then reveals an escape as a leading '..' (or, on
    // Windows, a different drive → absolute). Verify containment BEFORE
    // touching the filesystem — join() alone would silently nest an absolute
    // path and does not prevent '../../' traversal.
    const candidate = resolve(installPath, launchExecutable)
    const rel = relative(installPath, candidate)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      logWarning(
        `Steam: locateMachOBinary rejected launchExecutable '${launchExecutable}' — escapes installPath subtree; skipping`,
        LogPrefix.Steam
      )
    } else if (existsSync(candidate)) {
      return candidate
    }
  }
  try {
    const entries = readdirSync(installPath)
    const appBundle = entries.find((e) => e.endsWith('.app'))
    if (!appBundle) return null
    const macOsDir = join(installPath, appBundle, 'Contents', 'MacOS')
    if (!existsSync(macOsDir)) return null
    const bins = readdirSync(macOsDir)
    return bins.length ? join(macOsDir, bins[0]) : null
  } catch {
    return null
  }
}

/**
 * Post-install ground-truth check (MAC32-03). Corrects Steam's un-tagged
 * mac_arch signal by inspecting the installed Mach-O binary — the only path
 * in this phase that may assert mac_arch === '32'.
 *
 * Skip gates, in order:
 *  - source !== 'native': a bottle install is a Windows depot — no Mach-O
 *    binary belongs to this game on that path (RESEARCH.md Anti-Patterns).
 *  - !isMac: host-gated, mirrors games.ts ensurePlatformsCaptured()'s guard.
 *  - mac_arch already '32', or mac_arch_verified already true: nothing to
 *    correct, or already resolved — never re-shells on every install/launch.
 *
 * A definitive verdict ('32' or '64') is persisted with mac_arch_source:
 * 'macho' and mac_arch_verified:true, spreading the existing cache entry so
 * art/extra/etc. are never lost. An inconclusive result (no binary located,
 * or verdictFromArchs returns null) is a no-op — logs and leaves mac_arch
 * exactly as-is (T-18-03-03).
 *
 * When the verdict is '32', triggers the user-consented recovery (CONTEXT
 * D-6 / promptI386Recovery below) as a decoupled fire-and-forget call — the
 * ground-truth check itself never awaits the dialog, so it never blocks the
 * pollInstallOnce 'installed' badge-flip UX.
 *
 * Exported for unit testing.
 */
export async function verifyMacArchGroundTruth(
  appId: string,
  installPath: string,
  source: AcfSource
): Promise<void> {
  if (source !== 'native') return
  if (!isMac) return

  const existing = steamMetadataStore.get(appId)
  if (existing?.mac_arch === '32' || existing?.mac_arch_verified === true) {
    return
  }

  const binaryPath = locateMachOBinary(installPath)
  if (!binaryPath) {
    logInfo(
      `Steam: verifyMacArchGroundTruth found no Mach-O binary for appId ${appId} at ${installPath} — skipping`,
      LogPrefix.Steam
    )
    return
  }

  const verdict = verdictFromArchs(machOArchsOf(binaryPath))
  if (verdict === null) {
    logInfo(
      `Steam: verifyMacArchGroundTruth inconclusive for appId ${appId} — leaving mac_arch unchanged`,
      LogPrefix.Steam
    )
    return
  }

  steamMetadataStore.set(appId, {
    ...(existing ?? { art_cover: '', art_square: '', extra: { reqs: [] } }),
    mac_arch: verdict,
    mac_arch_source: 'macho',
    mac_arch_verified: true
  })
  logInfo(
    `Steam: verifyMacArchGroundTruth resolved appId ${appId} to mac_arch '${verdict}' (Mach-O ground truth)`,
    LogPrefix.Steam
  )

  // CR-01 fix: propagate the resolved verdict to the in-memory library Map
  // and push it to the frontend, mirroring the library.set + push pattern
  // used at the end of refresh()'s loop. Without this, the badge is
  // unreachable until the next app restart/resync (steamMetadataStore alone
  // is not frontend-visible). Only update when the game is already present
  // in the Map — never fabricate a GameInfo; the store write above already
  // carries the verdict for the next refresh() rebuild.
  const currentGameInfo = library.get(appId)
  if (currentGameInfo) {
    const updatedGameInfo: GameInfo = { ...currentGameInfo, mac_arch: verdict }
    library.set(appId, updatedGameInfo)
    // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately, mirroring every
    // other library-mutating call site in this file — otherwise a restart
    // before the next full refresh() reads a stale mac_arch from
    // steamLibraryStore and the 32-bit badge silently reverts.
    steamLibraryStore.set('games', Array.from(library.values()))
    sendFrontendMessage('pushGameToLibrary', updatedGameInfo)
  } else {
    logInfo(
      `Steam: verifyMacArchGroundTruth resolved appId ${appId} but it is not in the in-memory library Map — skipping frontend push (will pick up mac_arch on next refresh)`,
      LogPrefix.Steam
    )
  }

  if (verdict === '32') {
    // MAC32-03/CONTEXT D-6: decoupled — never awaited here, so this check
    // never blocks the pollInstallOnce 'installed' badge-flip UX above.
    void promptI386Recovery(appId)
  }
}

/**
 * MAC32-03 / CONTEXT D-6: user-consented i386 recovery. Steam left this
 * game's mac depot un-tagged and the post-install Mach-O check proved it is
 * i386-only — unrunnable on this version of macOS (Apple removed 32-bit
 * support in Catalina, 2019).
 *
 * Presents a native confirm dialog via Electron's `dialog.showMessageBox` —
 * this codebase's established backend-AWAITED confirm primitive (see
 * legendary/eos_overlay.ts's remove()/enable()) — deliberately NOT
 * showDialogBoxModalAuto, whose `buttons[].onClick` callbacks travel over
 * IPC (webContents.send uses the structured-clone algorithm, which cannot
 * carry function values) and so can never round-trip a confirm decision back
 * into this async function; dialog.showMessageBox is a native, in-process,
 * awaitable primitive with no such limitation.
 *
 * On confirm: force-uninstalls the dead native copy, then re-installs —
 * which now routes through the bottle because isBottleEligible() honors the
 * mac_arch:'32' verdict verifyMacArchGroundTruth already persisted.
 * On cancel/dismiss: leaves the (unrunnable) native install in place; the
 * '32' verdict stays cached (persisted by verifyMacArchGroundTruth BEFORE
 * this prompt fires) so the badge and future routing reflect reality either
 * way.
 *
 * Exported for unit testing.
 */
export async function promptI386Recovery(appId: string): Promise<void> {
  const { response } = await dialog.showMessageBox({
    title: i18next.t(
      'box.steam.mac32Detected.title',
      '32-bit macOS build detected'
    ),
    message: i18next.t(
      'box.steam.mac32Detected.message',
      "This game's macOS build is 32-bit only and cannot run on this version of macOS. GameLib can reinstall it through CrossOver instead, which will redownload the Windows version."
    ),
    buttons: [
      i18next.t('box.steam.mac32Detected.confirm', 'Reinstall via CrossOver'),
      i18next.t('box.cancel', 'Cancel')
    ]
  })

  if (response !== 0) {
    logInfo(
      `Steam: user declined i386 recovery for appId ${appId} — native install left in place (unrunnable)`,
      LogPrefix.Steam
    )
    return
  }

  logInfo(
    `Steam: user confirmed i386 recovery for appId ${appId} — force-uninstalling the native copy and reinstalling via the bottle`,
    LogPrefix.Steam
  )
  const game = new SteamGame(appId)
  await game.forceUninstall()
  await game.install({} as InstallArgs)
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
 * `source` selects which steamapps root(s) to scan:
 *  - 'native' (default): every native library path from getSteamLibraries()
 *    — exactly the pre-Phase-17 behavior, byte-for-byte unchanged.
 *  - 'bottle': the single dedicated CrossOver bottle steamapps root
 *    (RESEARCH.md Pitfall 2 — never conflated with the native roots).
 *
 * Corrupt/unreadable manifests are skipped without throwing (T-2-01 / T-17-05).
 * Exported for unit testing.
 */
export async function readAcfState(
  appId: string,
  source: AcfSource = 'native'
): Promise<{
  state: 'absent' | 'downloading' | 'installed'
  stateFlags?: number
  installPath?: string
  sizeOnDisk?: string
  /** Bytes downloaded/staged so far, and the totals to compare against —
   *  parsed from the ACF's AppState (strings on disk). Only populated on the
   *  'downloading' result; used by pollInstallOnce to derive a progress
   *  percent for the bottle install path (GAP-17-BOTTLE-PROGRESS). Missing or
   *  non-numeric values default to 0. */
  bytesDownloaded?: number
  bytesToDownload?: number
  bytesStaged?: number
  bytesToStage?: number
}> {
  const steamappsDirs =
    source === 'bottle'
      ? [getBottleSteamappsRoot()]
      : (await getSteamLibraries()).map((libPath) => join(libPath, 'steamapps'))

  for (const steamappsDir of steamappsDirs) {
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
      return {
        state: 'downloading',
        stateFlags,
        bytesDownloaded: Number(state.BytesDownloaded) || 0,
        bytesToDownload: Number(state.BytesToDownload) || 0,
        bytesStaged: Number(state.BytesStaged) || 0,
        bytesToStage: Number(state.BytesToStage) || 0
      }
    } catch {
      continue // skip corrupt ACF (T-2-01)
    }
  }

  return { state: 'absent' }
}

/**
 * Bottle-scoped sibling of buildInstalledMap() — same StateFlags bitmask +
 * corrupt-file discipline (T-2-01/T-17-05), rooted at the dedicated CrossOver
 * bottle's own steamapps dir instead of the native defaultSteamPath (Pitfall 2).
 * Returns an empty Map when the bottle steamapps dir doesn't exist yet (e.g.
 * bottle not provisioned or Steam not yet installed inside it).
 *
 * Exported for unit testing.
 */
export async function buildBottleInstalledMap(): Promise<
  Map<number, { installPath: string; sizeOnDisk: string }>
> {
  const installed = new Map<
    number,
    { installPath: string; sizeOnDisk: string }
  >()
  const steamappsDir = getBottleSteamappsRoot()
  if (!existsSync(steamappsDir)) return installed

  let files: string[]
  try {
    files = readdirSync(steamappsDir)
  } catch {
    return installed
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
      /* skip corrupt ACF — T-2-01/T-17-05 mitigation */
    }
  }

  return installed
}

/**
 * Executes one polling tick for appId:
 *   'downloading' → updates seenDownloading flag, sends gameStatusUpdate { status: 'installing' }
 *   'installed'   → updates library entry, sends pushGameToLibrary +
 *                   gameStatusUpdate { status: 'done' }, stops the poll
 *   'absent'      → no-op (grace/cap logic lives in startInstallPolling's callback)
 *
 * `source` selects the native (default) or bottle-scoped ACF root — see
 * readAcfState() for the distinction.
 *
 * Exported for unit testing.
 */
export async function pollInstallOnce(
  appId: string,
  source: AcfSource = 'native'
): Promise<void> {
  const result = await readAcfState(appId, source)
  const poll = activePolls.get(appId)

  if (result.state === 'downloading') {
    if (poll) poll.seenDownloading = true
    sendFrontendMessage('gameStatusUpdate', {
      appName: appId,
      runner: 'steam',
      status: 'installing'
    })

    // GAP-17-BOTTLE-PROGRESS: the bottle install has no DownloadManager
    // feeding the frontend progress store — the ACF's own byte counts are
    // the only source of truth. Prefer the download totals; fall back to
    // the staging totals when the download total is 0/missing (late-stage
    // installs that are past the download phase). Never emit a non-finite
    // percent — if BOTH totals are 0/missing, skip the progress emit
    // entirely (the gameStatusUpdate above still fired).
    const {
      bytesDownloaded = 0,
      bytesToDownload = 0,
      bytesStaged = 0,
      bytesToStage = 0
    } = result

    const useStaged = !(bytesToDownload > 0)
    const denominator = useStaged ? bytesToStage : bytesToDownload
    const numerator = useStaged ? bytesStaged : bytesDownloaded

    if (denominator > 0) {
      const rawPercent = (numerator / denominator) * 100
      if (Number.isFinite(rawPercent)) {
        const percent = Math.min(100, Math.max(0, Math.round(rawPercent)))
        sendFrontendMessage('progressUpdate', {
          appName: appId,
          runner: 'steam',
          status: 'installing',
          progress: {
            percent,
            bytes: getFileSize(numerator),
            eta: ''
          }
        })
      }
    }
  } else if (result.state === 'installed') {
    const existing = library.get(appId)
    if (existing) {
      const updated: GameInfo = {
        ...existing,
        is_installed: true,
        install: {
          install_path: result.installPath!,
          install_size: getFileSize(Number(result.sizeOnDisk!)),
          platform: installPlatformForSource(source)
        }
      }
      library.set(appId, updated)
      // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately (see
      // refreshInstallState() for rationale) so a restart mid-poll can't read
      // a stale not-installed state from steamLibraryStore.
      steamLibraryStore.set('games', Array.from(library.values()))
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

    // MAC32-03: fire-and-forget post-install ground-truth check — placed
    // AFTER the badge-flip/notify above so it can never delay them. Native
    // installs only (a bottle install is a Windows depot; no Mach-O binary
    // belongs to this game on that path) and macOS-only (host-gated).
    if (isMac && source === 'native') {
      void verifyMacArchGroundTruth(appId, result.installPath!, source)
    }
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
 * The second parameter accepts EITHER a plain intervalMs number (existing
 * call signature, unchanged) OR a `{ intervalMs?, source? }` options object —
 * `source: 'bottle'` polls the dedicated CrossOver bottle's steamapps root
 * instead of the native one. Omitting the second arg entirely, or passing a
 * bare number, preserves today's native behavior byte-for-byte.
 *
 * Exported for unit testing.
 */
export function startInstallPolling(
  appId: string,
  intervalMsOrOptions: number | PollOptions = 3000
): void {
  if (activePolls.has(appId)) return // idempotent

  const { intervalMs, source }: { intervalMs: number; source: AcfSource } =
    typeof intervalMsOrOptions === 'number'
      ? { intervalMs: intervalMsOrOptions, source: 'native' }
      : {
          intervalMs: intervalMsOrOptions.intervalMs ?? 3000,
          source: intervalMsOrOptions.source ?? 'native'
        }

  logInfo(
    `Steam: starting install polling for appId ${appId} (interval ${intervalMs}ms, source ${source})`,
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

    await pollInstallOnce(appId, source)

    // pollInstallOnce may have stopped the poll (state became 'installed')
    if (!activePolls.has(appId)) return

    // Grace window: if no manifest ever appeared after GRACE_TICKS, the user
    // probably cancelled Steam's install dialog — stop to avoid endless polling.
    // Emit a terminal 'done' so the DM queue badge clears (removeFromQueue
    // suppresses 'done' for steam and relies on this poller — symmetric to the
    // uninstall grace path). Without this, a cancelled install leaves a stuck
    // 'queued'/'installing' badge until restart (CR-01).
    if (!entry.seenDownloading && entry.ticks >= GRACE_TICKS) {
      logWarning(
        `Steam: install polling for appId ${appId} stopped after grace window (${GRACE_TICKS} ticks) — no manifest detected; user may have cancelled`,
        LogPrefix.Steam
      )
      sendFrontendMessage('gameStatusUpdate', {
        appName: appId,
        runner: 'steam',
        status: 'done'
      })
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
 * (confirmed removal) flips the badge. `source` selects the native (default) or
 * bottle-scoped ACF root — see readAcfState(). Exported for unit testing.
 */
export async function pollUninstallOnce(
  appId: string,
  source: AcfSource = 'native'
): Promise<void> {
  const result = await readAcfState(appId, source)
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
      // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately (see
      // refreshInstallState() for rationale).
      steamLibraryStore.set('games', Array.from(library.values()))
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
 * The second parameter accepts EITHER a plain intervalMs number (existing
 * call signature, unchanged) OR a `{ intervalMs?, source? }` options object —
 * `source: 'bottle'` polls the dedicated CrossOver bottle's steamapps root
 * instead of the native one. Omitting the second arg entirely, or passing a
 * bare number, preserves today's native behavior byte-for-byte.
 *
 * Exported for unit testing.
 */
export function startUninstallPolling(
  appId: string,
  intervalMsOrOptions: number | PollOptions = 3000
): void {
  if (activeUninstallPolls.has(appId)) return // idempotent

  const { intervalMs, source }: { intervalMs: number; source: AcfSource } =
    typeof intervalMsOrOptions === 'number'
      ? { intervalMs: intervalMsOrOptions, source: 'native' }
      : {
          intervalMs: intervalMsOrOptions.intervalMs ?? 3000,
          source: intervalMsOrOptions.source ?? 'native'
        }

  logInfo(
    `Steam: starting uninstall polling for appId ${appId} (interval ${intervalMs}ms, source ${source})`,
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

    await pollUninstallOnce(appId, source)

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

// ── Running-game polling lifecycle (GAME-05) ──────────────────────────────────

/** Module-level timer for the running-game poller (single global poll). */
let runningPollTimer: NodeJS.Timeout | null = null

/** Last RunningAppID seen by the poller — used to detect deltas. */
let lastKnownRunningAppId = 0

/**
 * Reads Windows HKCU\Software\Valve\Steam\RunningAppID via reg.exe.
 * Uses argv-form spawnSync (no shell) — registry path is hardcoded (T-06-04).
 * Returns 0 on missing value, non-zero exit status, or thrown error.
 */
function windowsRunningAppId(): number {
  try {
    const result = spawnSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'],
      { encoding: 'utf8', windowsHide: true, timeout: 2000 }
    )
    if (result.status !== 0) return 0
    const match = result.stdout?.match(
      /RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i
    )
    return match ? parseInt(match[1], 16) : 0
  } catch {
    return 0
  }
}

/**
 * Reads macOS ~/Library/Application Support/Steam/registry.vdf for RunningAppID.
 * Parses via @node-steam/vdf with exact casing (Pitfall 4 — T-06-06).
 * Returns 0 when file absent, parse fails, or key missing.
 */
function macOsRunningAppId(): number {
  const regPath = join(
    userHome,
    'Library',
    'Application Support',
    'Steam',
    'registry.vdf'
  )
  if (!existsSync(regPath)) return 0
  try {
    const content = readFileSync(regPath, 'utf-8')
    const parsed = parse(content)
    const raw = parsed?.Registry?.HKCU?.Software?.Valve?.Steam?.RunningAppID
    return raw ? parseInt(raw, 10) : 0
  } catch {
    return 0
  }
}

/**
 * Reads Linux ~/.steam/registry.vdf for RunningAppID.
 * Note: this is ~/.steam/registry.vdf, NOT ~/.steam/steam/registry.vdf (Pitfall 3).
 * Returns 0 when file absent, parse fails, or broken (ValveSoftware/steam-for-linux#9672).
 */
function linuxRegistryVdfRunningAppId(): number {
  const regPath = join(userHome, '.steam', 'registry.vdf')
  if (!existsSync(regPath)) return 0
  try {
    const content = readFileSync(regPath, 'utf-8')
    const parsed = parse(content)
    const raw = parsed?.Registry?.HKCU?.Software?.Valve?.Steam?.RunningAppID
    return raw ? parseInt(raw, 10) : 0
  } catch {
    return 0
  }
}

/**
 * Linux fallback: scans process cmdline for the Steam reaper process which carries
 * the running AppId. Uses argv-form execFileSync with a narrow regex (T-06-05).
 * Returns 0 when no reaper found or execFileSync fails.
 */
function linuxFallbackRunningAppId(): number {
  try {
    const output = execFileSync('ps', ['-eo', 'args'], {
      encoding: 'utf8',
      timeout: 1000
    })
    const match = output.match(/reaper SteamLaunch --AppId (\d+)/)
    return match ? parseInt(match[1], 10) : 0
  } catch {
    return 0
  }
}

/**
 * Reads the currently running Steam game AppID, cross-platform.
 *
 * - Windows: reads HKCU registry via reg.exe (T-06-04)
 * - macOS: reads ~/Library/Application Support/Steam/registry.vdf (T-06-06)
 * - Linux: tries ~/.steam/registry.vdf first; falls back to reaper process scan
 *   because the Linux VDF RunningAppID is broken since 2023 (ValveSoftware/#9672)
 *   (T-06-05)
 *
 * Returns 0 when no game is running or on any error. Never throws.
 * Exported for unit testing.
 */
export function readRunningAppId(): number {
  if (isWindows) return windowsRunningAppId()
  if (isMac) return macOsRunningAppId()
  // Linux: VDF first, reaper fallback when VDF returns 0 (D-05)
  const fromRegistry = linuxRegistryVdfRunningAppId()
  return fromRegistry !== 0 ? fromRegistry : linuxFallbackRunningAppId()
}

/**
 * Executes one running-game poll tick:
 * - 0→X: sends `playing` for X
 * - X→0: sends `done` for X
 * - X→Y: sends `done` for X then `playing` for Y
 * - unchanged: no-op
 *
 * AppID is scoped to a numeric-only string (T-06-07 — no raw external string).
 * Exported for unit testing.
 */
export function pollRunningOnce(): void {
  const currentAppId = readRunningAppId()
  if (currentAppId === lastKnownRunningAppId) return

  if (lastKnownRunningAppId !== 0) {
    sendFrontendMessage('gameStatusUpdate', {
      appName: String(lastKnownRunningAppId),
      runner: 'steam',
      status: 'done'
    })
    logInfo(
      `Steam: running-game poller: game ${lastKnownRunningAppId} stopped`,
      LogPrefix.Steam
    )
  }
  if (currentAppId !== 0) {
    sendFrontendMessage('gameStatusUpdate', {
      appName: String(currentAppId),
      runner: 'steam',
      status: 'playing'
    })
    logInfo(
      `Steam: running-game poller: game ${currentAppId} started`,
      LogPrefix.Steam
    )
  }

  lastKnownRunningAppId = currentAppId
}

/**
 * Starts the running-game poller. Idempotent — calling twice has no effect.
 * Polls every intervalMs milliseconds (default 5000 / D-06).
 *
 * Exported for unit testing.
 */
export function startRunningPoll(intervalMs = 5000): void {
  if (runningPollTimer) return // idempotent
  runningPollTimer = setInterval(pollRunningOnce, intervalMs)
  logInfo('Steam: started running-game poller', LogPrefix.Steam)
}

/**
 * Stops the running-game poller and resets lastKnownRunningAppId to 0 so the
 * next startRunningPoll starts with a clean slate. Safe to call when no poll is
 * active (no-op on timer, always resets state).
 *
 * Exported for unit testing.
 */
export function stopRunningPoll(): void {
  if (runningPollTimer) {
    clearInterval(runningPollTimer)
    runningPollTimer = null
  }
  lastKnownRunningAppId = 0
  logInfo('Steam: stopped running-game poller', LogPrefix.Steam)
}
