/**
 * Shim constants, result types and the game-original dll fingerprint, backup
 * and restore helpers, split out of shimGenerate.ts (Phase 65 Plan 16). The
 * fingerprint/backup and restore/probe groups are mutually dependent, so they
 * live together. See shimGenerate.ts for the placement design notes.
 */

import { copyFileSync, lstatSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { SteamBridgeScanVerdict } from '../stores'
import { readInterfaceVersionStrings } from './interfaceVersions'
import { isContainedWithin } from './bridgeScan'

// Pattern repeated verbatim across bottle.ts:836, clientSetup.ts:40,
// importScan.ts -- reuse the SAME regex value/name, do not redefine a
// divergent one.

export const BRIDGE_SHIM_FILENAME = 'steam_api.dll'
export const BRIDGE_SHIM64_FILENAME = 'steam_api64.dll'

// Phase 51 Plan 07: a file at the target path is OURS (a GameLib shim --
// either the current one or an older release) iff its bytes contain
// either the native generator's marker string (meta/gen_vtables.ts,
// `g_gamelib_shim_marker`, `.includes` so a version suffix like "/2" never
// breaks the match on a future bump) or the ASCII loopback address the
// shim's helper-socket connect call embeds literally (24-UAT.md L337-344's
// `grep -ac 127.0.0.1` secondary check: 1 on the bridge shim, 0 on a
// game's own depot-shipped dll). Either signal alone is sufficient --
// a genuine game dll has no reason to contain either string.
const GAMELIB_SHIM_MARKER = 'GameLibSteamBridgeShim'
const GAMELIB_SHIM_LOOPBACK_MARKER = '127.0.0.1'

/**
 * True iff `buf` is a GameLib-produced bridge shim (current or older
 * release) rather than a game's own original `steam_api(64)?.dll`. See the
 * marker constants above for the two independent signals checked.
 */
export function isGameLibShimBytes(buf: Buffer): boolean {
  const text = buf.toString('latin1')
  return (
    text.includes(GAMELIB_SHIM_MARKER) ||
    text.includes(GAMELIB_SHIM_LOOPBACK_MARKER)
  )
}

// Not exported: verified to have no importer anywhere -- not in any tracked .ts/.tsx
// file (`pnpm find-deadcode` / ts-prune flagged the previously-exported form as an
// over-broad `export` keyword).
export type PlaceShimResultBase =
  | {
      status: 'placed' | 'already-placed'
      shimPath: string
      // quick 261023-ue0: runtime-loaded branch only -- EVERY live shim path.
      shimPaths?: string[]
      verdict?: SteamBridgeScanVerdict
      // Phase 52 Plan 08: launch exe carries a SteamStub .bind section.
      drmWrapper?: 'steamstub' | 'none'
      exeArch?: 'x86' | 'x64' | null
    }
  | {
      // quick 261023-oq7: the shim was placed despite a coverage miss.
      status: 'placed-miss'
      shimPaths: string[]
      verdict: SteamBridgeScanVerdict
      drmWrapper?: 'steamstub' | 'none'
      exeArch?: 'x86' | 'x64' | null
    }
  | {
      status: 'no-steam-api'
      verdict: SteamBridgeScanVerdict
      drmWrapper?: 'steamstub' | 'none'
      exeArch?: 'x86' | 'x64' | null
    }
  | {
      // quick 261024-j4l: importer evidence names gaps the shim cannot serve
      // (delay-imported missing symbols / unservable interface versions), so
      // the shim was NOT placed (or was withdrawn). The caller launches with
      // the game's own steam_api and no helper. `restored`: the dlls put back
      // from `.gamelib-orig`.
      status: 'withheld'
      verdict: SteamBridgeScanVerdict
      restored: string[]
      drmWrapper?: 'steamstub' | 'none'
      exeArch?: 'x86' | 'x64' | null
    }
  | { status: 'shim-not-built'; arch: 'x86' | 'x64' }
  | { status: 'error'; error: string }

/** Quick 261024-br4: Steam CEG DRM found in the game exe. */
export type SteamExeDrmSignal = { kind: 'ceg'; markers: string[] }

/** `drm`: an object means CEG was detected; `null` means the exe parsed as
 * a PE and is not CEG; absent means not checked (an 'error' result) or the
 * PE did not parse (treated as not CEG). */
export type PlaceShimResult = PlaceShimResultBase & {
  drm?: SteamExeDrmSignal | null
}

// quick 261024-j4l: the game-original steam_api(64) dll is copied here before
// the shim overwrites it, so the guard can restore it. Both walks exclude the
// backup by construction (exact-name dll match; .exe/.dll-only importer walk).
export const ORIGINAL_BACKUP_SUFFIX = '.gamelib-orig'

export type OriginalFingerprints = NonNullable<
  SteamBridgeScanVerdict['originalFingerprints']
>

/** quick 261026-lif: size + sha1 of a small dll. Never throws. */
function fingerprintFile(path: string): { size: number; sha1: string } | null {
  try {
    const bytes = readFileSync(path)
    return {
      size: bytes.length,
      sha1: createHash('sha1').update(bytes).digest('hex')
    }
  } catch {
    return null
  }
}

/** Verdict key: the shim target's path relative to the bottle, `/`-separated. */
function fingerprintKey(bottleDir: string, target: string): string {
  return relative(bottleDir, resolve(target)).split(sep).join('/')
}

/**
 * quick 261026-lif: fingerprint of the game-original behind `target` -- the
 * target itself when it is a non-shim original, or its restorable
 * `.gamelib-orig` when it is a GameLib shim. Null when no original is readable.
 */
function originalFingerprintFor(
  bottleDir: string,
  target: string
): { size: number; sha1: string } | null {
  try {
    if (!isContainedWithin(bottleDir, resolve(target))) return null
    if (!isGameLibShimBytes(readFileSync(target))) {
      return fingerprintFile(target)
    }
  } catch {
    return null
  }
  return probeOriginalBackup(bottleDir, target) === 'restorable'
    ? fingerprintFile(target + ORIGINAL_BACKUP_SUFFIX)
    : null
}

/** Fingerprints for every target whose original is readable; undefined when none. */
export function collectOriginalFingerprints(
  bottleDir: string,
  targets: string[]
): OriginalFingerprints | undefined {
  const out: OriginalFingerprints = {}
  for (const t of targets) {
    const fp = originalFingerprintFor(bottleDir, t)
    if (fp) out[fingerprintKey(bottleDir, t)] = fp
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * quick 261026-lif: true when any shim in scope has a restorable
 * `.gamelib-orig` whose fingerprint is absent from, or differs from, the
 * persisted verdict's -- the persisted verdict is then stale.
 */
export function backupFingerprintChanged(
  appId: string,
  bottleDir: string,
  shimPaths: string[],
  persisted: OriginalFingerprints | undefined
): boolean {
  for (const t of shimPaths) {
    if (probeOriginalBackup(bottleDir, resolve(t)) !== 'restorable') continue
    const now = fingerprintFile(t + ORIGINAL_BACKUP_SUFFIX)
    const key = fingerprintKey(bottleDir, t)
    const was = persisted?.[key]
    const reason = !was ? 'new .gamelib-orig' : 'fingerprint changed'
    if (!now || !was || was.size !== now.size || was.sha1 !== now.sha1) {
      logInfo(
        `placeShimForGame: appId ${appId} ${key}: ${reason} -- discarding the persisted verdict and rescanning (quick 261026-lif)`,
        LogPrefix.Steam
      )
      return true
    }
  }
  return false
}

/**
 * quick 261024-j4l (T-j4l-03): keeps the game-original dll as
 * `<target>.gamelib-orig` before it is overwritten. Never backs up a GameLib
 * shim, refuses a symlink / non-regular backup path, and requires the backup
 * to sit inside the bottle. Never throws.
 */
export function backupOriginalBeforeOverwrite(
  bottleDir: string,
  target: string,
  appId: string
): { ok: true } | { ok: false; error: string } {
  const backup = target + ORIGINAL_BACKUP_SUFFIX
  try {
    if (!isContainedWithin(bottleDir, resolve(backup))) {
      throw new Error('backup path is outside the bridge bottle')
    }
    if (isGameLibShimBytes(readFileSync(target))) return { ok: true }
    let backupStat
    try {
      backupStat = lstatSync(backup)
    } catch {
      backupStat = null
    }
    if (backupStat && (backupStat.isSymbolicLink() || !backupStat.isFile())) {
      throw new Error('backup path exists and is not a regular file')
    }
    copyFileSync(target, backup)
    logInfo(
      `placeShimForGame: appId ${appId} kept the game-original ${relative(dirname(target), target)} as ${ORIGINAL_BACKUP_SUFFIX} before placing the shim`,
      LogPrefix.Steam
    )
    return { ok: true }
  } catch (error) {
    logWarning(
      [
        `placeShimForGame: could not back up the original "${target}" for appId ${appId} -- not overwriting it`,
        error
      ],
      LogPrefix.Steam
    )
    return { ok: false, error: String(error) }
  }
}

/**
 * True iff the file at `pathA` is byte-identical to the file at `pathB`
 * (size compare first, then sha256 digest compare only on a size match).
 * D-UAT-24-04: replaces a pure `existsSync` existence guard, which let the
 * game's own depot-shipped `steam_api.dll` (~118368 bytes) permanently
 * block placement of the real bridge shim (~805888 bytes) -- the bridge
 * never engaged for any game that ships its own steam_api.dll (effectively
 * all of them). Wrapped in try/catch so an fs race (e.g. the target
 * disappearing between the `existsSync` check and the stat/read here) can
 * never throw the placement path -- it falls through to "not identical",
 * which is the safe default (re-run the coverage-checked overwrite).
 */
export function isByteIdentical(pathA: string, pathB: string): boolean {
  try {
    const sizeA = statSync(pathA).size
    const sizeB = statSync(pathB).size
    if (sizeA !== sizeB) {
      return false
    }
    const hashA = createHash('sha256').update(readFileSync(pathA)).digest('hex')
    const hashB = createHash('sha256').update(readFileSync(pathB)).digest('hex')
    return hashA === hashB
  } catch {
    return false
  }
}

/**
 * Reads `filePath`'s interface-version strings via
 * `readInterfaceVersionStrings`, returning `[]` (with a logged warning,
 * never a throw) on any read failure -- a missing/unreadable file degrades
 * to "no versions found" rather than aborting placement, since an absent
 * version pool just means every required family resolves as
 * `<family>@unknown-version` further down (the same fail-named-not-silent
 * shape `resolveRequiredInterfaceVersions` already produces for a truly
 * version-less file).
 */
export async function readVersionsOrEmpty(
  filePath: string,
  appId: string
): Promise<string[]> {
  const result = await readInterfaceVersionStrings(filePath)
  if (result.status === 'error') {
    logWarning(
      `placeShimForGame: could not read interface-version strings from "${filePath}" for appId ${appId}: ${result.error}`,
      LogPrefix.Steam
    )
    return []
  }
  return result.versions
}

/**
 * quick 261024-j4l (T-j4l-04): puts a game-original dll back from its
 * `.gamelib-orig` backup. Both paths must sit inside the bottle, the backup
 * must be a regular non-symlink file and must not carry shim bytes. The
 * backup is kept. Never throws.
 */
export function restoreOriginalIfBackedUp(
  bottleDir: string,
  target: string,
  appId: string
): 'restored' | 'no-backup' | 'refused' {
  const backup = target + ORIGINAL_BACKUP_SUFFIX
  try {
    if (
      !isContainedWithin(bottleDir, resolve(target)) ||
      !isContainedWithin(bottleDir, resolve(backup))
    ) {
      return 'refused'
    }
    let backupStat
    try {
      backupStat = lstatSync(backup)
    } catch {
      backupStat = null
    }
    if (!backupStat || backupStat.isSymbolicLink() || !backupStat.isFile()) {
      return 'no-backup'
    }
    if (isGameLibShimBytes(readFileSync(backup))) {
      logWarning(
        `placeShimForGame: appId ${appId}: "${backup}" carries shim bytes (tampered?) -- not restoring it`,
        LogPrefix.Steam
      )
      return 'refused'
    }
    copyFileSync(backup, target)
    logInfo(
      `placeShimForGame: appId ${appId} restored the game-original ${basename(target)} from ${ORIGINAL_BACKUP_SUFFIX}`,
      LogPrefix.Steam
    )
    return 'restored'
  } catch (error) {
    logWarning(
      [
        `placeShimForGame: appId ${appId}: could not restore "${target}" from its backup`,
        error
      ],
      LogPrefix.Steam
    )
    return 'refused'
  }
}

/**
 * Phase 52 Plan 15: read-only twin of `restoreOriginalIfBackedUp`. Runs the
 * same containment / lstat / not-shim-bytes checks but never copies and never
 * logs, so the withhold guard can decide BEFORE touching the disk whether
 * every GameLib shim in scope can really be put back (T-52-55).
 */
export function probeOriginalBackup(
  bottleDir: string,
  target: string
): 'restorable' | 'no-backup' | 'refused' {
  const backup = target + ORIGINAL_BACKUP_SUFFIX
  try {
    if (
      !isContainedWithin(bottleDir, resolve(target)) ||
      !isContainedWithin(bottleDir, resolve(backup))
    ) {
      return 'refused'
    }
    let backupStat
    try {
      backupStat = lstatSync(backup)
    } catch {
      backupStat = null
    }
    if (!backupStat || backupStat.isSymbolicLink() || !backupStat.isFile()) {
      return 'no-backup'
    }
    return isGameLibShimBytes(readFileSync(backup)) ? 'refused' : 'restorable'
  } catch {
    return 'refused'
  }
}
