/**
 * Curated non-Steam-game shortcut + "add/remove to Steam" channel registration for the Tauri
 * sidecar (Phase 34.5 Plans 34.5-08/34.5-11, REQ-34.5-05).
 *
 * Plan 34.5-08 filled in the desktop-shortcut trio (`addShortcut`/`removeShortcut`/
 * `shortcutsExists`) plus the app-shell hotkey channel `processShortcut`. Plan 34.5-11 completed
 * the cluster at 7 with the Steam-add/remove trio (`addToSteam`/`removeFromSteam`/
 * `isAddedToSteam`). Quick task 261012-ca6 then moved `addShortcut` and `removeShortcut` from
 * send-kind to invoke-kind (see the comment on their registrations below), so the cluster is now
 * 6 invoke + 1 send; the total stays 7.
 *
 * Declared channel list, all 7 (verified against `shortcuts/ipc_handler.ts` and `main.ts` by
 * 34.5-RESEARCH.md and each plan's own `<interfaces>` block):
 *
 *   invoke (deps.ipc.handle, 6):
 *     - `shortcutsExists`  -> shortcuts/ipc_handler.ts (plan 34.5-08)
 *     - `addShortcut`      -> shortcuts/ipc_handler.ts (plan 34.5-08; invoke since 261012-ca6)
 *     - `removeShortcut`   -> shortcuts/ipc_handler.ts (plan 34.5-08; invoke since 261012-ca6)
 *     - `addToSteam`       -> shortcuts/ipc_handler.ts (plan 34.5-11)
 *     - `removeFromSteam`  -> shortcuts/ipc_handler.ts (plan 34.5-11)
 *     - `isAddedToSteam`   -> shortcuts/ipc_handler.ts (plan 34.5-11)
 *
 *   send (deps.ipc.on, 1):
 *     - `processShortcut` -> main.ts:1465 SEND (plan 34.5-08)
 *
 * A `send` channel's rejection reaches NO caller (no reject, no timeout, no console line to the
 * renderer) -- `sidecar-send-channels-fail-silently` project memory. `processShortcut`'s body is
 * therefore wrapped in the `void (async () => { try {...} catch {...} })()` fire-and-forget shape
 * `humbleLoginFlowRegistration.ts` uses for its own `humbleStopLogin` listener, since the Electron
 * original (`main.ts:1465`) is itself an already-async body with no wrapping try/catch --
 * Electron's own listener registrar catches handler exceptions for you; this sidecar's
 * `platform/index.ts` recorder does not.
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
 * the `exe` path accessor throw loudly (plan 34.5-01) -- this module adds NO catch, fallback or
 * default launch-command string around either path. For `addShortcut` (invoke-kind), the throw is
 * caught only by its own channel-level `logChannelFailure` guard and nothing is written. For
 * `addToSteam` (invoke-kind, this plan), the throw REJECTS to the caller -- no guard is added,
 * because a rejection reaching the caller is the correct, loud outcome for an invoke channel.
 * Writing nothing is the intended outcome for both: the alternative is a `.app` that launches
 * nothing, or a Steam VDF entry pointing at an empty string. Live-gate item 4 exercises BOTH
 * channels -- `addShortcut`'s `.app` path (plan 34.5-08) and `addToSteam`'s VDF path (this plan).
 *
 * `processShortcut` needs neither `desktop` nor `exe` -- it is an app-shell HOTKEY channel
 * (`main.ts:1465`, ctrl+r/q/k/j/l/shift+i), not a game-shortcut channel. Its `ctrl+r` and
 * `ctrl+shift+i` cases call `mainWindow?.reload()` and `mainWindow?.webContents?.openDevTools()`;
 * `platformApi`'s `fakeWindow`/`fakeWebContents` (Phase 34.5 Plan 08, Task 1) implement both as
 * logged no-ops rather than throwing -- these two hotkeys are DECLARED DEGRADED under Tauri
 * (T-34.5-27, `34.5-PORTED-CHANNELS.md`), not silently broken and not reimplemented with new
 * Tauri window plumbing (that would be new shell work, not a port).
 *
 * D-09 precondition: this plan runs after REQ-34.5-01, because `shortcutFiles()` (`shortcuts.ts`)
 * calls `getPath('desktop')` on the linux branch and would throw the moment these channels were
 * registered without it. On win32 the Desktop comes from `windowsDesktopDir` ->
 * `readWindowsShellFolder` (the registry), and without it no Desktop path exists
 * (quick 261111-aq4): appPaths's win32 `desktop` arm throws and is never reached.
 *
 * Curated-import rule (inherited from every prior slice's D-08 -> D-09 -> D-04 -> D-14 -> D-02
 * lineage): this module imports the underlying logic modules directly
 * (`shortcuts/shortcuts/shortcuts.ts`, `backend/utils`, `backend/dialog/dialog`, `backend/ipc`,
 * `backend/main_window`), and NEVER `main.ts` or `shortcuts/ipc_handler.ts` -- those files
 * double-register these same channels onto Electron's real `ipcMain` via `backend/ipc`'s
 * `addHandler`/`addListener`, an Electron-only path this sidecar's curated import graph must never
 * reach.
 */

