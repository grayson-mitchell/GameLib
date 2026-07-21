/**
 * Stdio JSON-RPC server (Phase 27 Plan 02 — Task 2).
 *
 * Reads newline-delimited `SidecarRpcRequest` frames from an input stream
 * (`process.stdin` in production), dispatches `invoke` requests to the
 * matching handler in electronStub's `handlerRegistry` and writes a
 * `SidecarRpcResponse` (correlated by id) to an output stream
 * (`process.stdout` in production); dispatches `send` requests to
 * `listenerRegistry` fire-and-forget. Also exposes `pushFrontendMessage`
 * (backend->frontend push, wired onto electronStub's fake
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
 * Streams are injectable so `bootstrap.test.ts` can drive this with
 * `stream.PassThrough` pairs instead of the real process stdio.
 */

import type { Readable, Writable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import {
  OPEN_EXTERNAL,
  UNPORTED_CHANNEL_MARKER,
  type SidecarRpcRequest,
  type SidecarRpcResponse,
  type SidecarNotification
} from 'common/types/sidecarTransport'
import { handlerRegistry, listenerRegistry } from './electronStub'

/** Guardrail against an unterminated line growing the input buffer unbounded. */
const MAX_LINE_LENGTH = 10 * 1024 * 1024 // 10 MiB

let outputStream: Writable = process.stdout

function writeLine(value: unknown): void {
  outputStream.write(`${JSON.stringify(value)}\n`)
}

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

async function dispatchInvoke(request: SidecarRpcRequest): Promise<void> {
  const handler = handlerRegistry.get(request.channel)
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

function dispatchSend(request: SidecarRpcRequest): void {
  const listeners = listenerRegistry.get(request.channel) ?? []
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

function handleFrame(line: string): void {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    process.stderr.write('[sidecarRpc] dropped malformed (non-JSON) frame\n')
    return
  }
  if (!isValidRequest(value)) {
    process.stderr.write('[sidecarRpc] dropped malformed request frame\n')
    return
  }
  if (value.kind === 'invoke') {
    void dispatchInvoke(value)
  } else if (value.kind === 'send') {
    dispatchSend(value)
  }
  // 'openExternal' is only ever emitted BY the sidecar (requestOpenExternal
  // below) -- the shell never sends one inbound, so there is nothing to
  // dispatch here.
}

/**
 * Starts the stdio JSON-RPC loop against the given input/output streams
 * (defaults to the real process stdio for production use).
 */
export function startRpcServer(
  input: Readable = process.stdin,
  output: Writable = process.stdout
): void {
  outputStream = output
  let buffer = ''
  input.setEncoding('utf-8')
  input.on('data', (chunk: string | Buffer) => {
    buffer += chunk.toString()
    if (buffer.length > MAX_LINE_LENGTH && !buffer.includes('\n')) {
      process.stderr.write(
        '[sidecarRpc] dropped oversized unterminated frame\n'
      )
      buffer = ''
      return
    }
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      if (line.trim().length > 0) {
        handleFrame(line)
      }
      newlineIndex = buffer.indexOf('\n')
    }
  })
}

/**
 * Backend->frontend push path. Wired onto electronStub's fake
 * `BrowserWindow.webContents.send` (via `bindTransport`) so the existing,
 * unmodified `backend/ipc.ts`'s `sendFrontendMessage` -> `getMainWindow()`
 * chain produces a well-formed `SidecarNotification` frame headlessly.
 */
export function pushFrontendMessage(
  channel: string,
  ...args: unknown[]
): void {
  const notification: SidecarNotification = {
    kind: 'frontendMessage',
    channel,
    args
  }
  writeLine(notification)
}

/**
 * `shell.openExternal` parity path. Wired onto electronStub's `shell.openExternal`
 * (via `bindTransport`).
 */
export function requestOpenExternal(url: string): void {
  const request: SidecarRpcRequest = {
    id: randomUUID(),
    kind: 'openExternal',
    channel: OPEN_EXTERNAL,
    args: [url]
  }
  writeLine(request)
}
