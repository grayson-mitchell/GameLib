/**
 * Curated non-Steam-game shortcut + "add/remove to Steam" channel registration for the Tauri
 * sidecar (Phase 34.5 Plans 34.5-08/34.5-11, REQ-34.5-05).
 *
 * This plan (34.5-08) fills in the desktop-shortcut trio (`addShortcut`/`removeShortcut`/
 * `shortcutsExists`) plus the app-shell hotkey channel `processShortcut`. Plan 34.5-11 adds the
 * remaining Steam-add/remove trio (`addToSteam`/`removeFromSteam`/`isAddedToSteam`).
 *
 * Declared channel list, THIS plan's 4 (verified against `shortcuts/ipc_handler.ts` and
 * `main.ts` by 34.5-RESEARCH.md and this plan's own `<interfaces>` block):
 *
 *   invoke (ipcMain.handle, 1):
 *     - `shortcutsExists`  -> shortcuts/ipc_handler.ts:33
 *
 *   send (ipcMain.on, 3):
 *     - `addShortcut`     -> shortcuts/ipc_handler.ts:14 SEND
 *     - `removeShortcut`  -> shortcuts/ipc_handler.ts:41 SEND
 *     - `processShortcut` -> main.ts:1465 SEND
 *
 * A `send` channel's rejection reaches NO caller (no reject, no timeout, no console line to the
 * renderer) -- `sidecar-send-channels-fail-silently` project memory. Every send-kind body below is
 * wrapped in the `void (async () => { try {...} catch {...} })()` fire-and-forget shape
 * `humbleLoginFlowRegistration.ts` uses for its own `humbleStopLogin` listener, since the Electron
 * originals (`shortcuts/ipc_handler.ts`, `main.ts:1465`) are themselves already async bodies with
 * no wrapping try/catch -- Electron's own listener registrar catches handler exceptions for you;
 * this sidecar's `electronStub.ts` recorder does not.
 *
 * PLAN-TIME CORRECTION, verified against source (supersedes CONTEXT.md D-09 and
 * 34.5-RESEARCH.md's Correction 3, both of which file `shortcuts.ts:227` under the `addToSteam`
 * cluster): `addShortcut` depends on `getPath('exe')` in TWO ways, not one --
 *
 *   1. `shortcuts.ts:227`, inside `generateMacOsApp` (`shortcuts.ts:176`), the macOS `.app`
 *      wrapper's `run.sh` launch command. `generateMacOsApp`'s ONLY caller is `addShortcuts`
 *      (`shortcuts.ts:33`) at `shortcuts.ts:111`, inside `case 'darwin':`, guarded by
 *      `if (addStartMenuShortcuts || fromMenu)`. The only IPC entry into `addShortcuts` is
 *      `shortcuts/ipc_handler.ts:15`, the `addShortcut` channel THIS module registers. This site
 *      belongs to `addShortcut` (this plan), NOT `addToSteam` (plan 34.5-11).
 *   2. `nonesteamgame.ts:258` (the Steam VDF `Exe` entry), reached when `addShortcuts` calls
 *      `addNonSteamGame(game)` at `shortcuts.ts:43-45`, gated on the global `addSteamShortcuts`
 *      setting. This is the SAME `exe` site `addToSteam` (plan 34.5-11) also reaches via its own
 *      direct call to `addNonSteamGame`.
 *
 * Neither call site has an existence check in the Electron original, because `app.getPath('exe')`
 * could not meaningfully fail there. Under the sidecar, an unset/empty `GAMELIB_SHELL_EXE` makes
 * `pathShim.getPath('exe')` throw loudly (plan 34.5-01) -- this module adds NO catch, fallback or
 * default launch-command string around either path; the throw is caught only by `addShortcut`'s
 * own channel-level `logSendFailure` guard below, and nothing is written. Writing nothing is the
 * intended outcome: the alternative is a `.app` that launches nothing, or a Steam VDF entry
 * pointing at an empty string. Live-gate item 4 exercises this channel's `.app` path as well as
 * `addToSteam`'s VDF path.
 *
 * `processShortcut` needs neither `desktop` nor `exe` -- it is an app-shell HOTKEY channel
 * (`main.ts:1465`, ctrl+r/q/k/j/l/shift+i), not a game-shortcut channel. Its `ctrl+r` and
 * `ctrl+shift+i` cases call `mainWindow?.reload()` and `mainWindow?.webContents?.openDevTools()`;
 * `electronStub`'s `fakeWindow`/`fakeWebContents` (Phase 34.5 Plan 08, Task 1) implement both as
 * logged no-ops rather than throwing -- these two hotkeys are DECLARED DEGRADED under Tauri
 * (T-34.5-27, `34.5-PORTED-CHANNELS.md`), not silently broken and not reimplemented with new
 * Tauri window plumbing (that would be new shell work, not a port).
 *
 * D-09 precondition: this plan runs after REQ-34.5-01, because `shortcutFiles()` (`shortcuts.ts`)
 * calls `getPath('desktop')` on the linux and win32 branches and would throw the moment these
 * channels were registered without it.
 *
 * Curated-import rule (inherited from every prior slice's D-08 -> D-09 -> D-04 -> D-14 -> D-02
 * lineage): this module imports the underlying logic modules directly
 * (`shortcuts/shortcuts/shortcuts.ts`, `backend/utils`, `backend/dialog/dialog`, `backend/ipc`,
 * `backend/main_window`), and NEVER `main.ts` or `shortcuts/ipc_handler.ts` -- those files
 * double-register these same channels onto Electron's real `ipcMain` via `backend/ipc`'s
 * `addHandler`/`addListener`, an Electron-only path this sidecar's curated import graph must never
 * reach.
 */

