/**
 * A fresh, isolated app runtime for consumer tests (66.4-17). Plain object, no jest APIs: every
 * call builds its own event bus, launch flights and overlay install table, so two tests never share
 * state. The chain is required lazily (testServices builds one by default for every suite, and
 * loading it at import would pull `backend/utils` in ahead of suites that mock it).
 */
import type { AppRuntime } from '../appRuntime'

export function createTestAppRuntime(): AppRuntime {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createAppRuntime } =
    require('../appRuntime') as typeof import('../appRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createAppRuntime()
}
