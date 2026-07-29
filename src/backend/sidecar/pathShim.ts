/**
 * Sidecar path shim (Phase 27 Plan 02 — Task 1; extended Phase 34.5 Plan 01 — Task 1).
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
 *
 * Phase 34.5 REQ-34.5-01 extends this to five names (`desktop`, `exe`,
 * `documents` added) — the shortcuts cluster (REQ-34.5-05) and
 * `syncGOGSaves` (REQ-34.5-08) throw the moment they are ported until this
 * lands. `exe` in particular is not a stub gap: it must resolve to the
 * Tauri shell's own binary — never to the node interpreter running the
 * sidecar itself — because its value is written verbatim into a Steam
 * shortcut VDF launch command and a macOS `.app` `run.sh`.
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
    case 'exe': {
      // Consumers, by file, line AND owning channel (REQ-34.5-01):
      //   - nonesteamgame.ts:258 — Steam shortcut VDF `Exe` entry — addToSteam
      //     (plan 34.5-11).
      //   - shortcuts.ts:227 — macOS `.app` `run.sh` launch command —
      //     addShortcut (plan 34.5-08), via addShortcuts -> generateMacOsApp.
      //     This second attribution corrects CONTEXT.md D-09 and research
      //     Correction 3, both of which filed shortcuts.ts:227 under the
      //     addToSteam cluster.
      // An empty value must never be interpolated into either launch command
      // (threat T-34.5-02) — so an unset/empty GAMELIB_SHELL_EXE throws
      // loudly rather than returning "". The value comes only from the Tauri
      // shell's own `current_exe()`, handed down at spawn time; it is
      // returned verbatim — never trimmed, resolved or existence-checked —
      // because the shell is the authority for its own path.
      const shellExe = env.GAMELIB_SHELL_EXE
      if (!shellExe) {
        throw new Error(
          `[sidecar/pathShim] getPath('exe') is unavailable — GAMELIB_SHELL_EXE was not set by the Tauri shell at spawn time`
        )
      }
      return shellExe
    }
    case 'desktop':
      // darwin never reaches this case today — shortcutFiles()'s darwin
      // branch (shortcuts.ts:167-170) uses `~/Applications`, not Desktop.
      // The darwin arm below exists for correctness (Electron's real
      // app.getPath('desktop') resolves it there too), not for a live call
      // site. Live call sites: shortcuts.ts:156 (linux) and :161 (win32).
      switch (platform) {
        case 'darwin':
        case 'win32':
          return join(homedir(), 'Desktop')
        default:
          return env.XDG_DESKTOP_DIR || join(homedir(), 'Desktop')
      }
    case 'documents':
      // Single consumer: save_sync.ts:146 (getDefaultGogSavePaths), reached
      // only via syncGOGSaves on a native game — this name belongs to the
      // saves-sync cluster (plan 34.5-12), not the shortcuts cluster.
      switch (platform) {
        case 'darwin':
        case 'win32':
          return join(homedir(), 'Documents')
        default:
          return env.XDG_DOCUMENTS_DIR || join(homedir(), 'Documents')
      }
    default:
      throw new Error(
        `[sidecar/pathShim] getPath('${name}') is not shimmed for the headless sidecar`
      )
  }
}
