/**
 * Unit tests for the D-51-01 per-appId bridge-helper registry + D-06
 * observable readiness signal (Phase 51 Plan 01, Task 2).
 *
 * Supersedes the Phase 24 Plan 06 suite this file replaces: that suite
 * exercised a module-scoped SINGLE shared helper handle
 * (`__resetBridgeHelperStateForTests()` cleared one handle;
 * `shutdownBridgeHelper()` tore down "the" helper). D-51-01 deleted that
 * singleton entirely in favor of a `Map<appId, entry>` registry -- every
 * test below drives TWO distinct appIds to prove the registry, not a
 * single-helper illusion.
 *
 * `node:child_process`'s `spawn` and `node:net`'s `Socket` are both mocked
 * at the module boundary with small EventEmitter-based fakes -- this test
 * never touches a real process or a real TCP socket (that is
 * `helperIntegration.test.ts`'s job). `Socket` is mocked as a `jest.fn()`
 * constructor: `new Socket()` returns whichever `FakeSocket` instance the
 * test queued next (JS `new` semantics: a mock implementation that returns
 * an object overrides `this`), so each test fully controls what each
 * successive CONTROL probe "receives" over the wire.
 */
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { Socket } from 'node:net'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { sendFrontendMessage } from 'backend/ipc'
import {
  steamBridgeHelperPath,
  steamBridgeHelperStateDir
} from 'backend/constants/paths'
import { encodeResponse, STATUS_OK, STATUS_ERR } from '../protocol'
import {
  ensureBridgeHelperReady,
  stopBridgeHelper,
  shutdownAllBridgeHelpers,
  __setBridgeHelperPathForTests,
  __resetBridgeHelperStateForTests
} from '../helperProcess'
import {
  shutdownLongLivedChildren,
  __resetLongLivedChildrenForTests
} from 'backend/longLivedChildren'
import { stripSourceComments } from '../../../../testUtils/stripSourceComments'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

jest.mock('backend/constants/paths', () => ({
  steamBridgeHelperPath: '/mock/bundle/arm64/darwin/steam-bridge-helper',
  steamBridgeHelperStateDir: '/mock/state/steam-bridge'
}))

jest.mock('node:fs', () => {
  // `mkdirSync` is mocked (no real per-appId staging dir is created by this
  // suite's fake spawns) -- `readFileSync` is the REAL implementation,
  // needed by this file's own invariant test, which greps the real
  // helperProcess.ts source off disk.
  const actual = jest.requireActual('node:fs')
  return {
    mkdirSync: jest.fn(),
    readFileSync: actual.readFileSync
  }
})

jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}))

jest.mock('node:net', () => ({
  Socket: jest.fn()
}))

const mockedSpawn = spawn as jest.Mock
const MockedSocket = Socket as unknown as jest.Mock
const mockedSendFrontendMessage = sendFrontendMessage as jest.Mock

// PROBE_REQUEST_ID is 1 inside helperProcess.ts -- mirrored here so the
// fixture responses this test hands back decode as matching the request.
const PROBE_REQUEST_ID = 1

const APP_ID_A = '206040'
const APP_ID_B = '206060'

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  killed = false
  kill = jest.fn(() => {
    this.killed = true
  })
}

/** Emits a real `LISTEN 127.0.0.1:<port> appid=<id> mode=full` line on
 * `child`'s stderr -- EXACTLY the shape bridge_helper.c's own `logts()`
 * produces, so the regex this test exercises is the real one. */
function emitListenLine(
  child: FakeChildProcess,
  port: number,
  appId: string
): void {
  child.stderr.emit(
    'data',
    Buffer.from(
      `[2026-10-17T00:00:00Z] LISTEN 127.0.0.1:${port} appid=${appId} mode=full\n`
    )
  )
}

/**
 * A fake `net.Socket` that answers a CONTROL HEALTH request, then (only if
 * queued) a CONTROL WHOAMI request, with the frames supplied via
 * `healthResponse`/`whoamiResponse`. `undefined` for either means "never
 * respond to this stage" -- the real PROBE_TIMEOUT_MS timer (real timers,
 * not faked -- see module docblock) fires and the probe reports not-ok.
 */
class FakeSocket extends EventEmitter {
  destroy = jest.fn()
  write = jest.fn((_data: Buffer) => {
    // First write is always the HEALTH request, second (if it happens) is
    // WHOAMI -- mirrors helperProcess.ts's own single-connection sequencing.
    const isFirstWrite = this.writeCount === 0
    this.writeCount += 1
    const responseBuf = isFirstWrite ? this.healthResponse : this.whoamiResponse
    if (responseBuf) {
      process.nextTick(() => this.emit('data', responseBuf))
    }
    // else: never respond -- let PROBE_TIMEOUT_MS fire.
  })
  writeCount = 0

  constructor(
    private healthResponse?: Buffer,
    private whoamiResponse?: Buffer
  ) {
    super()
  }

  connect = jest.fn((_port: number, _host: string, cb: () => void) => {
    process.nextTick(cb)
  })
}

