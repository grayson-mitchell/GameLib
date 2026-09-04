/**
 * Curated store-embed channel registration (Phase 40 Plan 05, D-01/D-17/D-18/D-21/D-22/D-25/
 * D-29, REQ-40-02/REQ-40-05).
 *
 * Registers the store-embed channels onto the sidecar's `ipcMain` recorder and installs a
 * `rustInvoke`-backed implementation of `StoreEmbedSeam` (`backend/store/storeEmbedSeam.ts`) at
 * sidecar startup. This is the ONLY module that constructs that implementation and the ONLY call
 * site of `setStoreEmbedSeam()` in the whole repo — mirrors `humbleLoginFlowRegistration.ts`'s
 * own `setLoginWindowSeam()` discipline.
 *
 * Channel kinds (cross-checked against `src/preload/api/storeEmbed.ts` — a send-versus-handle
 * mismatch fails 100% SILENTLY at runtime, no reject, no timeout, no console line):
 *
 *   invoke (ipcMain.handle, 8):
 *     - `storeEmbedOpen`           -> `createRustStoreEmbedSeam().open()`
 *     - `storeEmbedHide`           -> `createRustStoreEmbedSeam().hide()`
 *     - `storeEmbedShow`           -> `createRustStoreEmbedSeam().show()`
 *     - `storeEmbedClose`          -> `createRustStoreEmbedSeam().close()`
 *     - `storeEmbedTakeNavEvents`  -> `createRustStoreEmbedSeam().takeNavEvents()` (unimplemented)
 *     - `storeEmbedBack`           -> `createRustStoreEmbedSeam().back()` (unimplemented, owner 40-07)
 *     - `storeEmbedForward`        -> `createRustStoreEmbedSeam().forward()` (unimplemented, owner 40-07)
 *     - `storeEmbedReload`         -> `createRustStoreEmbedSeam().reload()` (unimplemented, owner 40-07)
 *     - `storeEmbedNavigate`       -> `createRustStoreEmbedSeam().navigate()` (unimplemented, owner 40-07)
 *
 *   send (ipcMain.on, 1):
 *     - `storeEmbedSetBounds` -> `createRustStoreEmbedSeam().setBounds()`
 *
 * D-07-equivalent (fail-safe, never reject): every `handle`-kind body catches and RESOLVES a
 * safe `{ status: 'error', error }` default rather than rejecting
 * (`sidecar-dialog-reject-crashes`). The one `send`-kind body wraps its work in the same
 * `void (async () => {...})()` shape `humbleLoginFlowRegistration.ts` uses, so a listener
 * rejection can never become an unhandled rejection.
 *
 * Response-coercion discipline (T-40-05-01): every seam method below reads its `requestRustInvoke`
 * result into a narrowly typed local and THROWS a descriptive Error naming the channel and
 * quoting the raw response on a malformed shape. A silently-coerced default would make a dead
 * Rust channel indistinguishable from a healthy empty one — the F-34.4.2-19 defect class this
 * file's `humbleLoginFlowRegistration.ts` analog exists to prevent one layer up.
 *
 * `back`/`forward`/`reload`/`navigate`/`takeNavEvents` throw a declared-unimplemented Error
 * naming plan `40-07` as owner — no Rust arm exists yet for any of the five (D-25: no native
 * back/forward/history API on `tauri::webview::Webview` or `wry::WebView`,
 * `40-EMBED-API-VERIFICATION.md` Q1/Q2). Never stubbed as no-ops, never a plausible default.
 *
 * Geometry courier discipline (T-40-05-04, D-18/D-29): `setBounds()` validates every coordinate
 * is a finite number and THROWS rather than substituting one — a substituted rect is a second
 * geometry writer in disguise, and spike 017 proved a second writer wins silently with no error.
 *
 * Curated-import discipline (inherited from Phase 30 D-08 -> ... -> Phase 34.4 D-14, restated by
 * `humbleLoginFlowRegistration.ts`): import `ipcMain` from `../platform`, `requestRustInvoke`
 * from `./sidecarRpc`, and named constants from `../../common/types/sidecarTransport` only.
 * Never import a store runner's own `ipc_handler.ts` — that is the double-registration hazard
 * those files' own doc comments warn about. This module has no such analog to avoid, since the
 * store embed has no pre-existing Electron-era `ipc_handler.ts` of its own.
 */

