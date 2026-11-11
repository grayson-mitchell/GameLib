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
import type LogWriter from 'backend/logger/log_writer'
import { callAbortController } from 'backend/utils/aborthandler/aborthandler'
import { sendFrontendMessage } from '../../ipc'
import {
  addShortcuts as addShortcutsUtil,
  removeShortcuts as removeShortcutsUtil
} from '../../shortcuts/shortcuts/shortcuts'
import type { ManagerDeps } from 'backend/services/types'
import { depotSignalCaptured } from './metadataCapture'
import { fetchMetadataIfNeeded } from './gameMetadata'
import { cancelDelegatedInstall } from './library/installPolling'
import { stopPerGameBridgeBottle } from './bridgeBottleLifecycle'
import * as bridgeBottle from './bridgeBottle'
// Phase 60: Steam overlay in bridged games (macOS).
import {
  readStoredOverlayOverride,
  parseOverlayOverride
} from './bridge/overlay/overlayPolicy'
import { readStoredTitleConfig, pickTitleSettings } from './titleSettings'
import type { NonCrossoverEngine } from 'backend/engine/engineTypes'
import type { EnginePin } from 'backend/engine/enginePins'
import { isNative, isBottleEligible } from './gameEligibility'
import { install, ensureBuiltInEngineForInstall } from './gameInstall'
import { launch, sendLaunchDone } from './gameLaunch'
import { stopSteamLaunchedGame } from './stopSteamLaunchedGame'
import { cancelSteamLaunchWatch } from './steamLaunchWatch'
import { steamLaunchedStopDeps } from './steamLaunchedDeps'
import { moveInstall, repair, syncSaves } from './gameMaintenance'
import { uninstall } from './gameUninstall'

export default class SteamGame implements Game {
  readonly appId: string
  /** Read by the install/uninstall/launch entry modules (66.1 R3). */
  readonly deps: ManagerDeps

  constructor(appId: string, deps: ManagerDeps) {
    this.appId = appId
    this.deps = deps
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
    if (isBottleEligible(this)) {
      // 59-UAT G11: the engine override is per game and written to this
      // title's GameConfig (where the launch reads it), so the shared bottle
      // settings alone made the Settings screen read it back as Automatic.
      const settings = this.deps.steamBottle.getSteamBottleSettings()
      const title = pickTitleSettings(readStoredTitleConfig(this.appId))
      const { readSteamEngineOverride } =
        await import('./engine/steamEngineDeps')
      const override = readSteamEngineOverride(this.appId)
      // 60-UAT G3, same split as 59-UAT G11: the overlay override is also
      // written to the title's GameConfig, so merge it back ('on'/'off' only;
      // anything else stays Automatic, T-60-06-01).
      const overlay = parseOverlayOverride(
        readStoredOverlayOverride(this.appId)
      )
      const overlayOverride =
        overlay === 'on' || overlay === 'off' ? overlay : undefined
      if (
        typeof override !== 'string' &&
        overlayOverride === undefined &&
        Object.keys(title).length === 0
      ) {
        return settings
      }
      return {
        ...settings,
        ...title,
        ...(typeof override === 'string'
          ? { engineOverride: override, steamEngineOverride: override }
          : {}),
        ...(overlayOverride ? { steamOverlayOverride: overlayOverride } : {})
      }
    }
    const gameConfig = this.deps.gameConfigs.get(this.appId)
    return gameConfig.config || (await gameConfig.getSettings())
  }

