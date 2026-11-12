import { homedir } from 'os'
import { join } from 'path'
import { resolveAppDataDir } from '../process/appPaths'
import { createStoreRoot, type StoreRoot } from '../stores/storeRoot'
import type { Migration } from '../storeVersioning/types'

/**
 * The OS appData folder for the jest-contained fake HOME: what a booted sidecar derives
 * (`resolveAppPaths`) and what the retired pathShim's `getPath('appData')` returned.
 */
export function testAppDataDir(): string {
  return resolveAppDataDir(process.platform, process.env, homedir())
}

/** `<appData>/GameLib` for the jest-contained fake HOME: the default test StoreRoot's userData. */
export function testUserDataDir(): string {
  return join(testAppDataDir(), 'GameLib')
}

/**
 * A fresh StoreRoot for tests. With no argument it roots at the same userData a booted sidecar
 * derives for the jest-contained fake HOME (`jest.setupContainment.ts`), so a suite that reads
 * the files a store wrote through another root on the same directory still lines up. Each call
 * returns independent cells and an unbound changes channel.
 */
export function createTestStoreRoot(
  userData?: string,
  options: Pick<
    Parameters<typeof createStoreRoot>[0],
    'readOnlySinks' | 'migrationOverrides'
  > = {}
): StoreRoot {
  return createStoreRoot({
    ...options,
    userData: userData ?? testUserDataDir()
  })
}

/** A fresh versioning engine (its own root) for a consumer test that only needs the migration guard. */
export function createTestVersioning(
  options?: Parameters<typeof createTestStoreRoot>[1]
): StoreRoot['versioning'] {
  return createTestStoreRoot(undefined, options).versioning
}

/**
 * A versioning engine plus its read-only tracker with a per-instance migration override map, for
 * the suites that script chains mid-test. `setMigrations(key, undefined)` clears an override.
 * Nothing here is module state: a test builds one in `beforeEach` and drops it.
 */
export function createVersioningHarness() {
  const overrides = new Map<string, readonly Migration[]>()
  const root = createTestStoreRoot(undefined, { migrationOverrides: overrides })
  return {
    root,
    versioning: root.versioning,
    readOnly: root.readOnly,
    setMigrations(chainKey: string, chain: readonly Migration[] | undefined) {
      if (chain === undefined) overrides.delete(chainKey)
      else overrides.set(chainKey, chain)
    }
  }
}

export type VersioningHarness = ReturnType<typeof createVersioningHarness>
