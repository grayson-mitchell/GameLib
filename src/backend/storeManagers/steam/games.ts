import axios from 'axios'
import i18next from 'i18next'
import { app, shell } from 'backend/platform'
import { existsSync } from 'graceful-fs'
import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  rmSync
} from 'node:fs'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from 'node:path'
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
import { parseMetacriticScore } from 'common/metacriticScore'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { checkConnectivityNow } from 'backend/connectivityNow'
import { notify, showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { newDialogAckId, trackDialogDisplay } from 'backend/dialog/displayAck'
import { sendGameStatusUpdate } from 'backend/utils'
import type LogWriter from 'backend/logger/log_writer'
import { GameConfig } from 'backend/game_config'
import { isMac, isWindows } from 'backend/constants/environment'
import {
  createAbortController,
  callAbortController
} from 'backend/utils/aborthandler/aborthandler'
import { sendFrontendMessage } from '../../ipc'
import {
  addShortcuts as addShortcutsUtil,
  removeShortcuts as removeShortcutsUtil
} from '../../shortcuts/shortcuts/shortcuts'
import {
  steamMetadataStore,
  steamLibraryStore,
  type SteamBridgeVerdict
} from './electronStores'
import { depotSignalCaptured } from './metadataCapture'
import { knownFixSaysMac32 } from './macArchKnownFix'
import { resolvePlatformWrite } from './platformPrecedence'
import {
  library,
  pendingFetches,
  acquireMetadataSlot,
  releaseMetadataSlot,
  METADATA_FETCH_TIMEOUT_MS
} from './state'
import {
  cancelDelegatedInstall,
  startUninstallPolling,
  readAcfState,
  pollUninstallOnce,
  resolveInstallRoot,
  findOtherManifestsWithInstalldir,
  removeSteamInstallCopy
} from './library'
import {
  probeMacSteamPid,
  readAcfSnapshot,
  readPendingAdoption,
  clearPendingAdoption,
  decidePlayAdoption,
  restartMacSteamForAdoption
} from './macSteamAdoption'
import {
  isBottleReady,
  tellBottledSteamToLaunch,
  getSteamBottleSettings,
  getBottleSteamappsDir,
  getBottleDir,
  isBridgeBottleReady,
  getBridgeBottleSettings,
  bridgeBottleNameFor,
  removePerGameBridgeBottle,
  stopPerGameBridgeBottle,
  findBridgeInstallBottle,
  getDrmBridgeRunner,
  clearDrmBridgeRunner,
  setOverlayBridgeRunner,
  endPerGameBridgeBottleSessionWith,
  killBridgeBottleWineServer
} from './bottle'
// Phase 60: Steam overlay in bridged games (macOS).
import {
  appendCxEnvTokens,
  mergeOverlayEnvVars,
  overlayInputProbeFromEnv,
  prepareOverlayEnv,
  prepareOverlayLaunch,
  prepareOverlayTokens,
  type OverlayLaunchPayload
} from './bridge/overlay/overlayLaunch'
import {
  resolveOverlayEnabled,
  readStoredOverlayOverride,
  parseOverlayOverride,
  isAbnormalOverlayExit
} from './bridge/overlay/overlayPolicy'
import { readStoredTitleConfig, pickTitleSettings } from './titleSettings'
import {
  watchOverlayAttach,
  OVERLAY_ATTACH_DRM_TIMEOUT_MS,
  macSteamConsoleLogPath
} from './bridge/overlay/overlayAttachWatch'
import {
  openOverlayWineLog,
  createShimLineForwarder
} from './bridge/overlay/overlayWineLog'
import { buildOverlayPaths } from './bridge/overlay/overlayPaths'
import {
  formatOverlayExitNoticeLine,
  formatOverlayNoticeLine,
  OVERLAY_STEP_TEXT,
  type OverlayStep
} from './bridge/overlay/overlayNotice'
import {
  publishOverlayNotice,
  publishOverlayExitNotice
} from './engine/engineState'
import { readKnownFixes } from 'backend/knownFixes'
import type { OverlayRunnerReady } from './bridge/overlay/overlayRunnerClone'
import { isSteamNativeDeleteEnabled } from './nativeInstallSetting'
import { decideSteamNativeDelete } from './nativeDelete'
import { DEFAULT_STEAM_BOTTLE_NAME } from './constants'
import type { CrossoverPreflight } from './engine/engineDecision'
import type { EngineSelection, NonCrossoverEngine } from './engine/engineTypes'
import type { LaunchDeadline } from './engine/launchDeadline'
import { noteSteamAuthTrigger } from './authTrigger'
// quick-260817-d61: verified during planning that user.ts imports nothing
// from games.ts (no import of './games' anywhere in user.ts), so this
// introduces no cycle. Used ONLY by getExtraInfo()'s fire-and-forget
// locked->unlocked transition below — install()/update()/launch() only need
// noteSteamAuthTrigger, not SteamUser itself.
import { type AuthSessionRefusal } from './user'
import { placeShimForGame } from './bridge/shimGenerate'
import { detectLaunchDrmWrapper } from './bridge/drm/drmScanExe'
import { detectSteamDrmInPe } from './bridge/peSteamDrm'
import {
  drmLaunchSetup,
  prefetchDrmDownloads,
  DRM_END_SESSION_TIMEOUT_MS,
  type DrmLaunchReady
} from './bridge/drm/drmLaunchSetup'
import {
  resolveBridgeMode,
  formatDrmNoticeLine,
  formatBridgeDrmAnchor,
  drmStepError,
  type DrmStep
} from './bridge/drm/steamclientLayerMode'
import { restoreBridgeSteamApiOriginals } from './bridge/originalRestore'
import {
  resolveBridgeLaunchExe,
  resolveBridgeLaunchWorkingDir
} from './bridge/launchTarget'
import {
  ensureBridgeHelperReady,
  stopBridgeHelper
} from './bridge/helperProcess'
import { writeBridgeConfig } from './bridge/bridgeConfig'
// Phase 51 Plan 09 (D-51-07/09): the pure routing resolver + the persisted
// verdict read/clear family + the current-shim coverage check. games.ts is
// the sole assembler of resolveBridgeRoute's input and the sole writer of
// the persisted verdict (bridgeRoute.ts's own header).
import { type BridgeRouteInput } from './bridge/bridgeRoute'
import {
  readBridgeVerdict,
  writeBridgeScanVerdict,
  markBridgeLimitedNoticeShown,
  setBridgeIdentityFallback,
  writeBridgeModeVerdict
} from './bridge/bridgeVerdict'
import {
  builtOverlayShimPath,
  builtOverlayInputPath,
  builtOverlayInputProbePath,
  appFolder,
  userHome
} from 'backend/constants/paths'
import type { SteamBridgeRouteVerdict } from 'common/types/steam'
import type { EnginePin } from './engine/enginePins'
import { STEAM_STORE_API } from './gameConstants'
import {
  nativeInstallsInFlight,
  bridgeLaunchesInFlight,
  bridgeLaunchBottles,
  bridgeFailedThisSession,
  loggedEmptyGameInfoMisses,
  markBridgeFailedThisSession
} from './gameSessionState'
import { macArchFromMinOS } from './gameRequirements'
import { buildSteamProtocolUrl } from './gameProtocolUrl'
import {
  DRM_DLLPATH_CHANNEL,
  DRM_DLLOVERRIDES_CHANNEL,
  DRM_REGISTRY_TIMEOUT_MS,
  MAC_STEAM_CLIENT_SUBPATH,
  buildDrmLaunchEnvironment,
  drmBottleWinPath,
  drmWineLogPathFor,
  drmWineDebugFromEnv,
  createDrmWineLogAppender,
  prepareDrmTraceFile,
  relogDrmTrace,
  drmModeNoticeShownThisSession,
  engineLabelForLog,
  type DrmWineLaunch,
  drmStepNoticeText
} from './gameDrmLaunch'
import {
  isNative,
  isBottleEligibleFromPlatforms,
  isForcedWindowsViaBottle,
  isBottleEligible,
  assembleBridgeRouteInput,
  bridgeRoute,
  checkBridgeRoute,
  isBridgeEligible,
  clearStaleBridgeVerdict,
  checkBottleEligibility,
  ensurePlatformsCaptured
} from './gameEligibility'
import {
  install,
  removeDemotedNativeOrphan,
  installNative,
  hasBottledSteamCopy,
  installBottleNative,
  crossoverRequiredError,
  ensureBuiltInEngineForInstall,
  installBridgeGame,
  provisionBridgeBottleForInstall,
  resolveInstallEngineSettings,
  installBridgeGameLeased,
  persistBridgeDrmSignal,
  reconcileBridgePrescreen,
  resolveBridgeGameInstallRoot,
  markBridgeGameInstalled,
  markBridgeGameUninstalled,
  installDepotDownload,
  runNativeDepotDownload,
  installResultForRefusal,
  runNativeDepotDownloadLeased
} from './gameInstall'

/** The project-wide appId shape guard (clientSetup.ts, installFormIpc.ts,
 * bottle.ts, bridge/allowlist.ts all carry the identical regex). Used by
 * uninstallBottleGameDirectly to validate a renderer-supplied appId before it
 * is interpolated into a filesystem delete target — 34.13 review A-12. */
const NUMERIC_APP_ID = /^\d+$/

const STEAM_CDN_BASE = 'https://cdn.cloudflare.steamstatic.com/steam/apps'

/**
 * Phase 60 (D-10): how long after the process monitor reports the game gone we
 * wait for the wine wrapper's exit code before deciding on lifetime alone.
 */
const OVERLAY_EXIT_GRACE_MS = 3000

// 60-18 `## G1 experiment verdict`: verdict code and `fix routes:` line. The
// DRM route is never in the set (D-04: unchanged).
const OVERLAY_INPUT_FIX_CODE = 'X-RELEASE+BLOCK'
const OVERLAY_INPUT_FIX_ROUTES: ReadonlySet<string> = new Set([
  'tcp-clone',
  'env'
])

export default class SteamGame implements Game {
  readonly appId: string

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
      // 59-UAT G11: the engine override is per game and written to this
      // title's GameConfig (where the launch reads it), so the shared bottle
      // settings alone made the Settings screen read it back as Automatic.
      const settings = getSteamBottleSettings()
      const title = pickTitleSettings(readStoredTitleConfig(this.appId))
      const { readStoredEngineOverride } =
        await import('./engine/engineDecision')
      const override = readStoredEngineOverride(this.appId)
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
          ? { steamEngineOverride: override }
          : {}),
        ...(overlayOverride ? { steamOverlayOverride: overlayOverride } : {})
      }
    }
    const gameConfig = GameConfig.get(this.appId)
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
    let existing = library.get(this.appId)
    if (!existing) {
      const cached = steamLibraryStore
        .get('games', [])
        .find((g) => g.app_name === this.appId)
      if (cached) {
        library.set(this.appId, cached)
        existing = cached
      }
    }
    if (!existing) {
      if (!loggedEmptyGameInfoMisses.has(this.appId)) {
        loggedEmptyGameInfoMisses.add(this.appId)
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
    const cached = steamMetadataStore.get(this.appId)
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
      void this.fetchMetadataIfNeeded(existing).catch((err) => {
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
   * Fetches title, description, genres, and artwork from the Steam store
   * appdetails API.  Deduplicates concurrent calls via module-level
   * `pendingFetches` Set (T-2-03 mitigation): the appId is added to the Set
   * BEFORE the first await so subsequent synchronous callers see it immediately.
   *
   * On success: caches metadata in steamMetadataStore (D-05) and pushes the
   * enriched GameInfo to the frontend via sendFrontendMessage.
   * On failure: logs a warning and returns silently (no throw).
   */
  async fetchMetadataIfNeeded(current: GameInfo): Promise<void> {
    // Guard: if a fetch is already in-flight for this appId, return immediately
    // (pendingFetches.add MUST come before the await — prevents T-2-03 race)
    if (pendingFetches.has(this.appId)) return

    // Guard: non-numeric appId rejected before any URL is constructed (T-06-01),
    // matching the sibling chokepoints getSteamInstallSize and
    // buildSteamProtocolUrl. 08.1 review WR-03: this method interpolates
    // `this.appId` into a store.steampowered.com query string AND into two
    // cdn.cloudflare.steamstatic.com image URLs that are pushed to the renderer
    // as <img src>, so it is exactly the shape those two already validate.
    // Placed AFTER the dedup check and BEFORE the syncing-indicator flip so a
    // rejected appId cannot leave the indicator stuck on.
    if (!NUMERIC_APP_ID.test(this.appId)) {
      logWarning(
        `SteamGame: fetchMetadataIfNeeded rejected a non-numeric appId (T-06-01)`,
        LogPrefix.Steam
      )
      return
    }
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
          ...(existing ?? {
            art_cover: '',
            art_square: '',
            extra: { reqs: [] }
          }),
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

      // DETAIL-01: capture native platform support from appdetails, for all
      // three platforms. D-17: the Windows flag is a pre-install
      // depot-availability signal for the install form's selectable macOS
      // platform row — it comes from this SAME response, so it adds no new
      // network call, no PICS query, and involves none of the four install
      // branches' routing logic.
      const is_mac_native = !!data.platforms?.mac
      const is_linux_native = !!data.platforms?.linux
      const is_windows_native = !!data.platforms?.windows

      // Quick 261029-sbi: appdetails `metacritic.score` (a number), validated
      // by the shared parser. Absent keeps whatever was already captured.
      const metacritic_score = parseMetacriticScore(data.metacritic?.score)

      // Quick task 260816-qcn (WR-02/CR-01): this appdetails fetch is one of
      // TWO independent writers of the platform triple — platformCapture.ts's
      // bulk PICS `oslist` capture is the other. resolvePlatformWrite (D-A)
      // decides, by strict timestamp comparison, whether THIS write's triple
      // or the EXISTING cached triple is the one actually used below. See
      // `./platformPrecedence`'s header for the full rule and its honesty
      // limit (D-B): freshest-write-wins makes the ordering explicit and
      // auditable and makes a silently-lost write impossible — it does NOT
      // reconcile a genuine appdetails-vs-PICS disagreement. When the two
      // sources disagree about an app, the surviving answer still depends on
      // which sync ran most recently; `platformsSource`/`platformsCapturedAt`
      // are what make that outcome inspectable after the fact. Do not
      // describe WR-02 as closed.
      const existingMeta = steamMetadataStore.get(this.appId)
      const resolution = resolvePlatformWrite(
        existingMeta,
        { is_windows_native, is_mac_native, is_linux_native },
        'appdetails',
        Date.now()
      )
      // The EFFECTIVE triple — NEVER the raw appdetails values above — is
      // used everywhere downstream in this function. A declined cache write
      // that still pushed the raw appdetails triple to the frontend would
      // recreate CR-01's exact shape (a stale seed reaching the install
      // dialog's glyph row) with the polarity flipped.
      const {
        is_windows_native: effectiveIsWindowsNative,
        is_mac_native: effectiveIsMacNative,
        is_linux_native: effectiveIsLinuxNative
      } = resolution.platforms

      // MAC32-01 (direction B): derive the pre-install arch hint from the
      // SAME appdetails response — no separate network/PICS call. Gated:
      //  1. Never overwrite a Mach-O-verified entry (post-install ground
      //     truth always wins — a cheap heuristic must not regress a
      //     confirmed fact, T-18-02-04).
      //  2. Only compute when the EFFECTIVE is_mac_native is true (Pitfall 2;
      //     quick task 260816-qcn: gated on the EFFECTIVE flag, never the raw
      //     appdetails one, so a declined write cannot derive mac_arch from a
      //     platform triple that just lost the precedence decision) — a false
      //     is_mac_native already routes correctly via the existing
      //     isBottleEligible() D-11 OR-branch, making this signal moot.
      const macArchVerified = existingMeta?.mac_arch_verified === true
      const knownFix32 = knownFixSaysMac32(this.appId, existingMeta)
      const mac_arch: GameInfo['mac_arch'] = macArchVerified
        ? existingMeta.mac_arch
        : knownFix32
          ? '32'
          : effectiveIsMacNative
            ? macArchFromMinOS(data.mac_requirements?.minimum)
            : // A retracted known-fix seed must not leave an orphan '32'.
              existingMeta?.mac_arch_source === 'known-fix'
              ? undefined
              : existingMeta?.mac_arch

      const updated: GameInfo = {
        ...current,
        title: data.name ?? current.title,
        art_cover,
        art_square,
        is_mac_native: effectiveIsMacNative,
        is_linux_native: effectiveIsLinuxNative,
        is_windows_native: effectiveIsWindowsNative,
        mac_arch,
        // GAP-B: clear any stale delisted flag — the app is available again.
        is_delisted: false,
        // Phase 17 D-08 reconciliation: this push only happens after a
        // successful appdetails fetch, which is exactly when platforms are
        // captured — mirrors steamMetadataStore.platformsCaptured below.
        steamPlatformsCaptured: true,
        metacritic_score: metacritic_score ?? existingMeta?.metacritic_score,
        extra
      }

      // Persist metadata for next session (D-05, indefinite cache).
      // platformsCaptured:true records that appdetails `platforms` was read, so
      // getGameInfo won't re-fetch this game again for platform data (self-heal once).
      // T-18-02-04: steamMetadataStore.set REPLACES the entire entry (electron-store
      // Store.set), so a Mach-O-verified verdict (mac_arch_verified/mac_arch_source)
      // AND the D-17 (34.13-14) persisted forcedWindowsViaBottle verdict must
      // both be explicitly carried forward here — otherwise the NEXT
      // fetchMetadataIfNeeded call (next launch/resync) would silently drop
      // either: mac_arch would regress to the min-OS heuristic and a forced
      // game would revert to native routing intermittently.
      //
      // 34.13 review A-19: a third carry-forward, `nativeBottleInstall`, was
      // REMOVED with the field itself. Every carry-forward here is a standing
      // obligation on every future writer of this payload, so a field with no
      // reader is not free — it is a permanent tax plus an invitation to
      // trust it.
      //
      // Quick task 260816-qcn: `platformsSource`/`platformsCapturedAt` are two
      // MORE standing carry-forward obligations, added by resolvePlatformWrite
      // (D-A). This literal is ENUMERATED, not a `...existing` spread, so both
      // MUST be listed explicitly here or a declined write would erase the
      // stamp it is honouring — the exact T-18-02-04 trap this comment block
      // already documents at length for the fields above.
      steamMetadataStore.set(this.appId, {
        art_cover,
        art_square,
        extra,
        is_mac_native: effectiveIsMacNative,
        is_linux_native: effectiveIsLinuxNative,
        is_windows_native: effectiveIsWindowsNative,
        is_delisted: false,
        platformsCaptured: true,
        platformsSource: resolution.platformsSource,
        platformsCapturedAt: resolution.platformsCapturedAt,
        mac_arch,
        ...(macArchVerified
          ? {
              mac_arch_verified: true as const,
              ...(existingMeta?.mac_arch_source
                ? { mac_arch_source: existingMeta.mac_arch_source }
                : {})
            }
          : // Fifth carry-forward on this enumerated write. Re-derived from the
            // curated file rather than copied from existingMeta, so an
            // in-flight fetch that read existingMeta before the seed landed
            // cannot drop it (quick 261027-bqe). Never sets mac_arch_verified.
            knownFix32
            ? { mac_arch_source: 'known-fix' as const }
            : effectiveIsMacNative
              ? { mac_arch_source: 'minos' as const }
              : {}),
        ...(existingMeta?.forcedWindowsViaBottle === true
          ? { forcedWindowsViaBottle: true as const }
          : {}),
        // D-51-07: the persisted bridge verdict (scan/userRoute/
        // identityFallback/etc.) is a FOURTH standing carry-forward
        // obligation on this enumerated write, identical in shape to
        // forcedWindowsViaBottle just above -- steamMetadataStore.set
        // REPLACES the whole entry (T-18-02-04), so a declined/refreshed
        // appdetails write would otherwise silently wipe a scan result the
        // bridge already paid for.
        ...(existingMeta?.bridge ? { bridge: existingMeta.bridge } : {}),
        // Quick 261029-sbi: SIXTH standing carry-forward on this enumerated
        // write (same T-18-02-04 trap). A fresh score wins; otherwise the
        // existing score and captured flag are carried, never invented.
        ...(metacritic_score !== undefined
          ? { metacritic_score, metacriticCaptured: true as const }
          : {
              ...(existingMeta?.metacritic_score !== undefined
                ? { metacritic_score: existingMeta.metacritic_score }
                : {}),
              ...(existingMeta?.metacriticCaptured === true
                ? { metacriticCaptured: true as const }
                : {})
            })
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
    // Phase 54: a game page reads cached metadata only; opening it must not
    // log on (ROADMAP SC2; debug friends-signout-steam-user). The call below
    // only labels later keyring reads, it reads no keyring and opens no
    // connection.
    noteSteamAuthTrigger('game-page')
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
   * quick-260821-le0: closes the 32-bit Mac Steam orphan defect at the
   * "stop creating new ones" end. `install()`'s `routeThroughBottle` branch
   * calls this as its FIRST statement, before the bridge/bottle-provisioning
   * checks below — a demoted title can be bridge-eligible AND already hold
   * a leftover native i386 install at the same time (the HOARD/63000 shape
   * that made this defect visible).
   *
   * Triple-gated, ALL of:
   *  1. `isAppleSiliconMac` — the load-bearing safety gate. i386 STILL RUNS
   *     on an Intel Mac, so an Intel host must keep its native copy. Never
   *     widen this to a bare `isMac` or to a negated-Intel-probe equivalent
   *     (see environment.ts's own comment on the positive-probe requirement).
   *  2. `steamMetadataStore.get(appId)?.mac_arch === '32'` — the specific
   *     demotion signal, read directly rather than via `isBottleEligible()`,
   *     which is also true for a merely-not-mac-native title whose native
   *     install is a DIFFERENT case and out of scope here.
   *  3. `readAcfState(appId, 'native').state === 'installed'` — the guard
   *     `install()` has never had.
   *
   * On a match: `removeSteamInstallCopy` deletes the native copy, then
   * `pollUninstallOnce('native')` is the ONLY state update on this path —
   * it is the existing honest reconciliation mechanism, re-probing bottle/
   * bridge for a survivor and re-resolving `install_path`, or flipping to
   * not-installed when nothing survives. No `library.set()` is hand-written
   * here and no badge is force-flipped in either direction (the badge
   * follows confirmed on-disk ACF state, per the locked constraint and
   * `60e89349a`) — a transient "Game Uninstalled" toast immediately before
   * the bottle install starts is ACCEPTED as honest, not papered over.
   *
   * A cleanup failure is never fatal to the install: the whole body is
   * wrapped in try/catch and only `logWarning`s on failure, following the
   * same shape as `resumeInterruptedSteamInstall`'s own call site above.
   */
  removeDemotedNativeOrphan(): Promise<void> {
    return removeDemotedNativeOrphan(this)
  }

  /**
   * SNI-07 (D-13 opt-in ON, non-bottle-eligible) native depot-download install
   * path. Calls the Plan 10 (ensureSteamClientReady) and Plan 09
   * (resolveSteamInstallTarget) seams so those plans can implement the real
   * logic without re-touching this file, then hands off to depot.ts's
   * downloadSteamDepots orchestrator (Plan 04-06). Maps its NEVER-throwing
   * { status, error? } outcome onto InstallResult using the SAME conventions
   * gog/legendary's own install() functions already use — 'done' -> success,
   * 'error' -> the outcome's already-classified (Plan 06 classifyDepotError)
   * message so the DownloadManager queue's EXISTING generic error+Retry
   * surface renders it (D-06/D-07 reuse, no steam-specific UI,
   * downloadqueue.ts untouched), 'cancelled' -> the abort-shaped result other
   * runners return on user cancel (not an error).
   *
   * Delegates to installDepotDownload() using the resolved native library
   * target + host os (unchanged behavior/call signature from Plan 07).
   */
  installNative(args: InstallArgs): Promise<InstallResult> {
    return installNative(this, args)
  }

  /**
   * D-15/SNI-08 (opt-in ON, bottle-eligible + isBottleReady) bottle
   * depot-download install path — unifies the install mechanism across
   * native and bottle: the SAME depot.ts orchestrator as installNative()
   * above, with the write target swapped to the CrossOver bottle's OWN
   * steamapps/ (getBottleSteamappsDir — plain Node fs, no Wine dispatch) and
   * os hard-coded 'windows' (the bottled client is a Windows Steam client,
   * never the host's macOS depot — RESEARCH Pattern 4). The bottle-scoped ACF
   * poller (startInstallPolling(appId,{source:'bottle'}), Plan 08) is reused
   * unchanged so the bottled Windows Steam client's own verify pass
   * (StateFlags 1026 -> 4) is reflected in the UI.
   */
  /**
   * 51-REVIEW WR-08: true when an interrupted native download for this appId
   * targeted the Phase 17 GameLibSteam bottle -- the install-start breadcrumb
   * (`markSteamNativeInstallStarted`, written before the download await and
   * cleared only on success) points at that bottle's steamapps dir. The
   * breadcrumb, not an ACF, is the signal: a hard kill runs no JS, so an
   * interrupted download leaves no `appmanifest_*.acf` at all. A COMPLETE
   * GameLibSteam install never reaches install() (it is already installed),
   * so the breadcrumb covers the resume case the review names.
   */
  hasBottledSteamCopy(): boolean {
    return hasBottledSteamCopy(this)
  }

  installBottleNative(args: InstallArgs): Promise<InstallResult> {
    return installBottleNative(this, args)
  }

  /**
   * Phase 24 Plan 08 (R3/R4/R7, D-01): allowlisted-title bridge install
   * path — a sibling of installBottleNative() above, but targeting this
   * game's OWN per-game bridge bottle (quick/261016-u1w D-A,
   * `GameLibSteamBridge-<appId>`) instead of the Phase 17 `GameLibSteam`
   * bottle. Reuses the SAME installDepotDownload()
   * engine both installNative()/installBottleNative() already share, with
   * the write target swapped to the bridge bottle's OWN steamapps/ dir and
   * os hard-coded 'windows', then places the generated shim as a
   * post-download hook (shimGenerate's placeShimForGame(), 24-05) — no
   * manual copy step (R3).
   *
   * BLOCKER 1: the SOLE caller of provisionBridgeBottle() (24-04). When the
   * bridge bottle has not been created yet, provisioning happens INLINE,
   * here, as part of the ordinary Install click — a fast `cxbottle
   * --create` with no SteamSetup.exe/download/login, so no consent dialog
   * is needed. Only a provisioning FAILURE defers to
   * steamBridgeSetupRequired — so the bridge bottle is always reachable
   * through the normal Install flow, never left permanently unreachable
   * waiting on a setup step that never fires.
   *
   * Finding #10 (accepted divergence): the reused depot engine writes an
   * appmanifest.acf for a Steam client to adopt — the bridge bottle has no
   * Steam client to adopt it, so that ACF is harmless dead weight on this
   * path (the files-on-disk + direct-launch model is what the bridge
   * relies on, with per-chunk sha1 already making the files
   * self-sufficient). Reusing the engine unchanged is the correct
   * low-risk choice this phase — not forked here.
   *
   * Any terminal failure (provisioning, depot download, unresolved launch
   * exe, or shim placement) EXCEPT a missing CrossOver (a precondition, not a
   * bridge failure — quick 261024-cjq) marks this appId bridge-failed-this-session
   * (finding #3, markBridgeFailedThisSession above) so a later D-05
   * fallback re-invocation of install() reaches the existing bottled path
   * instead of looping back into the same failing bridge (T-24-17).
   */
  crossoverRequiredError(): InstallResult {
    return crossoverRequiredError(this)
  }

  /**
   * Phase 59 (D-05): download the pinned built-in engine on first need, with
   * `engine-download` progress. A failure is a PRECONDITION failure, like a
   * missing CrossOver: it never marks the bridge failed, so it can never
   * reroute the title to bottled Steam.
   */
  ensureBuiltInEngineForInstall(
    pin: EnginePin,
    signal?: AbortSignal
  ): Promise<NonCrossoverEngine | InstallResult> {
    return ensureBuiltInEngineForInstall(this, pin, signal)
  }

  installBridgeGame(args: InstallArgs): Promise<InstallResult> {
    return installBridgeGame(this, args)
  }

  /**
   * The inline bridge-bottle creation of installBridgeGame (BLOCKER 1), now
   * run under the install lease. Returns the engine that owns the new bottle,
   * or the InstallResult to stop with.
   */
  provisionBridgeBottleForInstall(
    bridgeBottleName: string,
    signal?: AbortSignal
  ): Promise<
    | { engine: NonCrossoverEngine | 'crossover'; createdHere: boolean }
    | { result: InstallResult }
  > {
    return provisionBridgeBottleForInstall(this, bridgeBottleName, signal)
  }

  /**
   * 59-REVIEW CR-02 (D-01/D-04): the settings every install-time wine step
   * uses, from the engine that owns the bottle. null means no usable engine,
   * so the wine steps are skipped (they never fail an install).
   */
  /** engineSwitch's pin source: downloads with the same engine-download statuses as a launch. */
  restorePinEngine = async (
    pin: EnginePin
  ): Promise<NonCrossoverEngine | null> => {
    const result = await this.ensureBuiltInEngineForInstall(pin)
    return 'status' in result ? null : result
  }

  resolveInstallEngineSettings(
    bridgeBottleName: string,
    installEngine: NonCrossoverEngine | 'crossover' | null
  ): Promise<{ settings: GameSettings } | { skipped: string }> {
    return resolveInstallEngineSettings(this, bridgeBottleName, installEngine)
  }

  /** The lease-held part of installBridgeGame: download, shim, redists. */
  installBridgeGameLeased(
    args: InstallArgs,
    bridgeBottleName: string,
    installEngine: NonCrossoverEngine | 'crossover' | null,
    signal?: AbortSignal
  ): Promise<InstallResult> {
    return installBridgeGameLeased(
      this,
      args,
      bridgeBottleName,
      installEngine,
      signal
    )
  }

  /**
   * CR-04: reconcile the persisted steam_api prescreen with a placement
   * result. 'none' is only ever written over undefined/'none'/'unknown'
   * (never downgrading a real x86/x64/both), and a persisted 'none' is
   * upgraded to the scanned arch when the placement found a real import.
   */
  /**
   * Quick 261024-br4: persists `placeShimForGame`'s Steam DRM signal
   * (`bridge.drm`) and decides whether it is a dead end. An absent signal
   * (not checked / PE did not parse) leaves the stored value alone; `null`
   * (parsed, not CEG) clears a stale 'ceg'. Returns the CEG markers when the
   * caller must stop, or null -- including when the user forced 'bridge'
   * (D-51-11), which is logged and honoured.
   */
  persistBridgeDrmSignal(
    drm: { kind: 'ceg'; markers: string[] } | null | undefined,
    caller: 'installBridgeGame' | 'launchBridgeGame'
  ): string[] | null {
    return persistBridgeDrmSignal(this, drm, caller)
  }

  reconcileBridgePrescreen(shimResult: {
    status: string
    verdict?: { arch: 'x86' | 'x64' }
  }): void {
    return reconcileBridgePrescreen(this, shimResult)
  }

  /**
   * Given a resolved bridge launch exe path (resolveBridgeLaunchExe, Task
   * 1), derives the game's own install ROOT directory —
   * `steamapps/common/<installdir>` — via resolve()+relative() containment
   * (never path.join/string-prefix — the project's own established "path.join
   * is not containment" lesson, mirrored from shimGenerate.ts's
   * isContainedWithin). Returns undefined if exePath does not resolve
   * inside the bridge bottle's `common/` dir at all — should be
   * unreachable in practice since resolveBridgeLaunchExe only ever returns
   * paths it built from that SAME root, but this is a defensive check, not
   * an assumption of trust.
   */
  resolveBridgeGameInstallRoot(
    exePath: string,
    bottleNameOverride?: string
  ): string | undefined {
    return resolveBridgeGameInstallRoot(this, exePath, bottleNameOverride)
  }

  /**
   * Directly flips is_installed:true for a completed bridge install —
   * mirrors library.ts's pollInstallOnce() 'installed'-branch shape
   * (`{ ...existing, is_installed: true, install: { install_path,
   * install_size, platform } }` + persist + pushGameToLibrary), since the
   * bridge path has no ACF poller that can observe completion (see the
   * deviation note in installBridgeGame above).
   */
  markBridgeGameInstalled(installPath: string): void {
    return markBridgeGameInstalled(this, installPath)
  }

  /**
   * Directly flips is_installed:false for a bridge uninstall — the bridge
   * bottle has no ACF poller either (uninstallBridgeGame below performs a
   * real, synchronous file removal, so this is the correct completion
   * signal, not an ACF observation). Mirrors forceUninstall()'s keep-entry
   * shape (never library.delete's the entry).
   *
   * D-UAT-24-07 fold-in: also emits a gameStatusUpdate 'done', mirroring
   * markBridgeGameInstalled() above — without it, the frontend's
   * "Uninstalling" pill never clears even though the backend uninstall
   * succeeded. Emitted OUTSIDE the `if (existing)` guard (same placement as
   * markBridgeGameInstalled's) so the pill clears regardless of whether the
   * library entry happens to be present.
   */
  private markBridgeGameUninstalled(): void {
    return markBridgeGameUninstalled(this)
  }

  /**
   * Shared depot-download engine for both installNative() (native, opt-in ON,
   * non-bottle-eligible) and installBottleNative() (D-15, opt-in ON,
   * bottle-eligible). Calls the Plan 10 (ensureSteamClientReady) and Plan 09
   * (resolveSteamInstallTarget) seams — the SAME authenticated-CM-connection
   * check and PICS-derived installdir resolution both paths need — then hands
   * off to depot.ts's downloadSteamDepots orchestrator (Plan 04-06) with the
   * caller-selected write target/os. `targetSteamappsDirOverride` replaces
   * resolveSteamInstallTarget's own (native-library) targetSteamappsDir when
   * present — the bottle path discards that native-library resolution
   * entirely and reuses only the PICS-derived `installdir`; `pollerSource`
   * lets the bottle path reuse the bottle-scoped ACF poller (Plan 08) while
   * leaving the native path's `startInstallPolling(appId)` call signature
   * byte-for-byte unchanged.
   *
   * Maps downloadSteamDepots's NEVER-throwing { status, error? } outcome onto
   * InstallResult using the SAME conventions gog/legendary's own install()
   * functions already use — 'done' -> success, 'error' -> the outcome's
   * already-classified (Plan 06 classifyDepotError) message so the
   * DownloadManager queue's EXISTING generic error+Retry surface renders it
   * (D-06/D-07 reuse, no steam-specific UI, downloadqueue.ts untouched),
   * 'cancelled' -> the abort-shaped result other runners return on user
   * cancel (not an error).
   *
   * Registers this.appId in nativeInstallsInFlight + a real AbortController
   * (D-02) for the duration of the download so stop() can abort it — for
   * EITHER path — released in the finally regardless of outcome.
   *
   * D-UAT-05 fix: registration happens FIRST, before either seam await
   * (ensureSteamClientReady/resolveSteamInstallTarget) — previously it only
   * happened after both had resolved, so a stop()/cancel() issued while
   * either was still pending saw nativeInstallsInFlight.has(appId) === false
   * and hit the historic no-op branch (observed in the field as "SteamGame.stop:
   * Steam owns process lifecycle ...; no-op"). Registering synchronously up
   * front closes that window entirely; the two `controller.signal.aborted`
   * checks below make a cancel issued DURING either seam await still abort
   * the install promptly instead of silently continuing to downloadSteamDepots.
   *
   * T-23-12 single-flight guard: if a LIVE entry already exists for
   * this.appId, join it — return its stored promise instead of starting a
   * second downloadSteamDepots (the Gate 1 progress-percent flip-flop root
   * cause was exactly two concurrent runs each emitting progress against
   * their own doneBytes). The guard check + registration below happen
   * synchronously before runNativeDepotDownload's first real await, so the
   * D-UAT-05 property (stop() issued during either seam await still finds
   * the appId registered) is preserved.
   *
   * T-23-15 pause/resume abort-before-restart: an existing entry whose
   * `aborted` flag is true (stop() was called) is TEARING DOWN, not live —
   * joining it would return an aborted result to a caller expecting a fresh
   * install. Instead, await its settlement first (guaranteeing its `finally`
   * cleanup has run) before starting a brand-new run, so the prior and the
   * resumed run never overlap (no stacking).
   */
  installDepotDownload(
    args: InstallArgs,
    opts: {
      targetSteamappsDirOverride?: string
      os: string
      pollerSource?: 'bottle' | 'bridge'
      signal?: AbortSignal
    }
  ): Promise<InstallResult> {
    return installDepotDownload(this, args, opts)
  }

  /**
   * The actual native depot-download run — split out of installDepotDownload
   * (T-23-12) so its promise can be registered in nativeInstallsInFlight
   * BEFORE its first await, letting a concurrent caller for the same appId
   * join the SAME promise instead of starting a second downloadSteamDepots.
   * Body/contract unchanged from the pre-Phase-23-05 installDepotDownload.
   */
  runNativeDepotDownload(
    args: InstallArgs,
    opts: {
      targetSteamappsDirOverride?: string
      os: string
      pollerSource?: 'bottle' | 'bridge'
      signal?: AbortSignal
    }
  ): Promise<InstallResult> {
    return runNativeDepotDownload(this, args, opts)
  }

  /**
   * Phase 54: maps a refused authenticated acquire to an install result. A
   * go-offline refusal means the guided dialog owns the next step (the install
   * did not fail), so it returns the same deferredToSetup contract the bridge
   * route notice uses. Every other refusal carries the fixed not-signed-in copy.
   */
  installResultForRefusal(reason: AuthSessionRefusal): InstallResult {
    return installResultForRefusal(this, reason)
  }

  /**
   * The body of runNativeDepotDownload that needs the authenticated lease:
   * target resolution, crash breadcrumb, depot download, polling. The caller
   * owns the lease and the in-flight registry cleanup.
   */
  runNativeDepotDownloadLeased(
    args: InstallArgs,
    opts: {
      targetSteamappsDirOverride?: string
      os: string
      pollerSource?: 'bottle' | 'bridge'
    },
    controller: ReturnType<typeof createAbortController>,
    runStart: number,
    deferredPoll: {
      handoff?: { manifestPath: string; skippedDepots: string[] }
    }
  ): Promise<InstallResult> {
    return runNativeDepotDownloadLeased(
      this,
      args,
      opts,
      controller,
      runStart,
      deferredPoll
    )
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
   * D-11/MAC32 PLATFORM-derived half of the bottle-eligibility verdict —
   * true only for a CONFIRMED not-native macOS game. Split from
   * `isBottleEligible()` below by 34.13-14 so the Phase 24 bridge
   * (`isBridgeEligible()`) can compose ONLY this platform signal and never
   * the D-17 forced verdict (see `isBottleEligible()`'s own doc comment for
   * why). Body is byte-identical to the pre-34.13-14 `isBottleEligible()`.
   */
  isBottleEligibleFromPlatforms(): boolean {
    return isBottleEligibleFromPlatforms(this)
  }

  /**
   * D-17 (34.13-14) durability half of the bottle-eligibility verdict — true
   * only when a PRIOR install actually committed bits to the Phase 17
   * bottle via the D-17 override (34.13-06's `forceWindowsViaBottle`) and
   * that verdict was persisted (`markForcedWindowsViaBottle`,
   * `fetchMetadataIfNeeded`'s carry-forward). `=== true` strict equality
   * only — an absent or explicit-`false` field never re-routes. The `isMac`
   * guard here is independent of `isBottleEligible()`'s own (not merely
   * redundant with it): this method is reached on its own by the wrapper
   * below, and D-18 means a renderer-era flag must never resurrect a bottle
   * path on a host with no bottle at all.
   */
  isForcedWindowsViaBottle(): boolean {
    return isForcedWindowsViaBottle(this)
  }

  /**
   * The single source of truth for whether getSettings()/isNative()/
   * install()/launch()/uninstall() should route through the bottled Steam
   * client instead of the native steam:// path — the OR of the platform-
   * derived verdict and the D-17 persisted forced verdict. One seam, five
   * consistent surfaces (34.13-14): all five callers below are unchanged by
   * this split and become consistent together the moment either half
   * changes.
   */
  isBottleEligible(): boolean {
    return isBottleEligible(this)
  }

  /**
   * Phase 51 Plan 09 (D-51-07/09): the SOLE input assembler for
   * `resolveBridgeRoute()` (bridgeRoute.ts) — the only place in this file
   * allowed to call `bridgeAllowlist.has` with an appId (assumption_delta_decision,
   * acceptance-counted at exactly one call-site occurrence). Every other routing
   * decision in this file goes through `bridgeRoute()` below instead of a
   * second direct allowlist/verdict read.
   *
   * D-17 (34.13-14) pin, carried forward unchanged: `platformsBottleEligible`
   * reads `isBottleEligibleFromPlatforms()`, NEVER the widened
   * `isBottleEligible()` / the D-17 forced-verdict wrapper — see
   * `bridgeRoute.ts`'s own doc comment for why widening this would resolve a
   * route into a bottle (`GameLibSteamBridge`) that a D-17 forced install
   * never wrote a single byte into (that install went to `GameLibSteam`).
   */
  assembleBridgeRouteInput(): BridgeRouteInput {
    return assembleBridgeRouteInput(this)
  }

  /**
   * D-51-07: the single routing read for this appId. `resolveBridgeRoute()`
   * is a pure function (bridgeRoute.ts) — this method is the sole place in
   * games.ts that assembles its input and calls it.
   */
  bridgeRoute(): SteamBridgeRouteVerdict {
    return bridgeRoute(this)
  }

  /**
   * D-51-09: the backend-authoritative bridge-route read, exposed over IPC
   * by the exported `getBridgeRouteVerdict()` below (51-13's actual IPC
   * surface) — the `checkBottleEligibility()` precedent for a second
   * resolver. Forces platform capture first for the same reason
   * `checkBottleEligibility()` does: a cold metadata cache must never read
   * as a routing answer.
   */
  checkBridgeRoute(): Promise<SteamBridgeRouteVerdict> {
    return checkBridgeRoute(this)
  }

  /**
   * ROADMAP sub-decision 2 / D-51-07: delegates entirely to the pure
   * resolver — true exactly when `bridgeRoute().route === 'bridge'`. The
   * allowlist is no longer the gate by itself (assumption_delta_decision,
   * 51-09): a non-seed, never-scanned, bottle-eligible title now ALSO
   * routes to the bridge (reason `'pending-scan'`) and gets scanned on its
   * own first install — superseding this method's pre-51-09 behavior, where
   * a non-allowlisted title fell straight through to the D-15/D-13 opt-in
   * branches below (see this file's test suite for the updated coverage).
   *
   * D-17 (34.13-14) pin, carried forward unchanged: `bridgeRoute()` (via
   * `assembleBridgeRouteInput()`) composes ONLY
   * `isBottleEligibleFromPlatforms()`, never the widened `isBottleEligible()`
   * / the D-17 forced verdict — see that method's own doc comment above.
   */
  private isBridgeEligible(): boolean {
    return isBridgeEligible(this)
  }

  /**
   * D-51-07: auto-clears a persisted scan-miss the moment the currently
   * shipped shim is proven to cover every symbol it used to miss —
   * `isScanVerdictNowCovered()` (shimCoverage.ts) decides "now covered"
   * against the CURRENT exported-symbol/served-interface tables, never a
   * re-scan. No-op when there is no persisted miss, or the miss still isn't
   * covered — `clearBridgeScanVerdict()` itself already no-ops on
   * nothing-to-clear (bridgeVerdict.ts), so this can never fabricate a
   * metadata entry.
   */
  clearStaleBridgeVerdict(): void {
    return clearStaleBridgeVerdict(this)
  }

  /**
   * D-09's single backend-authoritative bottle-eligibility seam, consumed
   * over IPC by plan 34.13-07 (`isSteamBottleEligible`) and, through that
   * channel, by 34.13-11's in-dialog eligibility probe (D-25 — the options
   * dialog opens instantly and its wine section carries the loading state;
   * the quick-install path deliberately never probes at all, because
   * `install()` resolves eligibility itself). Composes the two private
   * predicates below rather than widening either — the `isBridgeEligible()`
   * pattern above, a third instance of it in this file, not a new one.
   *
   * The `await` is load-bearing: skipping it would let a cold metadata
   * cache read as "not eligible" (the guided-setup-never-fires defect this
   * seam exists to prevent). Worst-case latency is `ensurePlatformsCaptured`'s
   * own bounded poll, capped at `METADATA_FETCH_TIMEOUT_MS` (15000ms,
   * `state.ts:30`) — the number 34.13-11's D-25 loading row must cite.
   */
  checkBottleEligibility(): Promise<boolean> {
    return checkBottleEligibility(this)
  }

  /**
   * Phase 17 Plan 09 (MACSTEAM-04 gap closure): forces platform data to be
   * resolved BEFORE install()/launch()/uninstall() consult isBottleEligible(),
   * decoupling bottle routing from the async fetchMetadataIfNeeded race
   * (.planning/debug/steam-bottle-guided-setup-never-fires.md). Previously,
   * isBottleEligible() only saw fresh platform data if the fire-and-forget
   * lazy fetch (triggered by getGameInfo()) had already completed by the time
   * the user clicked Install/Play — a cold cache or a slow/failed fetch left
   * platformsCaptured false, silently routing a Windows-only macOS game down
   * the native steam:// path with no guided-setup dialog.
   *
   * No-op on non-macOS (native steam:// delegation is unaffected) and when
   * this appId's platforms are already captured (no redundant network on the
   * hot path).
   *
   * getGameInfo() call below re-triggers the SAME lazy fetch as a fire-and-forget
   * side effect (adding this.appId to pendingFetches synchronously). Our own
   * explicit fetchMetadataIfNeeded() call then hits the T-2-03 dedup guard and
   * returns immediately without a second network request — so we fall into the
   * bounded poll below and wait for that single in-flight fetch to resolve
   * platformsCaptured, rather than hoping it finishes before routing happens.
   */
  ensurePlatformsCaptured(): Promise<void> {
    return ensurePlatformsCaptured(this)
  }

  /**
   * Writes the per-OS shortcut through the shared shortcuts module. The target is
   * `gamelib://launch?appName={appId}&runner=steam`; protocol.ts hands that to
   * dispatchSteamLaunch, so a shortcut launch takes the same bridge/bottle/native route as the
   * Play button. It deliberately does not open `steam://rungameid` directly, which would skip
   * that routing.
   */
  async addShortcuts(fromMenu?: boolean): Promise<void> {
    return addShortcutsUtil(this, fromMenu)
  }

  async removeShortcuts(): Promise<void> {
    return removeShortcutsUtil(this)
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
  async launch(
    _logWriter: LogWriter,
    _launchArguments?: LaunchOption,
    _args?: string[],
    _skipVersionCheck?: boolean
  ): Promise<boolean> {
    // quick-260817-d61: Play is a deliberate Steam action — unlock the
    // keyring deferral gate before ensurePlatformsCaptured() or anything
    // else in this method runs.
    noteSteamAuthTrigger('user-play')
    // D-51-07: same auto-clear as install()'s top, before any routing
    // decision below reads the persisted verdict.
    this.clearStaleBridgeVerdict()
    await this.ensurePlatformsCaptured()
    if (this.isBottleEligible()) {
      // quick/261024-gvu: single-flight. While a bottle/bridge monitor for
      // this appId is live (still starting, or already running) a second Play
      // must not queue another `-applaunch` / wine exe — the monitor keeps
      // owning the launching/playing status.
      const { getBottleProcessMonitorPhase } =
        await import('./bottleProcessMonitor')
      const livePhase = getBottleProcessMonitorPhase(this.appId)
      if (livePhase) {
        logInfo(
          `SteamGame: appId ${this.appId} launch already ${livePhase} — not dispatching another`,
          LogPrefix.Steam
        )
        return true
      }
      // Phase 51 Plan 09 (D-51-09): LOCATION, not eligibility — launch()
      // must dispatch to wherever this install's bits actually live, never
      // to where a NEW install would be routed (isBridgeEligible() /
      // bridgeRoute() answers the latter question, which a never-scanned
      // title now defaults to 'bridge' on (rule 11, pending-scan) even
      // though nothing has been installed there yet). findBridgeInstallBottle
      // is non-null only when a bridge bottle actually holds this appId's
      // manifest — the FIRST check inside this block, mirroring install()'s
      // own bridge sub-branch above (BLOCKER 1 rationale: the bridge has its
      // own readiness gate, ensureBridgeHelperReady(), independent of the
      // unrelated Phase 17 GameLibSteam bottle's own state). The session
      // circuit breaker (finding #3) is orthogonal to location — a bridge
      // launch that already failed once this session must keep falling back
      // to the bottled flow even though the bits are still sitting in the
      // bridge bottle from the earlier attempt, so it is checked here too,
      // not folded into findBridgeInstallBottle itself.
      if (
        findBridgeInstallBottle(this.appId) !== null &&
        !bridgeFailedThisSession.has(this.appId)
      ) {
        return this.launchBridgeGame()
      }

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
      // Phase 59: bottled Steam stays CrossOver-only (no built-in engine).
      // A clear message beats a hang behind CrossOver's own dialog.
      const { preflightCrossover } = await import('./engine/engineDecision')
      const pre = await preflightCrossover(
        getSteamBottleSettings()?.wineCrossoverBottle ??
          DEFAULT_STEAM_BOTTLE_NAME
      )
      if (pre.kind !== 'healthy') {
        this.notifyCrossoverRequired('bottled', pre)
        this.sendLaunchDone()
        return false
      }
      const result = await tellBottledSteamToLaunch(this.appId)
      return result.status === 'done'
    }

    // On Windows, `rungameid` makes Steam show its "Starting game / LAUNCHING —
    // Open Steam" window on every Play, even with `steam.exe -silent`.
    // `steam://launch/<id>/Dialog` (Playnite's form) does not show it. The
    // operator measured this on 2026-10-29 with WazHack 264160 (quick
    // 261029-i1n). macOS and Linux stay on `rungameid` because the window has
    // not been seen there.
    const url = buildSteamProtocolUrl(
      isWindows ? 'launch' : 'rungameid',
      this.appId
    )
    if (!url) {
      // Non-numeric appId — rejection already logged by buildSteamProtocolUrl
      return false
    }

    logInfo(
      `SteamGame: launching appId ${this.appId} via ${url}`,
      LogPrefix.Steam
    )
    // activate:false asks the opener not to bring Steam forward. Its purpose is
    // macOS Console mode, where activating Steam pulls GameLib out of its
    // fullscreen Space and the desktop Space flashes before the game appears.
    // The option is currently dropped before it reaches the Rust opener (todo
    // 2026-10-29-open-external-drops-activate-false). It is not what controls
    // Windows Steam's "Starting game" window: the `rungameid` verb causes that,
    // which is why Windows uses the `launch` verb above. No effect on Linux.
    // Quick 261029-ji2: a GameLib-downloaded Mac install that the still-running
    // Steam never adopted makes rungameid open the install dialog, so Steam is
    // restarted once first. Only installs with a pending-adoption record (see
    // runNativeDepotDownload) ever probe or restart anything.
    if (isMac) {
      const record = readPendingAdoption(this.appId)
      if (record) {
        const currentPid = await probeMacSteamPid().catch(() => null)
        const decision = decidePlayAdoption({
          record,
          currentPid,
          currentAcf: readAcfSnapshot(record.manifestPath)
        })
        if (decision === 'clear-and-launch') {
          clearPendingAdoption(this.appId)
        } else if (decision === 'restart') {
          const outcome = await restartMacSteamForAdoption(this.appId, {
            launchRunGameId: () => shell.openExternal(url, { activate: false })
          })
          if (outcome.kind === 'relaunched') {
            clearPendingAdoption(this.appId)
            return true
          }
          // Refuse rather than fall back to a plain launch: an unadopted
          // install in a running Steam opens the install dialog (the failure
          // being removed), and quitting would end the user's game session.
          // Steam is never killed; the record stays pending.
          const game = this.getGameInfo().title
          const body =
            outcome.kind === 'game-running'
              ? i18next.t(
                  'gamelib:steam.adoptRestart.gameRunning',
                  'Quit the game running in Steam, then press Play to finish setting up {{game}}.',
                  { game }
                )
              : outcome.kind === 'steam-busy'
                ? i18next.t(
                    'gamelib:steam.adoptRestart.busy',
                    'Steam is busy with a GameLib sign-in. Try Play again in a moment.'
                  )
                : i18next.t(
                    'gamelib:steam.adoptRestart.quitTimeout',
                    "Steam didn't quit, so {{game}} couldn't be set up. Quit Steam and press Play again.",
                    { game }
                  )
          logWarning(
            `SteamGame: Play for ${this.appId} not launched (${outcome.kind}); pending adoption kept`,
            LogPrefix.Steam
          )
          notify({ title: game, body })
          return false
        }
      }
    }
    await shell.openExternal(url, { activate: false })
    return true
  }

  /**
   * Phase 24 Plan 08 (R4/R6/R7), reordered by Phase 51 Plan 01 (D-51-01):
   * allowlisted-title bridge launch path. Runs the game's OWN resolved
   * Windows `.exe` (resolveBridgeLaunchExe, Task 1) directly via
   * `runWineCommand` against THIS game's own bridge bottle
   * (getBridgeBottleSettings(appId), quick/261016-u1w D-B) — NEVER `tellBottledSteamToLaunch` /
   * `dispatchToBottledSteam`, since the bridge bottle has no bottled Steam
   * client to `-applaunch` through (RESEARCH Pattern 4's single largest
   * routing-shape delta).
   *
   * D-51-01 reorders the readiness gate to AFTER the exe/bottle existence
   * gate: `placeShimForGame()` (byte-identity no-op, refreshes a stale
   * pre-phase shim after an upgrade) and `ensureBridgeHelperReady()` both
   * now run only once we already know there is a real exe to launch, then
   * `writeBridgeConfig()` hands the per-appId helper's real, OS-assigned
   * port to the game's own regenerated shim via `gamelib_bridge.cfg`
   * beside the exe — there is no fixed port left for the shim to guess.
   * On ANY of these steps failing, this marks the appId
   * bridge-failed-this-session (finding #3) and fires
   * `steamBridgeSetupRequired` itself (defensive — never assumes the
   * signal was already fired upstream) before returning `false` — never
   * optimistically flips any running state.
   */
  /**
   * D-51-02/D-51-04 (Phase 51 Plan 12): the one-time "limited Steam
   * features" notice plus the every-launch `[bridge-notice]` log line.
   * Called from `launchBridgeGame()` once the helper has reported ready or
   * fallback-identity, and before `runWineCommand` fires -- never for the
   * no-steam-api branch, which spawns no helper and has nothing to stub.
   *
   * `setBridgeIdentityFallback` is persisted on EVERY call (true or false)
   * so a game that regains real-AppID init after a prior fallback clears
   * the stale flag -- the log line and `notify()` only fire when there is
   * something limited to report (stubbed interfaces or an identity
   * fallback); a clean verdict with no fallback logs nothing and never
   * calls `notify()`. `notify()` itself is gated separately, by
   * `verdict.limitedNoticeShown` (D-51-02: shown once per game, logged
   * every time) -- `markBridgeLimitedNoticeShown` persists that flag the
   * first time it fires.
   */
  private maybeNotifyBridgeLimited(
    verdict: SteamBridgeVerdict | undefined,
    identityFallback: boolean
  ): void {
    setBridgeIdentityFallback(this.appId, identityFallback)

    const stubbedInterfaces = verdict?.scan?.stubbedInterfaces ?? []
    const isLimited = identityFallback || stubbedInterfaces.length > 0
    if (!isLimited) {
      return
    }

    const reason = identityFallback
      ? 'identity-fallback'
      : `stubbed:${stubbedInterfaces.join(',')}`
    logInfo(
      `[bridge-notice] appId=${this.appId} reason=${reason}`,
      LogPrefix.Steam
    )

    if (verdict?.limitedNoticeShown === true) {
      return
    }

    const bodyParts = [
      i18next.t(
        'gamelib:steam.bridge.limited.body',
        'Achievements and cloud saves do not sync for this game via the bridge.'
      )
    ]
    if (identityFallback) {
      bodyParts.push(
        i18next.t(
          'gamelib:steam.bridge.limited.identityFallback',
          'Steam would not run this game under its own ID, so it runs with your Steam identity only.'
        )
      )
    }

    notify({
      title: i18next.t(
        'gamelib:steam.bridge.limited.title',
        'Some Steam features are limited'
      ),
      body: bodyParts.join(' ')
    })
    markBridgeLimitedNoticeShown(this.appId)
  }

  /**
   * D-13 (56-12): a steamclient-layer DRM mode step failed. Logs the
   * [bridge-notice] line on every attempt, and shows the dialog plus notify
   * once per (appId, step) per session, naming the failed step and its cause.
   * Does not launch, and has no fallback to the Phase 52 forwarder or to
   * bottled Steam. It never calls markBridgeFailedThisSession (RESEARCH A9 /
   * F10: that would send the next Play to bottled Steam) and never sends
   * steamBridgeSetupRequired, whose dialog offers the bottled fallback. The
   * cause in the body is the 56-04-normalised readable form; the log line
   * carries the tokenised form.
   */
  private maybeNotifyDrmModeFailed(step: DrmStep, cause: string): void {
    logInfo(formatDrmNoticeLine(this.appId, step, cause), LogPrefix.Steam)
    const key = `${this.appId}|${step}`
    if (drmModeNoticeShownThisSession.has(key)) {
      return
    }
    drmModeNoticeShownThisSession.add(key)
    const title = i18next.t(
      'gamelib:steam.bridge.drm.title',
      'This game could not start'
    )
    const body =
      drmStepNoticeText(step) +
      ' ' +
      i18next.t('gamelib:steam.bridge.drm.detail', 'Details: {{cause}}', {
        cause
      })
    notify({ title, body })
    // The failure usually lands while the game is in front. Bring GameLib up first, or the
    // dialog renders into a window nobody can see (display=unconfirmed in the 56-16 gate).
    app.raiseMainWindow()
    const ackId = newDialogAckId()
    const appId = this.appId
    trackDialogDisplay(ackId, (result) => {
      logInfo(
        result.confirmed
          ? `[bridge-notice] appId=${appId} display=confirmed elapsedMs=${result.elapsedMs}`
          : `[bridge-notice] appId=${appId} display=unconfirmed timeout=${result.timeoutMs}`,
        LogPrefix.Steam
      )
    })
    const dialogFrameSent = showDialogBoxModalAuto({
      title,
      message: body,
      type: 'MESSAGE',
      ackId
    })
    logInfo(
      `[bridge-notice] appId=${this.appId} dispatched=in-app-dialog+notify dialog-frame-sent=${dialogFrameSent} display=pending`,
      LogPrefix.Steam
    )
  }

  /** Terminal 'done' status for a launch that will not start (idempotent). */
  private sendLaunchDone(): void {
    sendGameStatusUpdate({
      appName: this.appId,
      runner: 'steam',
      status: 'done'
    })
  }

  /**
   * Phase 59: notify plus an in-app dialog, copied from
   * maybeNotifyDrmModeFailed's surface. Never marks the bridge failed and
   * never sends steamBridgeSetupRequired (no path reroutes to bottled Steam).
   */
  private showEngineDialog(title: string, body: string, tag: string): void {
    notify({ title, body })
    app.raiseMainWindow()
    const ackId = newDialogAckId()
    const appId = this.appId
    trackDialogDisplay(ackId, (result) => {
      logInfo(
        result.confirmed
          ? `[engine-notice] appId=${appId} tag=${tag} display=confirmed elapsedMs=${result.elapsedMs}`
          : `[engine-notice] appId=${appId} tag=${tag} display=unconfirmed timeout=${result.timeoutMs}`,
        LogPrefix.Steam
      )
    })
    const sent = showDialogBoxModalAuto({
      title,
      message: body,
      type: 'MESSAGE',
      ackId
    })
    logInfo(
      `[engine-notice] appId=${this.appId} tag=${tag} dispatched=in-app-dialog+notify dialog-frame-sent=${sent} display=pending`,
      LogPrefix.Steam
    )
  }

  /**
   * Phase 59: DRM-mode and bottled-Steam launches are CrossOver-only. Shown on
   * every blocked attempt (the user pressed Play and nothing else will tell
   * them why it did nothing).
   */
  private notifyCrossoverRequired(
    kind: 'drm' | 'bottled',
    pre: CrossoverPreflight
  ): void {
    const reason =
      pre.kind === 'expired'
        ? i18next.t(
            'gamelib:steam.engine.reason.cxExpired',
            'CrossOver trial expired'
          )
        : pre.kind === 'broken'
          ? i18next.t(
              'gamelib:steam.engine.reason.cxBroken',
              "CrossOver isn't working"
            )
          : i18next.t(
              'gamelib:steam.engine.reason.cxMissing',
              'CrossOver not found'
            )
    logWarning(
      `SteamGame: appId ${this.appId} ${kind} launch needs CrossOver but pre-flight is ${pre.kind}; not launching (no built-in engine, no fallback)`,
      LogPrefix.Steam
    )
    const body =
      kind === 'drm'
        ? i18next.t(
            'gamelib:steam.engine.crossoverRequired.drm',
            'This game uses Steam DRM support that needs CrossOver ({{reason}}). Install or renew CrossOver, then try again.',
            { reason }
          )
        : i18next.t(
            'gamelib:steam.engine.crossoverRequired.bottled',
            'This game runs through Windows Steam, which needs CrossOver ({{reason}}). Install or renew CrossOver, then try again.',
            { reason }
          )
    this.showEngineDialog(
      this.getGameInfo().title,
      body,
      `crossover-required-${kind}`
    )
  }

  /**
   * Phase 59 (D-05/D-06/D-07/D-09/D-14/D-15): a fresh pre-flight and engine
   * decision for every TCP bridge launch. Downloads the built-in engine on
   * first need, registers the choice, prepares the bottle for it, and
   * re-reads the settings so every later spawn uses the registered engine.
   */
  private async selectLaunchEngine(
    current: GameSettings,
    connectivity: { offline: boolean }
  ): Promise<{ ok: true; settings: GameSettings } | { ok: false }> {
    const bottleName = current.wineCrossoverBottle
    const { decideLaunchEngine } = await import('./engine/engineDecision')
    const { setEngineSelection, clearEngineSelection } =
      await import('./engine/engineRegistry')
    const { prepareBottleForEngine } = await import('./engine/engineSwitch')
    const { recordLaunchDecision } = await import('./engine/engineState')
    const { isNonCrossover } = await import('./engine/engineTypes')
    const title = this.getGameInfo().title

    // G22/G25: offline, some launches cannot start on any branch: CrossOver missing needs the
    // current pin downloaded, and a built-in-engine bottle whose restore needs the absent pin
    // cannot restore under a healthy CrossOver (59-26). The probe's result cannot change that,
    // so refuse now instead of waiting it out. The offline reading is a fresh check taken at
    // Play (the monitor status can be stale, 59-40 diagnosis). This only refuses: no engine is
    // selected and nothing is routed or launched, so D-07/D-09 hold, and every launch that can
    // start still probes below.
    const { readStoredEngineOverride, isCrossoverMissing } =
      await import('./engine/engineDecision')
    const { parseEngineOverride } = await import('./engine/engineIds')
    const earlyOverride = parseEngineOverride(
      readStoredEngineOverride(this.appId)
    )
    if (
      connectivity.offline &&
      (earlyOverride === 'automatic' || earlyOverride === 'crossover')
    ) {
      const { readBottleEngineMarkerKind, restoreNeedsAbsentPin } =
        await import('./engine/engineSwitch')
      const { isPinnedEngineInstalled } =
        await import('./engine/fallbackEngine')
      const { ENGINE_PINS } = await import('./engine/enginePins')
      const { offlineLaunchCertainlyBlocked } =
        await import('./engine/offlineRefusal')
      const refusal = offlineLaunchCertainlyBlocked({
        offline: connectivity.offline,
        override: earlyOverride,
        crossoverMissing: await isCrossoverMissing(),
        markerKind: readBottleEngineMarkerKind(bottleName),
        currentPinInstalled: isPinnedEngineInstalled(ENGINE_PINS.current),
        restoreNeedsAbsentPin: restoreNeedsAbsentPin(bottleName)
      })
      if (refusal.blocked) {
        const why =
          refusal.arm === 'crossover-missing'
            ? `offline, CrossOver is missing and the built-in engine ${ENGINE_PINS.current.id} is not installed`
            : 'offline, and returning this bottle to CrossOver needs an engine pin that is not on disk'
        logWarning(
          `SteamGame: appId ${this.appId} launch blocked before pre-flight: ${why} (${refusal.arm})`,
          LogPrefix.Steam
        )
        this.showEngineDialog(
          title,
          i18next.t(
            'gamelib:steam.engine.downloadFailed',
            "GameLib couldn't download its built-in engine ({{reason}}). Check your connection and try again.",
            { reason: 'offline' }
          ),
          'engine-download-failed'
        )
        return { ok: false }
      }
    }

    const decision = await decideLaunchEngine({
      appId: this.appId,
      bottleName
    })
    if (decision.kind === 'unavailable') {
      logWarning(
        `SteamGame: appId ${this.appId} engine override ${decision.override} is unavailable: ${decision.detail}`,
        LogPrefix.Steam
      )
      this.showEngineDialog(
        title,
        i18next.t(
          'gamelib:steam.engine.overrideUnavailable',
          'The engine chosen for this game in Wine settings is not available ({{detail}}). Choose Automatic or install it.',
          { detail: decision.detail }
        ),
        'override-unavailable'
      )
      return { ok: false }
    }

    if (decision.needsDownload && decision.pin) {
      const engine = await this.ensureBuiltInEngineForInstall(decision.pin)
      if ('status' in engine && engine.status === 'abort') {
        return { ok: false }
      }
      if ('status' in engine) {
        this.showEngineDialog(
          title,
          engine.error ?? '',
          'engine-download-failed'
        )
        return { ok: false }
      }
    }

    const sel: EngineSelection = decision.selection
    if (!setEngineSelection(this.appId, sel)) {
      logWarning(
        `SteamGame: appId ${this.appId} engine selection was rejected (${engineLabelForLog(sel)}); not launching`,
        LogPrefix.Steam
      )
      this.showEngineDialog(
        title,
        i18next.t(
          'gamelib:steam.engine.selectionRejected',
          "GameLib couldn't set up {{engine}} for this game, so it did not start. Check the launch log (Settings > Logs).",
          { engine: sel.kind === 'crossover' ? 'CrossOver' : sel.label }
        ),
        'engine-selection-rejected'
      )
      return { ok: false }
    }
    const prep = await prepareBottleForEngine({
      appId: this.appId,
      bottleName,
      next: sel,
      // 59-UAT G10: an override to CrossOver on an expired bottle must not run
      // the DXVK restore through CrossOver.
      crossoverHealthy: decision.preflight?.kind === 'healthy',
      // WR-05: a restore's pin download reports the same progress as a launch download.
      deps: { ensurePinEngine: this.restorePinEngine },
      // IN-05 (59-22): a real engine switch is "setting up", not a stale
      // "Downloading (100%)", until the monitor's launching status.
      onSwitching: () =>
        sendGameStatusUpdate({
          appName: this.appId,
          runner: 'steam',
          status: 'engine-download',
          context: 'setting-up'
        })
    })
    if (!prep.ok) {
      if (prep.reason === 'dxvk-failed' && sel.kind === 'crossover') {
        // CR-03 (D-03/D-07): never start on CrossOver over DXVK-macOS DLLs. No reroute to
        // bottled Steam; the switch is retried on the next launch.
        clearEngineSelection(this.appId)
        logWarning(
          `SteamGame: appId ${this.appId} could not switch back to CrossOver (${prep.detail}); not launching`,
          LogPrefix.Steam
        )
        this.showEngineDialog(
          title,
          i18next.t(
            'gamelib:steam.engine.restoreFailed',
            "GameLib couldn't finish switching {{title}} back to CrossOver, so it did not start. Check your connection and try again; GameLib retries the switch on the next launch.",
            { title }
          ),
          'engine-restore-failed'
        )
        return { ok: false }
      }
      if (prep.reason === 'dxvk-failed') {
        // The built-in engine is best-effort: missing DXVK degrades Direct3D
        // but is not a launch blocker.
        logWarning(
          `SteamGame: appId ${this.appId} DXVK setup failed (${prep.detail}); continuing`,
          LogPrefix.Steam
        )
      } else if (prep.reason === 'shared-bottle') {
        // 59-REVIEW WR-06: refuse, kill nothing, and say why.
        clearEngineSelection(this.appId)
        logWarning(
          `SteamGame: appId ${this.appId} cannot switch engine (${prep.reason}: ${prep.detail}); not launching`,
          LogPrefix.Steam
        )
        this.showEngineDialog(
          title,
          i18next.t(
            'gamelib:steam.engine.sharedBottle',
            "{{title}} is installed in GameLib's shared bridge bottle, where changing engines could stop other games. It can only run there on CrossOver. Uninstall and reinstall it to give it its own bottle.",
            { title }
          ),
          'engine-shared-bottle'
        )
        return { ok: false }
      } else {
        clearEngineSelection(this.appId)
        logWarning(
          `SteamGame: appId ${this.appId} cannot switch engine (${prep.reason}: ${prep.detail}); not launching`,
          LogPrefix.Steam
        )
        return { ok: false }
      }
    }

    // Engine and version on every launch (D-14) plus the untested-build line
    // (D-15), written from the decision so they cannot drift from it.
    for (const line of decision.logLines) {
      logInfo(`SteamGame: appId ${this.appId} ${line}`, LogPrefix.Steam)
    }
    recordLaunchDecision(this.appId, decision, bottleName)

    if (isNonCrossover(sel) && decision.override === 'automatic') {
      const body =
        sel.reason === 'cx-expired'
          ? i18next.t(
              'gamelib:steam.engine.toast.cxExpired',
              'CrossOver trial expired — using built-in engine'
            )
          : sel.reason === 'cx-broken'
            ? i18next.t(
                'gamelib:steam.engine.toast.cxBroken',
                "CrossOver isn't working — using built-in engine"
              )
            : i18next.t(
                'gamelib:steam.engine.toast.cxMissing',
                'CrossOver not found — using built-in engine'
              )
      notify({ title, body })
    }
    // 59-01 `nag_blocks: no`: a CrossOver trial reminder does not block a
    // launch, so no nag handling exists here. An expired bottle does hang
    // behind CodeWeavers' own dialog; the launch deadline in
    // fireBridgeWineLaunch bounds that. GameLib never edits NagTime, the
    // registry or the licence and never suppresses CodeWeavers' prompts.

    return { ok: true, settings: getBridgeBottleSettings(this.appId) }
  }

  /**
   * Phase 59 (D-10/D-11): the launch deadline fired with no game process
   * seen. Stops the bottle with the running engine's own wineserver (before
   * the registry entry that names it is cleared), stops the helper, and tells
   * the user. No fallback retry, no markBridgeFailedThisSession, no
   * steamBridgeSetupRequired: a game that never appeared on CrossOver is not
   * evidence that the bridge is broken, and retrying on the built-in engine
   * would hide the problem the user needs to see.
   */
  private async onBridgeLaunchDeadline(
    clearLaunchRecord: () => void,
    armedSelection: EngineSelection | undefined
  ): Promise<void> {
    const { stopBottleProcessMonitor } = await import('./bottleProcessMonitor')
    const { clearEngineSelection, getEngineSelection } =
      await import('./engine/engineRegistry')
    const { engineLogLabel } = await import('./engine/engineTypes')
    const { LAUNCH_DEADLINE_MS } = await import('./engine/launchDeadline')
    // Phase 59 UAT (G5): the monitor's onStopped can clear the registry entry
    // before the deadline fires, so fall back to the selection seen at arm time.
    const sel = getEngineSelection(this.appId) ?? armedSelection
    logWarning(
      `SteamGame: appId ${this.appId} launch deadline fired (${sel ? engineLogLabel(sel) : 'engine=crossover'}); stopping the bottle`,
      LogPrefix.Steam
    )
    stopBottleProcessMonitor(this.appId)
    await killBridgeBottleWineServer(this.appId, 15_000)
    stopBridgeHelper(this.appId)
    clearLaunchRecord()
    clearEngineSelection(this.appId)
    this.sendLaunchDone()
    this.showEngineDialog(
      i18next.t('gamelib:steam.engine.didntStart.title', "Game didn't start"),
      i18next.t(
        'gamelib:steam.engine.didntStart.body',
        "{{title}} did not start within {{seconds}} seconds, so GameLib stopped it. Check the launch log (Settings > Logs) and this game's known fixes.",
        { title: this.getGameInfo().title, seconds: LAUNCH_DEADLINE_MS / 1000 }
      ),
      'didnt-start'
    )
  }

  /**
   * Reads the launch exe's CEG markers through the bounded PE reader (never
   * the whole exe). 56-04's resolveBridgeMode sends a CEG-marked exe to 'tcp',
   * so the existing CEG refusal keeps handling it; the markers are therefore
   * read BEFORE drmLaunchSetup. Never throws.
   */
  /**
   * Quick 261029-e2t: the install-time half of DRM mode. Resolves the mode the
   * same way launchBridgeGame does (UE-aware `.bind` detection, CEG markers
   * from the `.bind` exe) and prefetches only when it is steamclient-layer.
   */
  async prefetchBridgeDrmDownloads(
    exePath: string,
    bridgeBottleName: string
  ): Promise<void> {
    const { drmWrapper, drmExe } = await detectLaunchDrmWrapper(
      getBottleDir(bridgeBottleName),
      exePath
    )
    // CEG markers are read once, and only for a steamstub exe.
    const cegMarkers =
      drmWrapper === 'steamstub' ? this.readLaunchExeCegMarkers(drmExe) : []
    // 59-REVIEW WR-04 / 59-15: persist the mode this install resolves so a
    // fresh DRM-mode title is excluded from the override before first launch.
    writeBridgeModeVerdict(
      this.appId,
      resolveBridgeMode(drmWrapper, cegMarkers) === 'steamclient-layer'
        ? 'steamclient-layer'
        : 'tcp'
    )
    if (drmWrapper !== 'steamstub') return
    await prefetchDrmDownloads({
      appId: this.appId,
      appFolder,
      drmWrapper,
      cegMarkers
    })
  }

  private readLaunchExeCegMarkers(exePath: string): string[] {
    let fd: number | null = null
    try {
      fd = openSync(exePath, 'r')
      const handle = fd
      const result = detectSteamDrmInPe((offset, length) => {
        const buf = Buffer.alloc(length)
        const n = readSync(handle, buf, 0, length, offset)
        return n < length ? null : new Uint8Array(buf.buffer, buf.byteOffset, n)
      })
      if (result?.parsed) return result.cegMarkers
      logWarning(
        `SteamGame: CEG detection could not parse the exe as a PE for appId ${this.appId} -- treating as not CEG`,
        LogPrefix.Steam
      )
      return []
    } catch (error) {
      logWarning(
        `SteamGame: CEG detection could not read the exe for appId ${this.appId}: ${String(error)}`,
        LogPrefix.Steam
      )
      return []
    } finally {
      if (fd !== null) {
        try {
          closeSync(fd)
        } catch {
          // nothing left to release
        }
      }
    }
  }

  /**
   * Phase 56 (D-11/D-12/D-13/D-15): launches a DRM-mode title as the helper
   * `steam.exe <game exe>` under the clone runner. The Phase 52 forwarder is
   * never reached in this mode. Every failure is a D-13 notice with no
   * session mark.
   */
  private async launchDrmModeGame(
    exePath: string,
    installRoot: string,
    ready: DrmLaunchReady
  ): Promise<boolean> {
    const macSteamClientDir = join(userHome, ...MAC_STEAM_CLIENT_SUBPATH)
    if (!existsSync(join(macSteamClientDir, 'steamclient.dylib'))) {
      this.maybeNotifyDrmModeFailed(
        'steam-not-running',
        drmStepError(
          'steam-not-running',
          `Mac Steam's steamclient.dylib was not found in ${macSteamClientDir}`
        ).cause
      )
      return false
    }
    const trace = prepareDrmTraceFile(appFolder, this.appId)
    if (trace.status === 'error') {
      this.maybeNotifyDrmModeFailed(
        'bottle-stage',
        drmStepError('bottle-stage', trace.cause).cause
      )
      return false
    }
    const anchorLine = formatBridgeDrmAnchor({
      appId: this.appId,
      crossover: ready.anchor.crossover,
      client: ready.anchor.client,
      trace: trace.traceFile
    })
    if (!anchorLine) {
      this.maybeNotifyDrmModeFailed(
        'bottle-stage',
        drmStepError('bottle-stage', 'invalid [bridge-drm] anchor fields').cause
      )
      return false
    }
    const gameWinPath = drmBottleWinPath(
      getBottleDir(ready.bottleSettings.wineCrossoverBottle),
      exePath
    )
    if (!gameWinPath) {
      this.maybeNotifyDrmModeFailed(
        'bottle-stage',
        drmStepError(
          'bottle-stage',
          "game exe is not under the bottle's drive_c"
        ).cause
      )
      return false
    }
    logInfo(
      `SteamGame: DRM launch for appId ${this.appId} install root ${installRoot}`,
      LogPrefix.Steam
    )
    // Not ready.bottleSettings-from-before: the settings computed before
    // drmLaunchSetup predate the runner swap (56-11 contract).
    // Phase 60 (D-05/D-08): the overlay rides the DRM clone only when its
    // wineloader is re-signed; any failure launches the clone without tokens.
    let overlayTokens: string[] | undefined
    if (this.resolveLaunchOverlay().enabled) {
      if (ready.runner.wineloaderResigned !== true) {
        this.notifyOverlaySetupFailed(
          'resign',
          'DRM runner wineloader not re-signed'
        )
      } else {
        const r = await prepareOverlayTokens({
          appId: this.appId,
          shimPath: builtOverlayShimPath,
          steamBinDir: macSteamClientDir,
          ...this.overlayInputArg('drm'),
          ...this.overlayProbeArg()
        })
        if (r.status === 'ok') overlayTokens = r.tokens
        else this.notifyOverlaySetupFailed(r.step, r.cause)
      }
    }
    return this.fireBridgeWineLaunch(exePath, ready.bottleSettings, {
      ready,
      gameWinPath,
      traceFile: trace.traceFile,
      anchorLine,
      macSteamClientDir,
      ...(overlayTokens ? { overlayTokens } : {})
    })
  }

  /**
   * Phase 60 (D-01/D-03): whether the overlay is on for this launch, and why.
   * Never throws: a failure here means no overlay, never a blocked launch.
   */
  private resolveLaunchOverlay(): { enabled: boolean; source: string } {
    try {
      const r = resolveOverlayEnabled({
        platform: process.platform,
        userOverride: readStoredOverlayOverride(this.appId),
        knownFixOff:
          readKnownFixes(this.appId, 'steam')?.steamGameOverlay === 'off'
      })
      logInfo(
        `SteamGame: appId ${this.appId} overlay=${r.enabled ? 'on' : 'off'} source=${r.source}`,
        LogPrefix.Steam
      )
      return r
    } catch (error) {
      logWarning(
        `SteamGame: appId ${this.appId} overlay policy failed, launching without the overlay: ${String(error)}`,
        LogPrefix.Steam
      )
      return { enabled: false, source: 'default' }
    }
  }

  /**
   * Phase 60 (D-08/D-09): an overlay setup failure is a log line plus a toast
   * in-app (SteamEngineLaunchNotice) and an OS notification on EVERY affected
   * launch, never a dialog, never deduped. Deliberately the
   * opposite of DRM's fail-closed rule (D-56-13): the overlay is an
   * enhancement, so the game still launches.
   */
  private notifyOverlaySetupFailed(step: OverlayStep, cause: string): void {
    logWarning(
      formatOverlayNoticeLine(this.appId, step, cause),
      LogPrefix.Steam
    )
    const pushed = publishOverlayNotice(this.appId, step)
    logInfo(
      `SteamGame: appId ${this.appId} overlay notice surface=in-app pushed=${pushed}`,
      LogPrefix.Steam
    )
    notify({
      title: i18next.t(
        'gamelib:steam.overlay.toast.title',
        'Steam overlay unavailable'
      ),
      body: i18next.t(
        'gamelib:steam.overlay.toast.body',
        '{{step}} The game is launching without the Steam overlay.',
        {
          step: i18next.t(
            'gamelib:' + OVERLAY_STEP_TEXT[step].key,
            OVERLAY_STEP_TEXT[step].en
          )
        }
      )
    })
  }

  private overlayInputLine(applied: boolean, reason?: string): string {
    return `SteamGame: appId ${this.appId} overlay input fix=${OVERLAY_INPUT_FIX_CODE} applied=${applied}${
      reason ? ` reason=${reason}` : ''
    }`
  }

  /**
   * 60-20 (G1): route-scoped overlay_input.dylib. Synchronous, no handle or
   * timer, never throws, never raises a notice (D-08). Together with
   * logOverlayInputOutcome it logs exactly one `overlay input fix=` line per
   * overlay launch: a refusal (route, disabled, experiment, probe, missing) is
   * logged here; a candidate path is returned unlogged and its outcome is logged
   * once the launch values are known (60-REVIEW WR-04). The DRM route only logs:
   * its result is not spread into the launch (D-04).
   */
  private overlayInputArg(
    route: 'tcp-clone' | 'env' | 'drm'
  ): { inputModulePath: string } | Record<string, never> {
    const line = (applied: boolean, reason?: string) =>
      this.overlayInputLine(applied, reason)
    try {
      if (!OVERLAY_INPUT_FIX_ROUTES.has(route)) {
        logInfo(line(false, 'route'), LogPrefix.Steam)
        return {}
      }
      if (process.env.GAMELIB_OVERLAY_INPUT_FIX === 'off') {
        logInfo(line(false, 'disabled'), LogPrefix.Steam)
        return {}
      }
      const armed = overlayInputProbeFromEnv(process.env, {
        appId: this.appId,
        traceRoot: '/',
        dylibPath: builtOverlayInputProbePath,
        now: 0
      })
      // 60-REVIEW WR-02: never load the fix beside the probe. Both hook the same
      // entry points, so each one's winemac caller check sees the other image
      // and the fix degrades to set_active only. Order: route, disabled,
      // experiment, probe, missing.
      if (armed) {
        logInfo(
          line(false, armed.experiment ? 'experiment' : 'probe'),
          LogPrefix.Steam
        )
        return {}
      }
      if (
        !lstatSync(builtOverlayInputPath, { throwIfNoEntry: false })?.isFile()
      ) {
        logWarning(line(false, 'missing'), LogPrefix.Steam)
        return {}
      }
      return { inputModulePath: builtOverlayInputPath }
    } catch (e) {
      logWarning(line(false, `missing: ${String(e)}`), LogPrefix.Steam)
      return {}
    }
  }

  /**
   * 60-REVIEW WR-04: the outcome line for a candidate from overlayInputArg,
   * read from the values the launch actually carries (CX_ENV tokens or env
   * values). applied=true only when DYLD_INSERT_LIBRARIES names the module;
   * otherwise (prepare error, runner refused, unsafe path dropped by the value
   * builder, a throw) applied=false reason=not-injected. Never throws.
   */
  private logOverlayInputOutcome(
    arg: { inputModulePath: string } | Record<string, never>,
    carried: readonly string[]
  ): void {
    try {
      if (!('inputModulePath' in arg)) return
      const path = arg.inputModulePath
      const key = 'DYLD_INSERT_LIBRARIES='
      const applied = carried.some((entry) => {
        if (!entry.startsWith(key)) return false
        let v = entry.slice(key.length)
        if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) {
          v = v.slice(1, -1)
        }
        return v.split(':').includes(path)
      })
      if (applied) logInfo(this.overlayInputLine(true), LogPrefix.Steam)
      else
        logWarning(
          this.overlayInputLine(false, 'not-injected'),
          LogPrefix.Steam
        )
    } catch {
      // Diagnostics only: never affects the launch.
    }
  }

  /**
   * 60-11 (G1): the dev-only input probe. Armed only when the sidecar was
   * started with GAMELIB_OVERLAY_INPUT_PROBE=1. Never blocks a launch and never
   * raises a notice: a missing or unusable probe just logs a warning.
   */
  private overlayProbeArg():
    | {
        probe: { dylibPath: string; logPath: string; experiment?: string }
      }
    | Record<string, never> {
    try {
      const traceRoot = buildOverlayPaths(appFolder)?.traceRoot
      if (!traceRoot) return {}
      const probe = overlayInputProbeFromEnv(process.env, {
        appId: this.appId,
        traceRoot,
        dylibPath: builtOverlayInputProbePath,
        now: Date.now()
      })
      if (!probe) return {}
      if (!lstatSync(probe.dylibPath, { throwIfNoEntry: false })?.isFile()) {
        logWarning(
          `SteamGame: appId ${this.appId} overlay input probe=missing`,
          LogPrefix.Steam
        )
        return {}
      }
      mkdirSync(traceRoot, { recursive: true, mode: 0o700 })
      logInfo(
        `SteamGame: appId ${this.appId} overlay input probe=on log=${probe.logPath.replace(userHome, '~')} experiment=${probe.experiment ?? 'off'}`,
        LogPrefix.Steam
      )
      if (
        process.env.GAMELIB_OVERLAY_RELEASE_EXPERIMENT !== undefined &&
        !probe.experiment
      ) {
        logWarning(
          `SteamGame: appId ${this.appId} overlay release experiment=invalid (ignored)`,
          LogPrefix.Steam
        )
      }
      return { probe }
    } catch (e) {
      logWarning(
        `SteamGame: appId ${this.appId} overlay input probe=unavailable: ${String(e)}`,
        LogPrefix.Steam
      )
      return {}
    }
  }

  /**
   * Phase 60 (D-01/D-04/D-07/D-08): the TCP-route overlay decision. Returns the
   * settings to launch with and, when the overlay is injecting, its tokens and
   * runner. On the fallback engine (Wine-Staging + DXVK) the overlay is plain
   * env vars (kind 'env', D-07): no clone, no re-sign, no runner change. Ends the bottle's wineserver with the PREVIOUS runner's own
   * wineserver whenever the runner changes (stock/overlay/DRM never share one).
   * Never throws and never blocks the launch.
   */
  private async prepareTcpOverlay(
    settings: GameSettings,
    previousRunner: ReturnType<typeof getDrmBridgeRunner>
  ): Promise<{
    settings: GameSettings
    overlayLaunch?: OverlayLaunchPayload
  }> {
    let registered = false
    // 60-REVIEW WR-04: the input-fix candidate and the values the launch really
    // carries; the one outcome line is logged in `finally`, after every exit.
    let inputArg:
      | { inputModulePath: string }
      | Record<string, never>
      | undefined
    let carried: readonly string[] = []
    try {
      const { getEngineSelection } = await import('./engine/engineRegistry')
      const { isNonCrossover } = await import('./engine/engineTypes')
      const sel = getEngineSelection(this.appId)
      const fallbackEngine = sel
        ? isNonCrossover(sel)
        : settings.wineVersion.type !== 'crossover'
      let ok:
        | {
            runner: OverlayRunnerReady
            tokens: string[]
          }
        | undefined
      let envVars:
        | Extract<OverlayLaunchPayload, { kind: 'env' }>['vars']
        | undefined
      if (fallbackEngine) {
        if (this.resolveLaunchOverlay().enabled) {
          inputArg = this.overlayInputArg('env')
          const result = await prepareOverlayEnv({
            appId: this.appId,
            shimPath: builtOverlayShimPath,
            steamBinDir: join(userHome, ...MAC_STEAM_CLIENT_SUBPATH),
            ...inputArg,
            ...this.overlayProbeArg()
          })
          if (result.status === 'error') {
            this.notifyOverlaySetupFailed(result.step, result.cause)
          } else {
            envVars = result.vars
            logInfo(
              `SteamGame: appId ${this.appId} overlay=env reason=fallback-engine (D-07)`,
              LogPrefix.Steam
            )
          }
        }
      } else if (this.resolveLaunchOverlay().enabled) {
        inputArg = this.overlayInputArg('tcp-clone')
        const result = await prepareOverlayLaunch({
          appId: this.appId,
          appFolder,
          shimPath: builtOverlayShimPath,
          steamBinDir: join(userHome, ...MAC_STEAM_CLIENT_SUBPATH),
          ...inputArg,
          ...this.overlayProbeArg()
        })
        if (result.status === 'error') {
          this.notifyOverlaySetupFailed(result.step, result.cause)
        } else {
          ok = { runner: result.runner, tokens: result.tokens }
        }
      }
      const nextRunnerDir = ok?.runner.runnerDir
      if (nextRunnerDir !== previousRunner?.runner.runnerDir) {
        await endPerGameBridgeBottleSessionWith(
          this.appId,
          settings.wineCrossoverBottle,
          previousRunner
            ? join(previousRunner.runner.cxRoot, 'bin')
            : undefined,
          DRM_END_SESSION_TIMEOUT_MS
        )
      }
      if (ok) {
        if (setOverlayBridgeRunner(this.appId, ok.runner)) {
          registered = true
          const launched = {
            settings: getBridgeBottleSettings(this.appId),
            overlayLaunch: {
              kind: 'cx-env' as const,
              tokens: ok.tokens,
              runnerBin: ok.runner.wrapperBin
            }
          }
          carried = ok.tokens
          return launched
        }
        this.notifyOverlaySetupFailed(
          'clone',
          'overlay runner registration refused'
        )
      }
      // Stock CrossOver (or the fallback engine) again: a previous overlay
      // entry was already cleared by drmLaunchSetup, so a stale clone
      // wineVersion must not ride along.
      if (previousRunner?.kind === 'overlay' && !fallbackEngine) {
        return { settings: getBridgeBottleSettings(this.appId) }
      }
      if (envVars) {
        carried = envVars.map((v) => `${v.key}=${v.value}`)
        return { settings, overlayLaunch: { kind: 'env', vars: envVars } }
      }
      return { settings }
    } catch (error) {
      logWarning(
        `SteamGame: appId ${this.appId} overlay setup threw, launching without the overlay: ${String(error)}`,
        LogPrefix.Steam
      )
      if (registered) clearDrmBridgeRunner(this.appId)
      return { settings }
    } finally {
      if (inputArg) this.logOverlayInputOutcome(inputArg, carried)
    }
  }

  /**
   * Phase 59: the engine registered for this launch (launchBridgeGameBody)
   * must not outlive a launch that did not start. A started launch keeps it
   * until the process monitor's onStopped clears it.
   */
  private launchBridgeGame(): Promise<boolean> {
    const appId = this.appId
    const existing = bridgeLaunchesInFlight.get(appId)
    if (existing) {
      logInfo(
        `SteamGame: appId ${appId} bridge launch already in progress; joining it instead of starting a second (G26)`,
        LogPrefix.Steam
      )
      notify({
        title: this.getGameInfo().title,
        // Same call shape as the file's other i18next.t uses; the lint ceiling counts warnings.
        // eslint-disable-next-line import-x/no-named-as-default-member
        body: i18next.t(
          'gamelib:steam.bridge.alreadyLaunching',
          'This game is already starting. Wait for its window to open.'
        )
      })
      return existing
    }
    const run = this.runBridgeLaunch()
    bridgeLaunchesInFlight.set(appId, run)
    run
      .finally(() => {
        if (bridgeLaunchesInFlight.get(appId) === run) {
          bridgeLaunchesInFlight.delete(appId)
        }
      })
      .catch(() => undefined)
    return run
  }

  private async runBridgeLaunch(): Promise<boolean> {
    let started = false
    try {
      started = await this.launchBridgeGameBody()
      return started
    } finally {
      if (!started) {
        const { clearEngineSelection } = await import('./engine/engineRegistry')
        clearEngineSelection(this.appId)
      }
    }
  }

  private async launchBridgeGameBody(): Promise<boolean> {
    // G25: one fresh connectivity check at Play (the monitor can be stale); the launch-target
    // read and the early offline refusal both use this result.
    const connectivity = await checkConnectivityNow(`launch ${this.appId}`)
    const exePath = await resolveBridgeLaunchExe(this.appId, {
      offline: connectivity.offline
    })
    if (!exePath) {
      logWarning(
        `SteamGame: could not resolve a Windows launch executable for appId ${this.appId} — not launching a bare/undefined path`,
        LogPrefix.Steam
      )
      markBridgeFailedThisSession(this.appId)
      sendFrontendMessage('steamBridgeSetupRequired', {
        appName: this.appId,
        reason: 'launch-exe-not-resolved',
        fallbackAvailable: true
      })
      return false
    }

    // D-UAT-24-02: a bridge-eligible game can be is_installed:true via a
    // native 32-bit Mac build or an old (Phase 17) bottle install, so the
    // bridge bottle/exe this method resolves above may never have actually
    // been placed on disk. Firing runWineCommand({wait:false}) at a
    // non-existent exe in a non-existent bottle is a silent no-op — wine
    // exits instantly, launch.log stays empty, the Play button reverts with
    // no explanation. Verify the resolved exe genuinely exists (and,
    // defensively, that the bridge bottle itself is ready) BEFORE ever
    // firing wine. This is a RECOVERABLE install-state mismatch, not a
    // bridge failure — do NOT markBridgeFailedThisSession here, since that
    // would poison the session against the very bridge install the
    // resulting dialog steers the user toward.
    // quick/261016-u1w (D-B threading): resolve THIS game's bottle once —
    // per-game bottle if ready, else the legacy shared bottle if that's
    // actually where this appId's manifest lives — and reuse it for the
    // existence gate, the shim refresh, the readiness gate, the config
    // handoff, AND the runWineCommand() gameSettings below, so the game
    // launches from the SAME bottle its exe was resolved against.
    let bridgeBottleSettings = getBridgeBottleSettings(this.appId)
    if (
      !isBridgeBottleReady(bridgeBottleSettings.wineCrossoverBottle) ||
      !existsSync(exePath)
    ) {
      logWarning(
        `SteamGame: appId ${this.appId} is bridge-eligible and marked installed, but the bridge bottle/exe is absent on disk (installed via a non-bridge path) — not firing wine at a non-existent exe (D-UAT-24-02)`,
        LogPrefix.Steam
      )
      sendFrontendMessage('steamBridgeSetupRequired', {
        appName: this.appId,
        reason: 'bridge-not-installed',
        fallbackAvailable: true
      })
      return false
    }

    // Phase 56 (D-12): steamclient-layer DRM mode branch, before any shim
    // placement (RESEARCH F10).
    const { drmWrapper: launchDrmWrapper, drmExe } =
      await detectLaunchDrmWrapper(
        getBottleDir(bridgeBottleSettings.wineCrossoverBottle),
        exePath
      )
    if (launchDrmWrapper === 'steamstub' && drmExe !== exePath) {
      logInfo(
        `SteamGame: appId ${this.appId} SteamStub .bind found on ${basename(drmExe)} (UE runtime exe)`,
        LogPrefix.Steam
      )
    }
    // CEG markers come from the exe that carries .bind (T-56-21-02).
    const launchCegMarkers =
      launchDrmWrapper === 'steamstub'
        ? this.readLaunchExeCegMarkers(drmExe)
        : []
    const previousRunner = getDrmBridgeRunner(this.appId)
    // Only a DRM runner's absence changes the settings drmLaunchSetup clears;
    // an overlay entry is handled by prepareTcpOverlay below.
    const hadDrmRunner = previousRunner?.kind === 'drm'
    let overlayLaunch: OverlayLaunchPayload | undefined
    const wantsDrm =
      resolveBridgeMode(launchDrmWrapper, launchCegMarkers) ===
      'steamclient-layer'
    // 59-REVIEW WR-04 / 59-15: persist what this launch routed on so the engine
    // state keeps the override off DRM-mode titles.
    writeBridgeModeVerdict(this.appId, wantsDrm ? 'steamclient-layer' : 'tcp')
    const drmInstallRoot = wantsDrm
      ? this.resolveBridgeGameInstallRoot(
          exePath,
          bridgeBottleSettings.wineCrossoverBottle
        )
      : undefined
    if (wantsDrm && !drmInstallRoot) {
      this.maybeNotifyDrmModeFailed(
        'bottle-stage',
        drmStepError('bottle-stage', 'install root not resolved').cause
      )
      return false
    }
    if (wantsDrm) {
      // DRM mode stays CrossOver-only (phase 59 out of scope): a clear message
      // instead of a hang, never the built-in engine, never decideLaunchEngine.
      const { preflightCrossover } = await import('./engine/engineDecision')
      const pre = await preflightCrossover(
        bridgeBottleSettings.wineCrossoverBottle
      )
      if (pre.kind !== 'healthy') {
        this.notifyCrossoverRequired('drm', pre)
        this.sendLaunchDone()
        return false
      }
    } else {
      const engine = await this.selectLaunchEngine(
        bridgeBottleSettings,
        connectivity
      )
      if (!engine.ok) {
        this.sendLaunchDone()
        return false
      }
      bridgeBottleSettings = engine.settings
    }
    // No signal is passed: the bridge launch has no abort controller.
    const drm = await drmLaunchSetup({
      appId: this.appId,
      appFolder,
      bottleName: bridgeBottleSettings.wineCrossoverBottle,
      exePath,
      installRoot: drmInstallRoot ?? '',
      installdir: drmInstallRoot ? basename(drmInstallRoot) : '',
      drmWrapper: launchDrmWrapper,
      cegMarkers: launchCegMarkers,
      drmExe
    })
    if (drm.status === 'not-applicable') {
      // drmLaunchSetup cleared the clone runner, so the TCP launch must not
      // keep the clone wineVersion (D-11).
      if (hadDrmRunner) {
        bridgeBottleSettings = getBridgeBottleSettings(this.appId)
      }
      // Phase 60: on by default (D-01); with the overlay off a TCP-mode game
      // runs on stock CrossOver exactly as before (D-04). Runs on every TCP
      // launch so a runner change always ends the old wineserver.
      const tcp = await this.prepareTcpOverlay(
        bridgeBottleSettings,
        previousRunner
      )
      bridgeBottleSettings = tcp.settings
      overlayLaunch = tcp.overlayLaunch
    } else if (drm.status === 'error') {
      // D-13: no markBridgeFailedThisSession, no steamBridgeSetupRequired, no
      // bottled Steam. drmLaunchSetup's fail() sends the terminal 'done' when
      // it sent 'drm-setup' progress: the Steam launch is dispatched by
      // dispatchSteamLaunch (steamFlowRegistration.ts) and never reaches
      // launcher.ts's 'done' (IN-01, D-05).
      this.maybeNotifyDrmModeFailed(drm.step, drm.cause)
      return false
    } else {
      // WR-01 (quick 261029-m68): 'done' is sent on every non-launch (a false
      // return or a throw). Success is excluded so the launching/playing set
      // by startBottleProcessMonitor is not clobbered. fireBridgeWineLaunch's
      // known-fixes / shared-redist steps send winetricks/redist before
      // DRM-only exits, progressSent is usually false since quick 261029-e2t
      // prefetches at install, and dispatchSteamLaunch bypasses launcher.ts's
      // 'done'. 'done' is idempotent in GlobalState.handleGameStatus. No catch:
      // a throw propagates untouched.
      let launched = false
      try {
        launched = await this.launchDrmModeGame(
          exePath,
          drmInstallRoot as string,
          drm
        )
        return launched
      } finally {
        if (!launched) {
          sendGameStatusUpdate({
            appName: this.appId,
            runner: 'steam',
            status: 'done'
          })
          logInfo(
            `SteamGame: drm launch appId ${this.appId} sent terminal status done after launch failure`,
            LogPrefix.Steam
          )
        }
      }
    }

    // D-51-01: byte-identity no-op on every normal launch — only does real
    // work when the placed shim has gone stale (e.g. a shim-version bump
    // shipped after this game was installed). quick 261026-lif: an
    // `already-placed` result is no longer guaranteed when a `.gamelib-orig`
    // is new or its fingerprint changed; placement then rescans.
    // D-51-09 (Task 2): the previously-persisted scan verdict's own
    // interfaceVersions pool is threaded through as persistedInterfaceVersions
    // -- per placeShimForGame's own header, this is the ONLY source left for
    // an already-shimmed target (an older GameLib shim has no "original"
    // dll version strings left to read).
    // 51-REVIEW WR-01: once an auto-clear has removed `scan`, the pool
    // `clearBridgeScanVerdict` retained at the top level is the fallback
    // (also used when the current scan's own pool is empty).
    const persistedVerdict = readBridgeVerdict(this.appId)
    const persistedScan = persistedVerdict?.scan
    const scanPool = persistedScan?.interfaceVersions
    const persistedInterfaceVersions =
      scanPool && Object.keys(scanPool).length > 0
        ? scanPool
        : (persistedVerdict?.interfaceVersions ?? scanPool)
    // `??` on purpose: the scan's own map (even empty) describes the current
    // scan; the retained copy is never empty (see clearBridgeScanVerdict).
    const persistedOriginalFingerprints =
      persistedScan?.originalFingerprints ??
      persistedVerdict?.originalFingerprints
    const shimResult = await placeShimForGame(this.appId, exePath, {
      bottleName: bridgeBottleSettings.wineCrossoverBottle,
      gameInstallRoot:
        this.resolveBridgeGameInstallRoot(
          exePath,
          bridgeBottleSettings.wineCrossoverBottle
        ) ?? undefined,
      ...(persistedInterfaceVersions ? { persistedInterfaceVersions } : {}),
      // quick 261026-lif: lets placement notice a new or changed
      // `.gamelib-orig` and rescan instead of trusting this verdict.
      // quick 261026-u1a: after an auto-clear the fingerprints
      // `clearBridgeScanVerdict` kept at the top level are the fallback. A
      // stale top-level copy cannot shadow a fresher scan: scan wins, and
      // every new scan write re-persists into scan.
      ...(persistedOriginalFingerprints
        ? { persistedOriginalFingerprints }
        : {})
    })

    if (
      shimResult.status === 'shim-not-built' ||
      shimResult.status === 'error'
    ) {
      logWarning(
        `SteamGame: launchBridgeGame could not (re)place the shim for appId ${this.appId}: ${shimResult.status === 'error' ? shimResult.error : `shim-not-built (arch=${shimResult.arch})`}`,
        LogPrefix.Steam
      )
      markBridgeFailedThisSession(this.appId)
      sendFrontendMessage('steamBridgeSetupRequired', {
        appName: this.appId,
        // D-51-13: a missing Win64 shim is its own named reason -- the
        // target does not exist at all until 51-15, a different story from
        // a generic placement failure.
        reason:
          shimResult.status === 'shim-not-built' && shimResult.arch === 'x64'
            ? 'win64-no-shim'
            : 'shim-refresh-failed',
        fallbackAvailable: true
      })
      return false
    }

    // Remaining statuses: 'placed' | 'placed-miss' | 'already-placed' |
    // 'no-steam-api' | 'withheld' (quick 261024-j4l: launched direct above). Amended 2026-10-23 (quick 261023-oq7): a coverage miss
    // no longer aborts the launch -- the shim was placed anyway and the
    // title runs through the bridge. A static-import miss will most likely
    // fail at load with a Windows entry-point error INSIDE the wine
    // process; that happens after runWineCommand returns and is not
    // detected as a launch failure. Only real failures below (helper not
    // ready, cfg write, wine launch) arm the breaker.
    // 'placed', 'placed-miss' and 'no-steam-api' all carry a fresh verdict to persist
    // (D-51-07); 'already-placed' is a true no-op with no verdict at all --
    // the caller keeps whatever it already persisted (shimGenerate.ts's own
    // header, D-UAT-24-04).
    if (shimResult.verdict) {
      writeBridgeScanVerdict(this.appId, shimResult.verdict)
    }

    // shimGenerate stamps a fresh `drmWrapper` ('steamstub' | 'none') on most
    // results. A fresh 'none' clears a stale persisted 'steamstub', so the
    // persisted scan that meta/bridgeCensus.ts and the electronStores record
    // read stays honest. Routing reads the exe directly in the 56-12 DRM
    // branch above (D-12), not this value.
    const freshDrm =
      'drmWrapper' in shimResult ? shimResult.drmWrapper : undefined
    if (
      freshDrm === 'none' &&
      !shimResult.verdict &&
      persistedScan?.drmWrapper === 'steamstub'
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { drmWrapper: _cleared, ...scanWithoutDrm } = persistedScan
      writeBridgeScanVerdict(this.appId, scanWithoutDrm)
      logInfo(
        `SteamGame: cleared stale persisted drmWrapper=steamstub for appId ${this.appId} (fresh scan says none)`,
        LogPrefix.Steam
      )
    }

    // Quick 261024-br4: an already-installed Steam CEG title (XCOM 200510)
    // would otherwise idle ~30s and exit silently. Same dialog as install,
    // but the bottle is NOT removed -- launch never deletes (mirrors the
    // win64-no-shim handling above). A forced 'bridge' proceeds.
    const cegMarkers = this.persistBridgeDrmSignal(
      shimResult.drm,
      'launchBridgeGame'
    )
    if (cegMarkers) {
      logWarning(
        `SteamGame: launchBridgeGame found Steam CEG DRM in the exe for appId ${this.appId} (${cegMarkers.join(', ')}) -- CEG needs the Windows Steam client, which a bridge bottle does not have; not launching`,
        LogPrefix.Steam
      )
      markBridgeFailedThisSession(this.appId)
      sendFrontendMessage('steamBridgeSetupRequired', {
        appName: this.appId,
        reason: 'drm-wrapped',
        fallbackAvailable: true
      })
      return false
    }

    // CR-04: already-installed titles self-heal a wrong persisted 'none'.
    this.reconcileBridgePrescreen(shimResult)

    // D-51-09 (Task 2): a title that imports nothing from
    // steam_api(64)?.dll at all has nothing for the bridge helper to
    // interpose on -- skip ensureBridgeHelperReady/writeBridgeConfig
    // entirely and launch directly (mirrors there being no helper to spawn
    // for a no-steam-api install in the first place).
    if (
      shimResult.status === 'no-steam-api' ||
      shimResult.status === 'withheld'
    ) {
      logInfo(
        shimResult.status === 'withheld'
          ? `SteamGame: launching appId ${this.appId} via the Steam bridge bottle directly (shim withheld: coverage gaps ${shimResult.verdict.missingSymbols.join(', ')}, no helper)`
          : `SteamGame: launching appId ${this.appId} via the Steam bridge bottle directly (no-steam-api, no helper)`,
        LogPrefix.Steam
      )
      return this.fireBridgeWineLaunch(
        exePath,
        bridgeBottleSettings,
        undefined,
        overlayLaunch
      )
    }

    // 261027-aue: InitFlat fails fast while Steam is quit or signing in, so the
    // helper layer waits (bounded) for it -- tell the user, who would
    // otherwise see up to a minute of silence after pressing Play.
    const helperReady = await ensureBridgeHelperReady(this.appId, {
      onWaitingForSteam: (cause) =>
        notify({
          title: i18next.t(
            'gamelib:steam.bridge.waiting.title',
            'Waiting for Steam'
          ),
          body:
            cause === 'steam-not-running'
              ? i18next.t(
                  'gamelib:steam.bridge.waiting.notRunning',
                  'Starting Steam. The game will launch once Steam has signed in.'
                )
              : i18next.t(
                  'gamelib:steam.bridge.waiting.signingIn',
                  'Waiting for Steam to finish signing in. The game will launch once it has.'
                )
        })
    })
    if (
      !helperReady.ready ||
      helperReady.port === undefined ||
      helperReady.secret === undefined
    ) {
      logWarning(
        `SteamGame: bridge helper not ready for appId ${this.appId} (status=${helperReady.status}) — not launching (no no-identity launch, D-05/D-06)`,
        LogPrefix.Steam
      )
      // 261027-aue: a Steam-state cause is about Steam, not this game's bridge:
      // do not poison the session (the next Play retries the bridge) and do
      // not offer the bottled-Steam fallback. The setup message itself was
      // already sent by ensureBridgeHelperReady for these statuses.
      const steamStateCause =
        helperReady.status === 'steam-not-running' ||
        helperReady.status === 'steam-not-signed-in'
      if (!steamStateCause) {
        markBridgeFailedThisSession(this.appId)
      }
      sendFrontendMessage('steamBridgeSetupRequired', {
        appName: this.appId,
        reason: helperReady.status,
        fallbackAvailable: !steamStateCause
      })
      return false
    }

    // D-51-02/D-51-04 (Phase 51 Plan 12): the helper is ready (status
    // 'ready') or has fallen back to identity-only (status
    // 'fallback-identity') -- either way the game IS about to launch, so
    // this is the right point to log/notify about any limited
    // functionality BEFORE runWineCommand fires. Re-reads the verdict
    // fresh (not the `persistedScan` captured before placeShimForGame
    // ran) so a 'placed'/'no-steam-api' write above is reflected.
    this.maybeNotifyBridgeLimited(
      readBridgeVerdict(this.appId),
      helperReady.status === 'fallback-identity'
    )

    // D-51-09 (Task 2): hand the shim's required interface-version pool to
    // the cfg -- the FRESH verdict's own pool when this call just (re)placed
    // or no-op-confirmed one ('placed' only has a verdict; 'already-placed'
    // has none, so the previously-persisted scan's pool is reused since the
    // shim itself did not change; 51-REVIEW WR-01: or the pool retained when
    // that scan was auto-cleared).
    const interfaceVersionsForConfig =
      shimResult.verdict?.interfaceVersions ?? persistedInterfaceVersions
    // quick 261023-ue0: the shim reads the cfg beside ITS OWN module, so
    // hand writeBridgeConfig every shim path (rewritten on every launch,
    // including 'already-placed').
    const shimPaths =
      shimResult.status === 'placed-miss'
        ? shimResult.shimPaths
        : (shimResult.shimPaths ?? [shimResult.shimPath])
    // Spike 034: the tier-2 profile's shimFeatures ride in the same cfg.
    const { steamShimFeatureCfgLines } = await import('./bridgeKnownFixes')
    const configResult = writeBridgeConfig({
      exePath,
      bottleName: bridgeBottleSettings.wineCrossoverBottle,
      appId: this.appId,
      port: helperReady.port,
      // WR-03: the secret of the exact helper entry whose port this is.
      secret: helperReady.secret,
      shimPaths,
      fixLines: steamShimFeatureCfgLines(this.appId),
      ...(interfaceVersionsForConfig
        ? { interfaceVersions: interfaceVersionsForConfig }
        : {})
    })
    if (configResult.status === 'error') {
      logWarning(
        `SteamGame: launchBridgeGame failed to write gamelib_bridge.cfg for appId ${this.appId}: ${configResult.error}`,
        LogPrefix.Steam
      )
      markBridgeFailedThisSession(this.appId)
      sendFrontendMessage('steamBridgeSetupRequired', {
        appName: this.appId,
        reason: 'bridge-config-write-failed',
        fallbackAvailable: true
      })
      return false
    }

    logInfo(
      `SteamGame: launching appId ${this.appId} via the Steam bridge (${exePath}, helper port=${helperReady.port}, cfg copies=${1 + (configResult.extraPaths?.length ?? 0)})`,
      LogPrefix.Steam
    )
    return this.fireBridgeWineLaunch(
      exePath,
      bridgeBottleSettings,
      undefined,
      overlayLaunch
    )
  }

  /**
   * D-51-09 (Task 2): the actual `runWineCommand` + process-monitor firing,
   * split out of `launchBridgeGame` so the no-steam-api branch (no helper,
   * no `writeBridgeConfig`) and the normal helper-backed branch share the
   * exact same wine-invocation and teardown-wiring code — duplicating this
   * would risk the two paths drifting (e.g. one forgetting the monitor's
   * `onStopped` -> `stopBridgeHelper` wiring).
   */
  private async fireBridgeWineLaunch(
    exePath: string,
    bridgeBottleSettings: GameSettings,
    drm?: DrmWineLaunch,
    overlay?: OverlayLaunchPayload
  ): Promise<boolean> {
    const reportLaunchFailure = (error: unknown) => {
      logWarning(
        [`SteamGame: bridge launch failed for appId ${this.appId}`, error],
        LogPrefix.Steam
      )
      if (drm) {
        // D-13: no session mark, no steamBridgeSetupRequired.
        this.maybeNotifyDrmModeFailed(
          'bottle-stage',
          drmStepError('bottle-stage', 'wine launch failed: ' + String(error))
            .cause
        )
        return
      }
      markBridgeFailedThisSession(this.appId)
      sendFrontendMessage('steamBridgeSetupRequired', {
        appName: this.appId,
        reason: 'bridge-launch-failed',
        fallbackAvailable: true
      })
    }

    // quick 261024-urq: this launch's own record (see bridgeLaunchBottles).
    const launchRecord = { bottle: bridgeBottleSettings.wineCrossoverBottle }
    const clearLaunchRecord = () => {
      if (bridgeLaunchBottles.get(this.appId) === launchRecord) {
        bridgeLaunchBottles.delete(this.appId)
      }
    }
    // D-15: the trace is re-logged once, when the game is gone.
    let relogged = false
    const relogOnce = () => {
      if (!drm || relogged) return
      relogged = true
      relogDrmTrace(this.appId, drm.traceFile)
    }

    // Phase 59 (D-10/D-11): declared before the try so the catch can cancel it.
    let deadline: LaunchDeadline | undefined
    const deadlineFired = () => deadline?.state === 'fired'

    // Phase 60: true only where overlay tokens were actually applied to this
    // launch. Gates the attach watch, wine-log sink and D-10 check.
    let overlayInjected = false

    try {
      const { runWineCommand } = await import('backend/launcher')
      const { startBottleProcessMonitor, getBottleProcessMonitorPhase } =
        await import('./bottleProcessMonitor')
      const { armLaunchDeadline, bindDeadlineToMonitor } =
        await import('./engine/launchDeadline')
      const { getEngineSelection, clearEngineSelection } =
        await import('./engine/engineRegistry')
      const { applySteamBridgeKnownFixes, steamBridgeLaunchCommandParts } =
        await import('./bridgeKnownFixes')
      const { applyBridgeBottleDllOverrides } =
        await import('./bridge/bottleDllOverrides')
      const { installSteamBridgeSharedRedists } =
        await import('./bridge/sharedRedistInstall')

      // Phase 51 Plan 01 Task 2 (D-51-01): the helper's lifetime is tied to
      // THIS game's own process lifetime, never to the whole app session —
      // the monitor's onStopped fires exactly once, when the matched
      // process(es) are gone, and tears down only this appId's helper.
      // stopBridgeHelper is a safe no-op when no-steam-api never spawned one.
      //
      // Plan 51-23 (51-UAT item 2): the monitor MUST start before the wine
      // child is awaited. runWineCommand resolves only on the child's
      // `close`, and CrossOver's `winewrapper.exe --run` lives as long as the
      // game, so starting the monitor after the await meant it started after
      // its own game had exited. The wine promise is therefore never awaited:
      // its settlement is routed to the monitor's launcherExited() instead.
      const installRoot = this.resolveBridgeGameInstallRoot(
        exePath,
        bridgeBottleSettings.wineCrossoverBottle
      )

      // Phase 59 (D-10/D-11): armed before the shared-redist step so the
      // default covers a first-run prefix update and the redists. Cancelled
      // when the monitor first sees the game process. Needs a monitor to be
      // cancellable; the monitor matches built-in-engine processes by host path
      // (1a5b750bb, G8), and bindDeadlineToMonitor stands the deadline down
      // when no monitor starts (59-REVIEW CR-01).
      const sel = getEngineSelection(this.appId)
      if (!installRoot) {
        logInfo(
          `SteamGame: appId ${this.appId} has no process monitor, so no launch deadline is armed`,
          LogPrefix.Steam
        )
      } else {
        deadline = armLaunchDeadline({
          appId: this.appId,
          onDeadline: () => this.onBridgeLaunchDeadline(clearLaunchRecord, sel)
        })
      }

      // quick 261024-tny: the known-fixes hook for the bridge path. It runs
      // BEFORE the monitor because the monitor's start sends 'launching',
      // which supersedes the 'winetricks'/'redist' statuses the applier sends,
      // while the monitor must still start before the wine child is awaited
      // (Plan 51-23). It runs on every launch (D2: verbs re-run, no ledger).
      // The applier never rejects by contract; the .catch is belt-and-braces so
      // a fix problem can never reach the outer catch, whose
      // reportLaunchFailure would mark the bridge failed for the session.
      const fixedSettings = await applySteamBridgeKnownFixes(
        this.appId,
        bridgeBottleSettings,
        installRoot,
        // quick 261028-k7l: exePath feeds the generic GameMaker D3D11 runner default.
        exePath
      ).catch((error: unknown) => {
        logWarning(
          `SteamGame: known-fixes application failed for appId ${this.appId}: ${String(error)}`,
          LogPrefix.Steam
        )
        return bridgeBottleSettings
      })
      if (deadlineFired()) return false

      // quick 261025-rkj: Steam's first-launch "Installing ..." step for the
      // Steamworks Common Redistributables (VC++/DirectX) the game's appinfo
      // declares, run in this appId's own bridge bottle under the 'redist'
      // status. After the known fixes so a trusted `registry` fix can pre-write
      // a HasRunKey and suppress a component; before the monitor because its
      // 'launching' supersedes 'redist'. Never rejects by contract; the .catch is
      // belt-and-braces so nothing reaches the outer catch (markBridgeFailedThisSession).
      // No signal is passed: the bridge launch has no abort signal, and stop() has no
      // handle on this step (bridgeLaunchBottles is recorded after it). The helper accepts
      // one (WR-06) for when a launch-scoped AbortController exists.
      //
      // Phase 54: Play passes no allowLogon, so a Play can reuse an open session
      // but never opens an authenticated logon. Unsettled redists are fetched by
      // the bridge install step (plan 08 Task 2) or the next session-holding action.
      await installSteamBridgeSharedRedists(
        this.appId,
        bridgeBottleSettings
      ).catch((error: unknown) => {
        logWarning(
          `SteamGame: shared redist install failed for appId ${this.appId}: ${String(error)}`,
          LogPrefix.Steam
        )
      })
      if (deadlineFired()) return false

      // 53-19 (D-53-06): measured per-title DLL override in this appId's own
      // bridge bottle (Overlooting nvapi64). Never rejects; .catch is
      // belt-and-braces for the same reason as above.
      let launchSettings = await applyBridgeBottleDllOverrides(
        this.appId,
        fixedSettings
      ).catch((error: unknown) => {
        logWarning(
          `SteamGame: DLL override application failed for appId ${this.appId}: ${String(error)}`,
          LogPrefix.Steam
        )
        return fixedSettings
      })
      if (deadlineFired()) return false

      let drmCommandPrefix: string[] = []
      if (drm) {
        const { ready } = drm
        // One runner per bottle (D-11): a known fix must not swap it back.
        if (
          launchSettings.wineVersion.bin !==
          ready.bottleSettings.wineVersion.bin
        ) {
          logWarning(
            `SteamGame: a launch step changed the wine runner for appId ${this.appId}; restoring the DRM clone runner (D-11)`,
            LogPrefix.Steam
          )
          launchSettings = {
            ...launchSettings,
            wineVersion: ready.bottleSettings.wineVersion,
            winePrefix: ready.bottleSettings.winePrefix
          }
        }
        const env = (drm.buildEnv ?? buildDrmLaunchEnvironment)({
          appId: this.appId,
          traceFile: drm.traceFile,
          macSteamClientDir: drm.macSteamClientDir,
          steamDirHost: ready.bottle.steamDirHost,
          windowsDllDir: ready.runner.windowsDllDir,
          unixDllDir: ready.runner.unixDllDir,
          launchForm: ready.launchForm,
          dllPathChannel: DRM_DLLPATH_CHANNEL,
          dllOverridesChannel: DRM_DLLOVERRIDES_CHANNEL,
          base: launchSettings.enviromentOptions ?? [],
          ...(drm.overlayTokens ? { overlayTokens: drm.overlayTokens } : {})
        })
        if (env.status === 'error') {
          this.maybeNotifyDrmModeFailed(
            'bottle-stage',
            drmStepError('bottle-stage', env.cause).cause
          )
          deadline?.cancel('launch-error')
          return false
        }
        launchSettings = {
          ...launchSettings,
          enviromentOptions: env.enviromentOptions
        }
        // Dev-only diagnostic channel list (56-20); validated, DRM launches only.
        const wineDebug = drmWineDebugFromEnv(process.env.GAMELIB_DRM_WINEDEBUG)
        if (wineDebug) {
          launchSettings = {
            ...launchSettings,
            enviromentOptions: [
              ...(launchSettings.enviromentOptions ?? []),
              { key: 'WINEDEBUG', value: wineDebug }
            ]
          }
          logInfo(
            `SteamGame: drm launch appId ${this.appId}: WINEDEBUG=${wineDebug} (GAMELIB_DRM_WINEDEBUG)`,
            LogPrefix.Steam
          )
        }
        drmCommandPrefix = env.commandPrefix
        if (drm.overlayTokens?.length) overlayInjected = true

        for (const cmd of env.registryCommands) {
          let timer: ReturnType<typeof setTimeout> | undefined
          const timeout = new Promise<'timeout'>((resolveTimeout) => {
            timer = setTimeout(
              () => resolveTimeout('timeout'),
              DRM_REGISTRY_TIMEOUT_MS
            )
            timer.unref?.()
          })
          let failure: string | undefined
          try {
            const res = await Promise.race([
              runWineCommand({
                gameSettings: launchSettings,
                commandParts: [...cmd],
                wait: true,
                protonVerb: 'run',
                skipPrefixCheckIKnowWhatImDoing: true
              }),
              timeout
            ])
            if (res === 'timeout') {
              failure = `timed out after ${DRM_REGISTRY_TIMEOUT_MS} ms`
            } else if (res.code !== 0) {
              // log-secret-gate-exempt: reg.exe stderr is wine's own diagnostic text, no credential.
              failure = `code=${String(res.code)}, stderr=${String(res.stderr ?? '').slice(0, 200)}`
            }
          } catch (error) {
            failure = String(error)
          } finally {
            if (timer) clearTimeout(timer)
          }
          if (failure !== undefined) {
            this.maybeNotifyDrmModeFailed(
              'bottle-stage',
              drmStepError(
                'bottle-stage',
                `DLL override registry write failed: ${failure}`
              ).cause
            )
            deadline?.cancel('launch-error')
            return false
          }
          if (deadlineFired()) return false
        }
      }

      if (!drm && overlay?.kind === 'env') {
        // Fallback engine (D-07): its own runner stands; no restore.
        try {
          launchSettings = {
            ...launchSettings,
            enviromentOptions: mergeOverlayEnvVars(
              launchSettings.enviromentOptions ?? [],
              overlay.vars
            )
          }
          overlayInjected = true
        } catch (error) {
          this.notifyOverlaySetupFailed('env', String(error))
        }
      } else if (!drm && overlay?.kind === 'cx-env') {
        // One runner per bottle (T-60-08-04): a known fix must not swap it.
        if (launchSettings.wineVersion.bin !== overlay.runnerBin) {
          logWarning(
            `SteamGame: a launch step changed the wine runner for appId ${this.appId}; restoring the overlay clone runner`,
            LogPrefix.Steam
          )
          launchSettings = {
            ...launchSettings,
            wineVersion: getBridgeBottleSettings(this.appId).wineVersion
          }
        }
        const merged = appendCxEnvTokens(
          launchSettings.enviromentOptions ?? [],
          overlay.tokens
        )
        if (merged.status === 'ok') {
          launchSettings = { ...launchSettings, enviromentOptions: merged.env }
          overlayInjected = true
        } else {
          this.notifyOverlaySetupFailed('env', merged.cause)
        }
      }

      const launchStartedAt = Date.now()

      // D-11: diagnostic only (no UI, no toast). The watcher is bounded,
      // unref'd and abortable (sidecar exit contract); it reads Mac Steam's
      // console_log under the real HOME, the declared real-profile read arm.
      // Never awaited by the launch.
      let attachStarted = false
      const startAttachWatch = () => {
        if (attachStarted || !overlayInjected) return
        attachStarted = true
        void Promise.resolve(
          watchOverlayAttach({
            appId: this.appId,
            consoleLogPath: macSteamConsoleLogPath(userHome),
            launchStartedAt,
            // 60-UAT G2: the DRM helper hop attaches about 13 s in.
            ...(drm ? { timeoutMs: OVERLAY_ATTACH_DRM_TIMEOUT_MS } : {})
          })
        ).catch(() => undefined)
      }

      // D-10: an overlay launch whose game vanishes within the window gets a
      // text pointer to Run > Steam overlay (orchestrator resolution 4: an
      // inline button would need a settings deep link the app does not have).
      // Never retries, never changes settings.
      let firstMatchAt: number | undefined
      let stoppedAt: number | undefined
      let wrapperSettled = false
      let wrapperCode: number | undefined
      let overlayExitDecided = false
      let graceTimer: ReturnType<typeof setTimeout> | undefined
      const maybeReportOverlayAbnormalExit = (graceFired: boolean) => {
        if (!overlayInjected || overlayExitDecided) return
        if (stoppedAt === undefined) return
        if (!wrapperSettled && !graceFired) return
        overlayExitDecided = true
        if (graceTimer) clearTimeout(graceTimer)
        graceTimer = undefined
        if (
          !isAbnormalOverlayExit({
            firstMatchAt,
            stoppedAt,
            wrapperCode
          })
        ) {
          return
        }
        logWarning(formatOverlayExitNoticeLine(this.appId), LogPrefix.Steam)
        const pushed = publishOverlayExitNotice(this.appId)
        logInfo(
          `SteamGame: appId ${this.appId} overlay exit notice surface=in-app pushed=${pushed}`,
          LogPrefix.Steam
        )
        notify({
          title: i18next.t(
            'gamelib:steam.overlay.exit.title',
            'Game closed soon after starting'
          ),
          body: i18next.t(
            'gamelib:steam.overlay.exit.body',
            "The game exited within 30 seconds with the Steam overlay on. If this is a crash and keeps happening, try turning the overlay off in this game's settings: Run > Steam overlay."
          )
        })
      }

      let handle: ReturnType<typeof startBottleProcessMonitor> = null
      if (installRoot) {
        handle = bindDeadlineToMonitor(
          deadline,
          startBottleProcessMonitor({
            appId: this.appId,
            installPath: installRoot,
            bottleDir: getBottleDir(bridgeBottleSettings.wineCrossoverBottle),
            kind: 'bridge',
            onFirstMatch: () => {
              deadline?.cancel('first-match')
              if (overlayInjected) {
                firstMatchAt ??= Date.now()
                startAttachWatch()
              }
            },
            onUnavailable: () => deadline?.cancel('monitor-unavailable'),
            onStopped: () => {
              clearLaunchRecord()
              stopBridgeHelper(this.appId)
              clearEngineSelection(this.appId)
              relogOnce()
              if (overlayInjected && stoppedAt === undefined) {
                stoppedAt = Date.now()
                if (!wrapperSettled && !overlayExitDecided) {
                  graceTimer = setTimeout(
                    () => maybeReportOverlayAbnormalExit(true),
                    OVERLAY_EXIT_GRACE_MS
                  )
                  graceTimer.unref?.()
                }
                maybeReportOverlayAbnormalExit(false)
              }
            }
          }),
          (m) => logInfo(`SteamGame: appId ${this.appId} ${m}`, LogPrefix.Steam)
        )
      } else {
        logWarning(
          `SteamGame: launchBridgeGame could not resolve an install root for appId ${this.appId} — no process monitor started, helper will outlive the game until app quit`,
          LogPrefix.Steam
        )
      }

      bridgeLaunchBottles.set(this.appId, launchRecord)
      if (drm) {
        logInfo(drm.anchorLine, LogPrefix.Steam)
        logInfo(
          `SteamGame: launching appId ${this.appId} in steamclient-layer DRM mode (helper=${drm.ready.bottle.helperWinPath}, crossover=${drm.ready.anchor.crossover}, client=${drm.ready.anchor.client}, form=${drm.ready.launchForm})`,
          LogPrefix.Steam
        )
      }
      // The DRM launch is the declared real-profile arm of the two-profile
      // rule (gamelib-conventions): it needs the user's real CrossOver bottle
      // and Mac Steam's steamclient.dylib under the real HOME, so it inherits
      // process.env and no HOME/XDG entry is assigned.
      // Real Steam starts the game in the install root (or the launch entry's
      // workingdir), not the exe's own dir: Grim Dawn (x64/Grim Dawn.exe)
      // finds database/ and Resources/ relative to its cwd. The helper's
      // CreateProcessW passes a NULL lpCurrentDirectory, so the game inherits
      // this cwd as its Windows current directory.
      const launchCwd =
        resolveBridgeLaunchWorkingDir(this.appId) ??
        this.resolveBridgeGameInstallRoot(
          exePath,
          bridgeBottleSettings.wineCrossoverBottle
        ) ??
        dirname(exePath)
      const wineLog = drm
        ? createDrmWineLogAppender(drmWineLogPathFor(drm.traceFile))
        : null
      if (drm) {
        logInfo(
          `SteamGame: drm launch appId ${this.appId}: wine log ${drmWineLogPathFor(drm.traceFile)}`,
          LogPrefix.Steam
        )
      }
      // D-15: TCP overlay launches get their own bounded wine log; DRM keeps its
      // one. Shim lines (capped, sanitised) are copied into the launch log on
      // both routes.
      const overlayWineLog =
        overlayInjected && !drm
          ? openOverlayWineLog(
              buildOverlayPaths(appFolder)?.traceRoot ?? '',
              this.appId,
              Date.now()
            )
          : null
      if (overlayWineLog) {
        logInfo(
          `SteamGame: overlay launch appId ${this.appId}: wine log ${overlayWineLog.path}`,
          LogPrefix.Steam
        )
      }
      const shimForward = overlayInjected
        ? createShimLineForwarder(
            (line) =>
              logInfo(
                `SteamGame: appId ${this.appId} ${line}`,
                LogPrefix.Steam
              ),
            50
          )
        : null
      const winePromise = runWineCommand({
        commandParts: drm
          ? [
              ...drmCommandPrefix,
              drm.ready.bottle.helperWinPath,
              drm.gameWinPath
            ]
          : steamBridgeLaunchCommandParts(this.appId, exePath, installRoot),
        gameSettings: launchSettings,
        wait: false,
        protonVerb: 'run',
        startFolder: launchCwd,
        skipPrefixCheckIKnowWhatImDoing: true,
        ...(wineLog || overlayWineLog || shimForward
          ? {
              options: {
                onOutput: (chunk: string) => {
                  wineLog?.write(chunk)
                  overlayWineLog?.write(chunk)
                  shimForward?.(chunk)
                }
              }
            }
          : {})
      })
      if (!handle) startAttachWatch()
      void winePromise
        .finally(() => {
          wineLog?.close()
          overlayWineLog?.close()
        })
        .catch(() => undefined)
      void winePromise.then(
        (res) => {
          wrapperSettled = true
          wrapperCode = typeof res?.code === 'number' ? res.code : undefined
          maybeReportOverlayAbnormalExit(false)
          // With a monitor, its onStopped clears the record when the game is
          // gone; the launcher process exiting says nothing about the game.
          if (!handle) {
            clearLaunchRecord()
            clearEngineSelection(this.appId)
            relogOnce()
          }
          if (getBottleProcessMonitorPhase(this.appId) !== 'running') {
            deadline?.cancel('launcher-exited')
          }
          handle?.launcherExited()
        },
        (error: unknown) => {
          wrapperSettled = true
          maybeReportOverlayAbnormalExit(false)
          deadline?.cancel('launch-error')
          clearEngineSelection(this.appId)
          clearLaunchRecord()
          relogOnce()
          reportLaunchFailure(error)
          handle?.launcherExited()
        }
      )

      return true
    } catch (error) {
      deadline?.cancel('launch-error')
      void import('./engine/engineRegistry').then((m) =>
        m.clearEngineSelection(this.appId)
      )
      clearLaunchRecord()
      reportLaunchFailure(error)
      return false
    }
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

  /**
   * quick 261026-lif: restores the game-original steam_api(64).dll behind every
   * placed bridge shim as `<shim>.gamelib-orig`, from the Steam depot. Scope is
   * bridge titles' steam_api originals only; a full-depot verify is out of
   * scope. The next launch sees the new backup and rescans (shimGenerate.ts).
   */
  async repair(): Promise<ExecResult> {
    const scoped = (): Error =>
      new Error(
        `Repair restores bridge steam_api originals; appId ${this.appId} has no bridge install (a full depot verify is not supported)`
      )
    const exePath = await resolveBridgeLaunchExe(this.appId)
    const bottle = getBridgeBottleSettings(this.appId).wineCrossoverBottle
    if (!exePath || !isBridgeBottleReady(bottle) || !existsSync(exePath)) {
      throw scoped()
    }
    const installRoot = this.resolveBridgeGameInstallRoot(exePath, bottle)
    if (!installRoot) throw scoped()

    const result = await restoreBridgeSteamApiOriginals({
      appId: this.appId,
      bottleDir: resolve(getBottleDir(bottle)),
      installRoot,
      installdir: basename(installRoot)
    })
    const lines = result.outcomes.map((o) => {
      const rel = relative(installRoot, o.path)
      return `${rel}: ${o.outcome}${o.detail ? ` (${o.detail})` : ''}`
    })
    for (const line of lines) {
      logInfo(`SteamGame.repair appId ${this.appId}: ${line}`, LogPrefix.Steam)
    }
    if (result.status !== 'ok') {
      const failed = result.outcomes
        .filter(
          (o) => o.outcome === 'download-failed' || o.outcome === 'refused'
        )
        .map(
          (o) =>
            `${relative(installRoot, o.path)}: ${o.outcome}${o.detail ? ` (${o.detail})` : ''}`
        )
      throw new Error(
        `Could not restore steam_api originals for appId ${this.appId}${failed.length ? `: ${failed.join('; ')}` : ' (restore failed)'}`
      )
    }
    return { stdout: lines.join('\n'), stderr: '' }
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
   * debug/steam-bottle-uninstall-reverts (OPERATOR PRODUCT DECISION, LOCKED):
   * uninstall routing is driven SOLELY by where the library entry's own
   * recorded `install.install_path` resolves (resolveInstallRoot(), library.ts)
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
   *     resolveInstallRoot() does not model — see its own JSDoc.
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
  async uninstall(_args: RemoveArgs): Promise<ExecResult> {
    await this.ensurePlatformsCaptured()

    // Phase 51 Plan 09 (D-51-09): LOCATION, not eligibility — see launch()'s
    // identical comment above. uninstall() must act on wherever this
    // install's bits actually live, never on where a NEW install would
    // route (unaffected by the install_path routing fix below — see this
    // method's own JSDoc).
    if (findBridgeInstallBottle(this.appId) !== null) {
      return this.uninstallBridgeGame()
    }

    // D-10/D-11: a bottle-eligible title whose CrossOver bottle was never
    // provisioned has nothing installed there for install_path to resolve
    // against — request guided setup instead of a generic refuse. Unaffected
    // by the routing fix (orthogonal to WHERE install_path resolves).
    if (this.isBottleEligible() && !isBottleReady()) {
      logInfo(
        `SteamGame: appId ${this.appId} is bottle-eligible but the bottle is not yet provisioned — requesting guided setup instead of uninstalling`,
        LogPrefix.Steam
      )
      sendFrontendMessage('steamBottleSetupRequired', {
        appName: this.appId
      })
      return { stdout: '', stderr: '' }
    }

    // Reads the raw `library` Map entry directly rather than
    // this.getGameInfo() — getGameInfo() has a fire-and-forget lazy
    // metadata-fetch side effect (art_cover/platform capture) that an
    // internal routing read must never trigger (D-01/D-02: uninstall() must
    // not have side effects beyond the uninstall itself).
    //
    // 260907-e7a: this bypass forfeits MORE than the metadata fetch — it also
    // forfeits getGameInfo()'s `steamLibraryStore` fallback AND its Map
    // self-heal (games.ts:596-604; `library.set(this.appId, cached)` at L601).
    // So a bare Map read here would see nothing in the one state getGameInfo()
    // recovers from: Map miss + store hit. Audited and found UNREACHABLE — do
    // not re-open this without new evidence. The killing fact is ordering, not
    // timing: `uninstaller.ts:118` is the SOLE caller of `game.uninstall(...)`
    // in the backend (sole IPC registration: installFlowRegistration.ts:216),
    // and five lines earlier `uninstaller.ts:113` calls
    // `resolveGameTitle(libraryManagerMap, runner, appName)` ->
    // `utils/gameTitle.ts:58`'s `getGameInfo()` for THIS SAME appId. That call
    // already performed the store fallback and already wrote the entry back
    // into the Map. There is no `await` between L113 and L118, so nothing can
    // interleave and undo it. Corroborating (not load-bearing): SteamLibrary
    // `refresh()`'s clear->rebuild->persist span is one uninterrupted
    // synchronous block — `library.clear()` at library.ts:1090, the plain
    // (non-`for await`) rebuild loop at L1091-1217, and
    // `steamLibraryStore.set('games', Array.from(library.values()))` at L1220,
    // with ZERO await/.then/yield/return/throw in between — so no IPC handler
    // can observe a cleared Map, and the store is written FROM the Map and can
    // never hold an entry a completed refresh dropped.
    const installPath = library.get(this.appId)?.install?.install_path
    const root = await resolveInstallRoot(installPath)

    if (root === 'bottle') {
      // debug/steam-bottle-uninstall-reverts (FINAL): direct deletion,
      // mechanism LIVE-CONFIRMED correct — see uninstallBottleGameDirectly()'s
      // own JSDoc. No install-provenance/ownership check remains here; that
      // distinction no longer changes routing (34.13 review A-19 removed the
      // `nativeBottleInstall` field that used to record it).
      return this.uninstallBottleGameDirectly()
    }

    if (root === 'native') {
      const url = buildSteamProtocolUrl('uninstall', this.appId)
      if (!url) {
        return { stdout: '', stderr: `Invalid appId: ${this.appId}` }
      }

      // quick 261106-s3n: "Delete Steam games directly in GameLib" ON. OFF
      // falls through to everything below, unchanged.
      if (isSteamNativeDeleteEnabled()) return this.uninstallNativeInGameLib()

      // quick 261029-l9w: a running Steam that never adopted a GameLib install
      // ignores steam://uninstall, so remove that one state directly.
      const direct = await this.uninstallUnadoptedMacNativeDirectly()
      if (direct) return direct

      logInfo(
        `SteamGame: delegating uninstall for appId ${this.appId} via ${url}`,
        LogPrefix.Steam
      )
      await shell.openExternal(url)

      // Poll ACF so the badge flips to not-installed when Steam removes the
      // appmanifest, without requiring a focus round-trip (D-07). Symmetric to
      // install polling. State is never optimistically flipped here (D-02).
      startUninstallPolling(this.appId)
      // quick 261029-ji2: a removed install has nothing left to adopt.
      clearPendingAdoption(this.appId)

      return { stdout: '', stderr: '' }
    }

    // root === null: install_path resolves inside NEITHER the CrossOver
    // bottle nor any registered native Steam library — refuse rather than
    // guessing. This is the branch that closes the wrong-root data-loss
    // defect: a stale/empty/unresolvable install_path must never fall
    // through to deleting anything.
    logWarning(
      `SteamGame: uninstall() refused for appId ${this.appId} — install_path "${installPath}" does not resolve inside any known root (bottle or native library)`,
      LogPrefix.Steam
    )
    return {
      stdout: '',
      stderr: `Refused to uninstall: install_path does not resolve inside any known root for appId ${this.appId}`
    }
  }

  /**
   * Phase 24 Plan 08 (R4/R6): allowlisted-title bridge uninstall path.
   * Unlike the Phase 17 bottled-Steam-client dispatch above, the bridge
   * bottle has no Steam client to hand a `steam://uninstall` verb to at
   * all (R6 — no Windows Steam client in the bridge bottle) — GameLib owns
   * removal directly, consistent with the files-on-disk ownership model
   * the bridge install path already commits to (finding #10). Removes
   * ONLY the game's own install root inside THIS game's own bridge bottle
   * (getBridgeBottleSettings(appId), quick/261016-u1w D-B) — never touches
   * the Phase 17 GameLibSteam bottle.
   *
   * quick/261016-u1w (D-D): when this game's bottle IS its own per-game
   * bottle (`bridgeBottleNameFor(appId)`), the whole bottle belongs to the
   * game, so the whole bottle is removed via removePerGameBridgeBottle —
   * no resolveBridgeLaunchExe/install-root resolution needed. Otherwise
   * (the game still lives in the legacy shared bottle), the direct-deletion
   * body below resolves the install root the SAME way installBridgeGame()
   * does (resolveBridgeGameInstallRoot, via resolveBridgeLaunchExe) rather
   * than a second, divergent path-derivation — reuse, not a parallel
   * implementation.
   *
   * quick/261017-bqw: the legacy branch ALSO removes this appId's own
   * `appmanifest_<appId>.acf` from the legacy bottle's steamapps dir,
   * together with the install root. A surviving manifest is read back by
   * buildBridgeInstalledMap() and resolveBridgeBottleName() on the refresh
   * that markBridgeGameUninstalled()'s `gameStatusUpdate done` triggers —
   * that refresh re-marked the game installed with a deleted install_path
   * and hid it from the Library grid, as measured live by quick task
   * 261016-wsq, Arm 2 (uninstalling Avernum 5 / 206040 from the legacy
   * bottle). The per-game branch above gets the same result by
   * construction, because it removes the whole bottle.
   */
  private async uninstallBridgeGame(): Promise<ExecResult> {
    const bottleName = getBridgeBottleSettings(this.appId).wineCrossoverBottle
    if (bottleName === bridgeBottleNameFor(this.appId)) {
      const result = await removePerGameBridgeBottle(this.appId)
      if (result.status === 'error') {
        logWarning(
          `SteamGame: uninstallBridgeGame failed to remove per-game bottle "${bottleName}" for appId ${this.appId}: ${result.error}`,
          LogPrefix.Steam
        )
        return {
          stdout: '',
          stderr: `Failed to remove bridge bottle: ${result.error}`
        }
      }
      logInfo(
        `SteamGame: removed per-game bridge bottle "${bottleName}" for appId ${this.appId} (${result.status})`,
        LogPrefix.Steam
      )
      // Finish through pollUninstallOnce, like uninstallBottleGameDirectly():
      // its 'absent' branch checks the other roots, so a surviving native or
      // bottle copy keeps the badge and gets its notice, and a full uninstall
      // gets the "Game Uninstalled" toast. markBridgeGameUninstalled() did
      // neither (live 2026-10-27, Grim Dawn 219990: native copy survived, no
      // message, badge flipped back to Play on the next refresh).
      await pollUninstallOnce(this.appId, 'bridge')
      return { stdout: '', stderr: '' }
    }

    const exePath = await resolveBridgeLaunchExe(this.appId)
    if (!exePath) {
      // 261017-bqw: this branch deliberately does NOT touch the manifest.
      // resolveBridgeLaunchExe returns undefined on no CM client, a PICS
      // failure or no Windows launch entry — in all three, the game's
      // files are usually still on disk. Deleting only the manifest here
      // would orphan an install GameLib could no longer see. A surviving
      // manifest re-marks a game whose files still exist, so it stays
      // visible, which is the correct outcome for this branch.
      logWarning(
        `SteamGame: uninstallBridgeGame could not resolve the bridge install location for appId ${this.appId} — nothing to remove`,
        LogPrefix.Steam
      )
      this.markBridgeGameUninstalled()
      return { stdout: '', stderr: '' }
    }

    const installRoot = this.resolveBridgeGameInstallRoot(exePath, bottleName)
    if (!installRoot) {
      logWarning(
        `SteamGame: uninstallBridgeGame rejected an exe path outside the bridge bottle's common/ dir for appId ${this.appId}`,
        LogPrefix.Steam
      )
      return {
        stdout: '',
        stderr: `Refused to uninstall: unsafe path for appId ${this.appId}`
      }
    }

    // 261017-bqw (A-12 answered): no NUMERIC_APP_ID guard is added here.
    // It would be unreachable — getBridgeBottleSettings(this.appId) on this
    // method's first line already throws for a non-numeric appId (via
    // bridgeBottleNameFor's NUMERIC_APP_ID test), and isBridgeEligible()
    // only admits allowlisted ids, which bridge/allowlist.ts validates with
    // a `^\d+$` zod regex. manifestPath is built only from this.appId and
    // the resolved bottle's own steamapps dir, never from any other string.
    const manifestPath = join(
      getBottleSteamappsDir(bottleName),
      `appmanifest_${this.appId}.acf`
    )

    try {
      rmSync(installRoot, { recursive: true, force: true })
      rmSync(manifestPath, { force: true })
    } catch (error) {
      logWarning(
        [
          `SteamGame: uninstallBridgeGame failed to remove "${installRoot}" or "${manifestPath}" for appId ${this.appId}`,
          error
        ],
        LogPrefix.Steam
      )
      return {
        stdout: '',
        stderr: `Failed to remove bridge install: ${String(error)}`
      }
    }

    logInfo(
      `SteamGame: removed bridge install for appId ${this.appId} at "${installRoot}" and its manifest "${manifestPath}"`,
      LogPrefix.Steam
    )
    // Same completion as the per-game branch above.
    await pollUninstallOnce(this.appId, 'bridge')
    return { stdout: '', stderr: '' }
  }

  /**
   * quick 261106-s3n: the ON route for a native-root uninstall. Every refusal
   * sends `done` itself because uninstaller.ts suppresses it for steam.
   */
  private async uninstallNativeInGameLib(): Promise<ExecResult> {
    const decision = await decideSteamNativeDelete(this.appId)
    const game = this.getGameInfo().title
    const refuse = (stderr: string): ExecResult => {
      sendFrontendMessage('gameStatusUpdate', {
        appName: this.appId,
        runner: 'steam',
        status: 'done'
      })
      return { stdout: '', stderr }
    }

    switch (decision.route) {
      case 'steam-uninstalled':
        startUninstallPolling(this.appId)
        clearPendingAdoption(this.appId)
        return { stdout: '', stderr: '' }
      case 'fallback':
        logInfo(
          `SteamGame: deleting appId ${this.appId} in GameLib (${decision.why})`,
          LogPrefix.Steam
        )
        return this.removeNativeInstallDirectly()
      case 'refused-running':
        notify({
          title: game,
          body: i18next.t(
            'gamelib:steam.uninstall.gameRunning',
            '{{game}} is running. Quit it, then uninstall again.',
            { game }
          )
        })
        return refuse(`Refused to uninstall: ${this.appId} is running`)
      case 'steam-error':
        notify({
          title: game,
          body: i18next.t(
            'gamelib:steam.uninstall.steamError',
            "Steam couldn't uninstall {{game}} (error {{code}}).",
            { game, code: decision.code }
          )
        })
        return refuse(
          `Steam refused to uninstall ${this.appId} (error ${decision.code})`
        )
      case 'refused':
        return refuse(
          `Refused to uninstall: ${decision.reason} for appId ${this.appId}`
        )
    }
  }

  /**
   * quick 261029-l9w: direct removal of a GameLib native install the running
   * Mac Steam never adopted. Returns null to mean "delegate as before".
   *
   * Live evidence (2026-10-29, WazHack 264160): a Steam that still holds the
   * app as Uninstalled ignores steam://uninstall (three dispatches, files
   * untouched, same steam_osx PID), so the pill sat on "Uninstalling" until
   * the poller's ~60 s grace expired.
   *
   * Gate: ji2's own decidePlayAdoption(...) === 'restart' (record present,
   * same PID, ACF still GameLib's). Steam not running, a different PID or an
   * adopted ACF all delegate: Steam then owns the app and handles the URL (a
   * not-running Steam adopts at startup before processing it). A non-
   * 'installed' ACF (fail-closed 1026 handoff) also delegates, unchanged.
   *
   * Deletion reuses removeSteamInstallCopy's guards (the port of
   * uninstallBottleGameDirectly's); completion is pollUninstallOnce, which
   * flips is_installed, pushes, sends done and fires the toast.
   */
  private async uninstallUnadoptedMacNativeDirectly(): Promise<ExecResult | null> {
    if (!isMac) return null
    const record = readPendingAdoption(this.appId)
    if (!record) return null

    const currentPid = await probeMacSteamPid().catch(() => null)
    const decision = decidePlayAdoption({
      record,
      currentPid,
      currentAcf: readAcfSnapshot(record.manifestPath)
    })
    if (decision !== 'restart') return null

    const acf = await readAcfState(this.appId, 'native')
    if (acf.state !== 'installed' || !acf.installPath) return null

    // The ACF the decision was made about must be the one that gets deleted.
    const expectedManifest = join(
      resolve(acf.installPath, '..', '..'),
      `appmanifest_${this.appId}.acf`
    )
    if (resolve(record.manifestPath) !== expectedManifest) {
      logWarning(
        `SteamGame: pending-adoption manifest "${record.manifestPath}" is not the native manifest "${expectedManifest}" for appId ${this.appId} — delegating uninstall`,
        LogPrefix.Steam
      )
      return null
    }

    logInfo(
      `SteamGame: running Steam (pid ${currentPid}) never adopted the GameLib install of appId ${this.appId} — removing it directly instead of steam://uninstall`,
      LogPrefix.Steam
    )

    return this.removeNativeInstallDirectly()
  }

  /**
   * Shared guarded direct removal of the native install (quick 261106-s3n
   * extracted this from uninstallUnadoptedMacNativeDirectly): files via
   * removeSteamInstallCopy's guards, completion via pollUninstallOnce.
   */
  private async removeNativeInstallDirectly(): Promise<ExecResult> {
    let failure: string
    try {
      const result = await removeSteamInstallCopy(this.appId, 'native')
      if (result.status !== 'refused') {
        clearPendingAdoption(this.appId)
        await pollUninstallOnce(this.appId, 'native')
        return { stdout: '', stderr: '' }
      }
      failure = `Refused to uninstall: ${result.reason} for appId ${this.appId}`
    } catch (error) {
      failure = `Failed to remove native install: ${String(error)}`
    }

    logWarning(`SteamGame: ${failure}`, LogPrefix.Steam)
    // uninstallGameCallback set "Uninstalling" and suppresses done for steam;
    // clear it (same reason as the A-10 refusal in uninstallBottleGameDirectly).
    // The record is kept, and no steam://uninstall fallback: Steam ignores it.
    sendFrontendMessage('gameStatusUpdate', {
      appName: this.appId,
      runner: 'steam',
      status: 'done'
    })
    return { stdout: '', stderr: failure }
  }

  /**
   * debug/steam-bottle-uninstall-reverts (FINAL): direct-deletion uninstall
   * for EVERY bottle-eligible, non-bridge title — GameLib-authored
   * (installBottleNative(), D-15/SNI-08) AND legacy-delegated/genuinely
   * Steam-authored titles (e.g. Hoard) alike. Formerly named
   * `uninstallBottleNativeGame` and reached only when the (since-removed,
   * 34.13 review A-19) `nativeBottleInstall` provenance flag was true; that
   * gate is gone (uninstall() now calls this unconditionally
   * for every bottle-eligible non-bridge title) because delegating to the
   * bottled Steam client's own steam://uninstall confirm dialog was PROVEN
   * architecturally unworkable in this CrossOver bottle for ALL titles, not
   * only GameLib-authored ones — see uninstall()'s own JSDoc for the full
   * evidence chain (CW_USEDEFAULT window-position defect). Mirrors
   * uninstallBridgeGame()'s direct-deletion model above, but targets the
   * Phase 17 GameLibSteam bottle's steamapps/ (readAcfState('bottle') /
   * getBottleSteamappsDir) instead of the dedicated bridge bottle.
   *
   * NAMING-CONVENTION GENERALIZATION: the install root is resolved via
   * readAcfState('bottle').installPath, which is built directly from the
   * ACF's own on-disk `AppState.installdir` field (library.ts) — never from
   * FALLBACK_INSTALLDIR_PREFIX ('app_...', installLocation.ts) or any other
   * GameLib-specific naming assumption. A Steam-authored installdir like
   * "Hoard" and a GameLib-authored one like "app_2706020" are handled
   * identically by construction; no naming-convention branch was needed
   * here even before this generalization.
   *
   * SHAREDDEPOTS HAZARD (handled by construction, not by refcounting):
   * a bottle title's ACF may declare SharedDepots pointing at another app's
   * depot (e.g. Hoard references the Steamworks Common Redistributables
   * depots, owned by a different appId). This function NEVER walks
   * SharedDepots or touches any directory besides (a) the single top-level
   * segment of THIS title's own installdir under common/, resolved and
   * containment-checked below, and (b) THIS title's own
   * appmanifest_<appId>.acf. A shared depot's actual files live under the
   * OWNING app's own installdir (a sibling directory under common/,
   * resolved from THAT app's own manifest) — a completely different path
   * this function never constructs or touches. Cleaning up now-orphaned
   * shared-depot content after every referencing title is gone is an
   * explicit NON-GOAL (would require a real cross-manifest refcount system)
   * — left for a future, separate investigation if it's ever needed;
   * over-deleting is the only actual risk here, and this function is scoped
   * to make that structurally impossible rather than runtime-checked.
   *
   * LIVE-CLIENT HAZARD: whether the bottled Steam client is running or not
   * is irrelevant to correctness here. rmSync() below is synchronous with
   * no `await` between it and the containment check that produced its
   * path, so there is no in-process race window; deleting a directory entry
   * that a separate OS process (steam.exe under Wine) still has open file
   * descriptors against is safe POSIX/macOS-filesystem behavior (the
   * process keeps working against the now-unlinked inode until it closes
   * its handles, and the directory entry itself is simply gone) rather than
   * a crash or hang. Any failure (permissions, a locked file) is caught
   * below and reported as a normal error result — never thrown, never left
   * to hang. This function does not attempt to prove Steam is not running,
   * pause/kill it, or wait for it to release anything, by design — see
   * Resolution in the debug file for the full rationale.
   *
   * Resolves the install root via readAcfState('bottle') — the SAME reader
   * pollUninstallOnce()/library.ts already use for this bottle root — then
   * containment-checks it with the established resolve()+relative() idiom
   * (mirroring resolveBridgeGameInstallRoot; "path.join is not containment",
   * Phase 18) before deleting, since the ACF's on-disk `installdir` is
   * untrusted input.
   *
   * PRIMARY GUARD (debug/steam-bottle-uninstall-reverts, OPERATOR PRODUCT
   * DECISION, LOCKED, item 3): promoted from a nice-to-have to REQUIRED —
   * before touching the ACF at all, re-verifies the library entry's own
   * recorded install.install_path ALSO resolves inside this bottle root
   * (resolveInstallRoot(), library.ts) and aborts, deleting nothing, if not.
   * This is defense-in-depth on top of uninstall()'s own routing decision
   * (the caller only reaches this method when that same check already
   * returned 'bottle') — it answers "is this the install the user is
   * actually looking at", a DIFFERENT question from the ACF-installdir
   * containment check below ("is the ACF's own installdir safe to delete").
   * Both guards are kept; neither replaces the other.
   *
   * After deletion, reuses pollUninstallOnce('bottle')'s existing 'absent'
   * branch (badge flip, persist, notify, clear forcedWindowsViaBottle/
   * forcedWindowsViaBottle) rather than re-implementing that completion
   * pipeline a second time — the manifest is now confirmed absent, exactly
   * the condition that branch already handles for the delegated path's own
   * poller. Because our own rmSync() calls just completed synchronously
   * (no yield to the event loop in between), the readAcfState() re-read
   * inside pollUninstallOnce() reliably observes 'absent' from our own
   * write; it is not depending on winning a race against Steam.
   * pollUninstallOnce() ALSO checks the native root for a surviving copy
   * (dual-install partial removal, item 4/5) — see its own JSDoc.
   */
  private async uninstallBottleGameDirectly(): Promise<ExecResult> {
    // 34.13 review A-12: validate the appId BEFORE building either delete
    // target. The method containment-checks `installRoot` with the full
    // resolve()+relative()+isAbsolute() idiom, then deletes a SECOND path —
    // `appmanifest_${this.appId}.acf` — that got none of it. `this.appId` is
    // renderer-supplied (getGame(appName) off the `uninstall` IPC channel)
    // and is validated nowhere else on this path: the sibling native branch
    // validates it via buildSteamProtocolUrl, and getSteamBottleEligibilityVerdict
    // carries NUMERIC_APP_ID for exactly this reason. `join` is not
    // containment (Phase 18) — an appId containing `../` moves the manifest
    // delete target out of steamapps/. One check at the top covers BOTH
    // delete targets, which is also what makes this method's own JSDoc claim
    // ("scoped to make over-deleting structurally impossible rather than
    // runtime-checked") true for both halves rather than only one.
    if (!NUMERIC_APP_ID.test(this.appId)) {
      logWarning(
        `SteamGame: uninstallBottleGameDirectly rejected a non-numeric appId`,
        LogPrefix.Steam
      )
      return { stdout: '', stderr: 'Refused to uninstall: invalid appId' }
    }

    // Reads the raw `library` Map entry directly rather than
    // this.getGameInfo() — see uninstall()'s own comment on the same
    // pattern (avoids getGameInfo()'s fire-and-forget metadata-fetch side
    // effect on what must be a side-effect-free routing/guard read).
    //
    // 260907-e7a: like uninstall()'s read, this forfeits getGameInfo()'s
    // `steamLibraryStore` fallback and Map self-heal (games.ts:596-604), not
    // just the metadata fetch. Audited and found UNREACHABLE for the same
    // reason, and this site is strictly safer than uninstall()'s: the method
    // is `private` and its ONLY call site is `uninstall()` at games.ts:2363,
    // so it inherits uninstall()'s guarantee that `uninstaller.ts:113`'s
    // `resolveGameTitle` -> `getGameInfo()` already self-healed the Map for
    // this appId before control ever reached here. See uninstall()'s comment
    // above for the full evidence chain; do not re-open without new evidence.
    const entryInstallPath = library.get(this.appId)?.install?.install_path
    const entryRoot = await resolveInstallRoot(entryInstallPath)
    if (entryRoot !== 'bottle') {
      logWarning(
        `SteamGame: uninstallBottleGameDirectly refused for appId ${this.appId} — the library entry's install_path "${entryInstallPath}" does not resolve inside the bottle root`,
        LogPrefix.Steam
      )
      return {
        stdout: '',
        stderr: `Refused to uninstall: install_path does not resolve inside the bottle for appId ${this.appId}`
      }
    }

    const acfState = await readAcfState(this.appId, 'bottle')

    // 34.13 review A-10: readAcfState returns THREE states, and 'downloading'
    // (StateFlags bit 4 unset — a partial install, an interrupted depot
    // download, or a StateFlags-1026 handoff manifest) must never share the
    // 'absent' branch below. Two independent reasons:
    //   1. It is not safe to delete — a depot download may still be writing
    //      into that directory, so this is a REFUSAL, not a silent success.
    //   2. It must not reach pollUninstallOnce(), whose non-absent branch
    //      emits `gameStatusUpdate { status: 'uninstalling' }`. Nothing on
    //      this path terminates that status: uninstall() no longer calls
    //      startUninstallPolling() for the bottle root, so activeUninstallPolls
    //      is empty and no later tick or stopUninstallPolling() will ever run.
    //      The tile would read "Uninstalling" for the rest of the session with
    //      the files still on disk and no error surfaced.
    // Emit an explicit terminal `done` so any status the click already put on
    // the tile is cleared, and report a real stderr so the caller does not
    // treat this as a completed uninstall.
    if (acfState.state === 'downloading') {
      logWarning(
        `SteamGame: uninstallBottleGameDirectly refused for appId ${this.appId} — the bottle manifest is mid-download/partial, cancel the in-progress install first`,
        LogPrefix.Steam
      )
      sendFrontendMessage('gameStatusUpdate', {
        appName: this.appId,
        runner: 'steam',
        status: 'done'
      })
      return {
        stdout: '',
        stderr: `Refused to uninstall: the install for appId ${this.appId} is still in progress — cancel it before uninstalling`
      }
    }

    if (acfState.state !== 'installed' || !acfState.installPath) {
      logWarning(
        `SteamGame: uninstallBottleGameDirectly found no installed bottle manifest for appId ${this.appId} — nothing to remove`,
        LogPrefix.Steam
      )
      await pollUninstallOnce(this.appId, 'bottle')
      return { stdout: '', stderr: '' }
    }

    const bottleName = getSteamBottleSettings().wineCrossoverBottle
    const steamappsDir = getBottleSteamappsDir(bottleName)
    const commonRoot = resolve(steamappsDir, 'common')
    const resolvedInstallPath = resolve(acfState.installPath)
    const relFromCommon = relative(commonRoot, resolvedInstallPath)
    const installdirSegment = relFromCommon.split(sep)[0]

    if (
      !installdirSegment ||
      relFromCommon.startsWith('..') ||
      isAbsolute(relFromCommon)
    ) {
      logWarning(
        `SteamGame: uninstallBottleGameDirectly rejected an install path outside the bottle's common/ dir for appId ${this.appId}`,
        LogPrefix.Steam
      )
      return {
        stdout: '',
        stderr: `Refused to uninstall: unsafe path for appId ${this.appId}`
      }
    }

    // SharedDepots hazard: installRoot is ALWAYS exactly one top-level
    // segment under common/ — this title's own installdir, and nothing
    // else. A shared depot's files live under a different app's own
    // installdir (a sibling of installRoot, never a parent/child of it),
    // so this rmSync can never reach into shared/redistributable depot
    // content even for a title (like Hoard) whose manifest declares
    // SharedDepots — see this method's own JSDoc.
    const installRoot = join(commonRoot, installdirSegment)
    const manifestPath = join(steamappsDir, `appmanifest_${this.appId}.acf`)

    // 34.13 review A-13: the SharedDepots argument above is sound for the
    // shape its real-filesystem regression test proves, and silently assumes
    // away a different one — two installed appIds whose ACFs declare the SAME
    // `installdir`. Steam does that routinely (a game and its
    // dedicated-server/tool app, regional SKU variants, demo/base pairs), and
    // in that shape installRoot resolves to the SHARED directory: the
    // recursive rmSync would take the co-installed app's files with it while
    // only THIS appId's manifest is removed, leaving the other app's manifest
    // pointing at a now-empty path with Steam and GameLib both still believing
    // it is installed. Remove the manifest only, and let the completion
    // pipeline reconcile — a partial uninstall the user can retry beats
    // deleting a game they did not ask about.
    const conflicting = findOtherManifestsWithInstalldir(
      steamappsDir,
      installdirSegment,
      this.appId
    )
    if (conflicting.length > 0) {
      logWarning(
        `SteamGame: uninstallBottleGameDirectly — installdir "${installdirSegment}" is shared with appId(s) ${conflicting.join(
          ','
        )}; removing this title's manifest only and leaving the shared directory in place`,
        LogPrefix.Steam
      )
      try {
        rmSync(manifestPath, { force: true })
      } catch (error) {
        logWarning(
          [
            `SteamGame: uninstallBottleGameDirectly failed to remove the manifest for appId ${this.appId}`,
            error
          ],
          LogPrefix.Steam
        )
        return {
          stdout: '',
          stderr: `Failed to remove bottle install: ${String(error)}`
        }
      }
      await pollUninstallOnce(this.appId, 'bottle')
      return { stdout: '', stderr: '' }
    }

    try {
      rmSync(installRoot, { recursive: true, force: true })
      rmSync(manifestPath, { force: true })
    } catch (error) {
      logWarning(
        [
          `SteamGame: uninstallBottleGameDirectly failed to remove "${installRoot}" for appId ${this.appId}`,
          error
        ],
        LogPrefix.Steam
      )
      return {
        stdout: '',
        stderr: `Failed to remove bottle install: ${String(error)}`
      }
    }

    logInfo(
      `SteamGame: removed bottle install for appId ${this.appId} at "${installRoot}"`,
      LogPrefix.Steam
    )

    // Manifest is now confirmed absent — reuse pollUninstallOnce's existing
    // 'absent' branch to flip the badge, persist, notify, and clear the
    // forcedWindowsViaBottle flag (D-17 reversibility),
    // exactly as the delegated path's own poller does once it observes this.
    await pollUninstallOnce(this.appId, 'bottle')

    return { stdout: '', stderr: '' }
  }

  async update(): Promise<InstallResult> {
    // quick-260817-d61: Update is a deliberate Steam action — unlock the
    // keyring deferral gate as the first statement.
    noteSteamAuthTrigger('user-install')
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
   * The entry is intentionally KEPT (never library.delete'd): removing it would
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
    const existing = library.get(this.appId)
    if (existing) {
      const updated: GameInfo = {
        ...existing,
        is_installed: false,
        install: {}
      }
      library.set(this.appId, updated)
      // GAP-17-BOTTLE-STORE-DIVERGENCE / GAP-18-06: persist immediately so the
      // not-installed (badge-preserving) state is not lost on the next persist.
      steamLibraryStore.set('games', Array.from(library.values()))
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
   * - otherwise a no-op.
   * Mirrors downloadqueue.ts's own stopCurrentDownload ->
   * callAbortController(appName) call site. Analog: gog/games.ts lines
   * 1291-1295.
   */
  async stop(_stopWine?: boolean): Promise<void> {
    const inFlight = nativeInstallsInFlight.get(this.appId)
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
    if (cancelDelegatedInstall(this.appId)) return

    // quick 261024-urq: bridge route. GameLib spawned the Wine command itself,
    // so (unlike bottled Steam) it can and must end it. Kill only the game's
    // OWN per-game bottle: the recorded bottle must equal
    // bridgeBottleNameFor(appId) (T-urq-02).
    const bridgeRecord = bridgeLaunchBottles.get(this.appId)
    if (bridgeRecord) {
      bridgeLaunchBottles.delete(this.appId)
      if (bridgeRecord.bottle === bridgeBottleNameFor(this.appId)) {
        logInfo(
          `SteamGame.stop: stopping bridge-launched appId ${this.appId} — wineserver -k in its per-game bottle ${bridgeRecord.bottle}`,
          LogPrefix.Steam
        )
        const result = await stopPerGameBridgeBottle(this.appId)
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
      stopBridgeHelper(this.appId)
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

/**
 * Phase 51 Plan 09 (D-51-09): the backend-authoritative bridge-route read,
 * exposed over IPC by 51-13. Mirrors installFormIpc.ts's
 * getSteamBottleEligibilityVerdict's numeric/type guard exactly -- an
 * invalid appId is a REJECTED REQUEST, never a routing answer, so it fails
 * closed to 'not-eligible' rather than resolving the pure resolver's own
 * shape, which would misleadingly imply a platform check ran.
 *
 * installedIn is filled below via findBridgeInstallBottle (bottle.ts,
 * LOCATION) and checkBottleEligibility() (an existing GameLibSteam install,
 * also LOCATION) -- resolveBridgeRoute() itself never fills this field (see
 * its own doc comment); it answers eligibility only.
 */
export async function getBridgeRouteVerdict(
  appId: unknown
): Promise<SteamBridgeRouteVerdict> {
  if (typeof appId !== 'string' || !NUMERIC_APP_ID.test(appId)) {
    logWarning(
      'getBridgeRouteVerdict: rejected non-string or non-numeric appId (D-51-09)',
      LogPrefix.Steam
    )
    return {
      route: 'not-eligible',
      reason: null,
      knownBadReason: null,
      missingSymbols: [],
      noticeRequired: false,
      stubbedInterfaces: [],
      identityFallback: false,
      userRoute: null,
      installedIn: null
    }
  }

  const game = new SteamGame(appId)
  const verdict = await game.checkBridgeRoute()

  // D-51-09 (Task 2): installedIn answers "where does THIS install's bits
  // already live" (location), never "where would a NEW install go"
  // (eligibility, verdict.route above) -- a never-scanned bottle-eligible
  // title can have verdict.route === 'bridge' (rule 11's pending-scan
  // default) while installedIn correctly stays 'bottle' for an existing
  // GameLibSteam install the widened eligibility must never claim to have
  // moved.
  let installedIn: SteamBridgeRouteVerdict['installedIn'] = null
  if (findBridgeInstallBottle(appId) !== null) {
    installedIn = 'bridge'
  } else if (
    library.get(appId)?.is_installed === true &&
    (await game.checkBottleEligibility())
  ) {
    installedIn = 'bottle'
  }

  return { ...verdict, installedIn }
}
