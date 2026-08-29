/**
 * Sidecar process-level guards (Phase 34.2 Plan 09 — REQ-34.2-07 / CR-02 / T-34.2-39/40/41;
 * extended by Phase 35 D-35-10-01 with the `uncaughtException` sibling).
 *
 * This module owns BOTH of the sidecar's process-level, log-only guards. They are siblings,
 * not duplicates: `unhandledRejection` fires for a rejected promise with no attached handler,
 * `uncaughtException` fires for a thrown SYNCHRONOUS exception that unwound to the top of the
 * stack. Neither catches the other's fault, so both are needed. See the second block comment
 * below for the `uncaughtException` guard's own provenance (D-35-10-01).
 *
 * The sidecar owns several `void`-ed fire-and-forget async calls (e.g. `send`-kind IPC
 * bodies in `gameDetailsFlowRegistration.ts`/`appShellFlowRegistration.ts`), and on
 * Node >= 15 the process-wide default is `--unhandled-rejections=throw` — a single
 * rejected promise with no attached handler kills the entire backend process. This module
 * installs a log-only, process-level `unhandledRejection` listener as DEFENCE-IN-DEPTH.
 *
 * They are explicitly NOT a substitute for call-site `.catch()`/`try`/`catch` handling — every
 * `send`-kind body and every fire-and-forget call the sidecar owns must still guard itself
 * (see `bootstrap.ts`'s Block A `.catch()` for the primary fix this guard backs up). This
 * guard exists only to make sure that if a call site is ever missed, the failure mode is a
 * logged warning, not a process crash.
 *
 * CRITICAL — governed by this project's recorded `sidecar-dialog-reject-crashes` incident:
 * a "fix" that introduces a NEW throw/reject/exit path is worse than the bug it fixes,
 * because sidecar callers routinely `await`/fire-and-forget with no `try`/`catch` and (until
 * this module) no process-level guard existed at all. NEITHER guard here may EVER re-throw,
 * EVER terminate the process, or EVER change the exit code — each only logs and returns.
 *
 * BOTH halves of each listener body are individually wrapped in their own `try`/`catch`, not
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
 *      fallback. Since WR-04 the log call goes through a late-bound sink that is null until
 *      `bootstrap.init()` installs it, so a rejection during early boot (before `init()` runs)
 *      takes the stderr branch by design rather than by rescue; the `catch` remains because a
 *      sink installed later can still throw (`heroicLogWriter` mid-rotation, a closed stream),
 *      and this guard must never become a brand-new crash path. `stdout` is never used for
 *      diagnostics: it carries the sidecar's newline-delimited JSON RPC frame stream, and any
 *      non-frame byte written there corrupts the transport.
 *
 * The `uncaughtException` guard below is written to the SAME shape, deliberately and
 * line-for-line, for the same reasons — see its own doc comment.
 */

/**
 * WR-04 (gap cycle 1, closed 2026-08-23) — THIS MODULE MUST HAVE ZERO STATIC
 * IMPORTS, and `zeroImports` in `sidecarRejectionGuard.test.ts` enforces that.
 *
 * The guard has to be installed before `bootstrap.ts`'s module scope evaluates,
 * and ES modules evaluate every static import before any statement in the
 * importing body — so the ONLY way to be first is to be a side-effect import
 * whose own graph is empty. Two earlier attempts kept the
 * `import { logWarning } from 'backend/logger'` line that used to sit here and
 * both failed for that one reason: importing this module early dragged the
 * whole backend graph into evaluation ahead of `installElectronHook`, so
 * `app.getPath()` returned `undefined` and the sidecar died on boot (`727be5dbb`),
 * or the handler graph initialised in a different order and
 * `installFlows.test.ts` Test 1b went red. See `src/sidecar/index.ts`.
 *
 * The logger is therefore LATE-BOUND: `bootstrap.init()` calls
 * `setUnhandledRejectionLogSink()` once `initLogger()` has run. Before that call
 * the sink is null and the guard writes to `process.stderr` directly, which is
 * the correct behaviour for the early-boot window anyway — `heroicLogWriter` is
 * unset until `initLogger()`, so a `logWarning()` there would have thrown and
 * fallen back to stderr regardless. `stdout` is never used: it carries the
 * newline-delimited JSON RPC frame stream and any non-frame byte corrupts it.
 */
