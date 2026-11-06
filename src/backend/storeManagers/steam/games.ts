import axios from 'axios'
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
import { parseMetacriticScore } from 'common/metacriticScore'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type LogWriter from 'backend/logger/log_writer'
import { GameConfig } from 'backend/game_config'
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
import { cancelDelegatedInstall } from './library'
import {
  getSteamBottleSettings,
  bridgeBottleNameFor,
  stopPerGameBridgeBottle,
  findBridgeInstallBottle,
  getDrmBridgeRunner
} from './bottle'
// Phase 60: Steam overlay in bridged games (macOS).
import { type OverlayLaunchPayload } from './bridge/overlay/overlayLaunch'
import {
  readStoredOverlayOverride,
  parseOverlayOverride
} from './bridge/overlay/overlayPolicy'
import { readStoredTitleConfig, pickTitleSettings } from './titleSettings'
import { type OverlayStep } from './bridge/overlay/overlayNotice'
import type { CrossoverPreflight } from './engine/engineDecision'
import type { EngineSelection, NonCrossoverEngine } from './engine/engineTypes'
import { noteSteamAuthTrigger } from './authTrigger'
// quick-260817-d61: verified during planning that user.ts imports nothing
// from games.ts (no import of './games' anywhere in user.ts), so this
// introduces no cycle. Used ONLY by getExtraInfo()'s fire-and-forget
// locked->unlocked transition below — install()/update()/launch() only need
// noteSteamAuthTrigger, not SteamUser itself.
import { type AuthSessionRefusal } from './user'
import { type DrmLaunchReady } from './bridge/drm/drmLaunchSetup'
import { type DrmStep } from './bridge/drm/steamclientLayerMode'
import { stopBridgeHelper } from './bridge/helperProcess'
// Phase 51 Plan 09 (D-51-07/09): the pure routing resolver + the persisted
// verdict read/clear family + the current-shim coverage check. games.ts is
// the sole assembler of resolveBridgeRoute's input and the sole writer of
// the persisted verdict (bridgeRoute.ts's own header).
import { type BridgeRouteInput } from './bridge/bridgeRoute'
import type { SteamBridgeRouteVerdict } from 'common/types/steam'
import type { EnginePin } from './engine/enginePins'
import { STEAM_STORE_API, NUMERIC_APP_ID } from './gameConstants'
import {
  nativeInstallsInFlight,
  bridgeLaunchBottles,
  loggedEmptyGameInfoMisses
} from './gameSessionState'
import { macArchFromMinOS } from './gameRequirements'
import { type DrmWineLaunch } from './gameDrmLaunch'
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
import {
  resolveLaunchOverlay,
  notifyOverlaySetupFailed,
  overlayInputLine,
  overlayInputArg,
  logOverlayInputOutcome,
  overlayProbeArg,
  prepareTcpOverlay
} from './gameLaunchOverlay'
import {
  launchBridgeGame,
  runBridgeLaunch,
  launchBridgeGameBody,
  fireBridgeWineLaunch
} from './gameBridgeLaunch'
import {
  launch,
  maybeNotifyBridgeLimited,
  maybeNotifyDrmModeFailed,
  sendLaunchDone,
  showEngineDialog,
  notifyCrossoverRequired,
  selectLaunchEngine,
  onBridgeLaunchDeadline,
  prefetchBridgeDrmDownloads,
  readLaunchExeCegMarkers,
  launchDrmModeGame
} from './gameLaunch'
import { moveInstall, repair, syncSaves } from './gameMaintenance'
import {
  uninstall,
  uninstallBridgeGame,
  uninstallNativeInGameLib,
  uninstallUnadoptedMacNativeDirectly,
  removeNativeInstallDirectly,
  uninstallBottleGameDirectly
} from './gameUninstall'

