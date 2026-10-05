/**
 * `sidecarRpc.ts`'s inbound newline framing (todo 2026-10-05
 * tauri-rpc-transport-minor-defects, defect 3 and its test gap).
 *
 * Nothing covered a frame split across chunks, a multi-byte character split across chunks,
 * several frames in one chunk, or an oversized frame. The oversized case was a real defect:
 * an unterminated frame over `MAX_LINE_LENGTH` was dropped with no response, so its invoke
 * waited the shell's 60s timeout -- or forever on a long-running channel.
 *
 * Drives `startRpcServer` with `PassThrough` streams only; no store, no child process.
 */
import { PassThrough } from 'node:stream'

const MAX_LINE_LENGTH = 10 * 1024 * 1024

describe('sidecarRpc inbound framing', () => {
  let stderrSpy: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    stderrSpy = jest.spyOn(process.stderr, 'write').mockReturnValue(true)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
  })

  function startEcho(): { input: PassThrough; output: PassThrough } {
    // Fresh module registry per test, so `sidecarRpc` and the `platform` registry it
    // dispatches into are the same instance and no binding leaks between tests.
    const { handlerRegistry } =
      jest.requireActual<typeof import('../../platform')>('../../platform')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rpc = require('../sidecarRpc') as typeof import('../sidecarRpc')
    handlerRegistry.set('echo', (_event: unknown, ...args: unknown[]) =>
      Promise.resolve(args)
    )
    const input = new PassThrough()
    const output = new PassThrough()
    rpc.startRpcServer(input, output)
    return { input, output }
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++)
      await new Promise((resolve) => setImmediate(resolve))
  }

  function responses(
    output: PassThrough
  ): Array<{ id: string; ok: boolean; result?: unknown; error?: string }> {
    let raw = ''
    let chunk = output.read() as Buffer | string | null
    while (chunk !== null) {
      raw += chunk.toString()
      chunk = output.read() as Buffer | string | null
    }
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line))
  }

  function frame(id: string, args: unknown[]): string {
    // Field order matches the Rust shell's `SidecarRpcRequest` serialisation: `id` first.
    return JSON.stringify({ id, kind: 'invoke', channel: 'echo', args }) + '\n'
  }

  it('answers several frames delivered in one chunk', async () => {
    const { input, output } = startEcho()
    input.write(frame('1', ['a']) + frame('2', ['b']) + frame('3', ['c']))
    await settle()
    expect(responses(output).map((r) => [r.id, r.result])).toEqual([
      ['1', ['a']],
      ['2', ['b']],
      ['3', ['c']]
    ])
  })

  it('answers a frame split across chunks exactly once', async () => {
    const { input, output } = startEcho()
    const whole = frame('7', ['split'])
    input.write(whole.slice(0, 10))
    await settle()
    expect(responses(output)).toEqual([])
    input.write(whole.slice(10))
    await settle()
    expect(responses(output)).toEqual([
      { id: '7', ok: true, result: ['split'] }
    ])
  })

  it('reassembles a multi-byte character split across chunks', async () => {
    const { input, output } = startEcho()
    const bytes = Buffer.from(frame('8', ['café ✓ 🎮']), 'utf-8')
    // Split inside the 4-byte emoji.
    const cut = bytes.indexOf(Buffer.from('🎮', 'utf-8')) + 2
    input.write(bytes.subarray(0, cut))
    await settle()
    input.write(bytes.subarray(cut))
    await settle()
    expect(responses(output)).toEqual([
      { id: '8', ok: true, result: ['café ✓ 🎮'] }
    ])
  })

  it('answers an oversized invoke frame ok:false instead of leaving its caller waiting', async () => {
    const { input, output } = startEcho()
    const head = '{"id":"42","kind":"invoke","channel":"echo","args":["'
    input.write(head + 'x'.repeat(MAX_LINE_LENGTH))
    await settle()
    const answered = responses(output)
    expect(answered).toHaveLength(1)
    expect(answered[0].id).toBe('42')
    expect(answered[0].ok).toBe(false)
    expect(answered[0].error).toMatch(/oversized/i)
  })

  it('discards the rest of an oversized frame and keeps serving the frames after it', async () => {
    const { input, output } = startEcho()
    const head = '{"id":"43","kind":"invoke","channel":"echo","args":["'
    input.write(head + 'x'.repeat(MAX_LINE_LENGTH))
    await settle()
    responses(output)
    // The tail of the oversized frame, its terminator, then a healthy frame in the same chunk.
    input.write('x'.repeat(1000) + '"]}\n' + frame('44', ['next']))
    await settle()
    expect(responses(output)).toEqual([
      { id: '44', ok: true, result: ['next'] }
    ])
    const malformed = stderrSpy.mock.calls.filter((call) =>
      String(call[0]).includes('malformed')
    )
    expect(malformed).toEqual([])
  })
})
