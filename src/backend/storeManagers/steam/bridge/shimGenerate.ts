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
 * `.gamelib-orig` backup. A missing backup can be restored from the Steam
 * depot by `restoreBridgeSteamApiOriginals` (bridge/originalRestore.ts, quick
 * 261026-lif); placement then prefers the backup over the persisted pool and
 * rescans when a backup is new or its fingerprint changed.
 *
 * Revised 2026-10-26 (quick 261026-mhg, operator option a): the withhold
 * triggers only on a delay-imported miss or a BLOCKING interface gap (a core
 * startup family, or a version the shim would answer with NULL). A non-core
 * gap answered by the x64 null object (SteamController, SteamUGC,
 * SteamTimeline, SteamRemotePlay, ...) is placed (placed-miss) and still named
 * in the verdict. Served-map growth had turned those half-served families
 * into "skew" and regressed ELEX; the native resolver's runtime answer never
 * changed (exact-version match, else the null object).
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

import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  builtBridgeShim64Path,
  builtBridgeShimPath
} from 'backend/constants/paths'
import type { SteamBridgeScanVerdict } from '../stores'
import { resolveBridgeBottleName } from '../bridgeBottle'
import {
  getBottleDir,
  sanitizeBottleName
} from 'backend/engine/bottlePrimitives'
import { scanSteamApiImports } from './importScan'
import { runtimeLoadedSteamApiMarker } from './importParse'
import { containedGameExeReal, detectLaunchDrmWrapper } from './drm/drmScanExe'
import {
  resolveRequiredInterfaceVersions,
  selectInterfaceVersionPool,
  usesRuntimeInterfaceLookup
} from './interfaceVersions'
import {
  findRuntimeLoadedSteamApiDlls as findRuntimeDlls,
  findSteamApiImporterPes as findImporterPes,
  findUnrealLayout,
  isContainedWithin,
  partitionManagedImports,
  readFileEffectiveArch,
  resolveWalkRoot,
  scanManagedSteamApi,
  servedFamiliesFor,
  type BridgeScanDeps,
  type ManagedScanResult
} from './bridgeScan'
// Phase 51 Plan 03 (ROADMAP sub-decision 2 / D-51-07): SHIM_EXPORTED_SYMBOLS
// (and now, Phase 51 Plan 07, the whole coverage verdict) lives in
// shimCoverage.ts -- that module is the SOLE place the shim's export-set
// literal and served-interface-version coverage dimension live. See
// shimCoverage.ts's own docblock for the 24-CR-02 provenance and the
// CR-02 review-pass obligation on any SDK bump.
import {
  evaluateShimCoverage,
  classifyUnservableInterfaceVersions,
  SHIM_EXPORT_SET_VERSION
} from './shimCoverage'
import { NUMERIC_APP_ID } from '../gameConstants'
import {
  BRIDGE_SHIM_FILENAME,
  BRIDGE_SHIM64_FILENAME,
  ORIGINAL_BACKUP_SUFFIX,
  backupFingerprintChanged,
  backupOriginalBeforeOverwrite,
  collectOriginalFingerprints,
  isByteIdentical,
  isGameLibShimBytes,
  probeOriginalBackup,
  readVersionsOrEmpty,
  restoreOriginalIfBackedUp,
  type OriginalFingerprints,
  type PlaceShimResult,
  type PlaceShimResultBase
} from './shimOriginals'
import {
  detectDrmWrapper,
  detectExeSteamDrm,
  withDrmWrapper
} from './shimDrmWrapper'

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
  // Gap 11 (56-21): UE titles carry .bind on the Shipping exe, not the
  // bootstrap; stamp from the same resolver launch routing uses.
  const stampBottle = sanitizeBottleName(
    opts?.bottleName ?? resolveBridgeBottleName(appId)
  )
  const launchWrapper = stampBottle
    ? await detectLaunchDrmWrapper(
        resolve(getBottleDir(stampBottle)),
        resolve(gameExePath)
      )
    : undefined
  // Quick 261029-my4: the no-bottle fallback applies the same realpath
  // game-folder containment as detectLaunchDrmWrapper; only the contained
  // real path is ever opened (real scanned, lexical returned).
  const fallbackReal = launchWrapper
    ? null
    : await containedGameExeReal(resolve(gameExePath), 'placeShimForGame')
  // CR-02: drm (CEG) is read from the same exe the resolver chose for
  // drmWrapper, so launch routing and the persisted verdict agree.
  const drmSource = launchWrapper ? launchWrapper.drmExe : fallbackReal
  const drm = drmSource ? await detectExeSteamDrm(appId, drmSource) : undefined
  const fallbackWrapper = launchWrapper
    ? undefined
    : fallbackReal
      ? await detectDrmWrapper(fallbackReal)
      : undefined
  const flagged = withDrmWrapper(
    appId,
    gameExePath,
    result,
    launchWrapper ?? {
      drmWrapper: fallbackWrapper,
      drmExe: resolve(gameExePath)
    }
  )
  return drm === undefined ? flagged : { ...flagged, drm }
}

