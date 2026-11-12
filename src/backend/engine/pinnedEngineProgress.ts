/**
 * Phase 61 (D-03): the pinned-engine download reporter every store shares. Lifted from Steam's
 * ensureBuiltInEngineForInstall so a non-Steam first install reports the same `engine-download`
 * statuses (one weighted percent across the DXVK and Wine archives, then verify/extract phases,
 * then `setting-up`) as a Steam one.
 */
import type { StatusUpdateDeps } from 'backend/appRuntime'
import type { OnlineMonitor } from 'backend/online_monitor'
import type { Runner } from 'common/types'
import type { ProcessRunner } from 'backend/process/types'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { sendGameStatusUpdate } from 'backend/utils'
import type { EnginePin } from './enginePins'
import type { FallbackEngine } from './fallbackEngine'
import type { NonCrossoverEngine } from './engineTypes'

export type PinnedEngineResult =
  | { ok: true; engine: NonCrossoverEngine }
  | {
      ok: false
      /** True for a cancel or quit (59-REVIEW WR-01): not a download failure. */
      aborted: boolean
      /** The `EnsureResult` reason, for the caller's own user-facing text. */
      reason: string
      error: string
    }

export async function ensurePinnedEngineReportingStatus(args: {
  pin: EnginePin
  appName: string
  runner: Runner
  /** The process runner the archive extraction runs through (66.2-11). */
  processRunner: Pick<ProcessRunner, 'run'>
  onlineMonitor: Pick<OnlineMonitor, 'isOnline'>
  /** The boot's fallback-engine owner (66.4-05). */
  fallback: Pick<FallbackEngine, 'ensurePinnedEngine'>
  sendFrontendMessage: StatusUpdateDeps['sendFrontendMessage']
  appRuntime: StatusUpdateDeps['appRuntime']
  signal?: AbortSignal
}): Promise<PinnedEngineResult> {
  const { pin, appName, runner, processRunner, onlineMonitor, signal } = args
  // G1 (59-22): one overall percent across both archives, so the label never
  // resets when the Wine archive starts after the small DXVK one; verify and
  // unpack are their own phases instead of a "0%" download.
  const weights = { dxvk: pin.dxvk.size, wine: pin.wine.size }
  const totalWeight = weights.dxvk + weights.wine
  const finished = new Set<'dxvk' | 'wine'>()
  let highest = 0
  let lastContext = ''
  let sentAny = false
  const sendEngineContext = (context: string) => {
    if (context === lastContext) return
    lastContext = context
    sentAny = true
    sendGameStatusUpdate(args, {
      appName,
      runner,
      status: 'engine-download',
      context
    })
  }
  const result = await args.fallback.ensurePinnedEngine(pin, {
    runner: processRunner,
    onlineMonitor,
    signal,
    onProgress: (p) => {
      if (p.phase === 'downloading') {
        let done = 0
        for (const artifact of finished) done += weights[artifact]
        const own = Math.min(Math.max(p.percentage ?? 0, 0), 100) / 100
        const overall =
          totalWeight > 0
            ? Math.floor(
                (100 * (done + own * weights[p.artifact])) / totalWeight
              )
            : Math.floor(own * 100)
        highest = Math.max(highest, overall)
        sendEngineContext(`downloading:${highest}`)
        return
      }
      finished.add(p.artifact)
      sendEngineContext(p.phase)
    }
  })
  if (result.ok && sentAny) sendEngineContext('setting-up')
  if (!result.ok && result.reason === 'aborted') {
    logInfo(
      `built-in engine download aborted for ${runner} ${appName}`,
      LogPrefix.Backend
    )
    sendGameStatusUpdate(args, { appName, runner, status: 'done' })
    return {
      ok: false,
      aborted: true,
      reason: result.reason,
      error: 'aborted'
    }
  }
  if (!result.ok) {
    logWarning(
      `built-in engine unavailable for ${runner} ${appName}: ${result.reason} ${result.detail}`,
      LogPrefix.Backend
    )
    sendGameStatusUpdate(args, { appName, runner, status: 'done' })
    return {
      ok: false,
      aborted: false,
      reason: result.reason,
      error: `${result.reason} ${result.detail}`
    }
  }
  return {
    ok: true,
    engine: {
      wineBin: result.paths.wineBin,
      wineserverBin: result.paths.wineserverBin,
      label: pin.label,
      version: pin.wine.version,
      dxvk: { dir: result.paths.dxvkDir, version: pin.dxvk.version }
    }
  }
}