import i18next, { t } from 'i18next'
import type { AbortRegistry } from '../utils/aborthandler/aborthandler'
import type { IpcRegistry } from './ipcRegistry'
import type { GlobalConfigSlice } from '../config'
import type { AppPaths } from '../process/context'
import type { HostServices } from '../host'
import {
  macDesktopShortcutPresent,
  macDesktopShortcutWanted,
  shortcutFiles,
  windowsDesktopDir,
  shortcutPathPresent
} from '../shortcuts/shortcuts/shortcuts'
import {
  addNonSteamGame,
  removeNonSteamGame,
  isAddedToSteam,
  type NonSteamGameDeps
} from '../shortcuts/nonesteamgame/nonesteamgame'
import { notify, type DialogBoxDeps, type NotifyDeps } from '../dialog/dialog'
import { isMac } from '../constants/environment'
import { logWarning, LogPrefix } from '../logger'
import type { Runner } from 'common/types'
import type {
  BootServices,
  InfoCaches,
  QuitHandler,
  StoreManagers,
  Stores
} from 'backend/services/types'

/** Narrow slice (66.1 D-01): library managers for game lookup, the quit handler for ctrl+q. */
export interface ShortcutsFlowDeps
  extends
    NotifyDeps,
    DialogBoxDeps,
    Pick<NonSteamGameDeps, 'appRuntime' | 'requestRustInvoke'> {
  ipc: Pick<IpcRegistry, 'handle' | 'on'>
  managers: Pick<StoreManagers, 'library'>
  quit: Pick<QuitHandler, 'handleExit'>
  stores: Pick<Stores, 'kvs' | 'wikiGameInfo' | 'crossoverIndex'>
  /** The boot-owned HowLongToBeat credentials cache (66.4-12). */
  infoCaches: Pick<InfoCaches, 'hltb'>
  /** The boot-owned abort registry the icon and artwork downloads register in (66.4-13). */
  aborts: Pick<AbortRegistry, 'create'>
  /** The boot process runner: reg.exe (Desktop folder) and powershell.exe (.lnk) on win32. */
  runner: BootServices['runner']
  config: Pick<GlobalConfigSlice, 'getSettings'>
  paths: Pick<
    AppPaths,
    'exe' | 'appData' | 'knownFolder' | 'heroicIconFolder' | 'userHome'
  >
  imageTools: HostServices['imageTools']
}

function logChannelFailure(channel: string, error: unknown): void {
  logWarning(
    [
      `[shortcutsFlowRegistration] ${channel} failed:`,
      error instanceof Error ? error.message : String(error)
    ],
    LogPrefix.Backend
  )
}

/**
 * Whether a shortcut for the game exists on disk right now. Shared by `shortcutsExists` and by the
 * `addShortcut`/`removeShortcut` handlers, which evaluate it AFTER their work has settled so the
 * renderer sets its state from the disk and never from an assumption (quick task 261012-ca6).
 */
