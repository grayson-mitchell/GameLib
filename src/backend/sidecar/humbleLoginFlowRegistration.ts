/**
 * Curated browser-auth channel registration for Humble's login (Phase 34.4.1 Plan 02,
 * D-01/D-02/D-04/D-07/D-08, REQ-34.4.1-02/REQ-34.4.1-03/REQ-34.4.1-04/REQ-34.4.1-05/
 * REQ-34.4.1-13).
 *
 * Registers the 4 browser-auth channels onto `platformApi`'s `ipcMain` recorder.
 *
 * **Phase 94 Plan 04 (D-03) moved the login-window seam's install out of this module.** The
 * `rustInvoke`-backed `LoginWindowSeam` implementation, the one call site of the slot's
 * `install()` and the `GAMELIB_LOGIN_SEAM_SMOKE` hook now live in `loginSeamRegistration.ts`
 * (`registerLoginWindowSeam`), which `handlers.ts` calls before this registration: the GOG, Epic
 * and Amazon sign-in flows still drive the seam until Phase 92, so its install must not die with
 * the Humble registration.
 *
 * **Phase 40 Plan 03 (D-11) removed `humbleGetLoginUserAgent` and `humbleLoginNavigated`** --
 * both channels were dual-registered here and in `ipc_handler.ts`, but their only renderer
 * caller (the deleted `<webview>`-era `HumbleLoginSurface`) died with Model A, and a four-surface
 * sweep (`.planning/phases/40-.../40-CHANNEL-RECENSUS.md`) found zero remaining callers,
 * including of `HumbleUser.notifyLoginNavigated()` directly. What was 6 channels is now 4.
 *
 * Registration-kind cross-check against `humble/ipc_handler.ts` (verified against source by
 * `34.4.1-RESEARCH.md`, zero divergence -- READ ONLY, never imported, see the curated-import
 * paragraph below):
 *
 *   invoke (ipcMain.handle, 3):
 *     - `humbleStartLogin`         -> `ipc_handler.ts:21`  -> `HumbleUser.startLogin()`
 *     - `humbleReconnect`          -> `ipc_handler.ts:23`  -> `HumbleUser.reconnect()`
 *     - `humbleRevealKey`          -> `ipc_handler.ts:102` -> `HumbleLibrary.revealKey(gamekey, machineName)`
 *
 *   send (ipcMain.on, 1):
 *     - `humbleStopLogin`      -> `ipc_handler.ts:126` -> `humble.user.stopLogin()`
 *
 * A `send` channel registered with `ipcMain.handle` (or the reverse) fails 100% SILENTLY at
 * runtime -- no reject, no timeout, no console line (`sidecar-send-channels-fail-silently` project
 * memory). Both directions of every registration below are cross-checked in
 * `__tests__/humbleLoginFlows.test.ts` (RED-proven, per that file's own header).
 *
 * D-01/D-02 (curated-import discipline, inherited from Phase 30 D-08 -> ... -> Phase 34.4 D-14):
 * take the Humble services by slice and NEVER import `../humble/ipc_handler`. That file
 * ALSO registers these same 4 channels (plus the 15 Phase 34.4 already ported) onto Electron's
 * REAL `ipcMain` at import time via `backend/ipc`'s `addHandler`/`addListener` -- a side-effect
 * import here would double-register all 19 channels this phase and Phase 34.4 own, and would drag
 * `backend/ipc` (an Electron-only module) into the sidecar's curated import graph.
 *
 * D-07 (fail-safe, never reject): every `handle`-kind body catches and RESOLVES a safe default
 * rather than rejecting (`sidecar-dialog-reject-crashes`) -- `humbleStartLogin`/`humbleReconnect`
 * resolve `{ status: 'error' }`, and `humbleRevealKey` resolves the same typed failure outcome
 * shape (`{ status: 'failed' }`) its own internal defensive default already uses. Every
 * `send`-kind body wraps its work in the `void (async () => {...})()` shape
 * `copySystemInfoToClipboard` (`clipboardFlowRegistration.ts`) uses, so a listener rejection can
 * never become an unhandled rejection.
 */

