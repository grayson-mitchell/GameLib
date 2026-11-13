import type { ManagerDeps } from 'backend/services/types'
import {
  GameInfo,
  ExecResult,
  InstallPlatform,
  InstallInfo,
  LaunchOption
} from 'common/types'
import { LibraryManager } from 'common/types/game_manager'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify } from '../../../dialog/dialog'
import i18next from 'i18next'
import SteamGame from '../games'
import { scanDownloadingAppIds } from './acfState'
import {
  clearSteamResumeBreadcrumb,
  getSteamResumeBreadcrumbAppIds,
  breadcrumbAppIsFullyInstalledOnDisk
} from './resumeBreadcrumbs'
import { rearmPersistedSteamRestartHolds } from './resume'
import { refresh, refreshInstallState } from './refresh'
import { detectSteamUpdates, type SteamUpdateState } from '../updateDetection'
import { wasAutoUpdateAttempted } from '../autoUpdateAttempts'
import type { SteamLaunchWatchRegistry } from '../steamLaunchWatch'

/** The collaborators SteamLibraryManager uses; narrowed by its own plan. */
export type SteamManagerDeps = ManagerDeps

export default class SteamLibraryManager implements LibraryManager {
  constructor(private readonly deps: SteamManagerDeps) {}

  /**
   * Per-boot holder of the Steam launch watches (261111-9mj). An instance
   * field by design, not module state (backend-di-ceilings).
   */
  readonly launchWatches: SteamLaunchWatchRegistry = new Map()