const healthOkFrame = encodeResponse(PROBE_REQUEST_ID, STATUS_OK)
const healthErrFrame = encodeResponse(PROBE_REQUEST_ID, STATUS_ERR)
const whoamiOkFrame = encodeResponse(
  PROBE_REQUEST_ID,
  STATUS_OK,
  Buffer.from('76561197995867096')
)
const whoamiErrFrame = encodeResponse(PROBE_REQUEST_ID, STATUS_ERR)

describe('helperProcess.ts (D-51-01 per-appId registry)', () => {
  beforeEach(() => {
    __resetBridgeHelperStateForTests()
    __resetLongLivedChildrenForTests()
    mockedSpawn.mockReset()
  })

  test('non-numeric appId is rejected up front -- ready:false, no spawn', async () => {
    const result = await ensureBridgeHelperReady('not-numeric')

    expect(result).toEqual({
      status: 'unreachable',
      ready: false,
      error: 'Invalid appId: "not-numeric"'
    })
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  test('two appIds spawn two children, each argv-form with its OWN --appid and a distinct per-appId cwd', async () => {
    const childA = new FakeChildProcess()
    const childB = new FakeChildProcess()
    mockedSpawn.mockReturnValueOnce(childA).mockReturnValueOnce(childB)
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )

    const pendingA = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(childA, 55001, APP_ID_A)
    const pendingB = ensureBridgeHelperReady(APP_ID_B)
    emitListenLine(childB, 55002, APP_ID_B)

    const [resultA, resultB] = await Promise.all([pendingA, pendingB])

    expect(mockedSpawn).toHaveBeenCalledTimes(2)
    const [binPathA, argsA, optionsA] = mockedSpawn.mock.calls[0]
    const [binPathB, argsB, optionsB] = mockedSpawn.mock.calls[1]

    expect(binPathA).toBe(steamBridgeHelperPath)
    expect(binPathB).toBe(steamBridgeHelperPath)
    expect(argsA).toEqual(['--appid', APP_ID_A, '--port', '0'])
    expect(argsB).toEqual(['--appid', APP_ID_B, '--port', '0'])
    expect(optionsA.cwd).toBe(join(steamBridgeHelperStateDir, APP_ID_A))
    expect(optionsB.cwd).toBe(join(steamBridgeHelperStateDir, APP_ID_B))
    expect(optionsA.cwd).not.toBe(optionsB.cwd)
    // T-24-06/fakeHomeIsolation: never a hand-rolled env literal.
    expect(optionsA.env).toBeUndefined()
    expect(optionsB.env).toBeUndefined()

    expect(resultA).toEqual({ status: 'ready', ready: true, port: 55001 })
    expect(resultB).toEqual({ status: 'ready', ready: true, port: 55002 })
  })

  test('D-51-03: a second call for the SAME appId while its child is live does not spawn again', async () => {
    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValue(child)
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )

    const first = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(child, 55001, APP_ID_A)
    await first

    const second = await ensureBridgeHelperReady(APP_ID_A)

    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    expect(second).toEqual({ status: 'ready', ready: true, port: 55001 })
  })

  test('a LISTEN line whose appid differs from the spawned appId is ignored -- call ends unreachable', async () => {
    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValue(child)

    const pending = ensureBridgeHelperReady(APP_ID_A)
    // A foreign/mismatched appid in the LISTEN line -- never accepted.
    emitListenLine(child, 55001, '999999')

    const result = await pending

    expect(result.status).toBe('unreachable')
    expect(result.ready).toBe(false)
    expect(result.port).toBeUndefined()
  }, 10000)

  test('a LISTEN line reporting a port below 1024 is ignored -- call ends unreachable', async () => {
    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValue(child)

    const pending = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(child, 80, APP_ID_A)

    const result = await pending

    expect(result.status).toBe('unreachable')
    expect(result.ready).toBe(false)
    expect(result.port).toBeUndefined()
  }, 10000)

  test('CONTROL HEALTH ok + CONTROL WHOAMI live -> ready:true, port included', async () => {
    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValue(child)
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )

    const pending = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(child, 55001, APP_ID_A)
    const result = await pending

    expect(result).toEqual({ status: 'ready', ready: true, port: 55001 })
    expect(mockedSendFrontendMessage).not.toHaveBeenCalled()
  })

  test('HEALTH ok but WHOAMI not-inited -> not-ready, reason distinct from unreachable (finding #7), port still included', async () => {
    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValue(child)
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiErrFrame)
    )

    const pending = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(child, 55001, APP_ID_A)
    const result = await pending

    expect(result.ready).toBe(false)
    expect(result.status).toBe('not-inited')
    expect(result.status).not.toBe('unreachable')
    expect(result.port).toBe(55001)
    expect(mockedSendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      { appName: APP_ID_A, reason: 'not-inited' }
    )
  })

  test('HEALTH answers err on every attempt (process never becomes healthy) -> unreachable, ready:false, steamBridgeSetupRequired fired (D-06)', async () => {
    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValue(child)
    MockedSocket.mockImplementation(() => new FakeSocket(healthErrFrame))

    const pending = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(child, 55001, APP_ID_A)
    const result = await pending

    expect(result).toEqual({
      status: 'unreachable',
      ready: false,
      port: 55001,
      error: 'Bridge helper unreachable within the poll budget'
    })
    expect(mockedSendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      { appName: APP_ID_A, reason: 'unreachable' }
    )
  }, 10000)

  test('a helper that never reports a LISTEN line at all -> unreachable, ready:false, no port', async () => {
    mockedSpawn.mockReturnValue(new FakeChildProcess())

    const result = await ensureBridgeHelperReady(APP_ID_A)

    expect(result.status).toBe('unreachable')
    expect(result.ready).toBe(false)
    expect(result.port).toBeUndefined()
  }, 10000)

  test('stopBridgeHelper(appId) is a no-op when that appId was never spawned', () => {
    expect(() => stopBridgeHelper(APP_ID_A)).not.toThrow()
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  test("stopBridgeHelper(appId) kills ONLY that appId's child, leaving a sibling appId untouched", async () => {
    const childA = new FakeChildProcess()
    const childB = new FakeChildProcess()
    mockedSpawn.mockReturnValueOnce(childA).mockReturnValueOnce(childB)
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )

    const pendingA = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(childA, 55001, APP_ID_A)
    const pendingB = ensureBridgeHelperReady(APP_ID_B)
    emitListenLine(childB, 55002, APP_ID_B)
    await Promise.all([pendingA, pendingB])

    stopBridgeHelper(APP_ID_A)

    expect(childA.kill).toHaveBeenCalledTimes(1)
    expect(childB.kill).not.toHaveBeenCalled()

    // A second stop for the already-removed appId is a no-op.
    stopBridgeHelper(APP_ID_A)
    expect(childA.kill).toHaveBeenCalledTimes(1)
  })

  test('shutdownAllBridgeHelpers() kills every registered appId', async () => {
    const childA = new FakeChildProcess()
    const childB = new FakeChildProcess()
    mockedSpawn.mockReturnValueOnce(childA).mockReturnValueOnce(childB)
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )

    const pendingA = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(childA, 55001, APP_ID_A)
    const pendingB = ensureBridgeHelperReady(APP_ID_B)
    emitListenLine(childB, 55002, APP_ID_B)
    await Promise.all([pendingA, pendingB])

    shutdownAllBridgeHelpers()

    expect(childA.kill).toHaveBeenCalledTimes(1)
    expect(childB.kill).toHaveBeenCalledTimes(1)
  })

  // ── Quick task 260907-juv (Gate B) lineage, now per-appId: the registry,
  // not a direct export, is the production teardown path -- calling the
  // shared `shutdownLongLivedChildren()` registry (the only thing
  // `handleExit()` calls) must reach EACH registered appId's own helper
  // independently, exactly once, even across repeated registry-wide
  // teardown calls.
  test('shutdownLongLivedChildren() reaches every registered appId helper via the registry, named steam-bridge-helper-<appId>', async () => {
    const childA = new FakeChildProcess()
    const childB = new FakeChildProcess()
    mockedSpawn.mockReturnValueOnce(childA).mockReturnValueOnce(childB)
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )

    const pendingA = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(childA, 55001, APP_ID_A)
    const pendingB = ensureBridgeHelperReady(APP_ID_B)
    emitListenLine(childB, 55002, APP_ID_B)
    await Promise.all([pendingA, pendingB])

    shutdownLongLivedChildren()

    expect(childA.kill).toHaveBeenCalledTimes(1)
    expect(childB.kill).toHaveBeenCalledTimes(1)

    // Idempotent: a second registry-wide teardown never re-kills.
    shutdownLongLivedChildren()
    expect(childA.kill).toHaveBeenCalledTimes(1)
    expect(childB.kill).toHaveBeenCalledTimes(1)
  })

  test('__setBridgeHelperPathForTests overrides the spawned binary path; null restores the real packaged path', async () => {
    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValue(child)
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )

    __setBridgeHelperPathForTests('/custom/test/steam-bridge-helper')
    const pending = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(child, 55001, APP_ID_A)
    await pending

    expect(mockedSpawn.mock.calls[0][0]).toBe(
      '/custom/test/steam-bridge-helper'
    )

    __setBridgeHelperPathForTests(null)
  })

  // ── Invariant (D-51-01 assumption_delta_decision, Task 2): the singleton
  // helperProcess/unregisterLongLivedChild module state is DELETED, not
  // kept beside the registry. Matched against COMMENT-STRIPPED source
  // (repo grep-hygiene rule) so a prose mention in a docblock explaining
  // the history can never satisfy this gate.
  test('invariant: no module-level `let` of a ChildProcess, and no `shutdownBridgeHelper` symbol survives in source', () => {
    const sourcePath = join(__dirname, '..', 'helperProcess.ts')
    const stripped = stripSourceComments(readFileSync(sourcePath, 'utf-8'))

    expect(stripped).not.toMatch(/\blet\s+\w*\s*:\s*ChildProcess/)
    expect(stripped).not.toMatch(/\bshutdownBridgeHelper\b/)
    // Positive control: the registry map itself must still be declared, so
    // this assertion is provably exercising real source, not an empty file.
    expect(stripped).toMatch(/const helpers = new Map</)
  })
})
