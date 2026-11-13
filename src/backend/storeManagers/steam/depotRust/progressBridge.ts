// Turns Rust job events into the progressUpdate payload downloadFiles.ts sends, using the same
// rate and ETA helpers, so the DownloadManager and installStallWatchdog see no difference.
// No timers: the Rust side's own heartbeat arrives as progress events; an event with unchanged
// counters still re-sends the payload once the throttle window has passed.

import type { StatusUpdateDeps } from 'backend/appRuntime'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  getFileSize,
  sendGameStatusUpdate,
  sendProgressUpdate
} from 'backend/utils'
import type { Runner } from 'common/types'
import {
  PROGRESS_THROTTLE_MS,
  PROGRESS_THROTTLE_PERCENT,
  formatEta,
  rollingRateMiBs
} from './progress'
import type { RustJobEvent } from './types'

/**
 * Phase 74 (D-10): status-text contexts for the delta plan and commit phases. In update mode the
 * planning context (also sent by runBridgeUpdate before the job starts) is cleared with a plain
 * 'updating' status on `planned`, so the hero shows transfer stats (WR-07).
 */
export const STEAM_UPDATE_PLANNING_CONTEXT = 'steam-update-planning'
export const STEAM_UPDATE_COMMITTING_CONTEXT = 'steam-update-committing'

export function createProgressBridge(
  deps: StatusUpdateDeps,
  appName: string,
  runner: Runner = 'steam',
  now: () => number = Date.now,
  opts: { update?: boolean } = {}
): { onEvent(ev: RustJobEvent): void } {
  let totalBytes = 0
  let tStart = 0
  let runStartBytes = 0
  let lastEmitBytes = 0
  let lastEmitNetBytes = 0
  let lastEmitTime = 0
  let lastDownSpeed = 0
  let lastDiskSpeed = 0
  let started = false

  return {
    onEvent(ev) {
      switch (ev.kind) {
        case 'planned':
          totalBytes = ev.totalBytes
          if (opts.update) {
            sendGameStatusUpdate(deps, { appName, runner, status: 'updating' })
          }
          return
        case 'stage':
          sendGameStatusUpdate(deps, {
            appName,
            runner,
            status: 'updating',
            context:
              ev.stage === 'delta_planning'
                ? STEAM_UPDATE_PLANNING_CONTEXT
                : STEAM_UPDATE_COMMITTING_CONTEXT
          })
          return
        case 'warning':
          logWarning(
            `[depot-rust] ${ev.message}${ev.count > 1 ? ` (x${ev.count})` : ''}`,
            LogPrefix.Steam
          )
          return
        case 'hostSummary': {
          const worst = [...ev.hosts]
            .sort((a, b) => b.failures - a.failures)
            .slice(0, 3)
            .map((h) => `${h.host}:${h.chunks}ok/${h.failures}fail`)
            .join(' ')
          logInfo(
            `[Timing] chunk-stream stats: hosts=${ev.hosts.length} worstHosts=[${worst}]`,
            LogPrefix.Steam
          )
          return
        }
        case 'progress': {
          const t = now()
          if (!started) {
            started = true
            tStart = t
            lastEmitTime = t
            runStartBytes = ev.doneBytes
            lastEmitBytes = ev.doneBytes
            lastEmitNetBytes = ev.netBytes
          }
          if (ev.totalBytes > 0) totalBytes = ev.totalBytes
          const percentDelta =
            totalBytes > 0
              ? ((ev.doneBytes - lastEmitBytes) / totalBytes) * 100
              : 0
          const timeDelta = t - lastEmitTime
          if (
            percentDelta < PROGRESS_THROTTLE_PERCENT &&
            timeDelta < PROGRESS_THROTTLE_MS &&
            t !== tStart
          ) {
            return
          }
          lastDownSpeed = rollingRateMiBs(
            ev.netBytes - lastEmitNetBytes,
            timeDelta,
            lastDownSpeed
          )
          lastDiskSpeed = rollingRateMiBs(
            ev.doneBytes - lastEmitBytes,
            timeDelta,
            lastDiskSpeed
          )
          lastEmitBytes = ev.doneBytes
          lastEmitNetBytes = ev.netBytes
          lastEmitTime = t

          const elapsedSec = (t - tStart) / 1000
          const avgBytesPerSec =
            elapsedSec > 0 ? (ev.doneBytes - runStartBytes) / elapsedSec : 0
          const remaining = Math.max(totalBytes - ev.doneBytes, 0)
          const etaSec = avgBytesPerSec > 0 ? remaining / avgBytesPerSec : 0

          sendProgressUpdate(deps, {
            appName,
            runner,
            status: 'installing',
            progress: {
              percent:
                totalBytes > 0
                  ? Math.min(100, Math.round((ev.doneBytes / totalBytes) * 100))
                  : 0,
              bytes: getFileSize(ev.doneBytes),
              downSpeed: lastDownSpeed,
              diskSpeed: lastDiskSpeed,
              eta:
                Number.isFinite(etaSec) && etaSec > 0 ? formatEta(etaSec) : ''
            }
          })
        }
      }
    }
  }
}