  /**
   * Returns the in-memory library entry for this game synchronously.
   * When artwork is missing (first access), fires a non-blocking metadata
   * fetch as a side effect — caller gets the current entry immediately
   * and the frontend receives an updated push once the fetch resolves.
   *
   * Debug session steam-library-22-games-missing (2026-08-21): falls back to
   * the persisted `steamLibraryStore` cache when the in-memory `library` Map
   * has not been populated yet (e.g. renderer boot before
   * SteamLibraryManager.refresh()'s CM sync completes). Without this, every
   * caller that hits this gap — most importantly isGameAvailable() below —
   * sees an empty `{}`, which resolves as "not installed" for an owned,
   * previously-installed game and gets persisted into the frontend's
   * `nonAvailableGames` localStorage exclusion list. Mirrors the identical
   * fallback SteamLibraryManager.getGameInfo() (library.ts) already
   * implements for the same reason. Self-heals the in-memory Map on hit so
   * subsequent calls (and the metadata self-heal below) don't repeat the
   * disk read.
   *
   * Quick task 260905-luf (D-01): when BOTH the in-memory Map and the
   * persisted cache miss (below), this deliberately still returns the `{}`
   * sentinel rather than a populated stub — that is a DECISION, not an
   * oversight. `{}` is a cross-runner protocol shared by five store
   * managers: `dispatch.ts:88` converts it to `null` for the frontend,
   * `appShellFlowRegistration.ts:536`'s tray runner resolution relies on a
   * falsy `app_name` to skip this runner, and `library.ts:1257`'s own
   * persisted-cache fallback relies on the same falsy check. Populating a
   * stub here would silently break all three. What WAS silent — the miss
   * itself — is now logged once per appId (T-luf-01/T-luf-02) so it is at
   * least observable; every DownloadManager title consumer is expected to
   * fall back through `resolveGameTitle` (downloadmanager/utils.ts) rather
   * than assume this method never returns an empty object.
   */
  getGameInfo(): GameInfo {
    let existing = this.deps.steamSession.libraryState.library.get(this.appId)
    if (!existing) {
      const cached = this.deps.stores.steam.steamLibraryStore
        .get('games', [])
        .find((g) => g.app_name === this.appId)
      if (cached) {
        this.deps.steamSession.libraryState.library.set(this.appId, cached)
        existing = cached
      }
    }
    if (!existing) {
      if (
        !this.deps.steamSession.gameSession.loggedEmptyGameInfoMisses.has(
          this.appId
        )
      ) {
        this.deps.steamSession.gameSession.loggedEmptyGameInfoMisses.add(
          this.appId
        )
        logWarning(
          [
            `SteamGame.getGameInfo(): double cache miss for appId ${this.appId} —`,
            'both the in-memory library Map and the persisted steamLibraryStore',
            'missed. Returning the {} sentinel (logged once per appId; see',
            '260905-luf).'
          ],
          LogPrefix.Steam
        )
      }
      return {} as GameInfo
    }

    // Trigger lazy metadata fetch as fire-and-forget side effect (D-04).
    // Also self-heal games cached before DETAIL-01 shipped: their art_cover is
    // populated (so the original guard skipped the fetch) but their platform
    // support was never captured. Re-fetch once when platformsCaptured is not yet
    // true — excluding delisted games, whose terminal branch returns before
    // capturing platforms (avoids a re-fetch loop). fetchMetadataIfNeeded's
    // pendingFetches dedup (T-2-03) absorbs repeated calls while a fetch is in flight.
    const cached = this.deps.stores.steam.steamMetadataStore.get(this.appId)
    // Quick task 260816-hdg: resolved via depotSignalCaptured rather than the
    // bare flag, so a pre-D-17 residue entry (flagged complete, missing the
    // depot field the fetch was obliged to write) is recognised as NOT captured
    // and this existing self-heal refetch engages for it. Convergence is exactly
    // one fetch per appId, not a loop: the refetch writes the depot field
    // unconditionally (the `!!` coercion in fetchMetadataIfNeeded below), so the
    // predicate flips true on the next read, with pendingFetches dedup and
    // acquireMetadataSlot already bounding the burst across a library render.
    const platformsNeverCaptured =
      !existing.is_delisted && !depotSignalCaptured(cached)
    // 08.1 review WR-02: the art-based trigger needs the SAME delisted gate as
    // the platform one. The delisted branch below writes `art_cover: ''` for an
    // appId that was never enriched and returns before populating it, so a game
    // whose FIRST-EVER fetch came back `success:false` leaves this predicate
    // permanently true — one store request plus one `pushGameToLibrary` per
    // getGameInfo, forever. pendingFetches only dedups CONCURRENT calls, so it
    // never breaks that sequential loop.
    const artNeverFetched = !existing.is_delisted && !existing.art_cover
    if (artNeverFetched || platformsNeverCaptured) {
      // steam-startup-resume-crash (2026-07-18) hardening: fetchMetadataIfNeeded
      // already catches its own axios call internally, but this is the ONE
      // true fire-and-forget invocation of it in this module (a `void` call
      // does NOT prevent an unhandled rejection if anything ever throws
      // before/around that internal try — e.g. a future refactor of the
      // concurrency-slot wait above it). Chain an explicit .catch() so this
      // call site can never produce an unhandled rejection, full stop.
      void fetchMetadataIfNeeded(this, existing).catch((err) => {
        logWarning(
          [
            `SteamGame: unexpected error in background metadata fetch for appId ${this.appId} (never blocks getGameInfo):`,
            err
          ],
          LogPrefix.Steam
        )
      })
    }

    return existing
  }

