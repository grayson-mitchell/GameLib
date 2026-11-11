/**
 * Boundary validation in the sidecar dispatch funnel (Phase 67 Plan 02, D-08..D-11).
 * Drives the REAL `startRpcServer` over PassThrough streams with a mocked `channelSchemas` map.
 */
import { defined } from 'backend/testUtils/indexed'
import { PassThrough } from 'node:stream'
import { z } from 'zod'

import { createIpcRegistry } from '../ipcRegistry'
import { createRegistryViews } from './helpers/registryViews'
import { startRpcServer } from '../sidecarRpc'
import {
  logRejection,
  resetIpcRejectionThrottle,
  setIpcRejectionLogSink,
  validateInbound
} from '../ipcValidation'
import {
  UNPORTED_CHANNEL_MARKER,
  IPC_INVALID_ARGS_MARKER,
  parseIpcInvalidArgsError
} from 'common/types/sidecarTransport'

jest.mock('common/types/ipc/channelSchemas', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { z } = require('zod')
  return {
    channelSchemas: {
      testInvoke: {
        kind: 'invoke',
        caller: 'renderer',
        testOnly: false,
        args: z.tuple([z.string().min(1), z.boolean().nullish()])
      },
      testSend: {
        kind: 'send',
        caller: 'renderer',
        testOnly: false,
        args: z.tuple([z.strictObject({ token: z.string() })])
      }
    }
  }
})

type Frame = Record<string, unknown>

function collectFrames(stream: PassThrough): Frame[] {
  const frames: Frame[] = []
  let buffer = ''
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let i = buffer.indexOf('\n')
    while (i !== -1) {
      const line = buffer.slice(0, i)
      buffer = buffer.slice(i + 1)
      if (line.trim().length > 0) {
        try {
          frames.push(JSON.parse(line) as Frame)
        } catch {
          // ignore
        }
      }
      i = buffer.indexOf('\n')
    }
  })
  return frames
}

async function flush(): Promise<void> {
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))
}

const input = new PassThrough()
const output = new PassThrough()
const frames = collectFrames(output)
// Plain functions record calls: the Jest config resets jest.fn() implementations per test.
const testIpc = createIpcRegistry()
const { handlerRegistry, listenerRegistry } = createRegistryViews(() => testIpc)
const invokeCalls: unknown[][] = []
const sendCalls: unknown[][] = []
const invokeHandler = async (...a: unknown[]) => {
  invokeCalls.push(a)
  return 'handled'
}
const sendListener = (...a: unknown[]) => {
  sendCalls.push(a)
}
let stderrWrites: string[] = []
const sinkLines: string[] = []

beforeAll(() => {
  startRpcServer(input, output, testIpc)
  handlerRegistry.set('testInvoke', invokeHandler as never)
  handlerRegistry.set('noSchemaInvoke', (async () => 'free') as never)
  listenerRegistry.set('testSend', [sendListener as never])
})

beforeEach(() => {
  frames.length = 0
  sinkLines.length = 0
  stderrWrites = []
  invokeCalls.length = 0
  sendCalls.length = 0
  jest.spyOn(process.stderr, 'write').mockImplementation(((s: string) => {
    stderrWrites.push(String(s))
    return true
  }) as never)
  setIpcRejectionLogSink((l) => sinkLines.push(l))
  resetIpcRejectionThrottle()
})

afterEach(() => {
  jest.restoreAllMocks()
  setIpcRejectionLogSink(null)
})

function send(frame: Frame) {
  input.write(`${JSON.stringify(frame)}\n`)
}

