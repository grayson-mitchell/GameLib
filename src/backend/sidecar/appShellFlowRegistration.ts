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
 *   invoke (9, `ipcMain.handle`):
 *     - `getCustomThemes`/`getThemeCSS`/`getCustomCSS`/`getLoginBackground`
 *       -> `appshell/themes.ts`
 *     - `getHeroicVersion` -> `electronStub`'s `app.getVersion()` — Electron
 *       parity is the BARE `app.getVersion()` (`main.ts:754`), not the
 *       decorated `utils/systeminfo/heroicVersion.ts` form; do not "improve"
 *       it
 *     - `getLatestReleases`/`getCurrentChangelog` -> `appshell/releases.ts`
 *       (`main.ts:765/767`)
 *     - `getWebviewPreloadPath` -> a declared-empty `''` (D-12: Tauri has no
 *       `<webview>` tag, the login-webview story is Phase 34.4's, Phase 33
 *       D-09 already recorded `session` as an accepted gap)
 *     - `trayResolveRunner` (Phase 35 Plan 06, D-06) -> resolves a bare
 *       appName to its `Runner` for the Tauri tray's recent-game launch.
 *       Called by the RUST SHELL, not the renderer — the same
 *       `handlerRegistry` direction as `bootstrap.ts`'s `handleProtocolUrl`.
 *       Since Phase 35 Plan 06 persisted `runner` onto `RecentGame`, this is
 *       a LEGACY FALLBACK only: entries written after that change carry their
 *       runner and skip this channel entirely. It is kept because every
 *       pre-existing install's `games.recent` is full of entries that do not
 *       carry one, and stranding those is worse than a probe
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
 *       `isSnap`/`isCLINoGui` branches. Still EXCLUDES `handleProtocol(...)`;
 *       the 5s `initQueue(true)` auto-resume is no longer excluded — it was
 *       PORTED here in Phase 35 plan 11 — see the module docstring's
 *       dedicated D-11 paragraph above. NOT byte-equivalent to `main.ts`'s
 *       registration shape: `main.ts:560` used `addOneTimeListener` (once-
 *       semantics) for the WHOLE handler; this port used a repeating
 *       `ipcMain.on` and, once plan 35-11 moved boot work inside it, that
 *       divergence became reachable (CR-02, `35-REVIEW.md`, closed by plan
 *       35-21 — see `frontendReadyBootWorkDone`'s doc comment below for the
 *       restored one-shot guarantee, scoped to the boot half only)
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
 * `abort` currently lives in `utils/ipc_handler.ts`, which ALSO registers
 * slice-6/8 channels (`getLegendaryVersion`, `getSystemInfo`,
 * `hasExecutable`, …) at import time — side-effect-importing that whole file
 * would prematurely drag those import graphs into this slice's sidecar
 * bundle. `callAbortController` is therefore imported directly from its own
 * declaration module instead, and only the one channel this slice owns is
 * re-registered here.
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
 * `gamelib://` link). That exclusion still stands and is proven
 * behaviourally by `appShellFlows.test.ts` (mocked `handleProtocol`,
 * asserted not called) — not merely asserted in this comment.
 *
 * The 5-second `initQueue(true)` boot-time auto-resume was ALSO excluded here
 * until Phase 35 plan 11, deferred by SEAM's Phase 32 D-05 (referred to in
 * the plan text as "Phase 33 D-04"). It is now PORTED, because `main.ts` —
 * the only other carrier of that call — is deleted at plan 35-14, and the
 * two blockers that justified the deferral were both measured CLOSED. The
 * full reasoning, with the documents that establish each status, lives on the
 * call itself in the `frontendReady` body below rather than being duplicated
 * here. It is proven behaviourally by `appShellFlows.test.ts` (mocked
 * `initQueue`, asserted called exactly once with `true` under fake timers --
 * including across TWO `frontendReady` deliveries into the same registration,
 * `frontendReadyBootWorkDone`'s one-shot guard being exactly what makes that
 * true; see CR-02, `35-REVIEW.md`, closed by plan 35-21).
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