import { existsSync } from 'graceful-fs'
import i18next from 'i18next'
import { ipcMain } from './electronStub'
import { getGame, handleExit } from '../utils'
import { shortcutFiles } from '../shortcuts/shortcuts/shortcuts'
import { notify } from '../dialog/dialog'
import { isMac } from '../constants/environment'
import { sendFrontendMessage } from '../ipc'
import { getMainWindow } from '../main_window'
import { logWarning, LogPrefix } from '../logger'
import type { Runner } from 'common/types'

function logSendFailure(channel: string, error: unknown): void {
  logWarning(
    [
      `[shortcutsFlowRegistration] ${channel} failed:`,
      error instanceof Error ? error.message : String(error)
    ],
    LogPrefix.Backend
  )
}

/**
 * Registers this plan's 4 channels (1 invoke + 3 send). Called once from `handlers.ts` -- this
 * module owns no side effects at import time beyond the imports above; the caller decides when
 * registration onto the handler registry happens.
 *
 * The Steam-add/remove trio (`addToSteam`/`removeFromSteam`/`isAddedToSteam`) is NOT registered
 * here -- plan 34.5-11 owns those, in this same module.
 */
export function registerShortcutsFlows(): void {
  // ── invoke (1) ──────────────────────────────────────────────────────────

  ipcMain.handle(
    'shortcutsExists',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      const runner = args[1] as Runner
      const { title } = getGame(appName, runner).getGameInfo()

      const [desktopFile, menuFile] = shortcutFiles(title)

      return existsSync(desktopFile ?? '') || existsSync(menuFile ?? '')
    }
  )

  // ── send (3) ──────────────────────────────────────────────────────────────

  // Repudiation surface (T-34.5-26, T-34.5-65, T-34.5-66). `ipcMain.on`, NEVER `ipcMain.handle`.
  // `Game.addShortcuts()` is async (it reaches `shortcuts.ts`'s `addShortcuts`, which on darwin
  // calls `generateMacOsApp` -> `getPath('exe')`, per this module's own header comment) -- the
  // Electron original (`shortcuts/ipc_handler.ts:14`) is itself an unguarded async listener body
  // only because Electron's `ipcMain.on` catches for it; this sidecar's `electronStub.ts`
  // `ipcMain.on` recorder does not, so the guard below is required, not stylistic.
  ipcMain.on('addShortcut', (_event: unknown, ...args: unknown[]) => {
    void (async () => {
      try {
        const appName = args[0] as string
        const runner = args[1] as Runner
        const fromMenu = args[2] as boolean | undefined

        await getGame(appName, runner).addShortcuts(fromMenu)

        const body = i18next.t(
          'box.shortcuts.message',
          'Shortcuts were created on Desktop and Start Menu'
        )
        const bodyMac = i18next.t(
          'box.shortcuts.message-mac',
          'Shortcuts were created on the Applications folder'
        )

        notify({
          body: isMac ? bodyMac : body,
          title: i18next.t('box.shortcuts.title', 'Shortcuts')
        })
      } catch (error) {
        // T-34.5-65/66: reached when `getPath('exe')` throws (unset/empty GAMELIB_SHELL_EXE) via
        // either `shortcuts.ts:227` (this channel's own darwin `.app` run.sh path) or
        // `nonesteamgame.ts:258` (via the `addSteamShortcuts` branch, `shortcuts.ts:43-45`). No
        // catch/fallback/default launch command is added here or anywhere upstream -- a swallowed
        // failure that writes nothing is the correct outcome; a `.app`/VDF entry pointing at an
        // empty exe path would be worse. `logSendFailure` is the only record of this failure.
        logSendFailure('addShortcut', error)
      }
    })()
  })

  ipcMain.on('removeShortcut', (_event: unknown, ...args: unknown[]) => {
    void (async () => {
      try {
        const appName = args[0] as string
        const runner = args[1] as Runner

        await getGame(appName, runner).removeShortcuts()

        const body = i18next.t(
          'box.shortcuts.message-remove',
          'Shortcuts were removed from Desktop and Start Menu'
        )
        const bodyMac = i18next.t(
          'box.shortcuts.message-remove-mac',
          'Shortcuts were removed from the Applications folder'
        )

        notify({
          body: isMac ? bodyMac : body,
          title: i18next.t('box.shortcuts.title', 'Shortcuts Removed')
        })
      } catch (error) {
        logSendFailure('removeShortcut', error)
      }
    })()
  })

  // App-shell hotkey channel (`main.ts:1465`), ported verbatim as a six-case switch. `ctrl+r` and
  // `ctrl+shift+i` reach `electronStub`'s `fakeWindow.reload()`/`fakeWebContents.openDevTools()`
  // logged no-ops (Task 1 of this plan, T-34.5-27) -- DECLARED DEGRADED under Tauri, recorded in
  // `34.5-PORTED-CHANNELS.md`. Neither case is deleted and neither is reimplemented with new
  // Tauri window plumbing; that would be new shell work, not a port.
  ipcMain.on('processShortcut', (_event: unknown, ...args: unknown[]) => {
    void (async () => {
      try {
        const combination = args[0] as string
        const mainWindow = getMainWindow()

        switch (combination) {
          // hotkey to reload the app -- DECLARED DEGRADED under Tauri (T-34.5-27): no sidecar/
          // WebView reload equivalent, see electronStub.ts's fakeWindow.reload() comment.
          case 'ctrl+r':
            mainWindow?.reload()
            break
          // hotkey to quit the app
          case 'ctrl+q':
            await handleExit()
            break
          // hotkey to open the settings on frontend
          case 'ctrl+k':
            sendFrontendMessage('openScreen', '/settings/general')
            break
          // hotkey to open the downloads screen on frontend
          case 'ctrl+j':
            sendFrontendMessage('openScreen', '/download-manager')
            break
          // hotkey to open the library screen on frontend
          case 'ctrl+l':
            sendFrontendMessage('openScreen', '/library')
            break
          // DECLARED DEGRADED under Tauri (T-34.5-27): no sidecar/WebView devtools equivalent,
          // see electronStub.ts's fakeWebContents.openDevTools() comment.
          case 'ctrl+shift+i':
            mainWindow?.webContents?.openDevTools()
            break
        }
      } catch (error) {
        logSendFailure('processShortcut', error)
      }
    })()
  })
}
