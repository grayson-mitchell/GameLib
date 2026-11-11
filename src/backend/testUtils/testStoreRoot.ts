import { homedir } from 'os'
import { join } from 'path'
import { resolveAppDataDir } from '../process/appPaths'
import { createStoreRoot, type StoreRoot } from '../stores/storeRoot'

/**
 * A fresh StoreRoot for tests. With no argument it roots at the same userData a booted sidecar
 * derives for the jest-contained fake HOME (`jest.setupContainment.ts`), so a suite that reads
 * the files a store wrote through another root on the same directory still lines up. Each call
 * returns independent cells and an unbound changes channel.
 */
export function createTestStoreRoot(userData?: string): StoreRoot {
  return createStoreRoot({
    userData:
      userData ??
      join(
        resolveAppDataDir(process.platform, process.env, homedir()),
        'GameLib'
      )
  })
}
