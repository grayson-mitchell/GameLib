import { join } from 'path'
import { derivePaths } from '../process/appPaths'
import type { AppPaths } from '../process/context'

// src/backend/testUtils -> repo root, so publicDir points at the real public/ tree.
const REPO_ROOT = join(__dirname, '..', '..', '..')

/** A full AppPaths with every root under `root`; nothing is created on disk. */
export function createTestAppPaths(
  root: string,
  overrides: Partial<AppPaths> = {}
): AppPaths {
  const home = join(root, 'home')
  const appData = join(root, 'appData')
  const derived = derivePaths({
    appData,
    configRoot: appData,
    home,
    userHome: home,
    flatpakHome: home,
    appRoot: REPO_ROOT,
    assetDir: 'public',
    arch: process.arch,
    tempDir: join(root, 'tmp')
  })
  return {
    ...derived,
    appRoot: REPO_ROOT,
    appData,
    exe: join(root, 'shell-exe'),
    knownFolder: (name) => join(home, name),
    ...overrides
  }
}
