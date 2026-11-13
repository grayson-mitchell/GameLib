/**
 * Stdio JSON-RPC server (Phase 27 Plan 02 — Task 2).
 *
 * Reads newline-delimited `SidecarRpcRequest` frames from an input stream
 * (`process.stdin` in production), dispatches `invoke` requests to the
 * matching handler in the injected IPC registry and writes a
 * `SidecarRpcResponse` (correlated by id) to an output stream
 * (`process.stdout` in production); dispatches `send` requests to
 * the registry's listeners fire-and-forget. Also exposes `pushFrontendMessage`
 * (backend->frontend push, wired onto platformApi's fake
 * `BrowserWindow.webContents.send` by bootstrap.ts) and
 * `requestOpenExternal` (the `shell.openExternal` parity path — the sidecar
 * has no direct Tauri-command access, so it emits a well-formed
 * `SidecarRpcRequest{kind:'openExternal'}` frame on stdout for the Rust
 * shell to act on; wiring the Rust-side interpretation of that frame is
 * 27-04's job, since this plan is the "generic transport half").
 *
 * T-27-04 (DoS — stdio frame parser): newline-delimited framing with a max
 * line cap; malformed/oversized frames are dropped and logged to stderr
 * rather than crashing the sidecar (fail-soft, keeps READY up).
 *
 * Also exposes `requestRustInvoke()` (Phase 28 Plan 01 — Task 3), the
 * sidecar→Rust request/response leg (D-05): the mirror image of the
 * Rust→sidecar `invoke` direction above. The sidecar emits a `{kind:
 * 'rustInvoke'}` frame and correlates the eventual `{id, ok, result|error}`
 * response Rust writes back on the same stdin pipe, via the `rustPending`
 * map. Bounded by `RUST_INVOKE_TIMEOUT_MS` (T-28-05) and restricted to
 * `RUST_INVOKE_CHANNELS` (T-28-03). The Rust shell must never be able to
 * drive this frame kind INTO the sidecar (T-28-03b) — the inbound request
 * validator deliberately does not accept it as a valid kind from the shell.
 *
 * Streams are injectable so `bootstrap.test.ts` can drive this with
 * `stream.PassThrough` pairs instead of the real process stdio.
 */

