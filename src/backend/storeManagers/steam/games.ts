import axios from 'axios'
import i18next from 'i18next'
import { app, shell } from 'backend/platform'
import { existsSync } from 'graceful-fs'
import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeSync
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
  EnviromentVariable,
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
import { notify, showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { newDialogAckId, trackDialogDisplay } from 'backend/dialog/displayAck'
import { getFileSize, sendGameStatusUpdate } from 'backend/utils'
import type LogWriter from 'backend/logger/log_writer'
import { GameConfig } from 'backend/game_config'
import {
  isMac,
  isLinux,
  isAppleSiliconMac
} from 'backend/constants/environment'
import {
  createAbortController,
  callAbortController,
  deleteAbortController
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
import { knownFixSaysMac32, seedMacArchFromKnownFix } from './macArchKnownFix'
import { knownFixSaysCeg } from './drmKnownFix'
import { resolvePlatformWrite } from './platformPrecedence'
import {
  library,
  pendingFetches,
  acquireMetadataSlot,
  releaseMetadataSlot,
  METADATA_FETCH_TIMEOUT_MS
} from './state'
import {
  startInstallPolling,
  stopInstallPolling,
  startUninstallPolling,
  resumeInterruptedSteamInstall,
  markSteamInstallIncomplete,
  markSteamNativeInstallStarted,
  clearSteamResumeBreadcrumb,
  readAcfState,
  pollUninstallOnce,
  resolveInstallRoot,
  findOtherManifestsWithInstalldir,
  removeSteamInstallCopy,
  STEAM_BRIDGE_FINISHING_CONTEXT
} from './library'
import {
  probeMacSteamPid,
  readAcfSnapshot,
  recordPendingAdoption,
  readPendingAdoption,
  clearPendingAdoption,
  decidePlayAdoption,
  restartMacSteamForAdoption
} from './macSteamAdoption'
import {
  isBottleReady,
  tellBottledSteamToInstall,
  tellBottledSteamToLaunch,
  getSteamBottleSettings,
  getBottleSteamappsDir,
  getBottleDir,
  isBridgeBottleReady,
  getBridgeBottleSettings,
  provisionBridgeBottle,
  bridgeBottleNameFor,
  removePerGameBridgeBottle,
  stopPerGameBridgeBottle,
  findBridgeInstallBottle,
  isCrossoverInstalled,
  CROSSOVER_MISSING,
  getDrmBridgeRunner,
  type DrmLaunchForm
} from './bottle'
import { isSteamNativeInstallEnabled } from './nativeInstallSetting'
import { noteSteamAuthTrigger } from './authTrigger'
// quick-260817-d61: verified during planning that user.ts imports nothing
// from games.ts (no import of './games' anywhere in user.ts), so this
// introduces no cycle. Used ONLY by getExtraInfo()'s fire-and-forget
// locked->unlocked transition below — install()/update()/launch() only need
// noteSteamAuthTrigger, not SteamUser itself.
import { SteamUser, type AuthSessionRefusal } from './user'
import { downloadSteamDepots, prescreenBridgeDepots } from './depot'
import { ensureSteamClientReady } from './clientSetup' // Plan 10 seam
import {
  resolveSteamInstallTarget,
  UnsafeInstalldirError
} from './installLocation' // Plan 09 seam
import { classifyDepotError } from './depotErrors'
import { withTimeout, STEAM_PICS_TIMEOUT_MS } from './withTimeout'
// Phase 24 Plan 08 (R4/R7): allowlist-based bridge-vs-fallback routing.
import { bridgeAllowlist } from './bridge/allowlist'
import { placeShimForGame } from './bridge/shimGenerate'
import { detectLaunchDrmWrapper } from './bridge/drm/drmScanExe'
import { detectSteamDrmInPe } from './bridge/peSteamDrm'
import {
  drmLaunchSetup,
  prefetchDrmDownloads,
  type DrmLaunchReady
} from './bridge/drm/drmLaunchSetup'
import {
  resolveBridgeMode,
  formatDrmNoticeLine,
  formatBridgeDrmAnchor,
  drmStepError,
  type DrmStep
} from './bridge/drm/steamclientLayerMode'
import {
  DRM_TRACE_ENV,
  MAX_DRM_TRACE_BYTES,
  parseDrmTraceFile,
  formatDrmTraceLine,
  drmRelogPrefix
} from './bridge/drm/drmTrace'
import { buildDrmPaths, newDrmLaunchId } from './bridge/drm/drmPaths'
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
import {
  resolveBridgeRoute,
  NOTICE_REASONS,
  type BridgeRouteInput
} from './bridge/bridgeRoute'
import {
  readBridgeVerdict,
  writeBridgeScanVerdict,
  clearBridgeScanVerdict,
  setBridgeSteamApiPrescreen,
  setBridgeUserRoute,
  markBridgeLimitedNoticeShown,
  setBridgeIdentityFallback,
  writeBridgeDrmVerdict
} from './bridge/bridgeVerdict'
import { isScanVerdictNowCovered } from './bridge/shimCoverage'
import {
  builtBridgeShim64Path,
  appFolder,
  userHome
} from 'backend/constants/paths'
import type { SteamBridgeRouteVerdict } from 'common/types/steam'

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
 * quick 261024-urq: appId -> the bridge bottle a live bridge launch was fired
 * into. The single source `SteamGame.stop()` consults to detect the bridge
 * route: the process monitor alone is insufficient (none starts when the
 * install root is unresolved, and it does not carry the bottle name). The
 * value is an object so a late settlement of an earlier launch can tell its
 * own record from a superseding relaunch's (identity compare). Cleared when
 * the game ends on its own, when the launch fails, and by stop().
 */
const bridgeLaunchBottles = new Map<string, { bottle: string }>()

/**
 * Test-only reset for bridgeLaunchBottles — mirrors
 * `__resetBridgeFailedSessionForTests()`'s convention below. Call in a
 * `beforeEach` so one test's recorded bridge launch cannot make a later
 * test's stop() take the bridge branch.
 */
export function __resetBridgeLaunchBottlesForTests(): void {
  bridgeLaunchBottles.clear()
}

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
 * Quick task 260905-luf (D-01): appIds for which `getGameInfo()`'s double
 * cache miss (both the in-memory `library` Map AND the persisted
 * `steamLibraryStore` missed) has already been logged THIS PROCESS.
 * `getGameInfo()` runs on every library render, so an ungated warning would
 * flood `gamelib.log` on a cold boot with a large, not-yet-hydrated
 * library (T-luf-02). Session-scoped only, per appId — a later miss for a
 * DIFFERENT appId still warns.
 */
const loggedEmptyGameInfoMisses = new Set<string>()

/**
 * Test-only reset for loggedEmptyGameInfoMisses — mirrors
 * `__resetBridgeFailedSessionForTests()`'s convention above. Unit tests that
 * deliberately drive the double-miss branch for a reused appId must call
 * this (in a `beforeEach`) so one test's miss does not silence the warning
 * for a later test asserting the same appId still warns.
 */
export function __resetLoggedEmptyGameInfoMissesForTests(): void {
  loggedEmptyGameInfoMisses.clear()
}

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

// Phase 56 (56-12): steamclient-layer DRM launch helpers.
//
// These helpers are pure, or touch only GameLib's own trace dir. None of them
// throws, and nothing runs at module load (sidecar exit contract).

// ts-prune-ignore-next
export type DrmDllPathChannel = 'env' | 'cx_env' | 'not-needed' | 'raw-only'
// ts-prune-ignore-next
export type DrmDllOverridesChannel =
  | 'env'
  | 'dll-option'
  | 'cx_env'
  | 'registry'
  | 'raw-only'

// 56-01-SUMMARY.md (.planning/phases/56-*/56-01-SUMMARY.md) records `dllpath_channel: not-needed`.
// ts-prune-ignore-next
export const DRM_DLLPATH_CHANNEL: DrmDllPathChannel = 'not-needed'
// 56-01-SUMMARY.md records `dlloverrides_channel: dll-option`: carried as the wrapper's `--dll=<overrides>` argv.
// ts-prune-ignore-next
export const DRM_DLLOVERRIDES_CHANNEL: DrmDllOverridesChannel = 'dll-option'

// The Research staging recipe (NotProton compat_run.sh). The genuine
// steamclient64.dll loads native from its full SteamClientDll64 path, and
// lsteamclient loads builtin from the clone.
// ts-prune-ignore-next
export const DRM_DLL_OVERRIDES = 'steamclient=n;steamclient64=n;lsteamclient=b'

// ts-prune-ignore-next
export const DRM_TRACE_KEEP_PER_APP = 8
// ts-prune-ignore-next
export const DRM_REGISTRY_TIMEOUT_MS = 30000
// lsteamclient.so dlopens $STEAM_COMPAT_CLIENT_INSTALL_PATH/steamclient.dylib
// (spike 043 step 2).
// ts-prune-ignore-next
export const MAC_STEAM_CLIENT_SUBPATH = [
  'Library',
  'Application Support',
  'Steam',
  'Steam.AppBundle',
  'Steam',
  'Contents',
  'MacOS'
] as const

// ts-prune-ignore-next
export type DrmLaunchEnvInput = {
  appId: string
  traceFile: string
  macSteamClientDir: string
  steamDirHost: string
  windowsDllDir: string
  unixDllDir: string
  launchForm: DrmLaunchForm
  dllPathChannel: DrmDllPathChannel
  dllOverridesChannel: DrmDllOverridesChannel
  base: readonly EnviromentVariable[]
}
// ts-prune-ignore-next
export type DrmLaunchEnv =
  | {
      status: 'ok'
      enviromentOptions: EnviromentVariable[]
      commandPrefix: string[]
      registryCommands: string[][]
    }
  | { status: 'error'; cause: string }

// eslint-disable-next-line no-control-regex
const DRM_CONTROL_CHARS = /[\x00-\x1f\x7f]/

// ts-prune-ignore-next
export function buildDrmLaunchEnvironment(
  input: DrmLaunchEnvInput
): DrmLaunchEnv {
  try {
    const invalid = (field: string): DrmLaunchEnv => ({
      status: 'error',
      cause: `invalid DRM launch input: ${field}`
    })
    if (typeof input.appId !== 'string' || !/^[0-9]{1,10}$/.test(input.appId)) {
      return invalid('appId')
    }
    const pathFields = [
      'traceFile',
      'macSteamClientDir',
      'steamDirHost',
      'windowsDllDir',
      'unixDllDir'
    ] as const
    for (const field of pathFields) {
      const value = input[field]
      if (
        typeof value !== 'string' ||
        !value.startsWith('/') ||
        DRM_CONTROL_CHARS.test(value)
      ) {
        return invalid(field)
      }
    }
    for (const field of ['steamDirHost', 'windowsDllDir', 'unixDllDir']) {
      if (input[field as 'steamDirHost'].includes(':')) return invalid(field)
    }

    const raw = input.launchForm === 'raw WINELOADER+WINEPREFIX'
    let pathChannel = input.dllPathChannel
    let overridesChannel = input.dllOverridesChannel
    if (pathChannel === 'raw-only') {
      if (!raw) {
        return {
          status: 'error',
          cause: 'channel raw-only needs the raw launch form'
        }
      }
      pathChannel = 'env'
    }
    if (overridesChannel === 'raw-only') {
      if (!raw) {
        return {
          status: 'error',
          cause: 'channel raw-only needs the raw launch form'
        }
      }
      overridesChannel = 'env'
    }

    let env: EnviromentVariable[] = input.base.map((e) => ({ ...e }))
    const getKey = (key: string): string | undefined =>
      env.find((e) => e.key.toLowerCase() === key.toLowerCase())?.value
    const setKey = (key: string, value: string) => {
      env = env.filter((e) => e.key.toLowerCase() !== key.toLowerCase())
      env.push({ key, value })
    }

    setKey(DRM_TRACE_ENV, input.traceFile)
    setKey('SteamGameId', input.appId)
    setKey('SteamAppId', input.appId)
    setKey('STEAM_COMPAT_CLIENT_INSTALL_PATH', input.macSteamClientDir)

    const drmPath = [
      input.steamDirHost,
      input.windowsDllDir,
      input.unixDllDir
    ].join(':')
    const commandPrefix: string[] = []
    const registryCommands: string[][] = []
    const cxTokens: string[] = []

    if (overridesChannel === 'env') {
      const existing = getKey('WINEDLLOVERRIDES') ?? ''
      const ours = new Set(['steamclient', 'steamclient64', 'lsteamclient'])
      const kept: string[] = []
      for (const item of existing.split(';')) {
        if (!item) continue
        const eq = item.indexOf('=')
        const names = (eq === -1 ? item : item.slice(0, eq))
          .split(',')
          .filter((n) => n && !ours.has(n.toLowerCase()))
        if (names.length === 0) continue
        kept.push(
          eq === -1
            ? names.join(',')
            : `${names.join(',')}=${item.slice(eq + 1)}`
        )
      }
      setKey('WINEDLLOVERRIDES', [...kept, DRM_DLL_OVERRIDES].join(';'))
    } else if (overridesChannel === 'dll-option') {
      // 56-01-SUMMARY.md 56-12 item: "Carry steamclient=n;steamclient64=n;lsteamclient=b
      // through the `--dll=<overrides>` option (argv, so `bin/wine --dll=...`)".
      commandPrefix.push('--dll=' + DRM_DLL_OVERRIDES)
    } else if (overridesChannel === 'registry') {
      for (const [name, mode] of [
        ['steamclient', 'native'],
        ['steamclient64', 'native'],
        ['lsteamclient', 'builtin']
      ]) {
        registryCommands.push([
          'reg',
          'add',
          'HKEY_CURRENT_USER\\Software\\Wine\\DllOverrides',
          '/v',
          name,
          '/d',
          mode,
          '/f'
        ])
      }
    } else if (overridesChannel === 'cx_env') {
      cxTokens.push(`WINEDLLOVERRIDES='${DRM_DLL_OVERRIDES}'`)
    }

    if (pathChannel === 'env') {
      const existing = getKey('WINEDLLPATH')
      setKey('WINEDLLPATH', existing ? `${drmPath}:${existing}` : drmPath)
    } else if (pathChannel === 'cx_env') {
      cxTokens.push(`WINEDLLPATH='${drmPath}'`)
    }

    if (cxTokens.length > 0) {
      if (cxTokens.some((t) => t.slice(t.indexOf("'") + 1, -1).includes("'"))) {
        return invalid('CX_ENV value')
      }
      const existing = getKey('CX_ENV')
      const joined = cxTokens.join(' ')
      setKey('CX_ENV', existing ? `${existing} ${joined}` : joined)
    }

    return {
      status: 'ok',
      enviromentOptions: env,
      commandPrefix,
      registryCommands
    }
  } catch (error) {
    return {
      status: 'error',
      cause: `invalid DRM launch input: ${String(error)}`
    }
  }
}

/**
 * The helper passes this string verbatim to CreateProcessW (56-03), so it is
 * the game's C:\ path, never the Z: mapping.
 */
// ts-prune-ignore-next
export function drmBottleWinPath(
  bottleDir: string,
  hostPath: string
): string | null {
  if (
    typeof bottleDir !== 'string' ||
    typeof hostPath !== 'string' ||
    DRM_CONTROL_CHARS.test(bottleDir) ||
    DRM_CONTROL_CHARS.test(hostPath)
  ) {
    return null
  }
  const driveC = resolve(bottleDir, 'drive_c')
  const rel = relative(driveC, resolve(hostPath))
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return 'C:\\' + rel.split(sep).join('\\')
}

/** `<id>.log` -> `<id>.wine.log`: the wine child's output beside its trace. */
// ts-prune-ignore-next
export function drmWineLogPathFor(traceFile: string): string {
  return traceFile.replace(/\.log$/, '.wine.log')
}

/** GAMELIB_DRM_WINEDEBUG allowlist (T-56-20-01); anything else is ignored. */
// ts-prune-ignore-next
export function drmWineDebugFromEnv(
  value: string | undefined
): string | undefined {
  return value !== undefined && /^[A-Za-z0-9_+\-,.]{1,200}$/.test(value)
    ? value
    : undefined
}

/** Synchronous, size-capped (T-56-20-02), 0600 append sink for the wine log. */
// ts-prune-ignore-next
export function createDrmWineLogAppender(
  path: string,
  maxBytes: number = 8 * 1024 * 1024
): { write: (chunk: string) => void; close: () => void } {
  let fd: number | null = null
  let written = 0
  let truncated = false
  try {
    fd = openSync(path, 'a', 0o600)
  } catch (error) {
    logWarning(
      `SteamGame: DRM wine log unavailable: ${String(error)}`,
      LogPrefix.Steam
    )
  }
  return {
    write: (chunk: string) => {
      if (fd === null || truncated) return
      try {
        const buf = Buffer.from(chunk, 'utf8')
        if (written + buf.length > maxBytes) {
          const room = Math.max(0, maxBytes - written)
          if (room > 0) writeSync(fd, buf, 0, room)
          writeSync(fd, `\n[gamelib] wine log truncated at ${maxBytes} bytes\n`)
          written = maxBytes
          truncated = true
          return
        }
        writeSync(fd, buf)
        written += buf.length
      } catch {
        truncated = true
      }
    },
    close: () => {
      if (fd === null) return
      try {
        closeSync(fd)
      } catch {
        // nothing to clean up
      }
      fd = null
    }
  }
}

// ts-prune-ignore-next
export function prepareDrmTraceFile(
  appFolderPath: string,
  appId: string,
  now: number = Date.now()
):
  | { status: 'ok'; traceFile: string; traceRoot: string }
  | { status: 'error'; cause: string } {
  try {
    const paths = buildDrmPaths(appFolderPath)
    if (!paths)
      return { status: 'error', cause: 'invalid app folder for DRM trace' }
    mkdirSync(paths.traceRoot, { recursive: true, mode: 0o700 })
    if (!lstatSync(paths.traceRoot).isDirectory()) {
      return {
        status: 'error',
        cause: 'trace dir is a symlink or not a directory'
      }
    }
    chmodSync(paths.traceRoot, 0o700)
    const traceFile = paths.traceFile(appId, newDrmLaunchId(now))
    if (!traceFile)
      return { status: 'error', cause: 'invalid DRM trace file name' }

    try {
      // Group `<id>.log` and `<id>.wine.log` by id so orphan wine logs (the
      // game died before writing a trace) are pruned too (CR-03). The
      // `.stage.wine.log` suffix cannot match: `.stage` follows the digits.
      const re = new RegExp(`^${appId}-([0-9]{1,16})(\\.wine)?\\.log$`)
      const byId = new Map<number, string[]>()
      for (const name of readdirSync(paths.traceRoot)) {
        const m = re.exec(name)
        if (!m) continue
        const st = lstatSync(join(paths.traceRoot, name), {
          throwIfNoEntry: false
        })
        if (!st || !st.isFile()) continue
        const id = Number(m[1])
        const names = byId.get(id)
        if (names) names.push(name)
        else byId.set(id, [name])
      }
      const ids = [...byId.keys()].sort((a, b) => b - a)
      for (const id of ids.slice(DRM_TRACE_KEEP_PER_APP - 1)) {
        for (const name of byId.get(id) ?? []) {
          try {
            unlinkSync(join(paths.traceRoot, name))
          } catch (error) {
            logWarning(
              `SteamGame: DRM log removal failed for ${name}: ${String(error)}`,
              LogPrefix.Steam
            )
          }
        }
      }
    } catch (error) {
      logWarning(
        `SteamGame: DRM trace retention failed for appId ${appId}: ${String(error)}`,
        LogPrefix.Steam
      )
    }
    return { status: 'ok', traceFile, traceRoot: paths.traceRoot }
  } catch (error) {
    return { status: 'error', cause: String(error) }
  }
}

// ts-prune-ignore-next
export function relogDrmTrace(
  appId: string,
  traceFile: string
):
  | { status: 'relogged'; events: number; rejected: number }
  | { status: 'missing' | 'refused' | 'oversize' | 'error'; detail: string } {
  const notRelogged = (
    status: 'missing' | 'refused' | 'oversize' | 'error',
    detail: string
  ) => {
    logInfo(
      `SteamGame: DRM trace for appId ${appId} not relogged (${status}: ${detail})`,
      LogPrefix.Steam
    )
    return { status, detail } as const
  }
  try {
    const st = lstatSync(traceFile, { throwIfNoEntry: false })
    if (!st) return notRelogged('missing', 'no trace file')
    if (!st.isFile()) return notRelogged('refused', 'not a regular file')
    if (st.size > MAX_DRM_TRACE_BYTES) {
      return notRelogged('oversize', `${st.size} bytes`)
    }
    const parsed = parseDrmTraceFile(readFileSync(traceFile, 'utf8'), appId)
    if (parsed.status === 'oversize')
      return notRelogged('oversize', 'text too large')
    for (const ev of parsed.events) {
      logInfo(drmRelogPrefix(appId) + formatDrmTraceLine(ev), LogPrefix.Steam)
    }
    logInfo(
      `SteamGame: DRM trace for appId ${appId} relogged events=${parsed.events.length} rejected=${parsed.rejected}`,
      LogPrefix.Steam
    )
    return {
      status: 'relogged',
      events: parsed.events.length,
      rejected: parsed.rejected
    }
  } catch (error) {
    return notRelogged('error', String(error))
  }
}

// D-13 (56-12): the [bridge-notice] log line fires on every attempt; the dialog
// and notify fire once per title and failed step per session. A different
// failed step is new information, so it shows again. Keyed `${appId}|${step}`.
const drmModeNoticeShownThisSession = new Set<string>()

type DrmWineLaunch = {
  ready: DrmLaunchReady
  gameWinPath: string
  traceFile: string
  anchorLine: string
  macSteamClientDir: string
  // Test seam for the registry-channel branch; defaults to buildDrmLaunchEnvironment.
  buildEnv?: (input: DrmLaunchEnvInput) => DrmLaunchEnv
}

function drmStepNoticeText(step: DrmStep): string {
  switch (step) {
    case 'steam-not-running':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.steamNotRunning',
        'Mac Steam is not running, and this game needs it. Open Steam, sign in, then press Play again.'
      )
    case 'unsupported-crossover':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.unsupportedCrossover',
        'This game needs a version of CrossOver that GameLib supports. The details name the version you have and the versions GameLib supports.'
      )
    case 'component-missing':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.componentMissing',
        'GameLib could not download the compatibility component this game needs. Check your internet connection, then press Play again.'
      )
    case 'component-verify':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.componentVerify',
        'The compatibility component GameLib downloaded failed its integrity check, so GameLib did not use it.'
      )
    case 'runner-clone':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.runnerClone',
        'GameLib could not prepare its own copy of CrossOver for this game.'
      )
    case 'runner-patch':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.runnerPatch',
        "GameLib could not prepare its own copy of CrossOver for this game, because CrossOver's files did not match what GameLib expects."
      )
    case 'valve-fetch':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.valveFetch',
        'GameLib could not download the Steam client files this game needs from Valve. Check your internet connection, then press Play again.'
      )
    case 'valve-verify':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.valveVerify',
        'The Steam client files downloaded from Valve failed their integrity check, so GameLib did not use them.'
      )
    case 'bottle-stage':
      return i18next.t(
        'gamelib:steam.bridge.drm.step.bottleStage',
        "GameLib could not prepare this game's bottle to run it with its Steam DRM."
      )
    default: {
      const unreachable: never = step
      return String(unreachable)
    }
  }
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
  private async fetchMetadataIfNeeded(current: GameInfo): Promise<void> {
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
        ...(existingMeta?.bridge ? { bridge: existingMeta.bridge } : {})
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
  async install(args: InstallArgs): Promise<InstallResult> {
    // quick-260817-d61: Install is a deliberate Steam action — unlock the
    // keyring deferral gate as the first statement, before anything else in
    // this method runs.
    noteSteamAuthTrigger('user-install')
    // D-51-07: auto-clear a stale persisted scan-miss before any routing
    // decision below reads it — the top of install(), before the resume
    // check, so a bridge route taken later in this same call already sees
    // the cleared state.
    this.clearStaleBridgeVerdict()
    // steam-startup-resume-crash (2026-07-18) / D-04 softened: a
    // startup-detected interrupted install is surfaced (steamResumePending)
    // but never auto-driven — the user's own Install click IS the resume
    // trigger. Run the honest verify-and-finalize pass first (fast: sha1-
    // reconciles what's already on disk and only reports genuine gaps, it
    // never itself re-downloads — see resumeInterruptedSteamInstall), then
    // fall through into the normal install flow below, which will pick up
    // and complete anything the reconcile pass left as a gap. A failure here
    // must never block the real install attempt beneath it (hardening).
    //
    // 260821-rb5 (Rule 1 fix, found writing this quick task): the same flag
    // is now ALSO set at install START (markSteamNativeInstallStarted,
    // runNativeDepotDownload) for the case-C crash-survival breadcrumb, so
    // steamResumePending can be true while a native download is genuinely
    // still LIVE for this appId — e.g. a second install() call joining the
    // T-23-12 single-flight guard, or a real double-click. Without the
    // isNativeInstallInFlight guard here, that live call would misread its
    // OWN in-flight download as "a leftover from a previous session" and run
    // resumeInterruptedSteamInstall's locate/finalize pass concurrently with
    // it — the same live-install-owns-this-appId rule init()'s startup
    // surfacing loop already applies.
    if (
      library.get(this.appId)?.install?.steamResumePending &&
      !isNativeInstallInFlight(this.appId)
    ) {
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
      // quick 261024-cjq (todo no-crossover-notice): a missing CrossOver is a
      // PRECONDITION failure, not a bridge failure. It must NOT call
      // markBridgeFailedThisSession: that flips resolveBridgeRoute to
      // 'failed-this-session' and silently reroutes the next Install to
      // bottled Steam, which needs the same CrossOver. Bottled Steam is a
      // narrow fallback and is never the answer to a missing engine.
      if (isMac && !(await isCrossoverInstalled())) {
        logWarning(
          `SteamGame: CrossOver is not installed — install of appId ${this.appId} stopped (precondition, not a bridge failure)`,
          LogPrefix.Steam
        )
        return this.crossoverRequiredError()
      }

      // quick-260821-le0: remove a leftover unrunnable native i386 install
      // BEFORE anything else in this branch runs — HOARD proved a demoted
      // title can be bridge-eligible AND hold a native orphan at the same
      // time, so this must precede the isBridgeEligible() check below.
      await this.removeDemotedNativeOrphan()

      // Phase 24 Plan 08 (R4/D-01): allowlisted-title bridge routing — the
      // FIRST check inside this block, BEFORE the Phase 17 isBottleReady()
      // gate below, because the bridge bottle has its own dedicated
      // readiness/provisioning path (installBridgeGame -> isBridgeBottleReady
      // / provisionBridgeBottle, 24-04) that must not be blocked by the
      // unrelated Phase 17 GameLibSteam bottle's own state (BLOCKER 1).
      // D-51-08/11/13 (Plan 13): compute the composed route ONCE and act on
      // it, rather than re-deriving eligibility via isBridgeEligible() alone
      // -- a route whose noticeRequired is true (bottle: drm-wrapped
      // known-bad/win64-no-shim; bridge: a non-DRM known-bad title or a
      // persisted scan-miss, both informational, per the D-51-08 amendments
      // of 2026-10-23 (og0, oq7); unless already acknowledged for that same
      // reason) must pause for the user's explicit in-app
      // choice BEFORE any bottled-Steam dispatch or bridge install below
      // runs. A bridge-route notice is informational: the bridge is still
      // attempted once the user proceeds. Mirrors the
      // steamBottleSetupRequired deferral immediately below so the
      // DownloadManager clears the transient 'installing' badge the same
      // way -- nothing is installed and no ACF poller starts on this path.
      let bridgeRoute = this.bridgeRoute()

      // 51-REVIEW WR-08: launch() and uninstall() route by LOCATION, but the
      // widened pending-scan default routes every non-seed bottle-eligible
      // title to the bridge by ELIGIBILITY. A title whose partial bits
      // already live in the Phase 17 GameLibSteam bottle (the native-download
      // breadcrumb of an interrupted pre-upgrade install that the resume
      // pass above just ran against) would otherwise be downloaded a second
      // time into a fresh bridge bottle, orphaning the first copy. Keep the
      // bottled path for it. The user's own "Try the bridge anyway" choice is
      // the one exception: an explicit choice is honoured.
      if (
        bridgeRoute.route === 'bridge' &&
        bridgeRoute.reason !== 'user-forced-bridge' &&
        this.hasBottledSteamCopy()
      ) {
        logInfo(
          `SteamGame: appId ${this.appId} already has bits in the GameLibSteam bottle -- keeping the bottled install path instead of starting a second download into a bridge bottle (51-REVIEW WR-08)`,
          LogPrefix.Steam
        )
        bridgeRoute = { ...bridgeRoute, route: 'bottle', noticeRequired: false }
      }

      // D-51-06 (Plan 17): the cheap pre-install screen ROADMAP sub-decision
      // 2 left open -- measured by research as NOT free (a second, separate
      // buildDepotPlan call), so it only runs for a title that would
      // otherwise land on 'pending-scan' with no steamApi screened yet (a
      // title already carrying a steamApi value -- even one that itself
      // still resolves to 'pending-scan', e.g. a screened x64 title with the
      // shim present -- has already paid this cost once and must not pay it
      // again). A screen failure ('unknown') never blocks the install --
      // depot.ts's prescreenBridgeDepots itself never throws.
      if (
        bridgeRoute.route === 'bridge' &&
        bridgeRoute.reason === 'pending-scan' &&
        readBridgeVerdict(this.appId)?.steamApi === undefined
      ) {
        const bridgeBottleName = bridgeBottleNameFor(this.appId)
        // Phase 54: a short lease for the screen alone, so a refusal here
        // stops before a second wrap attempt in installBridgeGame.
        const prescreenLease = await SteamUser.acquireAuthenticated({
          reason: 'prescreen',
          guidedAction: 'install',
          appName: this.appId,
          installPath: args.path,
          forceWindowsViaBottle: args.steamForceWindowsViaBottle
        })
        if (!prescreenLease.ok) {
          return this.installResultForRefusal(prescreenLease.reason)
        }
        try {
          const prescreenResult = await prescreenBridgeDepots(this.appId, {
            targetSteamappsDir: bridgeBottleName
              ? getBottleSteamappsDir(bridgeBottleName)
              : '',
            installdir: this.appId,
            os: 'windows'
          })
          setBridgeSteamApiPrescreen(this.appId, prescreenResult)
        } finally {
          prescreenLease.release()
        }
        bridgeRoute = this.bridgeRoute()
      }

      if (
        bridgeRoute.route !== 'not-eligible' &&
        bridgeRoute.noticeRequired &&
        bridgeRoute.reason !== null
      ) {
        // Bridge rows 8-11 can only owe a known-bad notice; bridge row 7
        // carries 'scan-miss' (quick 261023-oq7). Anything outside the
        // notice vocabulary is a known-bad notice.
        const noticeReason = NOTICE_REASONS.has(bridgeRoute.reason)
          ? bridgeRoute.reason
          : 'known-bad'
        logInfo(
          `SteamGame: appId ${this.appId} ${bridgeRoute.route} route (${noticeReason}) requires a user notice before any install -- deferring to the in-app dialog`,
          LogPrefix.Steam
        )
        sendFrontendMessage('steamBridgeRouteNotice', {
          appName: this.appId,
          reason: noticeReason,
          knownBadReason: bridgeRoute.knownBadReason,
          missingSymbols: bridgeRoute.missingSymbols,
          route: bridgeRoute.route,
          userRoute: bridgeRoute.userRoute
        })
        return { status: 'done', deferredToSetup: true }
      }

      if (bridgeRoute.route === 'bridge') {
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
        if (
          bottleNativeResult.status === 'done' &&
          !bottleNativeResult.deferredToSetup
        ) {
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
      // quick 261024-exo: the bottled Steam client owns this download, so the
      // poller waits for its manifest well past the 60 s non-delegated grace.
      startInstallPolling(this.appId, {
        source: 'bottle',
        delegatedToSteamClient: true
      })

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
    // quick 261024-exo: delegatedToSteamClient keeps the poll alive through
    // Steam's startup/self-update and the user's install dialog (a failed
    // dispatch never reaches here, so no poller means no false installing).
    startInstallPolling(this.appId, { delegatedToSteamClient: true })

    return { status: 'done' }
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
  private async removeDemotedNativeOrphan(): Promise<void> {
    try {
      if (!isAppleSiliconMac) {
        return
      }

      if (steamMetadataStore.get(this.appId)?.mac_arch !== '32') {
        return
      }

      const nativeState = await readAcfState(this.appId, 'native')
      if (nativeState.state !== 'installed') {
        return
      }

      const result = await removeSteamInstallCopy(this.appId, 'native')
      logInfo(
        `SteamGame: removeDemotedNativeOrphan removed appId ${this.appId}'s native install (result: ${result.status})`,
        LogPrefix.Steam
      )

      await pollUninstallOnce(this.appId, 'native')
    } catch (error) {
      logWarning(
        [
          `SteamGame: removeDemotedNativeOrphan failed for appId ${this.appId}, continuing with install:`,
          error
        ],
        LogPrefix.Steam
      )
    }
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
  private hasBottledSteamCopy(): boolean {
    const breadcrumb = library.get(this.appId)?.install
      ?.steamResumeTargetSteamappsDir
    if (typeof breadcrumb !== 'string' || breadcrumb === '') {
      return false
    }
    const steamappsDir = getBottleSteamappsDir(
      getSteamBottleSettings().wineCrossoverBottle
    )
    return resolve(breadcrumb) === resolve(steamappsDir)
  }

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
  private crossoverRequiredError(): InstallResult {
    return {
      status: 'error',
      error: i18next.t(
        'gamelib:steam.install.crossoverRequired',
        'CrossOver is required to install Windows games on macOS. Install it from codeweavers.com, then try again.'
      )
    }
  }

  private async installBridgeGame(args: InstallArgs): Promise<InstallResult> {
    // quick/261016-u1w (D-A): new installs ALWAYS target this game's OWN
    // per-game bridge bottle directly — never via resolveBridgeBottleName
    // (D-B), which would let an existing legacy-bottle manifest for this
    // appId redirect a fresh install back into the shared bottle.
    const bridgeBottleName = bridgeBottleNameFor(this.appId)
    if (!bridgeBottleName) {
      logWarning(
        `SteamGame: installBridgeGame rejected non-numeric appId ${this.appId} — no per-game bottle name`,
        LogPrefix.Steam
      )
      markBridgeFailedThisSession(this.appId)
      return {
        status: 'error',
        error: `Invalid appId: "${this.appId}"`
      }
    }

    if (!isBridgeBottleReady(bridgeBottleName)) {
      logInfo(
        `SteamGame: bridge bottle "${bridgeBottleName}" not yet provisioned for appId ${this.appId} — provisioning inline (BLOCKER 1, no consent dialog needed)`,
        LogPrefix.Steam
      )
      const provisionResult = await provisionBridgeBottle({
        bottleName: bridgeBottleName
      })
      if (provisionResult.errorCode === CROSSOVER_MISSING) {
        // Race with the install() gate: CrossOver vanished in between. Still a
        // precondition failure — never marks the bridge failed.
        logWarning(
          `SteamGame: CrossOver missing while provisioning the bridge bottle for appId ${this.appId}`,
          LogPrefix.Steam
        )
        return this.crossoverRequiredError()
      }
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

    // Phase 54: one lease from the download through shim placement and the
    // install-time shared-redist step. Provisioning above holds none.
    const lease = await SteamUser.acquireAuthenticated({
      reason: 'user-install',
      guidedAction: 'install',
      appName: this.appId,
      installPath: args.path,
      forceWindowsViaBottle: args.steamForceWindowsViaBottle
    })
    if (!lease.ok) {
      return this.installResultForRefusal(lease.reason)
    }
    // Quick 261029-exu: the bridge poller no longer sends 'done' when the
    // manifest lands, so a path that stops after the download (CEG, shim
    // failure, a throw) must clear the "finishing" status itself.
    const clearFinishing = () =>
      sendGameStatusUpdate({
        appName: this.appId,
        runner: 'steam',
        status: 'done'
      })
    try {
      const result = await this.installBridgeGameLeased(args, bridgeBottleName)
      if (result.status === 'error') clearFinishing()
      return result
    } catch (error) {
      clearFinishing()
      throw error
    } finally {
      lease.release()
    }
  }

  /** The lease-held part of installBridgeGame: download, shim, redists. */
  private async installBridgeGameLeased(
    args: InstallArgs,
    bridgeBottleName: string
  ): Promise<InstallResult> {
    const targetSteamappsDir = getBottleSteamappsDir(bridgeBottleName)
    const downloadResult = await this.installDepotDownload(args, {
      targetSteamappsDirOverride: targetSteamappsDir,
      os: 'windows',
      pollerSource: 'bridge'
    })

    // A refusal wrapped by the go-offline step, or (quick 261027-tot) a
    // Steam client that is not installed / never launched, reports `done`
    // with deferredToSetup: a dialog owns the next step, nothing was
    // downloaded, and it is not a bridge failure.
    if (downloadResult.deferredToSetup) return downloadResult

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

    const shimResult = await placeShimForGame(this.appId, exePath, {
      bottleName: bridgeBottleName,
      gameInstallRoot:
        this.resolveBridgeGameInstallRoot(exePath, bridgeBottleName) ??
        undefined
    })
    // Phase 51 Plan 07 (fix during integration, Rule 1): placeShimForGame
    // returns typed statuses rather than throwing. 'no-steam-api' is
    // deliberately NOT a failure here -- nothing needed placing. Amended
    // 2026-10-23 (quick 261023-oq7, user: "Place shim anyway"): a coverage
    // miss is 'placed-miss' -- the shim WAS placed -- and falls through to
    // the success path below (verdict persisted, install completes). It is
    // no longer a failure here.
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

      // Phase 51 Plan 09 (D-51-05/D-51-11), Task 3: a win64 'shim-not-built'
      // (no 64-bit shim was ever built to try) is a dead end for the bits
      // already downloaded into the per-game bridge bottle -- re-download
      // through the proven Phase 17 bottled path is the chosen fallback
      // (D-51-05: move, not re-download, was rejected), so the per-game
      // bottle is deleted rather than left holding orphaned bits a later
      // retry would never reuse. Amended 2026-10-23 (quick 261023-oq7):
      // this applies to win64-no-shim ONLY; an import-scan miss no longer
      // takes this path. A plain 'shim-not-built' with no x64 arch
      // (packaging step pending) and a bare 'error' keep the pre-51-09
      // behavior below unchanged.
      const isWin64NoShim =
        shimResult.status === 'shim-not-built' && shimResult.arch === 'x64'
      if (isWin64NoShim) {
        const missingSymbols = ['steam_api64.dll']
        // The forced "Try the bridge anyway" attempt (D-51-11) is spent --
        // clearing userRoute lets a later install() fall through to its
        // ordinary route instead of re-forcing the bridge into the same
        // dead end.
        setBridgeUserRoute(this.appId, undefined)
        // 51-REVIEW WR-07: persist the arch so the resolver's win64-no-shim
        // row short-circuits the next install(). Without it the session-only
        // circuit breaker is the sole memory of this dead end, and every new
        // session re-downloads the full game into a bridge bottle only to
        // delete it again. The row is gated on win64ShimPresent, so a later
        // build that bundles steam_api64.dll is not held back by this.
        setBridgeSteamApiPrescreen(this.appId, 'x64')
        stopInstallPolling(this.appId)
        const removeResult = await removePerGameBridgeBottle(this.appId)
        if (removeResult.status === 'error') {
          logWarning(
            `SteamGame: installBridgeGame could not remove the per-game bridge bottle for appId ${this.appId} after a win64-no-shim: ${removeResult.error}`,
            LogPrefix.Steam
          )
        }
        markBridgeFailedThisSession(this.appId)
        sendFrontendMessage('steamBridgeSetupRequired', {
          appName: this.appId,
          reason: 'win64-no-shim',
          missingSymbols,
          fallbackAvailable: true
        })
        return { status: 'error', error: shimError }
      }

      markBridgeFailedThisSession(this.appId)
      return { status: 'error', error: shimError }
    }

    // Phase 51 Plan 09 (D-51-06/D-51-07), Task 3: persist the scan verdict
    // produced by THIS placement for every status that carries one --
    // 'placed' and 'no-steam-api' both do, 'already-placed' (a byte-
    // identical no-op) does not and leaves whatever was already persisted
    // untouched, mirroring launchBridgeGame()'s identical truthy check.
    // 'placed-miss' (quick 261023-oq7) also carries one: the miss verdict is
    // persisted so the resolver keeps routing the title with its symbols. The
    // user's explicit 'bridge' choice (D-51-11) is NOT cleared here -- that
    // clear existed so a forced bridge would not be re-forced into a failing
    // miss, and a miss is no longer a failure.
    if (shimResult.verdict) {
      writeBridgeScanVerdict(this.appId, shimResult.verdict)
    }

    // Quick 261024-br4: Steam CEG DRM (XCOM 200510's silent ~30s exit). A
    // CEG exe asks the Windows Steam client for a per-user build key, and a
    // bridge bottle has no Windows Steam client -- so it can never run here.
    // DRM is the one justified route into bottled Steam (a narrow fallback).
    // Mirrors the win64-no-shim dead end above: the downloaded bits are
    // orphaned (D-51-05: the fallback re-downloads, nothing is moved), so
    // the per-game bridge bottle is removed. userRoute is NOT cleared: by
    // construction it is not 'bridge' here, and a forced 'bridge' proceeds.
    const cegMarkers = this.persistBridgeDrmSignal(
      shimResult.drm,
      'installBridgeGame'
    )
    if (cegMarkers) {
      logWarning(
        `SteamGame: installBridgeGame found Steam CEG DRM in the exe for appId ${this.appId} (${cegMarkers.join(', ')}) -- CEG needs the Windows Steam client, which a bridge bottle does not have; stopping the bridge install`,
        LogPrefix.Steam
      )
      stopInstallPolling(this.appId)
      const removeResult = await removePerGameBridgeBottle(this.appId)
      if (removeResult.status === 'error') {
        logWarning(
          `SteamGame: installBridgeGame could not remove the per-game bridge bottle for appId ${this.appId} after detecting Steam CEG DRM: ${removeResult.error}`,
          LogPrefix.Steam
        )
      }
      markBridgeFailedThisSession(this.appId)
      sendFrontendMessage('steamBridgeSetupRequired', {
        appName: this.appId,
        reason: 'drm-wrapped',
        fallbackAvailable: true
      })
      return {
        status: 'error',
        error: `Steam CEG DRM detected (${cegMarkers.join(', ')}): this game needs the Windows Steam client`
      }
    }

    if (shimResult.status === 'placed-miss') {
      logWarning(
        `SteamGame: installBridgeGame shim coverage miss for appId ${this.appId}: ${shimResult.verdict.missingSymbols.join(', ')} -- shim placed anyway; a static-import miss is expected to fail at load with a Windows entry-point error`,
        LogPrefix.Steam
      )
    }
    this.reconcileBridgePrescreen(shimResult)

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
    const installRoot = this.resolveBridgeGameInstallRoot(
      exePath,
      bridgeBottleName
    )
    if (installRoot) {
      this.markBridgeGameInstalled(installRoot)
    }

    // D-UAT-24-03 cascade (a): a successful (re)install un-poisons the
    // session so a subsequent isBridgeEligible() check (install OR launch)
    // for this appId routes back to the bridge instead of staying stuck on
    // an earlier recoverable failure.
    clearBridgeFailedThisSession(this.appId)

    // Plan 05 decision: the Steamworks shared redists download under THIS
    // install's logon, so Play never needs one. Never fails the install.
    const { installSteamBridgeSharedRedists } =
      await import('./bridge/sharedRedistInstall')
    // The download queue suppresses Steam's own 'done', and on the bridge the
    // ACF poller leaves completion to this method (quick 261029-exu), so the
    // final update below is the only status that clears a lingering 'redist'
    // or 'drm-setup' (56-16 Gap 3) and ends the "finishing" state.
    const sendFinishing = () =>
      sendGameStatusUpdate({
        appName: this.appId,
        runner: 'steam',
        status: 'installing',
        context: STEAM_BRIDGE_FINISHING_CONTEXT
      })
    sendFinishing()
    try {
      await installSteamBridgeSharedRedists(
        this.appId,
        getBridgeBottleSettings(this.appId),
        undefined,
        { allowLogon: true }
      ).catch((error: unknown) => {
        logWarning(
          `SteamGame: install-time shared redist step failed for appId ${this.appId}: ${String(error)}`,
          LogPrefix.Steam
        )
      })
      // Quick 261029-e2t: fetch DRM mode's runner and Valve client now, so
      // the first Play only stages the bottle. Never fails the install.
      sendFinishing()
      await this.prefetchBridgeDrmDownloads(exePath, bridgeBottleName).catch(
        (error: unknown) => {
          logWarning(
            `SteamGame: install-time DRM prefetch failed for appId ${this.appId}: ${String(error)}`,
            LogPrefix.Steam
          )
        }
      )
    } finally {
      sendGameStatusUpdate({
        appName: this.appId,
        runner: 'steam',
        status: 'done'
      })
      // GAME-02's one completion toast; the bridge poller skips it.
      notify({
        title: this.getGameInfo().title,
        body: i18next.t('notify.install.finished', 'Installation Finished')
      })
    }

    return { status: 'done' }
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
  private persistBridgeDrmSignal(
    drm: { kind: 'ceg'; markers: string[] } | null | undefined,
    caller: 'installBridgeGame' | 'launchBridgeGame'
  ): string[] | null {
    if (drm === undefined) return null
    writeBridgeDrmVerdict(this.appId, drm ? 'ceg' : undefined)
    if (drm?.kind !== 'ceg') return null
    if (readBridgeVerdict(this.appId)?.userRoute === 'bridge') {
      logWarning(
        `SteamGame: ${caller} found Steam CEG DRM for appId ${this.appId} (${drm.markers.join(', ')}) but the user forced the bridge -- continuing`,
        LogPrefix.Steam
      )
      return null
    }
    return drm.markers
  }

  private reconcileBridgePrescreen(shimResult: {
    status: string
    verdict?: { arch: 'x86' | 'x64' }
  }): void {
    const current = readBridgeVerdict(this.appId)?.steamApi
    if (shimResult.status === 'no-steam-api') {
      if (
        current === undefined ||
        current === 'none' ||
        current === 'unknown'
      ) {
        setBridgeSteamApiPrescreen(this.appId, 'none')
      }
      return
    }
    if (
      (shimResult.status === 'placed' ||
        shimResult.status === 'placed-miss' ||
        shimResult.status === 'already-placed') &&
      shimResult.verdict &&
      current === 'none'
    ) {
      setBridgeSteamApiPrescreen(this.appId, shimResult.verdict.arch)
    }
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
  private resolveBridgeGameInstallRoot(
    exePath: string,
    bottleNameOverride?: string
  ): string | undefined {
    // quick/261016-u1w (D-B threading): a fresh install already knows
    // EXACTLY which bottle it just placed files into (installBridgeGame's
    // own bridgeBottleName, via bridgeBottleNameFor -- D-A) and passes it
    // straight through here, bypassing the resolver entirely so this stays
    // consistent with the install it just performed. Without an override
    // (the uninstall path), fall back to resolving THIS game's bottle via
    // getBridgeBottleSettings (per-game if ready, else the legacy shared
    // bottle if that's actually where its manifest lives).
    const bottleName =
      bottleNameOverride ??
      getBridgeBottleSettings(this.appId).wineCrossoverBottle
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
    // Quick 261029-mbi: no 'done' here. The install keeps going (shared
    // redists, DRM prefetch) and installBridgeGame sends the one final 'done';
    // an early one cleared "Finishing install…" and showed Play for a moment.
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
        // quick 261027-tot: a missing / never-launched Steam client is a
        // precondition, not a failure. ensureSteamClientReady already sent
        // steamClientSetupRequired, so the guided-setup consent UI is up.
        // Defer (same contract as the bottle-not-provisioned diversion,
        // 261024-cjq) so the queue records no finished-error entry and no
        // "Installation Failed" dialog covers that UI. A reported `error`
        // (e.g. a non-numeric appId, T-21-05) is a real error and stays one.
        if (
          clientReady.error === undefined &&
          (clientReady.status === 'needs-install' ||
            clientReady.status === 'needs-launch')
        ) {
          logInfo(
            `SteamGame: appId ${this.appId} Steam client not ready (${clientReady.status}) — guided setup requested, deferring install`,
            LogPrefix.Steam
          )
          return { status: 'done', deferredToSetup: true }
        }
        return {
          status: 'error',
          error:
            clientReady.error ??
            `Steam client not ready for appId ${this.appId}`
        }
      }

      // Filled by runNativeDepotDownloadLeased on the native Mac route only.
      const deferredPoll: {
        handoff?: { manifestPath: string; skippedDepots: string[] }
      } = {}
      // Phase 54: one authenticated lease for the whole install run, taken
      // BEFORE resolveSteamInstallTarget (so the installdir fallback sees an
      // open session for gated apps) and BEFORE the crash breadcrumb (so a
      // refused install leaves no residue record). Released in finally on
      // every exit path, including abort.
      const lease = await SteamUser.acquireAuthenticated({
        reason: 'user-install',
        guidedAction: 'install',
        appName: this.appId,
        installPath: args.path,
        forceWindowsViaBottle: args.steamForceWindowsViaBottle
      })
      if (!lease.ok) {
        return this.installResultForRefusal(lease.reason)
      }
      let leasedResult: InstallResult
      try {
        leasedResult = await this.runNativeDepotDownloadLeased(
          args,
          opts,
          controller,
          runStart,
          deferredPoll
        )
      } finally {
        lease.release()
      }

      // Quick 261029-ji2: native Mac route. `steam://install` only opens
      // Steam's install dialog (needs a click), so it is no longer fired.
      // A RUNNING Mac Steam never notices the ACF GameLib wrote, but a Steam
      // that starts afterwards adopts it. If Steam is running now, remember
      // its PID so Play can restart it once (macSteamAdoption.ts); if not, the
      // next Steam start adopts it and any stale record is dropped. This is
      // the ONLY place a pending-adoption record is written: GameLib's own
      // depot download finished here (the lease is released first so the
      // go-offline wrap is restored). Steam-performed installs (steam-client,
      // bottle, bridge, pollerSource) never reach this branch.
      if (deferredPoll.handoff && leasedResult.status === 'done') {
        const handoff = deferredPoll.handoff
        const pid = await probeMacSteamPid().catch(() => null)
        if (pid !== null) {
          const baseline = readAcfSnapshot(handoff.manifestPath)
          if (baseline) {
            recordPendingAdoption(this.appId, {
              steamPid: pid,
              manifestPath: handoff.manifestPath,
              baseline,
              recordedAt: Date.now()
            })
            logInfo(
              `SteamGame: recorded pending Steam adoption for ${this.appId} (steam_osx pid ${pid})`,
              LogPrefix.Steam
            )
          } else {
            logWarning(
              `SteamGame: no manifest at ${handoff.manifestPath}; not recording pending adoption for ${this.appId}`,
              LogPrefix.Steam
            )
          }
        } else {
          clearPendingAdoption(this.appId)
        }
        startInstallPolling(this.appId, {
          isNativeHandoff: true,
          skippedDepots: handoff.skippedDepots,
          macNativeRoute: true
        })
      }
      return leasedResult
    } finally {
      // T-23-13: fail-safe cleanup on success, error, or cancel (including an
      // unhandled throw/rejection) — never leaves this appId permanently
      // blocked from a later re-install.
      nativeInstallsInFlight.delete(this.appId)
      deleteAbortController(this.appId)
    }
  }

  /**
   * Phase 54: maps a refused authenticated acquire to an install result. A
   * go-offline refusal means the guided dialog owns the next step (the install
   * did not fail), so it returns the same deferredToSetup contract the bridge
   * route notice uses. Every other refusal carries the fixed not-signed-in copy.
   */
  private installResultForRefusal(reason: AuthSessionRefusal): InstallResult {
    if (reason === 'go-offline-required') {
      logInfo(
        `SteamGame: appId ${this.appId} install waiting on the guided Go Offline step, no logon issued`,
        LogPrefix.Steam
      )
      return { status: 'done', deferredToSetup: true }
    }
    logWarning(
      `SteamGame: appId ${this.appId} install refused, no authenticated Steam session (${reason})`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: classifyDepotError(
        new Error(
          `downloadSteamDepots: no authenticated Steam CM connection available for appId ${this.appId}`
        )
      ).message
    }
  }

  /**
   * The body of runNativeDepotDownload that needs the authenticated lease:
   * target resolution, crash breadcrumb, depot download, polling. The caller
   * owns the lease and the in-flight registry cleanup.
   */
  private async runNativeDepotDownloadLeased(
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
      // T-37-01/T-37-03: an UnsafeInstalldirError is a security abort, not
      // a timeout/CM failure — checked FIRST so it never gets mislabeled
      // "timed out".
      //
      // 37-REVIEW C-01: this path must call `classifyDepotError` ITSELF.
      // The abort is raised by `resolveSteamInstallTarget`, i.e. BEFORE the
      // depot download starts, so it never reaches depot.ts's classifier
      // call sites. Returning `err.message` directly leaked the raw,
      // untrusted PICS-sourced installdir candidate into the install-failure
      // dialog. The raw candidate must surface ONLY in the log line below.
      if (err instanceof UnsafeInstalldirError) {
        logWarning(
          `SteamGame: rejected unsafe PICS installdir for appId ${this.appId}: ${err.message}`,
          LogPrefix.Steam
        )
        return {
          status: 'error',
          error: classifyDepotError(err).message
        }
      }
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
    // D-04 (second half): not an error — PICS returned no usable
    // installdir, so resolveSteamInstallTarget already fell back to
    // `app_<id>`. Logged once here (rather than left to silently
    // disappear after this seam) and propagated onto the { status: 'done' }
    // result below so a caller/UI can surface the non-portable layout.
    if (resolved.installdirFallbackUsed) {
      logWarning(
        `SteamGame: appId ${this.appId} installed to fallback directory "${resolved.installdir}" (PICS installdir was absent/unresolved)`,
        LogPrefix.Steam
      )
    }
    if (controller.signal.aborted) {
      return { status: 'abort' }
    }
    const targetSteamappsDir =
      opts.targetSteamappsDirOverride ?? resolved.targetSteamappsDir

    // 260821-rb5: persist a crash-surviving breadcrumb BEFORE the
    // downloadSteamDepots await below — this ordering IS the fix. A hard
    // kill (kill -9, crash, power loss) from this point on runs no JS at
    // all, so no appmanifest_*.acf is ever written (case C of
    // .planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md);
    // this breadcrumb is the ONLY record of the residue that survives.
    // Must stay synchronous and above the await.
    markSteamNativeInstallStarted(this.appId, {
      targetSteamappsDir,
      installdir: resolved.installdir
    })

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
      // 37-02 (D-06/D-07): forward the classifier's structured affordance
      // untouched — never re-classify here. The pre-download error returns
      // above (clientReady.error, the resolve-target catch) deliberately
      // carry no errorAction: undefined means "no specific affordance".
      return {
        status: 'error',
        error: outcome.error,
        errorAction: outcome.errorAction
      }
    }

    // 260821-rb5: downloadSteamDepots has finished and written its own
    // manifest at this point, so the ACF-derived path
    // (scanDownloadingAppIds) now covers this appId — the breadcrumb has
    // served its purpose, and keeping it would double-surface. Clear it
    // BEFORE polling starts. The 'cancelled' and 'error' branches above
    // deliberately do NOT clear it — a cancelled or errored run leaves
    // residue too (markSteamInstallIncomplete's 'cancelled' spread
    // already preserves the breadcrumb fields).
    clearSteamResumeBreadcrumb(this.appId)

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
    //
    // 23.2-04 (D-06/D-07): thread outcome.skippedDepots through the same
    // way, and for the same reason — meaningful only on the native path,
    // because it comes from GameLib's own downloadSteamDepots run above.
    // The OFF-path calls in install() have no skipped-depot knowledge
    // (Steam owns those downloads) and must NOT receive it.
    if (opts.pollerSource) {
      startInstallPolling(this.appId, {
        source: opts.pollerSource,
        isNativeHandoff: true,
        skippedDepots: outcome.skippedDepots ?? []
      })
    } else if (isMac) {
      // Quick 261029-ji2: native Mac route. The poll starts in the caller
      // after the Steam PID is recorded (runNativeDepotDownload).
      deferredPoll.handoff = {
        manifestPath: join(targetSteamappsDir, `appmanifest_${this.appId}.acf`),
        skippedDepots: outcome.skippedDepots ?? []
      }
    } else {
      startInstallPolling(this.appId, {
        isNativeHandoff: true,
        skippedDepots: outcome.skippedDepots ?? []
      })
    }

    return {
      status: 'done',
      ...(resolved.installdirFallbackUsed
        ? { installdirFallbackUsed: true as const }
        : {})
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
    // NEVER yields '32', so this branch fires from Plan 18-03's post-install
    // Mach-O ground-truth check, or from a curated known-fix macArch "32" seed
    // on Apple silicon (macArchKnownFix.ts, quick 261027-bqe).
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
  private assembleBridgeRouteInput(): BridgeRouteInput {
    return {
      platformsBottleEligible: this.isBottleEligibleFromPlatforms(),
      isSeed: bridgeAllowlist.has(this.appId),
      // `?? null`: bridgeAllowlist.knownBadReason's own contract already
      // returns `null` for "no match", but this coerces any other falsy
      // read (e.g. a test double that returns undefined) to the same
      // not-known-bad default resolveBridgeRoute's `!== null` check needs.
      knownBadReason: bridgeAllowlist.knownBadReason(this.appId) ?? null,
      // quick 261027-gtd: curated known-fix drm "ceg" is a pre-download drm-wrapped signal.
      knownFixDrm: knownFixSaysCeg(this.appId) ? 'ceg' : null,
      verdict: readBridgeVerdict(this.appId),
      failedThisSession: bridgeFailedThisSession.has(this.appId),
      win64ShimPresent: existsSync(builtBridgeShim64Path)
    }
  }

  /**
   * D-51-07: the single routing read for this appId. `resolveBridgeRoute()`
   * is a pure function (bridgeRoute.ts) — this method is the sole place in
   * games.ts that assembles its input and calls it.
   */
  private bridgeRoute(): SteamBridgeRouteVerdict {
    return resolveBridgeRoute(this.assembleBridgeRouteInput())
  }

  /**
   * D-51-09: the backend-authoritative bridge-route read, exposed over IPC
   * by the exported `getBridgeRouteVerdict()` below (51-13's actual IPC
   * surface) — the `checkBottleEligibility()` precedent for a second
   * resolver. Forces platform capture first for the same reason
   * `checkBottleEligibility()` does: a cold metadata cache must never read
   * as a routing answer.
   */
  async checkBridgeRoute(): Promise<SteamBridgeRouteVerdict> {
    await this.ensurePlatformsCaptured()
    return this.bridgeRoute()
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
    return this.bridgeRoute().route === 'bridge'
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
  private clearStaleBridgeVerdict(): void {
    const verdict = readBridgeVerdict(this.appId)
    const scan = verdict?.scan
    if (scan?.status === 'miss' && isScanVerdictNowCovered(scan)) {
      clearBridgeScanVerdict(this.appId)
      logInfo(
        `SteamGame: appId ${this.appId} — bridge verdict auto-cleared (D-51-07), the current shim now covers: ${scan.missingSymbols.join(', ')}`,
        LogPrefix.Steam
      )
    }
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

    // quick 261027-bqe: seed a curated macArch "32" BEFORE any caller consults
    // isBottleEligible(), above the alreadyCaptured early return below.
    seedMacArchFromKnownFix(this.appId)

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
  private async prefetchBridgeDrmDownloads(
    exePath: string,
    bridgeBottleName: string
  ): Promise<void> {
    const { drmWrapper, drmExe } = await detectLaunchDrmWrapper(
      getBottleDir(bridgeBottleName),
      exePath
    )
    if (drmWrapper !== 'steamstub') return
    await prefetchDrmDownloads({
      appId: this.appId,
      appFolder,
      drmWrapper,
      cegMarkers: this.readLaunchExeCegMarkers(drmExe)
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
    return this.fireBridgeWineLaunch(exePath, ready.bottleSettings, {
      ready,
      gameWinPath,
      traceFile: trace.traceFile,
      anchorLine,
      macSteamClientDir
    })
  }

  private async launchBridgeGame(): Promise<boolean> {
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
    const hadDrmRunner = getDrmBridgeRunner(this.appId) !== undefined
    const wantsDrm =
      resolveBridgeMode(launchDrmWrapper, launchCegMarkers) ===
      'steamclient-layer'
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
    } else if (drm.status === 'error') {
      // D-13: no markBridgeFailedThisSession, no steamBridgeSetupRequired, no
      // bottled Steam. drmLaunchSetup's fail() sends the terminal 'done' when
      // it sent 'drm-setup' progress: the Steam launch is dispatched by
      // dispatchSteamLaunch (steamFlowRegistration.ts) and never reaches
      // launcher.ts's 'done' (IN-01, D-05).
      this.maybeNotifyDrmModeFailed(drm.step, drm.cause)
      return false
    } else {
      const launched = await this.launchDrmModeGame(
        exePath,
        drmInstallRoot as string,
        drm
      )
      if (!launched && drm.progressSent) {
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
      return launched
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
      return this.fireBridgeWineLaunch(exePath, bridgeBottleSettings)
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
    return this.fireBridgeWineLaunch(exePath, bridgeBottleSettings)
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
    drm?: DrmWineLaunch
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

    try {
      const { runWineCommand } = await import('backend/launcher')
      const { startBottleProcessMonitor } =
        await import('./bottleProcessMonitor')
      const { applySteamBridgeKnownFixes } = await import('./bridgeKnownFixes')
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
          base: launchSettings.enviromentOptions ?? []
        })
        if (env.status === 'error') {
          this.maybeNotifyDrmModeFailed(
            'bottle-stage',
            drmStepError('bottle-stage', env.cause).cause
          )
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
            return false
          }
        }
      }

      let handle: ReturnType<typeof startBottleProcessMonitor> = null
      if (installRoot) {
        handle = startBottleProcessMonitor({
          appId: this.appId,
          installPath: installRoot,
          bottleDir: getBottleDir(bridgeBottleSettings.wineCrossoverBottle),
          kind: 'bridge',
          onStopped: () => {
            clearLaunchRecord()
            stopBridgeHelper(this.appId)
            relogOnce()
          }
        })
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
      const winePromise = runWineCommand({
        commandParts: drm
          ? [
              ...drmCommandPrefix,
              drm.ready.bottle.helperWinPath,
              drm.gameWinPath
            ]
          : [exePath],
        gameSettings: launchSettings,
        wait: false,
        protonVerb: 'run',
        startFolder: launchCwd,
        skipPrefixCheckIKnowWhatImDoing: true,
        ...(wineLog
          ? { options: { onOutput: (chunk: string) => wineLog.write(chunk) } }
          : {})
      })
      void winePromise.finally(() => wineLog?.close()).catch(() => undefined)
      void winePromise.then(
        () => {
          // With a monitor, its onStopped clears the record when the game is
          // gone; the launcher process exiting says nothing about the game.
          if (!handle) {
            clearLaunchRecord()
            relogOnce()
          }
          handle?.launcherExited()
        },
        (error: unknown) => {
          clearLaunchRecord()
          relogOnce()
          reportLaunchFailure(error)
          handle?.launcherExited()
        }
      )

      return true
    } catch (error) {
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
   * Native delegation itself is unchanged: does NOT show a GamerLib
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
