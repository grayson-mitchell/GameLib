/**
 * quick 261111-9b7: Stop for Steam-launched games (Mac-native titles and
 * anything started via steam://rungameid). Finds the game's PIDs by
 * executable path inside the install folder, SIGTERMs them, waits a bounded
 * grace on the injected clock, then SIGKILLs only the survivors.
 *
 * win32 (quick 261111-9p6): Node's process.kill SIGTERM is an unconditional
 * TerminateProcess, so the close request is `taskkill /PID <pid>` (no force,
 * no tree) through the runner; survivors of the grace that a fresh rescan
 * still finds are then TerminateProcess'd. PIDs come from a PowerShell CIM
 * listing by executable path.
 *
 * Steam is never touched: it notices the exit itself and runs cloud sync and
 * playtime.
 */
import { join, sep } from 'path'

import type { Clock, LogSink, ProcessRunner } from 'backend/process/types'

import {
  findPidsRunningFromFolder,
  windowsSystem32Path
} from './runningFromFolder'

export interface StopSteamLaunchedGameDeps {
  runner: { run: ProcessRunner['run'] }
  clock: Clock
  platform: NodeJS.Platform
  log: Pick<LogSink, 'info' | 'warn'>
  getSteamLibraries: () => Promise<string[] | undefined>
  readAcfInstalldir: (
    steamappsDir: string,
    appId: string
  ) => Promise<string | undefined>
  sanitizeInstalldir: (
    candidate: string,
    appId: string,
    steamappsDir: string
  ) => string
  /**
   * Throws like process.kill. On win32 only 'SIGKILL' (TerminateProcess) and
   * 0 (an existence check) are used; the close request goes through taskkill.
   */
  signal: (pid: number, sig: 'SIGTERM' | 'SIGKILL' | 0) => void
  /** linux: /proc/<pid>/exe */
  readExe: (pid: number) => string | undefined
  realpath: (p: string) => string
  selfPids: readonly number[]
}

export type StopSteamLaunchedOutcome =
  | { kind: 'unsupported-platform' }
  | { kind: 'no-folder' }
  | { kind: 'no-process'; folder: string }
  | { kind: 'stopped'; folder: string; termed: number[]; killed: number[] }
  | { kind: 'failed'; error: string }

export async function resolveSteamLaunchedInstallFolder(
  deps: Pick<
    StopSteamLaunchedGameDeps,
    'getSteamLibraries' | 'readAcfInstalldir' | 'sanitizeInstalldir'
  >,
  appId: string
): Promise<string | undefined> {
  if (!/^\d+$/.test(appId)) return undefined
  let libs: string[] | undefined
  try {
    libs = await deps.getSteamLibraries()
  } catch {
    return undefined
  }
  for (const lib of libs ?? []) {
    const steamappsDir = join(lib, 'steamapps')
    try {
      const raw = await deps.readAcfInstalldir(steamappsDir, appId)
      if (!raw || !raw.trim()) continue
      const installdir = deps.sanitizeInstalldir(raw, appId, steamappsDir)
      return join(steamappsDir, 'common', installdir)
    } catch {
      continue
    }
  }
  return undefined
}

/**
 * win32 close request: `taskkill /PID <pid>` without /F or /T (the WM_CLOSE
 * analog of SIGTERM). Exit 128 = no such pid (the ESRCH analog). Anything else
 * that is not a clean 0 (windowless console exit 1, access denied, timeout,
 * spawn error) is 'unconfirmed' and still reaches the force step.
 */
async function requestWindowsClose(
  deps: Pick<StopSteamLaunchedGameDeps, 'runner'>,
  pid: number
): Promise<'sent' | 'gone' | 'unconfirmed'> {
  try {
    const res = await deps.runner.run(
      windowsSystem32Path('taskkill.exe'),
      ['/PID', String(pid)],
      { timeoutMs: 5000, windowsHide: true, stdin: '' }
    )
    if (res.timedOut || res.aborted) return 'unconfirmed'
    if (res.code === 0) return 'sent'
    if (res.code === 128) return 'gone'
    return 'unconfirmed'
  } catch {
    return 'unconfirmed'
  }
}

function errCode(e: unknown): string | undefined {
  return (e as { code?: string } | null)?.code
}

