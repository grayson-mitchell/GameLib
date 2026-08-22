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

import { isAbsolute, join, relative, resolve } from 'path'
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
  /** D-04 (second half): true when PICS returned no usable `config.installdir`
   *  (absent or blank) and sanitizeInstalldir's branch 1 fallback fired — the
   *  install lands in `app_<id>` rather than a human-readable directory name.
   *  Not an error (the install itself proceeds normally); surfaced so the
   *  caller can log/report the non-portable layout once, rather than the
   *  fact silently disappearing after this seam. Omitted (not `false`) when
   *  the PICS-supplied name was used as-is. */
  installdirFallbackUsed?: boolean
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
 * Thrown when a PICS/ACF-sourced installdir either matches the narrow
 * denylist below or, once resolved against the install root, escapes it
 * (D-02/D-04 — a security event, not a fallback trigger). The message
 * always names the rejected candidate VERBATIM and always contains the word
 * "traversal", so depotErrors.ts's existing `/traversal/i` classifier
 * branch renders it as "The download contained an unsafe file path and was
 * stopped." with no change to that module. The message deliberately never
 * includes the RESOLVED absolute path (T-21-14 — never surface an internal
 * path to the user), only the untrusted candidate string itself.
 */
export class UnsafeInstalldirError extends Error {}

/**
 * Narrow explicit denylist (D-02, defense in depth — the containment check
 * below is the property actually wanted): path separators, a `..` segment,
 * a leading or trailing dot, and any ASCII control character. Two entries
 * are kept BEYOND D-02's literal four-item list, both zero-cost against
 * real Steam installdirs and both closing a documented attack vector the
 * deleted positive-whitelist predecessor of this function used to cover:
 *   - `:` — a Windows drive-relative candidate (`C:foo`) contains no
 *     separator and, on this dev/CI platform's POSIX path.resolve, would
 *     pass the containment check cleanly (a bare "C:foo" segment is just a
 *     literal child of the root here). On a REAL Windows deployment,
 *     path.win32.resolve's drive-relative handling is exactly the escape
 *     T-21-14-03 named. Steam itself never emits a colon in a real
 *     installdir (this phase's own measurement), so rejecting it costs
 *     nothing.
 *   - `"` — a literal quote could otherwise reach depot/manifest.ts's ACF
 *     writer; that writer already has its own `vdfEscape` (backslash+quote
 *     escaping) as the authoritative defense, so this is redundant-by-design
 *     defense in depth, kept because two independent tests (WR-04) already
 *     pinned it and Steam never emits a quote in a real installdir either.
 *
 * The old positive character-class whitelist this replaces excluded both of
 * these plus ordinary punctuation like the apostrophe — REQ-37-06's defect.
 */
const INSTALLDIR_DENYLIST =
  /[/\\]|\.\.|^\.|\.$|[\x00-\x1F\x7F]|:|"/ // eslint-disable-line no-control-regex

/**
 * Sanitizes a PICS/ACF-sourced installdir (T-21-01, D-02/D-03/D-04).
 * Acceptability is decided by CONTAINMENT against the resolved install
 * root — resolve the candidate against `steamapps/common` and verify with
 * `relative()` that the result neither escapes upward nor becomes absolute,
 * exactly the property depot.ts's own `resolveContainedPath` already
 * enforces and is already tested against traversal. The denylist above is
 * defence in depth, not the primary control, so ordinary filename
 * punctuation — apostrophes, ampersands, parentheses — reaches here and
 * passes unchanged; only a real escape or denylisted shape is rejected.
 *
 * Two DIFFERENT events, deliberately NOT conflated (D-04):
 *   - an ABSENT or blank candidate is an operational event — PICS legitimately
 *     has nothing to say about this appId's installdir. This branch NEVER
 *     throws (an install-location lookup must not hard-fail a whole install
 *     over a cosmetic directory name) but DOES log at WARNING naming the
 *     appId and the fallback, closing the gap that let `Wasteland`/259130
 *     silently redirect into `app_259130` with no log at all.
 *   - a denylisted or non-contained candidate is a SECURITY event — a
 *     hostile PICS response (or a planted on-disk ACF) attempting to direct
 *     writes outside the install root. This branch THROWS
 *     UnsafeInstalldirError; the caller must abort the install rather than
 *     silently substituting a fallback.
 *
 * No fs call happens in this function — `resolve`/`relative` are pure path
 * arithmetic, so this check runs before anything touches disk.
 *
 * Exported for reuse by library.ts's startup-resume path
 * (buildResumeFinalizeOpts, 23-code-review WR-03 gap closure) — that path
 * reads installdir directly off the on-disk ACF (attacker-writable if they
 * can already write into steamapps/) with no equivalent guard of its own;
 * this is the single sanitizer both callers must funnel through (D-03) so
 * they can never silently diverge on this discipline. depot.ts's own
 * per-file `resolveContainedPath` remains the backstop for individual
 * filenames beneath the installdir this function approves.
 */
