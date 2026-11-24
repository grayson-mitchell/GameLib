/**
 * The synchronous known-fix twins (Phase 88, 88-13 and 88-14, 87 D-24, D-20).
 *
 * Copies of Rust-owned pure readers and formatters, for callers 88 cannot make async: the launcher's
 * `installFixes` and `getKnownFixesEnvVariables` read the tier-1 fix inline, storeManagerCommon's
 * `withKnownFixEnv` builds a settings object synchronously, and the Steam bridge reads its tier-2 profile and
 * launch overrides, looks up the merged env and builds and reads overlay archives (88-14). The Rust owners are
 * `gamelib-knownfix`'s reader (`reader.rs`), launch overrides (`launch.rs`), overlay env (`overlay/env.rs`) and
 * overlay archive (`overlay/archive.rs`). Each twin is a row in the shim schedule
 * (`engineWineShimSchedule.test.ts`, shape twin, with its deletion phase), pinned to Rust by
 * `__tests__/knownFixTwins.vectors.test.ts`, which replays the same goldens the crate replays (`golden/reader`,
 * `golden/launch_overrides`, `golden/overlay_install` and `golden/overlay_archive`).
 *
 * Copied verbatim from `backend/knownFixes.ts`, `backend/knownFixLaunch.ts`, `backend/knownFixOverlays.ts` and
 * `backend/knownFixOverlayArchive.ts` with their private helpers (`readFixesFileWithin`, `filterTier1KnownFixes`,
 * `filterTier2Profile`, `isValidExeOverrideShape`, `resolveKnownFixExeOverride`, the key lists, the tar
 * header helpers), and never edited to fix a quirk: a twin that differs from a golden is a todo, not an edit to
 * either side (D-20). Only the exports changed (`filterTier1KnownFixes`, `filterTier2Profile`,
 * `isValidExeOverrideShape` and `resolveKnownFixExeOverride` are private here, `readKnownFixLaunchOverrides` is
 * named `readKnownFixLaunchOverridesSync` so it is never confused with the async shim of the same job, and the
 * readers and helpers nothing synchronous calls were not copied).
 *
 * MUST NOT import `electron`, `backend/knownFixes`, `backend/knownFixLaunch`, `backend/knownFixOverlays` or
 * `backend/knownFixOverlayArchive`: the point of the file is that the launcher, the common store manager and the
 * Steam bridge stop importing those modules.
 */

import { isAbsolute, posix, relative, resolve, win32 } from 'path'
import { existsSync } from 'graceful-fs'
import { readFileSync, realpathSync, statSync } from 'fs'
import { gunzip, gzipSync } from 'zlib'
import { promisify } from 'util'

import type {
  EnviromentVariable,
  GameSettings,
  KnowFixesInfo,
  KnownFixProfile,
  Runner
} from 'common/types'
import { storeMap } from 'common/utils'
import type { AppPaths } from 'backend/process/context'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'

const TIER1_FILE_SUFFIX = '.json'
const TIER2_FILE_SUFFIX = '.profile.json'
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

/** The local and bundled layers only: tier 2 and the status probe never read the remote directory. */
export interface KnownFixLocalPathsDeps {
  paths: Pick<AppPaths, 'bundledFixesPath' | 'localFixesPath'>
}

/**
 * Tier 2: `<appName>-<store>.profile.json`, local > bundled ONLY. The remote
 * `fixesPath` directory is deliberately absent from the layer list.
 */
