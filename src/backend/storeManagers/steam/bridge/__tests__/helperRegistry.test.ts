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

// Phase 65 Plan 15 (D-03): helperRegistry.ts (D-10 registry state, seams and teardown) -- split out of helperProcess.test.ts by owning module.

import { EventEmitter } from 'node:events'
import { createChildBackedRunner } from 'backend/testUtils/childBackedRunner'
import { Socket } from 'node:net'
import { encodeResponse, STATUS_OK } from '../protocol'
import { ensureBridgeHelperReady } from '../helperProcess'
import {
  stopBridgeHelper,
  hasLiveBridgeHelper,
  shutdownAllBridgeHelpers,
  __setBridgeHelperPathForTests,
  __resetBridgeHelperStateForTests
} from '../helperRegistry'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

// 261027-aue: the default Steam starter calls shell.openExternal on macOS only.
jest.mock('backend/platform', () => ({
  shell: { openExternal: jest.fn().mockResolvedValue(undefined) },
  app: {
    raiseMainWindow: jest.fn(),
    openBridgeInvitePicker: jest.fn().mockResolvedValue(true)
  }
}))

jest.mock('backend/constants/environment', () => ({ isMac: true }))

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

jest.mock('node:net', () => ({
  Socket: jest.fn()
}))

const mockedSpawn = jest.fn()
const fakeRunner = createChildBackedRunner(mockedSpawn)
const helperDeps = { runner: fakeRunner.runner }
const MockedSocket = Socket as unknown as jest.Mock

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

type InitOutcome = 'ok' | 'failed' | 'dylib-missing'

/** Emits a real `LISTEN 127.0.0.1:<port> appid=<id> mode=full` line on
 * `child`'s stderr -- EXACTLY the shape bridge_helper.c's own `logts()`
 * produces, so the regex this test exercises is the real one. By default a
 * matching READY line follows in the same chunk (the helper's terminal
 * "now serving" marker); pass `ready = null` to emit LISTEN only. */
function emitListenLine(
  child: FakeChildProcess,
  port: number,
  appId: string,
  ready: InitOutcome | null = 'ok'
): void {
  const readyLine =
    ready === null
      ? ''
      : `[2026-10-17T00:00:00Z] READY  init=${ready} appid=${appId}\n`
  child.stderr.emit(
    'data',
    Buffer.from(
      `[2026-10-17T00:00:00Z] LISTEN 127.0.0.1:${port} appid=${appId} mode=full\n${readyLine}`
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
    // Writes are answered in order: HEALTH, HELLO (WR-03), WHOAMI --
    // mirrors helperProcess.ts's own single-connection sequencing.
    const responseBuf = [
      this.healthResponse,
      this.helloResponse,
      this.whoamiResponse
    ][this.writeCount]
    this.writeCount += 1
    if (responseBuf) {
      process.nextTick(() => this.emit('data', responseBuf))
    }
    // else: never respond -- let PROBE_TIMEOUT_MS fire.
  })
  writeCount = 0

  constructor(
    private healthResponse?: Buffer,
    private whoamiResponse?: Buffer,
    private helloResponse: Buffer | undefined = helloOkFrame
  ) {
    super()
  }

  connect = jest.fn((_port: number, _host: string, cb: () => void) => {
    process.nextTick(cb)
  })
}

const healthOkFrame = encodeResponse(PROBE_REQUEST_ID, STATUS_OK)
const helloOkFrame = encodeResponse(PROBE_REQUEST_ID, STATUS_OK)
const whoamiOkFrame = encodeResponse(
  PROBE_REQUEST_ID,
  STATUS_OK,
  Buffer.from('76561197995867096')
)

