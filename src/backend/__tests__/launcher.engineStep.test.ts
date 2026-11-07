/**
 * Phase 61-14 (D-05, D-08, D-13): the engine step in launchEventCallback.
 *
 * The engine modules and the Wine validity check are mocked; what is asserted is the
 * launcher's wiring: order, skipping the self-healing Wine check for an engine-controlled
 * launch, the overlay reaching the launch, and release of the selection on every exit.
 *
 * Mock implementations are assigned in beforeEach (jest.config.js sets resetMocks: true).
 */
const getGameMock = jest.fn()
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    legendary: { getGame: (...a: unknown[]) => getGameMock(...a) }
  },
  storeLaunchHooks: { legendary: {} }
}))

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

const calls: string[] = []
const checkWineMock = jest.fn()
jest.mock('backend/utils', () => ({
  ...jest.requireActual('backend/utils'),
  sendGameStatusUpdate: jest.fn(),
  checkWineBeforeLaunch: (...a: unknown[]) => checkWineMock(...a)
}))

const globalSettingsMock = jest.fn()
jest.mock('backend/config', () => ({
  ...jest.requireActual('backend/config'),
  GlobalConfig: { get: () => ({ getSettings: () => globalSettingsMock() }) }
}))

jest.mock('backend/recent_games/recent_games', () => ({
  addRecentGame: jest.fn().mockResolvedValue(undefined)
}))
jest.mock('backend/runsForMe', () => ({ recordPlaySession: jest.fn() }))

const selectMock = jest.fn()
const endMock = jest.fn()
jest.mock('backend/engine/launchEngine', () => ({
  selectEngineForLaunch: (...a: unknown[]) => selectMock(...a),
  endEngineLaunch: (...a: unknown[]) => endMock(...a)
}))

const overlayMock = jest.fn()
jest.mock('backend/engine/launchSettings', () => ({
  getLaunchSettings: (...a: unknown[]) => overlayMock(...a)
}))

import { launchEventCallback } from 'backend/launcher'
import { sendGameStatusUpdate } from 'backend/utils'
import { createGameLogWriter } from 'backend/logger'
import { resetLaunchSingleFlightForTests } from 'backend/launchSingleFlight'

const KEY = 'legendary:Quail'
const STORED = { verboseLogs: true, wineVersion: { name: 'stored' } }
const OVERLAY = { verboseLogs: true, wineVersion: { name: 'overlay' } }

let logWriter: {
  logInfo: jest.Mock
  logError: jest.Mock
  logWarning: jest.Mock
  close: jest.Mock
}
let launchMock: jest.Mock

beforeEach(() => {
  calls.length = 0
  resetLaunchSingleFlightForTests()
  globalSettingsMock.mockReturnValue({
    minimizeOnLaunch: false,
    noTrayIcon: true,
    disablePlaytimeSync: true
  })
  logWriter = {
    logInfo: jest.fn().mockResolvedValue(undefined),
    logError: jest.fn().mockResolvedValue(undefined),
    logWarning: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  }
  ;(createGameLogWriter as jest.Mock).mockImplementation(() => {
    calls.push('logWriter')
    return Promise.resolve(logWriter)
  })
  checkWineMock.mockImplementation(() => {
    calls.push('checkWine')
    return Promise.resolve(true)
  })
  selectMock.mockImplementation(() => {
    calls.push('engineStep')
    return Promise.resolve({ kind: 'skip' })
  })
  overlayMock.mockImplementation(() => OVERLAY)
  launchMock = jest.fn(() => {
    calls.push('launch')
    return Promise.resolve(true)
  })
  getGameMock.mockImplementation(() => ({
    getGameInfo: () => ({
      title: 'Quail',
      app_name: 'Quail',
      runner: 'legendary',
      install: {}
    }),
    getSettings: () => Promise.resolve(STORED),
    isNative: () => false,
    launch: launchMock
  }))
})

const run = () => launchEventCallback({ appName: 'Quail', runner: 'legendary' })

describe('launcher engine step (61-14)', () => {
  it('runs the step once, after the log writer and before the Wine check', async () => {
    await run()
    expect(selectMock).toHaveBeenCalledTimes(1)
    const [game, opts] = selectMock.mock.calls[0]
    expect(game.getGameInfo().app_name).toBe('Quail')
    expect(opts.logWriter).toBe(logWriter)
    expect(typeof opts.offline).toBe('boolean')
    expect(calls).toEqual(['logWriter', 'engineStep', 'checkWine', 'launch'])
  })

  it("'use': skips the Wine check, applies the overlay, and releases after the launch", async () => {
    selectMock.mockImplementation(() => {
      calls.push('engineStep')
      return Promise.resolve({
        kind: 'use',
        key: KEY,
        selection: {},
        prefix: {}
      })
    })
    launchMock.mockImplementation(() => {
      calls.push('launch')
      expect(endMock).not.toHaveBeenCalled()
      return Promise.resolve(true)
    })
    const result = await run()

    expect(result).toEqual({ status: 'done' })
    expect(checkWineMock).not.toHaveBeenCalled()
    expect(overlayMock).toHaveBeenCalledWith(KEY, STORED)
    expect(endMock).toHaveBeenCalledTimes(1)
    expect(endMock).toHaveBeenCalledWith(KEY)
  })

  it("'use': releases the selection when the launch throws", async () => {
    selectMock.mockResolvedValue({
      kind: 'use',
      key: KEY,
      selection: {},
      prefix: {}
    })
    launchMock.mockRejectedValue(new Error('boom'))
    const result = await run()

    expect(result).toEqual({ status: 'error' })
    expect(endMock).toHaveBeenCalledTimes(1)
    expect(endMock).toHaveBeenCalledWith(KEY)
  })

  it.each(['legacy', 'skip'])(
    "'%s': the Wine check runs as today, no overlay, no release",
    async (kind) => {
      selectMock.mockResolvedValue({ kind, key: KEY })
      const result = await run()

      expect(result).toEqual({ status: 'done' })
      expect(checkWineMock).toHaveBeenCalledTimes(1)
      expect(overlayMock).not.toHaveBeenCalled()
      expect(endMock).not.toHaveBeenCalled()
    }
  )

  it("'refused': reports done, closes the log, aborts, and never launches", async () => {
    selectMock.mockResolvedValue({ kind: 'refused', key: KEY })
    const result = await run()

    expect(result).toEqual({ status: 'abort' })
    expect(launchMock).not.toHaveBeenCalled()
    expect(checkWineMock).not.toHaveBeenCalled()
    expect(logWriter.close).toHaveBeenCalledTimes(1)
    expect(sendGameStatusUpdate).toHaveBeenCalledWith({
      appName: 'Quail',
      runner: 'legendary',
      status: 'done'
    })
  })
})