import { ipcMain, app, powerSaveBlocker, dialog } from '../platform'
import { isSnap, isCLINoGui } from '../constants/environment'
import { heroicGithubURL, customThemesWikiLink } from '../constants/urls'
import {
  getCustomThemes,
  getThemeCSS,
  getCustomCSS,
  getLoginBackground
} from '../appshell/themes'
import {
  getLatestReleasesForStartup,
  getCurrentChangelogEntry
} from '../appshell/releases'
import { changeLanguage } from '../appshell/language'
import { notify } from '../dialog/dialog'
import { handleExit, openUrlOrFile } from '../utils'
import { callAbortController } from '../utils/aborthandler/aborthandler'
import { GlobalConfig } from '../config'
import { libraryManagerMap } from '../storeManagers'
import { configStore } from '../constants/key_value_stores'
import { logInfo, LogPrefix } from '../logger'
// Phase 35 plan 11: boot-time download-queue auto-resume, ported from
// `main.ts:613` before that file is deleted at plan 35-14. See the
// `frontendReady` handler below for the full contingency analysis.
import { initQueue } from '../downloadmanager/downloadqueue'
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

// CR-02 (35-REVIEW.md, plan 35-21): `frontendReady`'s boot-time download-queue auto-resume
// must run at most once per sidecar process. The registration stays `ipcMain.on` (not
// `ipcMain.once`) because the send-kind observability (`logSendHandlerReached`, the
// `logInfo('Frontend Ready', ...)` line) and the Snap warning dialog are allowed to repeat --
// T-35-107 dispositions a repeated informational dialog as "accept", not a defect -- while
// `initQueue(true)` is NOT: it has no re-entrancy guard, so a second concurrent call against
// the same queue head would run two downloaders against one install directory. Guarding only
// the boot half is the narrower fix of the review's two candidates. Set to `true` BEFORE the
// `setTimeout` below is scheduled, not inside its callback, so two synchronous deliveries in
// the same tick (no timers involved yet) cannot both observe `false`.
let frontendReadyBootWorkDone = false

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
 * Registers the 21 app-shell channels (9 invoke + 12 send). Called once from
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
  // ── invoke (9) ────────────────────────────────────────────────────────
  // Was 8 under the original Phase 34.1 D-01 set; `getLoginBackground` is a
  // later addition (user-selectable Manage Accounts background artwork).

  ipcMain.handle('getCustomThemes', async () => getCustomThemes())

  ipcMain.handle('getThemeCSS', async (_event: unknown, ...args: unknown[]) =>
    getThemeCSS(args[0] as string)
  )

  ipcMain.handle('getCustomCSS', async () => getCustomCSS())

  ipcMain.handle('getLoginBackground', async () => getLoginBackground())

  // Electron parity is the bare app.getVersion() (main.ts:754) — do not
  // decorate with the versionNames form from heroicVersion.ts.
  ipcMain.handle('getHeroicVersion', async () => app.getVersion())

  ipcMain.handle('getLatestReleases', async () => getLatestReleasesForStartup())

  ipcMain.handle('getCurrentChangelog', async () => getCurrentChangelogEntry())

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

  // D-13/D-08: mirrors main.ts:618-631. Phase 35 Plan 08 (REQ-35-06) closed the D-08 gap here
  // as well as in electronStub -- these two calls previously passed NO kind at all, because the
  // Phase 33 stub took no argument and held nothing, so there was nothing for a kind to select.
  // Now that the stub takes real, DISTINCT OS assertions, the kind is load-bearing and the two
  // branches must pass the same strings main.ts:650/655 passes: a download blocks system sleep,
  // a running game blocks display sleep. Passing one kind for both would be threat T-35-32.
  ipcMain.on('lock', (_event: unknown, ...args: unknown[]) => {
    try {
      const playing = args[0] as boolean
      const isSleepBlocked = powerId !== undefined
      const isDisplaySleepBlocked = displaySleepId !== undefined

      if (!playing && !isSleepBlocked) {
        powerId = powerSaveBlocker.start('prevent-app-suspension')
      }

      if (playing && !isDisplaySleepBlocked) {
        displaySleepId = powerSaveBlocker.start('prevent-display-sleep')
      }
    } catch (error) {
      logSendFailure('lock', error)
    }
  })

  // D-13/D-08: mirrors main.ts:633-644. Phase 35 Plan 08 (REQ-35-06): each stop now passes the
  // id its own start returned, which is the whole point of the id -- the Phase 33 stub took no
  // id, so it could not have released a specific assertion even if it had held one. The
  // D-08-tagged "logged no-op" warnings that used to sit here are gone with the no-op they
  // described: releasing a real assertion is not something to warn about.
  //
  // Releasing the WRONG id, or never releasing at all, is threat T-35-31: an assertion that
  // outlives the app keeps the machine awake with no UI left to stop it.
  ipcMain.on('unlock', () => {
    try {
      if (powerId !== undefined) {
        powerSaveBlocker.stop(powerId)
        powerId = undefined
      }
      if (displaySleepId !== undefined) {
        powerSaveBlocker.stop(displaySleepId)
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
      // PORTED IN PHASE 35 PLAN 11 (SEAM Phase 32 D-05 / "Phase 33 D-04"):
      // the 5-second boot-time download-queue auto-resume, carried across
      // from `main.ts:603-614`. Previously EXCLUDED here and deferred to
      // Phase 35; `main.ts` is deleted at plan 35-14, so this was the last
      // point at which the capability could survive the cutover.
      //
      // `main.ts:611-613`'s own comment, carried across verbatim in intent:
      //   debug/steam-install-slow-start (Thread B): isStartup=true -- the
      //   only call site that must NOT auto-start a persisted Steam queue
      //   head (see initQueue's doc comment in downloadqueue.ts).
      //   GOG/Epic/Amazon keep auto-resuming here unchanged.
      //
      // Why `isStartup=true` is the SAFE argument rather than the risky one,
      // and why the two blockers that justified the original suppression do
      // not reach this call: `isStartup` is ITSELF the Steam suppression.
      // `downloadqueue.ts:116`'s loop breaks before `installQueueElement()`
      // for any `runner === 'steam'` head, surfacing it as resumable instead.
      // Both blockers named by the suppression are Steam-only and therefore
      // structurally unreachable from here:
      //   - G-30-02 (Steam install-hang) -- CLOSED, resolved 2026-07-24,
      //     hardware-proven by the Phase 33 plan 33-05 D-13 live gate
      //     (.planning/debug/steam-install-spinner-hangs-tauri-live-g3002.md).
      //   - The CrossOver-bottle startup-resume auto-launch -- CLOSED, fixed
      //     2026-08-16 (quick task 260816-i8a); `library.ts:818` now surfaces
      //     an interrupted install as resumable and never auto-drives it
      //     (.planning/todos/completed/
      //      steam-startup-download-resume-autoopens-crossover.md).
      // Defence in depth for the non-Steam runners this DOES auto-resume:
      // `installQueueElement`'s stall watchdog (downloadmanager/utils.ts)
      // force-terminates a never-settling install rather than hanging.
      //
      // CR-02 (35-REVIEW.md, plan 35-21): the sidecar OUTLIVES the renderer, so a renderer
      // reload (devtools reload, webview crash-recovery, a future in-app reload path)
      // re-delivers `frontendReady` into this SAME process. `electronStub`'s `ipcMain.on`
      // has no once-semantics of its own (unlike Electron's real `ipcMain`, which the
      // original `main.ts:560` reached via `addOneTimeListener` -> `ipcMain.once`), so a
      // second delivery would schedule a SECOND `initQueue(true)` against the same queue
      // head with no re-entrancy guard on `initQueue` itself. `frontendReadyBootWorkDone`
      // (module-scoped, declared above) restores that one-shot guarantee for just this
      // block, without also silencing the observability/dialog logic above, which is
      // allowed to repeat (see that flag's own doc comment).
      if (!frontendReadyBootWorkDone) {
        frontendReadyBootWorkDone = true
        // `.unref()` (the one intentional difference from `main.ts:613`): under
        // Electron this timer lived in a process the app itself kept alive, so
        // holding the event loop open was harmless. The sidecar is a plain
        // `node` process, and a ref'd 5s timer here keeps the loop alive for 5
        // seconds after all work is done — which showed up immediately as
        // "Jest did not exit one second after the test run has completed" in
        // `appShellFlows.test.ts`. The sidecar's own RPC stdin stream keeps the
        // process alive in production, so the timer still fires normally there;
        // `.unref()` only removes its claim on the loop, never its scheduling.
        setTimeout(() => {
          logInfo('Starting the Download Queue', LogPrefix.Backend)
          void initQueue(true)
        }, 5000).unref()
      }
    } catch (error) {
      logSendFailure('frontendReady', error)
    }
  })

  // ── Phase 35 Plan 06 (D-06, REQ-35-04): tray recent-game runner resolution ──
  //
  // `trayResolveRunner` is INVOKE-kind and is called by the RUST SHELL, not by the renderer --
  // the same direction and the same `handlerRegistry` path `bootstrap.ts`'s `handleProtocolUrl`
  // already uses for the single-instance deep-link delivery. It is therefore NOT a
  // `RUST_INVOKE_CHANNELS` member (that list is the opposite, sidecar->Rust, direction).
  //
  // Why it exists at all: a tray recent-games entry is a `RecentGame`, which carries only
  // `{ appName, title }` (`common/types.ts:623`). The `launch` channel requires a `runner` and
  // deliberately refuses to guess one -- `steamFlowRegistration.ts`'s `handleLaunch` returns
  // `{ status: 'error' }` for an absent/unrecognised runner rather than falling through to
  // Steam (T-34.5-46-03's confused-deputy guard). Under Electron the tray dodged this by
  // handing a deep-link URL to `handleProtocol`, whose `findGame` did the resolution; Phase 35
  // forbids routing an internal tray click out through a URL scheme (T-35-21), so the
  // resolution is exposed here as a plain in-process lookup and the shell then calls the
  // ordinary, already-hardened `launch` handler with the resolved runner.
  //
  // MUST be registered with `ipcMain.handle`, never `ipcMain.on` -- this channel has a return
  // value the shell blocks on, and a send-kind registration would fail 100% silently
  // (Phase 31 Pitfall 2).
  //
  // Resolution order mirrors `protocol.ts`'s own `RUNNERS` enum exactly
  // (legendary, gog, nile, sideload) so a cross-store appName collision resolves the SAME way
  // the Electron tray resolved it, with `steam` and `zoom` appended -- both are absent from
  // that enum, which is why the Electron tray could never launch a Steam recent game at all.
  // Appending rather than prepending keeps the existing order authoritative and makes this
  // strictly more capable than what it replaces.
  ipcMain.handle('trayResolveRunner', (_event: unknown, ...args: unknown[]) => {
    const appName = args[0]
    if (typeof appName !== 'string' || appName.length === 0) {
      // Never echoes the rejected value, mirroring `handleProtocolUrl`'s own T-34.5-G6-25
      // discipline -- the shell logs a reason, never a payload.
      throw new Error('trayResolveRunner: rejected a non-string appName')
    }

    const searchOrder = [
      'legendary',
      'gog',
      'nile',
      'sideload',
      'steam',
      'zoom'
    ] as const

    for (const runner of searchOrder) {
      try {
        // Own-property form, never a bare index: `libraryManagerMap` is a plain object
        // literal, so a bare lookup resolves through `Object.prototype` (the same
        // T-34.5-46-01 reasoning `handleLaunch`'s own guard carries).
        if (!Object.prototype.hasOwnProperty.call(libraryManagerMap, runner))
          continue
        const info = libraryManagerMap[runner].getGame(appName).getGameInfo()
        if (info?.app_name) return runner
      } catch (error) {
        // A manager that throws for an unknown appName must not abort the search -- the next
        // runner may still own this game.
        logSendFailure(`trayResolveRunner:${runner}`, error)
      }
    }

    // A `null` return is a normal outcome, not an error: the game may have been uninstalled
    // and removed from its library since it entered the recent list. The shell logs and does
    // NOT launch anything.
    return null
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
