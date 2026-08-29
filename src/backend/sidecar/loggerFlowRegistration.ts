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
 * CORRECTED (Phase 34.2 gap cycle 4, plan 34.2-26 — CR-01). This paragraph
 * previously asserted that `logError(...)`'s declared `void` return type was
 * merely a stale annotation and that "the runtime value is a promise today
 * via `LogWriter#logError` -> `#logBase`". That claim was false, and is the
 * root of CR-01: `backend/logger/index.ts`'s `logError` wrapper is a
 * block-body arrow with no `return` statement, so it evaluates to `undefined`
 * at runtime — the declared `void` type was the type checker correctly
 * reporting the real runtime shape, not a stale artifact. `Promise.resolve
 * (undefined).catch(...)` resolves immediately, so the `.catch` below was
 * unreachable for a real log-write failure the entire time gap cycle 3
 * shipped it.
 *
 * The call site below now imports `logErrorSettled` instead of `logError` —
 * a sibling export (`backend/logger/index.ts`) declared with an EXPRESSION
 * body that actually forwards `heroicLogWriter.logError(...)`'s
 * `Promise<void>`, added specifically so this call site has a real promise
 * to attach `.catch` to. A `try`/`catch` around the call additionally
 * settles the SYNCHRONOUS throw path: a synchronous throw (`heroicLogWriter`
 * still unassigned before `initHeadless()`/`init()` runs — the recorded
 * "heroicLogWriter unset until bootstrap init" gotcha) happens during
 * argument evaluation, before any `Promise.resolve` call is ever reached,
 * and would otherwise land in `dispatchSend`'s synchronous `catch`
 * (`sidecarRpc.ts:137-146`) rather than this handler's own diagnostic. The
 * whole expression is still prefixed with `void` so the listener body
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
 *
 * ---
 *
 * Phase 34.3 plan 04 (REQ-34.3-01/-09/-13) extends this module with this
 * slice's 5 logger channels, each cross-checked against the Electron-only
 * `logger/ipc_handler.ts`'s own `addListener`/`addHandler` call for that
 * exact channel before being written here:
 *
 *   send (`ipcMain.on`):
 *     - `logInfo` -> `logger/ipc_handler.ts:14` (`addListener('logInfo', ...)`)
 *     - `showLogFileInFolder` -> `logger/ipc_handler.ts:22`
 *       (`addListener('showLogFileInFolder', ...)`)
 *
 *   invoke (`ipcMain.handle`):
 *     - `uploadLogFile` -> `logger/ipc_handler.ts:26`
 *       (`addHandler('uploadLogFile', ...)`)
 *     - `deleteUploadedLogFile` -> `logger/ipc_handler.ts:27`
 *       (`addHandler('deleteUploadedLogFile', ...)`)
 *     - `getUploadedLogFiles` -> `logger/ipc_handler.ts:30`
 *       (`addHandler('getUploadedLogFiles', ...)`)
 *
 * `logError` above is registered EXACTLY ONCE in this file (by 34.2-16) —
 * `logInfo` below is its `send`-shape twin, mirroring the same call-site
 * rejection guard shape byte-for-byte (substituting `logInfoSettled` for
 * `logErrorSettled` and `LogPrefix.Frontend` unchanged), for the identical
 * reason: an unregistered `send` channel is a total, silent no-op under
 * Tauri, and a call-site rejection that escapes the listener would
 * otherwise crash the sidecar (T-34.3-14).
 *
 * D-14 (curated-import discipline, inherited unchanged): `uploadLogFile`,
 * `deleteUploadedLogFile`, and `getUploadedLogFiles` are imported directly
 * from `../logger/uploader`, and `getLogFilePath` from `../logger/paths` —
 * NEVER from `logger/ipc_handler.ts`, which also registers the
 * already-ported `getLogContent` (L18) and `logError` (L15). A side-effect
 * import of that file would double-register both (T-34.3-15) and drag
 * `backend/ipc` -> the real `electron` module into this slice's curated
 * sidecar graph.
 *
 * D-08 — `deleteUploadedLogFile` is ported at parity but CANNOT ACTUALLY
 * DELETE ANYTHING IN EITHER BUILD. `logger/uploader.ts:74-77` hardcodes
 * `const token = '1'` with a comment stating dpaste.com does not support
 * deletion and that the option was meant to be hidden. This differs from
 * 34.2 D-07's dead-under-Tauri-only channel: this one is equally dead in
 * both builds, an inherited upstream Heroic defect this port neither
 * introduces nor worsens. Ported faithfully here.
 *
 * CORRECTION (2026-08-22, closing todo `uploaded-log-delete-button-lies`):
 * this note originally claimed the option "never was" hidden and that
 * `UploadedLogFilesList/index.tsx:60` "still wires a live button to this
 * channel". That was WRONG, and was wrong when written — upstream
 * `6ec27795c` (2026-04-20, the very commit that introduced the hardcoded
 * token) also commented the delete `SvgButton` out, three months before
 * this note. Line 60 reads like a live call site but sits INSIDE a JSX
 * comment block. There is no UI path to this channel in either build; it is
 * dead code reachable only from the preload API surface. The invariant is
 * now enforced rather than asserted, by a render-level reachability gate:
 * `UploadedLogFilesList/__tests__/deleteButtonReachability.test.tsx`.
 *
 * D-09 — log redaction is OUT OF SCOPE for this module. `uploadLogFile`
 * sends up to 10 MiB of unredacted log content to a public dpaste with a
 * 2-day expiry, and `src/backend/logger/` performs no redaction anywhere.
 * GameLib adds Steam refresh tokens and revealed Humble key values upstream
 * Heroic never had. The threat is identical in both builds and predates
 * this slice; it is recorded as a standing security todo
 * (T-34.3-13, `34.3-PORTED-CHANNELS.md`). By explicit user instruction, NO
 * AUDIT of whether a token or key value can reach a log line is performed
 * by this plan or this module.
 */

