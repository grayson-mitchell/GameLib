/**
 * Small helpers the 88-06 known-fix oracles share (the registry and the overlay oracle). Not a
 * test: nothing here records a golden.
 */
import * as logger from 'backend/logger'

/**
 * A macOS temp directory lives under `/var`, a link to `/private/var`, and an error that names a
 * partly resolved path prints `/private` in front of the root the profile was given, which
 * `normalisePaths` then leaves in front of the placeholder. No other host prints it.
 */
export const dropRealpathPrefix = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value).split('/private<').join('<')) as T

export const json = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`

export type LogLevel = 'debug' | 'info' | 'warning'

/** One call of a `backend/logger` function a module under test made. */
export interface LogLine {
  step: number
  level: LogLevel
  /** The `LogPrefix` the call carried, or `null` when it carried none. */
  prefix: string | null
  text: string
}

const LOGGER_FN = {
  debug: 'logDebug',
  info: 'logInfo',
  warning: 'logWarning'
} as const

/**
 * Replaces the named `backend/logger` functions with recorders (spied, not mocked) and returns the
 * restore function. Each call becomes `{ step, level, prefix, text }` in `sink`.
 */
export function spyLogs(
  sink: LogLine[],
  stepOf: () => number,
  levels: readonly LogLevel[]
): () => void {
  const spies = levels.map((level) => {
    const spy = jest.spyOn(logger, LOGGER_FN[level]) as jest.SpyInstance
    spy.mockImplementation(((message: unknown, prefix?: unknown) => {
      sink.push({
        step: stepOf(),
        level,
        prefix: typeof prefix === 'string' ? prefix : null,
        text: Array.isArray(message) ? message.join(' ') : String(message)
      })
    }) as never)
    return spy
  })
  return () => {
    for (const spy of spies) spy.mockRestore()
  }
}

/** Resolves on the next turn of the real event loop (captured before any fake timer is installed). */
const realSetImmediate = setImmediate
export const realTurn = (): Promise<void> =>
  new Promise((resolve) => realSetImmediate(resolve))

/**
 * Runs `start` under jest fake timers that leave `nextTick`, `setImmediate` and microtasks real, so
 * file system promises keep settling. `takeAdvance` is polled once per real turn: when it returns
 * a number the clock advances by that many ms (a deadline the case wants to pass), and the loop
 * ends when `start` settles. The advance is driven by the case, not by a guess, so a timer that
 * belongs to a run that is about to succeed is never fired early.
 */
export async function withFakeClock<T>(
  start: () => Promise<T>,
  takeAdvance: () => number | null
): Promise<T> {
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'queueMicrotask']
  })
  try {
    let done = false
    const running = start().finally(() => {
      done = true
    })
    // A rejection must not go unhandled while the loop waits.
    running.catch(() => undefined)
    while (!done) {
      await realTurn()
      const by = takeAdvance()
      if (by !== null) await jest.advanceTimersByTimeAsync(by)
    }
    return await running
  } finally {
    jest.useRealTimers()
  }
}
