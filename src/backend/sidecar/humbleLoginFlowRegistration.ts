/**
 * Curated browser-auth channel registration for Humble's login-window seam (Phase 34.4.1 Plan 02,
 * D-01/D-02/D-04/D-07/D-08, REQ-34.4.1-02/REQ-34.4.1-03/REQ-34.4.1-04/REQ-34.4.1-05/
 * REQ-34.4.1-13).
 *
 * Registers the 6 browser-auth channels onto `electronStub`'s `ipcMain` recorder and installs a
 * `rustInvoke`-backed implementation of `LoginWindowSeam` (`backend/humble/loginWindowSeam.ts`) at
 * sidecar startup. This is the ONLY module that constructs that implementation and the ONLY call
 * site of `setLoginWindowSeam()` in the whole repo (T-34.4.1-10) -- kept in its own dedicated
 * module (rather than folded into `humbleFlowRegistration.ts`) specifically so the claim "this
 * phase adds one seam used by six channels" stays auditable from one file.
 *
 * Registration-kind cross-check against `humble/ipc_handler.ts` (verified against source by
 * `34.4.1-RESEARCH.md`, zero divergence -- READ ONLY, never imported, see the curated-import
 * paragraph below):
 *
 *   invoke (ipcMain.handle, 4):
 *     - `humbleStartLogin`         -> `ipc_handler.ts:21`  -> `HumbleUser.startLogin()`
 *     - `humbleReconnect`          -> `ipc_handler.ts:23`  -> `HumbleUser.reconnect()`
 *     - `humbleGetLoginUserAgent`  -> `ipc_handler.ts:25`  -> `standardBrowserUserAgent()`
 *     - `humbleRevealKey`          -> `ipc_handler.ts:102` -> `HumbleLibrary.revealKey(gamekey, machineName)`
 *
 *   send (ipcMain.on, 2):
 *     - `humbleStopLogin`      -> `ipc_handler.ts:126` -> `HumbleUser.stopLogin()`
 *     - `humbleLoginNavigated` -> `ipc_handler.ts:127` -> `HumbleUser.notifyLoginNavigated()`
 *
 * A `send` channel registered with `ipcMain.handle` (or the reverse) fails 100% SILENTLY at
 * runtime -- no reject, no timeout, no console line (`sidecar-send-channels-fail-silently` project
 * memory). Both directions of every registration below are cross-checked in
 * `__tests__/humbleLoginFlows.test.ts` (RED-proven, per that file's own header).
 *
 * D-01/D-02 (curated-import discipline, inherited from Phase 30 D-08 -> ... -> Phase 34.4 D-14):
 * import `../humble/user`, `../humble/userAgent`, `../humble/library` and
 * `../humble/loginWindowSeam` directly (`standardBrowserUserAgent` comes straight from its own
 * `userAgent.ts` module, not through `user.ts`'s re-export, so this module's dependency on it is
 * explicit), and NEVER `../humble/ipc_handler`. That file ALSO
 * registers these same 6 channels (plus the 15 Phase 34.4 already ported) onto Electron's REAL
 * `ipcMain` at import time via `backend/ipc`'s `addHandler`/`addListener` -- a side-effect import
 * here would double-register all 21 channels this phase and Phase 34.4 own, and would drag
 * `backend/ipc` (an Electron-only module) into the sidecar's curated import graph.
 *
 * D-07 (fail-safe, never reject): every `handle`-kind body catches and RESOLVES a safe default
 * rather than rejecting (`sidecar-dialog-reject-crashes`) -- `humbleStartLogin`/`humbleReconnect`
 * resolve `{ status: 'error' }`, `humbleGetLoginUserAgent` resolves the pure
 * `standardBrowserUserAgent()` value directly (it cannot fail), and `humbleRevealKey` resolves the
 * same typed failure outcome shape (`{ status: 'failed' }`) its own internal defensive default
 * already uses. Every `send`-kind body wraps its work in the `void (async () => {...})()` shape
 * `copySystemInfoToClipboard` (`clipboardFlowRegistration.ts`) uses, so a listener rejection can
 * never become an unhandled rejection.
 *
 * D-08 (Assumption A4 smoke hook, see bottom of `registerHumbleLoginFlows()`): env-gated,
 * `GAMELIB_LOGIN_SEAM_SMOKE=1` only, inert by default, exercises `WebviewWindowBuilder::build()`
 * off the main thread at the earliest point in the phase this is possible.
 */

