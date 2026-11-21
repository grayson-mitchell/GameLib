import { useCallback, useReducer } from 'react'

/**
 * Phase 100 (D-12): the busy/failed state machine behind every Install-tab
 * row, plus the never-throw failure logging it shares.
 *
 * A row goes idle -> busy when its action starts, back to idle on success and
 * to failed on a rejection or a contradicting answer. A failed row offers
 * Retry (failed -> busy). The row shows a fixed translated message; the raw
 * error reaches only `console.error` and `window.api.logError` (T-100-01).
 */

/** @public consumed by the Install-tab rows in plans 04-06 (see useRowAction) */
export type RowActionPhase = 'idle' | 'busy' | 'failed'

export interface RowActionState {
  phase: RowActionPhase
}

export type RowActionEvent =
  | { type: 'start' }
  | { type: 'succeed' }
  | { type: 'fail' }
  | { type: 'dismiss' }

export function rowActionReducer(
  state: RowActionState,
  event: RowActionEvent
): RowActionState {
  switch (event.type) {
    case 'start':
      return state.phase === 'busy' ? state : { phase: 'busy' }
    case 'succeed':
      return state.phase === 'busy' ? { phase: 'idle' } : state
    case 'fail':
      return state.phase === 'busy' ? { phase: 'failed' } : state
    case 'dismiss':
      return state.phase === 'failed' ? { phase: 'idle' } : state
  }
}

interface ReportRowActionFailureOptions {
  action: string
  appName: string
  error: unknown
}

/**
 * Logs a failed row action through two independent signals, ported from
 * `repairFailure.ts` without its dialog: a console line (transport
 * independent) and the operator log. Nothing here throws.
 */
export function reportRowActionFailure({
  action,
  appName,
  error
}: ReportRowActionFailureOptions): void {
  let errorText = '<unstringifiable error>'
  try {
    errorText =
      error instanceof Error ? (error.stack ?? error.message) : String(error)
  } catch {
    // keep the fallback errorText
  }

  try {
    // `error` is a second ARGUMENT, never interpolated, so a hostile value
    // cannot break the line.
    console.error(`${action} failed for ${appName}:`, error)
  } catch {
    // the log call below must still run
  }

  try {
    window.api.logError(`${action} failed for ${appName}: ${errorText}`)
  } catch (logErr) {
    try {
      console.error(`${action} failure log signal unavailable:`, logErr)
    } catch {
      // this diagnostic must never itself become a new throw path
    }
  }
}

interface RunRowActionOptions<T> {
  action: string
  appName: string
  run: () => Promise<T>
  dispatch: (event: RowActionEvent) => void
  /** True when the resolved answer contradicts the request (D-18). */
  isFailure?: (result: T) => boolean
}

/** Runs `run` through the state machine. Never rethrows. */
export async function runRowAction<T>({
  action,
  appName,
  run,
  dispatch,
  isFailure
}: RunRowActionOptions<T>): Promise<void> {
  dispatch({ type: 'start' })
  try {
    const result = await run()
    if (isFailure?.(result)) {
      reportRowActionFailure({
        action,
        appName,
        error: new Error(`${action} answer contradicted the request`)
      })
      dispatch({ type: 'fail' })
      return
    }
    dispatch({ type: 'succeed' })
  } catch (error) {
    reportRowActionFailure({ action, appName, error })
    dispatch({ type: 'fail' })
  }
}

/**
 * @public consumed by the Install-tab rows in plans 04-06 (location, size,
 * engine, uninstall); plan 01 proves the machine through its reducer and
 * `runRowAction` tests.
 */
export function useRowAction(action: string, appName: string) {
  const [state, dispatch] = useReducer(rowActionReducer, {
    phase: 'idle'
  } satisfies RowActionState)

  const run = useCallback(
    <T>(runFn: () => Promise<T>, isFailure?: (result: T) => boolean) =>
      runRowAction({ action, appName, run: runFn, dispatch, isFailure }),
    [action, appName]
  )
  const dismiss = useCallback(() => dispatch({ type: 'dismiss' }), [])

  return { phase: state.phase, run, dismiss }
}
