/**
 * quick 261111-9mj: per-launch process watcher for Steam-launched games
 * (steam://rungameid on macOS/Linux).
 *
 * Why: the global RunningAppID poller now runs from boot (quick 261111-7wo),
 * but macOS registry.vdf carries no RunningAppID (measured 2026-11-11, WazHack
 * 264160), so this watch remains the Playing signal for rungameid launches and
 * keeps the Stop button (261111-9b7) reachable. win32 launches are covered by
 * the poller, and this watch returns unsupported-platform there. When the
 * poller does report the appId, pollerReports hands status to it. This watch
 * polls the game's install folder for its PIDs and sends `playing` when they
 * appear and one `done` when they are all gone.
 *
 * Bounds: a start window (nothing is sent if no PID ever appears), a ps
 * timeout per scan, a consecutive-failure cap, and only unref'd timers from
 * the injected clock. One watch per appId.
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
}

export interface SteamLaunchWatchOptions {
  pollMs?: number
  startWindowMs?: number
  psTimeoutMs?: number
  goneScans?: number
  maxScanFailures?: number
}

export interface StartSteamLaunchWatchResult {
  status: 'started' | 'already-watching' | 'unsupported-platform'
  settled: Promise<void>
}

export function startSteamLaunchWatch(
  deps: SteamLaunchWatchDeps,
  appId: string,
  opts: SteamLaunchWatchOptions = {}
): StartSteamLaunchWatchResult {
  if (deps.platform === 'win32') {
    return { status: 'unsupported-platform', settled: Promise.resolve() }
  }
  const existing = deps.registry.get(appId)
  if (existing) {
    existing.noteRelaunch()
    return { status: 'already-watching', settled: existing.settled }
  }

  const pollMs = opts.pollMs ?? 2000
  const startWindowMs = opts.startWindowMs ?? 90000
  const psTimeoutMs = opts.psTimeoutMs ?? 5000
  const goneScans = opts.goneScans ?? 2
  const maxScanFailures = opts.maxScanFailures ?? 10

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

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      wake = resolve
      timer = deps.clock.setTimeout(() => {
        timer = undefined
        resolve()
      }, ms)
    })

  const run = async () => {
    deps.log.info(`watching Steam-launched appId ${appId}`)
    const folder = await resolveSteamLaunchedInstallFolder(deps, appId)
    if (cancelled) return
    if (!folder) {
      deps.log.info(`no install folder for appId ${appId}; not watching`)
      return
    }
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

  void run()
    .catch((e: unknown) => {
      deps.log.warn(`launch watch for ${appId} failed: ${String(e)}`)
    })
    .finally(() => {
      if (deps.registry.get(appId) === entry) deps.registry.delete(appId)
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
