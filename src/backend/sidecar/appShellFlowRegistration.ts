/**
 * Curated app-shell channel registration (Phase 34.1 Plan 04,
 * D-03/D-08/D-09/D-13, REQ-34.1-05/REQ-34.1-09/REQ-34.1-12).
 *
 * Registers the 20 sidecar-routed app-shell channels (8 invoke + 12 send) onto electronStub's
 * `ipcMain` recorder, importing the REAL `backend/appshell/*` functions
 * extracted by Plan 34.1-02 unchanged (mirrors `installFlowRegistration.ts`'s
 * / `settingsFlowRegistration.ts`'s own objective — prove the real logic runs
 * behind the new transport, not a reimplementation):
 *
 *   invoke (8, `ipcMain.handle`):
 *     - `getCustomThemes`/`getThemeCSS`/`getCustomCSS` -> `appshell/themes.ts`
 *       (`main.ts:1512-1516`)
 *     - `getHeroicVersion` -> `electronStub`'s `app.getVersion()` — Electron
 *       parity is the BARE `app.getVersion()` (`main.ts:754`), not the
 *       decorated `utils/systeminfo/heroicVersion.ts` form; do not "improve"
 *       it
 *     - `getLatestReleases`/`getCurrentChangelog` -> `appshell/releases.ts`
 *       (`main.ts:765/767`)
 *     - `isIntelMac` -> the `isIntelMac` const, `backend/constants/environment`
 *       (`utils/ipc_handler.ts:32`) — re-registered HERE ONLY, see D-09 below
 *     - `getWebviewPreloadPath` -> a declared-empty `''` (D-12: Tauri has no
 *       `<webview>` tag, the login-webview story is Phase 34.4's, Phase 33
 *       D-09 already recorded `session` as an accepted gap)
 *
 *   send (10, `ipcMain.on`):
 *     - `changeLanguage` -> `appshell/language.ts` (`main.ts:526-528`)
 *     - `notify` -> `backend/dialog/dialog`'s `notify()` (`main.ts:538`),
 *       reaching `electronStub.Notification` -> the existing
 *       `notification_show` rustInvoke arm (Phase 33)
 *     - `quit` -> `backend/utils`'s `handleExit()` (`main.ts:680`), reaching
 *       `electronStub.app.exit()` -> the existing `app_exit` rustInvoke arm
 *     - `openReleases`/`openCustomThemesWiki`/`openWebviewPage` -> thin
 *       re-wirings of `backend/utils`'s `openUrlOrFile()` (`main.ts:716/727/
 *       730-732`), reaching `electronStub.shell.openExternal`/`openPath` ->
 *       the existing `open_external`/`shell_open_path` rustInvoke arms
 *     - `abort` -> `callAbortController(id)`, imported directly from
 *       `utils/aborthandler/aborthandler.ts` (`main.ts:15` shape) — NOT via
 *       `utils/ipc_handler.ts` (D-09 below)
 *     - `lock`/`unlock` -> `electronStub.powerSaveBlocker.start()`/`.stop()`,
 *       mirroring `main.ts:618-644`'s module-scope `powerId`/`displaySleepId`
 *       guards exactly — an accepted Phase 33 D-08 logged no-op, carried
 *       forward unchanged (D-13)
 *     - `setTitleBarOverlay` -> a logged no-op (D-13): no native overlay
 *       survives D-06's own-buttons-everywhere choice under Tauri
 *     - `frontendReady` (D-11, Plan 05, REQ-34.6-04/07/13) -> a deliberate
 *       subset of `main.ts:560-601`: `logSendHandlerReached` (the send-kind
 *       observable), the `logInfo('Frontend Ready', ...)` equivalent, and the
 *       `isSnap`/`isCLINoGui` branches byte-equivalently. EXCLUDES
 *       `handleProtocol(...)` and the 5s `initQueue(true)` auto-resume — see
 *       the module docstring's dedicated D-11 paragraph above for why both
 *       exclusions are correct, not a regression
 *
 * A `send` channel registered with `ipcMain.handle` (or the reverse) fails
 * 100% SILENTLY at runtime (Phase 31 Pitfall 2) — every registration below
 * was cross-checked against `main.ts`'s own `addHandler`/`addListener` call
 * for that exact channel before being written.
 *
 *   - `changeTrayColor` (Plan 06, D-11) -> reads `darkTrayIcon` from
 *     `GlobalConfig` and forwards `{ dark }` to the real Tauri tray via the
 *     `tray_set_icon` rustInvoke arm -- THE SLICE'S ONLY NEW RUST ARM. Mirrors
 *     `tray_icon.ts:51`'s 500ms settle delay and its own module-level timer
 *     (never stacks unbounded timers, T-34.1-23). `registerAppShellFlows()`
 *     also performs one initial, fully-guarded sync so the tray's startup
 *     light-variant default gets corrected without waiting on a user toggle.
 *
 * Deliberately does NOT register:
 *   - The ten D-01 window-chrome channels (`minimizeWindow`/`maximizeWindow`/
 *     `unmaximizeWindow`/`closeWindow`/`isMaximized`/`isMinimized`/
 *     `isFullscreen`/`setFullscreen`/`isFrameless`/`setZoomFactor`) — D-02:
 *     the sidecar registers nothing for them, the preload short-circuit means
 *     any sidecar registration would be unreachable dead code.
 *   - `createNewWindow`, `showAboutWindow`, and `gamepadAction` — plans
 *     34.1-05/07 own these as from-scratch Tauri work, not extraction.
 *   - `set-connectivity-online` — already live via `bootstrap.ts`'s
 *     `initOnlineMonitor()` call (Phase 33); `electronStub`'s
 *     `listenerRegistry` holds an ARRAY per channel, so a second
 *     `ipcMain.on` registration here would make `setStatus('online')` fire
 *     twice per message.
 *
 * D-09 (curated-import discipline, carried forward from Phase 30 D-08): no
 * file under `src/backend/sidecar/` may import the real `electron` module.
 * `abort`/`isIntelMac` currently live in `utils/ipc_handler.ts`, which ALSO
 * registers slice-6/8 channels (`getLegendaryVersion`, `getSystemInfo`,
 * `hasExecutable`, …) at import time — side-effect-importing that whole file
 * would prematurely drag those import graphs into this slice's sidecar
 * bundle. `callAbortController`/`isIntelMac` are therefore imported directly
 * from their own declaration modules instead, and only the two channels this
 * slice owns are re-registered here.
 *
 * D-11 (Phase 34.6 Plan 05, REQ-34.6-04/07/13): `frontendReady` (send-kind,
 * `preload/api/misc.ts:93`'s `makeListenerCaller` — NOT invoke-kind, contrary
 * to `IPC-PORT-INVENTORY.md`'s prior claim) is registered here as
 * `ipcMain.on`, calling `logSendHandlerReached('frontendReady')`
 * (`./sendChannelObservable.ts`) as its FIRST statement — the only proof
 * available that a send-kind handler ran at all, since a send channel fails
 * silently with no reject and no timeout. The body is a DELIBERATE SUBSET of
 * `main.ts:560-601`'s original: it excludes `handleProtocol(...)` (the
 * sidecar already delivers cold-start deep links via
 * `bootstrap.ts`'s `deliverStartupProtocolUrl` and serves warm ones via
 * `registerProtocolUrlHandler` — re-running it here would double-handle a
 * `gamelib://` link) and excludes the 5-second `initQueue(true)` boot-time
 * auto-resume (Phase 33 D-04 explicitly deferred that to Phase 35; `initQueue`
 * is called from no other sidecar code path today, so adding it here would
 * ship deferred behaviour inside a port). Both exclusions preserve prior
 * locked decisions and are proven behaviourally by `appShellFlows.test.ts`
 * (mocked `initQueue`/`handleProtocol`, asserted not called) — not merely
 * asserted in this comment.
 *
 * Uses electronStub's own `ipcMain` directly (not `backend/ipc`'s typed
 * `addHandler`/`addListener`) — `backend/ipc.ts` itself imports the real
 * `electron` module.
 *
 * Every `send`-kind body below is wrapped so a rejected/thrown failure logs
 * rather than propagates — an unhandled rejection from a `send` handler
 * crashes the sidecar process. `sidecar/processGuards.ts` (Phase 34.2 Plan
 * 09) now installs a process-level `unhandledRejection` guard, but that is
 * defence-in-depth only — it does not replace this try/catch-at-the-body
 * discipline (see the `sidecar-dialog-reject-crashes` precedent).
 */

