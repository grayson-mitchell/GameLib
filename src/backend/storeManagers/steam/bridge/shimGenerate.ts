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
 * generation. A game whose imports exceed the superset was, originally,
 * rejected with NO auto-remediation -- surfaced to the caller via a typed
 * 'miss' result (Phase 51 Plan 07: this used to throw the verdict away as a
 * bare `'error'`; it returned the full `SteamBridgeScanVerdict` for the
 * caller to persist, D-51-07). SUPERSEDED, see the next paragraph.
 *
 * Amended 2026-10-23 (quick 261023-oq7, user: "Place shim anyway"): a
 * coverage miss no longer withholds the shim. The shim is placed anyway and
 * the result is 'placed-miss' carrying the same miss verdict, which the
 * caller persists. Per the user, bottled Steam is a narrow fallback to
 * eliminate; the recorded missingSymbols drive shim widening. Caveat: an
 * exe whose STATIC imports the shim lacks will most likely fail at load
 * with a Windows "entry point not found" error. That is expected by design.
 * A `<dll>@runtime-loaded` marker (51-22, CR-04) is a miss without that
 * load-time failure, and such titles may play.
 *
 * Amended 2026-10-24 (quick 261024-j4l, Manor Lords 1363080): static-import
 * misses and marker-only misses are still placed anyway, but a delay-imported
 * missing symbol or an unservable interface version WITH importer evidence is
 * withheld: the shim is not placed (a GameLib shim already on disk is
 * restored from `<dll>.gamelib-orig`) and the result is 'withheld' carrying
 * the persisted miss verdict. Every overwrite of a game-original dll keeps a
 * `.gamelib-orig` backup.
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

import {
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  statSync
} from 'node:fs'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve
} from 'node:path'
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
import { runtimeLoadedSteamApiMarker } from './importParse'
import { detectSteamDrmInPe, readPeMachineArch } from './peSteamDrm'
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
import {
  evaluateShimCoverage,
  findUnservableInterfaceVersions,
  SHIM_EXPORT_SET_VERSION
} from './shimCoverage'

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
type PlaceShimResultBase =
  | {
      status: 'placed' | 'already-placed'
      shimPath: string
      // quick 261023-ue0: runtime-loaded branch only -- EVERY live shim path.
      shimPaths?: string[]
      verdict?: SteamBridgeScanVerdict
    }
  | {
      // quick 261023-oq7: the shim was placed despite a coverage miss.
      status: 'placed-miss'
      shimPaths: string[]
      verdict: SteamBridgeScanVerdict
    }
  | { status: 'no-steam-api'; verdict: SteamBridgeScanVerdict }
  | {
      // quick 261024-j4l: importer evidence names gaps the shim cannot serve
      // (delay-imported missing symbols / unservable interface versions), so
      // the shim was NOT placed (or was withdrawn). The caller launches with
      // the game's own steam_api and no helper. `restored`: the dlls put back
      // from `.gamelib-orig`.
      status: 'withheld'
      verdict: SteamBridgeScanVerdict
      restored: string[]
    }
  | { status: 'shim-not-built'; arch: 'x86' | 'x64' }
  | { status: 'error'; error: string }

/** Quick 261024-br4: Steam CEG DRM found in the game exe. */
type SteamExeDrmSignal = { kind: 'ceg'; markers: string[] }

/** `drm`: an object means CEG was detected; `null` means the exe parsed as
 * a PE and is not CEG; absent means not checked (an 'error' result) or the
 * PE did not parse (treated as not CEG). */
type PlaceShimResult = PlaceShimResultBase & {
  drm?: SteamExeDrmSignal | null
}

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

const RUNTIME_WALK_MAX_DEPTH = 4

// quick 261024-j4l: the game-original steam_api(64) dll is copied here before
// the shim overwrites it, so the guard can restore it. Both walks exclude the
// backup by construction (exact-name dll match; .exe/.dll-only importer walk).
const ORIGINAL_BACKUP_SUFFIX = '.gamelib-orig'

