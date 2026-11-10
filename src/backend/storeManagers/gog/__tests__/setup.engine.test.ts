/**
 * Phase 61-15 (T-61-46, T-61-47): GOG and Amazon install setup runs on the engine the engine step
 * selected, never runs checkWineBeforeLaunch's self-heal for an engine-controlled game, and always
 * releases the selection.
 */
const mockSelect = jest.fn()
const mockEnd = jest.fn()
const mockCheckWine = jest.fn()
const mockVerifyPrefix = jest.fn()
const mockRunWine = jest.fn()
const mockExists = jest.fn()

const stored = { wineVersion: { name: 'stored', type: 'wine' } }
const overlay = { wineVersion: { name: 'overlay', type: 'crossover' } }

jest.mock('backend/engine/launchEngine', () => ({
  selectEngineForLaunch: (...a: unknown[]) => mockSelect(...a),
  endEngineLaunch: (...a: unknown[]) => mockEnd(...a)
}))
jest.mock('backend/engine/launchSettings', () => ({
  getLaunchSettings: (key: string, s: unknown) => (key === 'k' ? overlay : s)
}))
jest.mock('../../../online_monitor', () => ({ isOnline: () => true }))
jest.mock('backend/constants/environment', () => ({ isWindows: false }))
jest.mock('graceful-fs', () => ({
  existsSync: (...a: unknown[]) => mockExists(...a)
}))
jest.mock('node:fs/promises', () => ({ readFile: jest.fn() }))
jest.mock('shlex', () => ({ __esModule: true, default: { split: jest.fn() } }))
jest.mock('../../../game_config', () => ({
  GameConfig: { get: () => ({ config: stored }) }
}))
jest.mock('backend/game_config', () => ({
  GameConfig: { get: () => ({ config: stored }) }
}))
jest.mock('../../../utils', () => ({
  checkWineBeforeLaunch: (...a: unknown[]) => mockCheckWine(...a),
  sendGameStatusUpdate: jest.fn(),
  spawnAsync: jest.fn()
}))
jest.mock('backend/utils', () => ({
  checkWineBeforeLaunch: (...a: unknown[]) => mockCheckWine(...a),
  sendGameStatusUpdate: jest.fn(),
  spawnAsync: jest.fn()
}))
jest.mock('../../../launcher', () => ({
  getWinePath: jest.fn(),
  runWineCommand: (...a: unknown[]) => mockRunWine(...a),
  verifyWinePrefix: (...a: unknown[]) => mockVerifyPrefix(...a)
}))
jest.mock('backend/launcher', () => ({
  runWineCommand: (...a: unknown[]) => mockRunWine(...a),
  verifyWinePrefix: (...a: unknown[]) => mockVerifyPrefix(...a)
}))
jest.mock('backend/logger', () => ({
  getRunnerLogWriter: jest.fn(() => ({})),
  logError: jest.fn(),
  logInfo: jest.fn(),
  logDebug: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Gog: 'Gog', Nile: 'Nile', Backend: 'Backend' }
}))
jest.mock('../constants', () => ({
  gogdlConfigPath: '/cfg',
  gogRedistPath: '/redist',
  gogSupportPath: '/support'
}))

const gogInfo = {
  title: 'G',
  install: { platform: 'windows', install_path: '/g' }
}
const nileInfo = { title: 'N', install: { install_path: '/n' } }
const fuel = {
  PostInstall: [{ Command: 'redist.exe', Args: ['/s'] }]
}
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    gog: { getGameInfo: () => gogInfo, getGame: () => ({}) },
    nile: {
      getGameInfo: () => nileInfo,
      getGame: () => ({}),
      fetchFuelJSON: () => fuel
    }
  }
}))

import gogSetup, { type SetupDeps } from '../setup'
import nileSetup from '../../nile/setup'

const gogDeps = {
  libraryManagers: {
    gog: { getGameInfo: () => gogInfo, getGame: () => ({}) }
  },
  launcher: { verifyWinePrefix: (...a: unknown[]) => mockVerifyPrefix(...a) },
  commandRunner: {
    getWinePath: jest.fn(),
    runWineCommand: (...a: unknown[]) => mockRunWine(...a)
  },
  spawnAsync: jest.fn()
} as unknown as SetupDeps

const runners: Array<[string, (a: string) => Promise<void>]> = [
  ['gog', (a) => gogSetup(gogDeps, a)],
  ['nile', (a) => nileSetup(gogDeps, a)]
]

describe.each(runners)('%s setup on macOS', (_name, run) => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockExists.mockReturnValue(false)
    mockCheckWine.mockResolvedValue(true)
    mockVerifyPrefix.mockResolvedValue(undefined)
    mockRunWine.mockResolvedValue({ stdout: '', stderr: '' })
  })

  it('use: selects with purpose setup, skips the self-heal, uses the overlay, releases', async () => {
    mockSelect.mockResolvedValue({ kind: 'use', key: 'k' })
    await run('app')
    expect(mockSelect).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ purpose: 'setup', offline: false })
    )
    expect(mockCheckWine).not.toHaveBeenCalled()
    expect(mockVerifyPrefix).toHaveBeenCalledWith(overlay)
    expect(mockEnd).toHaveBeenCalledWith('k')
  })

  it('use: releases the selection even when the setup throws', async () => {
    mockSelect.mockResolvedValue({ kind: 'use', key: 'k' })
    mockVerifyPrefix.mockRejectedValue(new Error('boom'))
    await expect(run('app')).rejects.toThrow('boom')
    expect(mockEnd).toHaveBeenCalledWith('k')
  })

  it('refused: returns without any wine command', async () => {
    mockSelect.mockResolvedValue({ kind: 'refused', key: 'k' })
    await run('app')
    expect(mockCheckWine).not.toHaveBeenCalled()
    expect(mockVerifyPrefix).not.toHaveBeenCalled()
    expect(mockRunWine).not.toHaveBeenCalled()
    expect(mockEnd).not.toHaveBeenCalled()
  })

  it.each(['legacy', 'skip'])(
    '%s: keeps today path (checkWineBeforeLaunch, stored settings)',
    async (kind) => {
      mockSelect.mockResolvedValue({ kind, key: 'k' })
      await run('app')
      expect(mockCheckWine).toHaveBeenCalledTimes(1)
      expect(mockVerifyPrefix).toHaveBeenCalledWith(stored)
      expect(mockEnd).not.toHaveBeenCalled()
    }
  )
})
