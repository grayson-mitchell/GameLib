/**
 * quick 261111-9mj / 261111-a9g: per-launch process watcher for Steam-launched
 * games (steam://rungameid on macOS/Linux, steam://launch on Windows).
 *
 * Why: the global RunningAppID poller runs from boot (quick 261111-7wo), but
 * macOS registry.vdf carries no RunningAppID (measured 2026-11-11, WazHack
 * 264160), so this watch is the Playing signal for rungameid launches and keeps
 * the Stop button (261111-9b7) reachable. posix (darwin/linux): poll the game's
 * install folder with ps, send `playing` when PIDs appear and one `done` when
 * they are all gone; when the poller reports the appId, pollerReports hands
 * status to it.
 *
 * win32 (quick 261111-a9g): the poller alone returns Play about 4.6 s after the
 * exe exits (Steam clears RunningAppID 2.1 s later, plus up to a 5 s poll
 * interval), so the watch owns a GameLib-launched game's status. It has two
 * phases because of measured costs on the operator's box: a PowerShell CIM scan
 * is 1.13 s wall and 1.89 s CPU, `reg query RunningAppID` is 0.03 s, and
 * process.kill(pid, 0) is about 0.04 ms.
 *   - Searching: every pollMs read RunningAppID (cheap) and run one PowerShell
 *     scan only once Steam reports the appId. Five empty scans while Steam
 *     reports it end the watch with no status (the game lives outside the
 *     install folder), leaving the status to the RunningAppID poller.
 *   - Tracking: every alivePollMs probe the tracked pids in-process. No
 *     PowerShell runs while the game runs. When every pid is dead, one confirm
 *     scan either finds a successor (launcher -> game chain, self-restart) or
 *     sends `done`.
 *
 * Bounds: a start window (nothing is sent if no PID ever appears), a scan
 * timeout, a consecutive-failure cap, and only unref'd timers from the
 * injected clock. One watch per appId.
 *
 * The registry is injected, not module state (backend-di-ceilings): the
 * caller owns the Map, this module never imports it.
 */
import type { TimerHandle } from 'backend/process/types'

import {
  resolveSteamLaunchedInstallFolder,
  scanSteamLaunchedPids,
  type StopSteamLaunchedGameDeps
} from './stopSteamLaunchedGame'

export interface SteamLaunchWatch {
  shown: boolean
  cancel(): void
  noteRelaunch(): void
  readonly settled: Promise<void>
}

export type SteamLaunchWatchRegistry = Map<string, SteamLaunchWatch>

export interface SteamLaunchWatchDeps extends Pick<
  StopSteamLaunchedGameDeps,
  | 'runner'
  | 'clock'
  | 'platform'
  | 'log'
  | 'getSteamLibraries'
  | 'readAcfInstalldir'
  | 'sanitizeInstalldir'
  | 'readExe'
  | 'realpath'
  | 'selfPids'
> {
  registry: SteamLaunchWatchRegistry
  sendStatus(appId: string, status: 'playing' | 'done'): void
  pollerReports(appId: string): boolean
  /** Steam's RunningAppID, 0 when none; never throws. Only the win32 loop calls it. */
  readRunningAppId(): Promise<number>
  /** In-process liveness of a pid. Only the win32 loop calls it. */
  pidAlive(pid: number): boolean
  /**
   * win32 only: claim the appId's status from the RunningAppID poller. The release is called
   * once when the watch ends, with true when it sent done or was cancelled (Stop owns the
   * terminal frame), false when it handed the status back.
   */
  pollerHold(appId: string): (terminalSent: boolean) => void
}

export interface SteamLaunchWatchOptions {
  pollMs?: number
  startWindowMs?: number
  psTimeoutMs?: number
  goneScans?: number
  maxScanFailures?: number
  /** win32 tracking-phase liveness interval. */
  alivePollMs?: number
  /** win32: empty scans tolerated while Steam reports the appId. */
  maxEmptyWhileReported?: number
}

export interface StartSteamLaunchWatchResult {
  status: 'started' | 'already-watching'
  settled: Promise<void>
}