/**
 * quick 261024-j4l (T-j4l-03): keeps the game-original dll as
 * `<target>.gamelib-orig` before it is overwritten. Never backs up a GameLib
 * shim, refuses a symlink / non-regular backup path, and requires the backup
 * to sit inside the bottle. Never throws.
 */
function backupOriginalBeforeOverwrite(
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

interface RuntimeSteamApiDll {
  name: 'steam_api.dll' | 'steam_api64.dll'
  path: string
  /** True when the file at `path` is already a GameLib shim (quick 261023-oq7). */
  isGameLibShim: boolean
}

/**
 * CR-04 / T-51-45: bounded walk of the game's install tree for
 * steam_api(64).dll files -- the game's own AND, since quick 261023-oq7
 * (the shim is placed over a runtime-loaded dll), GameLib shims, flagged
 * `isGameLibShim`. Async fs only, depth-limited, never follows symlinks.
 */
async function findRuntimeLoadedSteamApiDlls(
  root: string,
  extraRoots: string[] = []
): Promise<RuntimeSteamApiDll[]> {
  const found: RuntimeSteamApiDll[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < RUNTIME_WALK_MAX_DEPTH) await walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const lower = entry.name.toLowerCase()
      // Exact names only: `<dll>.gamelib-orig` backups never match (j4l).
      if (lower !== 'steam_api.dll' && lower !== 'steam_api64.dll') continue
      let isShim: boolean
      try {
        if ((await lstat(full)).isSymbolicLink()) continue
        isShim = isGameLibShimBytes(await readFile(full))
      } catch {
        continue
      }
      found.push({ name: lower, path: full, isGameLibShim: isShim })
    }
  }
  await walk(root, 0)
  // quick 261024-ir1: extra roots (the Unreal Steamworks dir) get the same
  // bounded walk; dedupe by resolved path since they overlap the main walk.
  for (const extra of extraRoots) await walk(extra, 0)
  const seenPaths = new Set<string>()
  return found.filter((d) => {
    const key = resolve(d.path)
    if (seenPaths.has(key)) return false
    seenPaths.add(key)
    return true
  })
}

/**
 * quick 261024-ir1: Unreal Engine 4/5 layout probe. UE games launch a
 * bootstrap stub `<P>.exe` that imports nothing from steam_api; the real
 * importer is `<P>/Binaries/Win64/<P>-Win64-Shipping.exe` and the dll lives
 * at `Engine/Binaries/ThirdParty/Steamworks/Steamv*\/Win64/` -- 6 directories
 * below the install root, past RUNTIME_WALK_MAX_DEPTH (field cases: Manor
 * Lords 1363080, Abiotic Factor 427410, Ranch Simulator 1119730). Returns
 * null unless a real `Engine/` dir sits beside the stub. Async fs only,
 * lstat-checked at every segment, contained in the bottle (T-ir1-01..03).
 */
const UE_SHIPPING_EXE = /-shipping\.exe$/
const UE_SHIPPING_MAX = 8

async function isRealDir(path: string): Promise<boolean> {
  try {
    const st = await lstat(path)
    return st.isDirectory() && !st.isSymbolicLink()
  } catch {
    return false
  }
}

