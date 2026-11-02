/**
 * Phase 60 plan 04 (D-11): a diagnostic watcher for Mac Steam's overlay attach.
 *
 * Polls Mac Steam's console_log.txt once a second for at most 10 s, looking for
 * `GameOverlay: started '.../gameoverlayui' (pid N) for game process P`, and
 * logs exactly one line: attached, or `not attached within 10s`.
 *
 * Real-profile arm (gamelib-conventions, two-profile rule): this reads the
 * user's real Mac Steam log under the real HOME. It is read-only, spawns
 * nothing, and is bounded to one 64 KiB tail read per second for 10 s.
 *
 * Sidecar exit contract: every timer is unref'd and tracked, the watch
 * registers an abort controller so callAllAbortControllers() at stdin EOF ends
 * it, and nothing runs at import.
 *
 * Diagnostic only (D-11): no UI, no toast.
 */
import { join } from 'node:path'
import { logInfo, LogPrefix } from 'backend/logger'
import {
  createAbortController,
  deleteAbortController
} from 'backend/utils/aborthandler/aborthandler'
import {
  parseTimestampedLine,
  readBoundedTail
} from 'backend/storeManagers/steam/bottleLaunchSignals'

// ts-prune-ignore-next
export const OVERLAY_ATTACH_POLL_MS = 1000
// ts-prune-ignore-next
export const OVERLAY_ATTACH_TIMEOUT_MS = 10_000
const TAIL_BYTES = 65536
const CUTOFF_SLACK_MS = 5000
const MAX_LINE = 512

const OVERLAY_ATTACH_RE =
  /^ GameOverlay: started '([^'\n]{1,1024})\/gameoverlayui' \(pid ([0-9]{1,10})\) for game process ([0-9]{1,10})$/

const APP_ID_RE = /^[0-9]{1,10}$/

type OverlayAttachMatch = {
  overlayPid: number
  gamePid: number
  line: string
}

type OverlayAttachResult = {
  attached: boolean
  aborted?: boolean
  match?: OverlayAttachMatch
  elapsedMs?: number
}

type WatchDeps = {
  readTail?: (path: string, maxBytes?: number) => Promise<string>
  now?: () => number
  setTimeout?: (fn: () => void, ms: number) => { unref?: () => void }
  clearTimeout?: (handle: unknown) => void
  log?: (message: string) => void
}

// ts-prune-ignore-next
export function macSteamConsoleLogPath(userHome: string): string {
  return join(
    userHome,
    'Library',
    'Application Support',
    'Steam',
    'logs',
    'console_log.txt'
  )
}

function sanitize(line: string): string {
  // eslint-disable-next-line no-control-regex
  return line.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, MAX_LINE)
}

// ts-prune-ignore-next
export function findOverlayAttach(
  tail: string,
  launchStartedAt: number,
  gamePid?: number
): OverlayAttachMatch | null {
  const cutoff = launchStartedAt - CUTOFF_SLACK_MS
  let first: OverlayAttachMatch | null = null
  for (const raw of tail.split('\n')) {
    const parsed = parseTimestampedLine(raw)
    if (!parsed || parsed.timestampMs < cutoff) continue
    const m = OVERLAY_ATTACH_RE.exec(parsed.rest)
    if (!m) continue
    const match: OverlayAttachMatch = {
      overlayPid: Number(m[2]),
      gamePid: Number(m[3]),
      line: sanitize(raw.replace(/\r$/, ''))
    }
    if (gamePid === undefined || match.gamePid === gamePid) return match
    first ??= match
  }
  return first
}

// ts-prune-ignore-next
export async function watchOverlayAttach(
  opts: {
    appId: string
    consoleLogPath: string
    launchStartedAt: number
    gamePid?: number
  },
  deps: WatchDeps = {}
): Promise<OverlayAttachResult> {
  const readTail = deps.readTail ?? readBoundedTail
  const now = deps.now ?? Date.now
  const setT =
    deps.setTimeout ??
    ((fn: () => void, ms: number) =>
      setTimeout(fn, ms) as { unref?: () => void })
  const clearT = deps.clearTimeout ?? ((h: unknown) => clearTimeout(h as never))
  const log = deps.log ?? ((m: string) => logInfo(m, LogPrefix.Steam))

  if (!APP_ID_RE.test(opts.appId)) return { attached: false }

  const abortId = `overlay-attach:${opts.appId}:${opts.launchStartedAt}`
  const controller = createAbortController(abortId)
  const timers = new Set<unknown>()
  const prefix = `SteamGame: appId ${opts.appId} overlay attach:`
  const started = now()
  let reads = 0

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      if (controller.signal.aborted) return resolve()
      const done = () => {
        timers.delete(handle)
        clearT(handle)
        controller.signal.removeEventListener('abort', done)
        resolve()
      }
      const handle = setT(done, ms)
      timers.add(handle)
      handle.unref?.()
      controller.signal.addEventListener('abort', done, { once: true })
    })

  try {
    const maxReads = Math.ceil(
      OVERLAY_ATTACH_TIMEOUT_MS / OVERLAY_ATTACH_POLL_MS
    )
    while (reads < maxReads) {
      if (controller.signal.aborted) return { attached: false, aborted: true }
      reads += 1
      const tail = await readTail(opts.consoleLogPath, TAIL_BYTES)
      if (controller.signal.aborted) return { attached: false, aborted: true }
      const match = findOverlayAttach(tail, opts.launchStartedAt, opts.gamePid)
      if (match) {
        const elapsedMs = Math.max(0, now() - started)
        log(
          `${prefix} attached gameoverlayui pid=${match.overlayPid} game pid=${match.gamePid} after ${elapsedMs}ms: ${match.line}`
        )
        return { attached: true, match, elapsedMs }
      }
      if (reads >= maxReads) break
      await sleep(OVERLAY_ATTACH_POLL_MS)
    }
    if (controller.signal.aborted) return { attached: false, aborted: true }
    log(`${prefix} not attached within 10s`)
    return { attached: false }
  } catch {
    return { attached: false }
  } finally {
    for (const h of timers) clearT(h)
    timers.clear()
    deleteAbortController(abortId)
  }
}