  /**
   * Returns the in-memory GameInfo.extra (populated by fetchMetadataIfNeeded)
   * or a safe default when extra is absent.
   * Analog: nile/games.ts lines 95-107.
   */
  async getExtraInfo(): Promise<ExtraInfo> {
    // Phase 54: a game page reads cached metadata only; opening it must not
    // log on (ROADMAP SC2; debug friends-signout-steam-user). The call below
    // only labels later keyring reads, it reads no keyring and opens no
    // connection.
    this.deps.steamSession.authTrigger.noteSteamAuthTrigger('game-page')
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
   * Does NOT call sendProgressUpdate itself — Steam owns the download. The
   * OFF-path pollInstallOnce() poller (library.ts) DOES stream a live
   * percent/downSpeed/eta over the same progressUpdate channel, derived from
   * the ACF's own byte counters, so the frontend still shows real progress
   * even though install() here never drives it directly. Install state is
   * never optimistically flipped on click (D-02); badge reconciliation
   * happens when the user tabs back (focus → ACF re-read, D-01).
   *
   * Phase 17 (D-10/D-11): a confirmed-not-native macOS game routes through the
   * bottled Steam client instead of native steam:// — see isBottleEligible().
   *
   * D-17 (34.13-06): an explicit install-time override
   * (args.steamForceWindowsViaBottle) can additionally route a CONFIRMED
   * mac-native game into that same bottled path. Read ONLY from this
   * explicit InstallArgs field — never from platformToInstall, which
   * installSteamGame() hardcodes to 'Windows' for EVERY Steam install and
   * which this backend reads nowhere else; keying on it would flip every
   * mac-native install into the bottle. Triple-gated at the top of the
   * method body: the field is `=== true`, the host isMac (D-18 — GameLib
   * owns no Windows-compat path for Steam on Linux/Windows), and the
   * persisted steamMetadataStore is_windows_native verdict is `=== true`.
   * false/undefined on any gate fails closed to today's routing. It is a
   * boolean OR at the branch head — it can only turn a false
   * isBottleEligible() verdict true, never remove an already-eligible game
   * from the bottle path, and it deliberately does NOT extend
   * isBridgeEligible() (a forced install never enters the Phase 24 bridge).
   * ⚠ Unplanned lifecycle divergence (T-34.13-06-06): the override is
   * install-time only and is not persisted, so getSettings()/isNative()/
   * launch()/uninstall() remain unaware of a forced install after this call
   * returns — see 34.13-06-SUMMARY.md's handoffs for the full escalation.
   */
  install(args: InstallArgs): Promise<InstallResult> {
    return install(this, args)
  }

  /**
   * engineSwitch's pin source: downloads with the same engine-download statuses as a launch.
   *
   * @internal Public only so lifted modules reach it via
   * steamGame.restorePinEngine() (class-bound callback handed to engineSwitch
   * by gameInstall/gameLaunch); do not call from outside steam/.
   */
  restorePinEngine = async (
    pin: EnginePin
  ): Promise<NonCrossoverEngine | null> => {
    const result = await ensureBuiltInEngineForInstall(this, pin)
    return 'status' in result ? null : result
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
    return isNative(this)
  }

  /**
   * Writes the per-OS shortcut through the shared shortcuts module. The target is
   * `gamelib://launch?appName={appId}&runner=steam`; protocol.ts hands that to
   * dispatchSteamLaunch, so a shortcut launch takes the same bridge/bottle/native route as the
   * Play button. It deliberately does not open `steam://rungameid` directly, which would skip
   * that routing.
   */
  async addShortcuts(fromMenu?: boolean): Promise<void> {
    return addShortcutsUtil(this.deps, this, fromMenu)
  }

  async removeShortcuts(): Promise<void> {
    return removeShortcutsUtil(this.deps, this)
  }

  /**
   * Delegates launching to the Steam client through a steam:// URL:
   * `steam://launch/<appId>/Dialog` on Windows (quick 261029-i1n) and
   * `steam://rungameid/<appId>` on macOS and Linux.
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
  launch(
    _logWriter: LogWriter,
    _launchArguments?: LaunchOption,
    _args?: string[],
    _skipVersionCheck?: boolean
  ): Promise<boolean> {
    return launch(this, _logWriter, _launchArguments, _args, _skipVersionCheck)
  }

  moveInstall(_newInstallPath: string): Promise<InstallResult> {
    return moveInstall(this, _newInstallPath)
  }

  /**
   * quick 261026-lif: restores the game-original steam_api(64).dll behind every
   * placed bridge shim as `<shim>.gamelib-orig`, from the Steam depot. Scope is
   * bridge titles' steam_api originals only; a full-depot verify is out of
   * scope. The next launch sees the new backup and rescans (shimGenerate.ts).
   */
  repair(): Promise<ExecResult> {
    return repair(this)
  }

  syncSaves(
    _arg: string,
    _path: string,
    _gogSaves?: GOGCloudSavesLocation[]
  ): Promise<string> {
    return syncSaves(this, _arg, _path, _gogSaves)
  }

  /**
   * debug/steam-bottle-uninstall-reverts (OPERATOR PRODUCT DECISION, LOCKED):
   * uninstall routing is driven SOLELY by where the library entry's own
   * recorded `install.install_path` resolves (resolveInstallRoot(deps), library.ts)
   * — never by title attributes (isBottleEligible() / forcedWindowsViaBottle /
   * forcedWindowsViaBottle). Those attributes may still legitimately decide OTHER
   * things (install destination, getSettings()/launch() routing) — only the
   * UNINSTALL routing decision changed here.
   *
   * This closes a real data-loss defect: for a DUAL-installed title (one copy
   * in the CrossOver bottle, one native — concretely reproduced with Hoard),
   * title-attribute routing deleted whichever root the ATTRIBUTES pointed at,
   * which could be the copy the user was NOT looking at, while the library
   * entry (and its "uninstalled" toast) kept representing the OTHER, untouched
   * copy. install_path is the single source of truth for what the user is
   * actually looking at, so it is now the single source of truth for what gets
   * deleted:
   *   - resolves inside the bottle's steamapps/common/  -> direct bottle
   *     deletion (uninstallBottleGameDirectly(), unchanged mechanism —
   *     LIVE-CONFIRMED correct, do not re-diagnose)
   *   - resolves inside ANY registered native Steam library's
   *     steamapps/common/ (libraryfolders.vdf can register more than one) ->
   *     native steam://uninstall delegation (unchanged mechanism, below)
   *   - resolves inside NEITHER -> refuse and report an error, delete
   *     nothing. A stale/empty/unresolvable install_path must never fall
   *     through to deleting anything anyway — this is the branch that closes
   *     the wrong-root defect for good.
   *
   * Two pre-existing routing checks are kept EXACTLY as before, ahead of the
   * install_path decision (neither is part of the bottle-vs-native routing bug
   * this fix addresses):
   *   - Phase 24 bridge routing (isBridgeEligible()): the bridge bottle
   *     (GameLibSteamBridge) is a THIRD, separately-provisioned root that
   *     resolveInstallRoot(deps) does not model — see its own JSDoc.
   *   - bottle-eligible-but-unprovisioned (D-10/D-11): nothing could
   *     legitimately be installed in a bottle that was never provisioned;
   *     request guided setup rather than a generic refuse.
   *
   * quick 261106-s3n: with "Delete Steam games directly in GameLib" ON the
   * native root is handled by uninstallNativeInGameLib() instead (refuse while
   * running, Steam's UninstallApp, else GameLib deletes the files itself); no
   * steam:// URL is opened. OFF keeps the delegation below.
   *
   * Native delegation itself is unchanged (one exception, quick 261029-l9w: a
   * Mac install the running Steam never adopted is removed directly, see
   * uninstallUnadoptedMacNativeDirectly()): does NOT show a GamerLib
   * confirmation dialog — Steam owns its own confirm dialog (D-05). Install
   * state is never optimistically flipped from a click (D-02); badges flip
   * only after confirmed ACF data. After the URL fires we poll the ACF (D-07)
   * so the badge updates without a focus round-trip; the focus re-read (D-01)
   * remains as a backstop.
   */
  uninstall(_args: RemoveArgs): Promise<ExecResult> {
    return uninstall(this, _args)
  }

  async update(): Promise<InstallResult> {
    // quick-260817-d61: Update is a deliberate Steam action — unlock the
    // keyring deferral gate as the first statement.
    this.deps.steamSession.authTrigger.noteSteamAuthTrigger('user-install')
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
   * Marks the game not-installed in the in-memory library Map (keep-entry —
   * mirrors pollUninstallOnce()'s 'absent' branch in library.ts) and notifies
   * the frontend to update its install badge immediately (is_installed: false).
   * This is for cases where Steam's own uninstall dialog has already completed
   * but the in-memory state has not been reconciled via the focus ACF re-read.
   *
   * The entry is intentionally KEPT (never this.deps.steamSession.libraryState.library.delete'd): removing it would
   * orphan an owned game and drop badge-relevant fields (e.g. mac_arch:'32')
   * during an i386-recovery forceUninstall, which — if a subsequent bottle
   * reinstall does not complete — would leave the game permanently missing
   * from both the in-memory library and the persisted store
   * (GAP-18-06-FORCEUNINSTALL-ORPHAN). The spread onto `existing` preserves
   * every other field. The mutated Map is persisted immediately to
   * steamLibraryStore (GAP-17-BOTTLE-STORE-DIVERGENCE class) so the
   * not-installed state cannot diverge on the next persist. When the appId is
   * absent from the Map, no entry is fabricated and no push is made.
   * Analog: gog/games.ts lines 1282-1288; keep-entry pattern: library.ts
   * pollUninstallOnce() 'absent' branch (~1131-1144).
   */
  async forceUninstall(): Promise<void> {
    const existing = this.deps.steamSession.libraryState.library.get(this.appId)
    if (existing) {
      const updated: GameInfo = {
        ...existing,
        is_installed: false,
        install: {}
      }
      this.deps.steamSession.libraryState.library.set(this.appId, updated)
      // GAP-17-BOTTLE-STORE-DIVERGENCE / GAP-18-06: persist immediately so the
      // not-installed (badge-preserving) state is not lost on the next persist.
      this.deps.stores.steam.steamLibraryStore.set(
        'games',
        Array.from(this.deps.steamSession.libraryState.library.values())
      )
      sendFrontendMessage('pushGameToLibrary', updated)
    }
    logInfo(
      `SteamGame: force-uninstalled appId ${this.appId} — kept in-memory library entry marked not-installed`,
      LogPrefix.Steam
    )
  }

  /**
   * Stop the game, by route:
   * - native depot download in flight (D-02, SNI-07): abort it;
   * - Steam-owned (delegated) install poll: stop GameLib's wait (261105-vfq);
   * - bridge launch (GameLib spawned the Wine command itself, quick
   *   261024-urq): `wineserver -k` the game's own per-game bottle, stop the
   *   helper, and end the monitor (terminal `done`, UI leaves Playing). A game
   *   in the legacy shared bridge bottle gets the helper/monitor teardown but
   *   no kill, since a bottle-wide kill would take out other games;
   * - bottled-Steam launch (261024-gvu): end the monitor only, nothing is
   *   killed (separate decision, left as is);
   * - Steam-launched (native Mac/Linux titles, steam://rungameid; quick
   *   261111-9b7): SIGTERM the PIDs whose executable is inside the install
   *   folder, bounded grace, SIGKILL survivors, then terminal `done`. On
   *   win32 (quick 261111-9p6) the PIDs come from a PowerShell CIM listing by
   *   executable path, the close request is `taskkill /PID` without force, and
   *   survivors are force-ended. Only "nothing found" stays a no-op.
   * Mirrors downloadqueue.ts's own stopCurrentDownload ->
   * callAbortController(appName) call site. Analog: gog/games.ts lines
   * 1291-1295.
   */
  async stop(_stopWine?: boolean): Promise<void> {
    const inFlight =
      this.deps.steamSession.gameSession.nativeInstallsInFlight.get(this.appId)
    if (inFlight) {
      logInfo(
        `SteamGame: aborting in-flight native depot download for appId ${this.appId}`,
        LogPrefix.Steam
      )
      // T-23-15: flip the tracked entry's abort state alongside the real
      // AbortController so a subsequent installDepotDownload() call (pause ->
      // resume) can tell this run is tearing down rather than still live.
      inFlight.aborted = true
      callAbortController(this.appId)
      return
    }

    // Delegated-install cancel route (IPC kill -> dispatch.kill -> stop();
    // quick 261105-vfq): stops GameLib's wait for a Steam-owned install.
    if (cancelDelegatedInstall(this.deps, this.appId)) return

    // quick 261024-urq: bridge route. GameLib spawned the Wine command itself,
    // so (unlike bottled Steam) it can and must end it. Kill only the game's
    // OWN per-game bottle: the recorded bottle must equal
    // bridgeBottleNameFor(appId) (T-urq-02).
    const bridgeRecord =
      this.deps.steamSession.gameSession.bridgeLaunchBottles.get(this.appId)
    if (bridgeRecord) {
      this.deps.steamSession.gameSession.bridgeLaunchBottles.delete(this.appId)
      if (
        bridgeRecord.bottle === bridgeBottle.bridgeBottleNameFor(this.appId)
      ) {
        logInfo(
          `SteamGame.stop: stopping bridge-launched appId ${this.appId} — wineserver -k in its per-game bottle ${bridgeRecord.bottle}`,
          LogPrefix.Steam
        )
        const result = await stopPerGameBridgeBottle(this.deps, this.appId)
        if (result.status !== 'stopped') {
          logWarning(
            `SteamGame.stop: per-game bridge bottle stop for appId ${this.appId} returned ${result.status}${'error' in result ? ` (${result.error})` : ''}`,
            LogPrefix.Steam
          )
        }
      } else {
        logWarning(
          `SteamGame.stop: appId ${this.appId} runs in the shared bridge bottle ${bridgeRecord.bottle}; refusing the bottle-wide wineserver -k (it would kill other games) — the game process is not killed`,
          LogPrefix.Steam
        )
      }
      this.deps.bridgeHelpers.stop(this.appId)
      const { stopBottleProcessMonitor: endMonitor } =
        await import('./bottleProcessMonitor')
      endMonitor(this.appId)
      return
    }

    // quick/261024-gvu: a pending bottle/bridge monitor holds `launching`
    // with no deadline (LD-4); ending it is the user's escape hatch. This does
    // NOT kill the game process (Steam/Wine still owns it) — it only ends
    // GameLib's wait/tracking and emits the terminal `done`.
    const { getBottleProcessMonitorPhase, stopBottleProcessMonitor } =
      await import('./bottleProcessMonitor')
    const livePhase = getBottleProcessMonitorPhase(this.appId)
    if (livePhase) {
      logInfo(
        `SteamGame.stop: ending ${livePhase} launch monitor for appId ${this.appId} (the game process itself is not killed)`,
        LogPrefix.Steam
      )
      stopBottleProcessMonitor(this.appId)
      return
    }

    // quick 261111-9mj: cancel the launch watch first so exactly one `done`
    // reaches the frontend whatever the stop outcome.
    const watch = cancelSteamLaunchWatch(
      this.deps.libraryManagers.steam.launchWatches,
      this.appId
    )
    const outcome = await stopSteamLaunchedGame(
      steamLaunchedStopDeps(this.deps),
      this.appId
    )
    if (outcome.kind === 'stopped') {
      sendLaunchDone(this)
      return
    }
    if (watch.shown) {
      logInfo(
        `SteamGame.stop: ending Playing state for appId ${this.appId} (${outcome.kind})`,
        LogPrefix.Steam
      )
      sendLaunchDone(this)
    }

    logWarning(
      `SteamGame.stop: Steam owns process lifecycle for appId ${this.appId}; no-op (${outcome.kind}${outcome.kind === 'failed' ? `: ${outcome.error}` : ''})`,
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
      // LIB-07's forced-hide reading is SUPERSEDED by REQ-37-02 / D-15: a
      // delisted store page is no longer treated as non-availability here.
      // is_delisted is now user-driven filterable state (filterEngine's
      // delisted facet), not an availability verdict. This function answers
      // only "is this game installed and is its install_path on disk" --
      // the same question its gog/nile/legendary analogs answer.
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