describe('helperRegistry.ts (D-10 registry state, seams and teardown)', () => {
  beforeEach(() => {
    __resetBridgeHelperStateForTests()
    fakeRunner.reset()
    mockedSpawn.mockReset()
  })

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

    const pendingA = ensureBridgeHelperReady(helperDeps, APP_ID_A)
    emitListenLine(childA, 55001, APP_ID_A)
    const pendingB = ensureBridgeHelperReady(helperDeps, APP_ID_B)
    emitListenLine(childB, 55002, APP_ID_B)
    await Promise.all([pendingA, pendingB])

    stopBridgeHelper(APP_ID_A)

    expect(childA.kill).toHaveBeenCalledTimes(1)
    expect(childB.kill).not.toHaveBeenCalled()

    // A second stop for the already-removed appId is a no-op.
    stopBridgeHelper(APP_ID_A)
    expect(childA.kill).toHaveBeenCalledTimes(1)
  })

  test('hasLiveBridgeHelper() is true from spawn until that appId is stopped (the quit confirm keys off it)', async () => {
    expect(hasLiveBridgeHelper()).toBe(false)

    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValueOnce(child)
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )
    const pending = ensureBridgeHelperReady(helperDeps, APP_ID_A)
    emitListenLine(child, 55001, APP_ID_A)
    await pending

    expect(hasLiveBridgeHelper()).toBe(true)
    stopBridgeHelper(APP_ID_A)
    expect(hasLiveBridgeHelper()).toBe(false)
  })

  // 51-REVIEW WR-06 (sidecar exit contract): the runner unref()s the child and
  // its pipes, so a process 'exit' listener must tear down any helper still
  // running when the sidecar drains.
  test('WR-06: a process exit listener kills a still-running helper', async () => {
    const onSpy = jest.spyOn(process, 'on')
    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValue(child)
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )

    const pending = ensureBridgeHelperReady(helperDeps, APP_ID_A)
    emitListenLine(child, 55003, APP_ID_A)
    const result = await pending

    // The runner unref()s the child and its pipes (covered in the runner's own
    // tests); the LISTEN line is still read through its callbacks.
    expect(result).toEqual(expect.objectContaining({ ready: true }))

    const exitListeners = onSpy.mock.calls
      .filter(([event]) => event === 'exit')
      .map(([, listener]) => listener as () => void)
    onSpy.mockRestore()
    // Installed at most once per module instance; this suite's first spawn
    // may have happened in an earlier test, so read it from the live list.
    const installed =
      exitListeners[0] ??
      (process
        .listeners('exit')
        .find((l) => String(l).includes('shutdownAllBridgeHelpers')) as
        | (() => void)
        | undefined)
    expect(installed).toBeDefined()
    installed?.()
    expect(child.kill).toHaveBeenCalledTimes(1)
  })

  test('shutdownAllBridgeHelpers() kills every registered appId', async () => {
    const childA = new FakeChildProcess()
    const childB = new FakeChildProcess()
    mockedSpawn.mockReturnValueOnce(childA).mockReturnValueOnce(childB)
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )

    const pendingA = ensureBridgeHelperReady(helperDeps, APP_ID_A)
    emitListenLine(childA, 55001, APP_ID_A)
    const pendingB = ensureBridgeHelperReady(helperDeps, APP_ID_B)
    emitListenLine(childB, 55002, APP_ID_B)
    await Promise.all([pendingA, pendingB])

    shutdownAllBridgeHelpers()

    expect(childA.kill).toHaveBeenCalledTimes(1)
    expect(childB.kill).toHaveBeenCalledTimes(1)
  })

  // ── Quick task 260907-juv (Gate B) lineage, now per-appId: the registry,
  // not a direct export, is the production teardown path -- calling the
  // shared `fakeRunner.teardownAll()` registry (the only thing
  // `handleExit()` calls) must reach EACH registered appId's own helper
  // independently, exactly once, even across repeated registry-wide
  // teardown calls.
  test('fakeRunner.teardownAll() reaches every registered appId helper via the registry, named steam-bridge-helper-<appId>', async () => {
    const childA = new FakeChildProcess()
    const childB = new FakeChildProcess()
    mockedSpawn.mockReturnValueOnce(childA).mockReturnValueOnce(childB)
    MockedSocket.mockImplementation(
      () => new FakeSocket(healthOkFrame, whoamiOkFrame)
    )

    const pendingA = ensureBridgeHelperReady(helperDeps, APP_ID_A)
    emitListenLine(childA, 55001, APP_ID_A)
    const pendingB = ensureBridgeHelperReady(helperDeps, APP_ID_B)
    emitListenLine(childB, 55002, APP_ID_B)
    await Promise.all([pendingA, pendingB])

    fakeRunner.teardownAll()

    expect(childA.kill).toHaveBeenCalledTimes(1)
    expect(childB.kill).toHaveBeenCalledTimes(1)

    // Idempotent: a second registry-wide teardown never re-kills.
    fakeRunner.teardownAll()
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
    const pending = ensureBridgeHelperReady(helperDeps, APP_ID_A)
    emitListenLine(child, 55001, APP_ID_A)
    await pending

    expect(mockedSpawn.mock.calls[0][0]).toBe(
      '/custom/test/steam-bridge-helper'
    )

    __setBridgeHelperPathForTests(null)
  })
})