async function findUnrealLayout(
  bottleDir: string,
  ueRoot: string
): Promise<{ steamworksDir: string | null; shippingExes: string[] } | null> {
  if (!(await isRealDir(join(ueRoot, 'Engine')))) return null

  let steamworksDir: string | null = join(
    ueRoot,
    'Engine',
    'Binaries',
    'ThirdParty',
    'Steamworks'
  )
  for (const seg of [
    join(ueRoot, 'Engine', 'Binaries'),
    join(ueRoot, 'Engine', 'Binaries', 'ThirdParty'),
    steamworksDir
  ]) {
    if (!(await isRealDir(seg))) {
      steamworksDir = null
      break
    }
  }
  if (
    steamworksDir !== null &&
    !isContainedWithin(bottleDir, resolve(steamworksDir))
  ) {
    steamworksDir = null
  }

  const shippingExes: string[] = []
  let top
  try {
    top = await readdir(ueRoot, { withFileTypes: true })
  } catch {
    return { steamworksDir, shippingExes }
  }
  for (const entry of top) {
    if (entry.isSymbolicLink() || !entry.isDirectory()) continue
    if (entry.name.toLowerCase() === 'engine') continue
    const win64 = join(ueRoot, entry.name, 'Binaries', 'Win64')
    if (!(await isRealDir(join(ueRoot, entry.name)))) continue
    if (!(await isRealDir(join(ueRoot, entry.name, 'Binaries')))) continue
    if (!(await isRealDir(win64))) continue
    let files
    try {
      files = await readdir(win64, { withFileTypes: true })
    } catch {
      continue
    }
    for (const f of files) {
      if (f.isSymbolicLink() || !f.isFile()) continue
      if (!UE_SHIPPING_EXE.test(f.name.toLowerCase())) continue
      const full = join(win64, f.name)
      try {
        if ((await lstat(full)).isSymbolicLink()) continue
      } catch {
        continue
      }
      if (!isContainedWithin(bottleDir, resolve(full))) continue
      shippingExes.push(full)
    }
  }
  shippingExes.sort()
  return { steamworksDir, shippingExes: shippingExes.slice(0, UE_SHIPPING_MAX) }
}

/**
 * quick 261024-i94: the bottle-contained root both placement branches walk.
 * Containment is T-oq7-03 / T-24-06; the fallback is the exe's own folder.
 */
function resolveWalkRoot(
  bottleDir: string,
  resolvedExePath: string,
  gameInstallRoot: string | undefined
): string {
  return gameInstallRoot &&
    isContainedWithin(bottleDir, resolve(gameInstallRoot))
    ? resolve(gameInstallRoot)
    : dirname(resolvedExePath)
}

// Bounds objdump spawns on Unity/UE trees that ship hundreds of DLLs
// (T-i94-02). Hitting it logs one warning and stops the scan.
const IMPORTER_SCAN_MAX_FILES = 512
const PE_CANDIDATE_EXT = /\.(exe|dll)$/

interface SteamApiImporterPe {
  path: string
  arch: 'x86' | 'x64'
  symbols: string[]
  /** quick 261024-j4l: the subset read from the PE delay import table. */
  delaySymbols: string[]
}

/**
 * quick 261024-i94: bounded walk of the install tree for PEs OTHER than the
 * launch exe that import steam_api(64).dll (e.g. Grim Dawn's x64/Engine.dll).
 * Same walk shape as findRuntimeLoadedSteamApiDlls: async fs, depth-limited,
 * symlinks skipped (entry + lstat re-check). Candidates are .exe/.dll files
 * only; steam_api*.dll themselves and `excludePath` are never scanned. Scans
 * run sequentially; a scan error skips that file (T-i94-01..03).
 */
