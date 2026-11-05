/**
 * quick 261105-ord: backend caller for the bridge helper's
 * `--steam-installapp` subcommand (native/steam-bridge/helper/
 * gamelib_installapp.h). Never throws; every failure maps to a typed
 * 'unavailable' outcome so callers fall back to today's behaviour.
 *
 * The helper needs the REAL HOME to find the user's steamclient.dylib, so the
 * default runner passes no `env` (inherits). It is user-triggered and bounded
 * by a timeout, so it leaves no unbounded in-flight work.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'

import { steamBridgeHelperPath } from 'backend/constants/paths'
import { LogPrefix, logWarning } from 'backend/logger'

type SteamInstallAppOutcome =
  | { kind: 'ok'; folderIndex: number }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; code: number }

interface SteamInstallAppRunResult {
  stdout: string
  stderr: string
  code: number | null
}

interface SteamInstallAppDeps {
  helperPath?: string
  run?: (
    file: string,
    args: string[],
    timeoutMs: number
  ) => Promise<SteamInstallAppRunResult>
}

const HELPER_TIMEOUT_MS = 30000

const defaultRun = (
  file: string,
  args: string[],
  timeoutMs: number
): Promise<SteamInstallAppRunResult> =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: 64 * 1024 },
      (error, stdout, stderr) => {
        const rawCode = (error as (Error & { code?: unknown }) | null)?.code
        const code = error ? (typeof rawCode === 'number' ? rawCode : null) : 0
        resolve({
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          code
        })
      }
    )
  })

function warn(appId: string, detail: string, stderr = ''): void {
  const tail = stderr.trim().slice(-300)
  logWarning(
    `Steam InstallApp helper for ${appId}: ${detail}${tail ? ` (stderr: ${tail})` : ''}`,
    LogPrefix.Steam
  )
}

export async function requestSteamInstallApp(
  appId: string,
  opts: { libraryPath?: string } = {},
  deps: SteamInstallAppDeps = {}
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

  let res: SteamInstallAppRunResult
  try {
    res = await (deps.run ?? defaultRun)(helperPath, args, HELPER_TIMEOUT_MS)
  } catch (error) {
    warn(appId, `helper-failed (${String(error)})`)
    return { kind: 'unavailable', reason: 'helper-failed' }
  }

  const lines = res.stdout.split('\n').filter((l) => l.trim() !== '')
  const last = lines[lines.length - 1]
  let parsed: Record<string, unknown> | undefined
  try {
    const value: unknown = last === undefined ? undefined : JSON.parse(last)
    if (value && typeof value === 'object') {
      parsed = value as Record<string, unknown>
    }
  } catch {
    parsed = undefined
  }

  if (parsed?.result === 'ok') {
    const folderIndex =
      typeof parsed.folderIndex === 'number' ? parsed.folderIndex : 0
    return { kind: 'ok', folderIndex }
  }
  if (parsed?.result === 'unavailable' && typeof parsed.reason === 'string') {
    warn(appId, `unavailable: ${parsed.reason}`, res.stderr)
    return { kind: 'unavailable', reason: parsed.reason }
  }
  if (
    parsed?.result === 'error' &&
    typeof parsed.eAppUpdateError === 'number'
  ) {
    warn(appId, `EAppUpdateError ${parsed.eAppUpdateError}`, res.stderr)
    return { kind: 'error', code: parsed.eAppUpdateError }
  }
  warn(
    appId,
    `helper-failed (exit ${String(res.code)}, no result line)`,
    res.stderr
  )
  return { kind: 'unavailable', reason: 'helper-failed' }
}
