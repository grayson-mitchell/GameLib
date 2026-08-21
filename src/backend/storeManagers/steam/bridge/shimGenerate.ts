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
 * NO auto-remediation -- surfaced to the caller/verifier, not silent.
 *
 * BLOCKER 2: the compiled `.dll` is read from `builtBridgeShimPath`
 * (`backend/constants/paths.ts`, 24-01) -- the SAME shared location 24-07
 * (packaging) writes to. This module never invents a second/divergent
 * shim location. At dev time the `.dll` may not exist yet (built by 24-07
 * at packaging) -- that is a typed `'shim-not-built'` result, not a throw.
 */

import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { builtBridgeShimPath } from 'backend/constants/paths'
import {
  DEFAULT_BRIDGE_BOTTLE_NAME,
  getBottleDir,
  sanitizeBottleName
} from '../bottle'
import { scanSteamApiImports } from './importScan'

// Pattern repeated verbatim across bottle.ts:836, clientSetup.ts:40,
// importScan.ts -- reuse the SAME regex value/name, do not redefine a
// divergent one.
const NUMERIC_APP_ID = /^\d+$/

const BRIDGE_SHIM_FILENAME = 'steam_api.dll'

// Mirrors meta/gen_vtables.ts's FLAT_EXPORTS_SUPERSET PLUS the two
// per-interface accessor exports `generateDefFile` appends
// (`...accessorExports`, meta/gen_vtables.ts) -- the single source of
// truth for what 24-01's generator (and 24-07's packaging build) emits
// into the compiled shim's export table (12 symbols total: 10 flat +
// SteamAPI_SteamUser_v023 + SteamAPI_SteamFriends_v018, matching
// native/steam-bridge/generated/steam_api.def exactly). `src/` cannot
// statically import `meta/` (tsconfig `include` is `["src"]` only, and the
// compiled `.dll` ships without its source `.def` at packaged runtime --
// BLOCKER 2 is only a contract for the BINARY path, not the source tree),
// so this is a reviewed, literal copy rather than a derived import. An SDK
// bump/export change in the generator (D-07: regenerate + review the
// source diff) -- including adding/renaming an interface accessor -- must
// update this list in the same review pass (CR-02: a stale copy here
// wrongly rejects every game that imports an interface accessor).
const SHIM_EXPORTED_SYMBOLS: ReadonlySet<string> = new Set([
  'SteamAPI_Init',
  'SteamAPI_InitFlat',
  'SteamAPI_Shutdown',
  'SteamAPI_RestartAppIfNecessary',
  'SteamAPI_IsSteamRunning',
  'SteamAPI_RunCallbacks',
  'SteamAPI_RegisterCallback',
  'SteamAPI_UnregisterCallback',
  'SteamAPI_RegisterCallResult',
  'SteamAPI_UnregisterCallResult',
  'SteamAPI_SteamUser_v023',
  'SteamAPI_SteamFriends_v018'
])

export type PlaceShimResult =
  | { status: 'placed'; shimPath: string }
  | { status: 'already-placed'; shimPath: string }
  | { status: 'shim-not-built' }
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
 * Places the shared, superset-exporting `steam_api.dll` shim next to a
 * bridge-eligible game's own `.exe` inside the bridge bottle, OVERWRITING
 * whatever is already at that path unless it is already byte-identical to
 * the built shim. Every input is guarded before any path/copy operation:
 *  1. appId must be numeric (T-24-06).
 *  2. bottleName (default: the shared bridge bottle) must sanitize clean
 *     (T-24-06, same `sanitizeBottleName` chokepoint `provisionBridgeBottle`
 *     uses).
 *  3. `gameExePath` must resolve INSIDE that bottle's directory --
 *     rejects a path escaping the bottle before touching the filesystem.
 *
 * D-UAT-24-04 (BLOCKER, fixed 24-11): the guard is by IDENTITY, not
 * existence. The game's depot download runs BEFORE this function and ships
 * its own `steam_api.dll` at exactly `shimPath` -- a pure
 * `if (existsSync(shimPath)) return` guard therefore ALWAYS short-circuited
 * and the real bridge shim never replaced the game's own copy, so the
 * bridge never engaged at runtime. Now: if a file is present at `shimPath`
 * and it is already byte-identical to the built shim, placement is a no-op
 * success (`already-placed`, no needless churn). Otherwise -- including
 * when the game's own, byte-DIFFERENT `steam_api.dll` is present -- the
 * import-coverage check still runs first, and only on a covered pass does
 * `copyFileSync` OVERWRITE the target with the trusted, superset-exporting
 * shim from `shimSourcePath`.
 *
 * `shimSourcePath` defaults to the real, shared `builtBridgeShimPath`
 * (BLOCKER 2) -- callers never need to pass it; the parameter exists so
 * this module's own tests can point at a fixture file without mocking a
 * module-level constant.
 */
