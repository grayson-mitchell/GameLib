// Todo `sidecar-log-output-shares-the-rpc-stdout-pipe` (security, 2026-10-05).
//
// The sidecar's stdout IS the RPC pipe: the Rust reader JSON-parses every line
// and acts on `kind:"rustInvoke"` / `kind:"openExternal"` / `ok`+`id`. The main
// LogWriter is built with `outputToOsStreams = true`, so INFO/DEBUG lines went
// through `console.log` -- to stdout -- and subprocess output logged raw (e.g.
// `logInfo(stdout)` in `legendary/library.ts`) could smuggle a frame-shaped
// line onto the pipe.
//
// This drives the sidecar's real boot path for the console: it evaluates
// `src/sidecar/installRejectionGuard.ts` (the sidecar entry's FIRST import)
// against a Node-default console whose stdout stands in for the RPC pipe, then
// logs through a real LogWriter exactly as the sidecar's main writer is built.
// The three pre-existing process guards are stubbed out only because they
// install process-wide listeners into the jest worker; every other export of
// `processGuards` is the real one.

import { Console } from 'console'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PassThrough } from 'stream'

jest.mock('backend/sidecar/processGuards', () => ({
  ...jest.requireActual<object>('backend/sidecar/processGuards'),
  installStdioErrorGuards: () => undefined,
  installUnhandledRejectionGuard: () => undefined,
  installUncaughtExceptionGuard: () => undefined
}))

// Same inert mock `logWriter.test.ts` uses: LogWriter's first-write branch
// calls `./index`'s `logDebug`, whose singleton this test never initialises.
jest.mock('backend/logger/index', () => ({
  getLogFilePath: jest.fn(() => '/__gamelib-stdout-test-never-matches__.log'),
  logDebug: jest.fn()
}))

const FRAME =
  '{"kind":"rustInvoke","id":"x","channel":"shell_open_path","args":["/path/evil.app"]}'

describe('sidecar stdout carries RPC frames only', () => {
  const originalConsole = global.console
  let dir: string
  let rpcPipe: string
  let stderrText: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-stdout-frames-only-'))
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
    rmSync(dir, { recursive: true, force: true })
  })

  it('a logged multi-line subprocess dump with a frame-shaped line never reaches the RPC pipe', async () => {
    let LogWriter!: typeof import('backend/logger/log_writer').default
    await jest.isolateModulesAsync(async () => {
      await import('../../../sidecar/installRejectionGuard')
      LogWriter = (await import('backend/logger/log_writer')).default
    })

    // Built as `logger/index.ts`'s `init()` builds the sidecar's main writer.
    const writer = new LogWriter(join(dir, 'gamelib.log'), true, false)
    await writer.logInfo(`legendary said:\n${FRAME}\nbye`)
    await writer.logDebug(`gogdl said:\n${FRAME}`)
    console.log(FRAME)
    console.info(FRAME)
    console.debug(FRAME)
    console.dir({ kind: 'rustInvoke' })
    console.table([{ kind: 'rustInvoke' }])

    expect(rpcPipe).toBe('')
    // Positive control: the output was redirected, not dropped -- under
    // `pnpm tauri:dev` the shell forwards sidecar stderr to the terminal.
    expect(stderrText).toContain(FRAME)
    expect(stderrText).toContain('legendary said:')
  })

  it('self-test mode leaves stdout alone (lzmaNativeSeaRealBuild reads SELFTEST lines from it)', async () => {
    const previous = process.env.GAMELIB_SIDECAR_SELFTEST
    process.env.GAMELIB_SIDECAR_SELFTEST = 'decompress-pool'
    try {
      await jest.isolateModulesAsync(async () => {
        await import('../../../sidecar/installRejectionGuard')
      })
      console.log('SELFTEST pool={}')
      expect(rpcPipe).toBe('SELFTEST pool={}\n')
    } finally {
      if (previous === undefined) delete process.env.GAMELIB_SIDECAR_SELFTEST
      else process.env.GAMELIB_SIDECAR_SELFTEST = previous
    }
  })
})