/**
 * ps scan for the pids whose executable lives in `folder`, with the linux
 * /proc exe filter. Shared by stop (261111-9b7) and the launch watch
 * (261111-9mj). Throws when ps does.
 */
export async function scanSteamLaunchedPids(
  deps: Pick<
    StopSteamLaunchedGameDeps,
    'runner' | 'platform' | 'readExe' | 'realpath' | 'selfPids'
  >,
  folder: string,
  opts: { psTimeoutMs?: number } = {}
): Promise<number[]> {
  let pids = await findPidsRunningFromFolder(deps, folder, {
    timeoutMs: opts.psTimeoutMs,
    excludePids: deps.selfPids
  })
  if (deps.platform === 'linux') {
    let real = folder
    try {
      real = deps.realpath(folder)
    } catch {
      // fall back to folder
    }
    pids = pids.filter((pid) => {
      const exe = deps.readExe(pid)?.replace(/ \(deleted\)$/, '')
      return (
        exe !== undefined &&
        (exe.startsWith(folder + sep) || exe.startsWith(real + sep))
      )
    })
  }
  return pids
}

export async function stopSteamLaunchedGame(
  deps: StopSteamLaunchedGameDeps,
  appId: string,
  opts: { graceMs?: number; pollMs?: number; psTimeoutMs?: number } = {}
): Promise<StopSteamLaunchedOutcome> {
  try {
    const graceMs = opts.graceMs ?? 5000
    const pollMs = opts.pollMs ?? 250
    const folder = await resolveSteamLaunchedInstallFolder(deps, appId)
    if (!folder) return { kind: 'no-folder' }

    const scan = () =>
      scanSteamLaunchedPids(deps, folder, { psTimeoutMs: opts.psTimeoutMs })

    const pids = await scan()
    if (pids.length === 0) return { kind: 'no-process', folder }

    const win = deps.platform === 'win32'
    const termed: number[] = []
    for (const pid of pids) {
      if (win) {
        const r = await requestWindowsClose(deps, pid)
        if (r === 'gone') continue
        termed.push(pid)
        if (r === 'unconfirmed') {
          deps.log.info(
            `close request for pid ${pid} unconfirmed: force-ended if it outlives the grace`
          )
        }
        continue
      }
      try {
        deps.signal(pid, 'SIGTERM')
        termed.push(pid)
      } catch (e) {
        if (errCode(e) === 'ESRCH') continue
        deps.log.warn(`SIGTERM pid ${pid} failed: ${String(e)}`)
      }
    }
    if (termed.length === 0) return { kind: 'no-process', folder }
    deps.log.info(
      win
        ? `stopping Steam-launched appId ${appId}: asked pids [${termed.join(', ')}] to close under ${folder}`
        : `stopping Steam-launched appId ${appId}: SIGTERM pids [${termed.join(', ')}] under ${folder}`
    )

    const alive = (pid: number): boolean => {
      try {
        deps.signal(pid, 0)
        return true
      } catch (e) {
        return errCode(e) === 'EPERM'
      }
    }
    const anyAlive = () => termed.some(alive)

    const start = deps.clock.now()
    let survived = anyAlive()
    while (survived && deps.clock.now() - start < graceMs) {
      await new Promise<void>((r) => {
        deps.clock.setTimeout(r, pollMs)
      })
      survived = anyAlive()
    }
    if (!survived) return { kind: 'stopped', folder, termed, killed: [] }

    const rescan = new Set(await scan())
    const killed: number[] = []
    for (const pid of termed) {
      if (!rescan.has(pid)) continue
      try {
        deps.signal(pid, 'SIGKILL')
        killed.push(pid)
      } catch (e) {
        if (errCode(e) !== 'ESRCH')
          deps.log.warn(`SIGKILL pid ${pid} failed: ${String(e)}`)
      }
    }
    if (killed.length > 0) {
      deps.log.info(
        win
          ? `Steam-launched appId ${appId} ignored the close request: force-ended pids [${killed.join(', ')}]`
          : `Steam-launched appId ${appId} ignored SIGTERM: SIGKILL pids [${killed.join(', ')}]`
      )
    }
    return { kind: 'stopped', folder, termed, killed }
  } catch (e) {
    return { kind: 'failed', error: e instanceof Error ? e.message : String(e) }
  }
}
