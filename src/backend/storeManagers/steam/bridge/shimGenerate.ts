/**
 * Phase 24 Plan 05 (R3, Task 2): automatic per-bottle `steam_api.dll` shim
 * placement -- the per-game bottle-setup hook that makes an allowlisted
 * game bridge-ready. No manual copy step; a single callable
 * (`placeShimForGame`) is the sole entry point, intended for 24-08's
 * `installBridgeGame()` to call inline.
 *
 * Sanitize-then-place shape mirrors `bottle.ts`'s `provisionBottle()`
 * (24-PATTERNS.md "shimGenerate.ts"): reject unsafe inputs before ANY
 * path/copy operation, then an idempotent byte-IDENTITY guard (D-UAT-24-04,
 * fixed 24-11 -- was a pure existence guard that always short-circuited)
 * before doing real work.
 *
 * ACKNOWLEDGED DIVERGENCE (review finding #9, must_haves): the placed
 * shim is 24-01's single SUPERSET `steam_api.def` (`FLAT_EXPORTS_SUPERSET`
 * in `meta/gen_vtables.ts`), not a per-game-tailored export set. This
 * module's objdump-derived import set (via `importScan.ts`) is used to
 * VALIDATE coverage (superset ⊇ game imports), not to drive per-game
 * generation. A game whose imports exceed the superset is rejected with
 * NO auto-remediation -- surfaced to the caller via a typed 'miss' result
 * (Phase 51 Plan 07: this used to throw the verdict away as a bare
 * `'error'`; it now returns the full `SteamBridgeScanVerdict` for the
 * caller to persist, D-51-07).
 *
 * BLOCKER 2: the compiled x86 `.dll` is read from `builtBridgeShimPath`
 * (`backend/constants/paths.ts`, 24-01) -- the SAME shared location 24-07
 * (packaging) writes to. This module never invents a second/divergent
 * shim location. At dev time the `.dll` may not exist yet (built by 24-07
 * at packaging) -- that is a typed `'shim-not-built'` result, not a throw.
 * Phase 51 Plan 07 adds the arch-aware x64 counterpart
 * (`builtBridgeShim64Path`) alongside it, same rule.
 *
 * Phase 51 Plan 07 (D-51-07/D-51-13): placement is now arch-aware (a game
 * importing `steam_api64.dll` places `steam_api64.dll`, sourced from the
 * x64 shim) and captures the game's required interface VERSIONS -- not
 * just its flat symbol imports -- from the game's own original
 * `steam_api(64)?.dll` (and, for runtime-interface-lookup games, its exe)
 * BEFORE that original is overwritten. The returned verdict (missing
 * symbols, resolved versions, stubbed interfaces, the shim export-set
 * stamp) is exactly `SteamBridgeScanVerdict` -- the same shape 51-09
 * persists and 51-07's `resolveBridgeRoute` reads back.
 */

import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  builtBridgeShim64Path,
  builtBridgeShimPath
} from 'backend/constants/paths'
import type { SteamBridgeScanVerdict } from '../electronStores'
import {
  getBottleDir,
  resolveBridgeBottleName,
  sanitizeBottleName
} from '../bottle'
import { scanSteamApiImports } from './importScan'
import {
  readInterfaceVersionStrings,
  resolveRequiredInterfaceVersions,
  usesRuntimeInterfaceLookup
} from './interfaceVersions'
// Phase 51 Plan 03 (ROADMAP sub-decision 2 / D-51-07): SHIM_EXPORTED_SYMBOLS
// (and now, Phase 51 Plan 07, the whole coverage verdict) lives in
// shimCoverage.ts -- that module is the SOLE place the shim's export-set
// literal and served-interface-version coverage dimension live. See
// shimCoverage.ts's own docblock for the 24-CR-02 provenance and the
// CR-02 review-pass obligation on any SDK bump.
import { evaluateShimCoverage, SHIM_EXPORT_SET_VERSION } from './shimCoverage'

