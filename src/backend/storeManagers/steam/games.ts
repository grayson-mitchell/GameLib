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
import { callAbortController } from 'backend/utils/aborthandler/aborthandler'
import { sendFrontendMessage } from '../../ipc'
import {
  addShortcuts as addShortcutsUtil,
  removeShortcuts as removeShortcutsUtil
} from '../../shortcuts/shortcuts/shortcuts'
import { steamMetadataStore, steamLibraryStore } from './stores'
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
import { cancelDelegatedInstall } from './library/installPolling'
import { getSteamBottleSettings } from './bottle'
import { stopPerGameBridgeBottle } from './bridgeBottleLifecycle'
import * as bridgeBottle from './bridgeBottle'
// Phase 60: Steam overlay in bridged games (macOS).
import { type OverlayLaunchPayload } from './bridge/overlay/overlayLaunch'
import {
  readStoredOverlayOverride,
  parseOverlayOverride
} from './bridge/overlay/overlayPolicy'
import { readStoredTitleConfig, pickTitleSettings } from './titleSettings'
import type { NonCrossoverEngine } from 'backend/engine/engineTypes'
import { noteSteamAuthTrigger } from './authTrigger'
import { type DrmLaunchReady } from './bridge/drm/drmLaunchSetup'
import { stopBridgeHelper } from './bridge/helperProcess'
import type { SteamBridgeRouteVerdict } from 'common/types/steam'
import type { EnginePin } from 'backend/engine/enginePins'
import { isMac } from 'backend/constants/environment'
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
  isBottleEligible,
  checkBridgeRoute,
  isBridgeEligible,
  checkBottleEligibility,
  ensurePlatformsCaptured,
  isForcedWindowsViaBottle
} from './gameEligibility'
import {
  install,
  installNative,
  installBottleNative,
  ensureBuiltInEngineForInstall,
  installBridgeGame
} from './gameInstall'
import { prepareTcpOverlay } from './gameLaunchOverlay'
import {
  launchBridgeGame,
  launchBridgeGameBody,
  fireBridgeWineLaunch
} from './gameBridgeLaunch'
import {
  launch,
  prefetchBridgeDrmDownloads,
  launchDrmModeGame
} from './gameLaunch'
import { moveInstall, repair, syncSaves } from './gameMaintenance'
import { uninstall, uninstallBridgeGame } from './gameUninstall'

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
   *
   * @internal Public only so lifted modules reach it via
   * steamGame.fetchMetadataIfNeeded() (test spy: games.test.ts:1062); do not
   * call from outside steam/.
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
   *
   * @internal Public only so lifted modules reach it via
   * steamGame.installNative() (test spy: games.test.ts:8003); do not call from
   * outside steam/.
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
   *
   * @internal Public only so lifted modules reach it via
   * steamGame.installBottleNative() (test spies: games.test.ts:5234, 7999,
   * 9004); do not call from outside steam/.
   */
  installBottleNative(args: InstallArgs): Promise<InstallResult> {
    return installBottleNative(this, args)
  }

  /**
   * Phase 59 (D-05): download the pinned built-in engine on first need, with
   * `engine-download` progress. A failure is a PRECONDITION failure, like a
   * missing CrossOver: it never marks the bridge failed, so it can never
   * reroute the title to bottled Steam.
   */
  private ensureBuiltInEngineForInstall(
    pin: EnginePin,
    signal?: AbortSignal
  ): Promise<NonCrossoverEngine | InstallResult> {
    return ensureBuiltInEngineForInstall(this, pin, signal)
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
   *
   * @internal Public only so lifted modules reach it via
   * steamGame.installBridgeGame() (test spy: games.test.ts:7995); do not call
   * from outside steam/.
   */
  installBridgeGame(args: InstallArgs): Promise<InstallResult> {
    return installBridgeGame(this, args)
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
    const result = await this.ensureBuiltInEngineForInstall(pin)
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
   * The single source of truth for whether getSettings()/isNative()/
   * install()/launch()/uninstall() should route through the bottled Steam
   * client instead of the native steam:// path — the OR of the platform-
   * derived verdict and the D-17 persisted forced verdict. One seam, five
   * consistent surfaces (34.13-14): all five callers below are unchanged by
   * this split and become consistent together the moment either half
   * changes.
   */
  private isBottleEligible(): boolean {
    return isBottleEligible(this)
  }

  /**
   * D-51-09: the backend-authoritative bridge-route read, exposed over IPC
   * by the exported `getBridgeRouteVerdict()` below (51-13's actual IPC
   * surface) — the `checkBottleEligibility()` precedent for a second
   * resolver. Forces platform capture first for the same reason
   * `checkBottleEligibility()` does: a cold metadata cache must never read
   * as a routing answer.
   */
  checkBridgeRoute(options?: {
    windowsBuildChosen?: boolean
  }): Promise<SteamBridgeRouteVerdict> {
    return checkBridgeRoute(this, options)
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
   * Quick 261029-e2t: the install-time half of DRM mode. Resolves the mode the
   * same way launchBridgeGame does (UE-aware `.bind` detection, CEG markers
   * from the `.bind` exe) and prefetches only when it is steamclient-layer.
   *
   * @internal Public only so lifted modules reach it via
   * steamGame.prefetchBridgeDrmDownloads() (gameInstall -> gameLaunch would be
   * an import cycle); do not call from outside steam/.
   */
  prefetchBridgeDrmDownloads(
    exePath: string,
    bridgeBottleName: string
  ): Promise<void> {
    return prefetchBridgeDrmDownloads(this, exePath, bridgeBottleName)
  }

  /**
   * Phase 56 (D-11/D-12/D-13/D-15): launches a DRM-mode title as the helper
   * `steam.exe <game exe>` under the clone runner. The Phase 52 forwarder is
   * never reached in this mode. Every failure is a D-13 notice with no
   * session mark.
   *
   * @internal Public only so lifted modules reach it via
   * steamGame.launchDrmModeGame() (test spy: games.test.ts:13580); do not call
   * from outside steam/.
   */
  launchDrmModeGame(
    exePath: string,
    installRoot: string,
    ready: DrmLaunchReady
  ): Promise<boolean> {
    return launchDrmModeGame(this, exePath, installRoot, ready)
  }

  /**
   * Phase 60 (D-01/D-04/D-07/D-08): the TCP-route overlay decision. Returns the
   * settings to launch with and, when the overlay is injecting, its tokens and
   * runner. On the fallback engine (Wine-Staging + DXVK) the overlay is plain
   * env vars (kind 'env', D-07): no clone, no re-sign, no runner change. Ends the bottle's wineserver with the PREVIOUS runner's own
   * wineserver whenever the runner changes (stock/overlay/DRM never share one).
   * Never throws and never blocks the launch.
   */
  private prepareTcpOverlay(
    settings: GameSettings,
    previousRunner: ReturnType<typeof bridgeBottle.getDrmBridgeRunner>
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
   *
   * @internal Public only so lifted modules reach it via
   * steamGame.launchBridgeGame() (test spy: games.test.ts:8734); do not call
   * from outside steam/.
   */
  launchBridgeGame(): Promise<boolean> {
    return launchBridgeGame(this)
  }

  /**
   * @internal Public only so lifted modules reach it via
   * steamGame.launchBridgeGameBody() (test spies: games.test.ts:15945, 16049);
   * do not call from outside steam/.
   */
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
   *
   * @internal Public only so lifted modules reach it via
   * steamGame.fireBridgeWineLaunch() (gameLaunch -> gameBridgeLaunch would be
   * an import cycle); do not call from outside steam/.
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
   *
   * @internal Public only so lifted modules reach it via
   * steamGame.uninstallBridgeGame() (test spy: games.test.ts:8763); do not
   * call from outside steam/.
   */
  uninstallBridgeGame(): Promise<ExecResult> {
    return uninstallBridgeGame(this)
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
      if (
        bridgeRecord.bottle === bridgeBottle.bridgeBottleNameFor(this.appId)
      ) {
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
 *
 * quick 261107-lum (DC-4): `windowsBuildChosen` is the install dialog's
 * "Windows" platform choice for a dual-build title. It is an UNTRUSTED
 * renderer value, honoured only under the same triple gate as install():
 * `=== true` (any other type is ignored), AND macOS, AND the persisted
 * `is_windows_native === true` (read after platform capture). With no
 * argument, the choice is derived from LOCATION: a persisted forced-Windows
 * flag whose bits are proven to live in a bridge bottle, so the GamePage /
 * report-problem route display is honest for an installed forced game.
 */
export async function getBridgeRouteVerdict(
  appId: unknown,
  windowsBuildChosen?: unknown
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
  let explicitChoice = false
  if (windowsBuildChosen === true && isMac) {
    // Capture first so is_windows_native is not read off a cold cache.
    await ensurePlatformsCaptured(game)
    explicitChoice = steamMetadataStore.get(appId)?.is_windows_native === true
  }
  const locationChoice =
    windowsBuildChosen === undefined &&
    isForcedWindowsViaBottle(game) &&
    bridgeBottle.findBridgeInstallBottle(appId) !== null
  const verdict = await game.checkBridgeRoute({
    windowsBuildChosen: explicitChoice || locationChoice
  })

  // D-51-09 (Task 2): installedIn answers "where does THIS install's bits
  // already live" (location), never "where would a NEW install go"
  // (eligibility, verdict.route above) -- a never-scanned bottle-eligible
  // title can have verdict.route === 'bridge' (rule 11's pending-scan
  // default) while installedIn correctly stays 'bottle' for an existing
  // GameLibSteam install the widened eligibility must never claim to have
  // moved.
  let installedIn: SteamBridgeRouteVerdict['installedIn'] = null
  if (bridgeBottle.findBridgeInstallBottle(appId) !== null) {
    installedIn = 'bridge'
  } else if (
    library.get(appId)?.is_installed === true &&
    (await game.checkBottleEligibility())
  ) {
    installedIn = 'bottle'
  }

  return { ...verdict, installedIn }
}