async function shortcutsExistOnDisk(
  deps: ShortcutsFlowDeps,
  appName: string,
  runner: Runner
): Promise<boolean> {
  const { title } = deps.managers.library[runner].getGame(appName).getGameInfo()

  // Quick task 260905-mv5 (site 4, D-03): getGameInfo() can return
  // `{} as GameInfo` on a double cache miss (D-01), leaving `title`
  // undefined. Unlike sites 1/2 (a display string), this title feeds a
  // FILESYSTEM PATH component (shortcutFiles -> sanitize-filename), so
  // a synthesized fallback title here would produce a plausible-looking
  // path the app never actually wrote to. Return false and log instead
  // of fabricating one -- mirrors the Electron original's identical
  // guard in `backend/shortcuts/ipc_handler.ts`.
  if (!title) {
    logWarning(
      `shortcutsExists: getGameInfo() returned no title for ${appName} (${runner}); skipping shortcut lookup`,
      LogPrefix.Backend
    )
    return false
  }

  const [desktopFile, menuFile] = shortcutFiles(
    deps,
    title,
    await windowsDesktopDir(deps)
  )

  // 261026-ctm: a dangling Desktop link counts as present so Remove stays offered.
  return (
    shortcutPathPresent(desktopFile ?? '') ||
    shortcutPathPresent(menuFile ?? '')
  )
}

/**
 * Registers all 7 of this cluster's channels (6 invoke + 1 send). Called once from `handlers.ts`
 * -- this module owns no side effects at import time beyond the imports above; the caller decides
 * when registration onto the handler registry happens.
 *
 * Plan 34.5-08 registered the desktop-shortcut trio + hotkey channel (`shortcutsExists` invoke;
 * `addShortcut`/`removeShortcut`/`processShortcut` send). Plan 34.5-11 added the Steam-add/remove
 * trio (`addToSteam`/`removeFromSteam`/`isAddedToSteam`, all invoke), completing the cluster at 7.
 * Quick task 261012-ca6 moved `addShortcut`/`removeShortcut` to invoke-kind; `processShortcut` is
 * the only send-kind channel left.
 *
 * Single-run is owned by the 'register-handlers' boot step (D-66.4-01): called exactly once per boot, pinned by
 * `registrationOncePerBoot.test.ts`; a second boot in one process throws in `bootSidecar()`.
 */