// Pattern repeated verbatim across bottle.ts:836, clientSetup.ts:40,
// importScan.ts -- reuse the SAME regex value/name, do not redefine a
// divergent one.
const NUMERIC_APP_ID = /^\d+$/

const BRIDGE_SHIM_FILENAME = 'steam_api.dll'
const BRIDGE_SHIM64_FILENAME = 'steam_api64.dll'

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
type PlaceShimResult =
  | {
      status: 'placed' | 'already-placed'
      shimPath: string
      verdict?: SteamBridgeScanVerdict
    }
  | { status: 'miss'; verdict: SteamBridgeScanVerdict }
  | { status: 'no-steam-api'; verdict: SteamBridgeScanVerdict }
  | { status: 'shim-not-built'; arch: 'x86' | 'x64' }
  | { status: 'error'; error: string }

/**
 * True iff `candidateAbsPath` resolves to a location strictly inside
 * `rootAbsPath` (steam-two-install-paths-acf-location / MAC32 lesson:
 * `path.join`/string-prefix checks are NOT containment -- use
 * `path.resolve` + `path.relative` and reject `..`/absolute results).
 */
function isContainedWithin(
  rootAbsPath: string,
  candidateAbsPath: string
): boolean {
  const rel = relative(rootAbsPath, candidateAbsPath)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
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
function isByteIdentical(pathA: string, pathB: string): boolean {
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
async function readVersionsOrEmpty(
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
 * Places the shared, superset-exporting `steam_api(64)?.dll` shim next to
 * a bridge-eligible game's own `.exe` inside the bridge bottle,
 * OVERWRITING whatever is already at that path unless it is already
 * byte-identical to the built shim. Every input is guarded before any
 * path/copy operation:
 *  1. appId must be numeric (T-24-06).
 *  2. bottleName (default: this game's own per-game bridge bottle, via
 *     resolveBridgeBottleName -- quick/261016-u1w D-B) must sanitize clean
 *     (T-24-06, same `sanitizeBottleName` chokepoint `provisionBridgeBottle`
 *     uses).
 *  3. `gameExePath` must resolve INSIDE that bottle's directory --
 *     rejects a path escaping the bottle before touching the filesystem.
 *
 * Phase 51 Plan 07: the game's import scan runs BEFORE the arch/filename
 * is known (imports, not just the exe, say whether this is a `steam_api.dll`
 * or `steam_api64.dll` title) -- an exe importing nothing from
 * `steam_api(64)?.dll` at all short-circuits to `'no-steam-api'` here,
 * before any path is even computed. This means the import scan now runs on
 * EVERY call (unlike the pre-51-07 shape, which skipped it once a shim was
 * already byte-identical in place) -- objdump is cheap, and there is no
 * way to know a game's target FILENAME without it.
 *
 * D-UAT-24-04 (BLOCKER, fixed 24-11): the overwrite guard is by IDENTITY,
 * not existence. If a file is present at the computed `shimPath` and it is
 * already byte-identical to the built shim, placement is a no-op success
 * (`already-placed`, no needless churn, no verdict -- the caller keeps
 * whatever verdict it already persisted). Otherwise -- including when the
 * game's own, byte-DIFFERENT original `steam_api(64)?.dll` is present, or
 * an OLDER GameLib shim release is present -- the interface-version
 * capture and coverage check run first, and only on a covered pass does
 * `copyFileSync` OVERWRITE the target.
 *
 * Interface-version capture (D-51-07): when the file currently at
 * `shimPath` is the game's own original dll (`!isGameLibShimBytes`), its
 * version strings are read from THAT file -- BEFORE it is overwritten.
 * When the file at `shimPath` is already an older GameLib shim (there is
 * no "original" left to read), `opts.persistedInterfaceVersions` supplies
 * the versions instead (the caller's own previously-persisted verdict);
 * absent that, every required family resolves as unknown-version (a named
 * miss, never a silent guess). Runtime-interface-lookup games
 * (`usesRuntimeInterfaceLookup`) also read the exe's own version strings
 * into the same pool.
 *
 * `shimSourcePath`/`shim64SourcePath` default to the real, shared
 * `builtBridgeShimPath`/`builtBridgeShim64Path` (BLOCKER 2) -- callers
 * never need to pass them; the parameters exist so this module's own
 * tests can point at fixture files without mocking module-level constants.
 */
export async function placeShimForGame(
  appId: string,
  gameExePath: string,
  opts?: {
    bottleName?: string
    shimSourcePath?: string
    shim64SourcePath?: string
    persistedInterfaceVersions?: Record<string, string>
  }
): Promise<PlaceShimResult> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `placeShimForGame: rejected non-numeric appId "${appId}" -- not placing a shim (T-24-06)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid appId: "${appId}"` }
  }

  // quick/261016-u1w (D-B): default to THIS game's own per-game bridge
  // bottle (resolveBridgeBottleName), never the shared legacy name. A null
  // result (unreachable in practice -- appId already passed NUMERIC_APP_ID
  // above, and resolveBridgeBottleName applies the identical guard) falls
  // through to sanitizeBottleName's own typeof-string guard below, taking
  // the existing rejected-bottle-name error branch rather than silently
  // substituting a different bottle.
  const rawBottleName = opts?.bottleName ?? resolveBridgeBottleName(appId)
  const bottleName = sanitizeBottleName(rawBottleName)
  if (!bottleName) {
    logError(
      `placeShimForGame: rejected unsafe bottle name "${rawBottleName}" for appId ${appId} (T-24-06)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid bottle name: "${rawBottleName}"` }
  }

  const bottleDir = resolve(getBottleDir(bottleName))
  const resolvedExePath = resolve(gameExePath)
  if (!isContainedWithin(bottleDir, resolvedExePath)) {
    logWarning(
      `placeShimForGame: rejected gameExePath "${gameExePath}" -- resolves outside bridge bottle "${bottleName}" (T-24-06)`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `Game exe path is outside the bridge bottle: "${gameExePath}"`
    }
  }

  // Scan FIRST: the arch (and therefore the target filename) is not known
  // until the exe's own import table says so.
  const importResult = await scanSteamApiImports(appId, resolvedExePath)
  if (importResult.status === 'error') {
    return { status: 'error', error: importResult.error }
  }

  const scannedAt = new Date().toISOString()

  if (importResult.arch === 'none') {
    logInfo(
      `placeShimForGame: appId ${appId} imports nothing from steam_api(64)?.dll -- no-steam-api`,
      LogPrefix.Steam
    )
    return {
      status: 'no-steam-api',
      verdict: {
        status: 'clean',
        // No import at all means arch is moot; x86 is the harmless default
        // (never consulted by any caller for a 'no-steam-api' verdict).
        arch: 'x86',
        missingSymbols: [],
        interfaceVersions: {},
        stubbedInterfaces: [],
        shimExportSetVersion: SHIM_EXPORT_SET_VERSION,
        scannedAt
      }
    }
  }

  const arch = importResult.arch
  const filename =
    arch === 'x64' ? BRIDGE_SHIM64_FILENAME : BRIDGE_SHIM_FILENAME
  const shimPath = join(dirname(resolvedExePath), filename)

  const shimSourcePath =
    arch === 'x64'
      ? (opts?.shim64SourcePath ?? builtBridgeShim64Path)
      : (opts?.shimSourcePath ?? builtBridgeShimPath)

  if (!existsSync(shimSourcePath)) {
    // Dev-time expected state (x86), or simply "not shipped yet" (x64,
    // D-51-13 -- there is no Win64 shim target at all until 51-15). NOT an
    // error -- a typed result the caller (and 51-07's route resolver, via
    // the persisted verdict) can surface distinctly.
    logInfo(
      `placeShimForGame: built ${arch} shim not present yet at "${shimSourcePath}" -- appId ${appId}`,
      LogPrefix.Steam
    )
    return { status: 'shim-not-built', arch }
  }

  // Identity guard (D-UAT-24-04): the shim is already OURS iff a file is
  // present at shimPath AND it is byte-identical to the built shim -- only
  // then is placement a true no-op, with no verdict (the caller keeps
  // whatever it already persisted).
  if (existsSync(shimPath) && isByteIdentical(shimPath, shimSourcePath)) {
    logInfo(
      `placeShimForGame: shim already present and byte-identical at "${shimPath}" for appId ${appId} (idempotent, no-op)`,
      LogPrefix.Steam
    )
    return { status: 'already-placed', shimPath }
  }

  const symbols = importResult.symbols
  const targetExists = existsSync(shimPath)
  let targetIsGameLibShim = false
  if (targetExists) {
    try {
      targetIsGameLibShim = isGameLibShimBytes(readFileSync(shimPath))
    } catch {
      // A read race (e.g. the target disappearing between the existsSync
      // check and this read) falls through to "not a GameLib shim" --
      // the safe default, since it means we fall through to attempting to
      // read it as the game's original below (which will itself fail
      // gracefully via readVersionsOrEmpty).
      targetIsGameLibShim = false
    }
  }

  // D-51-07: capture interface versions from the game's ORIGINAL dll --
  // the file currently at shimPath, read BEFORE it is ever overwritten --
  // unless that file is already one of OUR shims (an older release, with
  // no "original" left to read), in which case the caller's own
  // previously-persisted verdict is the only source left.
  const dllVersions = targetIsGameLibShim
    ? Object.values(opts?.persistedInterfaceVersions ?? {})
    : targetExists
      ? await readVersionsOrEmpty(shimPath, appId)
      : []

  const exeVersions = usesRuntimeInterfaceLookup(symbols)
    ? await readVersionsOrEmpty(resolvedExePath, appId)
    : []

  const { required, problems } = resolveRequiredInterfaceVersions({
    importedSymbols: symbols,
    dllVersions,
    exeVersions
  })

  const coverage = evaluateShimCoverage({
    arch,
    symbols,
    requiredInterfaceVersions: required,
    versionProblems: problems
  })

  if (coverage.missingSymbols.length > 0) {
    logError(
      `placeShimForGame: rejected placement for appId ${appId} -- shim coverage miss: ${coverage.missingSymbols.join(', ')} (Constraint: a drop-in shim must cover every imported symbol/interface version; the target file is left unmodified)`,
      LogPrefix.Steam
    )
    return {
      status: 'miss',
      verdict: {
        status: 'miss',
        arch,
        missingSymbols: coverage.missingSymbols,
        interfaceVersions: required,
        stubbedInterfaces: coverage.stubbedInterfaces,
        shimExportSetVersion: SHIM_EXPORT_SET_VERSION,
        scannedAt
      }
    }
  }

  try {
    copyFileSync(shimSourcePath, shimPath)
  } catch (error) {
    logError(
      [`placeShimForGame: copyFileSync failed for appId ${appId}`, error],
      LogPrefix.Steam
    )
    return { status: 'error', error: `Failed to place shim: ${String(error)}` }
  }

  logInfo(
    `placeShimForGame: ${targetExists ? 'overwrote' : 'placed'} ${filename} for appId ${appId} at "${shimPath}" (${symbols.length} imported symbol(s) covered)`,
    LogPrefix.Steam
  )
  return {
    status: 'placed',
    shimPath,
    verdict: {
      status: 'clean',
      arch,
      missingSymbols: [],
      interfaceVersions: required,
      stubbedInterfaces: coverage.stubbedInterfaces,
      shimExportSetVersion: SHIM_EXPORT_SET_VERSION,
      scannedAt
    }
  }
}
