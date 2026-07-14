import axios from 'axios'
import { shell } from 'electron'
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
import { getFileSize } from 'backend/utils'
import type LogWriter from 'backend/logger/log_writer'
import { GameConfig } from 'backend/game_config'
import { isMac } from 'backend/constants/environment'
import { sendFrontendMessage } from '../../ipc'
import { steamMetadataStore, steamLibraryStore } from './electronStores'
import {
  library,
  pendingFetches,
  acquireMetadataSlot,
  releaseMetadataSlot,
  METADATA_FETCH_TIMEOUT_MS
} from './state'
import { startInstallPolling, startUninstallPolling } from './library'
import {
  isBottleReady,
  tellBottledSteamToInstall,
  tellBottledSteamToLaunch,
  tellBottledSteamToUninstall,
  getSteamBottleSettings
} from './bottle'

const STEAM_CDN_BASE = 'https://cdn.cloudflare.steamstatic.com/steam/apps'
const STEAM_STORE_API = 'https://store.steampowered.com/api/appdetails'

/**
 * Build a validated steam:// protocol URL.
 *
 * Returns the URL only when appId is a pure decimal integer string (/^\d+$/).
 * Non-numeric appIds (injected strings, path traversal, shell metacharacters)
 * are rejected here — this is the single chokepoint that mitigates appId
 * injection into steam:// URLs (threat T-03-01).
 *
 * Reused by install/uninstall (plan 03-02) for the same guard.
 */
export function buildSteamProtocolUrl(
  verb: 'rungameid' | 'install' | 'uninstall',
  appId: string
): string | null {
  if (!/^\d+$/.test(appId)) {
    logWarning(
      `SteamGame: rejected non-numeric appId "${appId}" — not constructing steam:// URL (T-03-01)`,
      LogPrefix.Steam
    )
    return null
  }
  return `steam://${verb}/${appId}`
}

/**
 * Parse a storage size from the Steam store appdetails `pc_requirements.minimum`
 * HTML string (e.g. "<li><strong>Storage:</strong> 15 GB available space</li>").
 *
 * The raw HTML is never eval'd or rendered to the DOM — a bounded regex extracts
 * only the numeric size and unit (T-06-02 mitigation).
 *
 * Returns the byte count (Math.round) or undefined when no figure is found.
 */
export function parseSteamStorageRequirement(
  htmlText: string | undefined
): number | undefined {
  if (!htmlText || typeof htmlText !== 'string') return undefined
  // Matches: "15 GB available space", "512 MB available space", "1.5 TB available space"
  const match = htmlText.match(
    /(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)\s+available\s+space/i
  )
  if (!match) return undefined
  const value = parseFloat(match[1])
  const unit = match[2].toUpperCase()
  const multipliers: Record<string, number> = {
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4
  }
  return Math.round(value * (multipliers[unit] ?? 1))
}

interface MacOsVersion {
  major: number
  minor: number
}

/**
 * Named macOS release codenames → major.minor, used ONLY as a fallback when
 * the isolated OS segment has no digit-based version at all. Not observed as
 * necessary in the live-verified corpus (18-RESEARCH.md Pattern 1) — kept for
 * forward compatibility with future store copy that might drop numbers
 * entirely (e.g. "macOS Sequoia" with no digit).
 */
const MACOS_CODENAME_VERSION: Record<string, MacOsVersion> = {
  sequoia: { major: 15, minor: 0 },
  sonoma: { major: 14, minor: 0 },
  ventura: { major: 13, minor: 0 },
  monterey: { major: 12, minor: 0 },
  'big sur': { major: 11, minor: 0 },
  catalina: { major: 10, minor: 15 },
  mojave: { major: 10, minor: 14 },
  'high sierra': { major: 10, minor: 13 },
  sierra: { major: 10, minor: 12 },
  'el capitan': { major: 10, minor: 11 },
  yosemite: { major: 10, minor: 10 },
  mavericks: { major: 10, minor: 9 },
  'mountain lion': { major: 10, minor: 8 },
  lion: { major: 10, minor: 7 },
  'snow leopard': { major: 10, minor: 6 },
  leopard: { major: 10, minor: 5 }
}

