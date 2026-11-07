import {
  GameInfo,
  ExecResult,
  InstallPlatform,
  InstallInfo,
  LaunchOption
} from 'common/types'
import { LibraryManager } from 'common/types/game_manager'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { sendFrontendMessage } from '../../../ipc'
import { notify } from '../../../dialog/dialog'
import i18next from 'i18next'
import { SteamUser } from '../user'
import { noteSteamAuthTrigger } from '../authTrigger'
import { steamLibraryStore, steamMetadataStore } from '../stores'
import { runOnceWhenOnline } from 'backend/online_monitor'
import { library } from '../state'
import SteamGame from '../games'
import { isNativeInstallInFlight } from '../gameSessionState'
import { scanDownloadingAppIds } from './acfState'
import {
  getReconcileRanDuringRearm,
  setReconcileRanDuringRearm
} from './restartHold'
import {
  clearSteamResumeBreadcrumb,
  getSteamResumeBreadcrumbAppIds,
  breadcrumbAppIsFullyInstalledOnDisk
} from './resumeBreadcrumbs'
import { rearmPersistedSteamRestartHolds } from './resume'
import { startRunningPoll } from './runningPoll'
import { refresh, refreshInstallState } from './refresh'

export default class SteamLibraryManager implements LibraryManager {
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

    // quick 261029-pkp: re-arm persisted "Restart Steam to finish" holds
    // before anything can reconcile install state.
    const { dropped } = await rearmPersistedSteamRestartHolds()
    if (dropped > 0 && getReconcileRanDuringRearm()) {
      setReconcileRanDuringRearm(false)
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
    // appmanifest_*.acf at all, so scanDownloadingAppIds() below can never
    // see it. getSteamResumeBreadcrumbAppIds() is the in-memory (never
    // throws) counterpart, sourced from the install-start breadcrumb
    // (markSteamNativeInstallStarted, games.ts). Unioning the two lists is
    // load-bearing, not additive convenience: without it, case C has no
    // record ANYWHERE after a restart. The ACF scan is narrowed to its own
    // try so a scan failure (which case C triggers by definition — there IS
    // no ACF) can never skip breadcrumb surfacing.
    const breadcrumbIds = getSteamResumeBreadcrumbAppIds()
    const breadcrumbSet = new Set(breadcrumbIds)
    let downloadingIds: string[] = []
    try {
      downloadingIds = await scanDownloadingAppIds()
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
      if (isNativeInstallInFlight(appId)) {
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
        const existing = library.get(appId)

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
          breadcrumbAppIsFullyInstalledOnDisk(appId, existing?.install)
        ) {
          clearSteamResumeBreadcrumb(appId)
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
          library.set(appId, updated)
          sendFrontendMessage('pushGameToLibrary', updated)
        }

        logInfo(
          `Steam: appId ${appId} has an interrupted install detected on startup — surfacing as resumable, NOT auto-resuming`,
          LogPrefix.Steam
        )

        notify({
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
    if (SteamUser.isLoggedIn()) {
      noteSteamAuthTrigger('startup')
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

  async refresh(): Promise<ExecResult | null> {
    return refresh()
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

  getListOfGames(): GameInfo[] {
    return steamLibraryStore.get('games', [])
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

  async refreshInstallState(): Promise<void> {
    return refreshInstallState()
  }

  getLaunchOptions(_appName: string): LaunchOption[] {
    return []
  }
}
