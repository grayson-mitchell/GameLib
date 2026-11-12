/**
 * Shim placement: the withhold guard, the shared scan dependencies and
 * `placeShimForGameInner`, split out of shimGenerate.ts (Phase 65 Plan 16).
 * `placeShimForGame` (the sole entry point, with the DRM stamp) stays in
 * shimGenerate.ts; see its docblock for the placement design notes.
 */

import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { AppPaths } from 'backend/process/context'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { SteamBridgeScanVerdict } from '../stores'
import { resolveBridgeBottleName } from '../bridgeBottle'
import {
  getBottleDir,
  sanitizeBottleName
} from 'backend/engine/bottlePrimitives'
import { scanSteamApiImports } from './importScan'
import { runtimeLoadedSteamApiMarker } from './importParse'
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
  extractSteamApiNames,
  findRunnerUnservedExports,
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
  type PlaceShimResultBase
} from './shimOriginals'

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
  /** SteamAPI_* exports the game's runner resolves by name that the x86 shim does not export. */
  runnerMissing?: string[]
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
function describeGaps(input: WithholdInput): string {
  const parts = [
    `delay-imported missing: ${input.delayMissing.join(', ') || 'none'}`,
    `unservable interface versions: ${input.unservable.join(', ') || 'none'}`
  ]
  if (input.runnerMissing && input.runnerMissing.length > 0) {
    parts.push(
      `exports the runner needs that the shim lacks: ${input.runnerMissing.join(', ')}`
    )
  }
  return parts.join('; ')
}

function withholdIfRestorable(
  input: WithholdInput
): PlaceShimResultBase | null {
  const probes = input.shimTargets.map((t) =>
    probeOriginalBackup(input.bottleDir, resolve(t))
  )
  if (probes.every((p) => p === 'restorable')) return withhold(input)
  logWarning(
    `placeShimForGame: appId ${input.appId} cannot withhold the shim -- the original steam_api is gone (no ${ORIGINAL_BACKUP_SUFFIX} backup, or the backup was refused), so the game has no steam_api of its own; refreshing the GameLib shim to the current build and launching through the bridge despite the gaps (${describeGaps(input)}). Use GameLib's "Verify and Repair" (game menu) to restore the original from the Steam depot`,
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
    `placeShimForGame: appId ${input.appId} withheld the shim -- importer evidence names gaps the shim cannot serve (${describeGaps(input)}); launching with the game's own steam_api, no helper${restored.length > 0 ? ` (restored: ${restored.map((r) => basename(r)).join(', ')})` : ''} (quick 261024-j4l)`,
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
function scanDeps(rust: RustInvokeDeps, appId: string): BridgeScanDeps {
  return {
    scanImports: (p) => scanSteamApiImports(rust, appId, p, 'bridgeScan'),
    warn: (m) => logWarning(m, LogPrefix.Steam),
    isShimBytes: isGameLibShimBytes
  }
}

/**
 * Debug undertale-shim-placed-no-hello: the SteamAPI_* names a 32-bit runner
 * carries that the x86 shim cannot export, narrowed to what the game's own
 * steam_api.dll exports (read from the original, or its .gamelib-orig backup
 * when the shim is already placed). Never throws; unreadable -> [].
 */
function findRuntimeRunnerGaps(
  exePath: string,
  x86Entries: Array<{ path: string; isGameLibShim: boolean }>,
  bottleDir: string
): string[] {
  try {
    const runnerNames = extractSteamApiNames(readFileSync(exePath))
    if (runnerNames.size === 0) return []
    let originalExports: Set<string> | null = null
    for (const entry of x86Entries) {
      const originalPath = entry.isGameLibShim
        ? probeOriginalBackup(bottleDir, resolve(entry.path)) === 'restorable'
          ? entry.path + ORIGINAL_BACKUP_SUFFIX
          : null
        : entry.path
      if (originalPath === null) continue
      originalExports = extractSteamApiNames(readFileSync(originalPath))
      break
    }
    return findRunnerUnservedExports({
      arch: 'x86',
      runnerNames,
      originalExports
    })
  } catch {
    return []
  }
}

export async function placeShimForGameInner(
  rust: RustInvokeDeps,
  paths: Pick<
    AppPaths,
    'userHome' | 'builtBridgeShimPath' | 'builtBridgeShim64Path'
  >,
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
  const rawBottleName =
    opts?.bottleName ?? resolveBridgeBottleName(paths, appId)
  const bottleName = sanitizeBottleName(rawBottleName)
  if (!bottleName) {
    logError(
      `placeShimForGame: rejected unsafe bottle name "${rawBottleName}" for appId ${appId} (T-24-06)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid bottle name: "${rawBottleName}"` }
  }

  const bottleDir = resolve(getBottleDir(paths, bottleName))
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
    rust,
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
      scanDeps(rust, appId)
    )
    const firstRuntimeDll = runtimeDlls[0]
    if (firstRuntimeDll !== undefined) {
      const names = (['steam_api.dll', 'steam_api64.dll'] as const).filter(
        (n) => runtimeDlls.some((d) => d.name === n)
      )
      const sourceFor = (name: 'steam_api.dll' | 'steam_api64.dll') =>
        name === 'steam_api64.dll'
          ? (opts?.shim64SourcePath ?? paths.builtBridgeShim64Path)
          : (opts?.shimSourcePath ?? paths.builtBridgeShimPath)

      // Debug undertale-shim-placed-no-hello: a 32-bit runner that resolves
      // SteamAPI_* by name (GetProcAddress) from a runtime-loaded steam_api.dll
      // gets NULL for every name the hand-pinned x86 shim does not export, so
      // init never reaches the shim and the helper never hears HELLO (D-53-09
      // x86 gap, backlog 999.2). Withhold like Cat Quest: restore any placed
      // shim from .gamelib-orig and launch direct. Runs before the idempotent
      // no-op so an already-placed shim is restored, not left in place. x64
      // is unchanged.
      const x86Entries = runtimeDlls.filter((d) => d.name === 'steam_api.dll')
      if (
        x86Entries.length > 0 &&
        readFileEffectiveArch(resolvedExePath) === 'x86'
      ) {
        const runnerGaps = findRuntimeRunnerGaps(
          resolvedExePath,
          x86Entries,
          bottleDir
        )
        if (runnerGaps.length > 0) {
          const withheld = withholdIfRestorable({
            appId,
            bottleDir,
            shimTargets: x86Entries
              .filter((d) => d.isGameLibShim)
              .map((d) => d.path),
            arch: 'x86',
            required: {},
            stubbedInterfaces: [],
            allMissing: runnerGaps,
            delayMissing: [],
            unservable: [],
            runnerMissing: runnerGaps,
            scannedAt,
            originalFingerprints: collectOriginalFingerprints(
              bottleDir,
              runtimeDlls.map((d) => resolve(d.path))
            )
          })
          if (withheld) return withheld
        }
      }

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
        scanDeps(rust, appId)
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
          scanDeps(rust, appId)
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
      ? (opts?.shim64SourcePath ?? paths.builtBridgeShim64Path)
      : (opts?.shimSourcePath ?? paths.builtBridgeShimPath)

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
      scanDeps(rust, appId)
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
