/**
 * Transport-shape test for the sidecar→Rust `rustInvoke` request/response channel
 * (Phase 28 Plan 01 — Task 2/3).
 *
 * Proves the TypeScript-side framing only: `requestRustInvoke()` emits a well-formed
 * `rustInvoke` frame, correlates a synthetic Rust-written response by `id`, times out on
 * silence, and refuses non-allowlisted channels without emitting a frame. There is no real
 * Rust process in Jest — every "Rust response" here is a synthetic line written directly
 * into the input `PassThrough`, simulating what `src-tauri/src/main.rs`'s reader thread
 * would write back (plan 28-02's job).
 *
 * Follows `bootstrap.test.ts`'s real-stream convention: `stream.PassThrough` pairs, no
 * mocking of `node:fs`/`electron`, `collectLines()`/`flush()` helpers copied verbatim.
 *
 * `backend/online_monitor` is mocked for the same reason `bootstrap.test.ts` mocks it
 * (fix/steam-native-install-stability, 33-05 live-gate gap): `init()` now calls the real
 * `initOnlineMonitor()`, which reads `net.isOnline()` from `electron` -- absent on this file's
 * default Jest automock (`src/backend/__mocks__/electron.ts`). See `bootstrap.test.ts`'s
 * header for the full rationale; `onlineMonitorWiring.test.ts` is the dedicated suite that
 * exercises the real, unmocked wiring.
 */
jest.mock('../../online_monitor', () => ({
  initOnlineMonitor: jest.fn(),
  isOnline: jest.fn(() => true),
  runOnceWhenOnline: jest.fn((callback: () => unknown) => callback()),
  onConnectivityChange: jest.fn()
}))

import { PassThrough } from 'node:stream'
import { init } from '../bootstrap'
import { requestRustInvoke } from '../sidecarRpc'
import {
  RUST_KEYRING_GET,
  RUST_CLIPBOARD_READ_TEXT,
  type RustInvokeChannel
} from 'common/types/sidecarTransport'