import i18next from 'i18next'

import { ipcMain, app, powerSaveBlocker, dialog } from './electronStub'
import { isIntelMac, isSnap, isCLINoGui } from '../constants/environment'
import { heroicGithubURL, customThemesWikiLink } from '../constants/urls'
import { getCustomThemes, getThemeCSS, getCustomCSS } from '../appshell/themes'
import {
  getLatestReleasesForStartup,
  getCurrentChangelogEntry
} from '../appshell/releases'
import { changeLanguage } from '../appshell/language'
import { notify } from '../dialog/dialog'
import { handleExit, openUrlOrFile } from '../utils'
import { callAbortController } from '../utils/aborthandler/aborthandler'
import { GlobalConfig } from '../config'
import { configStore } from '../constants/key_value_stores'
import { logInfo, LogPrefix } from '../logger'
import { requestRustInvoke } from './sidecarRpc'
import { RUST_TRAY_SET_ICON } from '../../common/types/sidecarTransport'
import { logSendHandlerReached } from './sendChannelObservable'

function logSendFailure(channel: string, error: unknown): void {
  console.warn(
    `[appShellFlowRegistration] ${channel} failed:`,
    error instanceof Error ? error.message : String(error)
  )
}

// D-12: logged once, never silent — see the module docstring's
// `getWebviewPreloadPath` entry for the full rationale.
let webviewPreloadPathWarned = false

