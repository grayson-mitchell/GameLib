/**
 * quick 261105-ord: backend caller for the bridge helper's
 * `--steam-installapp` subcommand, and (quick 261106-s3n) its
 * `--steam-uninstallapp` subcommand (native/steam-bridge/helper/
 * gamelib_installapp.h). Never throws; every failure maps to a typed
 * 'unavailable' outcome so callers fall back to today's behaviour.
 *
 * The helper needs the REAL HOME to find the user's steamclient.dylib, so the
 * default runner passes no `env` (inherits). It is user-triggered and bounded
 * by a timeout, so it leaves no unbounded in-flight work.
 */
import { existsSync } from 'node:fs'

import { steamBridgeHelperPath } from 'backend/constants/paths'
import { LogPrefix, logWarning } from 'backend/logger'
import type { ProcessRunner } from 'backend/process/types'

type SteamInstallAppOutcome =
  | { kind: 'ok'; folderIndex: number }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; code: number }

interface SteamInstallAppRunResult {
  stdout: string
  stderr: string
  code: number | null
}

export type SteamUninstallAppOutcome =
  | { kind: 'ok' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; code: number; installedApps: number | null }

interface SteamInstallAppDeps {
  helperPath?: string
  /** Only consulted by the uninstall caller (default process.platform). */
  platform?: NodeJS.Platform
  run: (
    file: string,
    args: string[],
    timeoutMs: number
  ) => Promise<SteamInstallAppRunResult>
}

const HELPER_TIMEOUT_MS = 30000

/**
 * The helper-run seam over the process runner. Helper truncation, timeout and
 * spawn failure all map to `code: null` (callers read that as helper-failed).
 */
export function createSteamInstallAppRun(deps: {
  runner: Pick<ProcessRunner, 'run'>
}): (
  file: string,
  args: string[],
  timeoutMs: number
) => Promise<SteamInstallAppRunResult> {
  return async (file, args, timeoutMs) => {
    try {
      const r = await deps.runner.run(file, args, {
        timeoutMs,
        maxBufferBytes: 64 * 1024,
        windowsHide: true,
        stdin: ''
      })
      return {
        stdout: r.stdout,
        stderr: r.stderr,
        code: r.truncated || r.timedOut ? null : r.code
      }
    } catch {
      return { stdout: '', stderr: '', code: null }
    }
  }
}

function warn(appId: string, detail: string, stderr = ''): void {
  const tail = stderr.trim().slice(-300)
  logWarning(
    `Steam InstallApp helper for ${appId}: ${detail}${tail ? ` (stderr: ${tail})` : ''}`,
    LogPrefix.Steam
  )
}

type HelperCall =
  | { ok: true; parsed: Record<string, unknown>; stderr: string }
  | { ok: false; reason: string; stderr: string }

/** Shared spawn + last-line JSON parse for both subcommands. */
async function callHelper(
  appId: string,
  helperPath: string,
  args: string[],
  deps: SteamInstallAppDeps
): Promise<HelperCall> {
  let res: SteamInstallAppRunResult
  try {
    res = await deps.run(helperPath, args, HELPER_TIMEOUT_MS)
  } catch (error) {
    warn(appId, `helper-failed (${String(error)})`)
    return { ok: false, reason: 'helper-failed', stderr: '' }
  }

  const lines = res.stdout.split('\n').filter((l) => l.trim() !== '')
  const last = lines[lines.length - 1]
  try {
    const value: unknown = last === undefined ? undefined : JSON.parse(last)
    if (value && typeof value === 'object') {
      return {
        ok: true,
        parsed: value as Record<string, unknown>,
        stderr: res.stderr
      }
    }
  } catch {
    // fall through to the no-result-line report
  }
  warn(
    appId,
    `helper-failed (exit ${String(res.code)}, no result line)`,
    res.stderr
  )
  return { ok: false, reason: 'helper-failed', stderr: res.stderr }
}

export async function requestSteamInstallApp(
  appId: string,
  opts: { libraryPath?: string },
  deps: SteamInstallAppDeps
): Promise<SteamInstallAppOutcome> {
  if (!/^\d{1,10}$/.test(appId)) {
    return { kind: 'unavailable', reason: 'bad-appid' }
  }
  const helperPath = deps.helperPath ?? steamBridgeHelperPath
  if (!existsSync(helperPath)) {
    warn(appId, 'helper-missing')
    return { kind: 'unavailable', reason: 'helper-missing' }
  }

  const args = ['--steam-installapp', appId]
  if (opts.libraryPath !== undefined) args.push('--library', opts.libraryPath)

  const call = await callHelper(appId, helperPath, args, deps)
  if (!call.ok) return { kind: 'unavailable', reason: call.reason }
  const { parsed, stderr } = call

  if (parsed.result === 'ok') {
    const folderIndex =
      typeof parsed.folderIndex === 'number' ? parsed.folderIndex : 0
    return { kind: 'ok', folderIndex }
  }
  if (parsed.result === 'unavailable' && typeof parsed.reason === 'string') {
    warn(appId, `unavailable: ${parsed.reason}`, stderr)
    return { kind: 'unavailable', reason: parsed.reason }
  }
  if (parsed.result === 'error' && typeof parsed.eAppUpdateError === 'number') {
    warn(appId, `EAppUpdateError ${parsed.eAppUpdateError}`, stderr)
    return { kind: 'error', code: parsed.eAppUpdateError }
  }
  warn(appId, 'helper-failed (unrecognised result line)', stderr)
  return { kind: 'unavailable', reason: 'helper-failed' }
}

/**
 * quick 261106-s3n: ask running, signed-in Steam to UninstallApp(appId).
 * macOS arm64 only; elsewhere (and for any helper doubt) the caller falls
 * back to deleting the files itself.
 */
export async function requestSteamUninstallApp(
  appId: string,
  deps: SteamInstallAppDeps
): Promise<SteamUninstallAppOutcome> {
  if (!/^\d{1,10}$/.test(appId)) {
    return { kind: 'unavailable', reason: 'bad-appid' }
  }
  if ((deps.platform ?? process.platform) !== 'darwin') {
    return { kind: 'unavailable', reason: 'unsupported-platform' }
  }
  const helperPath = deps.helperPath ?? steamBridgeHelperPath
  if (!existsSync(helperPath)) {
    warn(appId, 'helper-missing')
    return { kind: 'unavailable', reason: 'helper-missing' }
  }

  const call = await callHelper(
    appId,
    helperPath,
    ['--steam-uninstallapp', appId],
    deps
  )
  if (!call.ok) return { kind: 'unavailable', reason: call.reason }
  const { parsed, stderr } = call

  if (parsed.result === 'ok') return { kind: 'ok' }
  if (parsed.result === 'unavailable' && typeof parsed.reason === 'string') {
    warn(appId, `uninstall unavailable: ${parsed.reason}`, stderr)
    return { kind: 'unavailable', reason: parsed.reason }
  }
  if (parsed.result === 'error' && typeof parsed.eAppUpdateError === 'number') {
    const n = parsed.installedApps
    const installedApps = typeof n === 'number' && n >= 0 ? n : null
    warn(
      appId,
      `UninstallApp EAppUpdateError ${parsed.eAppUpdateError}`,
      stderr
    )
    return { kind: 'error', code: parsed.eAppUpdateError, installedApps }
  }
  warn(appId, 'helper-failed (unrecognised result line)', stderr)
  return { kind: 'unavailable', reason: 'helper-failed' }
}
