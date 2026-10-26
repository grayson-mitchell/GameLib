/**
 * Known-fixes JSON reader, extracted out of `launcher.ts` (Phase 34.2 Plan
 * 03, D-05).
 *
 * `launcher.ts` is a 2170-line module dominated by
 * `prepareWineLaunch`/`runWineCommand`/`callRunner` and the whole Wine
 * launch pipeline. Importing it just to reach this 20-line self-contained
 * fs read would pull that entire pipeline in behind it. This module holds
 * only `readKnownFixes`, moved verbatim, so `main.ts`'s `getKnownFixes`
 * registration can be backed by a body the sidecar can import directly.
 *
 * WR-03 correction (34.2-REVIEW.md round 1, fixed by quick 260822-tpn): this
 * docstring used to claim `launcher.ts` "is deliberately excluded from the
 * Node sidecar's import graph". That is FALSE, and phase 34.2 is what made it
 * false -- `sidecar/gameDetailsFlowRegistration.ts` -> `gamedetails/dispatch.ts`
 * -> `storeManagers/index.ts` -> `storeManagers/gog/library.ts:51`
 * (`import { callRunner } from '../../launcher'`) reaches it transitively
 * today. The true invariant is narrower and is the one worth keeping: this
 * module avoids a DIRECT import of `launcher.ts`, which keeps this file's own
 * dependency surface small and its unit tests cheap. Do not restore the
 * stronger claim without re-checking that chain.
 *
 * quick 261025-mfz / 261025-vnf: two tiers, each with its own reader and its
 * own layer resolution (decisions 1 and 6).
 * - Tier 1, `readKnownFixes`: `<id>-<store>.json`, Heroic-format keys plus
 *   `launchNotice`. local (`fixes/local/`) > bundled (`public/fixes/`) > remote
 *   (`fixes/`), first parsed object wins whole-file. Every layer is filtered
 *   through the TIER1_KNOWN_FIX_KEYS allow-list.
 * - Tier 2, `readKnownFixProfile`: `<id>-<store>.profile.json`. local >
 *   bundled only; the remote directory is never read.
 * - `readGamelibFixStatus` (quick 261027-ch9): does a local or bundled fix of
 *   either tier exist? Drives the game page GameLib row. The remote layer
 *   never counts, and a tier-1 file carrying only routing keys (`macArch`,
 *   `drm`) does not count (quick 261027-gtd).
 *
 * MUST NOT import `electron` (or anything that transitively reaches it) --
 * including `backend/ipc` -- the Node sidecar imports this module directly.
 */

import { isAbsolute, relative, resolve } from 'path'
import { existsSync } from 'graceful-fs'
import { readFileSync } from 'fs'

import {
  GamelibFixStatus,
  KnowFixesInfo,
  KnownFixProfile,
  Runner
} from 'common/types'
import { storeMap } from 'common/utils'
import { bundledFixesPath, fixesPath, localFixesPath } from './constants/paths'
import { logWarning } from './logger'

const TIER1_FILE_SUFFIX = '.json'
const TIER2_FILE_SUFFIX = '.profile.json'

/**
 * Keys a tier-1 file may carry, at any layer. An allow-list, so a newly added
 * tier-2 key cannot reach the remote layer by being forgotten.
 * `shimFeatures` is already a tier-2 key (spike 034 / quick 261026-ng9) and
 * must never be added here. `dllOverrides`, `overlays` and `platforms` are
 * not implemented yet; they belong in TIER2_PROFILE_KEYS when they are, and
 * must never be added here either.
 * `macArch` is plain routing data that never touches a running game, so it is
 * tier 1 and reaches users from the remote repo without a release (quick
 * 261027-bqe). It is deliberately not called `platforms`, a reserved tier-2
 * name. `drm` is likewise routing data (it only sends a title to bottled
 * Steam as a 'drm-wrapped' known-bad, before any download) and never touches
 * a running game, so it is tier 1 and may arrive from the remote layer (quick
 * 261027-gtd); only "ceg" is accepted.
 */
export const TIER1_KNOWN_FIX_KEYS = [
  'title',
  'notes',
  'winetricks',
  'runInPrefix',
  'envVariables',
  'wikiLink',
  'launchNotice',
  'macArch',
  'drm'
] as const

/**
 * Keys that only change where a title is installed or launched from; they are
 * not a fix and never make the GameLib row claim one (quick 261027-gtd).
 */
export const TIER1_ROUTING_KEYS = ['macArch', 'drm'] as const

// `dllOverrides`, `overlays`, `platforms` join this list when implemented.
// `title` and `notes` are descriptive and allowed in both tiers.
const TIER2_PROFILE_KEYS = [
  'title',
  'notes',
  'evidence',
  'registry',
  'steamSharedRedists',
  'shimFeatures'
] as const

const DESCRIPTIVE_KEYS: readonly string[] = ['title', 'notes']