type UnhandledRejectionLogSink = (message: string) => void

let logSink: UnhandledRejectionLogSink | null = null

/**
 * Installs (or with `null`, clears) the late-bound log sink the guard routes its
 * message through. Called by `bootstrap.init()` immediately after `initLogger()`.
 * Kept a plain setter rather than an import so this module's static import graph
 * stays empty — see the note above.
 */
function setUnhandledRejectionLogSink(
  sink: UnhandledRejectionLogSink | null
): void {
  logSink = sink
}

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
      if (logSink === null) {
        // Early boot: bootstrap.init() has not run initLogger() yet, so there is no
        // logger to route through. stderr is the signal. Never stdout: that stream
        // carries the RPC frame protocol.
        process.stderr.write(`${message}\n`)
      } else {
        logSink(message)
      }
    } catch {
      // The sink itself threw (heroicLogWriter unset, a writer mid-rotation, ...).
      // Falling back to a direct stderr write keeps this guard from ever becoming a
      // new crash path.
      try {
        process.stderr.write(`${message}\n`)
      } catch {
        // Nothing further we can safely do -- swallow. Never re-throw, never exit.
      }
    }
  })
}

/**
 * D-35-10-01 (Phase 35, deadline wave 8 — resolved before `35-14` deletes `main.ts`).
 *
 * WHAT THIS REPLACES. `src/backend/main.ts:618` carried the Electron-side
 * `process.on('uncaughtException', ...)` handler, commented "Maybe this can help with white
 * screens". It had no sidecar equivalent: `grep -rn uncaughtException src/` returned exactly
 * two hits, that handler and the comment in `backend/logger/index.ts`'s `init()` that is
 * written around its existence. Plan `35-14` deletes `main.ts` permanently, so without this
 * function an uncaught synchronous throw anywhere in backend code would reach a Node process
 * with NO handler: Node prints to the sidecar's stderr and exits, and sidecar `console.*`/
 * stderr is captured nowhere the user can reach — the app goes dead with nothing in either
 * log sink. That is precisely the "white screens" failure the Electron comment named.
 *
 * WHY IT IS NOT COVERED BY `installUnhandledRejectionGuard` ABOVE. Different events, different
 * faults. `unhandledRejection` fires when a promise rejects with nothing attached;
 * `uncaughtException` fires when a synchronous `throw` unwinds past every `try`. A sidecar
 * with only the first is fully unguarded against the second.
 *
 * LOG AND CONTINUE — DELIBERATE, and a deviation from Node's default. Registering ANY
 * `uncaughtException` listener suppresses Node's default behaviour of printing the stack and
 * exiting non-zero, so this listener is what keeps the process alive. That is intentional and
 * matches the Electron handler it replaces (which also logged and returned). It is governed by
 * the `sidecar-dialog-reject-crashes` rule at the top of this file: a guard that introduces a
 * new exit path is worse than the bug it fixes. Like its sibling it is DEFENCE-IN-DEPTH, never
 * a licence to skip a call-site `try`/`catch`.
 *
 * SEVERITY. Routed through its OWN late-bound sink, which `bootstrap.init()` binds to
 * `logError` (not `logWarning`) — preserving the `logError(err, LogPrefix.Backend)` severity
 * of the Electron original. A single shared sink would have silently demoted every uncaught
 * exception to a warning.
 *
 * TWO THINGS FROM THE ELECTRON ORIGINAL ARE DELIBERATELY NOT PORTED:
 *
 *   1. `if (process.env.CI === 'e2e') return`. That early return existed for exactly one
 *      reason, stated in its own comment: to skip the error BOX, which would block the
 *      Electron e2e harness until its timeout. It never gated the logging (`logError` ran
 *      first, above it). Plan 35-01's census established that harness is Electron-only and
 *      does not survive this phase, and there is no blocking surface here to suppress — so
 *      the branch has nothing left to do. Dropped deliberately, not overlooked.
 *
 *   2. `showDialogBoxModalAuto(...)`. Left out on purpose, and this is the judgement call:
 *      a) `processGuards.ts` MUST have zero static imports (the WR-04 invariant enforced by
 *         `sidecarRejectionGuard.test.ts`'s zero-imports gate — one `backend/*` import here
 *         killed the sidecar on boot twice, `727be5dbb`). `backend/dialog/dialog.ts` pulls in
 *         `backend/logger`, `electron`, `main_window` and `ipc`, so reaching it would require
 *         a THIRD late-bound sink that is null for the whole early-boot window — exactly the
 *         window a white screen happens in. The dialog would be absent when it mattered most.
 *      b) `showDialogBoxModalAuto` reaches the user by pushing a `showDialog` frame through
 *         `sendFrontendMessage` over the RPC transport, and its failure branch fires an
 *         un-awaited `electronStub` `dialog.showErrorBox` promise. Adding a user-facing,
 *         transport-dependent, promise-producing call INSIDE a handler that is already
 *         processing a crash is the literal shape of `sidecar-dialog-reject-crashes`, and the
 *         transport may be the thing that just broke.
 *      c) The value recovered is near zero anyway: the dialog needs a live renderer to render
 *         into. If the renderer is alive the user can be told by other means; if it is white,
 *         the dialog cannot appear either.
 *      A logged-only guard is a large improvement over no guard. If a user-facing surface is
 *      wanted later it belongs OUTSIDE this handler — e.g. a bounded, already-guarded
 *      notifier bound through its own sink — not inline here.
 */
