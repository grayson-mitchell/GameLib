/**
 * A fresh abort-controller registry and Wine window raiser for consumer tests (66.4-13; the raiser is a recording fake since 88.3-20). Plain
 * objects, no jest APIs: every call builds its own, so two tests never share controllers. The
 * factories are required lazily, as the other test runtimes do (testServices builds these by
 * default for every suite, and a suite that mocks `backend/logger` or the aborthandler module
 * must not have them loaded ahead of its mocks).
 */
import type { AbortRegistry } from '../utils/aborthandler/aborthandler'
import type { WineWindowRaiser } from '../launchrust/raise'

export function createTestAbortRegistry(): AbortRegistry {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createAbortRegistry } =
    require('../utils/aborthandler/aborthandler') as typeof import('../utils/aborthandler/aborthandler')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createAbortRegistry()
}

/** One `raise` call a {@link createTestWindowRaiser} fake recorded: the context, pids and process names as the caller passed them. */
export type RecordedRaise = Parameters<WineWindowRaiser['raise']>[1]

/**
 * A window raiser that only records (88.3-20). The real raise is Rust's and the TS raiser is deleted, so nothing is spawned and no
 * timer is armed: `raises` holds every call in order, `stops` counts `stop()`. `raise` resolves, as the real one never rejects.
 */
export function createTestWindowRaiser(): WineWindowRaiser & {
  raises: RecordedRaise[]
  stops: number
} {
  const raiser = {
    raises: [] as RecordedRaise[],
    stops: 0,
    async raise(_deps: unknown, opts: RecordedRaise): Promise<void> {
      raiser.raises.push(opts)
    },
    stop(): void {
      raiser.stops += 1
    }
  }
  return raiser
}
