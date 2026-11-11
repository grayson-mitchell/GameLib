import { join } from 'path'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import { parse } from '@node-steam/vdf'
import { getSteamLibraries, type SteamLibrariesDeps } from 'backend/utils'
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

/**
 * Reads all Steam library paths and returns a Map from AppID (number) to
 * install data for games whose ACF StateFlags has bit 4 set
 * (0x4 = FullyInstalled). Skips missing directories and corrupt ACF files
 * without throwing (T-2-01 mitigation).
 *
 * Exported for unit testing.
 */
export async function buildInstalledMap(
  deps: SteamLibrariesDeps
): Promise<Map<number, { installPath: string; sizeOnDisk: string }>> {
  const installed = new Map<
    number,
    { installPath: string; sizeOnDisk: string }
  >()
  const libraryPaths = await getSteamLibraries(deps)

  for (const libPath of libraryPaths) {
    const steamappsDir = join(libPath, 'steamapps')
    if (!existsSync(steamappsDir)) continue

    let files: string[]
    try {
      files = readdirSync(steamappsDir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue

      try {
        const content = readFileSync(join(steamappsDir, file), 'utf-8')
        const parsed = parse(content)
        const state = parsed?.AppState
        if (!state) continue

        const appid = parseInt(state.appid, 10)
        const stateFlags = parseInt(state.StateFlags, 10)
        const isInstalled = isFullyInstalledStateFlags(stateFlags)

        if (isInstalled && !isNaN(appid)) {
          installed.set(appid, {
            installPath: join(steamappsDir, 'common', state.installdir ?? ''),
            sizeOnDisk: state.SizeOnDisk ?? '0'
          })
        }
      } catch {
        /* skip corrupt ACF — T-2-01 mitigation */
      }
    }
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
  const libraryPaths = await getSteamLibraries(deps)

  for (const libPath of libraryPaths) {
    const steamappsDir = join(libPath, 'steamapps')
    if (!existsSync(steamappsDir)) continue

    let files: string[]
    try {
      files = readdirSync(steamappsDir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue

      try {
        const content = readFileSync(join(steamappsDir, file), 'utf-8')
        const parsed = parse(content)
        const state = parsed?.AppState
        if (!state) continue

        const appid = parseInt(state.appid, 10)
        const stateFlags = parseInt(state.StateFlags, 10)
        // A present-but-incomplete manifest (bit 4 unset). NaN StateFlags is
        // excluded — an unparseable manifest is not a trustworthy resume
        // signal, matching buildInstalledMap's fail-closed stance.
        if (
          !isNaN(appid) &&
          !isNaN(stateFlags) &&
          !isFullyInstalledStateFlags(stateFlags)
        ) {
          incomplete.add(appid)
        }
      } catch {
        /* skip corrupt ACF — T-2-01 mitigation */
      }
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
  deps: BottleSettingsDeps
): Promise<Map<number, { installPath: string; sizeOnDisk: string }>> {
  const installed = new Map<
    number,
    { installPath: string; sizeOnDisk: string }
  >()
  const steamappsDir = getBottleSteamappsRoot(deps)
  if (!existsSync(steamappsDir)) return installed

  let files: string[]
  try {
    files = readdirSync(steamappsDir)
  } catch {
    return installed
  }

  for (const file of files) {
    if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue

    try {
      const content = readFileSync(join(steamappsDir, file), 'utf-8')
      const parsed = parse(content)
      const state = parsed?.AppState
      if (!state) continue

      const appid = parseInt(state.appid, 10)
      const stateFlags = parseInt(state.StateFlags, 10)
      const isInstalled = isFullyInstalledStateFlags(stateFlags)

      if (isInstalled && !isNaN(appid)) {
        installed.set(appid, {
          installPath: join(steamappsDir, 'common', state.installdir ?? ''),
          sizeOnDisk: state.SizeOnDisk ?? '0'
        })
      }
    } catch {
      /* skip corrupt ACF — T-2-01/T-17-05 mitigation */
    }
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
export async function buildBridgeInstalledMap(): Promise<
  Map<number, { installPath: string; sizeOnDisk: string }>
> {
  const installed = new Map<
    number,
    { installPath: string; sizeOnDisk: string }
  >()

  for (const name of listReadyBridgeBottleNames()) {
    const steamappsDir = getBottleSteamappsDir(name)
    if (!existsSync(steamappsDir)) continue

    let files: string[]
    try {
      files = readdirSync(steamappsDir)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.startsWith('appmanifest_') || !file.endsWith('.acf')) continue

      try {
        const content = readFileSync(join(steamappsDir, file), 'utf-8')
        const parsed = parse(content)
        const state = parsed?.AppState
        if (!state) continue

        const appid = parseInt(state.appid, 10)
        const stateFlags = parseInt(state.StateFlags, 10)
        const isInstalled = isFullyInstalledStateFlags(stateFlags)

        if (
          isInstalled &&
          !isNaN(appid) &&
          resolveBridgeBottleName(String(appid)) === name
        ) {
          installed.set(appid, {
            installPath: join(steamappsDir, 'common', state.installdir ?? ''),
            sizeOnDisk: state.SizeOnDisk ?? '0'
          })
        }
      } catch {
        /* skip corrupt ACF — T-2-01 mitigation */
      }
    }
  }

  return installed
}
