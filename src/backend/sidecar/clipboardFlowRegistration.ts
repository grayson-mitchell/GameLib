/**
 * Curated clipboard channel registration (Phase 34.3 Plan 06, D-01/D-02/D-03/D-04,
 * REQ-34.3-03/REQ-34.3-04/REQ-34.3-13).
 *
 * Registers the 2 clipboard channels onto platformApi's `ipcMain` recorder. These are the
 * ONLY consumers of the two new `dispatch_rust_channel` arms this slice adds
 * (`clipboard_write_text`/`clipboard_read_text`, Plan 03) — kept in this dedicated module
 * (rather than folded into `shellFilesFlowRegistration.ts`) specifically so the claim "this
 * slice adds exactly two new Rust arms, used by exactly three channels" stays auditable from
 * one file:
 *
 *   send (ipcMain.on, 1):
 *     - `clipboardWriteText` -> `platformApi`'s `deps.appState.writeClipboardText(text)`, itself a real
 *       fire-and-forget forward to `RUST_CLIPBOARD_WRITE_TEXT` (Plan 05, `main.ts:1427`)
 *     - `copySystemInfoToClipboard` is no longer registered here: since Phase 88.1 (88.1-10, D-19) it is a
 *       native `info` send of the Rust router, which reads the cached system information, formats it and
 *       writes the clipboard itself (`nativeChannels.json`).
 *
 *   invoke (ipcMain.handle, 1):
 *     - `clipboardReadText` -> awaits `requestRustInvoke(RUST_CLIPBOARD_READ_TEXT, [])`
 *       DIRECTLY in this module's own handler — D-04: `platformApi.clipboard.readText()` is
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
 * `abort`/`getSystemInfo`/`hasExecutable` (all already ported elsewhere) at
 * import time, and a side-effect import would double-register all three (`dispatchSend`/
 * `dispatchInvoke` iterate/hold every registered listener/handler for a channel, so a
 * duplicate registration duplicates every frontend call or breaks the single-registration
 * assumption other code relies on). Since 88.1-18 the TS system-information tree is deleted and the
 * Rust `info` slice owns the whole of it.
 *
 * D-03: `clipboardWriteText`'s registration below only calls `deps.appState.writeClipboardText(...)` — that
 * member is ITSELF the fire-and-forget, log-only Rust forward (Plan 05). This registration's
 * own try/catch guards only a synchronous throw at the call site (there is none today, since
 * `clipboard.writeText` never throws synchronously — kept anyway as the same defensive shape
 * every other `send` registration in this codebase uses) and must never itself try to await or
 * surface the underlying transport failure, since real Electron's `clipboard.writeText` is
 * `void` and cannot surface failure either.
 */

import type { GlobalConfigSlice } from '../config'
import type { AppInfo } from '../process/context'
import type { IpcRegistry } from './ipcRegistry'
import type { AppState } from '../host/appState'
import type { RequestRustInvoke } from '../host'
import { RUST_CLIPBOARD_READ_TEXT } from '../../common/types/sidecarTransport'
import type { BootServices, StoreManagers } from '../services/types'

function logSendFailure(channel: string, error: unknown): void {
  console.warn(
    `[clipboardFlowRegistration] ${channel} failed:`,
    error instanceof Error ? error.message : String(error)
  )
}

/** Slice the clipboard flows need: the runner managers the system-info probes ask. */
export interface ClipboardFlowDeps {
  ipc: Pick<IpcRegistry, 'handle' | 'on'>
  appState: Pick<AppState, 'writeClipboardText'>
  /** The boot's sidecar -> Rust request leg (66.4-15). */
  requestRustInvoke: RequestRustInvoke
  config: Pick<GlobalConfigSlice, 'getSettings'>
  appInfo: Pick<AppInfo, 'version'>
  managers: Pick<StoreManagers, 'library'>
  paths: Pick<BootServices['paths'], 'publicDir'>
  /** The boot process runner (66.2); consumers converted by 66.2-05. */
  runner: BootServices['runner']
}

/**
 * Registers this module's 2 clipboard channels. Called once from `handlers.ts` — this module
 * owns no side effects at import time beyond the imports above; the caller decides when
 * registration onto the handler registry happens.
 */
export function registerClipboardFlows(deps: ClipboardFlowDeps): void {
  // ── send (1): clipboardWriteText — main.ts:1427's addListener('clipboardWriteText', (e,
  // text) => deps.appState.writeClipboardText(text)). deps.appState.writeClipboardText() is ITSELF the real
  // fire-and-forget Rust forward (Plan 05) — this try/catch guards only a synchronous throw
  // at the call site, never the underlying transport failure (D-03) ──────────────────────────

  deps.ipc.on('clipboardWriteText', (_event: unknown, ...args: unknown[]) => {
    try {
      deps.appState.writeClipboardText(args[0] as string)
    } catch (error) {
      logSendFailure('clipboardWriteText', error)
    }
  })

  // ── invoke (1): clipboardReadText — D-04: awaits Rust DIRECTLY, bypassing the sync,
  // deliberately-dead platformApi.clipboard.readText() stub. On rejection or a non-string
  // result, resolves '' rather than rejecting — SIDLogin/index.tsx:137 consumes the value
  // directly and must never see an unhandled rejection ───────────────────────────────────────

  deps.ipc.handle('clipboardReadText', async () => {
    try {
      const text = await deps.requestRustInvoke(RUST_CLIPBOARD_READ_TEXT, [])
      return typeof text === 'string' ? text : ''
    } catch (error) {
      console.warn(
        '[clipboardFlowRegistration] clipboardReadText failed:',
        error
      )
      return ''
    }
  })
}