function extractVersionTokens(text: string): MacOsVersion[] {
  // Matches "10.15", "10.9.3", "12.3" — deliberately requires a literal dot,
  // so bare numbers like "32" (from "32/64-bit") or "1" (from "1GB RAM")
  // never false-match (T-18-02-01/02: floor-only, never asserts '32').
  const matches = [...text.matchAll(/\b(\d{1,2})\.(\d{1,2})(?:\.\d{1,2})?\b/g)]
  return matches.map((m) => ({ major: Number(m[1]), minor: Number(m[2]) }))
}

/**
 * Parses the Steam appdetails `mac_requirements.minimum` HTML/text blob and
 * returns the LOWEST macOS version evidenced in it — i.e. the true minimum
 * requirement, even when the string lists multiple named releases as
 * alternatives ("Leopard 10.5.8, Snow Leopard 10.6.3, or higher" means
 * "10.5.8 or higher", not "10.6.3 or higher").
 *
 * Returns null when nothing extractable — callers MUST treat null as
 * 'unknown', mirroring parseSteamStorageRequirement's undefined-on-no-match
 * convention. The HTML is never eval'd or rendered (T-06-02/T-18-02-01).
 */
export function parseSteamMacMinOSVersion(
  htmlOrText: string | undefined
): MacOsVersion | null {
  if (!htmlOrText || typeof htmlOrText !== 'string') return null

  // Strip HTML tags FIRST so the "OS" label and its value are never split
  // across a tag boundary (the canonical shape wraps ONLY the label in
  // <strong>...</strong>, with the actual value sitting outside the tag —
  // isolating on '<' before stripping would truncate the label match to an
  // empty string). Handles all 5 observed shapes uniformly once tag-free:
  //  a) '<li><strong>OS:</strong> 10.9.3 (Mavericks)<br></li>'
  //  b) '<strong>OS: OSX 10.9.5 - 10.11.6</strong>' (label+value co-located)
  //  c) 'OS: Snow Leopard 10.6.8, ...<br />' (no <li>/<ul> wrapper)
  //  d) 'OS X version Leopard 10.5.8, Snow Leopard 10.6.3, 1GB RAM,...'
  //     (fully tagless — no delimiter after the OS clause at all)
  //  e) 'mac_requirements: []' — caller never invokes this fn (guarded by
  //     optional chaining at the call site: data?.mac_requirements?.minimum)
  const tagFree = htmlOrText.replace(/<[^>]*>/g, ' ')

  // \b requires a word boundary before "OS" so mid-word substrings (e.g.
  // "Chaos") never false-match; "X?" covers the "OS X" label variant.
  const labelMatch = tagFree.match(/\bOS(?:\s*X)?\s*:?\s*(.*)/i)
  if (!labelMatch) return null

  let segment = labelMatch[1]
  // Bound the tagless/run-on case (d): stop at the next competing spec
  // keyword so a Processor/Memory figure never bleeds into the version
  // extraction.
  const stopIdx = segment.search(
    /\b(processor|cpu|memory|ram|graphics|gpu|storage|network|additional)\b/i
  )
  if (stopIdx > -1) segment = segment.slice(0, stopIdx)

  const versions = extractVersionTokens(segment)
  if (versions.length > 0) {
    return versions.reduce((min, v) =>
      v.major < min.major || (v.major === min.major && v.minor < min.minor)
        ? v
        : min
    )
  }

  const lowerSegment = segment.toLowerCase()
  for (const [name, version] of Object.entries(MACOS_CODENAME_VERSION)) {
    if (lowerSegment.includes(name)) return version
  }

  return null
}

/**
 * MAC32-01 (direction B): the pre-install arch signal, derived from the
 * SAME appdetails response `is_mac_native` already reads (no new network
 * call, no PICS/steam-user involvement — see games.ts fetchMetadataIfNeeded).
 *
 * NEVER returns '32' — a low min-OS proves nothing about bitness (A Hat in
 * Time: min-OS 10.11.6, genuinely 64-bit — 18-RESEARCH.md Pattern 1 corpus).
 * Catalina's 32-bit removal only proves a FLOOR: min-OS >= 10.15 implies the
 * binary MUST be 64-bit (Apple physically cannot run i386 on 10.15+), but
 * min-OS < 10.15 implies nothing either way. The return type has no '32'
 * member — Pitfall 3 / T-18-02-02 is enforced at the type level, not by
 * convention. Only the post-install Mach-O check (Plan 18-03) may assert '32'.
 */