// Mirrors main.ts:615-617's own module-scope guards, kept as this module's
// OWN state — the sidecar is a separate process from any Electron main
// process, so there is nothing to share these with.
let powerId: number | undefined
let displaySleepId: number | undefined

// changeTrayColor's 500ms settle-delay timer (mirrors tray_icon.ts:51's own setTimeout).
// Module-level so repeated sends within the window clear-and-reschedule instead of
// stacking unbounded timers (T-34.1-23).
let trayColorTimer: NodeJS.Timeout | undefined

/**
 * Read `darkTrayIcon` from `GlobalConfig` and forward it to the real Tauri tray via the
 * `tray_set_icon` rustInvoke arm (Plan 06, D-11). Fully guarded: a `GlobalConfig` read
 * failure or a rejected `requestRustInvoke` both log and return — a tray sync must never
 * crash the sidecar (the `sidecar-dialog-reject-crashes` precedent).
 */
function syncTrayIcon(): void {
  try {
    const { darkTrayIcon } = GlobalConfig.get().getSettings()
    requestRustInvoke(RUST_TRAY_SET_ICON, [
      { dark: Boolean(darkTrayIcon) }
    ]).catch((error) => logSendFailure('changeTrayColor', error))
  } catch (error) {
    logSendFailure('changeTrayColor', error)
  }
}

/**
 * Registers the 20 app-shell channels (8 invoke + 12 send). Called once from
 * `handlers.ts` — this
 * module owns no side effects at import time beyond the imports above; the
 * caller decides when registration onto the handler registry happens.
 *
 * `options.skipInitialTraySync` (sidecar-init-rustinvoke-leak, default `false`): lets
 * `handlers.ts`'s own top-level, import-time-triggered call suppress the one-shot boot-time
 * `tray_set_icon` correction under Jest, without changing this function's behavior for any
 * caller that invokes it directly (see the call site below for the full rationale).
 */
