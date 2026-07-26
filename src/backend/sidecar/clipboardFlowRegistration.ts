/**
 * Curated clipboard channel registration (Phase 34.3 Plan 06, D-01/D-02/D-03/D-04,
 * REQ-34.3-03/REQ-34.3-04/REQ-34.3-13).
 *
 * Registers the 3 clipboard channels onto electronStub's `ipcMain` recorder. These are the
 * ONLY consumers of the two new `dispatch_rust_channel` arms this slice adds
 * (`clipboard_write_text`/`clipboard_read_text`, Plan 03) — kept in this dedicated module
 * (rather than folded into `shellFilesFlowRegistration.ts`) specifically so the claim "this
 * slice adds exactly two new Rust arms, used by exactly three channels" stays auditable from
 * one file:
 *
 *   send (ipcMain.on, 2):
 *     - `clipboardWriteText` -> `electronStub`'s `clipboard.writeText(text)`, itself a real
 *       fire-and-forget forward to `RUST_CLIPBOARD_WRITE_TEXT` (Plan 05, `main.ts:1427`)
 *     - `copySystemInfoToClipboard` -> `utils/systeminfo`'s `getSystemInfo()` +
 *       `formatSystemInfo()`, then `clipboard.writeText(formatted)`
 *       (`utils/ipc_handler.ts:23-27`)
 *
 *   invoke (ipcMain.handle, 1):
 *     - `clipboardReadText` -> awaits `requestRustInvoke(RUST_CLIPBOARD_READ_TEXT, [])`
 *       DIRECTLY in this module's own handler — D-04: `electronStub.clipboard.readText()` is
 *       synchronous and structurally cannot await a Rust round-trip, so this channel bypasses
 *       that stub entirely rather than calling it (`main.ts:1425`). On rejection or a
 *       non-string result, resolves `''` rather than rejecting — the same degraded-but-safe
 *       value an empty clipboard would also produce — because `SIDLogin/index.tsx:137`
 *       consumes the value directly and must never see an unhandled rejection.
 *
 * A `send` channel registered with `ipcMain.handle` (or the reverse) fails 100% SILENTLY at
 * runtime — no reject, no timeout, no console line (Phase 31 Pitfall 2, and the
 * `sidecar-send-channels-fail-silently` project memory). Both registrations below were
 * cross-checked against `main.ts`'s own `addHandler`/`addListener` call for that exact channel
 * before being written.
 *
 * D-14 (curated-import discipline, inherited from Phase 30 D-08 -> 34.1 D-09 -> 34.2 D-04):
 * import the UNDERLYING module, never a feature module's `ipc_handler.ts`. This module
 * deliberately does NOT import `utils/ipc_handler.ts`, even though `copySystemInfoToClipboard`'s
 * real body lives there (`utils/ipc_handler.ts:23-27`) — that file ALSO registers
 * `abort`/`getSystemInfo`/`hasExecutable`/`isIntelMac` (all already ported elsewhere) at
 * import time, and a side-effect import would double-register all four (`dispatchSend`/
 * `dispatchInvoke` iterate/hold every registered listener/handler for a channel, so a
 * duplicate registration duplicates every frontend call or breaks the single-registration
 * assumption other code relies on). `getSystemInfo`/`formatSystemInfo` are imported directly
 * from `../utils/systeminfo` instead, whose clean export this module relies on unchanged.
 *
 * D-03: `clipboardWriteText`'s registration below only calls `clipboard.writeText(...)` — that
 * member is ITSELF the fire-and-forget, log-only Rust forward (Plan 05). This registration's
 * own try/catch guards only a synchronous throw at the call site (there is none today, since
 * `clipboard.writeText` never throws synchronously — kept anyway as the same defensive shape
 * every other `send` registration in this codebase uses) and must never itself try to await or
 * surface the underlying transport failure, since real Electron's `clipboard.writeText` is
 * `void` and cannot surface failure either.
 */

import { ipcMain, clipboard } from './electronStub'
import { requestRustInvoke } from './sidecarRpc'
import { RUST_CLIPBOARD_READ_TEXT } from '../../common/types/sidecarTransport'
import { getSystemInfo, formatSystemInfo } from '../utils/systeminfo'

function logSendFailure(channel: string, error: unknown): void {
  console.warn(
    `[clipboardFlowRegistration] ${channel} failed:`,
    error instanceof Error ? error.message : String(error)
  )
}

/**
 * Registers this module's 3 clipboard channels. Called once from `handlers.ts` — this module
 * owns no side effects at import time beyond the imports above; the caller decides when
 * registration onto the handler registry happens.
 */
export function registerClipboardFlows(): void {
  // ── send (1): clipboardWriteText — main.ts:1427's addListener('clipboardWriteText', (e,
  // text) => clipboard.writeText(text)). clipboard.writeText() is ITSELF the real
  // fire-and-forget Rust forward (Plan 05) — this try/catch guards only a synchronous throw
  // at the call site, never the underlying transport failure (D-03) ──────────────────────────

  ipcMain.on('clipboardWriteText', (_event: unknown, ...args: unknown[]) => {
    try {
      clipboard.writeText(args[0] as string)
    } catch (error) {
      logSendFailure('clipboardWriteText', error)
    }
  })

  // ── invoke (1): clipboardReadText — D-04: awaits Rust DIRECTLY, bypassing the sync,
  // deliberately-dead electronStub.clipboard.readText() stub. On rejection or a non-string
  // result, resolves '' rather than rejecting — SIDLogin/index.tsx:137 consumes the value
  // directly and must never see an unhandled rejection ───────────────────────────────────────

  ipcMain.handle('clipboardReadText', async () => {
    try {
      const text = await requestRustInvoke(RUST_CLIPBOARD_READ_TEXT, [])
      return typeof text === 'string' ? text : ''
    } catch (error) {
      console.warn(
        '[clipboardFlowRegistration] clipboardReadText failed:',
        error
      )
      return ''
    }
  })

  // ── send (1): copySystemInfoToClipboard — utils/ipc_handler.ts:23-27's exact body,
  // curated-imported (D-14) from utils/systeminfo directly rather than side-effect-importing
  // utils/ipc_handler.ts. Wrapped in an async IIFE (`void (async () => {...})()`) because
  // ipcMain.on listeners are invoked synchronously and discard their return value — an async
  // listener's own rejection would otherwise be an unhandled rejection ───────────────────────

  ipcMain.on('copySystemInfoToClipboard', () => {
    void (async () => {
      try {
        const info = await getSystemInfo()
        const formatted = await formatSystemInfo(info)
        clipboard.writeText(formatted)
      } catch (error) {
        logSendFailure('copySystemInfoToClipboard', error)
      }
    })()
  })
}
