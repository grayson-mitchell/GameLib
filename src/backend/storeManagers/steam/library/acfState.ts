import { join, resolve, relative, isAbsolute, sep } from 'path'
import { existsSync } from 'graceful-fs'
import { rmSync } from 'node:fs'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { getSteamLibraries, type SteamLibrariesDeps } from 'backend/utils'
import type { SteamLibraryStateDeps } from 'backend/services/types'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  RUST_STEAMFILES_FIND_ACF,
  RUST_STEAMFILES_SCAN_ACFS
} from 'common/types/sidecarTransport'
import { invokeSteamFiles } from '../localFiles/rustSteamFiles'
import { NUMERIC_APP_ID } from '../gameConstants'
import { DEFAULT_BRIDGE_BOTTLE_NAME, type BottleSettingsDeps } from '../bottle'
import {
  removePerGameBridgeBottle,
  type BottleLifecycleDeps
} from '../bridgeBottleLifecycle'
import { resolveBridgeBottleName } from '../bridgeBottle'
import {
  type AcfSource,
  getBottleSteamappsRoot,
  getBridgeBottleSteamappsRoot
} from './installRoot'
import { isFullyInstalledStateFlags } from './installedMap'

/**
 * Reads the install state of a single appId from its ACF manifest.
 *
 * - 'installed':   manifest present and StateFlags bit 4 set (FullyInstalled)
 * - 'downloading': manifest present but bit 4 unset (download in flight)
 * - 'absent':      no manifest found for this appId in any library path
 *
 * `source` selects which steamapps root(s) to scan:
 *  - 'native' (default): every native library path from getSteamLibraries(deps)
 *    — exactly the pre-Phase-17 behavior, byte-for-byte unchanged.
 *  - 'bottle': the single dedicated Phase 17 CrossOver bottle (GameLibSteam)
 *    steamapps root (RESEARCH.md Pitfall 2 — never conflated with the other
 *    roots).
 *  - 'bridge': the single dedicated bridge bottle (GameLibSteamBridge)
 *    steamapps root (D-UAT-24-05) — where the bridge install actually writes
 *    its StateFlags=4 ACF; never conflated with 'native'/'bottle'.
 *
 * Corrupt/unreadable manifests are skipped without throwing (T-2-01 / T-17-05).
 * Exported for unit testing.
 */
export async function readAcfState(
  deps: SteamLibrariesDeps & BottleSettingsDeps,
  appId: string,
  source: AcfSource = 'native'
): Promise<{
  state: 'absent' | 'downloading' | 'installed'
  stateFlags?: number
  installPath?: string
  sizeOnDisk?: string
  /** Bytes downloaded/staged so far, and the totals to compare against —
   *  parsed from the ACF's AppState (strings on disk). Only populated on the
   *  'downloading' result; used by pollInstallOnce to derive a progress
   *  percent for the bottle install path (GAP-17-BOTTLE-PROGRESS). Missing or
   *  non-numeric values default to 0. */
  bytesDownloaded?: number
  bytesToDownload?: number
  bytesStaged?: number
  bytesToStage?: number
}> {
  const steamappsDirs = (
    source === 'bottle'
      ? [getBottleSteamappsRoot(deps)]
      : source === 'bridge'
        ? [getBridgeBottleSteamappsRoot(deps, appId)]
        : (await getSteamLibraries(deps)).map((libPath) =>
            join(libPath, 'steamapps')
          )
  ).filter((dir) => existsSync(dir))

  let found
  try {
    found = await invokeSteamFiles(deps, RUST_STEAMFILES_FIND_ACF, {
      steamappsDirs,
      appId
    })
  } catch {
    return { state: 'absent' }
  }
  if (!found.found || !found.record || !found.steamappsDir) {
    return { state: 'absent' }
  }
  const { record } = found
  const stateFlags = record.stateFlags ?? NaN
  if (isFullyInstalledStateFlags(stateFlags)) {
    return {
      state: 'installed',
      stateFlags,
      installPath: join(found.steamappsDir, 'common', record.installdir ?? ''),
      sizeOnDisk: record.sizeOnDisk ?? '0'
    }
  }
  return {
    state: 'downloading',
    stateFlags,
    bytesDownloaded: Number(record.bytesDownloaded) || 0,
    bytesToDownload: Number(record.bytesToDownload) || 0,
    bytesStaged: Number(record.bytesStaged) || 0,
    bytesToStage: Number(record.bytesToStage) || 0
  }
}

