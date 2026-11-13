import { join } from 'path'
import type { AppPaths } from 'backend/process/context'
import { getSteamLibraries, type SteamLibrariesDeps } from 'backend/utils'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMFILES_SCAN_ACFS } from 'common/types/sidecarTransport'
import { invokeSteamFiles } from '../localFiles/rustSteamFiles'
import type { ScannedAcf } from '../localFiles/steamFilesTypes'
import { getBottleSteamappsDir, type BottleSettingsDeps } from '../bottle'
import {
  listReadyBridgeBottleNames,
  resolveBridgeBottleName
} from '../bridgeBottle'
import { getBottleSteamappsRoot } from './installRoot'

/**
 * D-UAT-09 (21-17): the single completeness predicate every install-state
 * detector must call — bit 4 (0x4 = FullyInstalled) is a BITMASK check, NOT
 * equality (Pitfall 6); the strict-1026 GAMELIB_HANDOFF_STATE_FLAGS literal
 * elsewhere in this file is a DIFFERENT, unrelated check (exact handoff
 * value, not this bitmask). Centralizing this decision means no future
 * detector can diverge from the other three and spoof "installed" from a
 * partial/interrupted manifest (T-21-17-01, regression-locked by tests).
 */
export function isFullyInstalledStateFlags(stateFlags: number): boolean {
  return (stateFlags & 4) !== 0
}

type InstalledMap = Map<number, { installPath: string; sizeOnDisk: string }>

/**
 * One steamfiles_scan_acfs call over `steamappsDirs`. Unreadable files and missing dirs are
 * skipped inside the scan (T-2-01), but a rejected invoke (timeout, shell restart) is
 * propagated: it says nothing about what is installed, and mapping it to "no records" made
 * refreshInstallState persist every installed title as not installed (WR-01, 75 review).
 */
async function scanRecords(
  deps: RustInvokeDeps,
  steamappsDirs: string[]
): Promise<ScannedAcf[]> {
  const result = await invokeSteamFiles(deps, RUST_STEAMFILES_SCAN_ACFS, {
    steamappsDirs
  })
  return result.records
}

function installedEntry(rec: ScannedAcf) {
  return {
    installPath: join(rec.steamappsDir, 'common', rec.record.installdir ?? ''),
    sizeOnDisk: rec.record.sizeOnDisk ?? '0'
  }
}

function fullyInstalledAppId(rec: ScannedAcf): number | undefined {
  const appid = parseInt(rec.record.appid ?? '', 10)
  const stateFlags = rec.record.stateFlags ?? NaN
  return isFullyInstalledStateFlags(stateFlags) && !isNaN(appid)
    ? appid
    : undefined
}

/**
 * Reads all Steam library paths and returns a Map from AppID (number) to
 * install data for games whose ACF StateFlags has bit 4 set
 * (0x4 = FullyInstalled). Skips missing directories and corrupt ACF files
 * without throwing (T-2-01 mitigation). A rejected rustInvoke for the library
 * list or the scan rejects (WR-01, 75 review): callers skip the reconcile
 * rather than read it as "nothing installed".
 *
 * Exported for unit testing.
 */
export async function buildInstalledMap(
  deps: SteamLibrariesDeps
): Promise<InstalledMap> {
  const installed: InstalledMap = new Map()
  const libraryPaths = await getSteamLibraries(deps, { strict: true })
  const records = await scanRecords(
    deps,
    libraryPaths.map((libPath) => join(libPath, 'steamapps'))
  )
  for (const rec of records) {
    const appid = fullyInstalledAppId(rec)
    if (appid !== undefined) installed.set(appid, installedEntry(rec))
  }
  return installed
}

/**
 * WR-01 (21-17): scans on-disk native ACF manifests and returns the set of
 * AppIDs whose StateFlags is present but NOT fully installed (bit 4 unset —
 * e.g. the honest 1026 verify-repair handoff a cancelled native install
 * writes). This is the durable, on-disk complement to buildInstalledMap:
 * refresh() uses it to re-seed `steamResumePending` on every resync so a
 * mid-session `library.clear()` + rebuild can never wipe the "Finish in
 * Steam" resume affordance (the D-UAT-09 symptom). The incomplete verdict is
 * derived from the SAME predicate as the installed detectors
 * (`isFullyInstalledStateFlags`) — negated here — so the "installed" and
 * "incomplete" decisions can never diverge on the bit logic. Skips missing
 * directories and corrupt ACF files without throwing (T-2-01 mitigation).
 *
 * Exported for unit testing.
 */
