/**
 * Phase 54 (54-01): the go-offline wrap (ROADMAP SC6). Driven only through
 * injected deps: fixture logs live in a mkdtemp dir, pgrep is never spawned.
 */
import * as fs from 'fs'
import * as os from 'os'
import { join } from 'path'

// fs namespace properties are non-configurable, so wrap the two calls the
// fd-leak assertions need in jest.fn passthroughs.
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  openSync: jest.fn(),
  closeSync: jest.fn()
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/platform', () => ({
  shell: { openExternal: jest.fn() }
}))
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: () => ({ getSettings: () => ({ defaultSteamPath: '' }) })
  }
}))

import {
  GuidedOfflineRequiredError,
  GUIDED_RESTORE_TTL_MS,
  STEAM_GO_OFFLINE_URL,
  STEAM_GO_ONLINE_URL,
  __macSteamOnlineConfirmForTests,
  __resetMacSteamOfflineForTests,
  checkGuidedOfflineReady,
  readMacSteamCmState,
  watchConnectionLog,
  withMacSteamOffline,
  type MacSteamOfflineDeps
} from '../macSteamOffline'

const ONLINE_LINE =
  '[2026-10-27 13:07:22] [Logged On, 4, 19] [U:1:1] RecvMsgClientLogOnResponse() : processing complete\r\n'
const OFFLINE_LINE =
  '[2026-10-27 13:07:14] [Logged Off, 0, 0] [U:1:1] ConnectionDisconnected() not auto reconnecting due to user initiated logoff\r\n'
const LOGOFF_LINE =
  '[2026-10-27 13:08:00] [Logged Off, 0, 0] [U:1:1] ConnectionDisconnected() not auto reconnecting due to user initiated logoff\r\n'

let dir: string
let logPath: string
let clock: number
let urls: string[]
let running: boolean | Error

function makeDeps(
  overrides: Partial<MacSteamOfflineDeps> = {}
): MacSteamOfflineDeps {
  return {
    platform: 'darwin',
    connectionLogPath: () => logPath,
    isSteamRunning: async () => {
      if (running instanceof Error) throw running
      return running
    },
    openUrl: (url) => {
      urls.push(url)
    },
    sleep: async (ms) => {
      clock += ms
    },
    now: () => clock,
    onlineDebtPath: () => join(dir, 'owed.json'),
    openUrlDetached: (url) => {
      urls.push(url)
    },
    selfPid: 4242,
    isPidAlive: () => false,
    ...overrides
  }
}

