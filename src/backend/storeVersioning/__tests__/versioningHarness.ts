import { createMigrations } from '../../storeMigrations'
import { createStoreVersioning } from '../engine'
import { createReadOnlyStores } from '../readOnlyStores'
import type { Migration } from '../types'

/**
 * A versioning engine plus its read-only tracker with a per-instance migration override map, for
 * the suites that script chains mid-test. `setMigrations(key, undefined)` clears an override.
 * Nothing here is module state: a test builds one in `beforeEach` and drops it. Moved here from
 * testUtils/testStoreRoot.ts (85-23): the engine is no longer part of a `StoreRoot`, and this
 * directory goes with the engine in 85-24.
 */
export function createVersioningHarness() {
  const overrides = new Map<string, readonly Migration[]>()
  const readOnly = createReadOnlyStores({})
  const versioning = createStoreVersioning({
    migrations: createMigrations({ overrides }),
    readOnly
  })
  return {
    versioning,
    readOnly,
    setMigrations(chainKey: string, chain: readonly Migration[] | undefined) {
      if (chain === undefined) overrides.delete(chainKey)
      else overrides.set(chainKey, chain)
    }
  }
}

export type VersioningHarness = ReturnType<typeof createVersioningHarness>
