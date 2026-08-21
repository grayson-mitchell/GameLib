/**
 * Curated non-Steam-game shortcut + "add/remove to Steam" channel registration for the Tauri
 * sidecar (Phase 34.5 Plans 34.5-08/34.5-11, REQ-34.5-05).
 *
 * Plan 34.5-08 filled in the desktop-shortcut trio (`addShortcut`/`removeShortcut`/
 * `shortcutsExists`) plus the app-shell hotkey channel `processShortcut`. THIS plan (34.5-11)
 * completes the cluster at 7 with the Steam-add/remove trio (`addToSteam`/`removeFromSteam`/
 * `isAddedToSteam`).
 *
 * Declared channel list, all 7 (verified against `shortcuts/ipc_handler.ts` and `main.ts` by
 * 34.5-RESEARCH.md and each plan's own `<interfaces>` block):
 *
 *   invoke (ipcMain.handle, 4):
 *     - `shortcutsExists`  -> shortcuts/ipc_handler.ts:33 (plan 34.5-08)
 *     - `addToSteam`       -> shortcuts/ipc_handler.ts:60 (plan 34.5-11)
 *     - `removeFromSteam`  -> shortcuts/ipc_handler.ts:65 (plan 34.5-11)
 *     - `isAddedToSteam`   -> shortcuts/ipc_handler.ts:70 (plan 34.5-11)
 *
 *   send (ipcMain.on, 3):
 *     - `addShortcut`     -> shortcuts/ipc_handler.ts:14 SEND (plan 34.5-08)
 *     - `removeShortcut`  -> shortcuts/ipc_handler.ts:41 SEND (plan 34.5-08)
 *     - `processShortcut` -> main.ts:1465 SEND (plan 34.5-08)
 *
 * A `send` channel's rejection reaches NO caller (no reject, no timeout, no console line to the
 * renderer) -- `sidecar-send-channels-fail-silently` project memory. Every send-kind body below is
 * wrapped in the `void (async () => { try {...} catch {...} })()` fire-and-forget shape
 * `humbleLoginFlowRegistration.ts` uses for its own `humbleStopLogin` listener, since the Electron
 * originals (`shortcuts/ipc_handler.ts`, `main.ts:1465`) are themselves already async bodies with
 * no wrapping try/catch -- Electron's own listener registrar catches handler exceptions for you;
 * this sidecar's `electronStub.ts` recorder does not.
 *
 * EXE ATTRIBUTION, verified against source (this supersedes CONTEXT.md D-09 and
 * 34.5-RESEARCH.md's Correction 3, both of which originally filed `shortcuts.ts:227` under the
 * `addToSteam` cluster -- corrected at plan 34.5-08 time and reaffirmed here): two distinct `exe`
 * call sites feed a launch command, owned by two different channels --
 *
 *   1. `shortcuts.ts:227`, inside `generateMacOsApp` (`shortcuts.ts:176`), the macOS `.app`
 *      wrapper's `run.sh` launch command. `generateMacOsApp`'s ONLY caller is `addShortcuts`
 *      (`shortcuts.ts:33`) at `shortcuts.ts:111`, inside `case 'darwin':`, guarded by
 *      `if (addStartMenuShortcuts || fromMenu)`. The only IPC entry into `addShortcuts` is
 *      `shortcuts/ipc_handler.ts:15`, the `addShortcut` channel. This site belongs to
 *      `addShortcut` (plan 34.5-08, see its own registration and comment below), NOT `addToSteam`
 *      (this plan, 34.5-11). Its doc comment and test cases are NOT relocated or duplicated here.
 *   2. `nonesteamgame.ts:258` (the Steam VDF `Exe` entry) -- this plan's site. Reached directly by
 *      `addToSteam` below via `addNonSteamGame`, and ALSO reachable from `addShortcut` when
 *      `addShortcuts` calls `addNonSteamGame(game)` at `shortcuts.ts:43-45`, gated on the global
 *      `addSteamShortcuts` setting. Same site, two entry points -- see the comment on the
 *      `addToSteam` registration below for the full property this plan pins.
 *
 * Neither call site has an existence check in the Electron original, because `app.getPath('exe')`
 * could not meaningfully fail there. Under the sidecar, an unset/empty `GAMELIB_SHELL_EXE` makes
 * `pathShim.getPath('exe')` throw loudly (plan 34.5-01) -- this module adds NO catch, fallback or
 * default launch-command string around either path. For `addShortcut` (send-kind), the throw is
 * caught only by its own channel-level `logSendFailure` guard and nothing is written. For
 * `addToSteam` (invoke-kind, this plan), the throw REJECTS to the caller -- no guard is added,
 * because a rejection reaching the caller is the correct, loud outcome for an invoke channel.
 * Writing nothing is the intended outcome for both: the alternative is a `.app` that launches
 * nothing, or a Steam VDF entry pointing at an empty string. Live-gate item 4 exercises BOTH
 * channels -- `addShortcut`'s `.app` path (plan 34.5-08) and `addToSteam`'s VDF path (this plan).
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
import {
  addNonSteamGame,
  removeNonSteamGame,
  isAddedToSteam
} from '../shortcuts/nonesteamgame/nonesteamgame'
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
 * Registers all 7 of this cluster's channels (4 invoke + 3 send). Called once from `handlers.ts`
 * -- this module owns no side effects at import time beyond the imports above; the caller decides
 * when registration onto the handler registry happens.
 *
 * Plan 34.5-08 registered the desktop-shortcut trio + hotkey channel (`shortcutsExists` invoke;
 * `addShortcut`/`removeShortcut`/`processShortcut` send). Plan 34.5-11 (this plan) adds the
 * Steam-add/remove trio (`addToSteam`/`removeFromSteam`/`isAddedToSteam`, all invoke),
 * completing the cluster at 7.
 *
 * Idempotence guard (Rule 1 fix, discovered by `__tests__/runnerSliceRegistration.test.ts`'s own
 * pre-existing "calling registerXFlows() twice does not throw or stack duplicate listeners" case,
 * and by plan 34.5-08's own `shortcutsFlows.test.ts`): `ipcMain.on` (`electronStub.ts`) appends to
 * an array on every call, so a second unguarded call to this function would triple-register
 * `addShortcut`/`removeShortcut`/`processShortcut`'s listeners -- unlike `ipcMain.handle`, which is
 * naturally idempotent (`Map.set` replaces the existing entry) and therefore does not itself need
 * this guard, though it still lives behind it since the guard covers the whole function. Mirrors
 * `runnerAuthFlowRegistration.ts`'s own `let registered = false` guard, itself mirroring
 * `storeRegistration.ts`'s original.
 */
