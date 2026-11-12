import { getPath } from 'backend/sidecar/pathShim'
import type { AppPaths } from 'backend/process/context'
import { homedir } from 'os'
import { join } from 'path'

/**
 * The app paths the shortcut suites need: the same pathShim reads `resolveAppPaths` makes at boot
 * (real Desktop / appData folders under the jest-contained home, `exe` read lazily from
 * GAMELIB_SHELL_EXE), for tests that assert on the files the shortcut code writes.
 */
export function createPathShimPaths(): Pick<
  AppPaths,
  'exe' | 'appData' | 'knownFolder' | 'heroicIconFolder' | 'userHome'
> {
  return {
    appData: getPath('appData'),
    // The same two roots constants/paths derived: the OS home and `<appData>/GameLib/icons`.
    userHome: homedir(),
    heroicIconFolder: join(getPath('appData'), 'GameLib', 'icons'),
    get exe() {
      return getPath('exe')
    },
    knownFolder: (name) => getPath(name)
  }
}