export function registerShortcutsFlows(deps: ShortcutsFlowDeps): void {
  // ── invoke (6) ──────────────────────────────────────────────────────────

  deps.ipc.handle(
    'shortcutsExists',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      const runner = args[1] as Runner
      return shortcutsExistOnDisk(deps, appName, runner)
    }
  )

  // Quick task 261012-ca6 (todo `gamesubmenu-shows-remove-shortcuts-before-the-write-is-known`):
  // invoke-kind, no longer send-kind. GameSubMenu used to flip its "Add shortcut"/"Remove
  // shortcuts" entry the moment it fired this channel, before the write had happened or failed. A
  // send-kind channel cannot report an outcome: the Tauri transport resolves a send once the shell
  // has accepted the frame, and the sidecar runs listeners fire-and-forget. This handler therefore
  // resolves the `shortcutsExists` predicate, evaluated AFTER `addShortcuts` has settled, so the
  // renderer sets its state from what is actually on disk. A partial write (one of two files
  // written, so `addShortcuts` rejects) still resolves true: a removable shortcut exists. A call
  // that resolves without writing anything (a DLC, or no shortcut paths) resolves false.
  //
  // Failure path (T-34.5-26, T-34.5-65, T-34.5-66): `getGame().addShortcuts()` reaches
  // `shortcuts.ts`'s `addShortcuts`, which on darwin calls `generateMacOsApp` -> `getPath('exe')`.
  // That throws when `GAMELIB_SHELL_EXE` is unset or empty, and also when a shortcut file could not
  // be written (a missing desktop folder, a failed Windows `.lnk`, or a win32 Desktop folder the
  // registry could not resolve, which still leaves the Start Menu `.lnk` written so this handler
  // answers true from disk). No catch, fallback or default
  // launch command is added upstream -- a failure that writes nothing is the correct outcome, and
  // a `.app` pointing at an empty exe path would be worse. It is caught here, logged, and shown to
  // the user as the error toast instead of the success one; the handler still answers with the disk
  // state, so the call never rejects the renderer.
  deps.ipc.handle(
    'addShortcut',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      const runner = args[1] as Runner
      const fromMenu = (args[2] ?? undefined) as boolean | undefined

      try {
        await deps.managers.library[runner]
          .getGame(appName)
          .addShortcuts(fromMenu)
      } catch (error) {
        logChannelFailure('addShortcut', error)
        notify(deps, {
          body: t(
            'box.shortcuts.error',
            'Shortcuts could not be created. See the log for details.'
          ),
          title: t('box.shortcuts.title', 'Shortcuts')
        })
        return shortcutsExistOnDisk(deps, appName, runner)
      }

      const exists = await shortcutsExistOnDisk(deps, appName, runner)
      if (exists) {
        const body = i18next.t(
          'box.shortcuts.message',
          'Shortcuts were created on Desktop and Start Menu'
        )
        // 261027-c4g: name the Desktop when the Desktop link was also made.
        const bodyMac = macDesktopShortcutWanted(deps)
          ? i18next.t(
              'gamelib:box.shortcuts.messageMacDesktop',
              'Shortcuts were created in the Applications folder and on the Desktop'
            )
          : i18next.t(
              'box.shortcuts.message-mac',
              'Shortcuts were created on the Applications folder'
            )
        notify(deps, {
          body: isMac ? bodyMac : body,
          title: i18next.t('box.shortcuts.title', 'Shortcuts')
        })
      } else {
        // Resolving without writing anything is not a success.
        notify(deps, {
          body: t(
            'box.shortcuts.error',
            'Shortcuts could not be created. See the log for details.'
          ),
          title: t('box.shortcuts.title', 'Shortcuts')
        })
      }
      return exists
    }
  )

  // Quick task 261012-ca6: invoke-kind for the same reason as `addShortcut` above. Resolves the
  // `shortcutsExists` predicate after `removeShortcuts` has settled, so the renderer keeps showing
  // "Remove shortcuts" when a removal did not take. `removeShortcuts` awaits its deletions and
  // never rejects for a failed one (it logs it), so the disk is read only once the work is done and
  // the toast follows what the disk says: the removal toast only when no shortcut remains, the
  // error toast otherwise.
  deps.ipc.handle(
    'removeShortcut',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      const runner = args[1] as Runner

      // 261027-c4g: snapshot BEFORE removal; the toast follows what was on disk, not the setting.
      const hadDesktopItem = macDesktopShortcutPresent(
        deps,
        deps.managers.library[runner].getGame(appName).getGameInfo().title
      )

      try {
        await deps.managers.library[runner].getGame(appName).removeShortcuts()
      } catch (error) {
        logChannelFailure('removeShortcut', error)
        notify(deps, {
          body: t(
            'box.shortcuts.error-remove',
            'Shortcuts could not be removed. See the log for details.'
          ),
          title: t('box.shortcuts.title', 'Shortcuts')
        })
        return shortcutsExistOnDisk(deps, appName, runner)
      }

      const exists = await shortcutsExistOnDisk(deps, appName, runner)
      if (!exists) {
        const body = i18next.t(
          'box.shortcuts.message-remove',
          'Shortcuts were removed from Desktop and Start Menu'
        )
        const bodyMac = hadDesktopItem
          ? i18next.t(
              'gamelib:box.shortcuts.messageRemoveMacDesktop',
              'Shortcuts were removed from the Applications folder and the Desktop'
            )
          : i18next.t(
              'box.shortcuts.message-remove-mac',
              'Shortcuts were removed from the Applications folder'
            )

        notify(deps, {
          body: isMac ? bodyMac : body,
          // Shared key: catalog 'Shortcuts' wins; the body names the removal.
          title: i18next.t('box.shortcuts.title', 'Shortcuts')
        })
      } else {
        notify(deps, {
          body: t(
            'box.shortcuts.error-remove',
            'Shortcuts could not be removed. See the log for details.'
          ),
          title: t('box.shortcuts.title', 'Shortcuts')
        })
      }
      return exists
    }
  )

  // Completes the shortcuts cluster at 7 (plan 34.5-11, REQ-34.5-05). This channel's write path
  // reaches `nonesteamgame.ts:258`, where `newEntry.Exe = "${app.getPath('exe')}"` becomes the
  // Steam shortcut VDF's launch command -- the value Steam later runs when the user clicks the
  // entry in their Steam library. That call site has no existence check in the Electron original,
  // because `app.getPath('exe')` could not meaningfully fail there. Under the sidecar,
  // the `exe` path accessor CAN fail (an unset/empty `GAMELIB_SHELL_EXE`), and per its own
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
  deps.ipc.handle('addToSteam', async (_event: unknown, ...args: unknown[]) => {
    const appName = args[0] as string
    const runner = args[1] as Runner
    const game = deps.managers.library[runner].getGame(appName)
    return addNonSteamGame(
      {
        libraryManagers: deps.managers.library,
        stores: deps.stores,
        infoCaches: deps.infoCaches,
        aborts: deps.aborts,
        runner: deps.runner,
        config: deps.config,
        paths: deps.paths,
        imageTools: deps.imageTools,
        dialogs: deps.dialogs,
        sendFrontendMessage: deps.sendFrontendMessage,
        appRuntime: deps.appRuntime,
        appState: deps.appState,
        notifications: deps.notifications,
        requestRustInvoke: deps.requestRustInvoke
      },
      game
    )
  })

  deps.ipc.handle(
    'removeFromSteam',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      const runner = args[1] as Runner
      const game = deps.managers.library[runner].getGame(appName)
      await removeNonSteamGame(deps, game)
    }
  )

  deps.ipc.handle(
    'isAddedToSteam',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      const runner = args[1] as Runner
      const game = deps.managers.library[runner].getGame(appName)
      return isAddedToSteam(deps, game)
    }
  )

  // ── send (1) ──────────────────────────────────────────────────────────────

  // App-shell hotkey channel (`main.ts:1465`), ported verbatim as a six-case switch. `ctrl+r` and
  // `ctrl+shift+i` reach `platformApi`'s `fakeWindow.reload()`/`fakeWebContents.openDevTools()`
  // logged no-ops (Task 1 of this plan, T-34.5-27) -- DECLARED DEGRADED under Tauri, recorded in
  // `34.5-PORTED-CHANNELS.md`. Neither case is deleted and neither is reimplemented with new
  // Tauri window plumbing; that would be new shell work, not a port.
  deps.ipc.on('processShortcut', (_event: unknown, ...args: unknown[]) => {
    void (async () => {
      try {
        const combination = args[0] as string
        switch (combination) {
          // ctrl+r (reload) and ctrl+shift+i (devtools) are DECLARED DEGRADED under Tauri
          // (T-34.5-27): the sidecar has no WebView reload/devtools equivalent. They only ever hit
          // the platform shim's logged no-ops, so the cases are gone (66.3-10).
          // hotkey to quit the app
          case 'ctrl+q':
            await deps.quit.handleExit()
            break
          // hotkey to open the settings on frontend
          case 'ctrl+k':
            deps.sendFrontendMessage('openScreen', '/settings/general')
            break
          // hotkey to open the downloads screen on frontend
          case 'ctrl+j':
            deps.sendFrontendMessage('openScreen', '/download-manager')
            break
          // hotkey to open the library screen on frontend
          case 'ctrl+l':
            deps.sendFrontendMessage('openScreen', '/library')
            break
        }
      } catch (error) {
        logChannelFailure('processShortcut', error)
      }
    })()
  })
}
