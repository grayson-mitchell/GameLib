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
 *
 * WR-02 (Phase 34.2 gap cycle 3, plan 34.2-20 — closes REQ-34.2-12/-14): the
 * `logError(...)` call below used to be neither `await`ed nor `.catch()`'d.
 * `LogWriter#logBase` (`backend/logger/log_writer.ts:131`) is `private
 * async` and performs `fsPromises.appendFile`/`mkdir`, so a real log-write
 * failure (EACCES, ENOSPC, a deleted log directory) became a process-level
 * `unhandledRejection`. `dispatchSend`'s `try`/`catch` (`sidecarRpc.ts:137-
 * 146`) is synchronous and cannot see an async rejection surfacing after the
 * listener body returns.
 *
 * It survived only because `processGuards.ts` absorbed it — which directly
 * violates that module's own documented invariant (its docstring, lines
 * 10-14): it "is explicitly NOT a substitute for call-site
 * `.catch()`/`try`/`catch` handling — every `send`-kind body and every
 * fire-and-forget call the sidecar owns must still guard itself." The fix
 * below restores that invariant: the rejection is now settled AT THIS CALL
 * SITE, with its own module-attributed stderr diagnostic (distinct from
 * `processGuards.ts`'s generic `[sidecar] unhandled promise rejection:`
 * prefix, precisely so a real failure here is no longer generic). The
 * process guard remains installed as pure defence-in-depth — it is simply no
 * longer the primary (and, before this fix, only) handler for this channel.
 *
 * `logError(...)`'s return value is normalised via `Promise.resolve(...)`
 * before `.catch` is attached: the declared TypeScript return type is `void`
 * (see `logError` in `backend/logger/index.ts`), but the runtime value is a
 * promise today via `LogWriter#logError` -> `#logBase`. `Promise.resolve`
 * makes the guard correct either way without depending on that runtime
 * shape. The whole expression is prefixed with `void` so the listener body
 * itself stays synchronous and returns `undefined`, preserving `ipcMain.on`
 * / `dispatchSend`'s listener contract.
 *
 * The `.catch` handler mirrors `processGuards.ts`'s own documented
 * discipline exactly (governed by this project's recorded
 * `sidecar-dialog-reject-crashes` incident: a "fix" that introduces a NEW
 * throw/reject/exit path is worse than the bug it fixes):
 *   - Message construction: a `let` is initialised to a hardcoded,
 *     non-interpolated fallback literal BEFORE its own `try`, then
 *     reassigned inside that `try` via `error instanceof Error ? ... :
 *     String(error)` (the plan 34.2-15 / CR-02 shape — a bare `${error}`
 *     interpolation of an `unknown` value is exactly the defect WR-03 flags
 *     elsewhere in this same gap cycle).
 *   - The diagnostic is written to `process.stderr` only, NEVER the sidecar's
 *     stdout stream — that stream carries the newline-delimited JSON RPC
 *     frame protocol, and any non-frame byte written there corrupts the
 *     transport. The write itself is wrapped in its own `try`/`catch` that
 *     swallows, so this handler can never become a new throw path.
 *   - Never rethrows, never calls `process.exit`, never changes the exit
 *     code.
 *
 * The type assertion that used to narrow the frontend's message argument to
 * a string has been dropped (review finding IN-05). The declared
 * transport contract (`src/common/types/ipc.ts:106`) is
 * `logError: (message: unknown) => void`, and `LogWriter#logError` already
 * accepts `unknown` — the assertion claimed a guarantee the transport never
 * made, and a malformed frame with an empty `args` array previously yielded
 * a silently-asserted `undefined`-as-string.
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
  // `addListener('logError', (e, message) => logError(message, LogPrefix.Frontend))`,
  // except the call is now guarded at this call site (WR-02) rather than
  // left as a floating promise for processGuards.ts to absorb.
  ipcMain.on('logError', (_event: unknown, ...args: unknown[]) => {
    void Promise.resolve(logError(args[0], LogPrefix.Frontend)).catch(
      (error: unknown) => {
        let diagnostic =
          '[loggerFlowRegistration] logError call-site rejection: <unstringifiable reason>'
        try {
          diagnostic = `[loggerFlowRegistration] logError call-site rejection: ${
            error instanceof Error ? (error.stack ?? error.message) : String(error)
          }`
        } catch {
          // keep the hardcoded fallback
        }
        try {
          process.stderr.write(`${diagnostic}\n`)
        } catch {
          // Nothing further we can safely do -- swallow. Never re-throw,
          // never exit, never write to stdout (RPC frame transport).
        }
      }
    )
  })
}