export async function placeShimForGame(
  appId: string,
  gameExePath: string,
  opts?: { bottleName?: string; shimSourcePath?: string }
): Promise<PlaceShimResult> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `placeShimForGame: rejected non-numeric appId "${appId}" -- not placing a shim (T-24-06)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid appId: "${appId}"` }
  }

  const rawBottleName = opts?.bottleName ?? DEFAULT_BRIDGE_BOTTLE_NAME
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

  const shimPath = join(dirname(resolvedExePath), BRIDGE_SHIM_FILENAME)

  // Resolve the trusted source FIRST -- a missing built shim is still a
  // clean typed result even when a game dll is already present at
  // shimPath (moved above the identity check, D-UAT-24-04).
  const shimSourcePath = opts?.shimSourcePath ?? builtBridgeShimPath
  if (!existsSync(shimSourcePath)) {
    // Dev-time expected state: 24-07 (packaging) builds the .dll into
    // this exact shared location at package/build time. NOT an error --
    // a typed result the caller (24-08) can surface distinctly.
    logInfo(
      `placeShimForGame: built shim not present yet at "${shimSourcePath}" (built at packaging by 24-07) -- appId ${appId}`,
      LogPrefix.Steam
    )
    return { status: 'shim-not-built' }
  }

  // Identity guard (D-UAT-24-04, replaces the old pure-existence
  // short-circuit): the shim is already OURS iff a file is present at
  // shimPath AND it is byte-identical to the built shim -- only then is
  // placement a true no-op. A byte-different file at shimPath (most
  // commonly the game's own depot-shipped steam_api.dll) falls through to
  // the coverage-checked overwrite below.
  if (existsSync(shimPath) && isByteIdentical(shimPath, shimSourcePath)) {
    logInfo(
      `placeShimForGame: shim already present and byte-identical at "${shimPath}" for appId ${appId} (idempotent, no-op)`,
      LogPrefix.Steam
    )
    return { status: 'already-placed', shimPath }
  }

  const importResult = await scanSteamApiImports(appId, resolvedExePath)
  if (importResult.status === 'error') {
    return { status: 'error', error: importResult.error }
  }

  const uncoveredSymbols = importResult.symbols.filter(
    (symbol) => !SHIM_EXPORTED_SYMBOLS.has(symbol)
  )
  if (uncoveredSymbols.length > 0) {
    logError(
      `placeShimForGame: rejected placement for appId ${appId} -- shim export set does not cover imported symbol(s): ${uncoveredSymbols.join(', ')} (Constraint: a drop-in shim must export EVERY imported symbol)`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `Shim does not export required symbol(s): ${uncoveredSymbols.join(', ')}`
    }
  }

  const wasPresent = existsSync(shimPath)
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
    `placeShimForGame: ${wasPresent ? 'overwrote' : 'placed'} steam_api.dll for appId ${appId} at "${shimPath}" (${importResult.symbols.length} imported symbol(s) covered)`,
    LogPrefix.Steam
  )
  return { status: 'placed', shimPath }
}
