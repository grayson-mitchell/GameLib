/**
 * Unit tests for the D-03 shared-helper lifecycle + D-06 observable
 * readiness signal (Phase 24 Plan 06).
 *
 * `node:child_process`'s `spawn` and `node:net`'s `Socket` are both mocked
 * at the module boundary with small EventEmitter-based fakes -- this test
 * never touches a real process or a real TCP socket. `Socket` is mocked as
 * a `jest.fn()` constructor: `new Socket()` returns whichever `FakeSocket`
 * instance the test queued next (JS `new` semantics: a mock implementation
 * that returns an object overrides `this`), so each test fully controls
 * what each successive CONTROL probe "receives" over the wire.
 *
 * `helperProcess.ts` holds ONE module-scoped shared handle (D-03) --
 * `__resetBridgeHelperStateForTests()` clears it in `beforeEach` so each
 * test starts from "no helper spawned yet" (mirrors bottle.ts's
 * `__stopBottledRaiseLoops` test-hook convention), while the dedicated
 * "single-spawn reuse" test below deliberately calls
 * `ensureBridgeHelperReady` TWICE in a row without resetting in between.
 */
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { Socket } from 'node:net'
import { dirname } from 'node:path'

import { sendFrontendMessage } from 'backend/ipc'
import { steamBridgeHelperPath } from 'backend/constants/paths'
import { encodeResponse, STATUS_OK, STATUS_ERR } from '../protocol'
import {
  ensureBridgeHelperReady,
  shutdownBridgeHelper,
  __resetBridgeHelperStateForTests
} from '../helperProcess'

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
  steamBridgeHelperPath: '/mock/bundle/arm64/darwin/steam-bridge-helper'
}))

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

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  killed = false
  kill = jest.fn(() => {
    this.killed = true
  })
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

describe('helperProcess.ts', () => {
  beforeEach(() => {
    __resetBridgeHelperStateForTests()
    mockedSpawn.mockReturnValue(new FakeChildProcess())
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

  test('spawns the helper with cwd === dirname(steamBridgeHelperPath) (finding #4)', async () => {
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )

    await ensureBridgeHelperReady('1234')

    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    const [binPath, args, options] = mockedSpawn.mock.calls[0]
    expect(binPath).toBe(steamBridgeHelperPath)
    expect(args).toEqual([])
    expect(options.cwd).toBe(dirname(steamBridgeHelperPath))
  })

  test('D-03: two ready calls in a row spawn exactly ONE shared helper', async () => {
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )

    const first = await ensureBridgeHelperReady('1234')
    const second = await ensureBridgeHelperReady('1234')

    expect(first).toEqual({ status: 'ready', ready: true })
    expect(second).toEqual({ status: 'ready', ready: true })
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
  }, 10000)

  test('CONTROL HEALTH ok + CONTROL WHOAMI live -> ready:true', async () => {
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )

    const result = await ensureBridgeHelperReady('1234')

    expect(result).toEqual({ status: 'ready', ready: true })
    expect(mockedSendFrontendMessage).not.toHaveBeenCalled()
  })

  test('HEALTH ok but WHOAMI not-inited -> not-ready, reason distinct from unreachable (finding #7)', async () => {
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiErrFrame)
    )

    const result = await ensureBridgeHelperReady('1234')

    expect(result.ready).toBe(false)
    expect(result.status).toBe('not-inited')
    expect(result.status).not.toBe('unreachable')
    expect(mockedSendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      { appName: '1234', reason: 'not-inited' }
    )
  })

  test('HEALTH answers err on every attempt (process never becomes healthy) -> unreachable, ready:false, steamBridgeSetupRequired fired (D-06)', async () => {
    MockedSocket.mockImplementation(() => new FakeSocket(healthErrFrame))

    const result = await ensureBridgeHelperReady('1234')

    expect(result).toEqual({
      status: 'unreachable',
      ready: false,
      error: 'Bridge helper unreachable within the poll budget'
    })
    expect(mockedSendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      { appName: '1234', reason: 'unreachable' }
    )
  }, 10000)

  test('HEALTH never answers at all (probe timeout every attempt) -> unreachable, ready:false', async () => {
    MockedSocket.mockImplementation(() => new FakeSocket())

    const result = await ensureBridgeHelperReady('1234')

    expect(result.status).toBe('unreachable')
    expect(result.ready).toBe(false)
  }, 10000)

  test('shutdownBridgeHelper() is a no-op when the helper was never spawned', () => {
    expect(() => shutdownBridgeHelper()).not.toThrow()
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  test('shutdownBridgeHelper() kills the spawned helper process', async () => {
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )
    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValue(child)

    await ensureBridgeHelperReady('1234')
    shutdownBridgeHelper()

    expect(child.kill).toHaveBeenCalledTimes(1)

    // A second call is a no-op -- the handle was cleared by the first call.
    shutdownBridgeHelper()
    expect(child.kill).toHaveBeenCalledTimes(1)
  })
})