import { ipcMain } from './electronStub'
import { requestRustInvoke } from './sidecarRpc'
import {
  RUST_HUMBLE_LOGIN_OPEN,
  RUST_HUMBLE_LOGIN_COOKIES,
  RUST_HUMBLE_LOGIN_TAKE_EVENTS,
  RUST_HUMBLE_LOGIN_CLOSE,
  RUST_HUMBLE_LOGIN_CLEAR_COOKIES
} from '../../common/types/sidecarTransport'
import { HumbleUser } from '../humble/user'
import { standardBrowserUserAgent } from '../humble/userAgent'
import { HumbleLibrary } from '../humble/library'
import {
  setLoginWindowSeam,
  getLoginWindowSeam,
  type LoginWindowSeam,
  type LoginWindowCookie,
  type LoginWindowCookieRead,
  type LoginWindowNavEvent
} from '../humble/loginWindowSeam'
import { logInfo, logWarning, LogPrefix } from '../logger'

/**
 * Routes this module's diagnostics to the SAME file logger every other backend module uses
 * (`~/Library/Logs/GameLib/gamelib.log` on macOS), not to `console.warn`.
 *
 * Why (34.4.1-02 Task 4): the sidecar is a child process whose stdout/stderr is the RPC frame
 * pipe, not a terminal — Phase 33 established that sidecar console output reaches neither
 * `gamelib.log` nor the `tauri:dev` terminal. Every `console.warn` in this module was therefore
 * writing to nowhere, which is the same silent-failure class as the sidecar `send` channels in
 * G-30-01. It also made the A4 smoke gate below unobservable: its first run produced a booted app
 * and zero evidence in either direction, because the only proof it emitted went into the void.
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

/** Coerces one raw cookie entry from a `humble_login_cookies` response into `LoginWindowCookie`. */
function coerceCookie(raw: unknown): LoginWindowCookie {
  const entry = raw as { name?: unknown; domain?: unknown; value?: unknown } | null
  return {
    name: typeof entry?.name === 'string' ? entry.name : '',
    domain: typeof entry?.domain === 'string' ? entry.domain : null,
    value: typeof entry?.value === 'string' ? entry.value : ''
  }
}

/** Coerces one raw navigation event from a `humble_login_take_events` response. */
function coerceNavEvent(raw: unknown): LoginWindowNavEvent {
  const entry = raw as { event?: unknown; url?: unknown } | null
  const event = entry?.event === 'started' || entry?.event === 'finished' ? entry.event : 'finished'
  return {
    event,
    url: typeof entry?.url === 'string' ? entry.url : ''
  }
}

/**
 * Constructs the `rustInvoke`-backed `LoginWindowSeam` implementation. Every method coerces the
 * response into the declared return type and THROWS a descriptive Error on a malformed shape --
 * this is load-bearing, not defensive: `classifyCookieRead` (`loginWindowSeam.ts`) must see
 * `total: null` (the `UNSUPPORTED_OR_ERROR` verdict) rather than a silently coerced zero, or a dead
 * cookie API would misreport as `SUPPORTED_BUT_EMPTY`/`UNDECIDABLE` and defeat the whole point of
 * the discriminator (REQ-34.4.1-13). `cookies()` in particular must never coerce a missing/
 * non-numeric `total` to 0 -- conflating "the read threw" with "the jar is empty" recreates exactly
 * the failure this phase exists to prevent.
 */