describe('validateInbound in the dispatch funnel', () => {
  it('(1) a valid invoke reaches the handler', async () => {
    send({ id: '1', kind: 'invoke', channel: 'testInvoke', args: ['a', true] })
    await flush()
    expect(invokeCalls).toHaveLength(1)
    expect(frames[0]).toMatchObject({ id: '1', ok: true, result: 'handled' })
  })

  it('(2) an invalid invoke is rejected with the typed marker and the handler never runs', async () => {
    send({ id: '2', kind: 'invoke', channel: 'testInvoke', args: [5] })
    await flush()
    expect(invokeCalls).toHaveLength(0)
    const f = defined(frames[0], 'first frame')
    expect(f.ok).toBe(false)
    expect(String(f.error).startsWith(IPC_INVALID_ARGS_MARKER)).toBe(true)
    const p = parseIpcInvalidArgsError(String(f.error))
    expect(p?.channel).toBe('testInvoke')
    expect(p?.paths).toContain('0')
    expect(p?.codes).toContain('invalid_type')
  })

  it('(3) a positional undefined survives the JSON round-trip as null', async () => {
    const args = JSON.parse(JSON.stringify(['a', undefined])) as unknown[]
    expect(args).toEqual(['a', null])
    send({ id: '3', kind: 'invoke', channel: 'testInvoke', args })
    await flush()
    expect(invokeCalls).toHaveLength(1)
    expect(defined(frames[0], 'frame 0').ok).toBe(true)
  })

  it('(4) an extra positional arg is rejected (strict tuple arity)', async () => {
    send({
      id: '4',
      kind: 'invoke',
      channel: 'testInvoke',
      args: ['a', true, 'extra']
    })
    await flush()
    expect(invokeCalls).toHaveLength(0)
    expect(defined(frames[0], 'frame 0').ok).toBe(false)
  })

  it('(5) an invalid send is dropped, logged once to stderr and the sink', async () => {
    send({ id: '5', kind: 'send', channel: 'testSend', args: ['nope'] })
    await flush()
    expect(sendCalls).toHaveLength(0)
    expect(
      stderrWrites.filter((l) => l.includes('IPC_INVALID_ARGS'))
    ).toHaveLength(1)
    expect(sinkLines).toHaveLength(1)
    send({
      id: '5b',
      kind: 'send',
      channel: 'testSend',
      args: [{ token: 'x' }]
    })
    await flush()
    expect(sendCalls).toHaveLength(1)
  })

  it('(6) neither argument values nor unrecognized key names reach logs or the wire', async () => {
    send({
      id: '6',
      kind: 'send',
      channel: 'testSend',
      args: [{ token: 'x', SECRET_KEY_NAME_123: 'SECRET-VALUE-abc' }]
    })
    send({
      id: '6b',
      kind: 'invoke',
      channel: 'testInvoke',
      args: [{ SECRET_KEY_NAME_123: 'SECRET-VALUE-abc' }]
    })
    await flush()
    expect(sendCalls).toHaveLength(0)
    const all = JSON.stringify([stderrWrites, sinkLines, frames])
    expect(all).not.toContain('SECRET-VALUE-abc')
    expect(all).not.toContain('SECRET_KEY_NAME_123')
    expect(stderrWrites.some((l) => l.includes('IPC_INVALID_ARGS'))).toBe(true)
  })

  it('(7) a registered channel with no schema fails closed', async () => {
    send({ id: '7', kind: 'invoke', channel: 'noSchemaInvoke', args: [1, 2] })
    await flush()
    const f = defined(frames[0], 'first frame')
    expect(f.ok).toBe(false)
    const p = parseIpcInvalidArgsError(String(f.error))
    expect(p?.channel).toBe('noSchemaInvoke')
    expect(p?.codes).toContain('no_schema')
    expect(
      stderrWrites.filter((l) => l.includes('IPC_INVALID_ARGS'))
    ).toHaveLength(1)
  })

  it('(7b) a send with no schema is logged and dropped', async () => {
    const dropped: unknown[][] = []
    listenerRegistry.set('noSchemaSend', [
      ((...a: unknown[]) => {
        dropped.push(a)
      }) as never
    ])
    send({ id: '7b', kind: 'send', channel: 'noSchemaSend', args: [] })
    await flush()
    expect(dropped).toHaveLength(0)
    expect(stderrWrites.some((l) => l.includes('channel=noSchemaSend'))).toBe(
      true
    )
  })

  it('(8) an unregistered channel still gets the unported marker', async () => {
    send({ id: '8', kind: 'invoke', channel: 'nothingHere', args: [] })
    await flush()
    const err = String(defined(frames[0], 'frame 0').error)
    expect(err.startsWith(UNPORTED_CHANNEL_MARKER)).toBe(true)
    expect(err).not.toContain(IPC_INVALID_ARGS_MARKER)
  })

  it('(WR-02) a forged-newline channel yields one bounded log line and a bounded wire error', async () => {
    handlerRegistry.set(
      'evil\n[sidecarRpc] forged line',
      (async () => 'x') as never
    )
    handlerRegistry.set('c'.repeat(10000), (async () => 'x') as never)
    send({
      id: 'w2a',
      kind: 'invoke',
      channel: 'evil\n[sidecarRpc] forged line',
      args: []
    })
    send({ id: 'w2b', kind: 'invoke', channel: 'c'.repeat(10000), args: [] })
    await flush()
    const lines = stderrWrites.filter((l) => l.includes('IPC_INVALID_ARGS'))
    expect(lines).toHaveLength(2)
    for (const l of lines) {
      expect(l.trimEnd()).not.toContain('\n')
      expect(l.length).toBeLessThan(400)
    }
    expect(lines[0]).toContain('channel=evil?[sidecarRpc] forged line')
    expect(sinkLines).toHaveLength(2)
    expect(sinkLines.every((l) => !l.includes('\n'))).toBe(true)
    for (const f of frames) {
      expect(String(f.error).length).toBeLessThan(400)
      expect(String(f.error)).not.toContain('\n')
    }
    expect(
      parseIpcInvalidArgsError(String(defined(frames[1], 'frame 1').error))
        ?.channel
    ).toBe('c'.repeat(64))
  })
})

