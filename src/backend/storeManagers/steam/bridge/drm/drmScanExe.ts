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
 * Callers (games.ts, wired in 56-21) must read CEG markers from `drmExe`, not
 * from the launch exe. Never throws.
 */
import { dirname } from 'path'
import { realpath } from 'fs/promises'

import { findUnrealLayout, isContainedWithin } from '../bridgeScan'
import { detectDrmWrapper } from '../shimGenerate'

export interface LaunchDrmWrapper {
  drmWrapper: 'steamstub' | 'none' | undefined
  drmExe: string
}

export async function detectLaunchDrmWrapper(
  bottleDir: string,
  exePath: string,
  deps: {
    detect?: typeof detectDrmWrapper
    findUnreal?: typeof findUnrealLayout
  } = {}
): Promise<LaunchDrmWrapper> {
  const detect = deps.detect ?? detectDrmWrapper
  const findUnreal = deps.findUnreal ?? findUnrealLayout

  let launchResult: 'steamstub' | 'none' | undefined
  try {
    launchResult = detect(exePath)
  } catch {
    launchResult = undefined
  }
  const own: LaunchDrmWrapper = { drmWrapper: launchResult, drmExe: exePath }
  if (launchResult === 'steamstub') return own

  try {
    const layout = await findUnreal(bottleDir, dirname(exePath))
    if (!layout) return own
    for (const candidate of layout.shippingExes) {
      if (!candidate.toLowerCase().endsWith('.exe')) continue
      let real: string
      try {
        real = await realpath(candidate)
      } catch {
        continue
      }
      if (!isContainedWithin(bottleDir, real)) continue
      if (detect(real) === 'steamstub') {
        return { drmWrapper: 'steamstub', drmExe: real }
      }
    }
  } catch {
    return own
  }
  return own
}
