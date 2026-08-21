/**
 * Sidecar process-level guards (Phase 34.2 Plan 09 — REQ-34.2-07 / CR-02 / T-34.2-39/40/41).
 *
 * The sidecar owns several `void`-ed fire-and-forget async calls (e.g. `send`-kind IPC
 * bodies in `gameDetailsFlowRegistration.ts`/`appShellFlowRegistration.ts`), and on
 * Node >= 15 the process-wide default is `--unhandled-rejections=throw` — a single
 * rejected promise with no attached handler kills the entire backend process. This module
 * installs a log-only, process-level `unhandledRejection` listener as DEFENCE-IN-DEPTH.
 *
 * It is explicitly NOT a substitute for call-site `.catch()`/`try`/`catch` handling — every
 * `send`-kind body and every fire-and-forget call the sidecar owns must still guard itself
 * (see `bootstrap.ts`'s Block A `.catch()` for the primary fix this guard backs up). This
 * guard exists only to make sure that if a call site is ever missed, the failure mode is a
 * logged warning, not a process crash.
 *
 * CRITICAL — governed by this project's recorded `sidecar-dialog-reject-crashes` incident:
 * a "fix" that introduces a NEW throw/reject/exit path is worse than the bug it fixes,
 * because sidecar callers routinely `await`/fire-and-forget with no `try`/`catch` and (until
 * this module) no process-level guard existed at all. This guard must NEVER re-throw, NEVER
 * terminate the process, and NEVER change the exit code — it only logs and returns.
 *
 * BOTH halves of the listener body are individually wrapped in their own `try`/`catch`, not
 * just the logging call (Phase 34.2 gap cycle 2, CR-02 regression — gap cycle 1's own claim
 * that "its own logging is wrapped in a try/catch" was FALSE: the message-construction step
 * that ran `String(reason)` sat OUTSIDE that try, so a rejection reason with a null prototype
 * or a throwing/absent `toString`/`Symbol.toPrimitive` made the listener itself throw, which
 * Node escalates into an uncaught exception and kills the process — the exact crash class this
 * module exists to prevent, reintroduced by the guard):
 *   1. Message construction — reassigns a `let message` (initialized to a hardcoded,
 *      non-interpolated fallback literal) inside its own `try`. If the reason cannot be
 *      converted to a string, the fallback literal is logged instead of throwing — the guard
 *      still produces a signal, it does not merely survive silently.
 *   2. The logging call itself — wrapped in a second `try`/`catch` with a `process.stderr`
 *      fallback, because `heroicLogWriter` (backend/logger) is unset until `initLogger()` runs
 *      inside `bootstrap.init()` — a rejection during early boot (before `init()` runs) would
 *      otherwise make `logWarning()` itself throw, turning this guard into a brand-new crash
 *      path. `stdout` is never used for diagnostics: it carries the sidecar's
 *      newline-delimited JSON RPC frame stream, and any non-frame byte written there corrupts
 *      the transport.
 */

import { logWarning, LogPrefix } from 'backend/logger'

let unhandledRejectionGuardInstalled = false

/**
 * Installs a log-only `unhandledRejection` listener on `target` (defaults to the real
 * `process`). Idempotent — a second call is a no-op so re-importing this module (or calling
 * it twice from a test) never registers a second listener. `target` is parameterized purely
 * so a unit test can drive a fake `EventEmitter` without attaching real listeners to the
 * jest worker's own `process`.
 */
function installUnhandledRejectionGuard(
  target: NodeJS.EventEmitter = process
): void {
  if (unhandledRejectionGuardInstalled) {
    return
  }
  unhandledRejectionGuardInstalled = true

  target.on('unhandledRejection', (reason: unknown) => {
    let message =
      '[sidecar] unhandled promise rejection: <unstringifiable reason>'
    try {
      message = `[sidecar] unhandled promise rejection: ${
        reason instanceof Error
          ? (reason.stack ?? reason.message)
          : String(reason)
      }`
    } catch {
      // keep the fallback message
    }
    try {
      logWarning(message, LogPrefix.Backend)
    } catch {
      // heroicLogWriter may be unset this early in boot (before bootstrap.init() runs),
      // which would make logWarning() itself throw -- falling back to a direct stderr
      // write keeps this guard from ever becoming a new crash path. Never stdout: that
      // stream carries the RPC frame protocol.
      try {
        process.stderr.write(`${message}\n`)
      } catch {
        // Nothing further we can safely do -- swallow. Never re-throw, never exit.
      }
    }
  })
}

export { installUnhandledRejectionGuard }