export function createRustLoginWindowSeam(): LoginWindowSeam {
  return {
    async open(url, options) {
      const result = await requestRustInvoke(RUST_HUMBLE_LOGIN_OPEN, [
        url,
        options.visible,
        options.userAgent
      ])
      if (typeof result !== 'string' || result.length === 0) {
        throw new Error(
          `humble_login_open: malformed response (expected a non-empty string label): ${JSON.stringify(result)}`
        )
      }
      return result
    },

    async cookies(label, host, names) {
      const result = await requestRustInvoke(RUST_HUMBLE_LOGIN_COOKIES, [
        label,
        host,
        names
      ])
      const record = result as { total?: unknown; matched?: unknown } | null
      if (
        !record ||
        typeof record.total !== 'number' ||
        !Array.isArray(record.matched)
      ) {
        throw new Error(
          `humble_login_cookies: malformed response (missing/non-numeric total, or non-array matched): ${JSON.stringify(result)}`
        )
      }
      const read: LoginWindowCookieRead = {
        total: record.total,
        matched: record.matched.map(coerceCookie)
      }
      return read
    },

    async takeEvents(label) {
      const result = await requestRustInvoke(RUST_HUMBLE_LOGIN_TAKE_EVENTS, [
        label
      ])
      if (!Array.isArray(result)) {
        throw new Error(
          `humble_login_take_events: malformed response (expected an array): ${JSON.stringify(result)}`
        )
      }
      return result.map(coerceNavEvent)
    },

    async close(label) {
      const result = await requestRustInvoke(RUST_HUMBLE_LOGIN_CLOSE, [label])
      if (typeof result !== 'boolean') {
        throw new Error(
          `humble_login_close: malformed response (expected a boolean): ${JSON.stringify(result)}`
        )
      }
      return result
    },

    async clearCookies(label, domain) {
      const result = await requestRustInvoke(RUST_HUMBLE_LOGIN_CLEAR_COOKIES, [
        label,
        domain
      ])
      if (typeof result !== 'number') {
        throw new Error(
          `humble_login_clear_cookies: malformed response (expected a number): ${JSON.stringify(result)}`
        )
      }
      return result
    }
  }
}

/**
 * Registers this module's 6 browser-auth channels and installs the rustInvoke-backed login-window
 * seam. Called once from `handlers.ts` (module scope) -- this module owns no side effects at
 * import time beyond the imports above; the caller decides when registration happens.
 */
