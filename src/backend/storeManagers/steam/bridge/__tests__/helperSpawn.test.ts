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

// Phase 65 Plan 15 (D-03): helperSpawn.ts (spawn, stderr relay, line parsing) -- split out of helperProcess.test.ts by owning module.

import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { Socket } from 'node:net'
import { sendFrontendMessage } from 'backend/ipc'
import { logInfo, logWarning } from 'backend/logger'
import { encodeResponse, STATUS_OK } from '../protocol'
import { ensureBridgeHelperReady } from '../helperProcess'
import { classifyInitFlatError } from '../helperSpawn'
import { __resetBridgeHelperStateForTests } from '../helperRegistry'
import { __resetLongLivedChildrenForTests } from 'backend/longLivedChildren'
import { app } from 'backend/platform'
import { acknowledgeDialogDisplay } from 'backend/dialog/displayAck'

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
    __resetBridgeHelperStateForTests()
    __resetLongLivedChildrenForTests()
    mockedSpawn.mockReset()
  })

  // Phase 58 Plan 31 (T-58-103): the helper's INVITE dialog line opens the picker window,
  // own-stream and own-appid only, debounced. Quick 261101-llf: it opens the dedicated
  // `bridge-invite` window instead of raising and pushing to the main window.
  describe('INVITE dialog line', () => {
    const invite = (appId: string) =>
      Buffer.from(`[2026-11-01T00:00:00Z] INVITE dialog appid=${appId}\n`)
    const open = app.openBridgeInvitePicker as jest.Mock
    beforeEach(() => {
      mockedSendFrontendMessage.mockClear()
      ;(app.raiseMainWindow as jest.Mock).mockClear()
      open.mockClear()
      open.mockResolvedValue(true)
    })
    const inviteCalls = () => open.mock.calls

    test('own appid -> one picker window open, no main-window raise or push', () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      ;(logInfo as jest.Mock).mockClear()
      void ensureBridgeHelperReady('3205720')
      child.stderr.emit('data', invite('3205720'))
      expect(open).toHaveBeenCalledTimes(1)
      expect(open).toHaveBeenCalledWith({
        appId: '3205720',
        ackId: expect.stringMatching(/.+/)
      })
      expect(app.raiseMainWindow).not.toHaveBeenCalled()
      expect(
        mockedSendFrontendMessage.mock.calls.filter(
          (c) => c[0] === 'steamBridgeInviteRequest'
        )
      ).toHaveLength(0)
      expect(logInfo).toHaveBeenCalledWith(
        'bridge invite [3205720]: picker window requested',
        'Steam'
      )
    })

    test('a failed picker open is logged', async () => {
      open.mockResolvedValue(false)
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      ;(logWarning as jest.Mock).mockClear()
      void ensureBridgeHelperReady('3205720')
      child.stderr.emit('data', invite('3205720'))
      await Promise.resolve()
      await Promise.resolve()
      expect(logWarning).toHaveBeenCalledWith(
        'bridge invite [3205720]: picker window failed',
        'Steam'
      )
    })

    test('no ack -> display=unconfirmed after the bounded timeout', () => {
      jest.useFakeTimers()
      try {
        const child = new FakeChildProcess()
        mockedSpawn.mockReturnValue(child)
        ;(logInfo as jest.Mock).mockClear()
        void ensureBridgeHelperReady('3205720')
        child.stderr.emit('data', invite('3205720'))
        jest.advanceTimersByTime(15_000)
        expect(logInfo).toHaveBeenCalledWith(
          'bridge invite [3205720]: display=unconfirmed timeout=15000',
          'Steam'
        )
      } finally {
        jest.useRealTimers()
      }
    })

    test('ack before the timeout -> display=confirmed', () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      ;(logInfo as jest.Mock).mockClear()
      void ensureBridgeHelperReady('3205720')
      child.stderr.emit('data', invite('3205720'))
      const ackId = inviteCalls()[0][0].ackId
      expect(acknowledgeDialogDisplay(ackId)).toBe(true)
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringMatching(
          /^bridge invite \[3205720\]: display=confirmed elapsedMs=\d+$/
        ),
        'Steam'
      )
    })

    test('a line naming another appid does nothing', () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      void ensureBridgeHelperReady('3205720')
      child.stderr.emit('data', invite('999'))
      expect(inviteCalls()).toHaveLength(0)
      expect(app.raiseMainWindow).not.toHaveBeenCalled()
    })

    test('a line from a stale child does nothing', () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      void ensureBridgeHelperReady('3205720')
      __resetBridgeHelperStateForTests()
      child.stderr.emit('data', invite('3205720'))
      expect(inviteCalls()).toHaveLength(0)
    })

    test('58 WR-05: the text embedded inside another line does nothing', () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      void ensureBridgeHelperReady('3205720')
      child.stderr.emit(
        'data',
        Buffer.from(
          '[2026-11-01T00:00:00Z] VER    name=x INVITE dialog appid=3205720\n'
        )
      )
      child.stderr.emit(
        'data',
        Buffer.from('INVITE dialog appid=3205720 trailing\n')
      )
      expect(inviteCalls()).toHaveLength(0)
      expect(app.raiseMainWindow).not.toHaveBeenCalled()
    })

    test('two lines within 2000 ms give one picker open', () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      void ensureBridgeHelperReady('3205720')
      child.stderr.emit('data', invite('3205720'))
      child.stderr.emit('data', invite('3205720'))
      expect(inviteCalls()).toHaveLength(1)
      expect(app.raiseMainWindow).not.toHaveBeenCalled()
    })
  })

  // 53-13 WR-03 (relay side): one log call per non-empty stderr line, each
  // with its own appid prefix and no embedded newline.
  test('stderr chunk of 3 lines -> 3 logWarning calls, each prefixed with the appid, none multi-line', () => {
    const child = new FakeChildProcess()
    mockedSpawn.mockReturnValue(child)
    ;(logWarning as jest.Mock).mockClear()

    void ensureBridgeHelperReady('42')
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

    const pending = ensureBridgeHelperReady(APP_ID_A)
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
      void ensureBridgeHelperReady('42')
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
      const pending = ensureBridgeHelperReady(APP_ID_A)
      const line = `[2026-10-17T00:00:00Z] LISTEN 127.0.0.1:55001 appid=${APP_ID_A} mode=full\n`
      child.stderr.emit('data', Buffer.from(line.slice(0, 30)))
      child.stderr.emit('data', Buffer.from(line.slice(30)))
      emitReadyLine(child, APP_ID_A)
      const result = await pending
      expect(result.ready).toBe(true)
    })

    test('a trailing partial line is flushed exactly once on stream end', () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      ;(logWarning as jest.Mock).mockClear()
      void ensureBridgeHelperReady('42')
      child.stderr.emit('data', Buffer.from('[ts] tail'))
      expect(bridgeMessages(logWarning)).toEqual([])
      child.stderr.emit('end')
      child.emit('close')
      expect(bridgeMessages(logWarning)).toEqual([
        'bridge helper [42]: [ts] tail'
      ])
    })

    test('stdout gets the same carry-over via logInfo', () => {
      const child = new FakeChildProcess()
      mockedSpawn.mockReturnValue(child)
      ;(logInfo as jest.Mock).mockClear()
      void ensureBridgeHelperReady('42')
      child.stdout.emit('data', Buffer.from('hel'))
      child.stdout.emit('data', Buffer.from('lo\n'))
      expect(bridgeMessages(logInfo)).toEqual(['bridge helper [42]: hello'])
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
