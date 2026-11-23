/**
 * The Steam side of the pinned engine (Phase 87, 87-56a, D-24): what a Steam path reads about the built-in Wine engine
 * without asking Rust. The download is Rust's; this file only answers the two questions the synchronous Steam checks
 * (the offline pre-check, the Wine-tool marker read) put about it, over the twin's pure `isPinnedEngineInstalled`, and
 * (below) wraps the first-need download.
 *
 * Sidecar exit contract: nothing runs at import, no timers.
 */
import { randomUUID } from 'crypto'
import { join } from 'path'
import type { Runner } from 'common/types'
import type { EnginePin, NonCrossoverEngine } from 'common/types/engine'
import type { AppPaths } from 'backend/process/context'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { ensureFallbackEngine } from 'backend/enginewine/fallback'
import { cancelRunTool } from 'backend/enginewine/runTool'
import {
  isPinnedEngineInstalled,
  type BottleReadContext
} from 'backend/enginewine/twin'

/**
 * The pinned-engine owner's two answers, as the read-only marker views take them (`BottleReadContext['fallback']`): the
 * root every pin lives under (`<toolsPath>/steam-engines`, the one root Rust and the TS fallback engine share) and
 * whether a pin's wine and DXVK are installed and carry the pin's own sha256. Both are the twin's, so the answer equals
 * Rust's `engines::is_pinned_engine_installed` (pinned by the twin vectors).
 */
export function pinnedEngineReader(
  paths: Pick<AppPaths, 'toolsPath'>
): BottleReadContext['fallback'] {
  const pinnedEngineRoot = (): string => join(paths.toolsPath, 'steam-engines')
  return {
    pinnedEngineRoot,
    isPinnedEngineInstalled: (pin) =>
      isPinnedEngineInstalled(pinnedEngineRoot(), pin)
  }
}

/** What the first-need download answers (Rust's `PinnedEngineResult`): the engine, or why there is none. */
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

const ABORTED: PinnedEngineResult = {
  ok: false,
  aborted: true,
  reason: 'aborted',
  error: 'aborted'
}

/** Rust's `PinnedEngineResult`, narrowed field by field; anything else is `undefined` (the caller names the failure). */
function pinnedEngineResultFrom(
  reply: unknown
): PinnedEngineResult | undefined {
  if (typeof reply !== 'object' || reply === null) return undefined
  const r = reply as Record<string, unknown>
  if (r.ok === true) {
    const e = r.engine as Record<string, unknown> | null | undefined
    const dxvk = e?.dxvk as Record<string, unknown> | null | undefined
    if (
      typeof e === 'object' &&
      e !== null &&
      typeof e.wineBin === 'string' &&
      typeof e.wineserverBin === 'string' &&
      typeof e.label === 'string' &&
      typeof e.version === 'string' &&
      (dxvk === null ||
        (typeof dxvk === 'object' &&
          typeof dxvk.dir === 'string' &&
          typeof dxvk.version === 'string'))
    ) {
      return {
        ok: true,
        engine: {
          wineBin: e.wineBin,
          wineserverBin: e.wineserverBin,
          label: e.label,
          version: e.version,
          dxvk: dxvk
            ? { dir: dxvk.dir as string, version: dxvk.version as string }
            : null
        }
      }
    }
    return undefined
  }
  if (
    r.ok === false &&
    typeof r.aborted === 'boolean' &&
    typeof r.reason === 'string' &&
    typeof r.error === 'string'
  ) {
    return { ok: false, aborted: r.aborted, reason: r.reason, error: r.error }
  }
  return undefined
}

/**
 * How often an abort re-sends its cancel when Rust answers that no run had registered the id yet: the download's request
 * may still be on its way when the signal fires, and a cancel that arrives first would otherwise be lost (87-55 deviation
 * 3). Each attempt is a round trip, which is what gives the registration time; no timer is armed.
 */
const CANCEL_ATTEMPTS = 5

/**
 * The Steam first-need download of the pinned engine, through Rust (Phase 87, 87-56a, D-01, D-10). Rust downloads,
 * verifies and extracts, and sends the `gameStatusUpdate` `engine-download` sequence (and `done` on a failure or an abort)
 * itself; this wrapper keeps what a Steam caller needs around it: the `AbortSignal` (an abort sends `engine_cancel` for
 * the run's cancel id), the two log lines the TS reporter wrote to gamelib.log, and a result that is always an answer.
 * It never rejects: a transport failure is `{ok: false, aborted: false, reason: 'download-failed'}`. `clearStatus` runs
 * whenever Rust never got to send its closing `done` (a transport failure, an unreadable reply, a signal already aborted),
 * so the caller can clear the renderer's engine-download status itself.
 */
export async function ensurePinnedEngineThroughRust(
  deps: RustInvokeDeps,
  args: {
    pin: EnginePin
    appName: string
    runner: Runner
    signal?: AbortSignal
    clearStatus?: () => void
  }
): Promise<PinnedEngineResult> {
  const { pin, appName, runner, signal } = args
  const where = `${runner} ${appName}`
  if (signal?.aborted) {
    logInfo(`built-in engine download aborted for ${where}`, LogPrefix.Backend)
    args.clearStatus?.()
    return ABORTED
  }

  const cancelId = `ee-${randomUUID()}`
  let finished = false
  const cancelInFlight = async (): Promise<void> => {
    for (let attempt = 0; attempt < CANCEL_ATTEMPTS && !finished; attempt++) {
      try {
        if ((await cancelRunTool(deps, cancelId)) === true) return
      } catch {
        return
      }
    }
  }
  const onAbort = (): void => {
    void cancelInFlight()
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  let result: PinnedEngineResult
  try {
    const narrowed = pinnedEngineResultFrom(
      await ensureFallbackEngine(deps, {
        pinId: pin.id,
        appName,
        runner,
        cancelId
      })
    )
    if (narrowed) {
      result = narrowed
    } else {
      args.clearStatus?.()
      result = {
        ok: false,
        aborted: false,
        reason: 'download-failed',
        error: 'unexpected engine download reply'
      }
    }
  } catch (e) {
    args.clearStatus?.()
    result = {
      ok: false,
      aborted: false,
      reason: 'download-failed',
      error: e instanceof Error ? e.message : String(e)
    }
  } finally {
    finished = true
    signal?.removeEventListener('abort', onAbort)
  }

  if (!result.ok && result.aborted) {
    logInfo(`built-in engine download aborted for ${where}`, LogPrefix.Backend)
  } else if (!result.ok) {
    logWarning(
      `built-in engine unavailable for ${where}: ${result.error}`,
      LogPrefix.Backend
    )
  }
  return result
}