/**
 * True when a tier-1 fix carries at least one routing key and nothing but
 * routing and descriptive keys. A title-only object is false (ch9: a
 * descriptive-only bundled file still shows the GameLib row).
 */
export function isRoutingOnlyTier1Fix(fix: KnowFixesInfo): boolean {
  const keys = Object.keys(fix)
  const routing: readonly string[] = TIER1_ROUTING_KEYS
  return (
    keys.some((k) => routing.includes(k)) &&
    keys.every((k) => routing.includes(k) || DESCRIPTIVE_KEYS.includes(k))
  )
}

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
  // Same containment idiom as `sidecar/fileStore.ts:121-133`, and the same
  // lesson it records: `path.join` is not containment -- use resolve+relative.
  // `runner` needs no guard; it is a closed `Runner` union indexed through
  // `storeMap`.
  //
  // Returns null rather than throwing, unlike fileStore: every failure mode of
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
export function filterTier1KnownFixes(
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

function filterTier2Profile(
  appName: string,
  layerLabel: string,
  parsed: unknown
): KnownFixProfile | null {
  if (!isPlainObject(parsed)) {
    logWarning(
      `Known fix profile for '${appName}' (${layerLabel} layer) is not an object, ignoring.`
    )
    return null
  }
  const allowed: readonly string[] = TIER2_PROFILE_KEYS
  const tier1: readonly string[] = TIER1_KNOWN_FIX_KEYS
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (allowed.includes(key)) {
      out[key] = value
    } else if (tier1.includes(key)) {
      logWarning(
        `Known fix profile for '${appName}' (${layerLabel} layer): '${key}' is a tier-1 key that belongs in '${appName}-<store>.json', ignoring it here.`
      )
    } else {
      logWarning(
        `Known fix profile for '${appName}' (${layerLabel} layer): '${key}' is not a tier-2 key, ignoring it.`
      )
    }
  }
  return out as unknown as KnownFixProfile
}

/** Tier 1: `<appName>-<store>.json`, local > bundled > remote, allow-listed. */
export function readKnownFixes(
  appName: string,
  runner: Runner
): KnowFixesInfo | null {
  const layers: [string, string][] = [
    [localFixesPath, 'local'],
    [bundledFixesPath, 'bundled'],
    [fixesPath, 'remote']
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

/**
 * Tier 2: `<appName>-<store>.profile.json`, local > bundled ONLY. The remote
 * `fixesPath` directory is deliberately absent from the layer list.
 */
export function readKnownFixProfile(
  appName: string,
  runner: Runner
): KnownFixProfile | null {
  const layers: [string, string][] = [
    [localFixesPath, 'local'],
    [bundledFixesPath, 'bundled']
  ]
  for (const [dir, label] of layers) {
    const parsed = readFixesFileWithin(
      dir,
      appName,
      runner,
      TIER2_FILE_SUFFIX,
      label
    )
    if (parsed === null) continue
    const filtered = filterTier2Profile(appName, label, parsed)
    if (filtered !== null) return filtered
  }
  return null
}

/**
 * Quick 261027-ch9: local + bundled only, tier 1 then tier 2. Never reads the
 * remote directory. The launchNotice comes from the winning tier-1 file only.
 * A tier-1 file carrying only routing keys (`macArch`, `drm`) does not count
 * (quick 261027-gtd).
 */
export function readGamelibFixStatus(
  appName: string,
  runner: Runner
): GamelibFixStatus | null {
  if (storeMap[runner] === undefined) return null
  const layers: ['local' | 'bundled', string][] = [
    ['local', localFixesPath],
    ['bundled', bundledFixesPath]
  ]
  for (const [label, dir] of layers) {
    const parsed = readFixesFileWithin(
      dir,
      appName,
      runner,
      TIER1_FILE_SUFFIX,
      label
    )
    if (parsed === null) continue
    const filtered = filterTier1KnownFixes(appName, label, parsed)
    if (filtered === null) continue
    // The winning tier-1 file (first parsed layer, as readKnownFixes resolves
    // it) is routing data only, so no tier-1 fix applies; fall through to the
    // tier-2 profile check. break, not continue: a lower layer's tier-1 file
    // is shadowed whole-file and is not applied either.
    if (isRoutingOnlyTier1Fix(filtered)) break
    const notice = filtered.launchNotice
    const trimmed = typeof notice === 'string' ? notice.trim() : ''
    return trimmed
      ? { origin: label, launchNotice: trimmed }
      : { origin: label }
  }
  for (const [label, dir] of layers) {
    const parsed = readFixesFileWithin(
      dir,
      appName,
      runner,
      TIER2_FILE_SUFFIX,
      label
    )
    if (parsed === null) continue
    if (filterTier2Profile(appName, label, parsed) !== null)
      return { origin: label }
  }
  return null
}
