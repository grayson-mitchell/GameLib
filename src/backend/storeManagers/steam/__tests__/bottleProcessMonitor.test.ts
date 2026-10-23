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
  readBoundedTail,
  classifyBottledSteamBlock,
  bottledSteamLogPaths
} from '../bottleLaunchSignals'
import { raiseWineGameWindow } from 'backend/utils/wineWindowRaise'
import {
  startBottleProcessMonitor,
  stopBottleProcessMonitor,
  getBottleProcessMonitorPhase,
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

jest.mock('backend/utils/wineWindowRaise', () => ({
  raiseWineGameWindow: jest.fn(),
  windowsExeNameFromCommand: jest.requireActual('backend/utils/wineWindowRaise')
    .windowsExeNameFromCommand
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

// D-51-16 (Phase 51 Plan 08): the waiting-state check reads real log tails
// and classifies them -- both mocked here so this file stays a pure
// poll-loop-timing test, with bottleLaunchSignals.ts's own fixtures-based
// unit tests (bottleLaunchSignals.test.ts) proving the real classification
// logic separately. `readBoundedTail` defaults to an immediately-resolving
// empty string; `classifyBottledSteamBlock` defaults to `null` (no cause
// detected) -- both overridden per-test as needed.
jest.mock('../bottleLaunchSignals', () => ({
  readBoundedTail: jest.fn().mockResolvedValue(''),
  classifyBottledSteamBlock: jest.fn().mockReturnValue(null),
  bottledSteamLogPaths: jest.fn().mockReturnValue({
    bootstrap:
      '/fake/bottle/drive_c/Program Files (x86)/Steam/logs/bootstrap_log.txt',
    console:
      '/fake/bottle/drive_c/Program Files (x86)/Steam/logs/console_log.txt',
    login:
      '/fake/bottle/drive_c/Program Files (x86)/Steam/logs/steamui_login.txt'
  }),
  WAITING_FOR_STEAM_GRACE_MS: 20000,
  WAITING_RECHECK_MS: 15000
}))

const mockedSpawnAsync = spawnAsync as jest.Mock
const mockedRaise = raiseWineGameWindow as jest.Mock
const mockedLogInfo = logInfo as jest.Mock
const mockedLogWarning = logWarning as jest.Mock
const mockedSendFrontendMessage = sendFrontendMessage as jest.Mock
const mockedReadBoundedTail = readBoundedTail as jest.Mock
const mockedClassifyBottledSteamBlock = classifyBottledSteamBlock as jest.Mock
const mockedBottledSteamLogPaths = bottledSteamLogPaths as jest.Mock

// jest.config's `resetMocks: true` wipes mockReturnValue/mockResolvedValue
// set in the `jest.mock(...)` factory above before EVERY test (see
// clientSetup.test.ts's own docstring) -- these defaults are re-established
// in beforeEach below rather than relying on the factory's one-time values.
const FAKE_LOG_PATHS = {
  bootstrap:
    '/fake/bottle/drive_c/Program Files (x86)/Steam/logs/bootstrap_log.txt',
  console:
    '/fake/bottle/drive_c/Program Files (x86)/Steam/logs/console_log.txt',
  login: '/fake/bottle/drive_c/Program Files (x86)/Steam/logs/steamui_login.txt'
}

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

const statusesFor = (appName: string) =>
  mockedSendFrontendMessage.mock.calls
    .filter((c) => c[0] === 'gameStatusUpdate' && c[1].appName === appName)
    .map((c) => c[1].status)

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
    mockedRaise.mockReset().mockResolvedValue(undefined)
    mockedReadBoundedTail.mockReset().mockResolvedValue('')
    mockedClassifyBottledSteamBlock.mockReset().mockReturnValue(null)
    mockedBottledSteamLogPaths.mockReset().mockReturnValue(FAKE_LOG_PATHS)

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

    expect(statusesFor('38410')).toEqual(['launching', 'playing'])
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

    expect(statusesFor('38410')).toEqual(['launching', 'playing'])
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

    expect(statusesFor('12345')).toEqual(['launching'])

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
    expect(statusesFor('38410')).toEqual(['launching'])

    await jest.advanceTimersByTimeAsync(1500)
    await flushMicrotasks()
    expect(statusesFor('38410')).toEqual(['launching', 'playing'])

    // sixth, still-matching tick: no re-emission.
    await jest.advanceTimersByTimeAsync(1500)
    await flushMicrotasks()
    expect(statusesFor('38410')).toEqual(['launching', 'playing'])

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
    expect(statusesFor('38410')).toEqual(['launching', 'playing'])

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
    // quick/261024-gvu: supersede is silent — only the fresh 'launching'.
    expect(doneCalls.length).toBe(0)
    expect(statusesFor('38410')).toEqual(['launching'])

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

  // Phase 51 Plan 23: launcherExited() handle + onStopped on every
  // non-supersede terminal path (51-UAT item 2, review WR-05).
  describe('launcherExited handle (51-23)', () => {
    const startBridge = (onStopped?: () => void) =>
      startBottleProcessMonitor({
        appId: '38410',
        installPath,
        bottleDir,
        kind: 'bridge',
        onStopped
      })

    test('returns a handle when started, null when not (non-mac, prefix outside drive_c)', () => {
      jest.useFakeTimers()
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      expect(startBridge()).not.toBeNull()
      __stopAllBottleProcessMonitors()

      envMock.isMac = false
      expect(startBridge()).toBeNull()
      envMock.isMac = true

      expect(
        startBottleProcessMonitor({
          appId: '1',
          installPath: '/elsewhere/game',
          bottleDir,
          kind: 'bridge'
        })
      ).toBeNull()
      jest.useRealTimers()
    })

    test('launcherExited before any match with nothing running fires onStopped once and clears', async () => {
      const onStopped = jest.fn()
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      jest.useFakeTimers()
      const handle = startBridge(onStopped)

      handle?.launcherExited()
      await flushMicrotasks()
      expect(onStopped).toHaveBeenCalledTimes(1)
      expect(statusesFor('38410')).toEqual(['launching', 'done'])
      expect(
        mockedLogInfo.mock.calls.some((c) =>
          JSON.stringify(c).includes(
            'launcher exited before any game process matched'
          )
        )
      ).toBe(true)
      expect(jest.getTimerCount()).toBe(0)

      handle?.launcherExited()
      await flushMicrotasks()
      expect(onStopped).toHaveBeenCalledTimes(1)
      jest.useRealTimers()
    })

    test('launcherExited before any match but a game process exists records the match and does not stop', async () => {
      const onStopped = jest.fn()
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: matchedPsLine,
        stderr: ''
      })
      jest.useFakeTimers()
      const handle = startBridge(onStopped)

      handle?.launcherExited()
      await flushMicrotasks()
      expect(onStopped).not.toHaveBeenCalled()
      expect(mockedSendFrontendMessage).toHaveBeenCalledWith(
        'gameStatusUpdate',
        { appName: '38410', runner: 'steam', status: 'playing' }
      )

      // The poll loop later owns teardown, firing onStopped once.
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()
      expect(onStopped).toHaveBeenCalledTimes(1)
      jest.useRealTimers()
    })

    test('launcherExited after a match is a no-op', async () => {
      const onStopped = jest.fn()
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: matchedPsLine,
        stderr: ''
      })
      jest.useFakeTimers()
      const handle = startBridge(onStopped)
      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()

      handle?.launcherExited()
      await flushMicrotasks()
      expect(onStopped).not.toHaveBeenCalled()
      jest.useRealTimers()
    })

    test('launcherExited on a superseded entry does not fire either onStopped', async () => {
      const firstStopped = jest.fn()
      const secondStopped = jest.fn()
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      jest.useFakeTimers()
      const first = startBridge(firstStopped)
      startBridge(secondStopped)

      first?.launcherExited()
      await flushMicrotasks()
      expect(firstStopped).not.toHaveBeenCalled()
      expect(secondStopped).not.toHaveBeenCalled()
      jest.useRealTimers()
    })

    test('ps give-up after 20 consecutive failures fires onStopped exactly once (WR-05)', async () => {
      const onStopped = jest.fn()
      mockedSpawnAsync.mockRejectedValue(new Error('ps wedged'))
      jest.useFakeTimers()
      startBridge(onStopped)

      for (let i = 0; i < 25; i++) {
        await jest.advanceTimersByTimeAsync(1500)
        await flushMicrotasks()
      }
      expect(onStopped).toHaveBeenCalledTimes(1)
      // quick/261024-gvu: give-up with no match now clears Launching.
      expect(statusesFor('38410')).toEqual(['launching', 'done'])
      expect(jest.getTimerCount()).toBe(0)
      jest.useRealTimers()
    })

    test('a throwing onStopped is caught on the launcherExited path', async () => {
      const onStopped = jest.fn(() => {
        throw new Error('boom')
      })
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      jest.useFakeTimers()
      const handle = startBridge(onStopped)

      handle?.launcherExited()
      await flushMicrotasks()
      expect(onStopped).toHaveBeenCalledTimes(1)
      expect(
        mockedLogWarning.mock.calls.some((c) =>
          JSON.stringify(c).includes('onStopped callback threw')
        )
      ).toBe(true)
      jest.useRealTimers()
    })

    test('a ps failure during the immediate check counts as no match', async () => {
      const onStopped = jest.fn()
      mockedSpawnAsync.mockRejectedValue(new Error('ps wedged'))
      jest.useFakeTimers()
      const handle = startBridge(onStopped)

      handle?.launcherExited()
      await flushMicrotasks()
      expect(onStopped).toHaveBeenCalledTimes(1)
      jest.useRealTimers()
    })
  })

  // Phase 51 Plan 08 (D-51-16, folded todo): waiting-state emission.
  describe('launching hold (261024-gvu)', () => {
    test('cause=none past the grace window never gives up: no done, phase starting, one waiting message', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      jest.useFakeTimers()
      startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })

      // 20s grace + 15s + 15s re-checks, all with an empty ps.
      await jest.advanceTimersByTimeAsync(55000)
      await flushMicrotasks()

      expect(statusesFor('38410')).toEqual(['launching'])
      expect(getBottleProcessMonitorPhase('38410')).toBe('starting')
      const noneLogs = mockedLogInfo.mock.calls.filter((c) =>
        JSON.stringify(c).includes('[bottle-waiting] appId=38410 cause=none')
      )
      expect(noneLogs.length).toBe(1)
      const waiting = mockedSendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'steamBottleLaunchWaiting'
      )
      expect(waiting.length).toBe(1)
      expect(waiting[0][1]).toEqual({ appName: '38410', detectedCause: null })

      __stopAllBottleProcessMonitors()
      jest.useRealTimers()
    })

    test('phase is null before start, running after the first match, null after gone with exactly one done', async () => {
      expect(getBottleProcessMonitorPhase('38410')).toBeNull()
      mockedSpawnAsync
        .mockResolvedValueOnce({ code: 0, stdout: matchedPsLine, stderr: '' })
        .mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      jest.useFakeTimers()
      startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })
      expect(getBottleProcessMonitorPhase('38410')).toBe('starting')

      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()
      expect(getBottleProcessMonitorPhase('38410')).toBe('running')

      await jest.advanceTimersByTimeAsync(1500 * 3)
      await flushMicrotasks()
      expect(statusesFor('38410')).toEqual(['launching', 'playing', 'done'])
      expect(getBottleProcessMonitorPhase('38410')).toBeNull()
      jest.useRealTimers()
    })

    test('launching is sent synchronously for both kinds', () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      jest.useFakeTimers()
      startBottleProcessMonitor({
        appId: '1',
        installPath,
        bottleDir,
        kind: 'bridge'
      })
      expect(statusesFor('1')).toEqual(['launching'])
      startBottleProcessMonitor({ appId: '2', installPath, bottleDir })
      expect(statusesFor('2')).toEqual(['launching'])
      __stopAllBottleProcessMonitors()
      jest.useRealTimers()
    })

    test.each(['starting', 'running'] as const)(
      'external stop while %s sends exactly one done; a second stop sends nothing',
      async (phase) => {
        mockedSpawnAsync.mockResolvedValue({
          code: 0,
          stdout: phase === 'running' ? matchedPsLine : '',
          stderr: ''
        })
        jest.useFakeTimers()
        startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })
        if (phase === 'running') {
          await jest.advanceTimersByTimeAsync(1500)
          await flushMicrotasks()
        }
        expect(getBottleProcessMonitorPhase('38410')).toBe(phase)

        stopBottleProcessMonitor('38410')
        stopBottleProcessMonitor('38410')
        const dones = statusesFor('38410').filter((st) => st === 'done')
        expect(dones.length).toBe(1)
        expect(getBottleProcessMonitorPhase('38410')).toBeNull()
        expect(jest.getTimerCount()).toBe(0)
        jest.useRealTimers()
      }
    )

    test('__stopAllBottleProcessMonitors is silent and leaves no timers', () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      jest.useFakeTimers()
      startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })
      __stopAllBottleProcessMonitors()
      expect(statusesFor('38410')).toEqual(['launching'])
      expect(jest.getTimerCount()).toBe(0)
      jest.useRealTimers()
    })

    test('superseded first entry fires no onStopped and no done', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      jest.useFakeTimers()
      const firstStopped = jest.fn()
      startBottleProcessMonitor({
        appId: '38410',
        installPath,
        bottleDir,
        onStopped: firstStopped
      })
      startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })
      await jest.advanceTimersByTimeAsync(3000)
      expect(firstStopped).not.toHaveBeenCalled()
      expect(statusesFor('38410')).toEqual(['launching', 'launching'])
      __stopAllBottleProcessMonitors()
      jest.useRealTimers()
    })
  })

  describe('waiting state (D-51-16)', () => {
    const advanceByGraceWindow = async () => {
      // 20000ms of elapsed-no-match time, in 1500ms poll ticks.
      await jest.advanceTimersByTimeAsync(1500 * 14) // 21000ms elapsed
      await flushMicrotasks()
    }

    test('no match after 20s emits exactly one steamBottleLaunchWaiting and logs appId+cause', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      mockedClassifyBottledSteamBlock.mockReturnValue('self-update')

      jest.useFakeTimers()
      startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })

      await advanceByGraceWindow()

      const waitingCalls = mockedSendFrontendMessage.mock.calls.filter(
        (call) => call[0] === 'steamBottleLaunchWaiting'
      )
      expect(waitingCalls.length).toBe(1)
      expect(waitingCalls[0][1]).toEqual({
        appName: '38410',
        detectedCause: 'self-update'
      })
      expect(
        mockedLogInfo.mock.calls.some((call) =>
          JSON.stringify(call).includes(
            '[bottle-waiting] appId=38410 cause=self-update'
          )
        )
      ).toBe(true)

      __stopAllBottleProcessMonitors()
      jest.useRealTimers()
    })

    test('no cause detected still emits once, with detectedCause: null and cause=none in the log', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      mockedClassifyBottledSteamBlock.mockReturnValue(null)

      jest.useFakeTimers()
      startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })

      await advanceByGraceWindow()

      const waitingCalls = mockedSendFrontendMessage.mock.calls.filter(
        (call) => call[0] === 'steamBottleLaunchWaiting'
      )
      expect(waitingCalls.length).toBe(1)
      expect(waitingCalls[0][1]).toEqual({
        appName: '38410',
        detectedCause: null
      })
      expect(
        mockedLogInfo.mock.calls.some((call) =>
          JSON.stringify(call).includes(
            '[bottle-waiting] appId=38410 cause=none'
          )
        )
      ).toBe(true)

      __stopAllBottleProcessMonitors()
      jest.useRealTimers()
    })

    test('re-emits only when detectedCause changes across 15s re-checks', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      mockedClassifyBottledSteamBlock.mockReturnValue('self-update')

      jest.useFakeTimers()
      startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })

      await advanceByGraceWindow()
      let waitingCalls = mockedSendFrontendMessage.mock.calls.filter(
        (call) => call[0] === 'steamBottleLaunchWaiting'
      )
      expect(waitingCalls.length).toBe(1)

      // Same cause across the next 15s recheck window: no re-emission.
      await jest.advanceTimersByTimeAsync(15000)
      await flushMicrotasks()
      waitingCalls = mockedSendFrontendMessage.mock.calls.filter(
        (call) => call[0] === 'steamBottleLaunchWaiting'
      )
      expect(waitingCalls.length).toBe(1)

      // Cause changes: re-emits exactly once more.
      mockedClassifyBottledSteamBlock.mockReturnValue('other-session')
      await jest.advanceTimersByTimeAsync(15000)
      await flushMicrotasks()
      waitingCalls = mockedSendFrontendMessage.mock.calls.filter(
        (call) => call[0] === 'steamBottleLaunchWaiting'
      )
      expect(waitingCalls.length).toBe(2)
      expect(waitingCalls[1][1]).toEqual({
        appName: '38410',
        detectedCause: 'other-session'
      })

      __stopAllBottleProcessMonitors()
      jest.useRealTimers()
    })

    test('a match after waiting emits playing and no further waiting messages', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      mockedClassifyBottledSteamBlock.mockReturnValue('login')

      jest.useFakeTimers()
      startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })

      await advanceByGraceWindow()
      expect(
        mockedSendFrontendMessage.mock.calls.filter(
          (call) => call[0] === 'steamBottleLaunchWaiting'
        ).length
      ).toBe(1)

      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: matchedPsLine,
        stderr: ''
      })
      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()

      expect(mockedSendFrontendMessage).toHaveBeenCalledWith(
        'gameStatusUpdate',
        { appName: '38410', runner: 'steam', status: 'playing' }
      )

      const waitingCallsAfterMatch =
        mockedSendFrontendMessage.mock.calls.filter(
          (call) => call[0] === 'steamBottleLaunchWaiting'
        ).length

      // Keep polling well past another recheck window: still no more.
      await jest.advanceTimersByTimeAsync(15000)
      await flushMicrotasks()
      expect(
        mockedSendFrontendMessage.mock.calls.filter(
          (call) => call[0] === 'steamBottleLaunchWaiting'
        ).length
      ).toBe(waitingCallsAfterMatch)

      __stopAllBottleProcessMonitors()
      jest.useRealTimers()
    })

    test('kind "bridge" never emits steamBottleLaunchWaiting, even after the grace window', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      mockedClassifyBottledSteamBlock.mockReturnValue('self-update')

      jest.useFakeTimers()
      startBottleProcessMonitor({
        appId: '38410',
        installPath,
        bottleDir,
        kind: 'bridge'
      })

      await advanceByGraceWindow()
      await jest.advanceTimersByTimeAsync(15000 * 2)
      await flushMicrotasks()

      expect(
        mockedSendFrontendMessage.mock.calls.filter(
          (call) => call[0] === 'steamBottleLaunchWaiting'
        ).length
      ).toBe(0)
      expect(mockedReadBoundedTail).not.toHaveBeenCalled()

      __stopAllBottleProcessMonitors()
      jest.useRealTimers()
    })

    test('stopBottleProcessMonitor during a pending tail read leaves jest.getTimerCount() at 0 and emits nothing afterwards', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      let resolveBootstrapTail: (value: string) => void = () => {}
      mockedReadBoundedTail.mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveBootstrapTail = resolve
          })
      )

      jest.useFakeTimers()
      startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })

      // Advance to the tick that crosses the grace window -- the pending
      // readBoundedTail call is now in flight, unresolved.
      await jest.advanceTimersByTimeAsync(1500 * 14)
      await flushMicrotasks()
      expect(mockedReadBoundedTail).toHaveBeenCalled()

      stopBottleProcessMonitor('38410')
      expect(jest.getTimerCount()).toBe(0)

      // Resolve the pending read AFTER cancellation -- must produce no
      // waiting message and leave the timer count at 0.
      resolveBootstrapTail('Installing update...')
      await flushMicrotasks()

      expect(
        mockedSendFrontendMessage.mock.calls.filter(
          (call) => call[0] === 'steamBottleLaunchWaiting'
        ).length
      ).toBe(0)
      expect(jest.getTimerCount()).toBe(0)

      jest.useRealTimers()
    })

    test('the login tail is read and passed to the classifier; cause=login is logged and sent', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      mockedReadBoundedTail.mockImplementation((path: string) =>
        Promise.resolve(
          path === FAKE_LOG_PATHS.login
            ? '[2026-10-22 22:21:30] [ None ] SetLoginState: WaitingForCredentials - OK'
            : ''
        )
      )
      mockedClassifyBottledSteamBlock.mockImplementation(
        ({ loginTail }: { loginTail: string }) =>
          loginTail.includes('WaitingForCredentials') ? 'login' : null
      )

      jest.useFakeTimers()
      startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })

      await advanceByGraceWindow()

      const waitingCalls = mockedSendFrontendMessage.mock.calls.filter(
        (call) => call[0] === 'steamBottleLaunchWaiting'
      )
      expect(waitingCalls.length).toBe(1)
      expect(waitingCalls[0][1]).toEqual({
        appName: '38410',
        detectedCause: 'login'
      })
      expect(
        mockedLogInfo.mock.calls.some((call) =>
          JSON.stringify(call).includes(
            '[bottle-waiting] appId=38410 cause=login'
          )
        )
      ).toBe(true)

      __stopAllBottleProcessMonitors()
      jest.useRealTimers()
    })

    test('a monitor cancelled between the console read and the login read never classifies', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      let resolveLogin: (value: string) => void = () => {}
      mockedReadBoundedTail.mockImplementation((path: string) =>
        path === FAKE_LOG_PATHS.login
          ? new Promise<string>((resolve) => {
              resolveLogin = resolve
            })
          : Promise.resolve('')
      )

      jest.useFakeTimers()
      startBottleProcessMonitor({ appId: '38410', installPath, bottleDir })

      await jest.advanceTimersByTimeAsync(1500 * 14)
      await flushMicrotasks()
      expect(mockedReadBoundedTail).toHaveBeenCalledWith(FAKE_LOG_PATHS.login)

      stopBottleProcessMonitor('38410')
      resolveLogin('[2026-10-22 22:21:30] SetLoginState: WaitingForCredentials')
      await flushMicrotasks()

      expect(mockedClassifyBottledSteamBlock).not.toHaveBeenCalled()

      jest.useRealTimers()
    })
  })

  describe('first-match window raise (261024-g3m)', () => {
    const start = (kind?: 'bridge' | 'bottled-steam') =>
      startBottleProcessMonitor({
        appId: '38410',
        installPath,
        bottleDir,
        ...(kind ? { kind } : {})
      })

    test('bridge kind: raises once with pid and exe name; later polls do not re-raise', async () => {
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: matchedPsLine,
        stderr: ''
      })
      jest.useFakeTimers()
      start('bridge')
      await jest.advanceTimersByTimeAsync(1500 * 4)
      await flushMicrotasks()
      expect(mockedRaise).toHaveBeenCalledTimes(1)
      expect(mockedRaise).toHaveBeenCalledWith({
        context: 'bridge:38410',
        pids: ['4242'],
        processNames: ['fallout2.exe']
      })
      jest.useRealTimers()
    })

    test('default (bottled-steam) kind uses its own context', async () => {
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: matchedPsLine,
        stderr: ''
      })
      jest.useFakeTimers()
      start()
      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()
      expect(mockedRaise).toHaveBeenCalledTimes(1)
      expect(mockedRaise.mock.calls[0][0].context).toBe('bottled-steam:38410')
      jest.useRealTimers()
    })

    test('a match recorded via launcherExited() raises exactly once', async () => {
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: matchedPsLine,
        stderr: ''
      })
      jest.useFakeTimers()
      const handle = start('bridge')
      handle?.launcherExited()
      await flushMicrotasks()
      expect(mockedRaise).toHaveBeenCalledTimes(1)
      jest.useRealTimers()
    })

    test('a synchronously throwing raise does not stop playing/done', async () => {
      mockedRaise.mockImplementation(() => {
        throw new Error('boom')
      })
      mockedSpawnAsync
        .mockResolvedValueOnce({ code: 0, stdout: matchedPsLine, stderr: '' })
        .mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      jest.useFakeTimers()
      start('bridge')
      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()
      await jest.advanceTimersByTimeAsync(1500)
      await flushMicrotasks()
      const statuses = mockedSendFrontendMessage.mock.calls.map(
        (c) => c[1].status
      )
      expect(statuses).toEqual(['launching', 'playing', 'done'])
      jest.useRealTimers()
    })
  })
})