import { ipcMain } from '../platform'
import { requestRustInvoke } from './sidecarRpc'
import {
  RUST_STORE_EMBED_OPEN,
  RUST_STORE_EMBED_SET_BOUNDS,
  RUST_STORE_EMBED_HIDE,
  RUST_STORE_EMBED_SHOW,
  RUST_STORE_EMBED_CLOSE
  // RUST_STORE_EMBED_TAKE_NAV_EVENTS / _BACK / _FORWARD / _RELOAD / _NAVIGATE are declared in
  // sidecarTransport.ts for plan `40-07` to import when it implements those arms -- this file's
  // takeNavEvents()/back()/forward()/reload()/navigate() throw declared-unimplemented Errors
  // WITHOUT calling requestRustInvoke, so importing those five constants here would be dead
  // weight (and a `no-unused-vars` lint error). Deliberately not imported.
} from '../../common/types/sidecarTransport'
import {
  setStoreEmbedSeam,
  type StoreEmbedSeam,
  type StoreEmbedBounds
} from '../store/storeEmbedSeam'
import { logWarning, LogPrefix } from '../logger'

/** Routes this module's send-arm failures to the shared file logger (mirrors `humbleLoginFlowRegistration.ts`'s `logSendFailure`). */
function logSendFailure(channel: string, error: unknown): void {
  logWarning(
    [
      `[storeEmbedFlowRegistration] ${channel} failed:`,
      error instanceof Error ? error.message : String(error)
    ],
    LogPrefix.Backend
  )
}

/** A single method name this file names in every declared-unimplemented Error message. */
const NAV_OWNER_PLAN = '40-07'

/** Builds a declared-unimplemented Error naming `40-07` as owner (T-40-05-01/D-25). */
function unimplementedError(method: string): Error {
  return new Error(
    `StoreEmbedSeam.${method}(): not yet implemented -- no Rust arm exists (plan ${NAV_OWNER_PLAN} ` +
      'owns it, D-25: no native back/forward/history API exists on tauri::webview::Webview or ' +
      'wry::WebView). This is a declared gap, not a bug -- never stub this as a no-op or a ' +
      'plausible default.'
  )
}

/**
 * Validates a bounds rect field-for-field is a finite number (D-18/D-29/T-40-05-04). Throws
 * rather than substituting a value -- a substituted rect is a second geometry writer in
 * disguise, and spike 017 proved a second writer wins silently with no error.
 */
function assertFiniteBounds(bounds: StoreEmbedBounds): void {
  for (const key of ['x', 'y', 'w', 'h'] as const) {
    const value = bounds[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(
        `store_embed_set_bounds: bounds.${key} must be a finite number, received ${JSON.stringify(value)}`
      )
    }
  }
}

/**
 * Constructs the `rustInvoke`-backed `StoreEmbedSeam` implementation. Every method that calls
 * a live Rust arm coerces the response into the declared return type and THROWS a descriptive
 * Error on a malformed shape -- load-bearing, not defensive (see this file's own header comment).
 * The five methods with no backing Rust arm throw a declared-unimplemented Error naming `40-07`.
 */