import type { IpcRegistry } from './ipcRegistry'
import type { HumbleServices } from '../humble'
import { logWarning, LogPrefix } from '../logger'

/**
 * Routes this module's diagnostics to the SAME file logger every other backend module uses
 * (`~/Library/Logs/GameLib/gamelib.log` on macOS), not to `console.warn`.
 *
 * Why (34.4.1-02 Task 4): the sidecar is a child process whose stdout/stderr is the RPC frame
 * pipe, not a terminal — Phase 33 established that sidecar console output reaches neither
 * `gamelib.log` nor the `tauri:dev` terminal. Every `console.warn` in this module was therefore
 * writing to nowhere, which is the same silent-failure class as the sidecar `send` channels in
 * G-30-01.
 */
function logSendFailure(channel: string, error: unknown): void {
  logWarning(
    [
      `[humbleLoginFlowRegistration] ${channel} failed:`,
      error instanceof Error ? error.message : String(error)
    ],
    LogPrefix.Backend
  )
}

/**
 * Registers this module's 4 browser-auth channels. Called once from `handlers.ts` (module scope)
 * -- this module owns no side effects at import time beyond the imports above; the caller decides
 * when registration happens. The login-window seam this registration's user drives is installed by
 * `registerLoginWindowSeam` (`loginSeamRegistration.ts`), which `handlers.ts` calls first.
 *
 * Phase 40 Plan 03 (D-11): was 6 channels (4 invoke + 2 send); `humbleGetLoginUserAgent` and
 * `humbleLoginNavigated` (both send-kind) were removed after a four-surface sweep found zero
 * remaining callers -- see this file's module docstring above and
 * `.planning/phases/40-.../40-CHANNEL-RECENSUS.md`.
 */
export function registerHumbleLoginFlows(deps: {
  ipc: Pick<IpcRegistry, 'handle' | 'on'>
  /** The boot's Humble services (D-66.3-17): the user and the library, by slice. */
  humble: Pick<HumbleServices, 'user' | 'library'>
}): void {
  const { humble } = deps

  // ── invoke (3) ──────────────────────────────────────────────────────────────────────────────

  deps.ipc.handle('humbleStartLogin', async () => {
    try {
      return await humble.user.startLogin()
    } catch (error) {
      console.warn(
        '[humbleLoginFlowRegistration] humbleStartLogin failed:',
        error instanceof Error ? error.message : String(error)
      )
      return { status: 'error' }
    }
  })

  deps.ipc.handle('humbleReconnect', async () => {
    try {
      return await humble.user.reconnect()
    } catch (error) {
      console.warn(
        '[humbleLoginFlowRegistration] humbleReconnect failed:',
        error instanceof Error ? error.message : String(error)
      )
      return { status: 'error' }
    }
  })

  deps.ipc.handle(
    'humbleRevealKey',
    async (_event: unknown, ...args: unknown[]) => {
      const params = args[0] as { gamekey: string; machineName: string }
      try {
        return await humble.library.revealKey(
          params.gamekey,
          params.machineName
        )
      } catch (error) {
        console.warn(
          '[humbleLoginFlowRegistration] humbleRevealKey failed:',
          error instanceof Error ? error.message : String(error)
        )
        // Same typed failure outcome shape revealKey()'s own internal defensive
        // default already returns (library.ts's concurrent-duplicate guard) --
        // never a bare reject.
        return { status: 'failed' }
      }
    }
  )

  // ── send (1) ────────────────────────────────────────────────────────────────────────────────

  deps.ipc.on('humbleStopLogin', () => {
    void (async () => {
      try {
        humble.user.stopLogin()
      } catch (error) {
        logSendFailure('humbleStopLogin', error)
      }
    })()
  })
}