const STEAM_CDN_BASE = 'https://cdn.cloudflare.steamstatic.com/steam/apps'

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
  markBridgeGameUninstalled(): void {
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
  launch(
    _logWriter: LogWriter,
    _launchArguments?: LaunchOption,
    _args?: string[],
    _skipVersionCheck?: boolean
  ): Promise<boolean> {
    return launch(this, _logWriter, _launchArguments, _args, _skipVersionCheck)
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
  maybeNotifyBridgeLimited(
    verdict: SteamBridgeVerdict | undefined,
    identityFallback: boolean
  ): void {
    return maybeNotifyBridgeLimited(this, verdict, identityFallback)
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
  maybeNotifyDrmModeFailed(step: DrmStep, cause: string): void {
    return maybeNotifyDrmModeFailed(this, step, cause)
  }

  /** Terminal 'done' status for a launch that will not start (idempotent). */
  sendLaunchDone(): void {
    return sendLaunchDone(this)
  }

  /**
   * Phase 59: notify plus an in-app dialog, copied from
   * maybeNotifyDrmModeFailed's surface. Never marks the bridge failed and
   * never sends steamBridgeSetupRequired (no path reroutes to bottled Steam).
   */
  showEngineDialog(title: string, body: string, tag: string): void {
    return showEngineDialog(this, title, body, tag)
  }

  /**
   * Phase 59: DRM-mode and bottled-Steam launches are CrossOver-only. Shown on
   * every blocked attempt (the user pressed Play and nothing else will tell
   * them why it did nothing).
   */
  notifyCrossoverRequired(
    kind: 'drm' | 'bottled',
    pre: CrossoverPreflight
  ): void {
    return notifyCrossoverRequired(this, kind, pre)
  }

  /**
   * Phase 59 (D-05/D-06/D-07/D-09/D-14/D-15): a fresh pre-flight and engine
   * decision for every TCP bridge launch. Downloads the built-in engine on
   * first need, registers the choice, prepares the bottle for it, and
   * re-reads the settings so every later spawn uses the registered engine.
   */
  selectLaunchEngine(
    current: GameSettings,
    connectivity: { offline: boolean }
  ): Promise<{ ok: true; settings: GameSettings } | { ok: false }> {
    return selectLaunchEngine(this, current, connectivity)
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
  onBridgeLaunchDeadline(
    clearLaunchRecord: () => void,
    armedSelection: EngineSelection | undefined
  ): Promise<void> {
    return onBridgeLaunchDeadline(this, clearLaunchRecord, armedSelection)
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
  prefetchBridgeDrmDownloads(
    exePath: string,
    bridgeBottleName: string
  ): Promise<void> {
    return prefetchBridgeDrmDownloads(this, exePath, bridgeBottleName)
  }

  readLaunchExeCegMarkers(exePath: string): string[] {
    return readLaunchExeCegMarkers(this, exePath)
  }

  /**
   * Phase 56 (D-11/D-12/D-13/D-15): launches a DRM-mode title as the helper
   * `steam.exe <game exe>` under the clone runner. The Phase 52 forwarder is
   * never reached in this mode. Every failure is a D-13 notice with no
   * session mark.
   */
  launchDrmModeGame(
    exePath: string,
    installRoot: string,
    ready: DrmLaunchReady
  ): Promise<boolean> {
    return launchDrmModeGame(this, exePath, installRoot, ready)
  }

  /**
   * Phase 60 (D-01/D-03): whether the overlay is on for this launch, and why.
   * Never throws: a failure here means no overlay, never a blocked launch.
   */
  resolveLaunchOverlay(): { enabled: boolean; source: string } {
    return resolveLaunchOverlay(this)
  }

  /**
   * Phase 60 (D-08/D-09): an overlay setup failure is a log line plus a toast
   * in-app (SteamEngineLaunchNotice) and an OS notification on EVERY affected
   * launch, never a dialog, never deduped. Deliberately the
   * opposite of DRM's fail-closed rule (D-56-13): the overlay is an
   * enhancement, so the game still launches.
   */
  notifyOverlaySetupFailed(step: OverlayStep, cause: string): void {
    return notifyOverlaySetupFailed(this, step, cause)
  }

  overlayInputLine(applied: boolean, reason?: string): string {
    return overlayInputLine(this, applied, reason)
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
  overlayInputArg(
    route: 'tcp-clone' | 'env' | 'drm'
  ): { inputModulePath: string } | Record<string, never> {
    return overlayInputArg(this, route)
  }

  /**
   * 60-REVIEW WR-04: the outcome line for a candidate from overlayInputArg,
   * read from the values the launch actually carries (CX_ENV tokens or env
   * values). applied=true only when DYLD_INSERT_LIBRARIES names the module;
   * otherwise (prepare error, runner refused, unsafe path dropped by the value
   * builder, a throw) applied=false reason=not-injected. Never throws.
   */
  logOverlayInputOutcome(
    arg: { inputModulePath: string } | Record<string, never>,
    carried: readonly string[]
  ): void {
    return logOverlayInputOutcome(this, arg, carried)
  }

  /**
   * 60-11 (G1): the dev-only input probe. Armed only when the sidecar was
   * started with GAMELIB_OVERLAY_INPUT_PROBE=1. Never blocks a launch and never
   * raises a notice: a missing or unusable probe just logs a warning.
   */
  overlayProbeArg():
    | {
        probe: { dylibPath: string; logPath: string; experiment?: string }
      }
    | Record<string, never> {
    return overlayProbeArg(this)
  }

  /**
   * Phase 60 (D-01/D-04/D-07/D-08): the TCP-route overlay decision. Returns the
   * settings to launch with and, when the overlay is injecting, its tokens and
   * runner. On the fallback engine (Wine-Staging + DXVK) the overlay is plain
   * env vars (kind 'env', D-07): no clone, no re-sign, no runner change. Ends the bottle's wineserver with the PREVIOUS runner's own
   * wineserver whenever the runner changes (stock/overlay/DRM never share one).
   * Never throws and never blocks the launch.
   */
  prepareTcpOverlay(
    settings: GameSettings,
    previousRunner: ReturnType<typeof getDrmBridgeRunner>
  ): Promise<{
    settings: GameSettings
    overlayLaunch?: OverlayLaunchPayload
  }> {
    return prepareTcpOverlay(this, settings, previousRunner)
  }

  /**
   * Phase 59: the engine registered for this launch (launchBridgeGameBody)
   * must not outlive a launch that did not start. A started launch keeps it
   * until the process monitor's onStopped clears it.
   */
  launchBridgeGame(): Promise<boolean> {
    return launchBridgeGame(this)
  }

  runBridgeLaunch(): Promise<boolean> {
    return runBridgeLaunch(this)
  }

  launchBridgeGameBody(): Promise<boolean> {
    return launchBridgeGameBody(this)
  }

  /**
   * D-51-09 (Task 2): the actual `runWineCommand` + process-monitor firing,
   * split out of `launchBridgeGame` so the no-steam-api branch (no helper,
   * no `writeBridgeConfig`) and the normal helper-backed branch share the
   * exact same wine-invocation and teardown-wiring code — duplicating this
   * would risk the two paths drifting (e.g. one forgetting the monitor's
   * `onStopped` -> `stopBridgeHelper` wiring).
   */
  fireBridgeWineLaunch(
    exePath: string,
    bridgeBottleSettings: GameSettings,
    drm?: DrmWineLaunch,
    overlay?: OverlayLaunchPayload
  ): Promise<boolean> {
    return fireBridgeWineLaunch(
      this,
      exePath,
      bridgeBottleSettings,
      drm,
      overlay
    )
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
  uninstall(_args: RemoveArgs): Promise<ExecResult> {
    return uninstall(this, _args)
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
  uninstallBridgeGame(): Promise<ExecResult> {
    return uninstallBridgeGame(this)
  }

  /**
   * quick 261106-s3n: the ON route for a native-root uninstall. Every refusal
   * sends `done` itself because uninstaller.ts suppresses it for steam.
   */
  uninstallNativeInGameLib(): Promise<ExecResult> {
    return uninstallNativeInGameLib(this)
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
  uninstallUnadoptedMacNativeDirectly(): Promise<ExecResult | null> {
    return uninstallUnadoptedMacNativeDirectly(this)
  }

  /**
   * Shared guarded direct removal of the native install (quick 261106-s3n
   * extracted this from uninstallUnadoptedMacNativeDirectly): files via
   * removeSteamInstallCopy's guards, completion via pollUninstallOnce.
   */
  removeNativeInstallDirectly(): Promise<ExecResult> {
    return removeNativeInstallDirectly(this)
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
  uninstallBottleGameDirectly(): Promise<ExecResult> {
    return uninstallBottleGameDirectly(this)
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
