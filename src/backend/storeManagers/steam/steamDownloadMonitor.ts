/**
 * quick 261029-sex (spike 050): process plumbing for the live Steam download percent and speed.
 *
 * One `nettop` child per polled appId counts steam_osx's per-flow `bytes_in`, and an incremental
 * content_log.txt tail supplies the `update started` anchor. The maths is in
 * steamDownloadProgress.ts; this file only owns the child, the log offset and the sample ring.
 *
 * `readSteamDownloadMonitor` returns undefined on every guard failure so the install poller falls
 * back to today's ACF-derived behaviour exactly.
 *
 * Two-profile rule (CLAUDE.md "Fake-HOME isolation"): nettop reads no user profile and the spawn
 * passes no `env`, matching steamClientProcess.ts. There is no real-profile arm.
 *
 * Sidecar exit contract: the node child is a /bin/sh watchdog (childWatchdog.ts) that runs
 * script/nettop, spawned through the process runner as a long-lived child (D-10/D-11: no
 * timeout, registered for teardown at quit; the runner owns unref), nothing runs at import,
 * node adds no timer or watcher, and start does no network work. The watchdog polls the sidecar pid, so a hard kill (SIGKILL, Force
 * Quit) takes the tree down within about 1s, and it exits when the pinned Steam pid exits. Clean
 * stops go through the instance's stop (poll stop) and stopAll (stdin EOF, see
 * stdinEofRelease.ts). The Rust shutdown_child process-group SIGTERM remains the
 * backstop for normal exit: the watchdog traps it and kills script and nettop. nettop runs in
 * script's own pty session, so the group signal never reached it directly.
 */
import { closeSync, fstatSync, openSync, readSync } from 'fs'
import { join } from 'path'
import { logWarning, LogPrefix } from 'backend/logger'
import type { LongLivedHandle, ProcessRunner } from 'backend/process/types'
import { buildWatchdogSpawn } from './childWatchdog'
import {
  activeCount,
  applyContentLogEvent,
  applyNettopRow,
  createFlowAccumulator,
  createUpdateTracker,
  parseContentLogLine,
  parseNettopRow,
  windowRate,
  type FlowAccumulator,
  type UpdateTracker
} from './steamDownloadProgress'

const MAX_TAIL_BYTES = 256 * 1024
const SAMPLE_RING_MS = 5000

export type MonitorDeps = {
  runner: Pick<ProcessRunner, 'spawnLongLived'>
  platform: NodeJS.Platform
  listPids: () => Promise<number[] | undefined>
  /** Returns newly appended log text and the new offset. `offset` undefined = first read. */
  readTail: (offset: number | undefined) => { text: string; offset: number }
  now: () => number
  /** The sidecar pid the watchdog polls for parent death. */
  parentPid: number
}

type Monitor = {
  child?: LongLivedHandle
  acc: FlowAccumulator
  tracker: UpdateTracker
  samples: { ms: number; cum: number }[]
  logOffset?: number
  logCarry: string
  failed: boolean
  stopped: boolean
  now: () => number
  readTail: MonitorDeps['readTail']
}

/** Reads the appended tail of Steam's content_log.txt (the production `readTail`). */
export function readContentLogTail(offset: number | undefined): {
  text: string
  offset: number
} {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { GlobalConfig } =
    require('backend/config') as typeof import('backend/config')
  /* eslint-enable @typescript-eslint/no-require-imports */
  const { defaultSteamPath } = GlobalConfig.get().getSettings()
  const path = join(
    defaultSteamPath.replaceAll("'", ''),
    'logs',
    'content_log.txt'
  )
  const fd = openSync(path, 'r')
  try {
    const size = fstatSync(fd).size
    let start = offset
    let dropFirst = false
    if (start === undefined) {
      start = Math.max(0, size - MAX_TAIL_BYTES)
      dropFirst = start > 0
    } else if (size < start) {
      start = 0 // rotated
    }
    const len = Math.min(MAX_TAIL_BYTES, size - start)
    if (len <= 0) return { text: '', offset: start }
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, start)
    let text = buf.toString('utf8')
    if (dropFirst) {
      const nl = text.indexOf('\n')
      text = nl === -1 ? '' : text.slice(nl + 1)
    }
    return { text, offset: start + len }
  } finally {
    closeSync(fd)
  }
}

function scanLog(m: Monitor): void {
  try {
    const { text, offset } = m.readTail(m.logOffset)
    m.logOffset = offset
    if (!text) return
    const parts = (m.logCarry + text).split('\n')
    m.logCarry = parts.pop() ?? ''
    for (const line of parts) {
      const ev = parseContentLogLine(line)
      if (ev) applyContentLogEvent(m.tracker, ev, m.acc.cum)
    }
  } catch (error) {
    logWarning(['Steam: content_log tail failed:', error], LogPrefix.Steam)
  }
}

