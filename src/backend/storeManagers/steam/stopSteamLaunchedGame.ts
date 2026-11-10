/**
 * quick 261111-9b7: Stop for Steam-launched games (Mac-native titles and
 * anything started via steam://rungameid). Finds the game's PIDs by
 * executable path inside the install folder, SIGTERMs them, waits a bounded
 * grace on the injected clock, then SIGKILLs only the survivors.
 *
 * Steam is never touched: it notices the exit itself and runs cloud sync and
 * playtime. win32 is a no-op.
 */
import { join, sep } from 'path'

import type { Clock, LogSink, ProcessRunner } from 'backend/process/types'

import { findPidsRunningFromFolder } from './runningFromFolder'

export interface StopSteamLaunchedGameDeps {
  runner: { run: ProcessRunner['run'] }
  clock: Clock
  platform: NodeJS.Platform
  log: Pick<LogSink, 'info' | 'warn'>
  getSteamLibraries: () => Promise<string[] | undefined>
  readAcfInstalldir: (steamappsDir: string, appId: string) => string | undefined
  sanitizeInstalldir: (
    candidate: string,
    appId: string,
    steamappsDir: string
  ) => string
  /** Throws like process.kill. */
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
  deps: StopSteamLaunchedGameDeps,
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
      const raw = deps.readAcfInstalldir(steamappsDir, appId)
      if (!raw || !raw.trim()) continue
      const installdir = deps.sanitizeInstalldir(raw, appId, steamappsDir)
      return join(steamappsDir, 'common', installdir)
    } catch {
      continue
    }
  }
  return undefined
}

function errCode(e: unknown): string | undefined {
  return (e as { code?: string } | null)?.code
}

export async function stopSteamLaunchedGame(
  deps: StopSteamLaunchedGameDeps,
  appId: string,
  opts: { graceMs?: number; pollMs?: number; psTimeoutMs?: number } = {}
): Promise<StopSteamLaunchedOutcome> {
  if (deps.platform === 'win32') return { kind: 'unsupported-platform' }
  try {
    const graceMs = opts.graceMs ?? 5000
    const pollMs = opts.pollMs ?? 250
    const folder = await resolveSteamLaunchedInstallFolder(deps, appId)
    if (!folder) return { kind: 'no-folder' }

    const scan = () =>
      findPidsRunningFromFolder(deps, folder, {
        timeoutMs: opts.psTimeoutMs,
        excludePids: deps.selfPids
      })

    let pids = await scan()
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
    if (pids.length === 0) return { kind: 'no-process', folder }

    const termed: number[] = []
    for (const pid of pids) {
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
      `stopping Steam-launched appId ${appId}: SIGTERM pids [${termed.join(', ')}] under ${folder}`
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
        `Steam-launched appId ${appId} ignored SIGTERM: SIGKILL pids [${killed.join(', ')}]`
      )
    }
    return { kind: 'stopped', folder, termed, killed }
  } catch (e) {
    return { kind: 'failed', error: e instanceof Error ? e.message : String(e) }
  }
}
