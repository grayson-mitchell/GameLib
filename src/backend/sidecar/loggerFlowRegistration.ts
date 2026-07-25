/**
 * Curated logger channel registration (Phase 34.2 gap cycle 2, plan 34.2-16 —
 * closes verification gap #1 / code-review CR-01 / REQ-34.2-12).
 *
 * `logError` is an `.planning/IPC-PORT-INVENTORY.md` **slice 6 (Phase 34.3)**
 * channel, ported early here because gap cycle 1's renderer repair-failure
 * handler (`onRepairYesClick`'s catch, plan 34.2-08) now routes a real
 * failure through `window.api.logError` — and an unregistered `send` channel
 * is a total, silent no-op under Tauri (`dispatchSend`, `sidecarRpc.ts:138-150`
 * looks up an empty listener array and does nothing: no reject, no timeout,
 * no `UNPORTED_CHANNEL_MARKER`, no console output, no log line — the
 * `sidecar-send-channels-fail-silently` / G-30-01 failure class). Routing a
 * repair failure into that void is strictly worse than the unhandled
 * rejection it replaced.
 *
 * Phase 34.3 (slice 6) must NOT register `logError` a second time.
 * `electronStub.ts`'s `listenerRegistry` holds an ARRAY per channel and
 * `dispatchSend` iterates every listener in it — a second `ipcMain.on`
 * registration for this channel would duplicate every frontend log line, not
 * merely be redundant. Both `.planning/IPC-PORT-INVENTORY.md` and this slice's
 * `34.2-PORTED-CHANNELS.md` record this early port so slice 6's own plan does
 * not re-register it.
 *
 * ONLY `logError` is registered here. The other five channels the Electron-only
 * `ipc_handler.ts` under `src/backend/logger/` also registers (`logInfo`,
 * `getLogContent`, `showLogFileInFolder`, `uploadLogFile`,
 * `deleteUploadedLogFile`, `getUploadedLogFiles`) remain unported, Phase 34.3
 * work — registering any of them here would be an undeclared scope grab.
 *
 * A `send` channel registered with `ipcMain.handle` (or the reverse) fails
 * 100% SILENTLY at runtime (Phase 31 Pitfall 2) — the registration below was
 * cross-checked against that Electron-only handler's own line 15 `addListener`
 * call for this exact channel before being written.
 *
 * Imports `ipcMain` from `./electronStub` (never `electron`, never
 * `backend/ipc`) and never side-effect-imports the Electron-only logger
 * IPC-handler file (D-04): that file also registers five OTHER slice-6
 * channels and pulls in `backend/ipc` -> the real `electron` module, which
 * would prematurely widen this slice's sidecar bundle. `backend/logger`
 * itself is already reachable from the sidecar's import graph
 * (`processGuards.ts` imports `logWarning` from it), so importing
 * `logError`/`LogPrefix` from it here adds no new reach.
 */

import { ipcMain } from './electronStub'
import { logError, LogPrefix } from '../logger'

/**
 * Registers the single `logError` channel. Called once from `handlers.ts` —
 * this module owns no side effects at import time beyond the imports above;
 * the caller decides when registration onto the handler registry happens.
 */
export function registerLoggerFlows(): void {
  // Behavior identical to the Electron-only logger IPC handler's own
  // `addListener('logError', (e, message) => logError(message, LogPrefix.Frontend))`.
  ipcMain.on('logError', (_event: unknown, ...args: unknown[]) => {
    logError(args[0] as string, LogPrefix.Frontend)
  })
}