let registered = false
export function registerShortcutsFlows(): void {
  if (registered) {
    return
  }
  registered = true

  // ── invoke (4) ──────────────────────────────────────────────────────────

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

  // Completes the shortcuts cluster at 7 (plan 34.5-11, REQ-34.5-05). This channel's write path
  // reaches `nonesteamgame.ts:258`, where `newEntry.Exe = "${app.getPath('exe')}"` becomes the
  // Steam shortcut VDF's launch command -- the value Steam later runs when the user clicks the
  // entry in their Steam library. That call site has no existence check in the Electron original,
  // because `app.getPath('exe')` could not meaningfully fail there. Under the sidecar,
  // `pathShim.getPath('exe')` CAN fail (an unset/empty `GAMELIB_SHELL_EXE`), and per its own
  // throw-loudly convention (plan 34.5-01) it throws rather than returning `''`. This channel is
  // invoke-kind, so that throw REJECTS to the caller -- no catch, fallback or default launch
  // string is added here or anywhere upstream; a rejection the caller can observe is strictly
  // better than a silently-written Steam entry that launches nothing.
  //
  // The SECOND `exe` call site, `shortcuts.ts:227` (the macOS `.app` `run.sh` launch command),
  // belongs to `addShortcut` (plan 34.5-08, see that channel's registration above in this same
  // file) -- it is reached only via `addShortcuts` -> `generateMacOsApp`, never via
  // `addNonSteamGame`. That comment and its test pins are NOT duplicated or relocated here.
  // Live-gate item 4 exercises BOTH channels: `addShortcut`'s `.app` path and this channel's VDF
  // path.
  ipcMain.handle('addToSteam', async (_event: unknown, ...args: unknown[]) => {
    const appName = args[0] as string
    const runner = args[1] as Runner
    const game = getGame(appName, runner)
    return addNonSteamGame(game)
  })

  ipcMain.handle(
    'removeFromSteam',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      const runner = args[1] as Runner
      const game = getGame(appName, runner)
      await removeNonSteamGame(game)
    }
  )

  ipcMain.handle(
    'isAddedToSteam',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      const runner = args[1] as Runner
      const game = getGame(appName, runner)
      return isAddedToSteam(game)
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
