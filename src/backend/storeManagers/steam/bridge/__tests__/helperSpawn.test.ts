/**
 * Unit tests for the D-51-01 per-appId bridge-helper registry + D-06
 * observable readiness signal (Phase 51 Plan 01, Task 2).
 *
 * Supersedes the Phase 24 Plan 06 suite this file replaces: that suite
 * exercised a module-scoped SINGLE shared helper handle
 * (clearing the registry cleared one handle;
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

// Phase 65 Plan 15 (D-03): helperSpawn.ts (spawn, stderr relay, line parsing) -- split out of helperProcess.test.ts by owning module.

import { EventEmitter } from 'node:events'
import { createChildBackedRunner } from 'backend/testUtils/childBackedRunner'
import { Socket } from 'node:net'
const sendFrontendMessage = jest.fn()
import { logInfo, logWarning } from 'backend/logger'
import { BRIDGE_SECRET_ENV, encodeResponse, STATUS_OK } from '../protocol'
import { ensureBridgeHelperReady } from '../helperProcess'
import { classifyInitFlatError, ensureHelperSpawned } from '../helperSpawn'
import {
  createBridgeHelperRegistry,
  type BridgeHelperRegistry
} from '../helperRegistry'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('backend/constants/environment', () => ({ isMac: true }))

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
// 261027-aue: the default Steam starter calls openExternal on macOS only; both services arrive
// through the deps slice (66.3-08).
const mockedOpenExternal = jest.fn().mockResolvedValue(undefined)
// One registry per case (D-66.3-14); the deps read it through a getter so the cases below stay as
// they were.
let registry: BridgeHelperRegistry
const helperDeps = {
  sendFrontendMessage,
  get bridgeHelpers() {
    return registry
  },
  runner: fakeRunner.runner,
  openExternal: { openExternal: mockedOpenExternal },
  paths: { steamBridgeHelperStateDir: '/mock/state/steam-bridge' }
}
const MockedSocket = Socket as unknown as jest.Mock

// PROBE_REQUEST_ID is 1 inside helperProcess.ts -- mirrored here so the
// fixture responses this test hands back decode as matching the request.
const PROBE_REQUEST_ID = 1

const APP_ID_A = '206040'

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  killed = false
  kill = jest.fn(() => {
    this.killed = true
  })
}

type InitOutcome = 'ok' | 'failed' | 'dylib-missing'

/** Emits the helper's READY line: bridge_helper.c's
 * `logts_f("READY", "init=%s appid=%s", ...)`. logts pads the category with
 * `%-6s`, so the 5-character `READY` is followed by TWO spaces. */
