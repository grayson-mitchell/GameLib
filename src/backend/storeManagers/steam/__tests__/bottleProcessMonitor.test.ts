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
  __stopAllBottleProcessMonitors
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
})