beforeEach(() => {
  // resetMocks: true wipes jest.fn implementations before every test.
  const actualFs = jest.requireActual<typeof fs>('fs')
  ;(fs.openSync as jest.Mock).mockImplementation(
    (...a: Parameters<typeof fs.openSync>) => actualFs.openSync(...a)
  )
  ;(fs.closeSync as jest.Mock).mockImplementation(
    (...a: Parameters<typeof fs.closeSync>) => actualFs.closeSync(...a)
  )
  dir = fs.mkdtempSync(join(os.tmpdir(), 'gamelib-macsteam-'))
  logPath = join(dir, 'connection_log.txt')
  clock = 0
  urls = []
  running = true
  __resetMacSteamOfflineForTests()
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('readMacSteamCmState', () => {
  it('returns the state of the last bracketed line, ignoring unbracketed lines and CR', () => {
    fs.writeFileSync(
      logPath,
      ONLINE_LINE +
        OFFLINE_LINE +
        '[2026-10-27 13:07:21] CCMInterface::YieldingConnect -- x\r\n'
    )
    expect(readMacSteamCmState(logPath)).toBe('Logged Off')
  })

  it('returns null for a missing file', () => {
    expect(readMacSteamCmState(join(dir, 'nope.txt'))).toBeNull()
  })
})

describe('withMacSteamOffline', () => {
  it('already offline: connects with no URL fired', async () => {
    fs.writeFileSync(logPath, OFFLINE_LINE)
    const connect = jest.fn().mockResolvedValue('v')
    const r = await withMacSteamOffline(connect, makeDeps())
    expect(connect).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledWith('already-offline')
    expect(r).toEqual({ value: 'v', wrap: 'already-offline' })
    expect(urls).toEqual([])
  })

  it('not running: connects with no URL fired', async () => {
    running = false
    fs.writeFileSync(logPath, ONLINE_LINE)
    const connect = jest.fn().mockResolvedValue('v')
    await withMacSteamOffline(connect, makeDeps())
    expect(connect).toHaveBeenCalledWith('not-running')
    expect(urls).toEqual([])
  })

  it('LogOff seen after the fire: connects then goes online once', async () => {
    fs.writeFileSync(logPath, ONLINE_LINE)
    const order: string[] = []
    const deps = makeDeps({
      openUrl: (url) => {
        urls.push(url)
        order.push(url)
        if (url === STEAM_GO_OFFLINE_URL)
          fs.appendFileSync(logPath, LOGOFF_LINE)
      },
      // 54-REVIEW WR-01: the goonline goes through the detached opener.
      openUrlDetached: (url) => {
        urls.push(url)
        order.push(url)
      }
    })
    const connect = jest.fn(async () => {
      order.push('connect')
      return 'v'
    })
    const r = await withMacSteamOffline(connect, deps)
    expect(r.wrap).toBe('toggled')
    expect(connect).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledWith('toggled')
    expect(order).toEqual([
      STEAM_GO_OFFLINE_URL,
      'connect',
      STEAM_GO_ONLINE_URL
    ])
    expect(clock).toBeGreaterThanOrEqual(2000)
  })

  it('a LogOff line already in the file before the call does not count', async () => {
    fs.writeFileSync(logPath, OFFLINE_LINE + ONLINE_LINE)
    const connect = jest.fn()
    await expect(
      withMacSteamOffline(connect, makeDeps())
    ).rejects.toBeInstanceOf(GuidedOfflineRequiredError)
    expect(connect).not.toHaveBeenCalled()
    expect(clock).toBeGreaterThanOrEqual(5000)
  })

  it('LogOff not seen: throws, no connect, no goonline', async () => {
    fs.writeFileSync(logPath, ONLINE_LINE)
    const connect = jest.fn()
    const err = await withMacSteamOffline(connect, makeDeps()).catch((e) => e)
    expect(err).toBeInstanceOf(GuidedOfflineRequiredError)
    expect(err.cause).toBe('logoff-not-seen')
    expect(connect).not.toHaveBeenCalled()
    expect(urls).toEqual([STEAM_GO_OFFLINE_URL])
  })

  it('running probe error: throws with no URL fired and no connect', async () => {
    running = new Error('ENOENT')
    const connect = jest.fn()
    const err = await withMacSteamOffline(connect, makeDeps()).catch((e) => e)
    expect(err).toBeInstanceOf(GuidedOfflineRequiredError)
    expect(err.cause).toBe('running-probe-failed')
    expect(connect).not.toHaveBeenCalled()
    expect(urls).toEqual([])
  })

  it('connect throws: the error propagates and goonline still fires, without a settle wait', async () => {
    fs.writeFileSync(logPath, ONLINE_LINE)
    let clockAtOnline = -1
    const deps = makeDeps({
      openUrl: (url) => {
        urls.push(url)
        if (url === STEAM_GO_OFFLINE_URL)
          fs.appendFileSync(logPath, LOGOFF_LINE)
      },
      openUrlDetached: (url) => {
        urls.push(url)
        clockAtOnline = clock
      }
    })
    const connect = jest.fn().mockRejectedValue(new Error('boom'))
    await expect(withMacSteamOffline(connect, deps)).rejects.toThrow('boom')
    expect(urls).toEqual([STEAM_GO_OFFLINE_URL, STEAM_GO_ONLINE_URL])
    expect(clockAtOnline).toBeGreaterThanOrEqual(0)
    expect(clockAtOnline).toBeLessThan(2000)
  })

  it.each(['win32', 'linux'] as const)(
    '%s passes straight through: no URL, no fs read',
    async (platform) => {
      const open = fs.openSync as jest.Mock
      open.mockClear()
      const connect = jest.fn().mockResolvedValue('v')
      const r = await withMacSteamOffline(connect, makeDeps({ platform }))
      expect(connect).toHaveBeenCalledWith('not-darwin')
      expect(r.wrap).toBe('not-darwin')
      expect(urls).toEqual([])
      expect(open).not.toHaveBeenCalled()
    }
  )
})

describe('guided restore', () => {
  it('checkGuidedOfflineReady arms a one-shot restore', async () => {
    fs.writeFileSync(logPath, OFFLINE_LINE)
    const deps = makeDeps({
      openUrlDetached: (url) => {
        urls.push(url)
        fs.appendFileSync(logPath, ONLINE_LINE)
      }
    })
    expect(await checkGuidedOfflineReady(deps)).toEqual({ status: 'ready' })
    const connect = jest.fn().mockResolvedValue('v')
    const r = await withMacSteamOffline(connect, deps)
    expect(r.wrap).toBe('guided-restore')
    expect(urls).toEqual([STEAM_GO_ONLINE_URL])
    // 54-REVIEW WR-01: the marker clears once Steam is confirmed online.
    await __macSteamOnlineConfirmForTests()
    urls.length = 0
    // The user then goes offline again by choice.
    fs.appendFileSync(logPath, OFFLINE_LINE)
    const r2 = await withMacSteamOffline(connect, deps)
    expect(r2.wrap).toBe('already-offline')
    expect(urls).toEqual([])
  })

  it('the flag expires after 10 minutes', async () => {
    fs.writeFileSync(logPath, OFFLINE_LINE)
    const deps = makeDeps()
    await checkGuidedOfflineReady(deps)
    // 54-12: the guided check now also records the owed-goonline marker, which
    // independently arms the restore. Drop it to isolate the TTL flag.
    fs.rmSync(join(dir, 'owed.json'), { force: true })
    clock += GUIDED_RESTORE_TTL_MS
    const r = await withMacSteamOffline(jest.fn().mockResolvedValue(1), deps)
    expect(r.wrap).toBe('already-offline')
    expect(urls).toEqual([])
  })

  it('reports still-online, not-macos and ready (not running)', async () => {
    fs.writeFileSync(logPath, ONLINE_LINE)
    expect(await checkGuidedOfflineReady(makeDeps())).toEqual({
      status: 'still-online'
    })
    expect(
      await checkGuidedOfflineReady(makeDeps({ platform: 'linux' }))
    ).toEqual({ status: 'not-macos' })
    running = false
    expect(await checkGuidedOfflineReady(makeDeps())).toEqual({
      status: 'ready'
    })
  })
})

describe('watchConnectionLog', () => {
  it('closes every fd it opens and carries a partial last line across polls', async () => {
    fs.writeFileSync(logPath, ONLINE_LINE)
    const openSpy = fs.openSync as jest.Mock
    const closeSpy = fs.closeSync as jest.Mock
    openSpy.mockClear()
    closeSpy.mockClear()
    let polls = 0
    const deps = {
      now: () => clock,
      sleep: async (ms: number) => {
        clock += ms
        polls++
        if (polls === 1)
          fs.appendFileSync(logPath, '[t] [Logged Off, 0, 0] user initiated lo')
        if (polls === 2) fs.appendFileSync(logPath, 'goff\r\n')
      }
    }
    expect(
      await watchConnectionLog(logPath, /user initiated logoff/, 5000, deps)
    ).toBe(true)
    expect(openSpy.mock.calls.length).toBeGreaterThan(2)
    expect(closeSpy.mock.calls.length).toBe(openSpy.mock.calls.length)
  })
})
