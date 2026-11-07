/**
 * SteamStub and CEG detection and the drmWrapper result stamp, split out of
 * shimGenerate.ts (Phase 65 Plan 16). See shimGenerate.ts for the placement
 * design notes.
 */

import { resolve } from 'node:path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { invokeScan } from 'backend/scanners/rustScan'
import { RUST_SCAN_STEAMSTUB_SECTION } from 'common/types/sidecarTransport'
import { detectSteamDrmInPe } from './peScan'
import { readFileEffectiveArch } from './bridgeScan'
import type { PlaceShimResultBase, SteamExeDrmSignal } from './shimOriginals'

/**
 * Phase 52 Plan 08 (ROADMAP Scope 4): true SteamStub detection from the PE
 * section table. Phase 63: the Rust op reads at most 8192 bytes
 * (PE_SECTION_SCAN_BYTES); never rejects. Callers pass only a contained real
 * path already confirmed to lie inside the real path of the game folder
 * (dirname of the launch exe). Both callers enforce this:
 * detectLaunchDrmWrapper, and placeShimForGame's no-bottle fallback via
 * containedGameExeReal.
 */
export async function detectDrmWrapper(
  exePath: string,
  _caller = 'placeShimForGame'
): Promise<'steamstub' | 'none' | undefined> {
  try {
    const r = await invokeScan(RUST_SCAN_STEAMSTUB_SECTION, { exePath })
    if (r.drmWrapper === null) {
      logWarning(
        `detectDrmWrapper: could not read "${exePath}" (${String(r.readError)})`,
        LogPrefix.Steam
      )
      return undefined
    }
    return r.drmWrapper
  } catch (error) {
    logWarning(
      `detectDrmWrapper: could not read "${exePath}" (${String(error)})`,
      LogPrefix.Steam
    )
    return undefined
  }
}

/**
 * Stamps drmWrapper:'steamstub' on the result and its verdict for the
 * statuses that carry a shim outcome. The key is absent (not undefined)
 * when nothing was detected. Runs only on non-error results, i.e. after the
 * exe-containment check passed.
 */
export function withDrmWrapper(
  appId: string,
  gameExePath: string,
  result: PlaceShimResultBase,
  launch: { drmWrapper: 'steamstub' | 'none' | undefined; drmExe: string }
): PlaceShimResultBase {
  if (
    result.status !== 'placed' &&
    result.status !== 'already-placed' &&
    result.status !== 'placed-miss' &&
    result.status !== 'no-steam-api' &&
    result.status !== 'withheld'
  ) {
    return result
  }
  const resolvedExe = resolve(gameExePath)
  const wrapper = launch.drmWrapper
  // IN-06: exeArch describes the exe wine actually runs (bootstrap/launch
  // exe); drmWrapper and drm describe the exe carrying .bind (launch.drmExe).
  const exeArch = readFileEffectiveArch(resolvedExe)
  const stamp = { exeArch, ...(wrapper ? { drmWrapper: wrapper } : {}) }
  if (wrapper !== 'steamstub') return { ...result, ...stamp }
  logInfo(
    `placeShimForGame: appId ${appId} ${
      launch.drmExe === resolvedExe ? 'launch exe' : 'UE runtime exe'
    } carries a SteamStub .bind section (drmWrapper=steamstub)`,
    LogPrefix.Steam
  )
  const verdict = result.verdict
    ? { ...result.verdict, drmWrapper: 'steamstub' as const }
    : undefined
  return {
    ...result,
    ...stamp,
    ...(verdict ? { verdict } : {})
  } as PlaceShimResultBase
}

/**
 * Quick 261024-br4: path-based SteamStub/CEG scan (Phase 63: the Rust op
 * does the ranged reads, never slurping the exe, T-br4-02). Returns
 * undefined when the PE did not parse or the read failed (logged, treated as
 * not CEG). A SteamStub `.bind` section is logged here. Routing happens at
 * launch: games.ts sends a `.bind` exe with no CEG markers to
 * steamclient-layer DRM mode before any shim placement (Phase 56, D-12).
 */
export async function detectExeSteamDrm(
  appId: string,
  exePath: string
): Promise<SteamExeDrmSignal | null | undefined> {
  const result = await detectSteamDrmInPe(exePath, 'placeShimForGame')
  if (result.readError !== null) {
    logWarning(
      `placeShimForGame: Steam DRM detection could not read the exe for appId ${appId} -- treating as not CEG (${result.readError})`,
      LogPrefix.Steam
    )
    return undefined
  }
  if (!result.parsed) {
    logWarning(
      `placeShimForGame: Steam DRM detection could not parse the exe as a PE for appId ${appId} -- treating as not CEG`,
      LogPrefix.Steam
    )
    return undefined
  }
  if (result.hasBindSection) {
    logInfo(
      `placeShimForGame: SteamStub .bind section present in the exe for appId ${appId} (launch routes it to steamclient-layer DRM mode, Phase 56)`,
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
}