export function readKnownFixProfile(
  deps: KnownFixLocalPathsDeps,
  appName: string,
  runner: Runner
): KnownFixProfile | null {
  const layers: [string, string][] = [
    [deps.paths.localFixesPath, 'local'],
    [deps.paths.bundledFixesPath, 'bundled']
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

function escapes(rel: string): boolean {
  return rel === '' || rel.startsWith('..') || isAbsolute(rel)
}

function resolveKnownFixExeOverride(
  installPath: string,
  exeOverride: string,
  label: string
): string | undefined {
  const reject = (reason: string): undefined => {
    logWarning(
      `${label}: known-fix exeOverride '${exeOverride}' ${reason}, using the default executable.`,
      LogPrefix.Backend
    )
    return undefined
  }
  if (!isValidExeOverrideShape(exeOverride)) {
    return reject('is not a relative path inside the install folder')
  }
  if (!installPath) return reject('cannot be checked without an install path')
  try {
    const normalised = exeOverride.replace(/\\/g, '/')
    const realInstall = realpathSync(installPath)
    const lexical = resolve(installPath, normalised)
    if (escapes(relative(resolve(installPath), lexical))) {
      return reject('resolves outside the install folder')
    }
    if (!statSync(lexical).isFile()) return reject('is not a file')
    const realTarget = realpathSync(lexical)
    if (escapes(relative(realInstall, realTarget))) {
      return reject('resolves outside the install folder')
    }
    return lexical
  } catch (error) {
    return reject(`could not be verified (${String(error)})`)
  }
}

interface KnownFixLaunchOverrides {
  launchArgs: string[]
  exeOverride?: string
}

/**
 * The synchronous launch overrides of a tier-1 fix (`readKnownFixLaunchOverrides` in `backend/knownFixLaunch.ts`,
 * named `...Sync` here so it is not confused with the async shim in `knownFixes.ts`): the fix's `launchArgs`, and
 * its `exeOverride` once checked against the real install folder.
 */
export function readKnownFixLaunchOverridesSync(
  deps: KnownFixPathsDeps,
  appName: string,
  runner: Runner,
  installPath: string | undefined
): KnownFixLaunchOverrides {
  const label = `Known fix for '${appName}'`
  try {
    const fix = readKnownFixes(deps, appName, runner)
    const launchArgs = fix?.launchArgs ?? []
    let exeOverride: string | undefined
    if (fix?.exeOverride) {
      exeOverride = installPath
        ? resolveKnownFixExeOverride(installPath, fix.exeOverride, label)
        : undefined
      if (!installPath) {
        logWarning(
          `${label}: known-fix exeOverride '${fix.exeOverride}' ignored, the install path is unknown.`,
          LogPrefix.Backend
        )
      }
    }
    if (launchArgs.length || exeOverride) {
      logInfo(
        `${label}: known-fix launchArgs ${JSON.stringify(launchArgs)}, exeOverride ${exeOverride ?? 'none'}`,
        LogPrefix.Backend
      )
    }
    return { launchArgs, exeOverride }
  } catch (error) {
    logWarning(
      `${label}: could not read launch overrides, ignoring.\n${String(error)}`,
      LogPrefix.Backend
    )
    return { launchArgs: [] }
  }
}

/** The last matching option wins, as setupEnvVars applies them. */
export function lastEnvOption(
  options: EnviromentVariable[] | undefined,
  key: string
): string | undefined {
  let value: string | undefined
  for (const o of options ?? []) if (o.key === key) value = o.value
  return value
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

// ---- the overlay archive writer and strict reader (`backend/knownFixOverlayArchive.ts`, 88-14) ----

const gunzipAsync = promisify(gunzip)
const BLOCK = 512
const RECORD = 10240
const MAX_NAME_BYTES = 99

interface OverlayArchiveFile {
  path: string
  data: Buffer
}

function checkPath(path: string): string | null {
  if (path === '') return 'empty path'
  if (path.startsWith('/')) return 'absolute path'
  if (path.includes('\\')) return 'backslash in path'
  if (!/^[\x20-\x7e]+$/.test(path)) return 'non-ASCII path'
  if (Buffer.byteLength(path) > MAX_NAME_BYTES) return 'path too long'
  for (const seg of path.split('/')) {
    if (seg === '') return 'empty path segment'
    if (seg === '.') return '"." path segment'
    if (seg === '..') return '".." path segment'
  }
  return null
}

function octal(value: number, digits: number): string {
  return value.toString(8).padStart(digits, '0')
}

function headerChecksum(header: Buffer): number {
  let sum = 0
  for (let i = 0; i < BLOCK; i++) {
    const byte = header[i]
    if (byte === undefined) throw new Error('overlay archive: truncated header')
    sum += i >= 148 && i < 156 ? 0x20 : byte
  }
  return sum
}

function buildHeader(path: string, size: number): Buffer {
  const h = Buffer.alloc(BLOCK)
  h.write(path, 0, 'ascii')
  h.write('0000644\0', 100, 'ascii')
  h.write('0000000\0', 108, 'ascii')
  h.write('0000000\0', 116, 'ascii')
  h.write(octal(size, 11) + '\0', 124, 'ascii')
  h.write('00000000000\0', 136, 'ascii')
  h.write('        ', 148, 'ascii')
  h.write('0', 156, 'ascii')
  h.write('ustar\0', 257, 'ascii')
  h.write('00', 263, 'ascii')
  h.write(octal(headerChecksum(h), 6) + '\0 ', 148, 'ascii')
  return h
}

export function buildOverlayTarGz(
  files: ReadonlyArray<OverlayArchiveFile>
): Buffer {
  const seen = new Set<string>()
  for (const f of files) {
    const bad = checkPath(f.path)
    if (bad) throw new Error(`overlay archive: ${bad}: ${f.path}`)
    if (seen.has(f.path)) {
      throw new Error(`overlay archive: duplicate path: ${f.path}`)
    }
    seen.add(f.path)
  }
  const sorted = [...files].sort((a, b) =>
    Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))
  )
  const parts: Buffer[] = []
  for (const f of sorted) {
    parts.push(buildHeader(f.path, f.data.length), f.data)
    const pad = (BLOCK - (f.data.length % BLOCK)) % BLOCK
    if (pad) parts.push(Buffer.alloc(pad))
  }
  parts.push(Buffer.alloc(BLOCK * 2))
  const body = Buffer.concat(parts)
  const padded = Buffer.concat([
    body,
    Buffer.alloc((RECORD - (body.length % RECORD)) % RECORD)
  ])
  const gz = gzipSync(padded, { level: 9 })
  // Node's zlib writes a per-platform OS byte (and zero mtime); pin both so the
  // archive does not depend on the build host.
  if (gz.readUInt32LE(4) !== 0) {
    throw new Error('overlay archive: gzip mtime is not zero')
  }
  gz[9] = 0x03
  return gz
}

function readCString(buf: Buffer, start: number, len: number): string {
  const slice = buf.subarray(start, start + len)
  const nul = slice.indexOf(0)
  return slice.subarray(0, nul === -1 ? len : nul).toString('latin1')
}

function readOctal(buf: Buffer, start: number, len: number): number | null {
  const text = readCString(buf, start, len).trim()
  if (!/^[0-7]+$/.test(text)) return null
  return parseInt(text, 8)
}

export async function readOverlayTarGz(
  archive: Buffer,
  expected: ReadonlyMap<string, number>,
  maxUncompressedBytes: number
): Promise<Map<string, Buffer>> {
  let tar: Buffer
  try {
    tar = await gunzipAsync(archive, { maxOutputLength: maxUncompressedBytes })
  } catch (err) {
    throw new Error(
      `overlay archive: gunzip failed or exceeded ${maxUncompressedBytes} bytes (${
        err instanceof Error ? err.message : String(err)
      })`
    )
  }
  const out = new Map<string, Buffer>()
  let pos = 0
  while (pos + BLOCK <= tar.length) {
    const header = tar.subarray(pos, pos + BLOCK)
    if (header.every((b) => b === 0)) break

    const stored = readOctal(header, 148, 8)
    if (stored === null || stored !== headerChecksum(header)) {
      throw new Error('overlay archive: bad header checksum')
    }
    const magic = header.subarray(257, 263).toString('latin1')
    const version = header.subarray(263, 265).toString('latin1')
    if (magic !== 'ustar\0' || version !== '00') {
      throw new Error('overlay archive: not a POSIX ustar entry')
    }
    const typeflagByte = header[156]
    if (typeflagByte === undefined) {
      throw new Error('overlay archive: truncated header')
    }
    const typeflag = String.fromCharCode(typeflagByte)
    if (typeflag !== '0') {
      throw new Error(`overlay archive: unsupported entry type '${typeflag}'`)
    }
    if (readCString(header, 345, 155) !== '') {
      throw new Error('overlay archive: ustar prefix field is not allowed')
    }
    const name = readCString(header, 0, 100)
    const bad = checkPath(name)
    if (bad) throw new Error(`overlay archive: ${bad}: ${name}`)
    const size = readOctal(header, 124, 12)
    if (size === null) throw new Error('overlay archive: bad size field')

    const want = expected.get(name)
    if (want === undefined) {
      throw new Error(`overlay archive: unexpected path: ${name}`)
    }
    if (out.has(name)) {
      throw new Error(`overlay archive: duplicate path: ${name}`)
    }
    if (size > want) {
      throw new Error(`overlay archive: entry larger than expected: ${name}`)
    }
    const dataStart = pos + BLOCK
    if (dataStart + size > tar.length) {
      throw new Error(`overlay archive: truncated data for ${name}`)
    }
    out.set(name, Buffer.from(tar.subarray(dataStart, dataStart + size)))
    pos = dataStart + Math.ceil(size / BLOCK) * BLOCK
  }
  for (const path of expected.keys()) {
    if (!out.has(path)) {
      throw new Error(`overlay archive: missing expected path: ${path}`)
    }
  }
  return out
}
