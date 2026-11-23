import { randomUUID } from 'crypto'
import type { RunTool, RunToolResult } from 'common/types/engine'
import { cancelRunTool, rustRunTool } from 'backend/enginewine/runTool'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The bridge's `RunTool` over the Rust runner (Phase 87, 87-55, D-03, Pitfall 10).
 *
 * The DRM and overlay runner files call `runTool(tool, args, {timeoutMs, signal})` and never reject, so this keeps that
 * signature. What changes is where the program runs: Rust, through the two shims in `enginewine/runTool.ts`. An
 * `AbortSignal` cannot cross `rustInvoke`, so the run is named with a cancel id and the signal's abort sends
 * `engine_cancel` for it. The mapping lives here, not in the shim file, because a shim body is one returned call.
 */

const refusal = (stderr: string): RunToolResult => ({
  code: null,
  stdout: '',
  stderr,
  timedOut: false,
  aborted: false
})

/** Rust's `RunToolResult`, narrowed field by field; anything else is a refusal naming what came back. */
function runToolResultFrom(reply: unknown): RunToolResult {
  if (typeof reply === 'object' && reply !== null) {
    const r = reply as Record<string, unknown>
    if (
      (r.code === null || typeof r.code === 'number') &&
      typeof r.stdout === 'string' &&
      typeof r.stderr === 'string' &&
      typeof r.timedOut === 'boolean' &&
      typeof r.aborted === 'boolean'
    ) {
      return {
        code: r.code,
        stdout: r.stdout,
        stderr: r.stderr,
        timedOut: r.timedOut,
        aborted: r.aborted
      }
    }
  }
  return refusal('unexpected tool run reply')
}

/**
 * How often an abort re-sends its cancel when Rust answers that no run had registered the id yet: the run's request may
 * still be on its way when the signal fires, and a cancel that arrives first would otherwise be lost. Each attempt is a
 * round trip, which is what gives the registration time; no timer is armed.
 */
const CANCEL_ATTEMPTS = 5

/** A `RunTool` that runs through Rust. Never rejects. */
export function createRustRunTool(deps: RustInvokeDeps): RunTool {
  return async (tool, args, opts) => {
    if (opts.signal?.aborted) return { ...refusal(''), aborted: true }

    const cancelId = `rt-${randomUUID()}`
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
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      return runToolResultFrom(
        await rustRunTool(deps, {
          tool,
          args,
          timeoutMs: opts.timeoutMs,
          cancelId
        })
      )
    } catch (e) {
      return refusal(e instanceof Error ? e.message : String(e))
    } finally {
      finished = true
      opts.signal?.removeEventListener('abort', onAbort)
    }
  }
}