type WithholdInput = {
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
  originalFingerprints?: OriginalFingerprints
}

function logNonCorePlaced(appId: string, gaps: string[]): void {
  logInfo(
    `placeShimForGame: appId ${appId} placing the shim despite non-core unservable interface versions answered by the x64 null object: ${gaps.join(', ')} (quick 261026-mhg)`,
    LogPrefix.Steam
  )
}

/**
 * Phase 52 Plan 15: withhold only when every GameLib shim in scope can be
 * restored from a valid backup. Otherwise there is no game-original
 * steam_api to fall back to, so return null: the caller refreshes the shim
 * and reports placed-miss (a helper-less stale shim is the worse outcome).
 */
function withholdIfRestorable(
  input: WithholdInput
): PlaceShimResultBase | null {
  const probes = input.shimTargets.map((t) =>
    probeOriginalBackup(input.bottleDir, resolve(t))
  )
  if (probes.every((p) => p === 'restorable')) return withhold(input)
  logWarning(
    `placeShimForGame: appId ${input.appId} cannot withhold the shim -- the original steam_api is gone (no ${ORIGINAL_BACKUP_SUFFIX} backup, or the backup was refused), so the game has no steam_api of its own; refreshing the GameLib shim to the current build and launching through the bridge despite the gaps (delay-imported missing: ${input.delayMissing.join(', ') || 'none'}; unservable interface versions: ${input.unservable.join(', ') || 'none'}). Use GameLib's "Verify and Repair" (game menu) to restore the original from the Steam depot`,
    LogPrefix.Steam
  )
  return null
}

/**
 * quick 261024-j4l: the withhold result. Restores every GameLib-shim target
 * in scope (all probed restorable by the caller), logs ONE warning naming
 * the gaps, and returns the persisted 'miss' verdict. A restore that still
 * fails is an error, never a withheld result.
 */
function withhold(input: WithholdInput): PlaceShimResultBase {
  const restored: string[] = []
  for (const target of input.shimTargets) {
    const resolved = resolve(target)
    if (
      restoreOriginalIfBackedUp(input.bottleDir, resolved, input.appId) !==
      'restored'
    ) {
      return {
        status: 'error',
        error: `Failed to restore the original ${basename(resolved)} from ${ORIGINAL_BACKUP_SUFFIX}`
      }
    }
    restored.push(resolved)
  }
  logWarning(
    `placeShimForGame: appId ${input.appId} withheld the shim -- importer evidence names gaps the shim cannot serve (delay-imported missing: ${input.delayMissing.join(', ') || 'none'}; unservable interface versions: ${input.unservable.join(', ') || 'none'}); launching with the game's own steam_api, no helper${restored.length > 0 ? ` (restored: ${restored.map((r) => basename(r)).join(', ')})` : ''} (quick 261024-j4l)`,
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
      scannedAt: input.scannedAt,
      ...(input.originalFingerprints
        ? { originalFingerprints: input.originalFingerprints }
        : {})
    }
  }
}