import { ipcMain } from '../platform'
import { logErrorSettled, logInfoSettled, LogPrefix } from '../logger'
import { sanitizeRendererLogMessage } from '../logger/sanitizeRendererLogMessage'
import { getLogFilePath } from '../logger/paths'
import { showItemInFolder } from '../utils'
import {
  uploadLogFile,
  deleteUploadedLogFile,
  getUploadedLogFiles
} from '../logger/uploader'

/**
 * Registers the 6 logger channels (3 invoke: uploadLogFile,
 * deleteUploadedLogFile, getUploadedLogFiles; 3 send: logError, logInfo,
 * showLogFileInFolder). The module began life at `logError` alone -- ported
 * early from slice 6 by plan 34.2-16 -- and grew in Phase 34.3 plan 04; the
 * docstring said "the single `logError` channel" for both of those plans
 * afterwards. Called once from `handlers.ts` —
 * this module owns no side effects at import time beyond the imports above;
 * the caller decides when registration onto the handler registry happens.
 */
export function registerLoggerFlows(): void {
  // Behavior identical to the Electron-only logger IPC handler's own
  // `addListener('logError', (e, message) => logError(message, LogPrefix.Frontend))`,
  // except the call is now guarded at this call site (WR-02/CR-01) rather
  // than left as a floating promise for processGuards.ts to absorb.
  ipcMain.on('logError', (_event: unknown, ...args: unknown[]) => {
    // CR-01: the synchronous throw path (heroicLogWriter still unassigned
    // before initHeadless()/init() runs) happens during argument evaluation
    // of the call below, before Promise.resolve is ever reached -- so it is
    // caught here and converted into a rejection, settled by the same
    // .catch below as the async path.
    let settled: Promise<unknown>
    try {
      settled = Promise.resolve(
        logErrorSettled(
          // IN-04: renderer-controlled text is escaped at THIS trust
          // boundary, never in LogWriter -- see
          // ../logger/sanitizeRendererLogMessage.ts for why the review's
          // writeString/forceLog remedy would have flattened every stack
          // trace in the app.
          sanitizeRendererLogMessage(args[0]),
          LogPrefix.Frontend
        )
      )
    } catch (error: unknown) {
      // The caught value is whatever was thrown during argument evaluation
      // (typically a TypeError, but not guaranteed to be an Error -- the
      // .catch handler below already treats it as `unknown` and safely
      // falls back to String(error) for anything else). Rejecting with the
      // raw value, rather than wrapping it, preserves that exact contract
      // instead of risking a second throw here (String() itself can throw
      // for a null-prototype/hostile reason).
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      settled = Promise.reject(error)
    }
    void settled.catch((error: unknown) => {
      let diagnostic =
        '[loggerFlowRegistration] logError call-site rejection: <unstringifiable reason>'
      try {
        diagnostic = `[loggerFlowRegistration] logError call-site rejection: ${
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error)
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
    })
  })

  // Electron parity source: src/backend/logger/ipc_handler.ts:14
  // addListener('logInfo', (e, message) => logInfo(message, LogPrefix.Frontend))
  //
  // logInfo is logError's send-shape twin (see this module's header
  // docstring) -- the SAME call-site-guard shape, substituting
  // logInfoSettled for logErrorSettled.
  ipcMain.on('logInfo', (_event: unknown, ...args: unknown[]) => {
    // The synchronous throw path (heroicLogWriter still unassigned before
    // initHeadless()/init() runs) happens during argument evaluation of the
    // call below, before Promise.resolve is ever reached -- caught here and
    // converted into a rejection, settled by the same .catch below as the
    // async path.
    let settled: Promise<unknown>
    try {
      settled = Promise.resolve(
        logInfoSettled(
          // IN-04: renderer-controlled text is escaped at THIS trust
          // boundary, never in LogWriter -- see
          // ../logger/sanitizeRendererLogMessage.ts for why the review's
          // writeString/forceLog remedy would have flattened every stack
          // trace in the app.
          sanitizeRendererLogMessage(args[0]),
          LogPrefix.Frontend
        )
      )
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      settled = Promise.reject(error)
    }
    void settled.catch((error: unknown) => {
      let diagnostic =
        '[loggerFlowRegistration] logInfo call-site rejection: <unstringifiable reason>'
      try {
        diagnostic = `[loggerFlowRegistration] logInfo call-site rejection: ${
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error)
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
    })
  })

  // Electron parity source: src/backend/logger/ipc_handler.ts:22-24
  // addListener('showLogFileInFolder', (e, args) => showItemInFolder(getLogFilePath(args)))
  //
  // args[0] is passed WHOLE to getLogFilePath -- it is a GetLogFileArgs
  // object (or undefined for the base Heroic log), not a path string.
  ipcMain.on('showLogFileInFolder', (_event: unknown, ...args: unknown[]) => {
    try {
      showItemInFolder(
        getLogFilePath(args[0] as Parameters<typeof getLogFilePath>[0])
      )
    } catch (error: unknown) {
      let diagnostic =
        '[loggerFlowRegistration] showLogFileInFolder call-site rejection: <unstringifiable reason>'
      try {
        diagnostic = `[loggerFlowRegistration] showLogFileInFolder call-site rejection: ${
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error)
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
  })

  // Electron parity source: src/backend/logger/ipc_handler.ts:26
  // addHandler('uploadLogFile', async (e, name, args) => uploadLogFile(name, args))
  //
  // No try/catch here that would swallow the rejection: the frontend owns
  // the "upload failed" state, and LogFileUploadDialog expects the invoke
  // to reject on failure (the Phase 20 D-14 convention).
  ipcMain.handle('uploadLogFile', async (_event: unknown, ...args: unknown[]) =>
    uploadLogFile(
      args[0] as string,
      args[1] as Parameters<typeof getLogFilePath>[0]
    )
  )

  // Electron parity source: src/backend/logger/ipc_handler.ts:27
  //
  // D-08 (see this module's header docstring): ported faithfully. This
  // channel cannot actually delete anything in either build --
  // logger/uploader.ts:74-77 hardcodes token = '1'. Do NOT fix, guard, or
  // work around that here.
  ipcMain.handle(
    'deleteUploadedLogFile',
    async (_event: unknown, ...args: unknown[]) =>
      deleteUploadedLogFile(args[0] as string)
  )

  // Electron parity source: src/backend/logger/ipc_handler.ts:30
  //
  // getUploadedLogFiles's expiry-pruning side effect (a read channel that
  // mutates the store) is preserved -- Electron parity, and it is what
  // frontend/state/UploadedLogFiles.ts reads at module scope.
  ipcMain.handle('getUploadedLogFiles', async () => getUploadedLogFiles())
}
