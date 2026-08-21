/**
 * Curated app-shell channel registration (Phase 34.1 Plan 04,
 * D-03/D-08/D-09/D-13, REQ-34.1-05/REQ-34.1-09/REQ-34.1-12).
 *
 * Registers the 18 sidecar-routed app-shell channels onto electronStub's
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

import { ipcMain, app, powerSaveBlocker } from './electronStub'
import { isIntelMac } from '../constants/environment'
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
import { logInfo, LogPrefix } from '../logger'
import { requestRustInvoke } from './sidecarRpc'
import { RUST_TRAY_SET_ICON } from '../../common/types/sidecarTransport'

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
 * Registers the 18 app-shell channels. Called once from `handlers.ts` — this
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
