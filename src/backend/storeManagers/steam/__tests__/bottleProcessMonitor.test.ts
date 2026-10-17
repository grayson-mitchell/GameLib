/**
 * Unit tests for bottleProcessMonitor.ts (quick/261016-t3e) — install-
 * directory process polling that gives a bottled Steam launch real
 * started/stopped feedback on macOS.
 *
 * Mock strategy follows steam/__tests__/clientSetup.test.ts:
 *  - backend/utils mocked (spawnAsync) — no real `ps` spawn
 *  - backend/logger mocked (logInfo/logWarning/LogPrefix)
 *  - ../../ipc mocked (sendFrontendMessage) — three-level relative spelling
 *    from this __tests__ directory
 *  - backend/constants/environment mocked as a MUTABLE double (isMac
 *    defaults true; flipped per-test via jest.requireMock for case (h))
 */
import { join } from 'node:path'
import { spawnAsync } from 'backend/utils'
import { logInfo, logWarning } from 'backend/logger'
import { sendFrontendMessage } from '../../../ipc'
import { getBottleDir } from '../bottle'
import { DEFAULT_STEAM_BOTTLE_NAME } from '../constants'
import {
  startBottleProcessMonitor,
  stopBottleProcessMonitor,
  __stopAllBottleProcessMonitors,
  __getActiveMonitorKindForTests
} from '../bottleProcessMonitor'

// Importing `getBottleDir` from '../bottle' evaluates the whole module, so
// its own module-load-time dependencies need the same mocks bottle.test.ts
// uses — none of these are exercised by this file's tests, they only need to
// not throw at import time.
jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  rmSync: jest.fn()
}))

jest.mock('backend/platform', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/mock-path'),
    getAppPath: () => '/tmp/mock-path',
    hide: jest.fn()
  }
}))

jest.mock('../electronStores', () => ({
  steamBottleConfigStore: {
    get: jest.fn(),
    get_nodefault: jest.fn(),
    set: jest.fn()
  }
}))

jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

