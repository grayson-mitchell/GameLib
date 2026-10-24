/**
 * Phase 52 Plan 08 (ROADMAP Scope 3): SteamStub bottle setup.
 *
 * Places the bridge-backed `steamclient64.dll` forwarder beside the game's x64
 * shim inside the bridge bottle and registers it under
 * `HKCU\Software\Valve\Steam\ActiveProcess\SteamClientDll64` with
 * `Universe=Public`.
 *
 * HKCU ONLY. `HKLM\Software\Valve\Steam` diverts the game into
 * `steam.exe -applaunch` (spike 036), so no argv built here ever names it.
 * Orchestrator decision 1: no `pid` value is written on the first live run.
 * Orchestrator decision 6: the x86 `SteamClientDll` value is not written, and
 * an x86 title is reported 'unavailable' rather than half-set-up.
 *
 * Every failure is a typed result; nothing throws into the launch path.
 */

import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { builtBridgeSteamClient64Path } from 'backend/constants/paths'
import { runWineCommand } from 'backend/launcher'
import type { GameSettings } from 'common/types'
import { getBottleDir, sanitizeBottleName } from '../bottle'

export const STEAMCLIENT_ACTIVE_PROCESS_KEY =
  'HKCU\\Software\\Valve\\Steam\\ActiveProcess'
const BRIDGE_STEAMCLIENT64_FILENAME = 'steamclient64.dll'

const NUMERIC_APP_ID = /^\d+$/
const SHIM64_FILENAME = 'steam_api64.dll'

type SteamClientSetupResult =
  | { status: 'placed'; forwarderPath: string; winPath: string }
  | { status: 'unavailable'; reason: 'x86-deferred' | 'forwarder-not-built' }
  | { status: 'error'; error: string }

function isContainedWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Two argv arrays (no shell): the forwarder path and the Public universe.
 * Throws on a value that could not be a plain Windows drive path.
 */
export function buildSteamClientRegistryCommands(input: {
  dll64WinPath: string
}): string[][] {
  const { dll64WinPath } = input
  if (
    typeof dll64WinPath !== 'string' ||
    !/^[A-Za-z]:\\/.test(dll64WinPath) ||
    /["\r\n\0]/.test(dll64WinPath)
  ) {
    throw new Error('buildSteamClientRegistryCommands: invalid dll64WinPath')
  }
  const add = (name: string, data: string): string[] => [
    'reg',
    'add',
    STEAMCLIENT_ACTIVE_PROCESS_KEY,
    '/v',
    name,
    '/t',
    'REG_SZ',
    '/d',
    data,
    '/f'
  ]
  return [add('SteamClientDll64', dll64WinPath), add('Universe', 'Public')]
}

/**
 * Maps an absolute host path inside `<bottleDir>/drive_c` to its `C:\` path.
 * Returns null for anything outside drive_c (including `..` escapes and
 * `dosdevices` aliases).
 */
export function toBottleWindowsPath(
  bottleDir: string,
  absPath: string
): string | null {
  const driveC = join(resolve(bottleDir), 'drive_c')
  const target = resolve(absPath)
  if (!isContainedWithin(driveC, target)) return null
  const rel = relative(driveC, target)
  return 'C:\\' + rel.split(sep).join('\\')
}

function isByteIdentical(a: string, b: string): boolean {
  try {
    if (statSync(a).size !== statSync(b).size) return false
    return readFileSync(a).equals(readFileSync(b))
  } catch {
    return false
  }
}

function chooseTargetDir(exePath: string, shimPaths: string[]): string {
  const exeDir = dirname(exePath)
  const beside = shimPaths.find((p) => dirname(resolve(p)) === exeDir)
  if (beside) return exeDir
  const x64 = shimPaths.find((p) => p.endsWith(SHIM64_FILENAME))
  if (x64) return dirname(resolve(x64))
  return exeDir
}

export async function setupSteamClientForwarder(opts: {
  appId: string
  bottleName: string
  bottleSettings: GameSettings
  exePath: string
  shimPaths: string[]
  arch: 'x86' | 'x64'
  forwarderSourcePath?: string
}): Promise<SteamClientSetupResult> {
  const { appId } = opts
  if (!NUMERIC_APP_ID.test(appId)) {
    return { status: 'error', error: `Invalid appId: "${appId}"` }
  }
  const bottleName = sanitizeBottleName(opts.bottleName)
  if (!bottleName) {
    return {
      status: 'error',
      error: `Invalid bottle name: "${opts.bottleName}"`
    }
  }
  if (opts.arch === 'x86') {
    logInfo(
      `setupSteamClientForwarder: appId ${appId} is x86 -- forwarder setup deferred`,
      LogPrefix.Steam
    )
    return { status: 'unavailable', reason: 'x86-deferred' }
  }

  const source = opts.forwarderSourcePath ?? builtBridgeSteamClient64Path
  if (!existsSync(source)) {
    logWarning(
      `setupSteamClientForwarder: forwarder not built at "${source}"`,
      LogPrefix.Steam
    )
    return { status: 'unavailable', reason: 'forwarder-not-built' }
  }

  const bottleDir = resolve(getBottleDir(bottleName))
  const targetDir = chooseTargetDir(resolve(opts.exePath), opts.shimPaths)
  const forwarderPath = join(targetDir, BRIDGE_STEAMCLIENT64_FILENAME)
  if (!isContainedWithin(bottleDir, resolve(forwarderPath))) {
    logError(
      `setupSteamClientForwarder: refusing target outside bridge bottle "${bottleName}" for appId ${appId}`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `Forwarder target is outside the bridge bottle: "${forwarderPath}"`
    }
  }

  try {
    if (!existsSync(forwarderPath) || !isByteIdentical(source, forwarderPath)) {
      copyFileSync(source, forwarderPath)
    }
  } catch (error) {
    logError(
      [`setupSteamClientForwarder: copy failed for appId ${appId}`, error],
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `Failed to place forwarder: ${String(error)}`
    }
  }

  const winPath = toBottleWindowsPath(bottleDir, forwarderPath)
  if (!winPath) {
    return {
      status: 'error',
      error: `Forwarder path is not under the bottle's drive_c: "${forwarderPath}"`
    }
  }

  let commands: string[][]
  try {
    commands = buildSteamClientRegistryCommands({ dll64WinPath: winPath })
  } catch (error) {
    return { status: 'error', error: String(error) }
  }

  for (const commandParts of commands) {
    const valueName = commandParts[4]
    try {
      const res = await runWineCommand({
        gameSettings: opts.bottleSettings,
        commandParts,
        wait: true,
        protonVerb: 'run'
      })
      if (res.code !== undefined && res.code !== 0) {
        logWarning(
          `setupSteamClientForwarder: reg add ${valueName} exited ${res.code} for appId ${appId}`,
          LogPrefix.Steam
        )
        return {
          status: 'error',
          error: `reg add ${valueName} failed with code ${res.code}`
        }
      }
    } catch (error) {
      logWarning(
        [`setupSteamClientForwarder: reg add ${valueName} threw`, error],
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: `reg add ${valueName} failed: ${String(error)}`
      }
    }
  }

  logInfo(
    `setupSteamClientForwarder: appId ${appId} registered ${winPath} under HKCU ActiveProcess`,
    LogPrefix.Steam
  )
  return { status: 'placed', forwarderPath, winPath }
}