function fail(m: Monitor): void {
  m.failed = true
}

export interface SteamDownloadMonitor {
  /** Starts the monitor for `appId` (idempotent). Never rejects. */
  start(appId: string): Promise<void>
  /** Live reading for `appId`, or undefined when the poller must use the ACF as before. */
  read(appId: string): SteamDownloadReading | undefined
  stop(appId: string): void
  stopAll(): void
}

type SteamDownloadReading = {
  bytesDone: number
  bytesTotal: number
  speedBytesPerSec?: number
}

function kill(m: Monitor): void {
  m.stopped = true
  try {
    m.child?.kill('SIGTERM')
  } catch {
    // best-effort: the process group SIGTERM at shutdown is the backstop
  }
}

/**
 * The monitors Map is closure state of one boot-built instance (D-05/D-15). Resolves once the
 * child is spawned or the attempt was skipped; start never rejects.
 */
export function createSteamDownloadMonitor(
  deps: MonitorDeps
): SteamDownloadMonitor {
  const monitors = new Map<string, Monitor>()

  async function start(appId: string): Promise<void> {
    if (monitors.has(appId)) return
    if (deps.platform !== 'darwin') return
    const m: Monitor = {
      acc: createFlowAccumulator(),
      tracker: createUpdateTracker(),
      samples: [],
      logCarry: '',
      failed: false,
      stopped: false,
      now: deps.now,
      readTail: deps.readTail
    }
    // Registered before the first await so concurrent starts stay idempotent.
    monitors.set(appId, m)
    try {
      const pids = await deps.listPids()
      if (m.stopped || monitors.get(appId) !== m) return
      if (!pids || pids.length === 0) {
        monitors.delete(appId)
        return
      }
      const pid = Math.min(...pids)
      scanLog(m)
      const inner = [
        '/usr/bin/script',
        '-q',
        '/dev/null',
        '/usr/bin/nettop',
        '-x',
        '-n',
        '-L',
        '0',
        '-s',
        '1',
        '-J',
        'bytes_in',
        '-p',
        String(pid)
      ]
      const { file, args } = buildWatchdogSpawn(deps.parentPid, pid, inner)
      let buf = ''
      // No `env`: nettop reads no user profile (two-profile rule, see module docstring).
      const handle = deps.runner.spawnLongLived(file, args, {
        id: 'steam-download-monitor:' + appId,
        stdio: 'pipe',
        onStdout: (d) => {
          try {
            buf += d
            const rows = buf.split('\n')
            buf = rows.pop() ?? ''
            for (const r of rows) {
              const row = parseNettopRow(r)
              if (!row) continue
              if (row.kind === 'header') {
                if (m.acc.blocks >= 1) {
                  // The previous block is complete: sample it and re-read the log.
                  const ms = m.now()
                  m.samples.push({ ms, cum: m.acc.cum })
                  for (
                    let oldest = m.samples[0];
                    oldest !== undefined && ms - oldest.ms > SAMPLE_RING_MS;
                    oldest = m.samples[0]
                  ) {
                    m.samples.shift()
                  }
                  scanLog(m)
                }
              }
              applyNettopRow(m.acc, row)
            }
          } catch (error) {
            fail(m)
            logWarning(['Steam: nettop parse failed:', error], LogPrefix.Steam)
          }
        }
      })
      m.child = handle
      void handle.exited.then(() => fail(m))
    } catch (error) {
      fail(m)
      logWarning(
        ['Steam: download monitor start failed:', error],
        LogPrefix.Steam
      )
    }
  }

  function read(appId: string): SteamDownloadReading | undefined {
    try {
      const m = monitors.get(appId)
      if (!m || m.failed || m.stopped || !m.child) return undefined
      if (m.acc.blocks < 2) return undefined
      if (activeCount(m.tracker) !== 1) return undefined
      const upd = m.tracker.active.get(appId)
      if (!upd) return undefined
      const bytesDone =
        upd.downloadDone + Math.max(0, m.acc.cum - upd.cumAtStart)
      const speed = windowRate(m.samples, m.now())
      return {
        bytesDone,
        bytesTotal: upd.downloadTotal,
        ...(speed !== undefined ? { speedBytesPerSec: speed } : {})
      }
    } catch {
      return undefined
    }
  }

  function stop(appId: string): void {
    const m = monitors.get(appId)
    if (!m) return
    kill(m)
    monitors.delete(appId)
  }

  function stopAll(): void {
    for (const m of monitors.values()) kill(m)
    monitors.clear()
  }

  return { start, read, stop, stopAll }
}