/**
 * 34.13 review A-13: every OTHER appId in `steamappsDir` whose manifest
 * declares the same `installdir` as `installdirSegment`.
 *
 * WHY THIS EXISTS. `uninstallBottleGameDirectly`'s JSDoc argues its deletion
 * is safe because a shared depot's files live under the OWNING app's own
 * installdir — a SIBLING directory under common/ — and calls that
 * "structurally impossible" to over-delete, "handled by construction". That
 * holds for the SharedDepots case its real-filesystem regression test proves.
 * It does NOT hold for the case the argument silently assumes away: two
 * installed appIds whose ACFs declare the SAME `installdir`. Steam does this
 * routinely — a game and its dedicated-server/tool app, regional SKU
 * variants, demo/base pairs. In that shape `rmSync(installRoot,
 * { recursive: true })` deletes the co-installed app's files, while only
 * `appmanifest_<thisAppId>.acf` is removed, so the other app's manifest
 * survives pointing at a now-empty path and both Steam and GameLib still
 * believe it is installed.
 *
 * A claim stronger than the code supports is the more dangerous half — a
 * later reader trusts it. This makes the claim true instead of narrowing it.
 *
 * Never throws (T-2-01/T-17-05), but unlike the read-only scans an
 * unreadable or unparseable sibling ACF, or an unreadable/over-cap
 * directory, is reported as the `<unknown>` conflict rather than ignored
 * (WR-02): this list gates a recursive delete, so "could not read" must not
 * mean "no conflict". Comparison is case-sensitive and exact, matching the way
 * `installRoot` itself is built (`join(commonRoot, installdirSegment)`).
 *
 * Exported for unit testing.
 */
export async function findOtherManifestsWithInstalldir(
  rust: RustInvokeDeps,
  steamappsDir: string,
  installdirSegment: string,
  selfAppId: string
): Promise<string[]> {
  let scan
  try {
    scan = await invokeSteamFiles(rust, RUST_STEAMFILES_SCAN_ACFS, {
      steamappsDirs: [steamappsDir]
    })
  } catch {
    // T-75-55: an empty list means "no conflict" and allows the recursive
    // rmSync. A transport failure must therefore NOT yield []; the sentinel
    // makes every caller take the conflicting (manifest-only) branch, which
    // is the conservative choice.
    return [UNKNOWN_CONFLICT]
  }
  const conflicting: string[] = []
  // WR-02 (75 review): the scan moves what it could not see into `skipped` —
  // an unreadable steamapps dir or one over the entry cap (fileName ''), or a
  // sibling manifest it could not read or parse. Any of those may be a
  // co-installed app sharing this installdir, so like a transport failure it
  // must not yield "no conflict". Only this app's own manifest is exempt.
  if (scan.skipped.some((s) => s.fileName !== `appmanifest_${selfAppId}.acf`)) {
    conflicting.push(UNKNOWN_CONFLICT)
  }
  for (const { fileName, record } of scan.records) {
    if (fileName === `appmanifest_${selfAppId}.acf`) continue
    if (record.installdir !== installdirSegment) continue
    const appid = record.appid ?? ''
    if (appid && appid !== selfAppId) conflicting.push(appid)
  }
  return conflicting
}

const UNKNOWN_CONFLICT = '<unknown>'

/**
 * One entry in the multi-root inventory `enumerateSteamInstallCopies`
 * returns — mirrors the fields `readAcfState`'s 'installed' branch already
 * carries, narrowed to what `removeAllSteamInstallCopies` (removeAllCopies.ts)
 * and the submenu's "Remove all copies…" confirm dialog need.
 */
export interface SteamInstallCopy {
  source: AcfSource
  installPath: string
  sizeOnDisk: string
}

const ALL_ACF_SOURCES: AcfSource[] = ['native', 'bottle', 'bridge']

/**
 * quick-260821-le0: the shared multi-root enumeration primitive the todo
 * asked for — probes the SAME fixed `['native','bottle','bridge']` order
 * `pollUninstallOnce` already probes below (D-UAT-24-05/Pitfall 2), the
 * exact set that made HOARD/63000's three-root orphan visible. Does not
 * re-derive per-source steamapps paths; `readAcfState` already owns that
 * mapping. Each probe is individually try/catch-guarded and logged on
 * failure — an unprovisioned bridge bottle throwing must not take the whole
 * enumeration down. `'downloading'` is deliberately excluded: a copy still
 * being written is not a removable install.
 *
 * Exported for unit testing.
 */
