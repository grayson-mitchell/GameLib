/**
 * Transport-shape test for the sidecar→Rust `rustInvoke` request/response channel
 * (Phase 28 Plan 01 — Task 2).
 *
 * Proves the TypeScript-side framing only: `requestRustInvoke()` emits a well-formed
 * `rustInvoke` frame, correlates a synthetic Rust-written response by `id`, times out on
 * silence, and refuses non-allowlisted channels without emitting a frame. There is no real
 * Rust process in Jest — every "Rust response" here is a synthetic line written directly
 * into the input `PassThrough`, simulating what `src-tauri/src/main.rs`'s reader thread
 * would write back (plan 28-02's job). This test is expected to FAIL until Task 3 implements
 * `requestRustInvoke()` and the response-to-self disambiguation in `handleFrame()`.
 *
 * Follows `bootstrap.test.ts`'s real-stream convention: `stream.PassThrough` pairs, no
 * mocking of `node:fs`/`electron`, `collectLines()`/`flush()` helpers copied verbatim.
 */

import { PassThrough } from 'node:stream'
import { init } from '../bootstrap'
import { RUST_KEYRING_GET } from 'common/types/sidecarTransport'

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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requestRustInvoke } = require('../sidecarRpc')
    void requestRustInvoke(RUST_KEYRING_GET, [])
    await flush()

    const rustInvokeLines = lines.filter((line) => line.includes('"kind":"rustInvoke"'))
    expect(rustInvokeLines).toHaveLength(1)
    const parsed = JSON.parse(rustInvokeLines[0])
    expect(parsed.kind).toBe('rustInvoke')
    expect(parsed.channel).toBe('keyring_get')
    expect(Array.isArray(parsed.args)).toBe(true)
    expect(typeof parsed.id).toBe('string')
    expect(parsed.id.length).toBeGreaterThan(0)
  })

  // Behavior 2: a synthetic {ok:true} response resolves the returned Promise.
  it('resolves the returned Promise when a matching {ok:true} response arrives', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const lines = collectLines(output)
    init(input, output)

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requestRustInvoke } = require('../sidecarRpc')
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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requestRustInvoke } = require('../sidecarRpc')
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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requestRustInvoke } = require('../sidecarRpc')

    await expect(
      requestRustInvoke('rm -rf /' as never, [])
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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requestRustInvoke } = require('../sidecarRpc')
    const promise = requestRustInvoke(RUST_KEYRING_GET, [])
    const assertion = expect(promise).rejects.toThrow('timed out')

    jest.advanceTimersByTime(60_000)

    await assertion
  })
})
