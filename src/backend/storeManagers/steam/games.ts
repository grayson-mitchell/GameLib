import axios from 'axios'
import { shell } from 'electron'
import { existsSync } from 'graceful-fs'
import { rmSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
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
import { isMac, isLinux } from 'backend/constants/environment'
import {
  createAbortController,
  callAbortController,
  deleteAbortController
} from 'backend/utils/aborthandler/aborthandler'
import { sendFrontendMessage } from '../../ipc'
import { steamMetadataStore, steamLibraryStore } from './electronStores'
import { depotSignalCaptured } from './metadataCapture'
import {
  library,
  pendingFetches,
  acquireMetadataSlot,
  releaseMetadataSlot,
  METADATA_FETCH_TIMEOUT_MS
} from './state'
import {
  startInstallPolling,
  startUninstallPolling,
  resumeInterruptedSteamInstall,
  markSteamInstallIncomplete,
  readAcfState,
  pollUninstallOnce,
  resolveInstallRoot,
  findOtherManifestsWithInstalldir
} from './library'
import {
  isBottleReady,
  tellBottledSteamToInstall,
  tellBottledSteamToLaunch,
  getSteamBottleSettings,
  getBottleSteamappsDir,
  isBridgeBottleReady,
  getBridgeBottleSettings,
  provisionBridgeBottle
} from './bottle'
import { isSteamNativeInstallEnabled } from './nativeInstallSetting'
import { downloadSteamDepots } from './depot'
import { ensureSteamClientReady } from './clientSetup' // Plan 10 seam
import { resolveSteamInstallTarget } from './installLocation' // Plan 09 seam
import { withTimeout, STEAM_PICS_TIMEOUT_MS } from './withTimeout'
// Phase 24 Plan 08 (R4/R7): allowlist-based bridge-vs-fallback routing.
import { bridgeAllowlist } from './bridge/allowlist'
import { placeShimForGame } from './bridge/shimGenerate'
import { resolveBridgeLaunchExe } from './bridge/launchTarget'
import { ensureBridgeHelperReady } from './bridge/helperProcess'

/** The project-wide appId shape guard (clientSetup.ts, installFormIpc.ts,
 * bottle.ts, bridge/allowlist.ts all carry the identical regex). Used by
 * uninstallBottleGameDirectly to validate a renderer-supplied appId before it
 * is interpolated into a filesystem delete target — 34.13 review A-12. */
const NUMERIC_APP_ID = /^\d+$/

const STEAM_CDN_BASE = 'https://cdn.cloudflare.steamstatic.com/steam/apps'
const STEAM_STORE_API = 'https://store.steampowered.com/api/appdetails'

/**
 * A single tracked native depot-download run for one appId — the value type
 * for nativeInstallsInFlight below. `promise` is the in-flight
 * installDepotDownload() run's own settlement (joined by a second concurrent
 * caller for the same appId, T-23-12); `aborted` is flipped true by stop()
 * alongside callAbortController() so a subsequent installDepotDownload() call
 * can distinguish a genuinely LIVE run (join it) from one that is merely
 * TEARING DOWN after a pause/cancel (await its settlement first, then start a
 * fresh run — T-23-15, no stacking). aborthandler.ts itself exposes no
 * external "is this id's controller aborted" query, so this flag is games.ts's
 * own bookkeeping layer on top of createAbortController/deleteAbortController's
 * create-call-delete lifecycle.
 */
interface NativeInstallEntry {
  promise: Promise<InstallResult>
  aborted: boolean
}

/**
 * appIds with an in-flight native depot download (SNI-07/D-02) — the single
 * source of truth stop() consults to decide whether to abort a real download
 * or stay the historic no-op, AND (T-23-12) the single-flight guard
 * installDepotDownload() consults on entry so a second concurrent call for the
 * same appId never starts a second downloadSteamDepots. Populated for the
 * duration of a native depot-download run only; released in a fail-safe
 * `finally` on success, error, or cancel (T-23-13) so a crashed/aborted run
 * can never permanently block a later re-install of that appId.
 */
const nativeInstallsInFlight = new Map<string, NativeInstallEntry>()

/**
 * Phase 24 Plan 08 (R7, review finding #3 — fallback-bypass): appIds whose
 * bridge path has already failed THIS SESSION (bridge-bottle provisioning
 * failure, depot/shim placement failure, or an unreachable/not-inited
 * helper at launch). `isBridgeEligible()` below consults this set so a
 * user's D-05 fallback re-invocation of install()/launch() routes to the
 * existing bottled-Steam branch instead of looping back into the SAME
 * failing bridge (T-24-17). Session-scoped only (never persisted) — a fresh
 * GameLib process gets a clean slate to retry the bridge for an appId whose
 * earlier failure may have been transient (e.g. Steam not yet signed in).
 */
const bridgeFailedThisSession = new Set<string>()

/**
 * Marks appId as bridge-failed for the remainder of this GameLib process.
 * Called from every terminal bridge-failure branch in install()/launch()
 * (installBridgeGame below; launch()'s bridge branch, Task 3) — never
 * reset except by process restart.
 */
export function markBridgeFailedThisSession(appId: string): void {
  bridgeFailedThisSession.add(appId)
}

/**
 * Test-only reset for bridgeFailedThisSession — mirrors helperProcess.ts's
 * `__resetBridgeHelperStateForTests()` convention (24-06). Unit tests that
 * deliberately drive a bridge failure (BLOCKER 1 provisioning failure,
 * launch readiness failure, etc.) mark real module-scoped state that would
 * otherwise leak into every later test sharing the same appId; call this in
 * a `beforeEach`/`afterEach` rather than relying on every test picking a
 * never-reused dedicated appId.
 */
export function __resetBridgeFailedSessionForTests(): void {
  bridgeFailedThisSession.clear()
}

/**
 * D-UAT-24-03 cascade (a) — un-poisons the session for appId after a
 * successful bridge (re)install. `isBridgeEligible()` consults
 * `bridgeFailedThisSession` for BOTH install() and launch() routing, so a
 * single earlier recoverable failure (e.g. a transient depot-download
 * error) previously stayed sticky for the rest of the process even after a
 * later install attempt actually succeeded — permanently routing that
 * appId's install AND launch down the native/bottled fallback instead of
 * the now-working bridge. Called from installBridgeGame's success path
 * only; a FAILED install still calls markBridgeFailedThisSession and must
 * NOT call this.
 */
export function clearBridgeFailedThisSession(appId: string): void {
  bridgeFailedThisSession.delete(appId)
}

/**
 * T-23-14 read seam: true if a native depot download is currently tracked
 * (live OR tearing down) for this appId. Exposes a minimal boolean over
 * nativeInstallsInFlight — never the mutable registry itself — so library.ts's
 * startup-resume loop can skip an appId already owned by a live in-process
 * install, so a stale on-disk StateFlags=1026 manifest can never spawn a
 * phantom concurrent install racing it.
 */
export function isNativeInstallInFlight(appId: string): boolean {
  return nativeInstallsInFlight.has(appId)
}

/**
 * D-17 (34.13-14) durability writer pair — the write and the erase of
 * `steamMetadataStore`'s `forcedWindowsViaBottle` field, kept next to each
 * other so they read as one contract. Both use a read-modify-write spread
 * (the GAP-B idiom, games.ts's `is_delisted` branch above) rather than a
 * bare `steamMetadataStore.set` with a fresh object literal: `.set()`
 * REPLACES the whole entry (T-18-02-04), so a bare write here would wipe the
 * game's art/extra/platformsCaptured/mac_arch in one call.
 *
 * Called ONLY from install()'s bottle-committing terminal, on a proven
 * success — never on a deferral, a rejected dispatch, or a failed depot
 * download (see install()'s own JSDoc for the exact call site).
 *
 * 34.13 review A-09 / A-14: the fabrication fallback
 * `?? { art_cover: '', art_square: '', extra: { reqs: [] } }` is REMOVED and
 * replaced by an early return. It was unreachable — the only caller is
 * install()'s bottle terminal, reached through
 * `routeThroughBottle = forceWindowsViaBottle || this.isBottleEligible()`,
 * every arm of which requires a `steamMetadataStore` entry to already exist —
 * and it was also WRONG: the entry it fabricated would carry no
 * `platformsCaptured`, i.e. a strictly worse state than the missing read it
 * was compensating for, which `getGameInfo`'s self-heal would then have to
 * undo. Refusing loudly is the correct behaviour for a precondition that
 * cannot legitimately fail.
 */
export function markForcedWindowsViaBottle(appId: string): void {
  const existing = steamMetadataStore.get(appId)
  if (!existing) {
    logWarning(
      `SteamGame: appId ${appId} — refusing to fabricate a metadata entry to record the forced Windows-via-bottle verdict (no entry exists; this call site cannot be reached without one)`,
      LogPrefix.Steam
    )
    return
  }
  steamMetadataStore.set(appId, {
    ...existing,
    forcedWindowsViaBottle: true
  })
  logInfo(
    `SteamGame: appId ${appId} — persisted forced Windows-via-bottle verdict after a committed install`,
    LogPrefix.Steam
  )
}

/**
 * The reversibility half of the pair above — cleared only on an
 * ACF-CONFIRMED bottle uninstall (library.ts's pollUninstallOnce, Task 3),
 * never at dispatch time. Early-returns when no metadata entry exists at
 * all: without that guard, every native uninstall of a never-forced game
 * would fabricate a metadata entry purely to record `false`.
 *
 * 34.13 review A-09 / A-14: it ALSO early-returns when the flag was never
 * set. The previous shape computed `wasForced` and then used it only to gate
 * the LOG LINE — the `steamMetadataStore.set` ran regardless. Since `.set()`
 * REPLACES the whole entry (T-18-02-04), every confirmed-absent bottle tick
 * performed a full read-rewrite of a game's metadata to write a value it
 * already had. A-09 noted this was moot until A-01 landed, because nothing
 * ever set the flag; A-01 landed in 996c192d1, so it is live.
 */
export function clearForcedWindowsViaBottle(appId: string): void {
  const existing = steamMetadataStore.get(appId)
  if (!existing || existing.forcedWindowsViaBottle !== true) return
  steamMetadataStore.set(appId, {
    ...existing,
    forcedWindowsViaBottle: false
  })
  logInfo(
    `SteamGame: appId ${appId} — cleared forced Windows-via-bottle verdict (bottle ACF confirmed absent)`,
    LogPrefix.Steam
  )
}

/**
 * Maps the host OS to Steam's depot `oslist` vocabulary ('windows'|'macos'|
 * 'linux') — the SAME strings depot/select.ts's DepotSelectOpts.os matches
 * PICS depot config.oslist against. NOT the InstallPlatform vocabulary
 * library.ts's hostInstallPlatform() uses ('Windows'/'Mac'/'linux') — the two
 * must not be conflated.
 */
function hostSteamDepotOs(): string {
  if (isMac) return 'macos'
  if (isLinux) return 'linux'
  return 'windows'
}

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
  appId: unknown,
  gameInfo?: GameInfo
): Promise<string> {
  // Fast path: already installed — install_size is already formatted, return
  // it directly (no parse, no network needed)
  if (gameInfo?.is_installed && gameInfo?.install?.install_size) {
    return gameInfo.install.install_size
  }

  // Guard: non-numeric appId rejected before constructing any URL (T-06-01).
  //
  // 34.13 review A-18 / WR-10: takes `unknown` and carries the `typeof` check
  // itself, so BOTH runtime registrations (`main.ts` and
  // `sidecar/steamAuthFlowRegistration.ts`) can drop their `args[0] as string`
  // cast at once — the pushdown shape WR-10 established for
  // `isSteamBottleEligible`. The regex ALONE was not a guard on an untrusted
  // payload: `RegExp.prototype.test` coerces its argument, so `123` and
  // `['570']` both passed `/^\d+$/.test(...)` and reached the URL builder as
  // a non-string. Hardening only one runtime would have created a real
  // Electron/Tauri behaviour divergence, which is why this belongs here.
  //
  // The rejected value is NO LONGER interpolated into the log line: it is
  // untrusted renderer input, and naming the field is enough to diagnose.
  if (typeof appId !== 'string' || !/^\d+$/.test(appId)) {
    logWarning(
      `getSteamInstallSize: rejected an appId that is not a numeric string (T-06-01)`,
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
    if (!existing.art_cover || platformsNeverCaptured) {
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
        is_windows_native,
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
      steamMetadataStore.set(this.appId, {
        art_cover,
        art_square,
        extra,
        is_mac_native,
        is_linux_native,
        is_windows_native,
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
            : {}),
        ...(existingMeta?.forcedWindowsViaBottle === true
          ? { forcedWindowsViaBottle: true as const }
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
  async install(args: InstallArgs): Promise<InstallResult> {
    // steam-startup-resume-crash (2026-07-18) / D-04 softened: a
    // startup-detected interrupted install is surfaced (steamResumePending)
    // but never auto-driven — the user's own Install click IS the resume
    // trigger. Run the honest verify-and-finalize pass first (fast: sha1-
    // reconciles what's already on disk and only reports genuine gaps, it
    // never itself re-downloads — see resumeInterruptedSteamInstall), then
    // fall through into the normal install flow below, which will pick up
    // and complete anything the reconcile pass left as a gap. A failure here
    // must never block the real install attempt beneath it (hardening).
    if (library.get(this.appId)?.install?.steamResumePending) {
      await resumeInterruptedSteamInstall(this.appId).catch((err) => {
        logWarning(
          [
            `SteamGame: resume-surface finalize failed for appId ${this.appId}, continuing to normal install:`,
            err
          ],
          LogPrefix.Steam
        )
      })
    }

    await this.ensurePlatformsCaptured()

    // D-17 (34.13-06): whether the renderer explicitly requested the
    // Windows-via-bottle override. The ONLY line in this method that reads
    // args.steamForceWindowsViaBottle — see the method's own JSDoc above for
    // why platformToInstall is never read instead.
    const overrideRequested = args.steamForceWindowsViaBottle === true

    // Triple-gated: overrideRequested AND isMac (host containment, D-18)
    // AND the persisted Windows-depot verdict proven true. Any gate failing
    // fails closed — routing stays byte-identical to today's.
    // Read ONCE and reused by the rejection log below (34.13 review WR-07):
    // the log has to be able to name WHICH gate refused, and the most likely
    // one in practice is a cold/absent metadata cache, not the host check.
    const windowsDepotVerdict = steamMetadataStore.get(
      this.appId
    )?.is_windows_native

    const forceWindowsViaBottle =
      overrideRequested && isMac && windowsDepotVerdict === true

    // A silently-dropped user choice is a recurring defect class in this
    // repo — log why a requested-but-rejected override fell through instead
    // of failing silently. Both gates are named: logging `isMac` alone
    // produced `isMac=true` with no explanation whenever the real cause was
    // an uncaptured `is_windows_native`, which actively misdirects
    // diagnosis. `undefined` (never captured) and `false` (confirmed no
    // Windows depot) are deliberately distinguishable in the output.
    if (overrideRequested && !forceWindowsViaBottle) {
      logWarning(
        `SteamGame: appId ${this.appId} requested a Windows-via-bottle install override but it was rejected ` +
          `(isMac=${isMac}, is_windows_native=${String(windowsDepotVerdict)}) — falling through to legacy routing`,
        LogPrefix.Steam
      )
    }

    const routeThroughBottle = forceWindowsViaBottle || this.isBottleEligible()

    if (routeThroughBottle) {
      // Phase 24 Plan 08 (R4/D-01): allowlisted-title bridge routing — the
      // FIRST check inside this block, BEFORE the Phase 17 isBottleReady()
      // gate below, because the bridge bottle has its own dedicated
      // readiness/provisioning path (installBridgeGame -> isBridgeBottleReady
      // / provisionBridgeBottle, 24-04) that must not be blocked by the
      // unrelated Phase 17 GameLibSteam bottle's own state (BLOCKER 1).
      if (this.isBridgeEligible()) {
        return this.installBridgeGame(args)
      }

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

      // D-15/SNI-08 opt-in: depot-download the WINDOWS depot directly into
      // the bottle's OWN steamapps/ filesystem path — the SAME depot.ts
      // mechanism the (non-bottle-eligible) native opt-in branch below uses,
      // just with the write target swapped to the bottle's steamapps dir and
      // os hard-coded 'windows' (bottled Steam is a Windows Steam client,
      // never the host's macOS depot). No Wine dispatch for the download
      // itself — tellBottledSteamToInstall/dispatchToBottledSteam are never
      // called on this path (that mechanism stays reserved for guided
      // setup/launch/uninstall). OFF preserves the legacy
      // tellBottledSteamToInstall dispatch below byte-for-byte (D-13).
      if (isSteamNativeInstallEnabled()) {
        // D-17 (34.13-14): persist the forced verdict ONLY when this specific
        // install was forced (never for a game that was already ordinarily
        // bottle-eligible — that game needs no flag, and writing one would
        // make the cache lie about how it got there) AND the depot download
        // actually completed. installDepotDownload() is the shared engine —
        // "successful" here means it reported status:'done' and finalized
        // the ACF, not merely that it was dispatched.
        const bottleNativeResult = await this.installBottleNative(args)
        if (bottleNativeResult.status === 'done') {
          // debug/steam-bottle-uninstall-reverts: persisted for EVERY
          // committed installBottleNative() completion (not gated on
          // forceWindowsViaBottle like the D-17 flag below) — uninstall()
          // needs to know the bottled Steam client never authored/adopted
          // this manifest regardless of whether this specific install was
          // an explicit override or an ordinary bottle-eligible install.
          if (forceWindowsViaBottle) {
            markForcedWindowsViaBottle(this.appId)
          }
        }
        return bottleNativeResult
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

      // D-17 (34.13-14): persist the forced verdict ONLY when this specific
      // install was forced. "Successful" here means the bottled Steam
      // client ACCEPTED the install dispatch (the WR-01 guard above already
      // returned on rejection) — not that the download has finished. From
      // here the bits are committed to land in the bottle and the
      // bottle-scoped poller below owns the outcome. The fail-safe direction
      // is deliberately asymmetric: a flag set while a download later fails
      // still routes launch()/uninstall() at the bottle where the partial
      // bits actually are (recoverable — Task 3's uninstall path clears it),
      // whereas an unset flag routes at a host Steam client that has
      // nothing (the T-34.13-06-06 defect this plan closes).
      if (forceWindowsViaBottle) {
        markForcedWindowsViaBottle(this.appId)
      }

      // Start bottle-scoped ACF polling (D-07) — the bottle's own steamapps
      // root is distinct from the native root (RESEARCH.md Pitfall 2).
      startInstallPolling(this.appId, { source: 'bottle' })

      return { status: 'done' }
    }

    // D-13 opt-in: route a (non-bottle-eligible) native install through the
    // depot.ts orchestrator instead of the steam://install handoff. Reading
    // the setting is the ONLY new branch condition — OFF preserves today's
    // steam://install path byte-for-byte below (D-13 safety valve). The D-15
    // bottle branch above is Plan 11's scope, not this one.
    if (isSteamNativeInstallEnabled()) {
      return this.installNative(args)
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
  private async installNative(args: InstallArgs): Promise<InstallResult> {
    return this.installDepotDownload(args, { os: hostSteamDepotOs() })
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
   * (StateFlags 1026 -> 4) is reflected in the UI exactly like the legacy
   * tellBottledSteamToInstall path.
   */
  private async installBottleNative(args: InstallArgs): Promise<InstallResult> {
    const targetSteamappsDir = getBottleSteamappsDir(
      getSteamBottleSettings().wineCrossoverBottle
    )
    return this.installDepotDownload(args, {
      targetSteamappsDirOverride: targetSteamappsDir,
      os: 'windows',
      pollerSource: 'bottle'
    })
  }

  /**
   * Phase 24 Plan 08 (R3/R4/R7, D-01): allowlisted-title bridge install
   * path — a sibling of installBottleNative() above, but targeting the
   * DEDICATED bridge bottle (24-04, `GameLibSteamBridge`) instead of the
   * Phase 17 `GameLibSteam` bottle. Reuses the SAME installDepotDownload()
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
   * exe, or shim placement) marks this appId bridge-failed-this-session
   * (finding #3, markBridgeFailedThisSession above) so a later D-05
   * fallback re-invocation of install() reaches the existing bottled path
   * instead of looping back into the same failing bridge (T-24-17).
   */
  private async installBridgeGame(args: InstallArgs): Promise<InstallResult> {
    if (!isBridgeBottleReady()) {
      logInfo(
        `SteamGame: bridge bottle not yet provisioned for appId ${this.appId} — provisioning inline (BLOCKER 1, no consent dialog needed)`,
        LogPrefix.Steam
      )
      const provisionResult = await provisionBridgeBottle()
      if (provisionResult.status !== 'done') {
        logWarning(
          `SteamGame: bridge bottle provisioning failed for appId ${this.appId}: ${provisionResult.error}`,
          LogPrefix.Steam
        )
        markBridgeFailedThisSession(this.appId)
        sendFrontendMessage('steamBridgeSetupRequired', {
          appName: this.appId,
          reason: 'bridge-bottle-provision-failed',
          fallbackAvailable: true
        })
        return { status: 'done', deferredToSetup: true }
      }
    }

    const targetSteamappsDir = getBottleSteamappsDir(
      getBridgeBottleSettings().wineCrossoverBottle
    )
    const downloadResult = await this.installDepotDownload(args, {
      targetSteamappsDirOverride: targetSteamappsDir,
      os: 'windows',
      pollerSource: 'bridge'
    })

    if (downloadResult.status !== 'done') {
      markBridgeFailedThisSession(this.appId)
      return downloadResult
    }

    // R3: place the shim automatically — no manual copy step. Resolves the
    // real installed exe path via resolveBridgeLaunchExe (finding #2)
    // rather than guessing/joining an unverified name.
    const exePath = await resolveBridgeLaunchExe(this.appId)
    if (!exePath) {
      logWarning(
        `SteamGame: installBridgeGame could not resolve a Windows launch executable for appId ${this.appId} — shim not placed`,
        LogPrefix.Steam
      )
      markBridgeFailedThisSession(this.appId)
      sendFrontendMessage('steamBridgeSetupRequired', {
        appName: this.appId,
        reason: 'launch-exe-not-resolved',
        fallbackAvailable: true
      })
      return {
        status: 'error',
        error: `Could not resolve a Windows launch executable for appId ${this.appId}`
      }
    }

    const shimResult = await placeShimForGame(this.appId, exePath)
    if (
      shimResult.status === 'error' ||
      shimResult.status === 'shim-not-built'
    ) {
      const shimError =
        shimResult.status === 'shim-not-built'
          ? 'Bridge shim has not been built yet (packaging step pending)'
          : shimResult.error
      logWarning(
        `SteamGame: installBridgeGame shim placement failed for appId ${this.appId}: ${shimError}`,
        LogPrefix.Steam
      )
      markBridgeFailedThisSession(this.appId)
      return { status: 'error', error: shimError }
    }

    // 24-13 (D-UAT-24-05 wiring, was Rule-2 deviation during Task 3): the
    // `pollerSource: 'bridge'` passed to installDepotDownload above starts a
    // poller that watches the BRIDGE bottle's OWN steamapps root
    // (library.ts's AcfSource now includes 'bridge', 24-12's
    // getBridgeBottleSteamappsRoot()) — previously this was hardcoded to
    // `'bottle'`, which watches the unrelated Phase 17 GameLibSteam bottle
    // and NEVER observes this appId's manifest, so the install would time
    // out / never be reflected. The poller reading the correct bottle is
    // now a genuine (if redundant) completion signal, not dead weight — but
    // the REAL completion signal for the bridge path remains this
    // synchronous flip below: depot download AND shim placement have
    // already both succeeded by this point, so is_installed is set directly
    // (mirrors library.ts's pollInstallOnce() 'installed' branch shape)
    // rather than relying solely on the poller.
    const installRoot = this.resolveBridgeGameInstallRoot(exePath)
    if (installRoot) {
      this.markBridgeGameInstalled(installRoot)
    }

    // D-UAT-24-03 cascade (a): a successful (re)install un-poisons the
    // session so a subsequent isBridgeEligible() check (install OR launch)
    // for this appId routes back to the bridge instead of staying stuck on
    // an earlier recoverable failure.
    clearBridgeFailedThisSession(this.appId)

    return { status: 'done' }
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
  private resolveBridgeGameInstallRoot(exePath: string): string | undefined {
    const bottleName = getBridgeBottleSettings().wineCrossoverBottle
    const commonRoot = resolve(getBottleSteamappsDir(bottleName), 'common')
    const resolvedExePath = resolve(exePath)
    const relFromCommon = relative(commonRoot, resolvedExePath)
    const installdirSegment = relFromCommon.split(sep)[0]

    if (
      !installdirSegment ||
      relFromCommon.startsWith('..') ||
      isAbsolute(relFromCommon)
    ) {
      return undefined
    }

    return join(commonRoot, installdirSegment)
  }

  /**
   * Directly flips is_installed:true for a completed bridge install —
   * mirrors library.ts's pollInstallOnce() 'installed'-branch shape
   * (`{ ...existing, is_installed: true, install: { install_path,
   * install_size, platform } }` + persist + pushGameToLibrary), since the
   * bridge path has no ACF poller that can observe completion (see the
   * deviation note in installBridgeGame above).
   */
  private markBridgeGameInstalled(installPath: string): void {
    const existing = library.get(this.appId)
    if (existing) {
      const updated: GameInfo = {
        ...existing,
        is_installed: true,
        install: {
          install_path: installPath,
          install_size: '',
          platform: 'Windows'
        }
      }
      library.set(this.appId, updated)
      steamLibraryStore.set('games', Array.from(library.values()))
      sendFrontendMessage('pushGameToLibrary', updated)
    }
    sendFrontendMessage('gameStatusUpdate', {
      appName: this.appId,
      runner: 'steam',
      status: 'done'
    })
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
    const existing = library.get(this.appId)
    if (existing) {
      const updated: GameInfo = {
        ...existing,
        is_installed: false,
        install: {}
      }
      library.set(this.appId, updated)
      steamLibraryStore.set('games', Array.from(library.values()))
      sendFrontendMessage('pushGameToLibrary', updated)
    }
    sendFrontendMessage('gameStatusUpdate', {
      appName: this.appId,
      runner: 'steam',
      status: 'done'
    })
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
  private async installDepotDownload(
    args: InstallArgs,
    opts: {
      targetSteamappsDirOverride?: string
      os: string
      pollerSource?: 'bottle' | 'bridge'
    }
  ): Promise<InstallResult> {
    const existing = nativeInstallsInFlight.get(this.appId)
    if (existing) {
      if (!existing.aborted) {
        // T-23-12: a LIVE download is already tracked for this appId — join
        // it rather than starting a second downloadSteamDepots.
        return existing.promise
      }
      // T-23-15: the tracked entry is tearing down after a pause/cancel —
      // wait for it to settle (its finally cleanup deletes the entry) before
      // proceeding to a fresh run below. Never rejects here: the prior run's
      // own rejection (if any) is not this caller's concern.
      await existing.promise.catch(() => undefined)
    }

    const runPromise = this.runNativeDepotDownload(args, opts)
    nativeInstallsInFlight.set(this.appId, {
      promise: runPromise,
      aborted: false
    })
    return runPromise
  }

  /**
   * The actual native depot-download run — split out of installDepotDownload
   * (T-23-12) so its promise can be registered in nativeInstallsInFlight
   * BEFORE its first await, letting a concurrent caller for the same appId
   * join the SAME promise instead of starting a second downloadSteamDepots.
   * Body/contract unchanged from the pre-Phase-23-05 installDepotDownload.
   */
  private async runNativeDepotDownload(
    args: InstallArgs,
    opts: {
      targetSteamappsDirOverride?: string
      os: string
      pollerSource?: 'bottle' | 'bridge'
    }
  ): Promise<InstallResult> {
    const controller = createAbortController(this.appId)
    // [Timing] debug/steam-install-slow-start: top-level breakdown of the
    // ~30s pre-download latency across this seam's three major awaits.
    // Temporary instrumentation, remove once root cause is confirmed.
    const runStart = Date.now()

    try {
      const clientReadyStart = Date.now()
      const clientReady = await ensureSteamClientReady(this.appId) // Plan 10
      logInfo(
        `[Timing] runNativeDepotDownload: ensureSteamClientReady took ${Date.now() - clientReadyStart}ms for appId ${this.appId}`,
        LogPrefix.Steam
      )
      if (controller.signal.aborted) {
        return { status: 'abort' }
      }
      if (!clientReady.ready) {
        return {
          status: 'error',
          error:
            clientReady.error ??
            `Steam client not ready for appId ${this.appId}`
        }
      }

      const resolveTargetStart = Date.now()
      let resolved: Awaited<ReturnType<typeof resolveSteamInstallTarget>>
      try {
        // G-30-02 (30-07): belt-and-suspenders bound around the pre-download
        // resolution PHASE itself — guards against a future un-timed
        // pre-download await that is NOT a CM primitive (those are already
        // bounded individually inside resolveSteamInstallTarget/depot.ts),
        // and guarantees the badge can never hang from this phase. Converted
        // to the returned-error contract 30-05's finally/catch already
        // clears — never let this propagate as an unhandled throw.
        //
        // WR-01: this outer bound is STRICTLY LARGER than any bound inside
        // resolveSteamInstallTarget (fetchInstalldir's per-call
        // STEAM_PICS_TIMEOUT_MS). If it shared the same bound, this outer
        // timer — armed first — would always elapse before fetchInstalldir's
        // inner timer, pre-empting fetchInstalldir's DELIBERATE no-hard-fail
        // fallback (installLocation.ts:130-188: a hung installdir lookup must
        // degrade to a safe fallback dir name, NOT fail the whole install)
        // and converting a recoverable transient CM hang into a fatal
        // "Steam pre-download timed out". A larger outer bound lets the inner
        // graceful fallback always win its own race; the outer only trips on a
        // non-CM await (the belt-and-suspenders case it exists for).
        resolved = await withTimeout(
          resolveSteamInstallTarget(this.appId, args), // Plan 09
          STEAM_PICS_TIMEOUT_MS * 2,
          'resolveSteamInstallTarget'
        )
      } catch (err) {
        logWarning(
          `SteamGame: resolveSteamInstallTarget timed out/failed for appId ${this.appId}: ${String(err)}`,
          LogPrefix.Steam
        )
        return {
          status: 'error',
          error: `Steam pre-download timed out: ${String(err)}`
        }
      }
      logInfo(
        `[Timing] runNativeDepotDownload: resolveSteamInstallTarget took ${Date.now() - resolveTargetStart}ms for appId ${this.appId}`,
        LogPrefix.Steam
      )
      if (controller.signal.aborted) {
        return { status: 'abort' }
      }
      const targetSteamappsDir =
        opts.targetSteamappsDirOverride ?? resolved.targetSteamappsDir

      const downloadStart = Date.now()
      const outcome = await downloadSteamDepots(this.appId, {
        targetSteamappsDir,
        installdir: resolved.installdir,
        os: opts.os,
        signal: controller.signal
      })
      logInfo(
        `[Timing] runNativeDepotDownload: downloadSteamDepots (buildDepotPlan + stream) took ${Date.now() - downloadStart}ms so far for appId ${this.appId} (status=${outcome.status}); total since click ${Date.now() - runStart}ms`,
        LogPrefix.Steam
      )

      if (outcome.status === 'cancelled') {
        // D-UAT-09 (21-17): init()'s startup-surface scan only catches an
        // interrupted install on the NEXT process restart — a same-session
        // cancel (this branch) is never surfaced any other way. Mark the
        // library entry incomplete/resumable now so the frontend never
        // renders a stale is_installed:true/Play for the rest of THIS
        // session (Task 2 reads is_installed + steamResumePending).
        markSteamInstallIncomplete(this.appId)
        return { status: 'abort' }
      }

      if (outcome.status === 'error') {
        logWarning(
          `SteamGame: depot install failed for appId ${this.appId}: ${outcome.error}`,
          LogPrefix.Steam
        )
        return { status: 'error', error: outcome.error }
      }

      // Start ACF polling so Steam's own verify/repair pass (which flips
      // StateFlags 1026 -> 4) is reflected in the UI, same as the legacy
      // steam://install path (D-07) — bottle-scoped when pollerSource is set
      // (Plan 08's distinct bottle steamapps root, D-15).
      //
      // debug/steam-1026-download-restart: isNativeHandoff:true is CORRECT
      // (and ONLY correct) here — this line only runs after downloadSteamDepots
      // has ALREADY finished downloading every depot itself (outcome.status
      // ran past the 'error'/'cancelled' checks above). The 1026 manifest this
      // poll will observe is GameLib's OWN finished-handoff write, genuinely
      // waiting for a Steam restart — never a Steam-driven active download.
      // Do NOT copy this flag to the OFF-path startInstallPolling calls above
      // in install() (steam://install handoff / tellBottledSteamToInstall) —
      // those hand the ENTIRE download off to Steam, so a 1026 seen there is
      // Steam's own ordinary active-download state, not a handoff.
      if (opts.pollerSource) {
        startInstallPolling(this.appId, {
          source: opts.pollerSource,
          isNativeHandoff: true
        })
      } else {
        startInstallPolling(this.appId, { isNativeHandoff: true })
      }

      return { status: 'done' }
    } finally {
      // T-23-13: fail-safe cleanup on success, error, or cancel (including an
      // unhandled throw/rejection) — never leaves this appId permanently
      // blocked from a later re-install.
      nativeInstallsInFlight.delete(this.appId)
      deleteAbortController(this.appId)
    }
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
   * D-11/MAC32 PLATFORM-derived half of the bottle-eligibility verdict —
   * true only for a CONFIRMED not-native macOS game. Split from
   * `isBottleEligible()` below by 34.13-14 so the Phase 24 bridge
   * (`isBridgeEligible()`) can compose ONLY this platform signal and never
   * the D-17 forced verdict (see `isBottleEligible()`'s own doc comment for
   * why). Body is byte-identical to the pre-34.13-14 `isBottleEligible()`.
   */
  private isBottleEligibleFromPlatforms(): boolean {
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
    // Quick task 260816-hdg PIN — this gate deliberately keeps the raw read and
    // must NOT be routed through depotSignalCaptured. It asks the MAC question,
    // which a pre-D-17 residue entry genuinely did answer; narrowing here would
    // de-route bottle-eligible games over a fact already in the cache. A source
    // assertion in metadataCapture.test.ts holds this line in place.
    return meta?.platformsCaptured === true && meta?.is_mac_native === false
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
  private isForcedWindowsViaBottle(): boolean {
    return (
      isMac &&
      steamMetadataStore.get(this.appId)?.forcedWindowsViaBottle === true
    )
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
    return (
      this.isBottleEligibleFromPlatforms() || this.isForcedWindowsViaBottle()
    )
  }

  /**
   * Phase 24 Plan 08 (D-01/D-02, R4): true only for an allowlisted,
   * bottle-eligible title that has NOT already failed the bridge earlier
   * this session (finding #3 — bridgeFailedThisSession, module-scoped
   * above). Composes `isBottleEligible()` exactly the way
   * `isSteamNativeInstallEnabled()` already composes inside the same gate
   * — a third instance of the same in-file pattern, not a new one
   * (24-PATTERNS.md). A non-allowlisted bottle-eligible title is unaffected
   * — it falls through to the existing D-15/D-13 opt-in branches below
   * (regression, R7).
   *
   * D-17 (34.13-14) pin: composes `isBottleEligibleFromPlatforms()`, NOT the
   * widened `isBottleEligible()` wrapper above. A D-17 forced install writes
   * into the Phase 17 `GameLibSteam` bottle; the Phase 24
   * `GameLibSteamBridge` bottle is a SEPARATE filesystem root that has never
   * held those bits. Widening this composition to the forced verdict would
   * swap one broken launch (host Steam client that never had the game) for
   * another (bridge launch resolving nothing in a bottle that was never
   * written to) — not a fix.
   */
  private isBridgeEligible(): boolean {
    return (
      this.isBottleEligibleFromPlatforms() &&
      bridgeAllowlist.has(this.appId) &&
      !bridgeFailedThisSession.has(this.appId)
    )
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
  async checkBottleEligibility(): Promise<boolean> {
    await this.ensurePlatformsCaptured()
    return this.isBottleEligible()
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

    // Quick task 260816-hdg PIN — the FOURTH read site, and the one that stays
    // RAW. Three reasons, all load-bearing:
    //  1. Its only consumer is checkBottleEligibility() -> isBottleEligible(),
    //     which asks the MAC question. A pre-D-17 residue entry genuinely
    //     captured its mac answer, so this early return is answering from real
    //     data, not from a stale claim.
    //  2. Narrowing it would push every residue game through the bounded
    //     METADATA_FETCH_TIMEOUT_MS poll below, on the install/launch hot path,
    //     for a fact the cache already holds.
    //  3. Convergence does not depend on it. getGameInfo()'s normalized
    //     self-heal gate fires the refetch on library render, and until that
    //     lands installFormIpc reports the depot signal as not-captured, which
    //     is exactly what lets Phase 34.14's D-04 fail-open offer Windows. The
    //     install form is correct DURING the window and correct after it.
    // A source assertion in metadataCapture.test.ts holds this line in place.
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
      // Phase 24 Plan 08 (R4/D-01): allowlisted-title bridge routing — the
      // FIRST check inside this block, mirroring install()'s own bridge
      // sub-branch above (BLOCKER 1 rationale: the bridge has its own
      // readiness gate, ensureBridgeHelperReady(), independent of the
      // unrelated Phase 17 GameLibSteam bottle's own state).
      if (this.isBridgeEligible()) {
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

  /**
   * Phase 24 Plan 08 (R4/R6/R7): allowlisted-title bridge launch path. Runs
   * the game's OWN resolved Windows `.exe` (resolveBridgeLaunchExe, Task 1)
   * directly via `runWineCommand` against the dedicated bridge bottle
   * (getBridgeBottleSettings, 24-04) — NEVER `tellBottledSteamToLaunch` /
   * `dispatchToBottledSteam`, since the bridge bottle has no bottled Steam
   * client to `-applaunch` through (RESEARCH Pattern 4's single largest
   * routing-shape delta).
   *
   * Gated on `ensureBridgeHelperReady()` (24-06) FIRST — D-05/D-06: no game
   * is ever launched with no live Steam identity. On EITHER a not-ready
   * helper OR an unresolvable launch target, this marks the appId
   * bridge-failed-this-session (finding #3) and fires
   * `steamBridgeSetupRequired` itself (defensive — never assumes the
   * signal was already fired upstream) before returning `false` — never
   * optimistically flips any running state.
   */
  private async launchBridgeGame(): Promise<boolean> {
    const helperReady = await ensureBridgeHelperReady(this.appId)
    if (!helperReady.ready) {
      logWarning(
        `SteamGame: bridge helper not ready for appId ${this.appId} (status=${helperReady.status}) — not launching (no no-identity launch, D-05/D-06)`,
        LogPrefix.Steam
      )
      markBridgeFailedThisSession(this.appId)
      sendFrontendMessage('steamBridgeSetupRequired', {
        appName: this.appId,
        reason: helperReady.status,
        fallbackAvailable: true
      })
      return false
    }

    const exePath = await resolveBridgeLaunchExe(this.appId)
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
    if (!isBridgeBottleReady() || !existsSync(exePath)) {
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

    logInfo(
      `SteamGame: launching appId ${this.appId} via the Steam bridge (${exePath})`,
      LogPrefix.Steam
    )
    try {
      const { runWineCommand } = await import('backend/launcher')
      await runWineCommand({
        commandParts: [exePath],
        gameSettings: getBridgeBottleSettings(),
        wait: false,
        protonVerb: 'run',
        startFolder: dirname(exePath),
        skipPrefixCheckIKnowWhatImDoing: true
      })
      return true
    } catch (error) {
      logWarning(
        [`SteamGame: bridge launch failed for appId ${this.appId}`, error],
        LogPrefix.Steam
      )
      markBridgeFailedThisSession(this.appId)
      sendFrontendMessage('steamBridgeSetupRequired', {
        appName: this.appId,
        reason: 'bridge-launch-failed',
        fallbackAvailable: true
      })
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
   * Native delegation itself is unchanged: does NOT show a GamerLib
   * confirmation dialog — Steam owns its own confirm dialog (D-05). Install
   * state is never optimistically flipped from a click (D-02); badges flip
   * only after confirmed ACF data. After the URL fires we poll the ACF (D-07)
   * so the badge updates without a focus round-trip; the focus re-read (D-01)
   * remains as a backstop.
   */
  async uninstall(_args: RemoveArgs): Promise<ExecResult> {
    await this.ensurePlatformsCaptured()

    // Phase 24 Plan 08 (R4/D-01): allowlisted-title bridge routing — unaffected
    // by the install_path routing fix below (see this method's own JSDoc).
    if (this.isBridgeEligible()) {
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
   * ONLY the game's own install root inside the DEDICATED bridge bottle
   * (getBridgeBottleSettings, 24-04) — never touches the Phase 17
   * GameLibSteam bottle.
   *
   * Resolves the install root the SAME way installBridgeGame() does
   * (resolveBridgeGameInstallRoot, via resolveBridgeLaunchExe) rather than
   * a second, divergent path-derivation — reuse, not a parallel
   * implementation.
   */
  private async uninstallBridgeGame(): Promise<ExecResult> {
    const exePath = await resolveBridgeLaunchExe(this.appId)
    if (!exePath) {
      logWarning(
        `SteamGame: uninstallBridgeGame could not resolve the bridge install location for appId ${this.appId} — nothing to remove`,
        LogPrefix.Steam
      )
      this.markBridgeGameUninstalled()
      return { stdout: '', stderr: '' }
    }

    const installRoot = this.resolveBridgeGameInstallRoot(exePath)
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

    try {
      rmSync(installRoot, { recursive: true, force: true })
    } catch (error) {
      logWarning(
        [
          `SteamGame: uninstallBridgeGame failed to remove "${installRoot}" for appId ${this.appId}`,
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
      `SteamGame: removed bridge install for appId ${this.appId} at "${installRoot}"`,
      LogPrefix.Steam
    )
    this.markBridgeGameUninstalled()
    return { stdout: '', stderr: '' }
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
   * D-02: real abort for an in-flight native depot download (SNI-07); a safe
   * no-op otherwise. Steam itself still owns the process lifecycle for its
   * games once installed/launched — GamerLib cannot observe or terminate
   * Steam game processes — so the legacy steam:// install path and the
   * bottle path both fall through to the unchanged no-op below. Mirrors
   * downloadqueue.ts's own stopCurrentDownload -> callAbortController(appName)
   * call site. Analog: gog/games.ts lines 1291-1295.
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