  /**
   * On startup: load the cached library immediately, SURFACE (never
   * auto-drive) any in-progress install detected on disk (D-07, softened by
   * steam-startup-resume-crash / D-04), then trigger a background sync when
   * online and logged in (D-01 / D-09).
   */
  async init(): Promise<void> {
    // One-time migration: portrait library capsule replaced the cropped
    // landscape capsule. Rewrite any stale art URLs already in the caches so
    // existing libraries pick up the new art without a manual cache clear.
    this.migrateStaleArtUrls()

    const cached = this.deps.stores.steam.steamLibraryStore.get('games', [])
    if (cached.length) {
      this.deps.steamSession.libraryState.library.clear()
      cached.forEach((g) => {
        this.deps.steamSession.libraryState.library.set(g.app_name, g)
        this.deps.sendFrontendMessage('pushGameToLibrary', g)
      })
      logInfo(
        `Steam: loaded ${cached.length} games from cache`,
        LogPrefix.Steam
      )
    }

    // quick 261029-pkp: re-arm persisted "Restart Steam to finish" holds
    // before anything can reconcile install state.
    const { dropped } = await rearmPersistedSteamRestartHolds(this.deps)
    const restartHold = this.deps.steamInstallRuntime.restartHold
    if (dropped > 0 && restartHold.getReconcileRanDuringRearm()) {
      restartHold.setReconcileRanDuringRearm(false)
      void this.refreshInstallState()
    }

    // steam-startup-resume-crash (2026-07-18) / D-04 softened: DETECT any
    // in-progress download left on disk (D-07) and SURFACE it as resumable —
    // never auto-drive it. Previously this block ran the full
    // locate->rebuild-plan->reconcile->finalize->watch sequence UNATTENDED on
    // every launch; a native fatal in that heavy machinery (buildDepotPlan's
    // PICS/manifest fetch and everything chained after it) running
    // immediately after startup was the confirmed root cause of a silent
    // whole-app crash. That sequence now lives in resumeInterruptedSteamInstall()
    // above and only runs when the user explicitly triggers it (their own
    // Install click — see SteamGame.install()). Wrapped in try/catch (outer
    // AND per-appId inner) so neither a scan failure nor a single game's
    // surface step can ever block startup or take down the others.
    // 260821-rb5: case C of the aborted-depot-residue todo (a hard kill —
    // kill -9, crash, power loss — mid native-depot-download) leaves NO
    // appmanifest_*.acf at all, so scanDownloadingAppIds(this.deps) below can never
    // see it. getSteamResumeBreadcrumbAppIds(this.deps) is the in-memory (never
    // throws) counterpart, sourced from the install-start breadcrumb
    // (markSteamNativeInstallStarted, games.ts). Unioning the two lists is
    // load-bearing, not additive convenience: without it, case C has no
    // record ANYWHERE after a restart. The ACF scan is narrowed to its own
    // try so a scan failure (which case C triggers by definition — there IS
    // no ACF) can never skip breadcrumb surfacing.
    const breadcrumbIds = getSteamResumeBreadcrumbAppIds(this.deps)
    const breadcrumbSet = new Set(breadcrumbIds)
    let downloadingIds: string[] = []
    try {
      downloadingIds = await scanDownloadingAppIds(this.deps)
    } catch (err) {
      logWarning(
        [
          'Steam: scanDownloadingAppIds failed during init, skipping resume:',
          err
        ],
        LogPrefix.Steam
      )
    }

    for (const appId of new Set([...downloadingIds, ...breadcrumbIds])) {
      // T-23-14: a stale on-disk StateFlags=1026 manifest for an appId
      // already owned by a LIVE in-process install (games.ts's
      // nativeInstallsInFlight) must never spawn a phantom concurrent
      // resume path racing it — skip entirely and let the live install own
      // this appId's finalize + poll start (installDepotDownload calls
      // startInstallPolling itself once its own run completes).
      if (this.deps.steamSession.gameSession.isNativeInstallInFlight(appId)) {
        logInfo(
          `Steam: skipping startup resume-surface for appId ${appId} — already owned by a live in-process install`,
          LogPrefix.Steam
        )
        continue
      }

      // Per-appId hardening: surfacing one game's resumable state must
      // never throw out of this loop and never block startup or the
      // other appIds in this list.
      try {
        const existing = this.deps.steamSession.libraryState.library.get(appId)

        // 260821-rb5 self-heal: a breadcrumb-carrying appId whose on-disk
        // manifest turns out to be fully installed (e.g. Steam itself
        // finished the download after the kill, or a stale breadcrumb from
        // a completed update) must be CLEARED, not surfaced. Without this,
        // a killed-then-Steam-completed install would nag "resume" on
        // every launch forever — the breadcrumb has no other clear point,
        // since case C never reaches the success-route clear in
        // runNativeDepotDownload.
        if (
          breadcrumbSet.has(appId) &&
          (await breadcrumbAppIsFullyInstalledOnDisk(
            this.deps,
            appId,
            existing?.install
          ))
        ) {
          clearSteamResumeBreadcrumb(this.deps, appId)
          logInfo(
            `Steam: appId ${appId} carried a 260821-rb5 install-start breadcrumb but its on-disk manifest is fully installed — clearing the breadcrumb instead of surfacing it`,
            LogPrefix.Steam
          )
          continue
        }

        if (existing) {
          const updated: GameInfo = {
            ...existing,
            install: { ...existing.install, steamResumePending: true }
          }
          this.deps.steamSession.libraryState.library.set(appId, updated)
          this.deps.sendFrontendMessage('pushGameToLibrary', updated)
        }

        logInfo(
          `Steam: appId ${appId} has an interrupted install detected on startup — surfacing as resumable, NOT auto-resuming`,
          LogPrefix.Steam
        )

        notify(this.deps, {
          title: existing?.title ?? '',
          body: i18next.t(
            'gamelib:steam.resumeAvailable.notify',
            'An interrupted install for {{game}} is ready to resume — click Install to continue',
            { game: existing?.title ?? '' }
          )
        })
      } catch (surfaceErr) {
        logWarning(
          [
            `Steam: failed to surface resumable install for appId ${appId} (never blocks startup):`,
            surfaceErr
          ],
          LogPrefix.Steam
        )
      }
    }

    // Background sync once per session (D-01 / D-03). quick-260817-d61: names
    // the deferral's log line 'startup' rather than an empty label — the gate
    // itself lives at the top of refresh() below, not here; this call never
    // unlocks anything (noteSteamAuthTrigger('startup') is never deliberate).
    if (this.deps.steamUser.isLoggedIn()) {
      this.deps.steamSession.authTrigger.noteSteamAuthTrigger('startup')
      this.deps.onlineMonitor.runOnceWhenOnline(() => this.refresh())
    }

    // The running-game poller is started by the sidecar boot step 'steam-running-poll' and stopped
    // at stdin EOF (quick 261111-7wo); init() is not called under Tauri.
  }

