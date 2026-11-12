/**
 * A fresh abort-controller registry and Wine window raiser for consumer tests (66.4-13). Plain
 * objects, no jest APIs: every call builds its own, so two tests never share controllers. The
 * factories are required lazily, as the other test runtimes do (testServices builds these by
 * default for every suite, and a suite that mocks `backend/logger` or the aborthandler module
 * must not have them loaded ahead of its mocks).
 */
import type { Clock } from '../process/types'
import type { AbortRegistry } from '../utils/aborthandler/aborthandler'
import type { WineWindowRaiser } from '../utils/wineWindowRaise'
import { createFakeClock } from './fakeClock'

export function createTestAbortRegistry(): AbortRegistry {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createAbortRegistry } =
    require('../utils/aborthandler/aborthandler') as typeof import('../utils/aborthandler/aborthandler')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createAbortRegistry()
}

/** A window raiser on a fake clock (or the one a test passes). */
export function createTestWindowRaiser(
  clock: Clock = createFakeClock()
): WineWindowRaiser {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createWineWindowRaiser } =
    require('../utils/wineWindowRaise') as typeof import('../utils/wineWindowRaise')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createWineWindowRaiser({ clock })
}
