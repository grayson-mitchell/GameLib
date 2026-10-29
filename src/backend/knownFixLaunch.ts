/**
 * Launch-time application of the tier-1 `launchArgs` / `exeOverride` known-fix
 * keys (quick 261029-mbl).
 *
 * `exeOverride` was only shape-checked by the validator in `knownFixes.ts`;
 * this module checks it against the real install folder: it must resolve
 * (realpath) inside the realpath'd install path and be an existing regular
 * file. A symlink inside the install folder therefore cannot escape it, while
 * a symlinked install root is accepted (same "scan real, return lexical"
 * policy as quick 261029-m0u). Any failure logs a warning and the caller keeps
 * the default executable.
 *
 * MUST NOT import `electron` (or anything that transitively reaches it) --
 * the Node sidecar imports `knownFixes.ts` directly and this sits beside it.
 */

import { realpathSync, statSync } from 'fs'
import { isAbsolute, relative, resolve } from 'path'

import { Runner } from 'common/types'
import { isValidExeOverrideShape, readKnownFixes } from './knownFixes'
import { logInfo, logWarning, LogPrefix } from './logger'

function escapes(rel: string): boolean {
  return rel === '' || rel.startsWith('..') || isAbsolute(rel)
}

export function resolveKnownFixExeOverride(
  installPath: string,
  exeOverride: string,
  label: string
): string | undefined {
  const reject = (reason: string): undefined => {
    logWarning(
      `${label}: known-fix exeOverride '${exeOverride}' ${reason}, using the default executable.`,
      LogPrefix.Backend
    )
    return undefined
  }
  if (!isValidExeOverrideShape(exeOverride)) {
    return reject('is not a relative path inside the install folder')
  }
  if (!installPath) return reject('cannot be checked without an install path')
  try {
    const normalised = exeOverride.replace(/\\/g, '/')
    const realInstall = realpathSync(installPath)
    const lexical = resolve(installPath, normalised)
    if (escapes(relative(resolve(installPath), lexical))) {
      return reject('resolves outside the install folder')
    }
    if (!statSync(lexical).isFile()) return reject('is not a file')
    const realTarget = realpathSync(lexical)
    if (escapes(relative(realInstall, realTarget))) {
      return reject('resolves outside the install folder')
    }
    return lexical
  } catch (error) {
    return reject(`could not be verified (${String(error)})`)
  }
}

interface KnownFixLaunchOverrides {
  launchArgs: string[]
  exeOverride?: string
}

export function readKnownFixLaunchOverrides(
  appName: string,
  runner: Runner,
  installPath: string | undefined
): KnownFixLaunchOverrides {
  const label = `Known fix for '${appName}'`
  try {
    const fix = readKnownFixes(appName, runner)
    const launchArgs = fix?.launchArgs ?? []
    let exeOverride: string | undefined
    if (fix?.exeOverride) {
      exeOverride = installPath
        ? resolveKnownFixExeOverride(installPath, fix.exeOverride, label)
        : undefined
      if (!installPath) {
        logWarning(
          `${label}: known-fix exeOverride '${fix.exeOverride}' ignored, the install path is unknown.`,
          LogPrefix.Backend
        )
      }
    }
    if (launchArgs.length || exeOverride) {
      logInfo(
        `${label}: known-fix launchArgs ${JSON.stringify(launchArgs)}, exeOverride ${exeOverride ?? 'none'}`,
        LogPrefix.Backend
      )
    }
    return { launchArgs, exeOverride }
  } catch (error) {
    logWarning(
      `${label}: could not read launch overrides, ignoring.\n${String(error)}`,
      LogPrefix.Backend
    )
    return { launchArgs: [] }
  }
}