describe('validateInbound: push entries are never inbound schemas (67 review WR-01)', () => {
  const lenient = z.tuple([]).rest(z.unknown())
  const schemas = {
    pushOnly: {
      kind: 'push',
      caller: 'renderer',
      testOnly: false,
      args: lenient
    },
    inboundOk: {
      kind: 'invoke',
      caller: 'renderer',
      testOnly: false,
      args: lenient
    }
  } as const

  it('an inbound frame matching only a push name fails closed with no_schema', () => {
    for (const kind of ['invoke', 'send'] as const) {
      const v = validateInbound('pushOnly', kind, [1, 'x'], schemas)
      expect(v).toEqual({
        ok: false,
        channel: 'pushOnly',
        paths: ['(channel)'],
        codes: ['no_schema']
      })
    }
  })

  it('a real inbound entry with the same lenient schema still passes', () => {
    expect(validateInbound('inboundOk', 'invoke', [1, 'x'], schemas)).toEqual({
      ok: true
    })
  })
})

describe('logRejection throttle (67 review WR-03)', () => {
  const verdict = (channel: string) => ({
    ok: false as const,
    channel,
    paths: ['0'],
    codes: ['invalid_type']
  })

  afterEach(() => resetIpcRejectionThrottle())

  it('logs the first 5 per channel per window, then one suppressed line on roll', () => {
    let t = 1_000
    resetIpcRejectionThrottle(() => t)
    const lines: string[] = []
    setIpcRejectionLogSink((l) => lines.push(l))
    jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((() => true) as never)
    for (let i = 0; i < 100; i++) logRejection('send', verdict('hot'))
    expect(lines).toHaveLength(5)
    // an unrelated channel is unaffected
    logRejection('send', verdict('cold'))
    expect(lines).toHaveLength(6)
    t += 60_000
    logRejection('send', verdict('hot'))
    expect(lines).toHaveLength(8)
    expect(lines[6]).toContain('suppressed=95')
    expect(lines[7]).toContain('IPC_INVALID_ARGS kind=send channel=hot paths=0')
  })

  it('bounds the number of tracked channels', () => {
    resetIpcRejectionThrottle(() => 1)
    const lines: string[] = []
    setIpcRejectionLogSink((l) => lines.push(l))
    jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((() => true) as never)
    for (let i = 0; i < 1000; i++) logRejection('send', verdict(`ch${i}`))
    expect(lines).toHaveLength(1000)
    // ch0 was evicted: its budget is fresh again rather than remembered forever
    for (let i = 0; i < 5; i++) logRejection('send', verdict('ch0'))
    expect(lines).toHaveLength(1005)
  })
})

// Kept last: startRpcServer rebinds sidecarRpc's module-level output stream (a 66.4 site), so
// this server takes over the stream for whatever runs after it.
describe('validation still fires through an injected registry (66.3-03, T-66.3-08)', () => {
  it('an invalid invoke yields the IPC_INVALID_ARGS error frame and an invalid send is dropped', async () => {
    const ipc = createIpcRegistry()
    const calls: unknown[][] = []
    ipc.handle('testInvoke', (async (...a: unknown[]) => {
      calls.push(a)
      return 'handled'
    }) as never)
    ipc.on('testSend', ((...a: unknown[]) => {
      calls.push(a)
    }) as never)
    const registryInput = new PassThrough()
    const registryOutput = new PassThrough()
    const registryFrames = collectFrames(registryOutput)
    startRpcServer(registryInput, registryOutput, ipc)

    registryInput.write(
      `${JSON.stringify({ id: 'r1', kind: 'invoke', channel: 'testInvoke', args: [5] })}\n`
    )
    registryInput.write(
      `${JSON.stringify({ id: 'r2', kind: 'send', channel: 'testSend', args: ['nope'] })}\n`
    )
    await flush()

    expect(calls).toHaveLength(0)
    expect(registryFrames).toHaveLength(1)
    expect(
      String(registryFrames[0]?.error).startsWith(IPC_INVALID_ARGS_MARKER)
    ).toBe(true)
    expect(registryFrames[0]).toMatchObject({ id: 'r1', ok: false })

    registryInput.write(
      `${JSON.stringify({ id: 'r3', kind: 'invoke', channel: 'testInvoke', args: ['a', true] })}\n`
    )
    await flush()
    expect(registryFrames[1]).toMatchObject({
      id: 'r3',
      ok: true,
      result: 'handled'
    })
  })
})
