// Phase 21 Plan 09 — real implementation of the resolveSteamInstallTarget /
// listSteamLibraryTargets seam Plan 07 stubbed out.
//
// D-08: a native Steam install must land in an EXISTING Steam-registered
// library folder's steamapps/ — Steam only "adopts" an .acf it discovers
// inside a library it already knows about (libraryfolders.vdf). An override
// path is honoured only when it resolves to exactly one of those registered
// folders; anything else silently falls back to the primary library rather
// than writing into an arbitrary/unregistered location (T-21-17). This module
// never mutates libraryfolders.vdf — it only reads via getSteamLibraries().
//
// D-09: single-library installs see zero friction (no override needed,
// primary is picked automatically); multi-library installs get an override
// picker (frontend, this plan's Task 2) populated from
// listSteamLibraryTargets(), defaulting to the primary library.

import { join, resolve } from 'path'
import type { InstallArgs } from 'common/types'
import { getSteamLibraries } from 'backend/utils'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { SteamUser } from './user'
import { withTimeout, STEAM_PICS_TIMEOUT_MS } from './withTimeout'

/** Numeric-only guard for appId before any PICS lookup (T-21-05 — reused from
 *  games.ts's buildSteamProtocolUrl / bottle.ts's dispatchToBottledSteam). */
const NUMERIC_APP_ID = /^\d+$/

/** Safe fallback installdir prefix used when PICS returns nothing usable, or
 *  when it returns a hostile value (T-21-01). Never derived from unsanitized
 *  input — appId itself is guarded by NUMERIC_APP_ID before it can reach here. */
const FALLBACK_INSTALLDIR_PREFIX = 'app_'

export interface SteamInstallTarget {
  targetSteamappsDir: string
  installdir: string
}

/** One registered Steam library, as surfaced to the frontend override picker
 *  (D-09) and consumed internally by resolveSteamInstallTarget's override
 *  matching. `path` is the library ROOT (getSteamLibraries()'s own return
 *  shape), `steamappsDir` is the actual depot-download target directory. */
export interface SteamLibraryTarget {
  path: string
  steamappsDir: string
  isPrimary: boolean
}

/** Narrow, ADDITIONAL view of PICS appinfo's `config.installdir` field — not
 *  part of depot/select.ts's own SteamAppInfo (which only needs
 *  depots/extended). Widened locally here purely to read the installdir,
 *  mirroring depot.ts's own AppCommonName pattern for `common.name`. */
interface AppInstallDirInfo {
  config?: { installdir?: string }
}

/**
 * Every registered Steam library (getSteamLibraries() — read-side only,
 * libraryfolders.vdf), primary first. Used both by resolveSteamInstallTarget's
 * default/override logic and by the frontend override picker IPC handler.
 */
export async function listSteamLibraryTargets(): Promise<SteamLibraryTarget[]> {
  const libraries = await getSteamLibraries()
  return libraries.map((path, index) => ({
    path,
    steamappsDir: join(path, 'steamapps'),
    isPrimary: index === 0
  }))
}

/**
 * Builds a safe fallback installdir from appId — used both when PICS returns
 * nothing usable AND when appId itself is non-numeric/hostile (T-21-05), so
 * the fallback itself is never a vector even though appId is untrusted input
 * at this point. Strips everything except [a-zA-Z0-9_-] (no `.` survives
 * either, so `..` traversal can never be reconstructed from the leftovers).
 */
function safeFallbackId(appId: string): string {
  const sanitized = appId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return sanitized || 'unknown'
}

/**
 * Positive whitelist for an accepted installdir shape (WR-04, T-21-14-03):
 * letters, digits, spaces, dots, dashes, underscores only — no leading or
 * trailing dot (blocks both a bare `.`/`..` and a hidden-file-style name).
 * Quotes, colons (Windows drive-relative `C:foo`), path separators, and any
 * ASCII control character are all excluded by construction — a candidate
 * containing any of them simply fails this whitelist rather than needing a
 * separate denylist check.
 */
const SAFE_INSTALLDIR = /^[A-Za-z0-9 ._-]+$/
const LEADING_OR_TRAILING_DOT = /^\.|\.$/

/**
 * Sanitizes a PICS-sourced installdir so it is a single safe directory name
 * (T-21-01, hardened WR-04/T-21-14-03) — rejects (not strips) any path
 * separator, `..` traversal segment, quote, colon (Windows drive-relative
 * name), ASCII control character, or any character outside the accepted
 * whitelist outright, since a partially-sanitized value is still an
 * attacker-influenced string about to touch the filesystem AND get
 * interpolated into the `.acf` VDF. depot.ts's own per-file containment
 * check (resolve+relative against steamapps/common/{installdir}) is the
 * backstop; this is the first line of defense on the value that becomes
 * that root segment.
 *
 * Exported for reuse by library.ts's startup-resume path
 * (buildResumeFinalizeOpts, 23-code-review WR-03 gap closure) — that path
 * reads installdir directly off the on-disk ACF (attacker-writable if they
 * can already write into steamapps/) with no equivalent guard of its own;
 * this is the single sanitizer both callers must funnel through so they can
 * never silently diverge on this discipline.
 */
