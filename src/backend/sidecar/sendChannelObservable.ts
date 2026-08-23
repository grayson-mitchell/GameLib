/**
 * The D-11 send-handler observable (Phase 34.6 Plan 05 — REQ-34.6-04/07/13).
 *
 * WHY THIS EXISTS: a sidecar `send`-kind channel (`ipcMain.on`, dispatched by
 * `sidecarRpc.ts`'s `dispatchSend`) fails SILENTLY when unregistered — there is
 * no rejection and no timeout, unlike `invoke`-kind channels, which reject with
 * `UNPORTED_CHANNEL_MARKER` or trip `src-tauri/src/main.rs`'s 60s
 * `INVOKE_TIMEOUT`. `dispatchSend` finds zero listeners and simply returns;
 * Rust's `sidecar_send` has no pending/timeout tracking at all. A caller
 * therefore cannot tell "the handler ran" from "the channel does not exist" —
 * both look identical: nothing happens. The sidecar's own stdout/console is
 * ALSO invisible in production (stdout IS the RPC pipe), so `console.warn`/
 * `console.log` diagnostics that other registration modules use for their own
 * local logging cannot serve as this proof either.
 *
 * `logSendHandlerReached(channel)` closes that gap: it is the ONE thing a send
 * channel's body can do that is both durable (written to `gamelib.log` via the
 * real logger, not stdout) and greppable (a fixed, channel-name-suffixed
 * marker). Both of this phase's send-kind channels — `frontendReady` (this
 * plan) and `winetricksInstall` (a sibling plan in this phase's scope) — share
 * this one module rather than each inventing their own log line, so a live
 * gate has exactly one marker shape to grep for.
 *
 * HONEST LIMITATION (D-11's own, carried here verbatim): this proves the
 * handler BODY was reached. It is NOT a return value, and it does not tell the
 * caller anything — the caller still cannot know whether the operation the
 * handler went on to perform succeeded, partially ran, or threw after this
 * line executed. This module fixes "unprovable" (no signal at all); it does
 * not fix "the caller can't know if it worked" (still structurally true for
 * every send-kind channel, by design of the transport).
 *
 * NO `args` PARAMETER, ON PURPOSE: `declaredUnavailable.ts`'s own
 * `callOrDeclare` contract deliberately excludes call arguments from its log
 * message, citing `enableEosOverlay('')`/`disableEosOverlay('')`-shaped
 * app-name arguments as the concrete reason this is a public fork whose users
 * paste log/console output into a public issue tracker. `logSendHandlerReached`
 * follows the identical discipline — its signature has no `args` parameter at
 * all, so there is nothing to accidentally interpolate. A parameter that does
 * not exist cannot be misused.
 */

import { logInfo, LogPrefix } from '../logger'

/**
 * The fixed, greppable marker every send-handler-reached log line starts
 * with. Never combined with any other text besides the channel name — see
 * the module header's "NO `args` parameter" section above.
 */
export const SEND_HANDLER_MARKER = '[GAMELIB_SIDECAR_SEND_HANDLER]' as const

/**
 * Logs exactly one line proving `channel`'s send-kind handler body was
 * reached: `${SEND_HANDLER_MARKER} ${channel}`. Never throws — wrapped so
 * that even a throwing/misconfigured logger cannot turn this observability
 * call into a second failure inside a handler body that is itself already
 * wrapped in its own try/catch (this module's caller owns that outer guard;
 * this function's own guard exists so a logger failure specifically can
 * never be the thing that trips it).
 *
 * Takes ONLY the channel name — see the module header. Do not add an `args`
 * parameter to this signature.
 */
export function logSendHandlerReached(channel: string): void {
  try {
    logInfo(`${SEND_HANDLER_MARKER} ${channel}`, LogPrefix.Backend)
  } catch {
    // Never throw into the caller — a logging failure must not become a
    // second failure on top of whatever the send handler was already doing.
  }
}