async function findSteamApiImporterPes(
  appId: string,
  root: string,
  excludePath: string,
  priorityPaths: string[] = []
): Promise<SteamApiImporterPe[]> {
  const found: SteamApiImporterPe[] = []
  const exclude = resolve(excludePath)
  let scanned = 0
  let capped = false
  // quick 261024-ir1: priority paths (Unreal Shipping exes) are scanned first,
  // outside the file cap, and never again by the walk.
  const seen = new Set<string>()
  for (const p of priorityPaths) {
    const key = resolve(p)
    seen.add(key)
    if (key === exclude) continue
    try {
      if ((await lstat(p)).isSymbolicLink()) continue
    } catch {
      continue
    }
    const result = await scanSteamApiImports(appId, p)
    if (result.status === 'ok' && result.arch !== 'none') {
      found.push({
        path: p,
        arch: result.arch,
        symbols: result.symbols,
        delaySymbols: result.delaySymbols ?? []
      })
    }
  }
  const walk = async (dir: string, depth: number): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (capped) return
      if (entry.isSymbolicLink()) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < RUNTIME_WALK_MAX_DEPTH) await walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const lower = entry.name.toLowerCase()
      // `.exe`/`.dll` only: a `.gamelib-orig` backup is never a candidate (j4l).
      if (!PE_CANDIDATE_EXT.test(lower)) continue
      if (lower === 'steam_api.dll' || lower === 'steam_api64.dll') continue
      if (resolve(full) === exclude || seen.has(resolve(full))) continue
      try {
        if ((await lstat(full)).isSymbolicLink()) continue
      } catch {
        continue
      }
      if (scanned >= IMPORTER_SCAN_MAX_FILES) {
        capped = true
        logWarning(
          `placeShimForGame: importer-PE scan hit the ${IMPORTER_SCAN_MAX_FILES}-file cap for appId ${appId} -- remaining files not scanned`,
          LogPrefix.Steam
        )
        return
      }
      scanned++
      const result = await scanSteamApiImports(appId, full)
      if (result.status === 'ok' && result.arch !== 'none') {
        found.push({
          path: full,
          arch: result.arch,
          symbols: result.symbols,
          delaySymbols: result.delaySymbols ?? []
        })
      }
    }
  }
  await walk(root, 0)
  return found
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
 * capture and coverage check run first, and then `copyFileSync` OVERWRITES
 * the target. Amended 2026-10-23 (quick 261023-oq7): this used to happen
 * "only on a covered pass"; a coverage miss now places the shim anyway and
 * returns 'placed-miss' (user: "Place shim anyway"). Caveat: a static-import
 * miss will most likely fail at load with a Windows entry-point error --
 * expected by design; a `<dll>@runtime-loaded` miss may play.
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
 *
 * Quick 261024-br4 (Steam CEG DRM): every non-'error' result also carries a
 * `drm` signal from a ranged PE resource scan of the game exe
 * (`peSteamDrm.ts`). The scan runs only AFTER the appId / bottle-name /
 * containment validation has passed (T-24-06, T-br4-03), so no byte of an
 * out-of-bottle path is ever read. The shim is still placed either way: the
 * caller decides, so a user's forced 'bridge' route keeps working.
 */
export async function placeShimForGame(
  appId: string,
  gameExePath: string,
  opts?: Parameters<typeof placeShimForGameInner>[2]
): Promise<PlaceShimResult> {
  const result = await placeShimForGameInner(appId, gameExePath, opts)
  if (result.status === 'error') return result
  const drm = detectExeSteamDrm(appId, resolve(gameExePath))
  return drm === undefined ? result : { ...result, drm }
}

/**
 * Quick 261024-br4: fd-based ranged reads of the exe into the pure
 * `peSteamDrm.ts` scanner -- never slurps the exe (T-br4-02), and the fd is
 * always closed. Returns undefined when the PE did not parse or the read
 * failed (logged, treated as not CEG). A SteamStub `.bind` section is
 * logged only: it never changes routing (SteamStub is in scope for the
 * bridge; bottled Steam is a narrow fallback).
 */