export async function enumerateSteamInstallCopies(
  deps: SteamLibrariesDeps & BottleSettingsDeps,
  appId: string
): Promise<SteamInstallCopy[]> {
  const copies: SteamInstallCopy[] = []

  for (const source of ALL_ACF_SOURCES) {
    try {
      const acfState = await readAcfState(deps, appId, source)
      if (acfState.state === 'installed' && acfState.installPath) {
        copies.push({
          source,
          installPath: acfState.installPath,
          sizeOnDisk: acfState.sizeOnDisk ?? '0'
        })
      }
    } catch (error) {
      logWarning(
        [
          `SteamLibraryManager: enumerateSteamInstallCopies probe failed for appId ${appId} source '${source}'`,
          error
        ],
        LogPrefix.Steam
      )
    }
  }

  return copies
}

/**
 * quick-260821-le0: outcome of a single-root `removeSteamInstallCopy` call.
 * quick-261016-u1w/D-51-12 (phase 51 plan 05): the 'removed' variant's
 * `bottleRemoved` is present ONLY for source 'bridge' when the resolved
 * bottle was a per-game one (GameLibSteamBridge-<appId>) and a deletion was
 * actually attempted — absent for 'native'/'bottle' sources and for a
 * legacy-shared-bottle removal, where no bottle delete is ever attempted.
 */
export type RemoveCopyResult =
  | {
      status: 'removed'
      source: AcfSource
      manifestOnly: boolean
      bottleRemoved?: boolean
    }
  | { status: 'absent'; source: AcfSource }
  | { status: 'refused'; source: AcfSource; reason: string }

/**
 * quick-260821-le0: deletes ONE root's install copy for `appId`. Ports the
 * guard set from games.ts's `uninstallBottleGameDirectly` verbatim in
 * intent — those guards encode already-paid-for review findings, not
 * reinvented here:
 *  - NUMERIC_APP_ID-shaped check on appId FIRST, before either delete
 *    target (installRoot / manifestPath) is built (34.13 review A-12):
 *    `join` is not containment (Phase 18) — an appId containing `../` would
 *    otherwise relocate the manifest delete target with nothing else
 *    catching it.
 *  - `'downloading'` is an explicit REFUSAL, never folded into the
 *    `'absent'` success branch (34.13 review A-10) — a depot download may
 *    still be writing into the directory.
 *  - `installdirSegment` is derived via the resolve()+relative()+
 *    isAbsolute() containment idiom against THIS root's own `common/`,
 *    rejecting an empty, `..`-prefixed, or absolute result.
 *  - `findOtherManifestsWithInstalldir` guards the SharedDepots/co-installed
 *    hazard (34.13 review A-13): when another appId's manifest declares the
 *    same installdir, only the manifest is removed and the shared directory
 *    is left alone.
 *
 * `uninstallBottleGameDirectly` is NOT routed through this function in this
 * plan — it is a LIVE-CONFIRMED path and its own dedup is a separate
 * refactor. TODO(dedup): route uninstallBottleGameDirectly through this
 * function once that refactor is scheduled.
 *
 * Exported for unit testing.
 */
