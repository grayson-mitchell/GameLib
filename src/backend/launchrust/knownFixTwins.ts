/**
 * The synchronous known-fix twins (Phase 88, 88-13, 87 D-24, D-20).
 *
 * Copies of Rust-owned pure readers and formatters, for callers 88 cannot make async: the launcher's
 * `installFixes` and `getKnownFixesEnvVariables` read the tier-1 fix inline, and storeManagerCommon's
 * `withKnownFixEnv` builds a settings object synchronously. The Rust owners are `gamelib-knownfix`'s reader
 * (`reader.rs`) and overlay env (`overlay/env.rs`). Each twin is a row in the shim schedule
 * (`engineWineShimSchedule.test.ts`, shape twin, with its deletion phase), pinned to Rust by
 * `__tests__/knownFixTwins.vectors.test.ts`, which replays the same goldens the crate replays
 * (`golden/reader` and `golden/overlay_install`).
 *
 * Copied verbatim from `backend/knownFixes.ts` and `backend/knownFixOverlays.ts` with their private helpers
 * (`readFixesFileWithin`, `filterTier1KnownFixes`, `isValidExeOverrideShape`, the key lists), and never
 * edited to fix a quirk: a twin that differs from a golden is a todo, not an edit to either side (D-20).
 * Only the exports changed (`filterTier1KnownFixes` and `isValidExeOverrideShape` are private here, and the
 * readers and helpers nothing synchronous calls were not copied).
 *
 * MUST NOT import `electron`, `backend/knownFixes` or `backend/knownFixOverlays`: the point of the file is
 * that the launcher and the common store manager stop importing those modules.
 */

import { isAbsolute, posix, relative, resolve, win32 } from 'path'
import { existsSync } from 'graceful-fs'
import { readFileSync } from 'fs'

import type { GameSettings, KnowFixesInfo, Runner } from 'common/types'
import { storeMap } from 'common/utils'
import type { AppPaths } from 'backend/process/context'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'

const TIER1_FILE_SUFFIX = '.json'
const MAX_LOGGED_VALUE = 512

/**
 * Keys a tier-1 file may carry, at any layer. An allow-list, so a newly added
 * tier-2 key cannot reach the remote layer by being forgotten.
 * `shimFeatures` is already a tier-2 key (spike 034 / quick 261026-ng9) and
 * must never be added here. `overlays` is implemented as a tier-2 key (quick
 * 261027-n77) and must never be added here. `dllOverrides` is implemented as
 * a tier-2 key (quick 261029-gow) and must never be added here. `platforms`
 * is not implemented yet; it belongs in TIER2_PROFILE_KEYS when it is, and
 * must never be added here either.
 * `macArch` is plain routing data that never touches a running game, so it is
 * tier 1 and reaches users from the remote repo without a release (quick
 * 261027-bqe). It is deliberately not called `platforms`, a reserved tier-2
 * name. `drm` is likewise routing data (it only sends a title to bottled
 * Steam as a 'drm-wrapped' known-bad, before any download) and never touches
 * a running game, so it is tier 1 and may arrive from the remote layer (quick
 * 261027-gtd); only "ceg" is accepted.
 * `launchArgs` and `exeOverride` are tier 1 by operator decision (quick
 * 261029-mbl); neither runs new code. `exeOverride` is shape-checked here and
 * realpath-contained to the install folder at launch (`knownFixLaunch.ts`), so
 * it carries the same trust as `runInPrefix`. Unlike `macArch`/`drm` they are
 * fixes, not routing keys, and count for the GameLib row.
 * `steamGameOverlay` (Phase 60 D-03) accepts only "off": it can only remove an
 * injection, runs no code, and reaches every user without a release.
 */
const TIER1_KNOWN_FIX_KEYS = [
  'title',
  'notes',
  'winetricks',
  'runInPrefix',
  'envVariables',
  'wikiLink',
  'launchNotice',
  'macArch',
  'drm',
  'launchArgs',
  'exeOverride',
  'steamGameOverlay'
] as const

/**
 * Shape check for a tier-1 `exeOverride` (quick 261029-mbl): a non-empty
 * install-dir-relative path with no drive letter, no absolute form (posix or
 * win32), no NUL and no `..` segment. Containment and existence are checked at
 * launch against the real install path (`knownFixLaunch.ts`).
 */