export function createRustStoreEmbedSeam(): StoreEmbedSeam {
  return {
    async open(url, bounds, _storeKey) {
      // `_storeKey` is the caller's own bookkeeping (e.g. 'steam') -- the shipped Rust arm
      // (`store_embed_open_args`, 40-02-SUMMARY.md) takes no such argument, so it never
      // crosses the wire.
      const result = await requestRustInvoke(RUST_STORE_EMBED_OPEN, [
        url,
        bounds.x,
        bounds.y,
        bounds.w,
        bounds.h
      ])
      if (result !== null) {
        throw new Error(
          `store_embed_open: malformed response (expected null): ${JSON.stringify(result)}`
        )
      }
    },

    setBounds(bounds) {
      assertFiniteBounds(bounds)
      // Fire-and-forget from the interface's perspective (D-29) -- the returned promise is not
      // part of the public contract, but IS awaited by this file's `ipcMain.on` arm below so a
      // malformed response is still observable rather than silently swallowed.
      return (async () => {
        const result = await requestRustInvoke(RUST_STORE_EMBED_SET_BOUNDS, [
          bounds.x,
          bounds.y,
          bounds.w,
          bounds.h
        ])
        if (result !== null) {
          throw new Error(
            `store_embed_set_bounds: malformed response (expected null): ${JSON.stringify(result)}`
          )
        }
      })() as unknown as void
    },

    async hide() {
      const result = await requestRustInvoke(RUST_STORE_EMBED_HIDE, [])
      if (result !== null) {
        throw new Error(
          `store_embed_hide: malformed response (expected null): ${JSON.stringify(result)}`
        )
      }
    },

    async show() {
      const result = await requestRustInvoke(RUST_STORE_EMBED_SHOW, [])
      if (result !== null) {
        throw new Error(
          `store_embed_show: malformed response (expected null): ${JSON.stringify(result)}`
        )
      }
    },

    async close() {
      const result = await requestRustInvoke(RUST_STORE_EMBED_CLOSE, [])
      if (result !== null) {
        throw new Error(
          `store_embed_close: malformed response (expected null): ${JSON.stringify(result)}`
        )
      }
    },

    // NOT YET IMPLEMENTED (plan 40-07, D-25/D-22) -- no Rust arm exists for
    // RUST_STORE_EMBED_TAKE_NAV_EVENTS yet. Declared-unimplemented, matching the treatment of
    // back/forward/reload/navigate below, rather than resolving a plausible-looking `[]`, which
    // would be indistinguishable from "genuinely no queued events".
    // eslint-disable-next-line @typescript-eslint/require-await -- interface requires Promise<T>; throws synchronously by design, matching back()/forward()/reload()/navigate() below
    async takeNavEvents() {
      throw unimplementedError('takeNavEvents')
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async back() {
      throw unimplementedError('back')
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async forward() {
      throw unimplementedError('forward')
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async reload() {
      throw unimplementedError('reload')
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async navigate(_url) {
      throw unimplementedError('navigate')
    }
  }
}

/**
 * Shared handle-arm wrapper: resolves `{ status: 'ok' }` on success, `{ status: 'error', error }`
 * on any throw -- never rejects (fail-safe discipline, T-40-05-03).
 *
 * Uses `console.warn`, NOT the file logger, mirroring `humbleLoginFlowRegistration.ts`'s own
 * `ipcMain.handle` catch bodies (its `logSendFailure`/`logWarning` helper is reserved for
 * `ipcMain.on` send arms only, which have no return-value channel to report a failure through).
 * `logWarning` calls `heroicLogWriter.logWarning(...)`, and `heroicLogWriter` is not constructed
 * until `bootstrap.ts`'s `initLogger()` runs -- calling it earlier (or in a Jest suite that never
 * boots the sidecar) throws `TypeError: Cannot read properties of undefined`, which would turn a
 * benign handle-arm failure into a SECOND, unrelated crash.
 */
async function safeStatus(
  label: string,
  action: () => Promise<void>
): Promise<{ status: 'ok' | 'error'; error?: string }> {
  try {
    await action()
    return { status: 'ok' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[storeEmbedFlowRegistration] ${label} failed:`, message)
    return { status: 'error', error: message }
  }
}

/**
 * Registers this module's 10 channels (9 invoke, 1 send) and installs the `rustInvoke`-backed
 * seam. EXACTLY ONE call site of `setStoreEmbedSeam()` in the whole repo -- must run before any
 * of the arms below could possibly be invoked (registration order, not request order, is what
 * matters here -- all arms are registered synchronously in this same function before it returns).
 */
export function registerStoreEmbedFlows(): void {
  const seam = createRustStoreEmbedSeam()
  setStoreEmbedSeam(seam)

  // ── invoke (8) ──────────────────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'storeEmbedOpen',
    async (_event: unknown, ...args: unknown[]) => {
      const [url, bounds, storeKey] = args as [
        string,
        StoreEmbedBounds,
        string
      ]
      return safeStatus('storeEmbedOpen', () => seam.open(url, bounds, storeKey))
    }
  )

  ipcMain.handle('storeEmbedHide', async () => safeStatus('storeEmbedHide', () => seam.hide()))
  ipcMain.handle('storeEmbedShow', async () => safeStatus('storeEmbedShow', () => seam.show()))
  ipcMain.handle('storeEmbedClose', async () =>
    safeStatus('storeEmbedClose', () => seam.close())
  )

  ipcMain.handle('storeEmbedTakeNavEvents', async () => {
    try {
      return await seam.takeNavEvents()
    } catch (error) {
      console.warn(
        '[storeEmbedFlowRegistration] storeEmbedTakeNavEvents failed:',
        error instanceof Error ? error.message : String(error)
      )
      return []
    }
  })

  ipcMain.handle('storeEmbedBack', async () => safeStatus('storeEmbedBack', () => seam.back()))
  ipcMain.handle('storeEmbedForward', async () =>
    safeStatus('storeEmbedForward', () => seam.forward())
  )
  ipcMain.handle('storeEmbedReload', async () =>
    safeStatus('storeEmbedReload', () => seam.reload())
  )
  ipcMain.handle(
    'storeEmbedNavigate',
    async (_event: unknown, ...args: unknown[]) => {
      const [url] = args as [string]
      return safeStatus('storeEmbedNavigate', () => seam.navigate(url))
    }
  )

  // ── send (1) ────────────────────────────────────────────────────────────────────────────────

  ipcMain.on('storeEmbedSetBounds', (_event: unknown, ...args: unknown[]) => {
    void (async () => {
      try {
        const [bounds] = args as [StoreEmbedBounds]
        await (seam.setBounds(bounds) as unknown as Promise<void>)
      } catch (error) {
        logSendFailure('storeEmbedSetBounds', error)
      }
    })()
  })
}
