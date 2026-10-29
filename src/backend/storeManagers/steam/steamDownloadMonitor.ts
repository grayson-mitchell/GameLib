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
 * Sidecar exit contract: the child and its stdout socket are unref'd (a piped stdout socket holds
 * the loop even after child.unref()), nothing runs at import, there is no timer or watcher, and
 * start does no network work. The child is killed by stopSteamDownloadMonitor (poll stop) and by
 * stopAllSteamDownloadMonitors (stdin EOF, see stdinEofRelease.ts). It is non-detached, so the
 * Rust shutdown_child process-group SIGTERM is the backstop.
 */
import { spawn } from 'child_process'
import { closeSync, fstatSync, openSync, readSync } from 'fs'
import { join } from 'path'
import { logWarning, LogPrefix } from 'backend/logger'
import { listSteamClientPids } from './steamClientProcess'
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

type Unrefable = { unref?: () => void }

/** The slice of ChildProcess the monitor uses; kept narrow so tests can fake it. */
export type MonitorChild = {
  stdout:
    | ({
        on: (e: 'data', cb: (d: Buffer | string) => void) => unknown
      } & Unrefable)
    | null
  on: (e: string, cb: (...args: unknown[]) => void) => unknown
  kill: (signal?: NodeJS.Signals) => unknown
  unref: () => void
}

export type MonitorDeps = {
  platform: NodeJS.Platform
  listPids: () => Promise<number[] | undefined>
  spawn: (
    file: string,
    args: string[],
    options: { stdio: ['ignore', 'pipe', 'ignore'] }
  ) => MonitorChild
  /** Returns newly appended log text and the new offset. `offset` undefined = first read. */
  readTail: (offset: number | undefined) => { text: string; offset: number }
  now: () => number
}

type Monitor = {
  child?: MonitorChild
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

const monitors = new Map<string, Monitor>()

function defaultReadTail(offset: number | undefined): {
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

function defaultDeps(): MonitorDeps {
  return {
    platform: process.platform,
    listPids: () => listSteamClientPids('darwin'),
    spawn: (file, args, options) =>
      // No `env`: nettop reads no user profile (two-profile rule, see module docstring).
      spawn(file, args, options) as unknown as MonitorChild,
    readTail: defaultReadTail,
    now: () => Date.now()
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

/**
 * Starts the monitor for `appId` (idempotent). Resolves once the child is spawned or the
 * attempt was skipped; never rejects.
 */
export async function startSteamDownloadMonitor(
  appId: string,
  deps: MonitorDeps = defaultDeps()
): Promise<void> {
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
    const child = deps.spawn(
      '/usr/bin/script',
      [
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
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    )
    m.child = child
    let buf = ''
    child.stdout?.on('data', (d) => {
      try {
        buf += d.toString()
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
              while (
                m.samples.length > 0 &&
                ms - m.samples[0].ms > SAMPLE_RING_MS
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
    })
    child.on('error', () => fail(m))
    child.on('exit', () => fail(m))
    child.unref()
    child.stdout?.unref?.()
  } catch (error) {
    fail(m)
    logWarning(
      ['Steam: download monitor start failed:', error],
      LogPrefix.Steam
    )
  }
}

type SteamDownloadReading = {
  bytesDone: number
  bytesTotal: number
  speedBytesPerSec?: number
}

/** Live reading for `appId`, or undefined when the poller must use the ACF as before. */
export function readSteamDownloadMonitor(
  appId: string
): SteamDownloadReading | undefined {
  try {
    const m = monitors.get(appId)
    if (!m || m.failed || m.stopped || !m.child) return undefined
    if (m.acc.blocks < 2) return undefined
    if (activeCount(m.tracker) !== 1) return undefined
    const upd = m.tracker.active.get(appId)
    if (!upd) return undefined
    const bytesDone = upd.downloadDone + Math.max(0, m.acc.cum - upd.cumAtStart)
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

function kill(m: Monitor): void {
  m.stopped = true
  try {
    m.child?.kill('SIGTERM')
  } catch {
    // best-effort: the process group SIGTERM at shutdown is the backstop
  }
}

export function stopSteamDownloadMonitor(appId: string): void {
  const m = monitors.get(appId)
  if (!m) return
  kill(m)
  monitors.delete(appId)
}

export function stopAllSteamDownloadMonitors(): void {
  for (const m of monitors.values()) kill(m)
  monitors.clear()
}