export async function removeSteamInstallCopy(
  deps: BottleLifecycleDeps & SteamLibrariesDeps & BottleSettingsDeps,
  appId: string,
  source: AcfSource
): Promise<RemoveCopyResult> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `SteamLibraryManager: removeSteamInstallCopy rejected non-numeric appId (source '${source}')`,
      LogPrefix.Steam
    )
    return { status: 'refused', source, reason: 'invalid appId' }
  }

  // D-51-12: resolve ONCE up front, via the D-B single resolver — never
  // re-derive per-game vs legacy locally. null only when appId somehow
  // fails resolveBridgeBottleName's own numeric guard, which the check
  // above already rules out for every caller.
  const resolvedBridgeBottleName =
    source === 'bridge' ? resolveBridgeBottleName(deps.paths, appId) : null

  const acfState = await readAcfState(deps, appId, source)

  if (acfState.state === 'absent') {
    return { status: 'absent', source }
  }

  if (acfState.state === 'downloading') {
    logWarning(
      `SteamLibraryManager: removeSteamInstallCopy refused appId ${appId} source '${source}' — install still in progress`,
      LogPrefix.Steam
    )
    return { status: 'refused', source, reason: 'install in progress' }
  }

  if (!acfState.installPath) {
    // 'installed' with no installPath cannot happen from readAcfState's own
    // contract (its 'installed' branch always builds one), but a missing
    // delete target must never fall through to guessing — refuse.
    return { status: 'refused', source, reason: 'no install path' }
  }

  // readAcfState's 'installed' branch builds installPath as
  // join(steamappsDir, 'common', installdir) — recover steamappsDir from it
  // rather than re-deriving the per-source library/bottle lookup a second
  // time (readAcfState already owns that mapping).
  const steamappsDir = resolve(acfState.installPath, '..', '..')
  const commonRoot = resolve(steamappsDir, 'common')
  const resolvedInstallPath = resolve(acfState.installPath)
  const relFromCommon = relative(commonRoot, resolvedInstallPath)
  const installdirSegment = relFromCommon.split(sep)[0]

  if (
    !installdirSegment ||
    relFromCommon.startsWith('..') ||
    isAbsolute(relFromCommon)
  ) {
    logWarning(
      `SteamLibraryManager: removeSteamInstallCopy refused appId ${appId} source '${source}' — install path "${acfState.installPath}" does not resolve inside common/`,
      LogPrefix.Steam
    )
    return {
      status: 'refused',
      source,
      reason: 'install path outside common/'
    }
  }

  const installRoot = join(commonRoot, installdirSegment)
  const manifestPath = join(steamappsDir, `appmanifest_${appId}.acf`)

  const conflicting = await findOtherManifestsWithInstalldir(
    deps,
    steamappsDir,
    installdirSegment,
    appId
  )

  if (conflicting.length > 0) {
    logWarning(
      `SteamLibraryManager: removeSteamInstallCopy — installdir "${installdirSegment}" (source '${source}') is shared with appId(s) ${conflicting.join(',')}; removing appId ${appId}'s manifest only`,
      LogPrefix.Steam
    )
    rmSync(manifestPath, { force: true })
    return { status: 'removed', source, manifestOnly: true }
  }

  rmSync(installRoot, { recursive: true, force: true })
  rmSync(manifestPath, { force: true })

  logInfo(
    `SteamLibraryManager: removeSteamInstallCopy removed appId ${appId} source '${source}' at "${installRoot}"`,
    LogPrefix.Steam
  )

  // D-51-12: only a per-game bridge bottle (never the legacy shared
  // GameLibSteamBridge bottle, and never 'native'/'bottle' sources) is
  // deleted here — removePerGameBridgeBottle's own guard chain (numeric
  // appId, sanitizeBottleName, forbidden set, Bottles-root containment)
  // already refuses every protected bottle, so this is not a second
  // bespoke delete.
  if (
    source === 'bridge' &&
    resolvedBridgeBottleName &&
    resolvedBridgeBottleName !== DEFAULT_BRIDGE_BOTTLE_NAME
  ) {
    const bottleResult = await removePerGameBridgeBottle(deps, appId)
    const bottleRemoved = bottleResult.status === 'removed'
    if (!bottleRemoved) {
      logWarning(
        `SteamLibraryManager: removeSteamInstallCopy left bridge bottle "${resolvedBridgeBottleName}" in place for appId ${appId} (removePerGameBridgeBottle returned '${bottleResult.status}')`,
        LogPrefix.Steam
      )
    }
    return { status: 'removed', source, manifestOnly: false, bottleRemoved }
  }

  return { status: 'removed', source, manifestOnly: false }
}

/**
 * Scans all Steam library paths for appmanifest_*.acf files whose StateFlags
 * has bit 4 UNSET (download in progress), and filters to those appIds that
 * are present in the in-memory library Map.
 *
 * Used by SteamLibraryManager.init() to resume polling after an app restart.
 * Exported for unit testing.
 */
export async function scanDownloadingAppIds(
  deps: SteamLibrariesDeps & SteamLibraryStateDeps
): Promise<string[]> {
  const libraryPaths = await getSteamLibraries(deps)
  let scan
  try {
    scan = await invokeSteamFiles(deps, RUST_STEAMFILES_SCAN_ACFS, {
      steamappsDirs: libraryPaths.map((libPath) => join(libPath, 'steamapps'))
    })
  } catch {
    return []
  }
  const downloadingIds: string[] = []
  for (const { record } of scan.records) {
    const appid = parseInt(record.appid ?? '', 10)
    if (isNaN(appid)) continue
    const appIdStr = String(appid)
    const stateFlags = record.stateFlags ?? NaN
    if (
      !isNaN(stateFlags) &&
      (stateFlags & 4) === 0 &&
      deps.steamSession.libraryState.library.has(appIdStr)
    ) {
      downloadingIds.push(appIdStr)
    }
  }
  return downloadingIds
}