type UncaughtExceptionLogSink = (message: string) => void

let uncaughtExceptionLogSink: UncaughtExceptionLogSink | null = null

/**
 * Installs (or with `null`, clears) the late-bound log sink the `uncaughtException` guard
 * routes its message through. Called by `bootstrap.init()` immediately after `initLogger()`,
 * beside `setUnhandledRejectionLogSink`. A plain setter rather than an import, so this
 * module's static import graph stays empty — see the WR-04 note above.
 */
function setUncaughtExceptionLogSink(
  sink: UncaughtExceptionLogSink | null
): void {
  uncaughtExceptionLogSink = sink
}

let uncaughtExceptionGuardInstalled = false

/**
 * Installs a log-only `uncaughtException` listener on `target` (defaults to the real
 * `process`). Idempotent — a second call is a no-op, so re-importing this module (or calling
 * it twice from a test) never registers a second listener. `target` is parameterized purely
 * so a unit test can drive a fake `EventEmitter` without attaching real listeners to the jest
 * worker's own `process`.
 *
 * Never re-throws, never calls `process.exit`, never changes the exit code.
 */
function installUncaughtExceptionGuard(
  target: NodeJS.EventEmitter = process
): void {
  if (uncaughtExceptionGuardInstalled) {
    return
  }
  uncaughtExceptionGuardInstalled = true

  target.on('uncaughtException', (error: unknown) => {
    // Half 1 — message construction, inside its OWN try (CR-02 regression, gap cycle 2):
    // `String(error)` throws for a null-prototype value or a throwing/absent
    // `toString`/`Symbol.toPrimitive`, and `error.stack` can be a throwing getter. A throw
    // HERE would escape the listener and re-enter Node as a fresh uncaught exception, which
    // Node terminates on unconditionally — the guard becoming the crash it exists to prevent.
    // The initializer is a hardcoded, non-interpolated literal so there is still a signal.
    let message = '[sidecar] uncaught exception: <unstringifiable error>'
    try {
      message = `[sidecar] uncaught exception: ${
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      }`
    } catch {
      // keep the fallback message
    }
    // Half 2 — the logging call, inside a SECOND try.
    try {
      if (uncaughtExceptionLogSink === null) {
        // Early boot: bootstrap.init() has not run initLogger() yet, so there is no
        // logger to route through. stderr is the signal. Never stdout: that stream
        // carries the RPC frame protocol and a non-frame byte corrupts it.
        process.stderr.write(`${message}\n`)
      } else {
        uncaughtExceptionLogSink(message)
      }
    } catch {
      // The sink itself threw (heroicLogWriter unset, a writer mid-rotation, ...).
      // Falling back to a direct stderr write keeps this guard from ever becoming a
      // new crash path.
      try {
        process.stderr.write(`${message}\n`)
      } catch {
        // Nothing further we can safely do -- swallow. Never re-throw, never exit.
      }
    }
  })
}

export {
  installUncaughtExceptionGuard,
  installUnhandledRejectionGuard,
  setUncaughtExceptionLogSink,
  setUnhandledRejectionLogSink
}
export type { UncaughtExceptionLogSink, UnhandledRejectionLogSink }