import type { Readable, Writable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import {
  OPEN_EXTERNAL,
  RUST_DEPOT_FINALIZE,
  RUST_DEPOT_JOB_RUN,
  RUST_DIALOG_MESSAGE,
  RUST_DIALOG_OPEN,
  RUST_DIALOG_SAVE,
  RUST_INVOKE_CHANNELS,
  UNPORTED_CHANNEL_MARKER,
  IPC_INVALID_ARGS,
  formatIpcInvalidArgsError,
  type RustInvokeChannel,
  type SidecarRpcRequest,
  type SidecarRpcResponse,
  type SidecarNotification
} from 'common/types/sidecarTransport'
import type { IpcRegistry } from './ipcRegistry'
import type { IpcValidator } from './ipcValidation'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'

/** Guardrail against an unterminated line growing the input buffer unbounded. */
const MAX_LINE_LENGTH = 10 * 1024 * 1024 // 10 MiB

/**
 * Bound on how long a sidecar-initiated `rustInvoke` waits for Rust's response before
 * rejecting (T-28-05). Mirrors `INVOKE_TIMEOUT` in `src-tauri/src/main.rs:49`, which bounds
 * the opposite (Rust-initiated) direction the same way.
 */
const RUST_INVOKE_TIMEOUT_MS = 60_000

/**
 * Channels whose completion is gated on a HUMAN, not on machine work, and which therefore must
 * NOT carry `RUST_INVOKE_TIMEOUT_MS` (CR-04, Phase 30 code review).
 *
 * `dialog_open` blocks on a native modal the user has to interact with. Sixty seconds is well
 * inside normal file-browsing time, and the failure was silent AND wrong: the rejection was
 * swallowed by `platformApi.showOpenDialog`'s catch, which reports `{canceled: true}` — i.e.
 * the sidecar claimed "the user cancelled" while the picker was still on screen. The user's
 * later selection then arrived for an id already removed from `rustPending` and was dropped,
 * so picking a folder simply did nothing, with no error surfaced anywhere in the UI.
 *
 * Head-of-line blocking is not a concern: Rust dispatches every `rustInvoke` on its own worker
 * thread (T-28-05), and an unanswered entry here holds only a Map entry and an unref'd promise.
 *
 * Quick task 260902-8wc extends the list to the two SIBLING dialog channels. The folded todo
 * `2026-08-24-opendialog-is-missing-from-long-running-channels-...` asked for exactly this audit
 * ("check `showSaveDialog`/`dialog_save` and `dialog_message` for the same omission — all three
 * are human-in-the-loop, and only `dialog_open` got the inner exemption"), and both fail in the
 * same shape `dialog_open` did — a WRONG answer, not a visible error:
 *
 * - `dialog_message` — on timeout `platform/index.ts`'s `showMessageBox` catch resolves
 *   `{ response: safeIndex }`, the DECLINED branch. Someone who deliberates for 60s on a native
 *   confirm has it answered "no" on their behalf while the panel is still on screen; their real
 *   click then arrives for an id already deleted from `rustPending` and is dropped.
 *   `showErrorBox` swallows the same timeout.
 * - `dialog_save` — on timeout `showSaveDialog` resolves `{ canceled: true }`, i.e. it claims
 *   the user cancelled while the save panel is still open.
 *
 * Membership is granted on shape, not on a measurement: unlike the shell-side
 * `LONG_RUNNING_CHANNELS` (whose stated rule is that the bound comes back on a MEASUREMENT),
 * this list's rule is the one in the heading above — completion gated on a human rather than on
 * machine work. All three of these block on an OS panel that stays open exactly as long as the
 * person in front of it deliberates, so no wall-clock value is ever correct for them.
 *
 * Second membership rule (Phase 73, D-06/D-08): a long machine job whose completion is
 * outcome-driven rather than clock-driven. `depot_job_run` streams a whole game install and
 * resolves with its Outcome whenever the job ends, which can be hours. The shell cancels every
 * depot job when the sidecar's stdout ends, so an unanswered entry cannot outlive its owner.
 * The entry holds no timer, so it is not an event-loop handle and cannot delay sidecar exit.
 * `depot_finalize` (Phase 75, D-03) joins for the same reason as the job's own finalize: it walks the
 * whole install tree to measure SizeOnDisk, which scales with the game, not with a clock.
 */
const UNBOUNDED_RUST_CHANNELS: readonly string[] = [
  RUST_DIALOG_OPEN,
  RUST_DIALOG_MESSAGE,
  RUST_DIALOG_SAVE,
  RUST_DEPOT_JOB_RUN,
  RUST_DEPOT_FINALIZE
]

function isValidRequest(value: unknown): value is SidecarRpcRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<SidecarRpcRequest>
  return (
    typeof request.id === 'string' &&
    (request.kind === 'invoke' ||
      request.kind === 'send' ||
      request.kind === 'openExternal') &&
    typeof request.channel === 'string' &&
    Array.isArray(request.args)
  )
}

export type DispatchRegistry = Pick<IpcRegistry, 'getHandler' | 'getListeners'>

/**
 * The head of an inbound `invoke` frame as the Rust shell serialises it (`SidecarRpcRequest`'s
 * field order puts `id` first, then `kind`), so the id is readable from the first bytes of a
 * frame too large to parse.
 */
const OVERSIZED_INVOKE_HEAD = /^\s*\{"id":"([^"\\]{1,64})","kind":"invoke"/

export interface SidecarRpcDeps {
  /** Inbound-frame validator (Phase 67 D-08..D-11), one per boot. */
  validator: IpcValidator
}

export interface SidecarRpc {
  start: (input: Readable, output: Writable, ipc: DispatchRegistry) => void
  pushFrontendMessage: (channel: string, ...args: unknown[]) => void
  requestOpenExternal: (url: string) => void
  requestRustInvoke: <C extends RustInvokeChannel>(
    channel: C,
    args: RustInvokeArgsOf<C>
  ) => Promise<unknown>
}

/**
 * The stdio transport as a per-boot instance (66.4-15, D-05): `rustPending`, the bound output
 * stream and the pre-bind line buffer live in this closure, so two instances never resolve each
 * other's pending ids or share frames. Built by the 'sidecar-rpc' boot step; 'rpc-server' calls
 * `start()`.
 */