function isValidExeOverrideShape(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.trim() === '') return false
  if (value.includes('\u0000')) return false
  if (posix.isAbsolute(value) || win32.isAbsolute(value)) return false
  if (/^[A-Za-z]:/.test(value)) return false
  if (value.split(/[\\/]/).some((seg) => seg === '..')) return false
  return true
}

// `overlays` was added by quick 261027-n77, `dllOverrides` by quick
// 261029-gow. `platforms` joins this list when implemented.
// `title` and `notes` are descriptive and allowed in both tiers.
const TIER2_PROFILE_KEYS = [
  'title',
  'notes',
  'evidence',
  'registry',
  'dllOverrides',
  'overlays',
  'steamSharedRedists',
  'shimFeatures'
] as const

const DESCRIPTIVE_KEYS: readonly string[] = ['title', 'notes']

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readFixesFileWithin(
  dir: string,
  appName: string,
  runner: Runner,
  suffix: string,
  layerLabel?: string
): unknown {
  const fixPath = resolve(dir, `${appName}-${storeMap[runner]}${suffix}`)

  // WR-06 (34.2-REVIEW.md round 1): `appName` arrives as a free string from the
  // renderer via the `getKnownFixes` channel. `join`/`resolve` NORMALISE `..`
  // segments rather than rejecting them, so a traversing appName escaped
  // the directory and made this an arbitrary-file read primitive -- whatever it
  // landed on was `readFileSync`'d and `JSON.parse`'d.
  //
  // Same containment idiom as `store_backend.ts`'s `assertContained`, and the same
  // lesson it records: `path.join` is not containment -- use resolve+relative.
  // `runner` needs no guard; it is a closed `Runner` union indexed through
  // `storeMap`.
  //
  // Returns null rather than throwing, unlike `assertContained`: every failure mode of
  // this function (absent file, malformed JSON) already yields null and callers
  // depend on that. The `logWarning` keeps it loud rather than silent.
  const relativeToFixes = relative(resolve(dir), fixPath)
  if (
    relativeToFixes.startsWith('..') ||
    isAbsolute(relativeToFixes) ||
    relativeToFixes === ''
  ) {
    logWarning(
      `Known fixes lookup for '${appName}' resolved outside the known-fixes directory, ignoring.`
    )
    return null
  }

  if (!existsSync(fixPath)) return null

  try {
    return JSON.parse(readFileSync(fixPath).toString()) as unknown
  } catch (error) {
    // if we fail to download the json file, it can be malformed causing
    // JSON.parse to throw an exception
    logWarning(
      `Known fixes could not be applied${layerLabel ? ` (${layerLabel} layer)` : ''}, ignoring.\n${String(error)}`
    )
    return null
  }
}

/**
 * Pure (apart from warnings) tier-1 validator: copies only allow-listed keys.
 * Returns null for a non-plain-object. The remote fetcher applies this to
 * downloaded files.
 */
function filterTier1KnownFixes(
  appName: string,
  layerLabel: string,
  parsed: unknown
): KnowFixesInfo | null {
  if (!isPlainObject(parsed)) {
    logWarning(
      `Known fixes for '${appName}' (${layerLabel} layer) is not an object, ignoring.`
    )
    return null
  }
  const allowed: readonly string[] = TIER1_KNOWN_FIX_KEYS
  const tier2: readonly string[] = TIER2_PROFILE_KEYS
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (allowed.includes(key)) {
      // A curated "64" adds nothing over the min-OS heuristic and the Mach-O
      // check, so only the literal "32" is accepted (quick 261027-bqe).
      if (key === 'macArch' && value !== '32') {
        logWarning(
          `Known fixes for '${appName}' (${layerLabel} layer): 'macArch' accepts only "32", ignoring ${JSON.stringify(value)}.`
        )
        continue
      }
      // "ceg" is the only Steam DRM that needs a genuine Windows Steam client
      // (spikes 035-037/044); SteamStub is not routing data (quick 261027-gtd).
      if (key === 'drm' && value !== 'ceg') {
        logWarning(
          `Known fixes for '${appName}' (${layerLabel} layer): 'drm' accepts only "ceg", ignoring ${JSON.stringify(value)}.`
        )
        continue
      }
      if (key === 'steamGameOverlay' && value !== 'off') {
        logWarning(
          `Known fixes for '${appName}' (${layerLabel} layer): 'steamGameOverlay' accepts only "off", ignoring ${JSON.stringify(value)}.`
        )
        continue
      }
      if (
        key === 'launchArgs' &&
        !(
          Array.isArray(value) &&
          value.every((entry) => typeof entry === 'string')
        )
      ) {
        logWarning(
          `Known fixes for '${appName}' (${layerLabel} layer): 'launchArgs' must be an array of strings, ignoring ${JSON.stringify(value)}.`
        )
        continue
      }
      if (key === 'exeOverride' && !isValidExeOverrideShape(value)) {
        logWarning(
          `Known fixes for '${appName}' (${layerLabel} layer): 'exeOverride' must be a relative path inside the install folder, ignoring ${JSON.stringify(value)}.`
        )
        continue
      }
      out[key] = value
    } else if (tier2.includes(key) && !DESCRIPTIVE_KEYS.includes(key)) {
      logWarning(
        `Known fixes for '${appName}' (${layerLabel} layer): '${key}' is a tier-2 key that belongs in '${appName}-<store>.profile.json', ignoring it here.`
      )
    } else {
      logWarning(
        `Known fixes for '${appName}' (${layerLabel} layer): '${key}' is not a tier-1 key, ignoring it.`
      )
    }
  }
  return out as unknown as KnowFixesInfo
}