function detectExeSteamDrm(
  appId: string,
  exePath: string
): SteamExeDrmSignal | null | undefined {
  let fd: number | null = null
  try {
    fd = openSync(exePath, 'r')
    const handle = fd
    const result = detectSteamDrmInPe((offset, length) => {
      const buf = Buffer.alloc(length)
      const n = readSync(handle, buf, 0, length, offset)
      return n < length ? null : new Uint8Array(buf.buffer, buf.byteOffset, n)
    })
    if (!result.parsed) {
      logWarning(
        `placeShimForGame: Steam DRM detection could not parse the exe as a PE for appId ${appId} -- treating as not CEG`,
        LogPrefix.Steam
      )
      return undefined
    }
    if (result.hasBindSection) {
      logInfo(
        `placeShimForGame: SteamStub .bind section present in the exe for appId ${appId} (informational, no routing change)`,
        LogPrefix.Steam
      )
    }
    if (result.cegMarkers.length > 0) {
      logWarning(
        `placeShimForGame: Steam CEG DRM detected in the exe for appId ${appId} (${result.cegMarkers.join(', ')})`,
        LogPrefix.Steam
      )
      return { kind: 'ceg', markers: result.cegMarkers }
    }
    return null
  } catch (error) {
    logWarning(
      `placeShimForGame: Steam DRM detection could not read the exe for appId ${appId} -- treating as not CEG (${String(error)})`,
      LogPrefix.Steam
    )
    return undefined
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
 * quick 261024-j4l (T-j4l-04): puts a game-original dll back from its
 * `.gamelib-orig` backup. Both paths must sit inside the bottle, the backup
 * must be a regular non-symlink file and must not carry shim bytes. The
 * backup is kept. Never throws.
 */
function restoreOriginalIfBackedUp(
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
      logWarning(
        `placeShimForGame: appId ${appId}: the original ${basename(target)} is gone (no ${ORIGINAL_BACKUP_SUFFIX} backup) -- leaving the GameLib shim in place; restore it with Steam file verification`,
        LogPrefix.Steam
      )
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
 * quick 261024-j4l: the withhold result. Restores every GameLib-shim target
 * in scope, logs ONE warning naming the gaps, and returns the persisted
 * 'miss' verdict.
 */
function withhold(input: {
  appId: string
  bottleDir: string
  shimTargets: string[]
  arch: 'x86' | 'x64'
  required: Record<string, string>
  stubbedInterfaces: string[]
  allMissing: string[]
  delayMissing: string[]
  unservable: string[]
  scannedAt: string
}): PlaceShimResultBase {
  const restored: string[] = []
  for (const target of input.shimTargets) {
    const resolved = resolve(target)
    if (
      restoreOriginalIfBackedUp(input.bottleDir, resolved, input.appId) ===
      'restored'
    ) {
      restored.push(resolved)
    }
  }
  logWarning(
    `placeShimForGame: appId ${input.appId} withheld the shim -- importer evidence names gaps the shim cannot serve (delay-imported missing: ${input.delayMissing.join(', ') || 'none'}; unservable interface versions: ${input.unservable.join(', ') || 'none'}); launching with the game's own steam_api, no helper (quick 261024-j4l)`,
    LogPrefix.Steam
  )
  return {
    status: 'withheld',
    restored,
    verdict: {
      status: 'miss',
      arch: input.arch,
      missingSymbols: [...new Set([...input.allMissing, ...input.unservable])],
      interfaceVersions: input.required,
      stubbedInterfaces: input.stubbedInterfaces,
      shimExportSetVersion: SHIM_EXPORT_SET_VERSION,
      scannedAt: input.scannedAt
    }
  }
}

/**
 * quick 261024-i94: the launch exe's arch from its COFF header, via ranged fd
 * reads (never a slurp). null on any error or a non-PE -- never throws.
 */
function readExeMachineArch(exePath: string): 'x86' | 'x64' | null {
  let fd: number | null = null
  try {
    fd = openSync(exePath, 'r')
    const handle = fd
    return readPeMachineArch((offset, length) => {
      const buf = Buffer.alloc(length)
      const n = readSync(handle, buf, 0, length, offset)
      return n < length ? null : new Uint8Array(buf.buffer, buf.byteOffset, n)
    })
  } catch {
    return null
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

async function placeShimForGameInner(
  appId: string,
  gameExePath: string,
  opts?: {
    bottleName?: string
    shimSourcePath?: string
    shim64SourcePath?: string
    persistedInterfaceVersions?: Record<string, string>
    /** CR-04: root of the game's install tree, walked when the exe imports nothing. */
    gameInstallRoot?: string
  }
): Promise<PlaceShimResultBase> {
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
    const walkRoot = resolveWalkRoot(
      bottleDir,
      resolvedExePath,
      opts?.gameInstallRoot
    )
    const unreal = await findUnrealLayout(bottleDir, dirname(resolvedExePath))
    const runtimeDlls = await findRuntimeLoadedSteamApiDlls(
      walkRoot,
      unreal?.steamworksDir ? [unreal.steamworksDir] : []
    )
    if (runtimeDlls.length > 0) {
      const names = (['steam_api.dll', 'steam_api64.dll'] as const).filter(
        (n) => runtimeDlls.some((d) => d.name === n)
      )
      const sourceFor = (name: 'steam_api.dll' | 'steam_api64.dll') =>
        name === 'steam_api64.dll'
          ? (opts?.shim64SourcePath ?? builtBridgeShim64Path)
          : (opts?.shimSourcePath ?? builtBridgeShimPath)

      // A non-shim entry needs a built source to be replaced; refuse before
      // copying anything if one is missing.
      for (const dll of runtimeDlls) {
        if (!dll.isGameLibShim && !existsSync(sourceFor(dll.name))) {
          const missingArch = dll.name === 'steam_api64.dll' ? 'x64' : 'x86'
          logInfo(
            `placeShimForGame: built ${missingArch} shim not present yet for runtime-loaded ${dll.name} -- appId ${appId}`,
            LogPrefix.Steam
          )
          return { status: 'shim-not-built', arch: missingArch }
        }
      }

      // Entries that need a (re)copy: every game-original dll, plus any
      // GameLib shim that is no longer byte-identical to the current build.
      // (A shim entry whose source is not built cannot be refreshed; leave it.)
      const toCopy = runtimeDlls.filter((d) => {
        const source = sourceFor(d.name)
        if (!d.isGameLibShim) return true
        return existsSync(source) && !isByteIdentical(d.path, source)
      })

      // quick 261023-ue0: the backend writes gamelib_bridge.cfg beside every
      // reported shim, so every live shim must be reported -- including
      // already-current ones. Every entry is a GameLib shim once this call
      // returns.
      const allShimPaths = runtimeDlls.map((d) => resolve(d.path))

      if (toCopy.length === 0) {
        // Every entry is a current GameLib shim: a prior placed-miss. Never
        // downgrade to 'no-steam-api' (that would overwrite the persisted
        // miss and its marker); no verdict, the caller keeps its own.
        logInfo(
          `placeShimForGame: appId ${appId} runtime-loaded shim(s) already present and current (idempotent, no-op)`,
          LogPrefix.Steam
        )
        return {
          status: 'already-placed',
          shimPath: runtimeDlls[0].path,
          shimPaths: allShimPaths
        }
      }

      // quick 261024-i94: evaluate per shipped dll BEFORE the copy loop (the
      // original dlls' version strings must be read before they are
      // overwritten). Importers of the other arch than the launch exe never
      // load, so they are ignored; an unknown launch arch evaluates all.
      const launchArch = readExeMachineArch(resolvedExePath)
      const launchName: 'steam_api.dll' | 'steam_api64.dll' | null =
        launchArch === 'x64'
          ? 'steam_api64.dll'
          : launchArch === 'x86'
            ? 'steam_api.dll'
            : null
      const considered: Array<'steam_api.dll' | 'steam_api64.dll'> =
        launchName !== null && names.includes(launchName) ? [launchName] : names
      if (unreal) {
        logInfo(
          `placeShimForGame: Unreal layout for appId ${appId}; Shipping exe(s): ${
            unreal.shippingExes.map((p) => relative(walkRoot, p)).join(', ') ||
            'none'
          }`,
          LogPrefix.Steam
        )
      }
      const importers = await findSteamApiImporterPes(
        appId,
        walkRoot,
        resolvedExePath,
        unreal?.shippingExes ?? []
      )
      const combinedMissing: string[] = []
      const delayMissingAll: string[] = []
      const unservableAll: string[] = []
      let primaryEval: {
        required: Record<string, string>
        stubbedInterfaces: string[]
      } | null = null
      const primaryName: 'steam_api.dll' | 'steam_api64.dll' =
        considered.includes('steam_api64.dll')
          ? 'steam_api64.dll'
          : 'steam_api.dll'
      for (const name of considered) {
        const nameArch = name === 'steam_api64.dll' ? 'x64' : 'x86'
        const forName = importers.filter((i) => i.arch === nameArch)
        if (forName.length === 0) {
          combinedMissing.push(runtimeLoadedSteamApiMarker(name))
          continue
        }
        const merged = [...new Set(forName.flatMap((i) => i.symbols))]
        const original = runtimeDlls.find(
          (d) => d.name === name && !d.isGameLibShim
        )
        const dllVersions = original
          ? await readVersionsOrEmpty(original.path, appId)
          : Object.values(opts?.persistedInterfaceVersions ?? {})
        const exeVersions = usesRuntimeInterfaceLookup(merged)
          ? (
              await Promise.all(
                forName.map((i) => readVersionsOrEmpty(i.path, appId))
              )
            ).flat()
          : []
        const { required, problems } = resolveRequiredInterfaceVersions({
          importedSymbols: merged,
          dllVersions,
          exeVersions
        })
        const coverage = evaluateShimCoverage({
          arch: nameArch,
          symbols: merged,
          requiredInterfaceVersions: required,
          versionProblems: problems
        })
        combinedMissing.push(...coverage.missingSymbols)
        // quick 261024-j4l: guard inputs, importer evidence only (this block
        // is past the forName.length === 0 marker-only `continue`).
        const delaySet = new Set(forName.flatMap((i) => i.delaySymbols))
        delayMissingAll.push(
          ...coverage.missingSymbols.filter((m) => delaySet.has(m))
        )
        unservableAll.push(
          ...findUnservableInterfaceVersions({
            arch: nameArch,
            symbols: merged,
            requiredInterfaceVersions: required
          })
        )
        if (name === primaryName) {
          primaryEval = {
            required,
            stubbedInterfaces: coverage.stubbedInterfaces
          }
        }
      }

      if (delayMissingAll.length > 0 || unservableAll.length > 0) {
        return withhold({
          appId,
          bottleDir,
          shimTargets: runtimeDlls
            .filter((d) => d.isGameLibShim)
            .map((d) => d.path),
          arch: primaryName === 'steam_api64.dll' ? 'x64' : 'x86',
          required: primaryEval?.required ?? {},
          stubbedInterfaces: primaryEval?.stubbedInterfaces ?? [],
          allMissing: combinedMissing,
          delayMissing: [...new Set(delayMissingAll)],
          unservable: [...new Set(unservableAll)],
          scannedAt
        })
      }

      for (const dll of toCopy) {
        const target = resolve(dll.path)
        // T-oq7-03: every copy target must sit inside the bridge bottle.
        if (!isContainedWithin(bottleDir, target)) {
          logWarning(
            `placeShimForGame: refused to place over "${dll.path}" -- outside bridge bottle "${bottleName}" (T-oq7-03)`,
            LogPrefix.Steam
          )
          return {
            status: 'error',
            error: `Runtime-loaded dll path is outside the bridge bottle: "${dll.path}"`
          }
        }
        if (!dll.isGameLibShim) {
          const backedUp = backupOriginalBeforeOverwrite(
            bottleDir,
            target,
            appId
          )
          if (!backedUp.ok) {
            return {
              status: 'error',
              error: `Failed to back up the original ${dll.name}: ${backedUp.error}`
            }
          }
        }
        try {
          copyFileSync(sourceFor(dll.name), target)
        } catch (error) {
          logError(
            [
              `placeShimForGame: copyFileSync failed for runtime-loaded ${dll.name}, appId ${appId}`,
              error
            ],
            LogPrefix.Steam
          )
          return {
            status: 'error',
            error: `Failed to place shim: ${String(error)}`
          }
        }
      }

      const verdictBase = {
        arch:
          primaryName === 'steam_api64.dll'
            ? ('x64' as const)
            : ('x86' as const),
        interfaceVersions: primaryEval?.required ?? {},
        stubbedInterfaces: primaryEval?.stubbedInterfaces ?? [],
        shimExportSetVersion: SHIM_EXPORT_SET_VERSION,
        scannedAt
      }
      if (combinedMissing.length === 0) {
        logInfo(
          `placeShimForGame: appId ${appId} runtime-loaded steam_api covered by importer PE(s) ${importers.map((i) => relative(walkRoot, i.path)).join(', ')} -- shim placed (quick 261024-i94)`,
          LogPrefix.Steam
        )
        return {
          status: 'placed',
          shimPath: allShimPaths[0],
          shimPaths: allShimPaths,
          verdict: { status: 'clean', missingSymbols: [], ...verdictBase }
        }
      }
      logWarning(
        `placeShimForGame: appId ${appId} launch exe imports no steam_api but the install tree ships ${names.join(', ')} -- runtime-loaded${importers.length > 0 ? ` (importer PEs: ${importers.map((i) => relative(walkRoot, i.path)).join(', ')})` : ''}, recording a miss and placing the shim anyway (quick 261023-oq7, CR-04)`,
        LogPrefix.Steam
      )
      return {
        status: 'placed-miss',
        shimPaths: allShimPaths,
        verdict: {
          status: 'miss',
          missingSymbols: combinedMissing,
          ...verdictBase
        }
      }
    }
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

  // quick 261024-i94: other same-arch PEs in the install tree (Grim Dawn's
  // Engine.dll) import steam_api too -- merge their imports into the required
  // set. Runs only here, after the already-placed no-op above.
  const importerRoot = resolveWalkRoot(
    bottleDir,
    resolvedExePath,
    opts?.gameInstallRoot
  )
  const importers = (
    await findSteamApiImporterPes(appId, importerRoot, resolvedExePath)
  ).filter((i) => i.arch === importResult.arch)
  const symbols = [
    ...new Set([
      ...importResult.symbols,
      ...importers.flatMap((i) => i.symbols)
    ])
  ]
  if (importers.length > 0) {
    logInfo(
      `placeShimForGame: appId ${appId} merged steam_api imports from ${importers.map((i) => relative(importerRoot, i.path)).join(', ')}`,
      LogPrefix.Steam
    )
  }
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
    ? [
        ...(await readVersionsOrEmpty(resolvedExePath, appId)),
        ...(
          await Promise.all(
            importers.map((i) => readVersionsOrEmpty(i.path, appId))
          )
        ).flat()
      ]
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

  // quick 261024-j4l: importer evidence naming a delay-imported miss or an
  // unservable interface version withholds the shim (before any backup or
  // overwrite); a GameLib shim already on disk is restored from its backup.
  const delaySet = new Set([
    ...(importResult.delaySymbols ?? []),
    ...importers.flatMap((i) => i.delaySymbols)
  ])
  const delayMissing = coverage.missingSymbols.filter((m) => delaySet.has(m))
  const unservable = findUnservableInterfaceVersions({
    arch,
    symbols,
    requiredInterfaceVersions: required
  })
  if (delayMissing.length > 0 || unservable.length > 0) {
    return withhold({
      appId,
      bottleDir,
      shimTargets: targetIsGameLibShim ? [shimPath] : [],
      arch,
      required,
      stubbedInterfaces: coverage.stubbedInterfaces,
      allMissing: coverage.missingSymbols,
      delayMissing: [...new Set(delayMissing)],
      unservable,
      scannedAt
    })
  }

  if (targetExists && !targetIsGameLibShim) {
    const backedUp = backupOriginalBeforeOverwrite(bottleDir, shimPath, appId)
    if (!backedUp.ok) {
      return {
        status: 'error',
        error: `Failed to back up the original ${filename}: ${backedUp.error}`
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

  if (coverage.missingSymbols.length > 0) {
    logWarning(
      `placeShimForGame: shim coverage miss for appId ${appId}: ${coverage.missingSymbols.join(', ')} -- placing anyway (quick 261023-oq7). A static-import miss is expected to fail at load with a Windows entry-point error`,
      LogPrefix.Steam
    )
    return {
      status: 'placed-miss',
      shimPaths: [shimPath],
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
