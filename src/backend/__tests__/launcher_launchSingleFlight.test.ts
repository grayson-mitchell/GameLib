/**
 * WR-03: concurrent `launchEventCallback` calls for the same runner+app run
 * the launcher body once (one log writer, one game.launch, one status set).
 */
const getGameMock = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Backend: 'Backend' },
  getRunnerLogWriter: jest.fn(),
  createGameLogWriter: jest.fn()
}))

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(),
  exec: jest.fn(),
  execFile: jest.fn(),
  execSync: jest.fn()
}))

const sendGameStatusUpdateMock = jest.fn()
jest.mock('backend/utils', () => ({
  ...jest.requireActual('backend/utils'),
  sendGameStatusUpdate: (...a: unknown[]) => sendGameStatusUpdateMock(...a)
}))

const getSettingsMock = jest.fn()
jest.mock('backend/config', () => ({
  ...jest.requireActual('backend/config'),
  GlobalConfig: { get: () => ({ getSettings: () => getSettingsMock() }) }
}))

jest.mock('backend/recent_games/recent_games', () => ({
  addRecentGame: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('backend/runsForMe', () => ({ recordPlaySession: jest.fn() }))

import { createLauncher } from 'backend/launcher'
import { createGameLogWriter } from 'backend/logger'
import { resetLaunchSingleFlightForTests } from 'backend/launchSingleFlight'
import { defined } from './helpers/defined'

function makeLogWriter() {
  return {
    logInfo: jest.fn().mockResolvedValue(undefined),
    logError: jest.fn().mockResolvedValue(undefined),
    logWarning: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  }
}

// 66.1-23: the launcher is built from test deps. 62-14: launcher.ts dispatches store-specific work
// through the hook table; legendary has none of the optional hooks under test here.
const tsStore = {
  has: () => true,
  get: (_key: string, fallback: number) => fallback,
  set: jest.fn()
}
const { launchEventCallback } = createLauncher({
  libraryManagers: {
    legendary: { getGame: (...a: unknown[]) => getGameMock(...a) }
  } as never,
  launchHooks: { legendary: {} } as never,
  commandRunner: {} as never,
  runner: { run: () => Promise.reject(new Error('unscripted run')) } as never,
  spawnAsync: (() => Promise.reject(new Error('unscripted spawn'))) as never,
  stores: { kvs: { tsStore }, wineManager: {}, runsForMe: {} } as never
})

describe('launchEventCallback single-flight (WR-03)', () => {
  let resolvers: Array<(v: boolean) => void>
  let launchMock: jest.Mock

  beforeEach(() => {
    resetLaunchSingleFlightForTests()
    resolvers = []
    sendGameStatusUpdateMock.mockClear()
    getSettingsMock.mockReturnValue({
      minimizeOnLaunch: false,
      noTrayIcon: true,
      disablePlaytimeSync: true
    })
    ;(createGameLogWriter as jest.Mock).mockReset()
    ;(createGameLogWriter as jest.Mock).mockImplementation(async () =>
      makeLogWriter()
    )
    launchMock = jest.fn(
      () =>
        new Promise<boolean>((res) => {
          resolvers.push(res)
        })
    )
    getGameMock.mockImplementation((appName: string) => ({
      getGameInfo: () => ({
        title: appName,
        app_name: appName,
        runner: 'legendary',
        install: {}
      }),
      getSettings: async () => ({ verboseLogs: true }),
      isNative: () => true,
      launch: launchMock
    }))
  })

  const tick = () => new Promise((r) => setImmediate(r))
  const count = (status: string) =>
    sendGameStatusUpdateMock.mock.calls.filter((c) => c[0].status === status)
      .length

  it('runs the body once for two concurrent calls and shares the result', async () => {
    const a = launchEventCallback({ appName: 'Quail', runner: 'legendary' })
    const b = launchEventCallback({ appName: 'Quail', runner: 'legendary' })
    await tick()
    resolvers.forEach((r) => r(true))
    const [ra, rb] = await Promise.all([a, b])

    expect(ra).toEqual({ status: 'done' })
    expect(rb).toBe(ra)
    expect(createGameLogWriter).toHaveBeenCalledTimes(1)
    expect(launchMock).toHaveBeenCalledTimes(1)
    expect(count('launching')).toBe(2)
    expect(count('done')).toBe(1)
  })

  it('releases after settle: a later call launches again', async () => {
    const a = launchEventCallback({ appName: 'Quail', runner: 'legendary' })
    await tick()
    defined(resolvers[0], 'first resolver')(true)
    await a
    await tick()
    const b = launchEventCallback({ appName: 'Quail', runner: 'legendary' })
    await tick()
    defined(resolvers[1], 'second resolver')(true)
    await b
    expect(launchMock).toHaveBeenCalledTimes(2)
  })

  it('does not join a different appName', async () => {
    const a = launchEventCallback({ appName: 'Quail', runner: 'legendary' })
    const b = launchEventCallback({ appName: 'Wren', runner: 'legendary' })
    await tick()
    resolvers.forEach((r) => r(true))
    await Promise.all([a, b])
    expect(launchMock).toHaveBeenCalledTimes(2)
  })
})