/** The layer directories the known-fix readers walk, from the boot's paths (66.4-17). */
export interface KnownFixPathsDeps {
  paths: Pick<AppPaths, 'fixesPath' | 'bundledFixesPath' | 'localFixesPath'>
}

/** Tier 1: `<appName>-<store>.json`, local > bundled > remote, allow-listed. */
export function readKnownFixes(
  deps: KnownFixPathsDeps,
  appName: string,
  runner: Runner
): KnowFixesInfo | null {
  const layers: [string, string][] = [
    [deps.paths.localFixesPath, 'local'],
    [deps.paths.bundledFixesPath, 'bundled'],
    [deps.paths.fixesPath, 'remote']
  ]
  for (const [dir, label] of layers) {
    const parsed = readFixesFileWithin(
      dir,
      appName,
      runner,
      TIER1_FILE_SUFFIX,
      label
    )
    if (parsed === null) continue
    const filtered = filterTier1KnownFixes(appName, label, parsed)
    if (filtered !== null) return filtered
  }
  return null
}

export function formatKnownFixEnvLine(
  entries: Array<{ key: string; value: string; source: string }>
): string | null {
  if (entries.length === 0) return null
  const items = entries.map((e) => {
    const v =
      e.value.length > MAX_LOGGED_VALUE
        ? `${e.value.slice(0, MAX_LOGGED_VALUE)}...`
        : e.value
    return `${e.key}=${v} (${e.source})`
  })
  return `known-fix env applied: ${items.join('; ')}`
}

export function logKnownFixEnv(
  label: string,
  entries: Array<{ key: string; value: string; source: string }>,
  logPrefix: LogPrefix
): string | null {
  const line = formatKnownFixEnvLine(entries)
  if (line) logInfo(`${label}: ${line}`, logPrefix)
  return line
}

export function withKnownFixEnv(
  gameSettings: GameSettings,
  env: Record<string, string>
): GameSettings {
  const entries = Object.entries(env)
  if (entries.length === 0) return gameSettings
  return {
    ...gameSettings,
    enviromentOptions: [
      ...(gameSettings.enviromentOptions ?? []),
      ...entries.map(([key, value]) => ({ key, value }))
    ]
  }
}

// 88-14 (RED stubs): the bridge's five twins land in the next commit; these answer nothing, so the vectors fail on
// their comparisons and not on a missing module.
export interface KnownFixLocalPathsDeps {
  paths: Pick<AppPaths, 'bundledFixesPath' | 'localFixesPath'>
}
export function readKnownFixProfile(
  _deps: KnownFixLocalPathsDeps,
  _appName: string,
  _runner: Runner
): Record<string, unknown> | null {
  return null
}
export function readKnownFixLaunchOverridesSync(
  _deps: KnownFixPathsDeps,
  _appName: string,
  _runner: Runner,
  _installPath: string | undefined
): { launchArgs: string[]; exeOverride?: string } {
  return { launchArgs: ['stub'] }
}
export function lastEnvOption(
  _options: Array<{ key: string; value: string }> | undefined,
  _key: string
): string | undefined {
  return 'stub'
}
export async function readOverlayTarGz(
  _archive: Buffer,
  _expected: ReadonlyMap<string, number>,
  _max: number
): Promise<Map<string, Buffer>> {
  return new Map()
}
export function buildOverlayTarGz(
  _files: ReadonlyArray<{ path: string; data: Buffer }>
): Buffer {
  return Buffer.alloc(0)
}
