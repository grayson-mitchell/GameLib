/**
 * A fresh, isolated Steam launch runtime for consumer tests (66.4-06). Plain object, no jest APIs:
 * every call builds its own monitors, raise loop, DRM runner registry, notice latch and capture
 * chain, so two tests never share state. The runtime chain is required lazily (testServices builds
 * one by default for every suite, and loading it at import would pull the steam launch modules in
 * ahead of suites that mock them). Default clock: a fake clock.
 */
import type { Clock } from '../process/types'
import type { SteamLaunchRuntime } from '../storeManagers/steam/steamLaunchRuntime'
import { createFakeClock } from './fakeClock'

export function createTestSteamLaunchRuntime(
  opts: { clock?: Clock } = {}
): SteamLaunchRuntime {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createSteamLaunchRuntime } =
    require('../storeManagers/steam/steamLaunchRuntime') as typeof import('../storeManagers/steam/steamLaunchRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createSteamLaunchRuntime({ clock: opts.clock ?? createFakeClock() })
}