/** Buffers newline-delimited output from a PassThrough into discrete lines. */
function collectLines(stream: PassThrough): string[] {
  const lines: string[] = []
  let buffer = ''
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      lines.push(buffer.slice(0, newlineIndex))
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return lines
}

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('sidecar->Rust rustInvoke channel (transport shape, Rust side stubbed)', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  // Behavior 1: requestRustInvoke() writes exactly one well-formed rustInvoke frame.
  it('writes a single well-formed rustInvoke frame for an allowlisted channel', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)
    init(input, output)

    const promise = requestRustInvoke(RUST_KEYRING_GET, [])
    await flush()

    const rustInvokeLines = lines.filter((line) => line.includes('"kind":"rustInvoke"'))
    expect(rustInvokeLines).toHaveLength(1)
    const parsed = JSON.parse(rustInvokeLines[0])
    expect(parsed.kind).toBe('rustInvoke')
    expect(parsed.channel).toBe('keyring_get')
    expect(Array.isArray(parsed.args)).toBe(true)
    expect(typeof parsed.id).toBe('string')
    expect(parsed.id.length).toBeGreaterThan(0)

    // Settle the pending promise so no timer/rejection leaks past this test.
    input.write(`${JSON.stringify({ id: parsed.id, ok: true, result: null })}\n`)
    await expect(promise).resolves.toBeNull()
  })

  // Behavior 2: a synthetic {ok:true} response resolves the returned Promise.
  it('resolves the returned Promise when a matching {ok:true} response arrives', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)
    init(input, output)

    const promise = requestRustInvoke(RUST_KEYRING_GET, [])
    await flush()

    const rustInvokeLine = lines.find((line) => line.includes('"kind":"rustInvoke"'))
    const { id } = JSON.parse(rustInvokeLine as string)

    input.write(`${JSON.stringify({ id, ok: true, result: 'hunter2' })}\n`)

    await expect(promise).resolves.toBe('hunter2')
  })

  // Behavior 3: a synthetic {ok:false} response rejects the returned Promise.
  it('rejects the returned Promise when a matching {ok:false} response arrives', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)
    init(input, output)

    const promise = requestRustInvoke(RUST_KEYRING_GET, [])
    await flush()

    const rustInvokeLine = lines.find((line) => line.includes('"kind":"rustInvoke"'))
    const { id } = JSON.parse(rustInvokeLine as string)

    input.write(
      `${JSON.stringify({ id, ok: false, error: 'keyring:unavailable' })}\n`
    )

    await expect(promise).rejects.toThrow('keyring:unavailable')
  })

  // Behavior 4: a response frame whose id matches nothing outstanding is dropped silently,
  // and is NOT routed to an invoke/send handler.
  it('drops an unmatched response id without throwing and without dispatching it', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)
    init(input, output)

    expect(() => {
      input.write(
        `${JSON.stringify({ id: 'no-such-pending-id', ok: true, result: 'ignored' })}\n`
      )
    }).not.toThrow()

    await flush()

    // No response frame should have been echoed back for the unmatched id, and nothing
    // should have crashed the sidecar (no thrown exception reaching this test).
    const echoed = lines.find((line) => line.includes('no-such-pending-id'))
    expect(echoed).toBeUndefined()
  })

  // Behavior 5: normal inbound 'invoke' direction still round-trips after the rustInvoke changes.
  it('still round-trips an ordinary inbound invoke frame (no regression)', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)
    init(input, output)

    input.write(
      `${JSON.stringify({ id: 'health-check-1', kind: 'invoke', channel: 'health', args: [] })}\n`
    )
    await flush()

    const responseLine = lines.find((line) => line.includes('"id":"health-check-1"'))
    expect(responseLine).toBeDefined()
    expect(JSON.parse(responseLine as string)).toEqual({
      id: 'health-check-1',
      ok: true,
      result: 'ok'
    })
  })

  // Behavior 6 (T-28-03b direction guard): an inbound frame with kind: 'rustInvoke' sent FROM
  // the shell INTO the sidecar must be rejected, not dispatched to any handler.
  it('rejects an inbound rustInvoke frame from the shell (direction guard)', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)
    init(input, output)

    input.write(
      `${JSON.stringify({
        id: 'malicious-rustinvoke-1',
        kind: 'rustInvoke',
        channel: 'keyring_get',
        args: []
      })}\n`
    )
    await flush()

    const echoed = lines.find((line) => line.includes('malicious-rustinvoke-1'))
    expect(echoed).toBeUndefined()
  })

  // Behavior 7 (T-28-03 allowlist): a channel not in RUST_INVOKE_CHANNELS rejects immediately
  // and writes NO frame to the output stream.
  it('rejects a non-allowlisted channel immediately without emitting a frame', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)
    init(input, output)

    await expect(
      requestRustInvoke('rm -rf /' as RustInvokeChannel, [])
    ).rejects.toThrow()

    await flush()

    const rustInvokeLines = lines.filter((line) => line.includes('"kind":"rustInvoke"'))
    expect(rustInvokeLines).toHaveLength(0)
  })

  // Behavior 8: an unanswered requestRustInvoke rejects after the 60s timeout.
  it('rejects with a timeout message after 60s when unanswered', async () => {
    jest.useFakeTimers()
    const input = new PassThrough()
    const output = new PassThrough()
    init(input, output)

    const promise = requestRustInvoke(RUST_KEYRING_GET, [])
    const assertion = expect(promise).rejects.toThrow('timed out')

    jest.advanceTimersByTime(60_000)

    await assertion
  })

  // Behavior 9 (34.4.1 gap cycle 2 plan 26, F-9 observability half): the generic RPC timeout
  // message NAMES the channel that timed out, so a keyring_get stall is distinguishable from a
  // cookie/dialog arm's stall from the log line alone -- proven for two distinct channels (not
  // just keyring_get) so a future regression that hardcodes one channel's name into the message
  // text, or drops the interpolation entirely, is caught either way.
  it('names the timed-out channel in the rejection message, distinguishing keyring_get from another channel', async () => {
    jest.useFakeTimers()
    const input = new PassThrough()
    const output = new PassThrough()
    init(input, output)

    const keyringPromise = requestRustInvoke(RUST_KEYRING_GET, [])
    const keyringAssertion = expect(keyringPromise).rejects.toThrow(
      'rustInvoke timed out after 60000ms: keyring_get'
    )
    const clipboardPromise = requestRustInvoke(RUST_CLIPBOARD_READ_TEXT, [])
    const clipboardAssertion = expect(clipboardPromise).rejects.toThrow(
      'rustInvoke timed out after 60000ms: clipboard_read_text'
    )

    jest.advanceTimersByTime(60_000)

    await keyringAssertion
    await clipboardAssertion
  })
})