/** D-53-12: the shared scan module's injected dependencies. */
function scanDeps(appId: string): BridgeScanDeps {
  return {
    scanImports: (p) => scanSteamApiImports(appId, p, 'bridgeScan'),
    warn: (m) => logWarning(m, LogPrefix.Steam),
    isShimBytes: isGameLibShimBytes
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
    /** quick 261026-lif: fingerprints the persisted verdict recorded per shim path. */
    persistedOriginalFingerprints?: OriginalFingerprints
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
  const importResult = await scanSteamApiImports(
    appId,
    resolvedExePath,
    'placeShimForGame'
  )
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
    const runtimeDlls = await findRuntimeDlls(
      walkRoot,
      unreal?.steamworksDir ? [unreal.steamworksDir] : [],
      scanDeps(appId)
    )
    const firstRuntimeDll = runtimeDlls[0]
    if (firstRuntimeDll !== undefined) {
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

      const runtimeBackupChanged =
        toCopy.length === 0 &&
        backupFingerprintChanged(
          appId,
          bottleDir,
          allShimPaths,
          opts?.persistedOriginalFingerprints
        )
      if (toCopy.length === 0 && !runtimeBackupChanged) {
        // Every entry is a current GameLib shim: a prior placed-miss. Never
        // downgrade to 'no-steam-api' (that would overwrite the persisted
        // miss and its marker); no verdict, the caller keeps its own.
        logInfo(
          `placeShimForGame: appId ${appId} runtime-loaded shim(s) already present and current (idempotent, no-op)`,
          LogPrefix.Steam
        )
        return {
          status: 'already-placed',
          shimPath: firstRuntimeDll.path,
          shimPaths: allShimPaths
        }
      }

      // quick 261024-i94: evaluate per shipped dll BEFORE the copy loop (the
      // original dlls' version strings must be read before they are
      // overwritten). Importers of the other arch than the launch exe never
      // load, so they are ignored; an unknown launch arch evaluates all.
      // quick 261026-lif: fingerprint every original BEFORE any overwrite.
      const originalFingerprints = collectOriginalFingerprints(
        bottleDir,
        runtimeDlls.map((d) => resolve(d.path))
      )
      const launchArch = readFileEffectiveArch(resolvedExePath)
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
      const importers = await findImporterPes(
        appId,
        walkRoot,
        resolvedExePath,
        unreal?.shippingExes ?? [],
        scanDeps(appId)
      )
      const combinedMissing: string[] = []
      const delayMissingAll: string[] = []
      const blockingAll: string[] = []
      const nonCoreAll: string[] = []
      const unservedManaged = new Map<string, number>()
      let primaryEval: {
        required: Record<string, string>
        stubbedInterfaces: string[]
      } | null = null
      const primaryName: 'steam_api.dll' | 'steam_api64.dll' =
        considered.includes('steam_api64.dll')
          ? 'steam_api64.dll'
          : 'steam_api.dll'
      // D-53-04 (amended): Mono assemblies' steam_api DllImports. P/Invoke
      // binds lazily, so these names are placed-anyway evidence (D-51-05):
      // they join `merged` for the coverage verdict but are never added to
      // `delayMissingAll` (that is importer-PE delay evidence only).
      const managedByName = new Map<string, ManagedScanResult>()
      for (const name of considered) {
        const nameArch = name === 'steam_api64.dll' ? 'x64' : 'x86'
        const forName = importers.filter((i) => i.arch === nameArch)
        const managed = await scanManagedSteamApi(
          resolvedExePath,
          bottleDir,
          nameArch,
          scanDeps(appId)
        )
        const managedPart =
          managed.kind === 'mono'
            ? partitionManagedImports(
                managed.symbols,
                servedFamiliesFor(nameArch)
              )
            : { required: [], unservedFamilyCount: 0 }
        if (managed.kind !== 'none') managedByName.set(name, managed)
        if (managed.kind === 'mono') {
          unservedManaged.set(name, managedPart.unservedFamilyCount)
        }
        if (forName.length === 0 && managedPart.required.length === 0) {
          combinedMissing.push(runtimeLoadedSteamApiMarker(name))
          continue
        }
        const merged = [
          ...new Set([
            ...forName.flatMap((i) => i.symbols),
            ...managedPart.required
          ])
        ]
        const original = runtimeDlls.find(
          (d) => d.name === name && !d.isGameLibShim
        )
        const shimEntry = runtimeDlls.find(
          (d) => d.name === name && d.isGameLibShim
        )
        const backedShim =
          !original &&
          shimEntry &&
          probeOriginalBackup(bottleDir, resolve(shimEntry.path)) ===
            'restorable'
            ? shimEntry
            : null
        const dllVersions = original
          ? await readVersionsOrEmpty(original.path, appId)
          : backedShim
            ? await readVersionsOrEmpty(
                backedShim.path + ORIGINAL_BACKUP_SUFFIX,
                appId
              )
            : Object.values(opts?.persistedInterfaceVersions ?? {})
        const exeVersions = usesRuntimeInterfaceLookup(merged)
          ? (
              await Promise.all(
                forName.map((i) => readVersionsOrEmpty(i.path, appId))
              )
            ).flat()
          : []
        // Resolved open question 2: a Managed dir's UTF-16 constants alone
        // form the pool (the Valve dll carries many versions per family).
        const pool = selectInterfaceVersionPool({
          managedVersions:
            managed.kind === 'mono' ? managed.versionStrings : null,
          dllVersions,
          exeVersions
        })
        const { required, problems } = resolveRequiredInterfaceVersions({
          importedSymbols: merged,
          dllVersions: pool.dllVersions,
          exeVersions: pool.exeVersions
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
        const classified = classifyUnservableInterfaceVersions({
          arch: nameArch,
          symbols: merged,
          requiredInterfaceVersions: required
        })
        blockingAll.push(...classified.blocking)
        nonCoreAll.push(...classified.nonCore)
        if (name === primaryName) {
          primaryEval = {
            required,
            stubbedInterfaces: coverage.stubbedInterfaces
          }
        }
      }

      if (delayMissingAll.length > 0 || blockingAll.length > 0) {
        const withheld = withholdIfRestorable({
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
          unservable: [...new Set([...blockingAll, ...nonCoreAll])],
          scannedAt,
          originalFingerprints
        })
        if (withheld) return withheld
        // Refresh path: name every gap in the placed-miss verdict.
        for (const gap of [...delayMissingAll, ...blockingAll]) {
          if (!combinedMissing.includes(gap)) combinedMissing.push(gap)
        }
      }
      // quick 261026-mhg: non-core gaps never withhold; name them in the
      // placed-miss verdict.
      if (nonCoreAll.length > 0) {
        for (const gap of nonCoreAll) {
          if (!combinedMissing.includes(gap)) combinedMissing.push(gap)
        }
        logNonCorePlaced(appId, [...new Set(nonCoreAll)])
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

      // 53-13 WR-05: one dll key feeds both assemblies and unservedFamilyImports.
      const managedKey = managedByName.has(primaryName)
        ? primaryName
        : [...managedByName.keys()][0]
      const managedChosen =
        managedKey !== undefined ? managedByName.get(managedKey) : undefined
      const managedScan: SteamBridgeScanVerdict['managedScan'] =
        managedChosen?.kind === 'mono'
          ? {
              kind: 'mono',
              assemblies: managedChosen.assemblies,
              unservedFamilyImports:
                managedKey !== undefined
                  ? (unservedManaged.get(managedKey) ?? 0)
                  : 0
            }
          : managedChosen?.kind === 'il2cpp'
            ? { kind: 'il2cpp', reason: managedChosen.reason }
            : undefined
      const verdictBase = {
        ...(managedScan ? { managedScan } : {}),
        ...(originalFingerprints ? { originalFingerprints } : {}),
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
          shimPath: resolve(firstRuntimeDll.path),
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
  if (
    existsSync(shimPath) &&
    isByteIdentical(shimPath, shimSourcePath) &&
    !backupFingerprintChanged(
      appId,
      bottleDir,
      [shimPath],
      opts?.persistedOriginalFingerprints
    )
  ) {
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
    await findImporterPes(
      appId,
      importerRoot,
      resolvedExePath,
      [],
      scanDeps(appId)
    )
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
  const targetBackupRestorable =
    targetIsGameLibShim &&
    probeOriginalBackup(bottleDir, resolve(shimPath)) === 'restorable'
  // quick 261026-lif: fingerprint the original BEFORE it is overwritten.
  const originalFingerprints = targetExists
    ? collectOriginalFingerprints(bottleDir, [shimPath])
    : undefined
  const dllVersions = targetIsGameLibShim
    ? targetBackupRestorable
      ? await readVersionsOrEmpty(shimPath + ORIGINAL_BACKUP_SUFFIX, appId)
      : Object.values(opts?.persistedInterfaceVersions ?? {})
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
  const { blocking, nonCore } = classifyUnservableInterfaceVersions({
    arch,
    symbols,
    requiredInterfaceVersions: required
  })
  const refreshGaps: string[] = []
  if (delayMissing.length > 0 || blocking.length > 0) {
    // WR-11: withhold only when a target exists; with no file there is no
    // game steam_api to fall back to, so the gaps join refreshGaps and the
    // shim is placed (placed-miss).
    const withheld = targetExists
      ? withholdIfRestorable({
          appId,
          bottleDir,
          shimTargets: targetIsGameLibShim ? [shimPath] : [],
          arch,
          required,
          stubbedInterfaces: coverage.stubbedInterfaces,
          allMissing: coverage.missingSymbols,
          delayMissing: [...new Set(delayMissing)],
          unservable: [...blocking, ...nonCore],
          scannedAt,
          originalFingerprints
        })
      : null
    if (withheld) return withheld
    refreshGaps.push(...delayMissing, ...blocking)
  }
  // quick 261026-mhg: non-core gaps never withhold; name them in the verdict.
  refreshGaps.push(...nonCore)
  if (nonCore.length > 0) logNonCorePlaced(appId, nonCore)
  const placedMissing = [
    ...new Set([...coverage.missingSymbols, ...refreshGaps])
  ]

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

  if (placedMissing.length > 0) {
    logWarning(
      `placeShimForGame: shim coverage miss for appId ${appId}: ${placedMissing.join(', ')} -- placing anyway (quick 261023-oq7). A static-import miss is expected to fail at load with a Windows entry-point error`,
      LogPrefix.Steam
    )
    return {
      status: 'placed-miss',
      shimPaths: [shimPath],
      verdict: {
        status: 'miss',
        arch,
        missingSymbols: placedMissing,
        interfaceVersions: required,
        stubbedInterfaces: coverage.stubbedInterfaces,
        shimExportSetVersion: SHIM_EXPORT_SET_VERSION,
        scannedAt,
        ...(originalFingerprints ? { originalFingerprints } : {})
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
      scannedAt,
      ...(originalFingerprints ? { originalFingerprints } : {})
    }
  }
}
