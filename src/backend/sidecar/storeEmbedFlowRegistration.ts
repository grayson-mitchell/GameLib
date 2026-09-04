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
 *   invoke (ipcMain.handle, 9):
 *     - `storeEmbedOpen`           -> `createRustStoreEmbedSeam().open()`
 *     - `storeEmbedHide`           -> `createRustStoreEmbedSeam().hide()`
 *     - `storeEmbedShow`           -> `createRustStoreEmbedSeam().show()`
 *     - `storeEmbedClose`          -> `createRustStoreEmbedSeam().close()`
 *     - `storeEmbedTakeNavEvents`  -> `createRustStoreEmbedSeam().takeNavEvents()` (GAP-D, REQ-40-06)
 *     - `storeEmbedBack`           -> `createRustStoreEmbedSeam().back()` (Phase 40 Plan 07, D-22)
 *     - `storeEmbedForward`        -> `createRustStoreEmbedSeam().forward()` (Phase 40 Plan 07, D-22)
 *     - `storeEmbedReload`         -> `createRustStoreEmbedSeam().reload()` (Phase 40 Plan 07, D-22)
 *     - `storeEmbedNavigate`       -> `createRustStoreEmbedSeam().navigate()` (Phase 40 Plan 07, D-22)
 *
 *   send (ipcMain.on, 1):
 *     - `storeEmbedSetBounds` -> `createRustStoreEmbedSeam().setBounds()`
 *
 * D-07-equivalent (fail-safe, never reject): every `handle`-kind body catches and RESOLVES a
 * safe `{ status: 'error', error }` default rather than rejecting
 * (`sidecar-dialog-reject-crashes`). The one `send`-kind body wraps its work in the same
 * `void (async () => {...})()` shape `humbleLoginFlowRegistration.ts` uses, so a listener
 * rejection can never become an unhandled rejection. `back`/`forward`/`reload`/`navigate` carry
 * their resolved navigation state alongside `status` (`{ status: 'ok', navState }`) rather than
 * discarding it — the caller needs the pushed state, not just a success/failure signal.
 *
 * Response-coercion discipline (T-40-05-01): every seam method below reads its `requestRustInvoke`
 * result into a narrowly typed local and THROWS a descriptive Error naming the channel and
 * quoting the raw response on a malformed shape. A silently-coerced default would make a dead
 * Rust channel indistinguishable from a healthy empty one — the F-34.4.2-19 defect class this
 * file's `humbleLoginFlowRegistration.ts` analog exists to prevent one layer up. For
 * `back`/`forward`/`reload`/`navigate` this means a per-field check on the navigation-state
 * shape (`url`/`host` strings, `canGoBack`/`canGoForward` booleans) — a navigation state that
 * silently defaulted to "back unavailable" would make the chrome's back button dead with no
 * signal, indistinguishable from a correctly disabled one.
 *
 * `takeNavEvents` is the drain half of D-22's inversion, live in Rust since quick task
 * `260905-e61` (GAP-D, REQ-40-06). It is the ONLY method here that reports a navigation the
 * PAGE initiated — the four below each report the result of a call the CHROME made — so while
 * it threw a declared-unimplemented Error, clicking a link inside the embed moved Rust's
 * history cursor and the renderer never found out: Back stayed greyed and the host label stayed
 * frozen on the start URL's host. Its response coercion is per-ELEMENT (see `coerceNavEvents`),
 * for the same reason the four below coerce per-field.
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
  RUST_STORE_EMBED_CLOSE,
  RUST_STORE_EMBED_BACK,
  RUST_STORE_EMBED_FORWARD,
  RUST_STORE_EMBED_RELOAD,
  RUST_STORE_EMBED_NAVIGATE,
  RUST_STORE_EMBED_TAKE_NAV_EVENTS
} from '../../common/types/sidecarTransport'
import {
  setStoreEmbedSeam,
  type StoreEmbedSeam,
  type StoreEmbedBounds,
  type StoreEmbedNavEvent
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

/**
 * Coerces a `requestRustInvoke` result into `StoreEmbedNavEvent` with a per-field type check
 * (T-40-05-01, extended for this plan's navigation arms). THROWS a descriptive Error naming the
 * channel and quoting the raw response on any mismatch -- never coerces a default. A navigation
 * state that silently defaulted to "back unavailable" would make the chrome's back button dead
 * with no signal, indistinguishable from a correctly disabled one.
 */
function coerceNavState(channel: string, result: unknown): StoreEmbedNavEvent {
  if (result === null || typeof result !== 'object') {
    throw new Error(
      `${channel}: malformed response (expected an object): ${JSON.stringify(result)}`
    )
  }
  const candidate = result as Record<string, unknown>
  if (typeof candidate.url !== 'string') {
    throw new Error(
      `${channel}: malformed response (url must be a string): ${JSON.stringify(result)}`
    )
  }
  if (typeof candidate.host !== 'string') {
    throw new Error(
      `${channel}: malformed response (host must be a string): ${JSON.stringify(result)}`
    )
  }
  if (typeof candidate.canGoBack !== 'boolean') {
    throw new Error(
      `${channel}: malformed response (canGoBack must be a boolean): ${JSON.stringify(result)}`
    )
  }
  if (typeof candidate.canGoForward !== 'boolean') {
    throw new Error(
      `${channel}: malformed response (canGoForward must be a boolean): ${JSON.stringify(result)}`
    )
  }
  return {
    url: candidate.url,
    host: candidate.host,
    canGoBack: candidate.canGoBack,
    canGoForward: candidate.canGoForward
  }
}

/**
 * The array analog of `coerceNavState()` for `takeNavEvents()` (GAP-D, REQ-40-06). THROWS on a
 * non-array response and delegates every element to the same per-field check.
 *
 * It would be easy to `?? []` a malformed response here and call it fail-safe. That is exactly
 * the F-34.4.2-19 defect class this file's header names: an empty array is this channel's
 * NORMAL, most frequent healthy answer -- the queue is empty whenever the user is not
 * navigating -- so a coerced `[]` would make a dead or mis-shaped Rust arm indistinguishable
 * from a working idle one, forever. The fail-safe boundary belongs at the `ipcMain.handle` arm
 * (which logs first), not here.
 */
function coerceNavEvents(
  channel: string,
  result: unknown
): StoreEmbedNavEvent[] {
  if (!Array.isArray(result)) {
    throw new Error(
      `${channel}: malformed response (expected an array): ${JSON.stringify(result)}`
    )
  }
  return result.map((element, index) =>
    coerceNavState(`${channel}[${index}]`, element)
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
 */
export function createRustStoreEmbedSeam(): StoreEmbedSeam {
  return {
    async open(url, bounds, _storeKey) {
      // `_storeKey` is the caller's own bookkeeping (e.g. 'steam') -- the shipped Rust arm
      // (`store_embed_open_args`, 40-02-SUMMARY.md) takes no such argument, so it never
      // crosses the wire.
      const result = await requestRustInvoke(RUST_STORE_EMBED_OPEN, [
        { url, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
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
          { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
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

    // GAP-D (quick task `260905-e61`, D-22, REQ-40-06): drains the navigation states Rust's
    // `on_page_load` Finished handler queued -- the only channel that carries an IN-EMBED link
    // click back to the renderer. Takes no arguments: the embed is a singleton under the fixed
    // `STORE_EMBED_LABEL`, so there is no label to pass (unlike `humble_login_take_events`).
    async takeNavEvents() {
      const result = await requestRustInvoke(
        RUST_STORE_EMBED_TAKE_NAV_EVENTS,
        []
      )
      return coerceNavEvents('store_embed_take_nav_events', result)
    },

    // Phase 40 Plan 07 (D-22): moves the Rust-side history cursor back one entry and returns the
    // resulting navigation state -- there is no handle to separately query, so this return value
    // IS the read (control inverts: Rust pushes, this seam relays, the renderer never polls).
    async back() {
      const result = await requestRustInvoke(RUST_STORE_EMBED_BACK, [])
      return coerceNavState('store_embed_back', result)
    },

    // The mirror of `back()` -- see its doc comment.
    async forward() {
      const result = await requestRustInvoke(RUST_STORE_EMBED_FORWARD, [])
      return coerceNavState('store_embed_forward', result)
    },

    // Reloads the embed's current page. The returned navigation state's cursor is unchanged --
    // a reload must not move it (the history-stack-DoS mitigation from this plan's threat model).
    async reload() {
      const result = await requestRustInvoke(RUST_STORE_EMBED_RELOAD, [])
      return coerceNavState('store_embed_reload', result)
    },

    // Navigates the embed to `url`, pushing it onto the history stack (truncating any forward
    // entries past the cursor, exactly like a user-initiated navigation) and returning the
    // resulting navigation state.
    async navigate(url) {
      const result = await requestRustInvoke(RUST_STORE_EMBED_NAVIGATE, [
        { url }
      ])
      return coerceNavState('store_embed_navigate', result)
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
 * The navigation-arm analog of `safeStatus()` (Phase 40 Plan 07): resolves
 * `{ status: 'ok', navState }` on success rather than discarding the seam method's return value
 * -- the caller (plan `40-08`'s host) needs the pushed navigation state, not just a
 * success/failure signal. Never rejects, matching `safeStatus()`'s fail-safe discipline.
 */
async function safeNavState(
  label: string,
  action: () => Promise<StoreEmbedNavEvent>
): Promise<
  | { status: 'ok'; navState: StoreEmbedNavEvent }
  | { status: 'error'; error: string }
> {
  try {
    const navState = await action()
    return { status: 'ok', navState }
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

  // ── invoke (9) ──────────────────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'storeEmbedOpen',
    async (_event: unknown, ...args: unknown[]) => {
      const [url, bounds, storeKey] = args as [string, StoreEmbedBounds, string]
      return safeStatus('storeEmbedOpen', () =>
        seam.open(url, bounds, storeKey)
      )
    }
  )

  ipcMain.handle('storeEmbedHide', async () =>
    safeStatus('storeEmbedHide', () => seam.hide())
  )
  ipcMain.handle('storeEmbedShow', async () =>
    safeStatus('storeEmbedShow', () => seam.show())
  )
  ipcMain.handle('storeEmbedClose', async () =>
    safeStatus('storeEmbedClose', () => seam.close())
  )

  // The fail-safe boundary for the drain (GAP-D): `[]` is resolved ONLY here, after the
  // failure has been logged, and never inside `coerceNavEvents` -- see that function's own doc
  // comment. The renderer's poller treats an empty drain as "nothing navigated", which is the
  // correct reading of a logged failure too: leave the last-known chrome state alone.
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

  ipcMain.handle('storeEmbedBack', async () =>
    safeNavState('storeEmbedBack', () => seam.back())
  )
  ipcMain.handle('storeEmbedForward', async () =>
    safeNavState('storeEmbedForward', () => seam.forward())
  )
  ipcMain.handle('storeEmbedReload', async () =>
    safeNavState('storeEmbedReload', () => seam.reload())
  )
  ipcMain.handle(
    'storeEmbedNavigate',
    async (_event: unknown, ...args: unknown[]) => {
      const [url] = args as [string]
      return safeNavState('storeEmbedNavigate', () => seam.navigate(url))
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