export function startSteamLaunchWatch(
  deps: SteamLaunchWatchDeps,
  appId: string,
  opts: SteamLaunchWatchOptions = {}
): StartSteamLaunchWatchResult {
  const existing = deps.registry.get(appId)
  if (existing) {
    existing.noteRelaunch()
    return { status: 'already-watching', settled: existing.settled }
  }

  const win = deps.platform === 'win32'
  const pollMs = opts.pollMs ?? 2000
  const startWindowMs = opts.startWindowMs ?? 90000
  const psTimeoutMs = opts.psTimeoutMs ?? (win ? 15000 : 5000)
  const goneScans = opts.goneScans ?? 2
  const maxScanFailures = opts.maxScanFailures ?? 10
  const alivePollMs = opts.alivePollMs ?? 500
  const maxEmptyWhileReported = opts.maxEmptyWhileReported ?? 5

  let cancelled = false
  let reassert = false
  let origin = deps.clock.now()
  let timer: TimerHandle | undefined
  let wake: (() => void) | undefined
  let finish!: () => void
  const settled = new Promise<void>((r) => {
    finish = r
  })

  const entry: SteamLaunchWatch = {
    shown: false,
    settled,
    cancel() {
      cancelled = true
      if (timer) deps.clock.clear(timer)
      timer = undefined
      if (deps.registry.get(appId) === entry) deps.registry.delete(appId)
      wake?.()
    },
    noteRelaunch() {
      origin = deps.clock.now()
      if (entry.shown) reassert = true
    }
  }
  deps.registry.set(appId, entry)
  const releasePoller = win ? deps.pollerHold(appId) : undefined
  let doneSent = false
  const sendDone = () => {
    doneSent = true
    deps.sendStatus(appId, 'done')
  }

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      wake = resolve
      timer = deps.clock.setTimeout(() => {
        timer = undefined
        resolve()
      }, ms)
    })

  const runPosix = async (folder: string) => {
    let gone = 0
    let fails = 0
    for (;;) {
      await sleep(pollMs)
      if (cancelled) return
      if (deps.pollerReports(appId)) return
      if (reassert) {
        reassert = false
        deps.sendStatus(appId, 'playing')
      }
      let pids: number[] | undefined
      try {
        pids = await scanSteamLaunchedPids(deps, folder, { psTimeoutMs })
      } catch (e) {
        fails++
        if (cancelled) return
        if (entry.shown && fails >= maxScanFailures) {
          deps.log.warn(
            `appId ${appId}: ${fails} consecutive scan failures (${String(e)}); ending watch`
          )
          deps.sendStatus(appId, 'done')
          return
        }
      }
      if (cancelled) return
      if (pids) {
        fails = 0
        if (pids.length > 0) {
          gone = 0
          if (!entry.shown) {
            entry.shown = true
            deps.log.info(
              `appId ${appId} running: pids [${pids.join(', ')}] under ${folder}`
            )
            deps.sendStatus(appId, 'playing')
          }
          continue
        }
        if (entry.shown && ++gone >= goneScans) {
          deps.log.info(`appId ${appId} no longer running`)
          deps.sendStatus(appId, 'done')
          return
        }
      }
      if (!entry.shown && deps.clock.now() - origin >= startWindowMs) {
        deps.log.info(`appId ${appId}: no process within start window`)
        return
      }
    }
  }

  const runWin32 = async (folder: string) => {
    const wanted = Number(appId)
    let tracked: number[] = []
    let empties = 0
    let fails = 0

    // Searching: a cheap registry read gates each PowerShell scan.
    for (;;) {
      await sleep(pollMs)
      if (cancelled) return
      const running = await deps.readRunningAppId()
      if (cancelled) return
      if (running === wanted) {
        let pids: number[] | undefined
        try {
          pids = await scanSteamLaunchedPids(deps, folder, { psTimeoutMs })
        } catch {
          fails++
        }
        if (cancelled) return
        if (pids) {
          fails = 0
          if (pids.length > 0) {
            tracked = pids
            entry.shown = true
            deps.log.info(
              `appId ${appId} running: pids [${pids.join(', ')}] under ${folder}`
            )
            deps.sendStatus(appId, 'playing')
            break
          }
          if (++empties >= maxEmptyWhileReported) {
            deps.log.info(
              `appId ${appId}: Steam reports it running but no process under ${folder}; leaving it to the RunningAppID poller`
            )
            return
          }
        }
      } else {
        empties = 0
      }
      if (deps.clock.now() - origin >= startWindowMs) {
        deps.log.info(`appId ${appId}: no process within start window`)
        return
      }
    }

    // Tracking: in-process liveness, one confirm scan when every pid is gone.
    for (;;) {
      await sleep(alivePollMs)
      if (cancelled) return
      if (reassert) {
        reassert = false
        deps.sendStatus(appId, 'playing')
      }
      tracked = tracked.filter((pid) => deps.pidAlive(pid))
      if (tracked.length > 0) continue
      let pids: number[] | undefined
      try {
        pids = await scanSteamLaunchedPids(deps, folder, { psTimeoutMs })
      } catch (e) {
        fails++
        if (cancelled) return
        if (fails >= maxScanFailures) {
          deps.log.warn(
            `appId ${appId}: ${fails} consecutive scan failures (${String(e)}); ending watch`
          )
          sendDone()
          return
        }
      }
      if (cancelled) return
      if (!pids) continue
      fails = 0
      if (pids.length > 0) {
        tracked = pids
        deps.log.info(
          `appId ${appId}: tracked pids exited; now tracking [${pids.join(', ')}]`
        )
        continue
      }
      deps.log.info(`appId ${appId} no longer running`)
      sendDone()
      return
    }
  }

  const run = async () => {
    deps.log.info(`watching Steam-launched appId ${appId}`)
    const folder = await resolveSteamLaunchedInstallFolder(deps, appId)
    if (cancelled) return
    if (!folder) {
      deps.log.info(`no install folder for appId ${appId}; not watching`)
      return
    }
    if (win) await runWin32(folder)
    else await runPosix(folder)
  }

  void run()
    .catch((e: unknown) => {
      deps.log.warn(`launch watch for ${appId} failed: ${String(e)}`)
    })
    .finally(() => {
      if (deps.registry.get(appId) === entry) deps.registry.delete(appId)
      releasePoller?.(doneSent || cancelled)
      finish()
    })

  return { status: 'started', settled }
}

export function cancelSteamLaunchWatch(
  registry: SteamLaunchWatchRegistry,
  appId: string
): { cancelled: boolean; shown: boolean } {
  const entry = registry.get(appId)
  if (!entry) return { cancelled: false, shown: false }
  const shown = entry.shown
  entry.cancel()
  return { cancelled: true, shown }
}