/**
 * The safe, deterministic `app_<id>` fallback directory name — the SAME
 * shape sanitizeInstalldir returns for an absent/blank candidate. Exported
 * so a caller that has ALREADY rejected a hostile candidate itself (e.g.
 * library.ts's buildResumeFinalizeOpts, which needs this name for its own
 * honest-empty degrade shape after catching an UnsafeInstalldirError) can
 * reuse the exact same naming without re-deriving it or triggering another
 * "absent or blank" log line that would misdescribe a security rejection as
 * a missing value.
 */
export function fallbackInstalldirFor(appId: string): string {
  return `${FALLBACK_INSTALLDIR_PREFIX}${safeFallbackId(appId)}`
}

export function sanitizeInstalldir(
  candidate: string | undefined,
  appId: string,
  steamappsDir: string
): string {
  const fallback = fallbackInstalldirFor(appId)

  if (!candidate || !candidate.trim()) {
    logWarning(
      `SteamGame: PICS returned no usable installdir for appId ${appId} (absent or blank), using fallback "${fallback}"`,
      LogPrefix.Steam
    )
    return fallback
  }

  if (INSTALLDIR_DENYLIST.test(candidate)) {
    throw new UnsafeInstalldirError(
      `SteamGame: rejected unsafe PICS installdir "${candidate}" for appId ${appId} (denylisted shape — traversal/separator/dot/control-char/colon/quote)`
    )
  }

  const installRoot = resolve(steamappsDir, 'common')
  const dest = resolve(installRoot, candidate)
  const rel = relative(installRoot, dest)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new UnsafeInstalldirError(
      `SteamGame: rejected unsafe PICS installdir "${candidate}" for appId ${appId} (traversal — escapes the install root)`
    )
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
  const picsInstalldir = await fetchInstalldir(appId)
  // D-04 (second half): branch 1 of sanitizeInstalldir (absent/blank
  // candidate) is the ONLY fallback trigger left — everything else either
  // passes through unchanged or throws. Determined here, independently of
  // sanitizeInstalldir's own return value, so its string-returning contract
  // stays unchanged for its OTHER caller (library.ts's
  // buildResumeFinalizeOpts, which has no use for this flag).
  const installdirFallbackUsed = !picsInstalldir || !picsInstalldir.trim()
  // D-04: sanitizeInstalldir may THROW UnsafeInstalldirError on a
  // containment/denylist violation — deliberately NOT caught here. The
  // caller (games.ts's runNativeDepotDownload) is the one place that must
  // turn this into an honest security-abort {status:'error'} rather than a
  // silent fallback write.
  const installdir = sanitizeInstalldir(
    picsInstalldir,
    appId,
    target.steamappsDir
  )

  logInfo(
    `[Timing] resolveSteamInstallTarget: total ${Date.now() - start}ms for appId ${appId}`,
    LogPrefix.Steam
  )

  return {
    targetSteamappsDir: target.steamappsDir,
    installdir,
    ...(installdirFallbackUsed ? { installdirFallbackUsed: true as const } : {})
  }
}