export function registerAppShellFlows(
  options: { skipInitialTraySync?: boolean } = {}
): void {
  // ── invoke (8) ────────────────────────────────────────────────────────

  ipcMain.handle('getCustomThemes', async () => getCustomThemes())

  ipcMain.handle('getThemeCSS', async (_event: unknown, ...args: unknown[]) =>
    getThemeCSS(args[0] as string)
  )

  ipcMain.handle('getCustomCSS', async () => getCustomCSS())

  // Electron parity is the bare app.getVersion() (main.ts:754) — do not
  // decorate with the versionNames form from heroicVersion.ts.
  ipcMain.handle('getHeroicVersion', async () => app.getVersion())

  ipcMain.handle('getLatestReleases', async () => getLatestReleasesForStartup())

  ipcMain.handle('getCurrentChangelog', async () => getCurrentChangelogEntry())

  ipcMain.handle('isIntelMac', async () => isIntelMac)

  ipcMain.handle('getWebviewPreloadPath', async () => {
    if (!webviewPreloadPathWarned) {
      webviewPreloadPathWarned = true
      console.warn(
        "[appShellFlowRegistration] getWebviewPreloadPath(): declared-empty return (D-12) -- Tauri has no <webview> tag; the login-webview story is Phase 34.4's"
      )
    }
    return ''
  })

  // ── send (10) ─────────────────────────────────────────────────────────

  ipcMain.on('changeLanguage', (_event: unknown, ...args: unknown[]) => {
    changeLanguage(args[0] as string).catch((error) =>
      logSendFailure('changeLanguage', error)
    )
  })

  ipcMain.on('notify', (_event: unknown, ...args: unknown[]) => {
    try {
      notify(args[0] as { title: string; body: string })
    } catch (error) {
      logSendFailure('notify', error)
    }
  })

  ipcMain.on('quit', () => {
    handleExit().catch((error) => logSendFailure('quit', error))
  })

  ipcMain.on('openReleases', () => {
    openUrlOrFile(heroicGithubURL).catch((error) =>
      logSendFailure('openReleases', error)
    )
  })

  ipcMain.on('openCustomThemesWiki', () => {
    openUrlOrFile(customThemesWikiLink).catch((error) =>
      logSendFailure('openCustomThemesWiki', error)
    )
  })

  ipcMain.on('openWebviewPage', (_event: unknown, ...args: unknown[]) => {
    openUrlOrFile(args[0] as string).catch((error) =>
      logSendFailure('openWebviewPage', error)
    )
  })

  ipcMain.on('abort', (_event: unknown, ...args: unknown[]) => {
    try {
      callAbortController(args[0] as string)
    } catch (error) {
      logSendFailure('abort', error)
    }
  })

  // D-13/D-08 (Phase 33 accepted gap, carried forward unchanged): mirrors
  // main.ts:618-631 exactly. electronStub's powerSaveBlocker.start() already
  // emits its own D-08-tagged console.warn on every call it makes.
  ipcMain.on('lock', (_event: unknown, ...args: unknown[]) => {
    try {
      const playing = args[0] as boolean
      const isSleepBlocked = powerId !== undefined
      const isDisplaySleepBlocked = displaySleepId !== undefined

      if (!playing && !isSleepBlocked) {
        powerId = powerSaveBlocker.start()
      }

      if (playing && !isDisplaySleepBlocked) {
        displaySleepId = powerSaveBlocker.start()
      }
    } catch (error) {
      logSendFailure('lock', error)
    }
  })

  // D-13/D-08: mirrors main.ts:633-644. electronStub's powerSaveBlocker.stop()
  // is itself silent (Phase 33), so this handler logs its own D-08-tagged
  // warning whenever it actually stops a blocker -- never silent.
  ipcMain.on('unlock', () => {
    try {
      if (powerId !== undefined) {
        // electronStub's powerSaveBlocker.stop() takes no id argument (unlike
        // real Electron's) -- it never tracked per-id state to begin with.
        powerSaveBlocker.stop()
        console.warn(
          '[appShellFlowRegistration] unlock(): logged no-op (D-08, accepted gap, Phase 33) -- powerSaveBlocker.stop() has no real Tauri wake-lock effect'
        )
        powerId = undefined
      }
      if (displaySleepId !== undefined) {
        powerSaveBlocker.stop()
        console.warn(
          '[appShellFlowRegistration] unlock(): logged no-op (D-08, accepted gap, Phase 33) -- powerSaveBlocker.stop() has no real Tauri wake-lock effect'
        )
        displaySleepId = undefined
      }
    } catch (error) {
      logSendFailure('unlock', error)
    }
  })

  // D-13: setTitleBarOverlay has no native overlay left to target under D-06
  // (GameLib's own titlebar buttons render on every platform when frameless)
  // -- a declared, logged no-op. Never throws.
  ipcMain.on('setTitleBarOverlay', () => {
    console.warn(
      "[appShellFlowRegistration] setTitleBarOverlay(): logged no-op (D-13) -- no native titlebar overlay survives under Tauri once D-06 puts GameLib's own buttons on every platform when frameless"
    )
  })

  // D-11 (Phase 34.6 Plan 05, REQ-34.6-04/07/13): frontendReady, send-kind.
  // `logSendHandlerReached` is the FIRST statement -- the only proof this
  // handler ran, since a send channel fails silently. Body is a deliberate
  // SUBSET of main.ts:560-601 -- see this module's own docstring for the two
  // exclusions (handleProtocol, initQueue) and why each is preserved, not a
  // regression.
  ipcMain.on('frontendReady', () => {
    try {
      logSendHandlerReached('frontendReady')
      logInfo('Frontend Ready', LogPrefix.Backend)

      if (isSnap) {
        const showSnapWarning = configStore.get('showSnapWarning', true)
        if (showSnapWarning) {
          dialog
            .showMessageBox({
              title: i18next.t(
                'box.warning.snap.title',
                'GameLib is running as a Snap'
              ),
              message: i18next.t('box.warning.snap.message', {
                defaultValue:
                  'Some features are not available in the Snap version of the app for now and we are trying to fix it.{{newLine}}Current limitations are: {{newLine}}GameLib will not be able to find Proton from Steam or Wine from Lutris.{{newLine}}{{newLine}}Gamescope, GameMode and MangoHud will also not work since GameLib cannot have access to them.{{newLine}}{{newLine}}To have access to this feature please install GameLib as a Flatpak, DEB or from the AppImage.',
                newLine: '\n'
              }),
              checkboxLabel: i18next.t('box.warning.snap.checkbox', {
                defaultValue: 'Do not show this message again'
              }),
              checkboxChecked: false
            })
            .then((result) => {
              if (result.checkboxChecked) {
                configStore.set('showSnapWarning', false)
              }
            })
            .catch((error) => logSendFailure('frontendReady', error))
        }
      }

      if (isCLINoGui) {
        return
      }

      // EXCLUDED (deliberate, see module docstring): handleProtocol([...]) --
      // the sidecar already delivers cold-start deep links via
      // bootstrap.ts's deliverStartupProtocolUrl(process.argv) and serves
      // warm ones via registerProtocolUrlHandler(); re-running it here would
      // double-handle a gamelib:// link.
      //
      // EXCLUDED (deliberate, see module docstring): the 5-second
      // initQueue(true) boot-time auto-resume -- Phase 33 D-04 explicitly
      // deferred this to Phase 35, and initQueue is called from no other
      // sidecar code path today.
    } catch (error) {
      logSendFailure('frontendReady', error)
    }
  })

  // D-11: swap the real Tauri tray's icon via the `tray_set_icon` rustInvoke arm.
  // Mirrors tray_icon.ts:51 exactly -- log immediately (safe: only reachable at
  // runtime, well after the sidecar has booted and initLogger() has run), then a
  // 500ms settle delay before the actual sync so a rapid theme-setting change
  // doesn't race a still-updating `darkTrayIcon` value.
  ipcMain.on('changeTrayColor', () => {
    logInfo('Changing Tray icon Color...', LogPrefix.Backend)
    if (trayColorTimer) {
      clearTimeout(trayColorTimer)
    }
    trayColorTimer = setTimeout(syncTrayIcon, 500)
  })

  // Initial sync: correct the tray's startup light-variant default (main.rs's
  // `.setup()` always starts with `tray_image(false)`) to the user's actual
  // `darkTrayIcon` setting. Deferred via `setImmediate` (Rule 3 fix, same shape as
  // `downloadQueueFlowRegistration.ts`'s D-05 precedent): `registerAppShellFlows()`
  // runs synchronously at `handlers.ts`'s top-level `import './handlers'`
  // (`bootstrap.ts` Step 2), BEFORE `initLogger()` (Step 3) has run -- and
  // `GlobalConfig.get()`'s first-ever call in this process can itself synchronously
  // call `logInfo`/`logError` on the config-version-upgrade path (`config.ts:145/
  // 152`), which would throw before the sidecar ever reaches READY if not deferred.
  // `syncTrayIcon()`'s own try/catch additionally covers the same third path this
  // codebase's precedent already documented (a test file that imports `./handlers`
  // directly, without ever calling `init()`/`initLogger()`).
  //
  // Guarded (sidecar-init-rustinvoke-leak, fix/steam-native-install-stability): this call is
  // UNCONDITIONAL and UNTRACKED (`.catch()` only, never awaited, no drain hook). In
  // production `registerAppShellFlows()` runs exactly ONCE per process, so there is no
  // ambiguity about which transport it targets. Under Jest, `handlers.ts` (and therefore
  // this function) also runs exactly ONCE per test FILE -- Jest resets the module registry
  // per file, and `handlers.ts`'s own top-level `registerAppShellFlows()` call
  // (`handlers.ts`) fires unconditionally at import time -- but `bootstrap.test.ts` /
  // `*Flows.test.ts` call `init()` MANY times per file with FRESH `stream.PassThrough`
  // pairs. Because `sidecarRpc.ts`'s `outputStream` is a single module-level mutable
  // rebound by every `startRpcServer()` call, this deferred write used to land on whichever
  // `it` block happened to be running when the Node "check" phase reached it -- typically
  // the first test in the file -- injecting an unexpected extra `rustInvoke` frame into that
  // test's output stream, and (via that test's own assertion throwing before it could settle
  // ITS OWN pending rustInvoke calls) leaving a real, unref'd `RUST_INVOKE_TIMEOUT_MS` timer
  // running that later rejected into an arbitrary later suite under `jest --runInBand`.
  //
  // `skipInitialTraySync` is opt-in, defaulting to `false` (fire, exactly as before) so a
  // DIRECT call to `registerAppShellFlows()` -- e.g. `appShellFlows.test.ts`'s own
  // REQ-34.1-07 `jest.isolateModules` coverage, which proves this exact sync fires with the
  // right args -- is completely unaffected. Only `handlers.ts`'s own top-level,
  // import-time-triggered call (the actual leak source, decoupled from any specific `init()`
  // invocation) passes `true` under Jest.
  if (!options.skipInitialTraySync) {
    setImmediate(syncTrayIcon)
  }
}