export function registerHumbleLoginFlows(): void {
  // T-34.4.1-10: the ONE call site in the repo. Must run before any of the 6 handlers below could
  // possibly be invoked (registration order, not request order, is what matters here -- all 6 are
  // registered synchronously in this same function before it returns).
  setLoginWindowSeam(createRustLoginWindowSeam())

  // ── invoke (4) ──────────────────────────────────────────────────────────────────────────────

  ipcMain.handle('humbleStartLogin', async () => {
    try {
      return await HumbleUser.startLogin()
    } catch (error) {
      console.warn(
        '[humbleLoginFlowRegistration] humbleStartLogin failed:',
        error instanceof Error ? error.message : String(error)
      )
      return { status: 'error' }
    }
  })

  ipcMain.handle('humbleReconnect', async () => {
    try {
      return await HumbleUser.reconnect()
    } catch (error) {
      console.warn(
        '[humbleLoginFlowRegistration] humbleReconnect failed:',
        error instanceof Error ? error.message : String(error)
      )
      return { status: 'error' }
    }
  })

  // Pure -- cannot fail (standardBrowserUserAgent() only string-manipulates
  // app.userAgentFallback), so no try/catch is needed here.
  ipcMain.handle('humbleGetLoginUserAgent', () => standardBrowserUserAgent())

  ipcMain.handle('humbleRevealKey', async (_event: unknown, ...args: unknown[]) => {
    const params = args[0] as { gamekey: string; machineName: string }
    try {
      return await HumbleLibrary.revealKey(params.gamekey, params.machineName)
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
  })

  // ── send (2) ────────────────────────────────────────────────────────────────────────────────

  ipcMain.on('humbleStopLogin', () => {
    void (async () => {
      try {
        HumbleUser.stopLogin()
      } catch (error) {
        logSendFailure('humbleStopLogin', error)
      }
    })()
  })

  ipcMain.on('humbleLoginNavigated', () => {
    void (async () => {
      try {
        HumbleUser.notifyLoginNavigated()
      } catch (error) {
        logSendFailure('humbleLoginNavigated', error)
      }
    })()
  })

  // ── Assumption A4 smoke hook (Task 4, blocking checkpoint) ─────────────────────────────────
  //
  // Inert unless GAMELIB_LOGIN_SEAM_SMOKE is exactly '1'. Fires exactly once at sidecar startup:
  // opens one WebviewWindow on https://example.com (deliberate: no vendor, no cookies, no
  // credentials) through this module's own seam, waits ~2s, closes it. Exercises
  // WebviewWindowBuilder::build() on a thread::spawn'd rustInvoke worker at the earliest point in
  // the phase this is possible (RESEARCH.md Assumptions Log A4). Keep this permanently -- it is
  // the cheapest reproduction harness for any future window-construction regression. Try/catch
  // wraps the whole hook so it can never affect a normal boot.
  if (process.env.GAMELIB_LOGIN_SEAM_SMOKE === '1') {
    // Deferred by one macrotask, and that placement is load-bearing (34.4.1-02 Task 4).
    //
    // `registerHumbleLoginFlows()` runs at MODULE-IMPORT time: `bootstrap.ts` line 40 does a
    // static `import './handlers'`, and `handlers.ts` calls this function at its own module
    // scope. But the sidecar's file logger is not constructed until `initLogger()` inside
    // `bootstrap.ts`'s `init()` (line 133), which `sidecar/index.ts` calls only AFTER every
    // static import has been evaluated. So at this function's module-scope moment,
    // `heroicLogWriter` is still `undefined` and ANY `logInfo`/`logWarning` call here throws
    // `TypeError: Cannot read properties of undefined`. Inside an async IIFE that throw becomes
    // an unhandled rejection, which is swallowed — the gate then produces a booted app and zero
    // evidence in either direction, which is precisely how its first two runs were lost.
    //
    // `init()` is synchronous (`: void`) and calls `initLogger()` as its first statement, so a
    // single `setTimeout(0)` is sufficient and does not race: the whole synchronous
    // import-then-`init()` sequence has completed before this callback fires.
    setTimeout(() => {
      void (async () => {
        // Every branch logs, including both early exits, so "no output" can never again be
        // mistaken for "not run". `smokeLog` additionally falls back to stderr if the logger is
        // somehow still unavailable, so this gate can never be blackholed by its own logging.
        const smokeLog = (message: string, warn = false): void => {
          const line = `[humbleLoginFlowRegistration] GAMELIB_LOGIN_SEAM_SMOKE: ${message}`
          try {
            if (warn) {
              logWarning(line, LogPrefix.Backend)
            } else {
              logInfo(line, LogPrefix.Backend)
            }
          } catch {
            process.stderr.write(`${line}\n`)
          }
        }
        smokeLog('starting')
        try {
          const seam = getLoginWindowSeam()
          if (!seam) {
            smokeLog(
              'no seam installed — aborting (this is a FAIL, not a skip)',
              true
            )
            return
          }
          const label = await seam.open('https://example.com', {
            visible: true,
            userAgent: standardBrowserUserAgent()
          })
          smokeLog(`opened label=${label}`)
          await new Promise((resolve) => setTimeout(resolve, 2000))
          const closed = await seam.close(label)
          smokeLog(`closed=${closed}`)
        } catch (error) {
          smokeLog(
            `failed: ${error instanceof Error ? error.message : String(error)}`,
            true
          )
        }
      })()
    }, 0)
  }
}