export function macArchFromMinOS(
  minHtml: string | undefined
): '64' | 'unknown' {
  const v = parseSteamMacMinOSVersion(minHtml)
  if (!v) return 'unknown'
  const isCatalinaOrNewer = v.major > 10 || (v.major === 10 && v.minor >= 15)
  return isCatalinaOrNewer ? '64' : 'unknown'
}

/**
 * Returns a human-readable install size string for a Steam game.
 *
 * Fast path (no network): if the game is already installed, `install_size`
 * is already a `getFileSize`-formatted string (persisted that way by
 * library.ts) — return it directly, no parse.
 *
 * Pre-install estimate: call the public Steam store appdetails API, parse
 * the `pc_requirements.minimum` HTML for a storage figure, and return it via
 * getFileSize. Falls back to '?? MB' when no figure is obtainable (D-03).
 *
 * appId is guarded with /^\d+$/ before any network request (T-06-01).
 */
export async function getSteamInstallSize(
  appId: string,
  gameInfo?: GameInfo
): Promise<string> {
  // Fast path: already installed — install_size is already formatted, return
  // it directly (no parse, no network needed)
  if (gameInfo?.is_installed && gameInfo?.install?.install_size) {
    return gameInfo.install.install_size
  }

  // Guard: non-numeric appId rejected before constructing any URL (T-06-01)
  if (!/^\d+$/.test(appId)) {
    logWarning(
      `getSteamInstallSize: rejected non-numeric appId "${appId}" (T-06-01)`,
      LogPrefix.Steam
    )
    return '?? MB'
  }

  // Pre-install estimate: parse storage requirement from store API
  try {
    const resp = await axios.get(`${STEAM_STORE_API}?appids=${appId}`)
    const data = resp.data?.[appId]?.data
    // Guard: pc_requirements may be [] for F2P/DLC/tool apps (Pitfall 5)
    const minHtml = data?.pc_requirements?.minimum
    const bytes = parseSteamStorageRequirement(minHtml)
    if (bytes && bytes > 0) return getFileSize(bytes)
  } catch (err) {
    logWarning(
      [`getSteamInstallSize: store API fetch failed for appId ${appId}:`, err],
      LogPrefix.Steam
    )
  }

  return '?? MB'
}

