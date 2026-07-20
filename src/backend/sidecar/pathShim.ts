/**
 * Sidecar path shim (Phase 27 Plan 02 — Task 1).
 *
 * Minimal replacement for Electron's `app.getPath(name)`, satisfying the
 * import-time calls in `backend/constants/paths.ts` (`appData`, `userData`)
 * without pulling in the Electron runtime. Resolves to the same OS
 * conventions Electron itself uses, so the sidecar reads/writes the same
 * config folder a packaged Electron build would.
 *
 * Per 27-CONTEXT "Claude's discretion" (which single store/config value the
 * skeleton's read path needs, and how minimally to satisfy it): only the
 * path names actually touched by import-time backend code are implemented.
 * Unimplemented names throw loudly rather than silently returning garbage.
 */

import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { env, platform } from 'process'

/**
 * The app-name folder segment Electron's real `app.getPath('userData')`
 * appends to `appData` (normally derived from the packaged app's name).
 * Mirrors the 'GameLib' literal already used throughout
 * `backend/constants/paths.ts` (`appFolder`, `heroicInstallPath`, ...) so the
 * sidecar's resolved userData folder lines up with the rest of the codebase's
 * conventions.
 */
const APP_NAME_SEGMENT = 'GameLib'

function resolveAppDataDir(): string {
  switch (platform) {
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support')
    case 'win32':
      return env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    default:
      return env.XDG_CONFIG_HOME || join(homedir(), '.config')
  }
}

/**
 * Headless equivalent of Electron's `app.getPath(name)`. Only the names the
 * sidecar's import-time and read-path code actually needs are implemented.
 */
export function getPath(name: string): string {
  switch (name) {
    case 'appData':
      return resolveAppDataDir()
    case 'userData':
      return join(resolveAppDataDir(), APP_NAME_SEGMENT)
    case 'temp':
      return tmpdir()
    case 'home':
      return homedir()
    default:
      throw new Error(
        `[sidecar/pathShim] getPath('${name}') is not shimmed for the headless sidecar`
      )
  }
}
