// Todo `sidecar-log-output-shares-the-rpc-stdout-pipe` (security, 2026-10-05).
//
// The sidecar's stdout IS the RPC pipe: the Rust reader JSON-parses every line
// and acts on `kind:"rustInvoke"` / `kind:"openExternal"` / `ok`+`id`. Console
// output (`console.log`, and subprocess output logged raw, e.g. `logInfo(stdout)`
// in `legendary/library.ts`) could smuggle a frame-shaped line onto the pipe.
//
// Two halves, both through the sidecar's real code:
//   1. the console: `src/sidecar/installRejectionGuard.ts` (the sidecar entry's FIRST import)
//      redirects every console stdout method to stderr, against a Node-default console whose stdout
//      stands in for the RPC pipe;
//   2. the general log (Phase 84): since the forwarder replaced the TS general writer, a logged
//      subprocess dump travels on the RPC pipe as a `kind:"log"` frame. The real `sidecarRpc`
//      transport is bound to a PassThrough standing in for stdout; every line on it must be JSON
//      with `kind: "log"`, and a rustInvoke-shaped object inside a message appears only INSIDE a
//      log frame's `msg`, never as a line of its own;
//   3. the store mirror (Phase 85): a write to a Rust-owned store travels as a `kind:"store"` frame
//      (`STORE_FRAME_KIND`), and a rustInvoke-shaped value being stored appears only INSIDE that
//      frame's `valueJson` text, never as a line of its own.
// The three pre-existing process guards are stubbed out only because they
// install process-wide listeners into the jest worker; every other export of
// `processGuards` is the real one.

import { Console } from 'console'
import { PassThrough } from 'stream'

import { LOG_FRAME_KIND, STORE_FRAME_KIND } from 'common/types/sidecarTransport'
import GameLibStore from '../../store_backend'
import { createTestSidecarRpc } from '../../testUtils/testSidecarRpc'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'
import { createIpcRegistry } from '../ipcRegistry'

import type { LogFrame } from 'common/types/sidecarTransport'

jest.mock('backend/sidecar/processGuards', () => {
  const actual = jest.requireActual<
    typeof import('backend/sidecar/processGuards')
  >('backend/sidecar/processGuards')
  return {
    ...actual,
    createProcessGuards: () => ({
      ...actual.createProcessGuards(),
      installStdioErrorGuards: () => undefined,
      installUnhandledRejectionGuard: () => undefined,
      installUncaughtExceptionGuard: () => undefined
    })
  }
})

const FRAME =
  '{"kind":"rustInvoke","id":"x","channel":"shell_open_path","args":["/path/evil.app"]}'

describe('sidecar stdout carries RPC frames only', () => {
  const originalConsole = global.console
  let rpcPipe: string
  let stderrText: string

  beforeEach(() => {
    rpcPipe = ''
    stderrText = ''
    const stdout = new PassThrough()
    stdout.on('data', (chunk: Buffer) => (rpcPipe += chunk.toString()))
    // Node's default global console: log/info/debug/dir -> stdout,
    // warn/error -> stderr. In the sidecar, `stdout` is the RPC pipe.
    global.console = new Console({ stdout, stderr: process.stderr })
    jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        stderrText += chunk.toString()
        return true
      })
  })

  afterEach(() => {
    global.console = originalConsole
    jest.restoreAllMocks()
  })

  it('a logged multi-line subprocess dump with a frame-shaped line never reaches the RPC pipe via console', async () => {
    await jest.isolateModulesAsync(async () => {
      await import('../../../sidecar/installRejectionGuard')
    })

    console.log(FRAME)
    console.info(FRAME)
    console.debug(FRAME)
    console.dir({ kind: 'rustInvoke' })
    console.table([{ kind: 'rustInvoke' }])

    expect(rpcPipe).toBe('')
    // Positive control: the output was redirected, not dropped -- under
    // `pnpm tauri:dev` the shell forwards sidecar stderr to the terminal.
    expect(stderrText).toContain(FRAME)
  })

  it('a logged subprocess dump with a frame-shaped line travels only inside a kind:"log" frame', async () => {
    let logger!: typeof import('backend/logger/index')
    await jest.isolateModulesAsync(async () => {
      logger = await import('backend/logger/index')
    })
    const rpc = createTestSidecarRpc()
    const stdoutPipe = new PassThrough()
    let wire = ''
    stdoutPipe.on('data', (chunk: Buffer) => (wire += chunk.toString()))
    rpc.start(new PassThrough(), stdoutPipe, createIpcRegistry())
    logger.bindLogTransport(rpc.logTransport)

    logger.logInfo(`legendary said:\n${FRAME}\nbye`, 'Legendary')
    logger.logDebug(`gogdl said:\n${FRAME}`, 'Gog')
    await logger.flushLogForwarder()
    await new Promise((resolve) => setImmediate(resolve))

    const lines = wire.split('\n').filter((line) => line.length > 0)
    expect(lines.length).toBeGreaterThan(0)
    const msgs: string[] = []
    for (const line of lines) {
      const parsed = JSON.parse(line) as LogFrame
      expect(parsed.kind).toBe(LOG_FRAME_KIND)
      for (const batch of parsed.batch) {
        for (const entry of batch.entries) {
          if ('line' in entry) msgs.push(entry.line.msg)
        }
      }
    }
    // The dump arrived whole, as the message of log entries; no line of the pipe is the forged frame.
    expect(msgs.some((m) => m.includes('legendary said:'))).toBe(true)
    expect(msgs.filter((m) => m.includes(FRAME))).toHaveLength(2)
    expect(lines).not.toContain(FRAME)
    expect(wire).not.toMatch(/^\{"kind":"rustInvoke"/m)
  })

  it('a Rust-owned store write travels only as ordered kind:"store" frames, a forged frame inside the value stays inside valueJson', () => {
    const rpc = createTestSidecarRpc()
    const stdoutPipe = new PassThrough()
    let wire = ''
    stdoutPipe.on('data', (chunk: Buffer) => (wire += chunk.toString()))
    const root = createTestStoreRoot(undefined, {
      frameSink: rpc.storeFrameSink
    })
    const store = new GameLibStore({
      root,
      cwd: 'store_cache',
      name: 'wikigameinfo',
      declaration: { kind: 'cache' }
    })

    // Written before the output is attached: held in order, not lost, not on a real stdout.
    store.set('first', FRAME)
    expect(wire).toBe('')
    rpc.start(new PassThrough(), stdoutPipe, createIpcRegistry())
    store.set('second', { nested: FRAME })
    store.delete('first')

    const lines = wire.split('\n').filter((line) => line.length > 0)
    expect(lines).toHaveLength(3)
    const frames = lines.map(
      (line) => JSON.parse(line) as { kind: string; seq: number; op: string }
    )
    expect(frames.map((f) => f.kind)).toEqual([
      STORE_FRAME_KIND,
      STORE_FRAME_KIND,
      STORE_FRAME_KIND
    ])
    expect(frames.map((f) => f.seq)).toEqual([1, 2, 3])
    expect(frames.map((f) => f.op)).toEqual(['set', 'set', 'delete'])
    expect(lines).not.toContain(FRAME)
    expect(wire).not.toMatch(/^\{"kind":"rustInvoke"/m)
  })
})
