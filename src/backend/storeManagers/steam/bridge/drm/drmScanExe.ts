/**
 * Phase 56 gap closure (Gap 11, plan 56-19): UE-aware SteamStub detection for
 * the launch path.
 *
 * D-12 reading: D-12 routes "every title whose launch exe scans as steamstub".
 * For an Unreal Engine title the bootstrap exe only re-launches the Shipping
 * exe, which is the binary SteamStub wraps and which bridgeScan already treats
 * as the runtime exe (findUnrealLayout). Treating the Shipping exe as part of
 * the launch exe's scan honours D-17's listing of Ranch Simulator; it adds no
 * allowlist and no per-title override.
 *
 * Containment policy is library-aware (quick 261029-m0u): both the launch exe
 * and every Shipping candidate must resolve inside realpath(dirname(exePath)),
 * so symlinked Bottles dirs and symlinked library ancestors (steamapps/common)
 * work while a symlink inside the game folder that escapes it is refused. Real
 * paths are scanned, lexical paths returned.
 *
 * The no-bottle fallback in shimGenerate.ts uses the same policy through
 * containedGameExeReal (quick 261029-my4).
 *
 * Phase 63 Option A: realpath containment and byte detection run in Rust
 * (scan_contained_real, scan_steamstub_section); this module only orchestrates
 * the UE layout probe, which stays TS (bridgeScan.findUnrealLayout).
 *
 * Callers (games.ts, wired in 56-21) must read CEG markers from `drmExe`, not
 * from the launch exe. Never throws.
 */
import { basename, dirname, resolve } from 'path'

import { logWarning, LogPrefix } from 'backend/logger'
import { invokeScan } from 'backend/scanners/rustScan'
import { RUST_SCAN_CONTAINED_REAL } from 'common/types/sidecarTransport'
import type { ContainedRealResult } from 'backend/scanners/scanTypes'
import { findUnrealLayout } from '../bridgeScan'
import { detectDrmWrapper } from '../shimDrmWrapper'

export interface LaunchDrmWrapper {
  drmWrapper: 'steamstub' | 'none' | undefined
  drmExe: string
}

type ContainFn = (
  path: string,
  rootDir: string,
  caller: string
) => Promise<ContainedRealResult>

function containLeaf(
  path: string,
  rootDir: string,
  _caller: string
): Promise<ContainedRealResult> {
  return invokeScan(RUST_SCAN_CONTAINED_REAL, { path, rootDir })
}

/**
 * Real path of `path` if it resolves inside `rootDir`, else null (logged).
 * A transport failure is treated as not contained. Never throws.
 */
async function containedUnder(
  rootDir: string,
  path: string,
  label: string,
  contain: ContainFn
): Promise<{ real: string | null; reason: ContainedRealResult['reason'] }> {
  const name = basename(path)
  let r: ContainedRealResult
  try {
    r = await contain(path, rootDir, label)
  } catch (error) {
    logWarning(
      `${label}: skipped ${name} (containment check failed: ${String(error)})`,
      LogPrefix.Steam
    )
    return { real: null, reason: null }
  }
  if (r.real !== null) return { real: r.real, reason: null }
  if (r.reason === 'root-unresolvable') {
    logWarning(
      `${label}: skipped ${name} (game folder unresolvable)`,
      LogPrefix.Steam
    )
  } else if (r.reason === 'realpath-failed') {
    logWarning(`${label}: skipped ${name} (realpath failed)`, LogPrefix.Steam)
  } else {
    logWarning(
      `${label}: skipped ${name} (escapes game folder)`,
      LogPrefix.Steam
    )
  }
  return { real: null, reason: r.reason }
}

/**
 * Real path of `exePath` if it resolves inside realpath(dirname(exePath)),
 * else null (logged). Single shared entry point for callers that scan one
 * exe. Never throws.
 */
export async function containedGameExeReal(
  exePath: string,
  label: string
): Promise<string | null> {
  try {
    const { real } = await containedUnder(
      dirname(exePath),
      exePath,
      label,
      containLeaf
    )
    return real
  } catch {
    return null
  }
}

export async function detectLaunchDrmWrapper(
  bottleDir: string,
  exePath: string,
  deps: {
    detect?: (p: string) => Promise<'steamstub' | 'none' | undefined>
    findUnreal?: typeof findUnrealLayout
    contain?: ContainFn
  } = {}
): Promise<LaunchDrmWrapper> {
  const detect =
    deps.detect ??
    ((p: string) => detectDrmWrapper(p, 'detectLaunchDrmWrapper'))
  const findUnreal = deps.findUnreal ?? findUnrealLayout
  const contain = deps.contain ?? containLeaf
  const gameDir = dirname(exePath)

  let launchResult: 'steamstub' | 'none' | undefined
  try {
    const launch = await containedUnder(
      gameDir,
      exePath,
      'detectLaunchDrmWrapper',
      contain
    )
    if (launch.reason === 'root-unresolvable') {
      return { drmWrapper: undefined, drmExe: exePath }
    }
    launchResult = launch.real ? await detect(launch.real) : undefined
  } catch {
    launchResult = undefined
  }
  const own: LaunchDrmWrapper = { drmWrapper: launchResult, drmExe: exePath }
  if (launchResult === 'steamstub') return own

  try {
    const layout = await findUnreal(bottleDir, gameDir)
    if (!layout) return own
    for (const candidate of [...layout.shippingExes].sort()) {
      if (!candidate.toLowerCase().endsWith('.exe')) continue
      const { real } = await containedUnder(
        gameDir,
        candidate,
        'detectLaunchDrmWrapper',
        contain
      )
      if (!real) continue
      try {
        if ((await detect(real)) === 'steamstub') {
          return { drmWrapper: 'steamstub', drmExe: resolve(candidate) }
        }
      } catch {
        logWarning(
          `detectLaunchDrmWrapper: skipped ${basename(candidate)} (scan threw)`,
          LogPrefix.Steam
        )
      }
    }
  } catch {
    return own
  }
  return own
}
