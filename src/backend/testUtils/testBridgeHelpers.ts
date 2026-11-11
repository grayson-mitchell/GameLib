/**
 * A fresh bridge-helper registry for consumer tests (D-66.3-14). Two calls never share a helper
 * map. The schedule, helper path and spawn env are inert placeholders: a test that really spawns
 * passes its own (a short schedule, a compiled helper, `createFakeHomeProfile()`'s env). The
 * factory is required lazily so importing this fake does not pull the registry into a suite that
 * mocks its module.
 */
import type {
  BridgeHelperRegistry,
  BridgeHelperRegistryDeps
} from '../storeManagers/steam/bridge/helperRegistry'

export function createTestBridgeHelpers(
  overrides: Partial<BridgeHelperRegistryDeps> = {}
): BridgeHelperRegistry {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { createBridgeHelperRegistry } =
    require('../storeManagers/steam/bridge/helperRegistry') as typeof import('../storeManagers/steam/bridge/helperRegistry')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return createBridgeHelperRegistry({
    steamWaitSchedule: overrides.steamWaitSchedule ?? {
      budgetMs: 60_000,
      intervalMs: 3_000
    },
    helperPath:
      overrides.helperPath ?? (() => '/test-gamelib/steam-bridge-helper'),
    spawnEnv: overrides.spawnEnv ?? (() => ({}))
  })
}
