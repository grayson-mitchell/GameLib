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
 * Phase 51 Plan 12 (D-51-04): the identity-only fallback introduces a REAL
 * async gap between the full helper's own probe finishing (not-inited) and
 * the fallback helper's `spawn()` call -- `ensureBridgeHelperReady` awaits a
 * real `sleep(POLL_INTERVAL_MS)` in between. A fallback test's own
 * `emitListenLine(identityChild, ...)` call must not fire before
 * `ensureHelperSpawned` has actually attached `identityChild`'s stderr
 * listener (i.e. before the SECOND `mockedSpawn` call happens) -- an emit
 * with no listener attached yet is simply lost. This polls real time
 * (no fake timers in this file) until `mockedSpawn` has been called
 * `count` times, bounded so a genuine regression fails fast rather than
 * hanging.
 */
async function waitForSpawnCallCount(count: number): Promise<void> {
  const MAX_ATTEMPTS = 40
  const RETRY_MS = 25
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (mockedSpawn.mock.calls.length >= count) return
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
  }
  throw new Error(
    `mockedSpawn never reached ${count} calls (stuck at ${mockedSpawn.mock.calls.length})`
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

  // ── Phase 51 Plan 12 (D-51-04): identity-only (480) fallback ───────────────
  // A full-AppID helper's own WHOAMI failure no longer ends the call --
  // ensureBridgeHelperReady now kills that child and tries a SECOND,
  // identity-only helper for the SAME appId before reporting anything.

  test('D-51-04: full HEALTH ok/WHOAMI not-ok -> full child killed, identity-only (480) fallback spawned with --identity-only --report-appid <appId> in cwd <stateDir>/<appId>/identity, its WHOAMI ok -> fallback-identity, ready:true, NO steamBridgeSetupRequired', async () => {
    const fullChild = new FakeChildProcess()
    const identityChild = new FakeChildProcess()
    mockedSpawn
      .mockReturnValueOnce(fullChild)
      .mockReturnValueOnce(identityChild)
    MockedSocket
      // Full helper: HEALTH ok, WHOAMI err.
      .mockImplementationOnce(
        () => new FakeSocket(healthOkFrame, whoamiErrFrame)
      )
      // Identity-only fallback: HEALTH ok, WHOAMI ok.
      .mockImplementationOnce(
        () => new FakeSocket(healthOkFrame, whoamiOkFrame)
      )

    const pending = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(fullChild, 55001, APP_ID_A)
    // The identity-only child's own LISTEN line always echoes --appid 480,
    // never the real appId -- but its stderr listener only exists once
    // ensureHelperSpawned() has actually spawned it (a real async gap, see
    // waitForSpawnCallCount's own doc).
    await waitForSpawnCallCount(2)
    emitListenLine(identityChild, 55002, '480')

    const result = await pending

    expect(result).toEqual({
      status: 'fallback-identity',
      ready: true,
      port: 55002
    })
    expect(mockedSendFrontendMessage).not.toHaveBeenCalled()

    expect(fullChild.kill).toHaveBeenCalledTimes(1)
    expect(identityChild.kill).not.toHaveBeenCalled()

    expect(mockedSpawn).toHaveBeenCalledTimes(2)
    const [fullBinPath, fullArgs, fullOptions] = mockedSpawn.mock.calls[0]
    const [identityBinPath, identityArgs, identityOptions] =
      mockedSpawn.mock.calls[1]
    expect(fullBinPath).toBe(steamBridgeHelperPath)
    expect(fullArgs).toEqual(['--appid', APP_ID_A, '--port', '0'])
    expect(fullOptions.cwd).toBe(join(steamBridgeHelperStateDir, APP_ID_A))

    expect(identityBinPath).toBe(steamBridgeHelperPath)
    expect(identityArgs).toEqual([
      '--appid',
      '480',
      '--port',
      '0',
      '--identity-only',
      '--report-appid',
      APP_ID_A
    ])
    expect(identityOptions.cwd).toBe(
      join(steamBridgeHelperStateDir, APP_ID_A, 'identity')
    )
  })

  test('D-51-04: both the full helper AND the identity-only fallback fail WHOAMI -> not-inited, ready:false, exactly ONE steamBridgeSetupRequired(reason: not-inited)', async () => {
    const fullChild = new FakeChildProcess()
    const identityChild = new FakeChildProcess()
    mockedSpawn
      .mockReturnValueOnce(fullChild)
      .mockReturnValueOnce(identityChild)
    MockedSocket.mockImplementationOnce(
      () => new FakeSocket(healthOkFrame, whoamiErrFrame)
    ).mockImplementationOnce(
      () => new FakeSocket(healthOkFrame, whoamiErrFrame)
    )

    const pending = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(fullChild, 55001, APP_ID_A)
    await waitForSpawnCallCount(2)
    emitListenLine(identityChild, 55002, '480')

    const result = await pending

    expect(result).toEqual({
      status: 'not-inited',
      ready: false,
      port: 55002,
      error:
        'Bridge helper process is up but not initialized against a live Steam session'
    })
    expect(mockedSendFrontendMessage).toHaveBeenCalledTimes(1)
    expect(mockedSendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      { appName: APP_ID_A, reason: 'not-inited' }
    )
    expect(mockedSpawn).toHaveBeenCalledTimes(2)
  })

  test('D-51-04: an unreachable full helper never attempts the identity-only fallback -- spawn called exactly once, status stays unreachable', async () => {
    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValue(child)
    MockedSocket.mockImplementation(() => new FakeSocket(healthErrFrame))

    const pending = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(child, 55001, APP_ID_A)

    const result = await pending

    expect(result.status).toBe('unreachable')
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
  }, 10000)

  test('D-51-04: a live identity-only entry for an appId is reused by the next call (no respawn), reporting fallback-identity', async () => {
    const fullChild = new FakeChildProcess()
    const identityChild = new FakeChildProcess()
    mockedSpawn
      .mockReturnValueOnce(fullChild)
      .mockReturnValueOnce(identityChild)
    MockedSocket.mockImplementationOnce(
      () => new FakeSocket(healthOkFrame, whoamiErrFrame)
    )
      .mockImplementationOnce(
        () => new FakeSocket(healthOkFrame, whoamiOkFrame)
      )
      // Base implementation -- drives every socket AFTER the two
      // mockImplementationOnce() calls above are exhausted, i.e. the
      // SECOND ensureBridgeHelperReady() call's own re-probe of the
      // reused, already-live identity-only entry.
      .mockImplementation(() => new FakeSocket(healthOkFrame, whoamiOkFrame))

    const first = ensureBridgeHelperReady(APP_ID_A)
    emitListenLine(fullChild, 55001, APP_ID_A)
    await waitForSpawnCallCount(2)
    emitListenLine(identityChild, 55002, '480')
    expect(await first).toEqual({
      status: 'fallback-identity',
      ready: true,
      port: 55002
    })

    // A SECOND call for the same appId -- the live identity-only entry is
    // reused, not respawned, and still probes WHOAMI ok (no new FakeSocket
    // implementation queued, so the mock keeps returning the last one --
    // healthOk/whoamiOk).
    const second = await ensureBridgeHelperReady(APP_ID_A)

    expect(mockedSpawn).toHaveBeenCalledTimes(2)
    expect(second).toEqual({
      status: 'fallback-identity',
      ready: true,
      port: 55002
    })
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