export function sanitizeInstalldir(
  candidate: string | undefined,
  appId: string
): string {
  const fallback = `${FALLBACK_INSTALLDIR_PREFIX}${safeFallbackId(appId)}`
  if (!candidate || !candidate.trim()) {
    return fallback
  }
  const isSafe =
    SAFE_INSTALLDIR.test(candidate) && !LEADING_OR_TRAILING_DOT.test(candidate)
  if (!isSafe) {
    logWarning(
      `SteamGame: rejected hostile PICS installdir "${candidate}" for appId ${appId}, using fallback "${fallback}"`,
      LogPrefix.Steam
    )
    return fallback
  }
  return candidate
}

/**
 * Reads appinfo.config.installdir via PICS over the already-authenticated CM
 * connection (never opens a second logon — T-21-11, same discipline as
 * depot.ts's getDepotClient). Never throws: a missing client, non-numeric
 * appId, or PICS failure all fall back to `undefined`, which
 * sanitizeInstalldir turns into a safe appId-derived name — an install
 * location lookup must not hard-fail the whole install over a cosmetic
 * directory-name mismatch.
 */
async function fetchInstalldir(appId: string): Promise<string | undefined> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `SteamGame: rejected non-numeric appId "${appId}" during install-location resolution`,
      LogPrefix.Steam
    )
    return undefined
  }

  const client = SteamUser.getClient()
  if (!client) {
    // [Timing] debug/steam-install-slow-start: no client yet — this call is a
    // no-op (0ms), so on a cold session this PICS round-trip is NOT paid here.
    return undefined
  }

  // [Timing] debug/steam-install-slow-start: this getProductInfo call is a
  // network round-trip for the SAME appId buildDepotPlan.fetchAppInfo fetches
  // again moments later — candidate redundant PICS call. Temporary
  // instrumentation, remove once root cause is confirmed.
  const start = Date.now()
  try {
    const numericAppId = Number(appId)
    // G-30-02 (30-07): bounded so a stale-but-present CM socket rejects
    // within STEAM_PICS_TIMEOUT_MS instead of parking this await forever —
    // the catch below already turns any reject into a benign `undefined`.
    const { apps } = await withTimeout(
      client.getProductInfo([numericAppId], [], true),
      STEAM_PICS_TIMEOUT_MS,
      'fetchInstalldir getProductInfo'
    )
    const entry = apps?.[numericAppId]
    const appinfo = entry?.appinfo as unknown as AppInstallDirInfo | undefined
    logInfo(
      `[Timing] fetchInstalldir: getProductInfo for appId ${appId} took ${Date.now() - start}ms`,
      LogPrefix.Steam
    )
    return appinfo?.config?.installdir
  } catch (err) {
    logWarning(
      `SteamGame: failed to read PICS installdir for appId ${appId}: ${String(err)}`,
      LogPrefix.Steam
    )
    logInfo(
      `[Timing] fetchInstalldir: getProductInfo for appId ${appId} FAILED after ${Date.now() - start}ms`,
      LogPrefix.Steam
    )
    return undefined
  }
}

/**
 * Resolves an override path (InstallArgs.path) against the registered
 * libraries. D-08: an override is honoured ONLY when path.resolve()'d it
 * matches exactly one registered library's own resolved path — comparison by
 * resolve(), never join()/string-prefix, so a relative-segment trick can't
 * smuggle a match (the Phase 18 "path.join is not containment" lesson applies
 * identically here). An empty/blank override (the byte-for-byte default the
 * legacy single-library call site still sends) or a non-matching override
 * both fall back to the primary library — Steam install targets are NEVER an
 * arbitrary unregistered path, silently or otherwise (T-21-17).
 */
function resolveOverride(
  overridePath: string | undefined,
  libraries: SteamLibraryTarget[]
): SteamLibraryTarget {
  const primary = libraries.find((lib) => lib.isPrimary) ?? libraries[0]
  if (!overridePath || !overridePath.trim()) {
    return primary
  }
  const resolvedOverride = resolve(overridePath)
  const match = libraries.find((lib) => resolve(lib.path) === resolvedOverride)
  if (!match) {
    logWarning(
      `SteamGame: rejected install-path override "${overridePath}" — not a registered Steam library, defaulting to primary library "${primary.path}"`,
      LogPrefix.Steam
    )
    return primary
  }
  return match
}

/**
 * Resolves the steamapps dir + installdir a depot download should target.
 * Replaces Plan 07's first-library stub: default is the primary registered
 * library (D-09 zero-friction), an `args.path` override is honoured only
 * when it matches a registered library (D-08), and installdir is derived
 * from PICS `config.installdir`, sanitized against traversal (T-21-01).
 */
export async function resolveSteamInstallTarget(
  appId: string,
  args: InstallArgs
): Promise<SteamInstallTarget> {
  // [Timing] debug/steam-install-slow-start: total duration of this seam,
  // reported below. Temporary instrumentation.
  const start = Date.now()
  const libraries = await listSteamLibraryTargets()
  if (!libraries.length) {
    throw new Error(
      `resolveSteamInstallTarget: no registered Steam libraries found for appId ${appId}`
    )
  }

  const target = resolveOverride(args?.path, libraries)
  const installdir = sanitizeInstalldir(await fetchInstalldir(appId), appId)

  logInfo(
    `[Timing] resolveSteamInstallTarget: total ${Date.now() - start}ms for appId ${appId}`,
    LogPrefix.Steam
  )

  return { targetSteamappsDir: target.steamappsDir, installdir }
}