export async function buildIncompleteInstallSet(
  deps: SteamLibrariesDeps
): Promise<Set<number>> {
  const incomplete = new Set<number>()
  const libraryPaths = await getSteamLibraries(deps, { strict: true })
  const records = await scanRecords(
    deps,
    libraryPaths.map((libPath) => join(libPath, 'steamapps'))
  )
  for (const { record } of records) {
    const appid = parseInt(record.appid ?? '', 10)
    const stateFlags = record.stateFlags ?? NaN
    if (
      !isNaN(appid) &&
      !isNaN(stateFlags) &&
      !isFullyInstalledStateFlags(stateFlags)
    ) {
      incomplete.add(appid)
    }
  }
  return incomplete
}

/**
 * Bottle-scoped sibling of buildInstalledMap(deps) — same StateFlags bitmask +
 * corrupt-file discipline (T-2-01/T-17-05), rooted at the dedicated CrossOver
 * bottle's own steamapps dir instead of the native defaultSteamPath (Pitfall 2).
 * Returns an empty Map when the bottle steamapps dir doesn't exist yet (e.g.
 * bottle not provisioned or Steam not yet installed inside it).
 *
 * Exported for unit testing.
 */
export async function buildBottleInstalledMap(
  deps: BottleSettingsDeps & RustInvokeDeps
): Promise<InstalledMap> {
  const installed: InstalledMap = new Map()
  const records = await scanRecords(deps, [getBottleSteamappsRoot(deps)])
  for (const rec of records) {
    const appid = fullyInstalledAppId(rec)
    if (appid !== undefined) installed.set(appid, installedEntry(rec))
  }
  return installed
}

/**
 * Bridge-bottle-scoped sibling of buildBottleInstalledMap() — same StateFlags
 * bitmask + corrupt-file discipline (T-2-01/T-17-05), but rooted at EVERY
 * currently-ready bridge bottle (quick/261016-u1w D-C) — the legacy shared
 * bottle plus every per-game bottle (GameLibSteamBridge-<appId>) —
 * via listReadyBridgeBottleNames(), never conflated with the native or
 * Phase 17 bottle roots (RESEARCH.md Pitfall 2). D-UAT-24-07: the periodic
 * library sync (refresh()) and the focus-triggered reconciliation
 * (refreshInstallState()) previously derived install-state from ONLY the
 * native + Phase 17 bottle maps, so a bridge-installed game (24-12's install
 * poll had already flipped its badge to Installed) got clobbered back to
 * not-installed on the very next sync — this builder lets both paths consult
 * every ready bridge bottle too, so the badge stays durable across syncs.
 *
 * Attribution (D-C/D-B): a manifest found in bottle `name` counts for its
 * appId ONLY when `resolveBridgeBottleName(String(appid)) === name` — i.e.
 * only the resolver's own answer for that appId may claim it. This is what
 * keeps a stray/foreign manifest in a per-game bottle, or a stale legacy
 * manifest for a game that has since migrated to its own per-game bottle,
 * from being double-counted or attributed to the wrong bottle; each appId
 * has exactly one owner, decided the same way every other bridge reader
 * decides it. Returns an empty Map when no bridge bottle is ready at all.
 *
 * Exported for unit testing.
 */
export async function buildBridgeInstalledMap(
  paths: Pick<AppPaths, 'userHome'>,
  rust: RustInvokeDeps
): Promise<InstalledMap> {
  const installed: InstalledMap = new Map()
  const names = listReadyBridgeBottleNames(paths)
  if (names.length === 0) return installed
  const records = await scanRecords(
    rust,
    names.map((name) => getBottleSteamappsDir(paths, name))
  )
  const nameByDir = new Map(
    names.map((name) => [getBottleSteamappsDir(paths, name), name])
  )
  for (const rec of records) {
    const appid = fullyInstalledAppId(rec)
    if (
      appid !== undefined &&
      resolveBridgeBottleName(paths, String(appid)) ===
        nameByDir.get(rec.steamappsDir)
    ) {
      installed.set(appid, installedEntry(rec))
    }
  }
  return installed
}