export default class SteamGame implements Game {
  private readonly appId: string

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
      return getSteamBottleSettings()
    }
    const gameConfig = GameConfig.get(this.appId)
    return gameConfig.config || (await gameConfig.getSettings())
  }

  /**
   * Returns the in-memory library entry for this game synchronously.
   * When artwork is missing (first access), fires a non-blocking metadata
   * fetch as a side effect — caller gets the current entry immediately
   * and the frontend receives an updated push once the fetch resolves.
   */
  getGameInfo(): GameInfo {
    const existing = library.get(this.appId)
    if (!existing) return {} as GameInfo

    // Trigger lazy metadata fetch as fire-and-forget side effect (D-04).
    // Also self-heal games cached before DETAIL-01 shipped: their art_cover is
    // populated (so the original guard skipped the fetch) but their platform
    // support was never captured. Re-fetch once when platformsCaptured is not yet
    // true — excluding delisted games, whose terminal branch returns before
    // capturing platforms (avoids a re-fetch loop). fetchMetadataIfNeeded's
    // pendingFetches dedup (T-2-03) absorbs repeated calls while a fetch is in flight.
    const cached = steamMetadataStore.get(this.appId)
    const platformsNeverCaptured =
      !existing.is_delisted && cached?.platformsCaptured !== true
    if (!existing.art_cover || platformsNeverCaptured) {
      void this.fetchMetadataIfNeeded(existing)
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
  private async fetchMetadataIfNeeded(current: GameInfo): Promise<void> {
    // Guard: if a fetch is already in-flight for this appId, return immediately
    // (pendingFetches.add MUST come before the await — prevents T-2-03 race)
    if (pendingFetches.has(this.appId)) return
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
          ...(existing ?? { art_cover: '', art_square: '', extra: { reqs: [] } }),
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

      // DETAIL-01: capture native platform support from appdetails.
      // Windows is the implicit baseline (no GameInfo flag); only mac/linux
      // native support is recorded onto the generic platform flags.
      const is_mac_native = !!data.platforms?.mac
      const is_linux_native = !!data.platforms?.linux

      // MAC32-01 (direction B): derive the pre-install arch hint from the
      // SAME appdetails response — no separate network/PICS call. Gated:
      //  1. Never overwrite a Mach-O-verified entry (post-install ground
      //     truth always wins — a cheap heuristic must not regress a
      //     confirmed fact, T-18-02-04).
      //  2. Only compute when is_mac_native is true (Pitfall 2) — a false
      //     is_mac_native already routes correctly via the existing
      //     isBottleEligible() D-11 OR-branch, making this signal moot.
      const existingMeta = steamMetadataStore.get(this.appId)
      const macArchVerified = existingMeta?.mac_arch_verified === true
      const mac_arch: GameInfo['mac_arch'] = macArchVerified
        ? existingMeta.mac_arch
        : is_mac_native
          ? macArchFromMinOS(data.mac_requirements?.minimum)
          : existingMeta?.mac_arch

      const updated: GameInfo = {
        ...current,
        title: data.name ?? current.title,
        art_cover,
        art_square,
        is_mac_native,
        is_linux_native,
        mac_arch,
        // GAP-B: clear any stale delisted flag — the app is available again.
        is_delisted: false,
        // Phase 17 D-08 reconciliation: this push only happens after a
        // successful appdetails fetch, which is exactly when platforms are
        // captured — mirrors steamMetadataStore.platformsCaptured below.
        steamPlatformsCaptured: true,
        extra
      }

      // Persist metadata for next session (D-05, indefinite cache).
      // platformsCaptured:true records that appdetails `platforms` was read, so
      // getGameInfo won't re-fetch this game again for platform data (self-heal once).
      // T-18-02-04: steamMetadataStore.set REPLACES the entire entry (electron-store
      // Store.set), so a Mach-O-verified verdict (mac_arch_verified/mac_arch_source)
      // must be explicitly carried forward here — otherwise the NEXT
      // fetchMetadataIfNeeded call (next launch/resync) would silently drop the
      // verified flag and regress mac_arch back to the min-OS heuristic.
      steamMetadataStore.set(this.appId, {
        art_cover,
        art_square,
        extra,
        is_mac_native,
        is_linux_native,
        is_delisted: false,
        platformsCaptured: true,
        mac_arch,
        ...(macArchVerified
          ? {
              mac_arch_verified: true as const,
              ...(existingMeta?.mac_arch_source
                ? { mac_arch_source: existingMeta.mac_arch_source }
                : {})
            }
          : is_mac_native
            ? { mac_arch_source: 'minos' as const }
            : {})
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
   * Does NOT call sendProgressUpdate — Steam owns the download with its own UI.
   * Install state is never optimistically flipped on click (D-02); badge
   * reconciliation happens when the user tabs back (focus → ACF re-read, D-01).
   *
   * Phase 17 (D-10/D-11): a confirmed-not-native macOS game routes through the
   * bottled Steam client instead of native steam:// — see isBottleEligible().
   */
  async install(_args: InstallArgs): Promise<InstallResult> {
    await this.ensurePlatformsCaptured()
    if (this.isBottleEligible()) {
      if (!isBottleReady()) {
        logInfo(
          `SteamGame: appId ${this.appId} is bottle-eligible but the bottle is not yet provisioned — requesting guided setup instead of installing`,
          LogPrefix.Steam
        )
        sendFrontendMessage('steamBottleSetupRequired', {
          appName: this.appId
        })
        // Nothing was installed and no ACF poller starts here — flag the
        // deferral so the DownloadManager clears the transient 'installing'
        // badge instead of leaving the game stuck "installing" (the guided
        // setup, or the user's "Not now", owns what happens next).
        return { status: 'done', deferredToSetup: true }
      }

      logInfo(
        `SteamGame: delegating install for appId ${this.appId} via the bottled Steam client`,
        LogPrefix.Steam
      )
      const result = await tellBottledSteamToInstall(this.appId)

      // WR-01 (17-17): only start the bottle ACF poller when the dispatch
      // actually succeeded. A failed dispatch used to still spawn the poller,
      // producing ~60s of false "installing" state; surface the error instead
      // with no poller.
      if (result.status !== 'done') {
        return { status: 'error', error: result.error }
      }

      // Start bottle-scoped ACF polling (D-07) — the bottle's own steamapps
      // root is distinct from the native root (RESEARCH.md Pitfall 2).
      startInstallPolling(this.appId, { source: 'bottle' })

      return { status: 'done' }
    }

    const url = buildSteamProtocolUrl('install', this.appId)
    if (!url) {
      return { status: 'error', error: `Invalid appId: ${this.appId}` }
    }

    logInfo(
      `SteamGame: delegating install for appId ${this.appId} via ${url}`,
      LogPrefix.Steam
    )
    await shell.openExternal(url)

    // Start ACF polling so the install progress and completion are surfaced
    // in GamerLib without requiring a focus round-trip (D-07). The poller
    // sends 'installing' / 'done' status updates to the frontend and flips
    // the badge when StateFlags bit 4 is set. Install state is never
    // optimistically flipped here (D-02) — only ACF confirms.
    startInstallPolling(this.appId)

    return { status: 'done' }
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
    return !this.isBottleEligible()
  }

  /**
   * True only for a CONFIRMED not-native macOS game (D-11) — the single
   * source of truth for whether install/launch/uninstall should route through
   * the bottled Steam client instead of the native steam:// path. Reused by
   * isNative() here; Phase 17 Plan 05 Task 2 also reuses it from
   * getSettings(), install(), launch(), and uninstall().
   */
  private isBottleEligible(): boolean {
    if (!isMac) return false
    const meta = steamMetadataStore.get(this.appId)
    // MAC32-02: a confirmed-32-bit mac build is bottle-eligible independent of
    // is_mac_native/platformsCaptured — a confirmed-32 game reports
    // is_mac_native true (it DOES have a mac depot, just not a runnable one on
    // modern macOS). Pre-install the min-OS heuristic (games.ts macArchFromMinOS)
    // NEVER yields '32', so this branch only ever fires from Plan 18-03's
    // post-install Mach-O ground-truth check — but the wiring lands now so
    // routing goes live the moment 18-03 caches a '32' verdict.
    if (meta?.mac_arch === '32') return true
    return meta?.platformsCaptured === true && meta?.is_mac_native === false
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
  private async ensurePlatformsCaptured(): Promise<void> {
    if (!isMac) return

    const alreadyCaptured = (): boolean =>
      steamMetadataStore.get(this.appId)?.platformsCaptured === true

    if (alreadyCaptured()) return

    await this.fetchMetadataIfNeeded(this.getGameInfo())

    // Bounded poll for the T-2-03 dedup race: fetchMetadataIfNeeded() may have
    // early-returned because a concurrent fetch (the getGameInfo() side effect
    // above, or an earlier render's lazy fetch) is already in flight for this
    // appId. Wait for it to resolve platformsCaptured, drain from
    // pendingFetches, or hit METADATA_FETCH_TIMEOUT_MS — whichever first, so
    // install()/launch()/uninstall() can never hang indefinitely (T-17-09-01).
    if (!alreadyCaptured() && pendingFetches.has(this.appId)) {
      const deadline = Date.now() + METADATA_FETCH_TIMEOUT_MS
      while (
        !alreadyCaptured() &&
        pendingFetches.has(this.appId) &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
  }

  async addShortcuts(_fromMenu?: boolean): Promise<void> {
    logWarning(
      `SteamGame.addShortcuts not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
  }

  async removeShortcuts(): Promise<void> {
    logWarning(
      `SteamGame.removeShortcuts not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
  }

  /**
   * Delegates launching to the Steam client via the steam://rungameid protocol.
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
    await this.ensurePlatformsCaptured()
    if (this.isBottleEligible()) {
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
      const result = await tellBottledSteamToLaunch(this.appId)
      return result.status === 'done'
    }

    const url = buildSteamProtocolUrl('rungameid', this.appId)
    if (!url) {
      // Non-numeric appId — rejection already logged by buildSteamProtocolUrl
      return false
    }

    logInfo(
      `SteamGame: launching appId ${this.appId} via ${url}`,
      LogPrefix.Steam
    )
    // Hand the steam:// URL to the Steam client WITHOUT bringing it to the
    // foreground (macOS/Windows). Activating Steam is what forces macOS to leave
    // GameLib's fullscreen Space (Console mode), causing a visible desktop-Space
    // flash before the game appears. With activate:false, Steam processes
    // rungameid in the background and the only Space switch is directly to the
    // game's own window. Ignored on Linux (no effect on Steam Deck game mode).
    await shell.openExternal(url, { activate: false })
    return true
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

  async repair(): Promise<ExecResult> {
    logWarning(
      `SteamGame.repair not implemented until Phase 2 (appId: ${this.appId})`,
      LogPrefix.Steam
    )
    return { stdout: '', stderr: 'Steam library not implemented until Phase 2' }
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
   * Delegates uninstall to the Steam client via the steam://uninstall protocol.
   * The appId is validated by buildSteamProtocolUrl (T-03-01 mitigation).
   *
   * Does NOT show a GamerLib confirmation dialog — Steam owns its own confirm
   * dialog (D-05). Install state is never optimistically flipped from a click
   * (D-02); badges flip only after confirmed ACF data. After the URL fires we
   * poll the ACF (D-07) so the badge updates to not-installed without a focus
   * round-trip; the focus re-read (D-01) remains as a backstop.
   */
  async uninstall(_args: RemoveArgs): Promise<ExecResult> {
    await this.ensurePlatformsCaptured()
    if (this.isBottleEligible()) {
      if (!isBottleReady()) {
        logInfo(
          `SteamGame: appId ${this.appId} is bottle-eligible but the bottle is not yet provisioned — requesting guided setup instead of uninstalling`,
          LogPrefix.Steam
        )
        sendFrontendMessage('steamBottleSetupRequired', {
          appName: this.appId
        })
        return { stdout: '', stderr: '' }
      }

      logInfo(
        `SteamGame: delegating uninstall for appId ${this.appId} via the bottled Steam client`,
        LogPrefix.Steam
      )
      const result = await tellBottledSteamToUninstall(this.appId)

      // Bottle-scoped ACF polling (D-07) — distinct root from the native scan.
      startUninstallPolling(this.appId, { source: 'bottle' })

      return { stdout: '', stderr: result.error ?? '' }
    }

    const url = buildSteamProtocolUrl('uninstall', this.appId)
    if (!url) {
      return { stdout: '', stderr: `Invalid appId: ${this.appId}` }
    }

    logInfo(
      `SteamGame: delegating uninstall for appId ${this.appId} via ${url}`,
      LogPrefix.Steam
    )
    await shell.openExternal(url)

    // Poll ACF so the badge flips to not-installed when Steam removes the
    // appmanifest, without requiring a focus round-trip (D-07). Symmetric to
    // install polling. State is never optimistically flipped here (D-02).
    startUninstallPolling(this.appId)

    return { stdout: '', stderr: '' }
  }

  async update(): Promise<InstallResult> {
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
      const updated: GameInfo = { ...existing, is_installed: false, install: {} }
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
   * No-op — Steam owns the process lifecycle for its games.
   * GamerLib cannot observe or terminate Steam game processes.
   * Analog: gog/games.ts lines 1291-1295.
   */
  async stop(_stopWine?: boolean): Promise<void> {
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
      // LIB-07: delisted game is non-available regardless of install state
      if (info?.is_delisted) {
        return resolve(false)
      }
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