  getGame(id: string): SteamGame {
    return new SteamGame(id, this.deps)
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
    for (const [
      appId,
      meta
    ] of this.deps.stores.steam.steamMetadataStore.entries()) {
      if (meta?.art_square?.includes(OLD_ART)) {
        this.deps.stores.steam.steamMetadataStore.set(appId, {
          ...meta,
          art_square: meta.art_square.replace(OLD_ART, NEW_ART)
        })
      }
    }

    // Persisted library list (what init() loads and pushes to the frontend).
    const games = this.deps.stores.steam.steamLibraryStore.get('games', [])
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
      this.deps.stores.steam.steamLibraryStore.set('games', migrated)
      logInfo(
        `Steam: migrated ${migrated.filter((g) => g.art_square.includes(NEW_ART)).length} cached cover URLs to portrait art`,
        LogPrefix.Steam
      )
    }
  }

  async refresh(): Promise<ExecResult | null> {
    return refresh(this.deps)
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
    const fromGame = new SteamGame(appName, this.deps).getGameInfo()
    if (fromGame.app_name) return fromGame

    // Fallback: consult persistent cache (useful if init() hasn't fired yet)
    const cached = this.deps.stores.steam.steamLibraryStore.get('games', [])
    return cached.find((g) => g.app_name === appName)
  }

  getListOfGames(): GameInfo[] {
    return this.deps.stores.steam.steamLibraryStore.get('games', [])
  }

  /**
   * D-07 (phase 34.13): deliberate stub returning `undefined` — Steam
   * exposes no pre-install size, and computing one for real would need an
   * authenticated Steam CM connection plus per-depot round trips (D-06),
   * far more than this call should ever cost.
   * The Steam install dialog never calls the frontend `getInstallInfo`
   * helper and never gates Install on `diskSize`, so this stub can't hang
   * it — the historical failure mode it used to imply, `DownloadDialog`
   * spinning forever on the "download size" string, can't recur here.
   * `InstallGameModal.ts`'s short-circuit is no longer the only defense —
   * the dialog's own D-06 contract is.
   */
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

  /**
   * checkGameUpdates calls listUpdateableGames then listAutoUpdateableGames, so the first hands
   * its detection pass to the second (one-shot): one refresh is one detection pass (todo
   * 2026-11-13).
   */
  private pendingDetection: Promise<SteamUpdateState[]> | undefined

  /** Phase 74: stale appIds (bridge and registered) for the badge list; 'unknown' is never listed (D-15). */
  async listUpdateableGames(): Promise<string[]> {
    const p = detectSteamUpdates(this.deps)
    this.pendingDetection = p
    // Nobody may await it (no auto list follows): never an unhandled rejection.
    p.catch(() => undefined)
    try {
      return (await p)
        .filter((s) => s.state === 'stale')
        .map((s) => s.appId)
        .sort()
    } catch (error) {
      logWarning(['Steam update detection failed:', error], LogPrefix.Steam)
      return []
    }
  }

  /** Phase 74 D-02: only bridge games are ever queued without a click; CR-02 drops an already-attempted build. */
  async listAutoUpdateableGames(): Promise<string[]> {
    const p = this.pendingDetection ?? detectSteamUpdates(this.deps)
    this.pendingDetection = undefined
    try {
      const out: string[] = []
      for (const s of await p) {
        if (s.state !== 'stale' || s.kind !== 'bridge') continue
        if (wasAutoUpdateAttempted(this.deps, s)) {
          logInfo(
            `Steam: skipping auto-update for appId ${s.appId}: build ${s.targetBuild ?? '?'} already attempted this session`,
            LogPrefix.Steam
          )
          continue
        }
        out.push(s.appId)
      }
      return out.sort()
    } catch (error) {
      logWarning(['Steam update detection failed:', error], LogPrefix.Steam)
      return []
    }
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

  async refreshInstallState(): Promise<void> {
    return refreshInstallState(this.deps)
  }

  getLaunchOptions(_appName: string): LaunchOption[] {
    return []
  }
}
