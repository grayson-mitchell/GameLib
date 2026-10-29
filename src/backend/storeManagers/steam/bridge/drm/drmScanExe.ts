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
 * Callers (games.ts, wired in 56-21) must read CEG markers from `drmExe`, not
 * from the launch exe. Never throws.
 */
import { basename, dirname, resolve } from 'path'
import { realpath } from 'fs/promises'

import { logWarning, LogPrefix } from 'backend/logger'
import { findUnrealLayout, isContainedWithin } from '../bridgeScan'
import { detectDrmWrapper } from '../shimGenerate'

export interface LaunchDrmWrapper {
  drmWrapper: 'steamstub' | 'none' | undefined
  drmExe: string
}

/** Real path of `path` if it resolves inside `rootReal`, else null (logged). */
async function containedReal(
  rootReal: string,
  path: string,
  label: string
): Promise<string | null> {
  const name = basename(path)
  let real: string
  try {
    real = await realpath(path)
  } catch {
    logWarning(`${label}: skipped ${name} (realpath failed)`, LogPrefix.Steam)
    return null
  }
  if (!isContainedWithin(rootReal, real)) {
    logWarning(
      `${label}: skipped ${name} (escapes game folder)`,
      LogPrefix.Steam
    )
    return null
  }
  return real
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
    let rootReal: string
    try {
      rootReal = await realpath(dirname(exePath))
    } catch {
      logWarning(
        `${label}: skipped ${basename(exePath)} (game folder unresolvable)`,
        LogPrefix.Steam
      )
      return null
    }
    return await containedReal(rootReal, exePath, label)
  } catch {
    return null
  }
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

  let ueRootReal: string
  try {
    ueRootReal = await realpath(dirname(exePath))
  } catch {
    logWarning(
      `detectLaunchDrmWrapper: skipped ${basename(exePath)} (game folder unresolvable)`,
      LogPrefix.Steam
    )
    return { drmWrapper: undefined, drmExe: exePath }
  }

  let launchResult: 'steamstub' | 'none' | undefined
  try {
    const real = await containedReal(
      ueRootReal,
      exePath,
      'detectLaunchDrmWrapper'
    )
    launchResult = real ? detect(real) : undefined
  } catch {
    launchResult = undefined
  }
  const own: LaunchDrmWrapper = { drmWrapper: launchResult, drmExe: exePath }
  if (launchResult === 'steamstub') return own

  try {
    const layout = await findUnreal(bottleDir, dirname(exePath))
    if (!layout) return own
    for (const candidate of [...layout.shippingExes].sort()) {
      if (!candidate.toLowerCase().endsWith('.exe')) continue
      const real = await containedReal(
        ueRootReal,
        candidate,
        'detectLaunchDrmWrapper'
      )
      if (!real) continue
      try {
        if (detect(real) === 'steamstub') {
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
