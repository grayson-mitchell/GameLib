import { homedir, tmpdir } from 'os'
import { join } from 'path'
import {
  derivePaths,
  resolveAppDataDir,
  resolveKnownFolder
} from '../process/appPaths'
import { readXdgUserDir } from '../sidecar/knownFolders'
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

/**
 * The AppPaths a booted sidecar derives for the jest-contained fake HOME (`jest.setupContainment`):
 * real Desktop / appData folders under the contained home, `exe` read lazily from
 * GAMELIB_SHELL_EXE (it throws when unset, as at boot). For the suites that assert on the files
 * the shortcut or sidecar code actually writes under `homedir()`.
 */
export function createContainedHomeAppPaths(): AppPaths {
  const home = homedir()
  const appData = resolveAppDataDir(process.platform, process.env, home)
  const derived = derivePaths({
    appData,
    configRoot: appData,
    home,
    userHome: home,
    flatpakHome: home,
    appRoot: REPO_ROOT,
    assetDir: 'public',
    arch: process.arch,
    tempDir: tmpdir()
  })
  // `exe` is an accessor defined after the spread, as resolveAppPaths does: a getter in an object
  // literal would run at build time.
  return Object.defineProperty(
    {
      ...derived,
      appRoot: REPO_ROOT,
      appData,
      knownFolder: (name: 'desktop' | 'documents') =>
        resolveKnownFolder(
          name,
          process.platform,
          process.env,
          home,
          readXdgUserDir
        )
    },
    'exe',
    {
      get: () => {
        const shellExe = process.env.GAMELIB_SHELL_EXE
        if (!shellExe) {
          throw new Error(
            '[process/appPaths] exe is unavailable: GAMELIB_SHELL_EXE was not set by the Tauri shell at spawn time'
          )
        }
        return shellExe
      },
      enumerable: true
    }
  ) as AppPaths
}
