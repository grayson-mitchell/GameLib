/**
 * A fresh, isolated Steam install runtime for consumer tests (66.4-09). Plain object, no jest APIs:
 * every call builds its own appinfo order tap, schema cache, lock table, depot job registry and poll
 * registries, so two tests never share state. Required lazily (testServices builds one by default for
 * every suite, and loading it at import would pull the depot and library modules in ahead of suites
 * that mock them).
 */
import type { SteamInstallRuntime } from '../storeManagers/steam/steamInstallRuntime'
import type { DepotTransport } from '../storeManagers/steam/depotRust/jobRegistry'
import { createTestAppRuntime } from './testAppRuntime'
import { createTestHostServices } from './testHostServices'

export function createTestSteamInstallRuntime(
  transport?: DepotTransport
): SteamInstallRuntime {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createSteamInstallRuntime } =
    require('../storeManagers/steam/steamInstallRuntime') as typeof import('../storeManagers/steam/steamInstallRuntime')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createSteamInstallRuntime(
    transport ?? {
      ...createTestHostServices(),
      appRuntime: createTestAppRuntime()
    }
  )
}