export function createSidecarRpc(deps: SidecarRpcDeps): SidecarRpc {
  const { validator } = deps
  /**
   * id -> the pending Promise's settle functions + its timeout handle, for `rustInvoke`.
   * `timer` is `null` for the `UNBOUNDED_RUST_CHANNELS` above.
   */
  const rustPending = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: NodeJS.Timeout | null
    }
  >()

  /**
   * IN-04 (`34.2-REVIEW.md` round 1): NOT defaulted to `process.stdout`.
   *
   * This used to be `let outputStream: Writable = process.stdout`, bound to the
   * real stream only when `startRpcServer()` runs. Anything that pushed a frame
   * BEFORE that bind therefore wrote straight to real stdout, ignoring whatever
   * stream the caller was about to inject. Three producers routinely get in
   * ahead of the bind:
   *
   *   - `bootstrap.ts:40`'s `import './handlers'` runs at MODULE scope and
   *     constructs every store manager long before `init()` is called.
   *   - `init()` floats `applyMigrations()` (bootstrap.ts, "Data migrations")
   *     well above its own `startRpcServer()` call, and a migration writes
   *     `migrationsStore.appliedMigrations` -- a real `storeChanged` push. This
   *     one happens in PRODUCTION, not only under Jest.
   *   - Test setup that touches a store before starting its sidecar.
   *
   * Under Jest that put 77 transport frames on the real terminal across the
   * backend suite -- including store payloads -- and made every one of them
   * unassertable, since they never reached the suite's injected `PassThrough`.
   * IN-04 saw ONE of them: only the first leak per suite is visible, because
   * after the first `startRpcServer()` the binding points at that test's
   * now-dead stream and later writes are silently discarded instead.
   *
   * Frames are queued until a stream is bound and flushed in order on bind.
   * Production behaviour is unchanged in substance: the bind at
   * `startRpcServer()` happens far above the `READY_SENTINEL` write, so early
   * frames still reach the same pipe ahead of READY, just after the transport
   * exists rather than before it.
   */
  let outputStream: Writable | null = null
  const pendingLines: string[] = []

  function writeLine(value: unknown): void {
    const line = `${JSON.stringify(value)}\n`
    if (outputStream === null) {
      pendingLines.push(line)
      return
    }
    outputStream.write(line)
  }

  /**
   * Binds the output stream and flushes anything `writeLine` buffered before it
   * existed, in the order it was produced. Called by `start()`.
   */
  function attachOutput(output: Writable): void {
    outputStream = output
    if (pendingLines.length === 0) return
    const queued = pendingLines.splice(0, pendingLines.length)
    for (const line of queued) {
      output.write(line)
    }
  }

  async function dispatchInvoke(
    request: SidecarRpcRequest,
    ipc: DispatchRegistry
  ): Promise<void> {
    const handler = ipc.getHandler(request.channel)
    if (!handler) {
      // Tagged as an expected seam gap rather than a malfunction: in the walking skeleton
      // only a curated handful of channels are registered, so every one of the ~217 unported
      // endpoints lands here by design (SEAM.md § Deferred). The renderer uses this marker to
      // avoid treating a documented gap as a fatal bootstrap error. The response is still
      // ok:false — the promise rejects honestly, only its *reason* is classified.
      const response: SidecarRpcResponse = {
        id: request.id,
        ok: false,
        error: `${UNPORTED_CHANNEL_MARKER} No handler registered for channel '${request.channel}'`
      }
      writeLine(response)
      return
    }
    // Phase 67 D-08/D-11: validate before the handler runs; failure travels the ordinary
    // {id, ok:false, error} path with a typed marker.
    const verdict = validator.validateInbound(
      request.channel,
      'invoke',
      request.args
    )
    if (!verdict.ok) {
      validator.logRejection('invoke', verdict)
      writeLine({
        id: request.id,
        ok: false,
        error: formatIpcInvalidArgsError({
          code: IPC_INVALID_ARGS,
          channel: verdict.channel,
          paths: verdict.paths,
          codes: verdict.codes
        })
      })
      return
    }
    try {
      const result = await handler(undefined, ...request.args)
      const response: SidecarRpcResponse = { id: request.id, ok: true, result }
      writeLine(response)
    } catch (error) {
      const response: SidecarRpcResponse = {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
      writeLine(response)
    }
  }

  function dispatchSend(
    request: SidecarRpcRequest,
    ipc: DispatchRegistry
  ): void {
    // Phase 67 D-09: one check before the listener loop; failure is logged and dropped.
    const verdict = validator.validateInbound(
      request.channel,
      'send',
      request.args
    )
    if (!verdict.ok) {
      validator.logRejection('send', verdict)
      return
    }
    const listeners = ipc.getListeners(request.channel)
    for (const listener of listeners) {
      try {
        listener(undefined, ...request.args)
      } catch (error) {
        // Fail-soft (T-27-04): one broken listener must not crash the sidecar.
        process.stderr.write(
          `[sidecarRpc] listener for '${request.channel}' threw: ${String(error)}\n`
        )
      }
    }
  }

  function handleFrame(line: string, ipc: DispatchRegistry): void {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      process.stderr.write('[sidecarRpc] dropped malformed (non-JSON) frame\n')
      return
    }

    // Response-to-self disambiguation (Phase 28 D-05): a line with an own `ok` property and
    // NO `kind` property is a response to one of OUR OWN outstanding rustInvoke requests, not
    // an inbound request from the shell -- mirrors main.rs's own `value.get("ok").is_some()`
    // check, reversed. Must run before the inbound request shape check below, so a response to
    // our own outstanding request is never mistaken for (or rejected as) an inbound frame.
    if (
      value &&
      typeof value === 'object' &&
      Object.prototype.hasOwnProperty.call(value, 'ok') &&
      !Object.prototype.hasOwnProperty.call(value, 'kind')
    ) {
      const response = value as {
        id?: unknown
        ok: boolean
        result?: unknown
        error?: unknown
      }
      const id = typeof response.id === 'string' ? response.id : undefined
      const pending = id ? rustPending.get(id) : undefined
      if (!pending) {
        // Unknown id -- drop silently (T-28-05 stray-response tolerance), do not throw.
        return
      }
      rustPending.delete(id as string)
      if (pending.timer) clearTimeout(pending.timer)
      if (response.ok) {
        pending.resolve(response.result)
      } else {
        const errorMessage =
          typeof response.error === 'string' ? response.error : 'rust error'
        pending.reject(new Error(errorMessage))
      }
      return
    }

    if (!isValidRequest(value)) {
      process.stderr.write('[sidecarRpc] dropped malformed request frame\n')
      return
    }
    if (value.kind === 'invoke') {
      void dispatchInvoke(value, ipc)
    } else if (value.kind === 'send') {
      dispatchSend(value, ipc)
    } else {
      // Unrecognized inbound frame kind -- diagnostic only, never include args/result
      // (T-28-04, token material travels in those fields). 'openExternal' is only ever
      // emitted BY the sidecar (requestOpenExternal below) -- the shell never sends one
      // inbound, so it also lands here by design, not a regression.
      process.stderr.write(
        `[sidecar] unrecognized frame kind: ${String(value.kind)} (id: ${String(value.id)})\n`
      )
    }
  }

  /**
   * todo 2026-10-05 tauri-rpc-transport-minor-defects (defect 3): an oversized frame used to be
   * dropped with no response, so its invoke waited the shell's 60s timeout -- or forever on a
   * long-running channel. When the dropped frame is an `invoke` whose id is readable, answer it
   * `ok:false` so the caller fails now. A `send` has no caller waiting; nothing to answer.
   */
  function answerOversizedFrame(head: string): void {
    const match = OVERSIZED_INVOKE_HEAD.exec(head.slice(0, 256))
    const id = match?.[1]
    if (id === undefined) return
    const response: SidecarRpcResponse = {
      id,
      ok: false,
      error: `oversized frame dropped: over ${MAX_LINE_LENGTH} characters`
    }
    writeLine(response)
  }

  /**
   * Starts the stdio JSON-RPC loop against the given input/output streams and flushes the
   * frames buffered before it.
   */
  function start(
    input: Readable,
    output: Writable,
    ipc: DispatchRegistry
  ): void {
    attachOutput(output)
    let buffer = ''
    // True from an oversized frame's drop until its terminating newline: the rest of that
    // frame is not a frame and must not be parsed as one.
    let discardingOversized = false
    input.setEncoding('utf-8')
    input.on('data', (chunk: string | Buffer) => {
      buffer += chunk.toString()
      if (discardingOversized) {
        const end = buffer.indexOf('\n')
        if (end === -1) {
          buffer = ''
          return
        }
        buffer = buffer.slice(end + 1)
        discardingOversized = false
      }
      if (buffer.length > MAX_LINE_LENGTH && !buffer.includes('\n')) {
        process.stderr.write(
          '[sidecarRpc] dropped oversized unterminated frame\n'
        )
        answerOversizedFrame(buffer)
        buffer = ''
        discardingOversized = true
        return
      }
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        if (line.trim().length > 0) {
          handleFrame(line, ipc)
        }
        newlineIndex = buffer.indexOf('\n')
      }
    })
  }

  /**
   * Backend->frontend push path. Wired onto platformApi's fake
   * `BrowserWindow.webContents.send` (via `createHostServices`) so the existing,
   * unmodified `backend/ipc.ts`'s `sendFrontendMessage` -> the (removed) main-window accessor
   * chain produces a well-formed `SidecarNotification` frame headlessly.
   */
  function pushFrontendMessage(channel: string, ...args: unknown[]): void {
    const notification: SidecarNotification = {
      kind: 'frontendMessage',
      channel,
      args
    }
    writeLine(notification)
  }

  /**
   * `shell.openExternal` parity path. Wired onto platformApi's `shell.openExternal`
   * (via `createHostServices`).
   */
  function requestOpenExternal(url: string): void {
    const request: SidecarRpcRequest = {
      id: randomUUID(),
      kind: 'openExternal',
      channel: OPEN_EXTERNAL,
      args: [url]
    }
    writeLine(request)
  }

  /**
   * Sidecar→Rust request/response leg (Phase 28 D-05). Emits a `rustInvoke` frame and returns
   * a Promise that resolves/rejects from the correlated `{id, ok, result|error}` response Rust
   * writes back (handled by `handleFrame()`'s response-to-self branch above).
   *
   * Refuses to emit a frame for any channel not in `RUST_INVOKE_CHANNELS` (T-28-03) -- rejects
   * immediately instead. Unanswered requests reject after `RUST_INVOKE_TIMEOUT_MS` (T-28-05). The
   * rejection message below already NAMES the timed-out channel (`` `...: ${channel}` ``), so a
   * `keyring_get` stall is distinguishable in a log line from a cookie/dialog arm's stall without
   * any additional formatting -- see `RUST_KEYRING_GET`'s doc comment (`sidecarTransport.ts`,
   * 34.4.1 gap cycle 2 plan 26) for why this generic message should almost never fire for
   * `keyring_get` specifically after that plan: the Rust side now bounds its own Keychain read and
   * rejects with a distinct, faster `keyring:timeout` first.
   */
  function requestRustInvoke<C extends RustInvokeChannel>(
    channel: C,
    args: RustInvokeArgsOf<C>
  ): Promise<unknown> {
    if (!(RUST_INVOKE_CHANNELS as readonly string[]).includes(channel)) {
      return Promise.reject(
        new Error(`rustInvoke: channel not allowed: ${String(channel)}`)
      )
    }
    return new Promise((resolve, reject) => {
      const id = randomUUID()
      // CR-04: human-in-the-loop channels get no bound at all — see UNBOUNDED_RUST_CHANNELS.
      let timer: NodeJS.Timeout | null = null
      if (!UNBOUNDED_RUST_CHANNELS.includes(channel)) {
        timer = setTimeout(() => {
          rustPending.delete(id)
          reject(
            new Error(
              `rustInvoke timed out after ${RUST_INVOKE_TIMEOUT_MS}ms: ${channel}`
            )
          )
        }, RUST_INVOKE_TIMEOUT_MS)
        // Don't let a pending rustInvoke keep the process alive on its own -- the sidecar's
        // stdin listener is what actually keeps the event loop running; this timer should
        // never be the reason the process can't exit (e.g. Jest teardown, graceful shutdown).
        timer.unref()
      }
      rustPending.set(id, {
        resolve: (value: unknown) => {
          if (timer) clearTimeout(timer)
          resolve(value)
        },
        reject: (error: Error) => {
          if (timer) clearTimeout(timer)
          reject(error)
        },
        timer
      })
      const request: SidecarRpcRequest = {
        id,
        kind: 'rustInvoke',
        channel,
        args
      }
      writeLine(request)
    })
  }

  return { start, pushFrontendMessage, requestOpenExternal, requestRustInvoke }
}