jest.mock('backend/utils', () => ({
  spawnAsync: jest.fn(),
  checkWineBeforeLaunch: jest.fn(),
  downloadFile: jest.fn()
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  getRunnerLogWriter: jest.fn().mockReturnValue({}),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

interface EnvironmentDouble {
  isMac: boolean
  isWindows: boolean
  isLinux: boolean
}

jest.mock('backend/constants/environment', () => ({
  isMac: true,
  isWindows: false,
  isLinux: false
}))

const mockedSpawnAsync = spawnAsync as jest.Mock
const mockedLogInfo = logInfo as jest.Mock
const mockedLogWarning = logWarning as jest.Mock
const mockedSendFrontendMessage = sendFrontendMessage as jest.Mock

const bottleDir = getBottleDir(DEFAULT_STEAM_BOTTLE_NAME)
const installPath = join(
  bottleDir,
  'drive_c',
  'Program Files (x86)',
  'Steam',
  'steamapps',
  'common',
  'Fallout 2'
)
const matchedPsLine =
  '  4242 C:\\Program Files (x86)\\Steam\\steamapps\\common\\Fallout 2\\fallout2.exe -windowed'

const flushMicrotasks = async (times = 10) => {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

describe('bottleProcessMonitor.ts', () => {
  let envMock: EnvironmentDouble

  beforeEach(() => {
    mockedSpawnAsync.mockReset()
    mockedLogInfo.mockReset()
    mockedLogWarning.mockReset()
    mockedSendFrontendMessage.mockReset()

    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
  })

  afterEach(() => {
    __stopAllBottleProcessMonitors()
    if (jest.isMockFunction(setTimeout)) {
      jest.useRealTimers()
    }
  })

  test('first ps match emits exactly one playing gameStatusUpdate and logs the matched pid', async () => {
    mockedSpawnAsync.mockResolvedValue({
      code: 0,
      stdout: matchedPsLine,
      stderr: ''
    })

    jest.useFakeTimers()
    startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })

    await jest.advanceTimersByTimeAsync(1500)
    await flushMicrotasks()

    expect(mockedSendFrontendMessage).toHaveBeenCalledTimes(1)
    expect(mockedSendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: '38410',
      runner: 'steam',
      status: 'playing'
    })
    expect(
      mockedLogInfo.mock.calls.some((call) =>
        JSON.stringify(call).includes('4242')
      )
    ).toBe(true)

    __stopAllBottleProcessMonitors()
    jest.useRealTimers()
  })

  test('the matched set emptying emits one done after playing, logs elapsed seconds, and stops polling', async () => {
    mockedSpawnAsync
      .mockResolvedValueOnce({ code: 0, stdout: matchedPsLine, stderr: '' })
      .mockResolvedValue({ code: 0, stdout: '', stderr: '' })

    jest.useFakeTimers()
    startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })

    await jest.advanceTimersByTimeAsync(1500)
    await flushMicrotasks()
    expect(mockedSendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: '38410',
      runner: 'steam',
      status: 'playing'
    })

    await jest.advanceTimersByTimeAsync(1500)
    await flushMicrotasks()

    expect(mockedSendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: '38410',
      runner: 'steam',
      status: 'done'
    })
    expect(
      mockedLogInfo.mock.calls.some((call) =>
        JSON.stringify(call).match(/\d+s/)
      )
    ).toBe(true)

    const callsAfterDone = mockedSpawnAsync.mock.calls.length
    await jest.advanceTimersByTimeAsync(1500 * 5)
    await flushMicrotasks()
    expect(mockedSpawnAsync.mock.calls.length).toBe(callsAfterDone)

    jest.useRealTimers()
  })

  // (a) prefix derivation under BOTH Steam roots.
  test.each([
    ['Program Files (x86)', 'Program Files (x86)'],
    ['Program Files', 'Program Files']
  ])(
    'matches a process under the %s root',
    async (installSegment, psSegment) => {
      const rootInstallPath = join(
        bottleDir,
        'drive_c',
        installSegment,
        'Steam',
        'steamapps',
        'common',
        'Fallout 2'
      )
      const rootPsLine = `  4242 C:\\${psSegment}\\Steam\\steamapps\\common\\Fallout 2\\fallout2.exe`
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: rootPsLine,
        stderr: ''
      })

      jest.useFakeTimers()
      startBottleProcessMonitor({
        appId: '38410',
        installPath: rootInstallPath,
        bottleDir
      })
      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()

      expect(mockedSendFrontendMessage).toHaveBeenCalledWith(
        'gameStatusUpdate',
        { appName: '38410', runner: 'steam', status: 'playing' }
      )

      __stopAllBottleProcessMonitors()
      jest.useRealTimers()
    }
  )

  // (b) case-insensitive match: lowercased command line still matches a
  // mixed-case installPath, and the matcher ignores an unrelated native
  // macOS process line plus steam.exe's own command line in the same tick.
  test('matches a lowercase-spelled ps command line against a mixed-case installPath', async () => {
    const lowercaseLine =
      '  4242 c:\\program files (x86)\\steam\\steamapps\\common\\fallout 2\\fallout2.exe'
    const unrelatedMacLine =
      '   100 /Applications/Safari.app/Contents/MacOS/Safari'
    const steamClientLine = '    99 C:\\Program Files (x86)\\Steam\\steam.exe'
    mockedSpawnAsync.mockResolvedValue({
      code: 0,
      stdout: [lowercaseLine, unrelatedMacLine, steamClientLine].join('\n'),
      stderr: ''
    })

    jest.useFakeTimers()
    startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })
    await jest.advanceTimersByTimeAsync(1500)
    await flushMicrotasks()

    expect(mockedSendFrontendMessage).toHaveBeenCalledTimes(1)
    expect(mockedSendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: '38410',
      runner: 'steam',
      status: 'playing'
    })

    __stopAllBottleProcessMonitors()
    jest.useRealTimers()
  })

  // (c) sibling-prefix non-match.
  test('a sibling directory sharing a name prefix never produces a match', async () => {
    const avernum4InstallPath = join(
      bottleDir,
      'drive_c',
      'Program Files (x86)',
      'Steam',
      'steamapps',
      'common',
      'Avernum 4'
    )
    const siblingPsLine =
      '  5000 C:\\Program Files (x86)\\Steam\\steamapps\\common\\Avernum 4 Remaster\\avernum4.exe'
    mockedSpawnAsync.mockResolvedValue({
      code: 0,
      stdout: siblingPsLine,
      stderr: ''
    })

    jest.useFakeTimers()
    startBottleProcessMonitor({
      appId: '12345',
      installPath: avernum4InstallPath,
      bottleDir
    })
    await jest.advanceTimersByTimeAsync(1500 * 3)
    await flushMicrotasks()

    expect(mockedSendFrontendMessage).not.toHaveBeenCalled()

    __stopAllBottleProcessMonitors()
    jest.useRealTimers()
  })

  // (d) no deadline on the first match.
  test('four consecutive empty polls emit nothing; a match on the fifth emits exactly one playing', async () => {
    mockedSpawnAsync
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValue({ code: 0, stdout: matchedPsLine, stderr: '' })

    jest.useFakeTimers()
    startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })

    for (let i = 0; i < 4; i++) {
      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()
    }
    expect(mockedSendFrontendMessage).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(1500)
    await flushMicrotasks()
    expect(mockedSendFrontendMessage).toHaveBeenCalledTimes(1)

    // sixth, still-matching tick: no re-emission.
    await jest.advanceTimersByTimeAsync(1500)
    await flushMicrotasks()
    expect(mockedSendFrontendMessage).toHaveBeenCalledTimes(1)

    __stopAllBottleProcessMonitors()
    jest.useRealTimers()
  })

  // (f) restarting for the same appId cancels the prior monitor.
  test('starting a second monitor for the same appId cancels the first', async () => {
    mockedSpawnAsync.mockResolvedValue({
      code: 0,
      stdout: matchedPsLine,
      stderr: ''
    })

    jest.useFakeTimers()
    startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })
    await jest.advanceTimersByTimeAsync(1500)
    await flushMicrotasks()
    expect(mockedSendFrontendMessage).toHaveBeenCalledTimes(1)

    mockedSendFrontendMessage.mockClear()
    mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    // A fresh monitor for the SAME appId — stops the first (whose next sleep
    // is still pending) before it can poll again.
    startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })

    await jest.advanceTimersByTimeAsync(1500 * 3)
    await flushMicrotasks()

    const doneCalls = mockedSendFrontendMessage.mock.calls.filter(
      (call) => call[1].status === 'done'
    )
    const playingCalls = mockedSendFrontendMessage.mock.calls.filter(
      (call) => call[1].status === 'playing'
    )
    // The restarted monitor never sees a match (every poll after restart
    // resolves empty), so it never emits playing; the cancelled first
    // monitor's pending timer was cleared, so it cannot emit a leaked done.
    expect(playingCalls.length).toBe(0)
    expect(doneCalls.length).toBeLessThanOrEqual(1)

    __stopAllBottleProcessMonitors()
    jest.useRealTimers()
  })

  // (g) teardown is total: jest.getTimerCount() returns to 0.
  test('jest.getTimerCount() returns to 0 after stopBottleProcessMonitor(appId)', async () => {
    mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })

    jest.useFakeTimers()
    startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })
    await flushMicrotasks()
    expect(jest.getTimerCount()).toBeGreaterThan(0)

    stopBottleProcessMonitor('38410')
    expect(jest.getTimerCount()).toBe(0)

    jest.useRealTimers()
  })

  test('jest.getTimerCount() returns to 0 after __stopAllBottleProcessMonitors()', async () => {
    mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })

    jest.useFakeTimers()
    startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })
    startBottleProcessMonitor({
      appId: '440',
      installPath: join(bottleDir, 'drive_c', 'Program Files (x86)', 'Steam'),
      bottleDir
    })
    await flushMicrotasks()
    expect(jest.getTimerCount()).toBeGreaterThan(0)

    __stopAllBottleProcessMonitors()
    expect(jest.getTimerCount()).toBe(0)

    jest.useRealTimers()
  })

  // (h) non-mac: no-op.
  test('on a non-mac host, starting the monitor performs no spawn and sends no message', async () => {
    envMock.isMac = false

    startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })
    await flushMicrotasks()

    expect(mockedSpawnAsync).not.toHaveBeenCalled()
    expect(mockedSendFrontendMessage).not.toHaveBeenCalled()
  })

  // Phase 51 Plan 01 (D-51-01): onStopped + kind.
  describe('onStopped + kind (D-51-01)', () => {
    test('onStopped is called exactly once when the matched set empties after a match', async () => {
      const onStopped = jest.fn()
      mockedSpawnAsync
        .mockResolvedValueOnce({ code: 0, stdout: matchedPsLine, stderr: '' })
        .mockResolvedValue({ code: 0, stdout: '', stderr: '' })

      jest.useFakeTimers()
      startBottleProcessMonitor({
        appId: '38410',
        installPath,
        bottleDir,
        kind: 'bridge',
        onStopped
      })

      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()
      expect(onStopped).not.toHaveBeenCalled()

      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()
      expect(onStopped).toHaveBeenCalledTimes(1)

      // Further ticks (the monitor already tore itself down) never re-call it.
      await jest.advanceTimersByTimeAsync(1500 * 3)
      await flushMicrotasks()
      expect(onStopped).toHaveBeenCalledTimes(1)

      jest.useRealTimers()
    })

    test('onStopped is never called when stopBottleProcessMonitor() cancels the monitor first', async () => {
      const onStopped = jest.fn()
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: matchedPsLine,
        stderr: ''
      })

      jest.useFakeTimers()
      startBottleProcessMonitor({
        appId: '38410',
        installPath,
        bottleDir,
        kind: 'bridge',
        onStopped
      })

      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()
      expect(mockedSendFrontendMessage).toHaveBeenCalledWith(
        'gameStatusUpdate',
        { appName: '38410', runner: 'steam', status: 'playing' }
      )

      stopBottleProcessMonitor('38410')
      await jest.advanceTimersByTimeAsync(1500 * 3)
      await flushMicrotasks()

      expect(onStopped).not.toHaveBeenCalled()

      jest.useRealTimers()
    })

    test('onStopped is never called when a throwing callback is passed -- clearEntry still runs', async () => {
      const onStopped = jest.fn(() => {
        throw new Error('boom')
      })
      mockedSpawnAsync
        .mockResolvedValueOnce({ code: 0, stdout: matchedPsLine, stderr: '' })
        .mockResolvedValue({ code: 0, stdout: '', stderr: '' })

      jest.useFakeTimers()
      startBottleProcessMonitor({
        appId: '38410',
        installPath,
        bottleDir,
        kind: 'bridge',
        onStopped
      })

      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()
      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()

      expect(onStopped).toHaveBeenCalledTimes(1)
      expect(jest.getTimerCount()).toBe(0)

      jest.useRealTimers()
    })

    test('kind defaults to "bottled-steam" when omitted', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })

      jest.useFakeTimers()
      startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })
      await flushMicrotasks()

      expect(__getActiveMonitorKindForTests('38410')).toBe('bottled-steam')

      __stopAllBottleProcessMonitors()
      jest.useRealTimers()
    })

    test('kind is carried through as "bridge" when passed explicitly', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })

      jest.useFakeTimers()
      startBottleProcessMonitor({
        appId: '38410',
        installPath,
        bottleDir,
        kind: 'bridge'
      })
      await flushMicrotasks()

      expect(__getActiveMonitorKindForTests('38410')).toBe('bridge')

      __stopAllBottleProcessMonitors()
      jest.useRealTimers()
    })
  })
})