function emitReadyLine(
  child: FakeChildProcess,
  appId: string,
  init: InitOutcome = 'ok'
): void {
  child.stderr.emit(
    'data',
    Buffer.from(`[2026-10-17T00:00:00Z] READY  init=${init} appid=${appId}\n`)
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

const NOT_RUNNING = 'Could not determine Steam client install directory'
const SIGNING_IN = 'ConnectToGlobalUser failed'

describe('helperSpawn.ts (spawn, stderr relay, line parsing)', () => {
  beforeEach(() => {
    registry = createBridgeHelperRegistry({
      steamWaitSchedule: { budgetMs: 60_000, intervalMs: 3_000 },
      helperPath: () => '/mock/bundle/arm64/darwin/steam-bridge-helper',
      spawnEnv: () => process.env
    })
    fakeRunner.reset()
    mockedSpawn.mockReset()
  })

  // 53-13 WR-03 (relay side): one log call per non-empty stderr line, each
  // with its own appid prefix and no embedded newline.
  test('stderr chunk of 3 lines -> 3 logWarning calls, each prefixed with the appid, none multi-line', () => {
    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValue(child)
    ;(logWarning as jest.Mock).mockClear()

    void ensureBridgeHelperReady(helperDeps, '42')
    child.stderr.emit(
      'data',
      Buffer.from(
        '[t1] HELLO  shim attached appid=42\n[t2] CALL   SteamUser023.GetSteamID\n[t3] CALL   SteamFriends017.GetPersonaName\n'
      )
    )

    const messages = (logWarning as jest.Mock).mock.calls
      .map((c) => c[0] as string)
      .filter((m) => m.startsWith('bridge helper [42]: '))
    expect(messages).toEqual([
      'bridge helper [42]: [t1] HELLO  shim attached appid=42',
      'bridge helper [42]: [t2] CALL   SteamUser023.GetSteamID',
      'bridge helper [42]: [t3] CALL   SteamFriends017.GetPersonaName'
    ])
    for (const m of messages) expect(m).not.toContain('\n')
  })

  test('stderr chunk with blank lines logs no empty-message call, and LISTEN parsing still sees every line', async () => {
    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValue(child)
    ;(logWarning as jest.Mock).mockClear()

    const pending = ensureBridgeHelperReady(helperDeps, APP_ID_A)
    child.stderr.emit(
      'data',
      Buffer.from(
        `\n  \n[2026-10-17T00:00:00Z] LISTEN 127.0.0.1:55001 appid=999999 mode=full\n\n`
      )
    )
    const messages = (logWarning as jest.Mock).mock.calls.map(
      (c) => c[0] as string
    )
    expect(
      messages.filter((m) => m.startsWith('bridge helper ['))
    ).toHaveLength(1)
    for (const m of messages) expect(m.trim().endsWith(': ')).toBe(false)
    // handleStderrLine still ran: the mismatched appid LISTEN is rejected.
    const result = await pending
    expect(result.status).toBe('unreachable')
  }, 10000)

  describe('53-18 WR-05 line carry-over', () => {
    const bridgeMessages = (mock: unknown) =>
      (mock as jest.Mock).mock.calls
        .map((c) => c[0] as string)
        .filter((m) => m.startsWith('bridge helper ['))

    test('a stderr line split across two chunks is logged once, whole', () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      ;(logWarning as jest.Mock).mockClear()
      void ensureBridgeHelperReady(helperDeps, '42')
      child.stderr.emit('data', Buffer.from('[ts] CA'))
      child.stderr.emit('data', Buffer.from('LL   SteamUser021.GetSteamID\n'))
      expect(bridgeMessages(logWarning)).toEqual([
        'bridge helper [42]: [ts] CALL   SteamUser021.GetSteamID'
      ])
    })

    test('a LISTEN line split across two chunks still resolves the port', async () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      MockedSocket.mockImplementation(
        () => new FakeSocket(healthOkFrame, whoamiOkFrame)
      )
      const pending = ensureBridgeHelperReady(helperDeps, APP_ID_A)
      const line = `[2026-10-17T00:00:00Z] LISTEN 127.0.0.1:55001 appid=${APP_ID_A} mode=full\n`
      child.stderr.emit('data', Buffer.from(line.slice(0, 30)))
      child.stderr.emit('data', Buffer.from(line.slice(30)))
      emitReadyLine(child, APP_ID_A)
      const result = await pending
      expect(result.ready).toBe(true)
    })

    test('a trailing partial line is flushed exactly once when stdio closes', async () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      ;(logWarning as jest.Mock).mockClear()
      void ensureBridgeHelperReady(helperDeps, '42')
      child.stderr.emit('data', Buffer.from('[ts] tail'))
      expect(bridgeMessages(logWarning)).toEqual([])
      child.emit('exit', 0, null)
      child.emit('close', 0, null)
      await Promise.resolve()
      await Promise.resolve()
      expect(
        bridgeMessages(logWarning).filter((m) => m.endsWith('[ts] tail'))
      ).toEqual(['bridge helper [42]: [ts] tail'])
    })

    test('B-WR-1: a final unterminated line arriving after exit but before close is not lost', async () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      ;(logWarning as jest.Mock).mockClear()
      void ensureBridgeHelperReady(helperDeps, '42')
      child.emit('exit', 1, null)
      await Promise.resolve()
      await Promise.resolve()
      // Not flushed on exit: the pipes are still open and may deliver more.
      child.stderr.emit('data', Buffer.from('[ts] late tail'))
      expect(
        bridgeMessages(logWarning).filter((m) => m.endsWith('late tail'))
      ).toEqual([])
      child.emit('close', 1, null)
      await Promise.resolve()
      await Promise.resolve()
      expect(
        bridgeMessages(logWarning).filter((m) => m.endsWith('late tail'))
      ).toEqual(['bridge helper [42]: [ts] late tail'])
    })

    test('stdout gets the same carry-over via logInfo', () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      ;(logInfo as jest.Mock).mockClear()
      void ensureBridgeHelperReady(helperDeps, '42')
      child.stdout.emit('data', Buffer.from('hel'))
      child.stdout.emit('data', Buffer.from('lo\n'))
      expect(bridgeMessages(logInfo)).toEqual(['bridge helper [42]: hello'])
    })
  })

  describe('runner wiring (spawnLongLived)', () => {
    test('spawns as steam-bridge-helper-<appId> with replaceEnv over the exact merged env carrying the launch secret', () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      void ensureBridgeHelperReady(helperDeps, '123')
      expect(mockedSpawn).toHaveBeenCalledTimes(1)
      const opts = mockedSpawn.mock.calls[0][2]
      expect(opts.id).toBe('steam-bridge-helper-123')
      expect(opts.replaceEnv).toBe(true)
      expect(opts.env[BRIDGE_SECRET_ENV]).toMatch(/^[0-9a-f]{64}$/)
      expect(Object.keys(opts.env)).toEqual(
        expect.arrayContaining(Object.keys(process.env))
      )
    })

    test('the registered teardown stops that appId helper (the runner calls it at quit)', () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      void ensureBridgeHelperReady(helperDeps, '123')
      expect(registry.hasLive()).toBe(true)
      fakeRunner.teardownAll()
      expect(child.kill).toHaveBeenCalledTimes(1)
      expect(registry.hasLive()).toBe(false)
    })

    test('an exit deletes the registry entry only while it still holds that same handle', async () => {
      const first = new FakeChildProcess()
      const second = new FakeChildProcess()
      mockedSpawn.mockReturnValueOnce(first).mockReturnValueOnce(second)
      void ensureBridgeHelperReady(helperDeps, '123')
      // Replace the entry with a newer helper for the same appId, as a respawn does.
      registry.stop('123')
      void ensureBridgeHelperReady(helperDeps, '123')
      expect(mockedSpawn).toHaveBeenCalledTimes(2)
      // The first process's late exit must not evict the second helper.
      first.emit('exit', 0, null)
      await Promise.resolve()
      await Promise.resolve()
      expect(registry.hasLive()).toBe(true)
      second.emit('exit', 0, null)
      await Promise.resolve()
      await Promise.resolve()
      expect(registry.hasLive()).toBe(false)
    })
  })

  // Quick 261117-ubb: the pinned libsteam_api.dylib path rides on argv, never env.
  describe('--steam-api-dylib argv', () => {
    const PINNED = '/abs/steam-api/4162eb40/libsteam_api.dylib'
    const argvOfNextSpawn = (
      appId: string,
      options?: Parameters<typeof ensureHelperSpawned>[2]
    ): string[] => {
      mockedSpawn.mockReturnValue(new FakeChildProcess())
      ensureHelperSpawned(helperDeps, appId, options)
      return mockedSpawn.mock.calls[mockedSpawn.mock.calls.length - 1][1]
    }

    test('a full spawn appends the flag and path', () => {
      expect(argvOfNextSpawn('411300', { steamApiDylib: PINNED })).toEqual([
        '--appid',
        '411300',
        '--port',
        '0',
        '--steam-api-dylib',
        PINNED
      ])
    })

    test('an identity-only spawn appends the flag and path', () => {
      expect(
        argvOfNextSpawn('411300', { identityOnly: true, steamApiDylib: PINNED })
      ).toEqual([
        '--appid',
        '480',
        '--port',
        '0',
        '--identity-only',
        '--report-appid',
        '411300',
        '--steam-api-dylib',
        PINNED
      ])
    })

    test.each([[undefined], [null], ['']])(
      'steamApiDylib=%p leaves argv unchanged',
      (steamApiDylib) => {
        expect(argvOfNextSpawn('411300', { steamApiDylib })).toEqual([
          '--appid',
          '411300',
          '--port',
          '0'
        ])
      }
    )

    test('the path is not secret: the launch secret stays env-only', () => {
      const argv = argvOfNextSpawn('411300', { steamApiDylib: PINNED })
      const options = mockedSpawn.mock.calls[0][2]
      expect(argv.some((a) => a.includes(options.env[BRIDGE_SECRET_ENV]))).toBe(
        false
      )
    })
  })

  test.each([
    [NOT_RUNNING, 'steam-not-running'],
    [SIGNING_IN, 'steam-not-signed-in'],
    ['some other InitFlat error', 'other'],
    ['', 'other'],
    [null, 'other']
  ])('classifyInitFlatError(%p) -> %s', (err, expected) => {
    expect(classifyInitFlatError(err)).toBe(expected)
  })
})
