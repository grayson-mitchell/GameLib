/**
 * A fresh, isolated app runtime for consumer tests (66.4-17). Plain object, no jest APIs: every
 * call builds its own event bus, launch flights, image fetches, CrossOver index state and overlay
 * install table, so two tests never share state. The chain is required lazily (testServices
 * builds one by default for every suite, and loading it at import would pull `backend/utils` in
 * ahead of suites that mock it). Defaults: a fake clock and the test AppPaths under `/test-gamelib`.
 */
import type { AppRuntime, AppRuntimeDeps } from '../appRuntime'
import { createFakeClock } from './fakeClock'
import { createTestAppPaths } from './testAppPaths'

export function createTestAppRuntime(
  opts: Partial<AppRuntimeDeps> = {}
): AppRuntime {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createAppRuntime } =
    require('../appRuntime') as typeof import('../appRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createAppRuntime({
    clock: opts.clock ?? createFakeClock(),
    paths: opts.paths ?? createTestAppPaths('/test-gamelib')
  })
}
