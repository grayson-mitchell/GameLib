/**
 * Phase 61-15 (T-61-46, T-61-47), 87-52: GOG and Amazon install setup runs on the engine the engine step
 * selected, never runs checkWineBeforeLaunch's self-heal for an engine-controlled game, and always
 * releases the selection. The step is Rust's: the deps carry a fake `requestRustInvoke` that answers
 * `engine_launch_select`, `engine_launch_settings_get` and `engine_launch_end`.
 */
const mockSelect = jest.fn()
const mockEnd = jest.fn()
const mockCheckWine = jest.fn()
const mockVerifyPrefix = jest.fn()
const mockRunWine = jest.fn()
const mockExists = jest.fn()

const stored = { wineVersion: { name: 'stored', type: 'wine' } }
const overlay = { wineVersion: { name: 'overlay', type: 'crossover' } }

jest.mock('backend/constants/environment', () => ({ isWindows: false }))
jest.mock('graceful-fs', () => ({
  existsSync: (...a: unknown[]) => mockExists(...a)
}))
jest.mock('node:fs/promises', () => ({ readFile: jest.fn() }))
jest.mock('shlex', () => ({ __esModule: true, default: { split: jest.fn() } }))
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
  deriveGogPaths: () => ({
    gogdlConfigPath: '/cfg',
    gogRedistPath: '/redist',
    gogSupportPath: '/support'
  })
}))

const gogInfo = {
  title: 'G',
  install: { platform: 'windows', install_path: '/g' }
}
const nileInfo = { title: 'N', install: { install_path: '/n' } }
const gameOf = (info: unknown) => ({
  getGameInfo: () => info,
  isNative: () => false,
  getSettings: () => Promise.resolve(stored)
})
const fuel = {
  PostInstall: [{ Command: 'redist.exe', Args: ['/s'] }]
}
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    gog: { getGameInfo: () => gogInfo, getGame: () => gameOf(gogInfo) },
    nile: {
      getGameInfo: () => nileInfo,
      getGame: () => gameOf(nileInfo),
      fetchFuelJSON: () => fuel
    }
  }
}))

import gogSetup, { type SetupDeps } from '../setup'
import nileSetup from '../../nile/setup'
import {
  RUST_ENGINE_LAUNCH_END,
  RUST_ENGINE_LAUNCH_SELECT,
  RUST_ENGINE_LAUNCH_SETTINGS_GET
} from 'common/types/sidecarTransport'

/** The Rust transport: the select reply is scripted per test, the settings read overlays the key `k`. */
const requestRustInvoke = (channel: string, args: unknown[]) => {
  if (channel === RUST_ENGINE_LAUNCH_SELECT) return mockSelect(args)
  if (channel === RUST_ENGINE_LAUNCH_END) return Promise.resolve(mockEnd(args))
  if (channel === RUST_ENGINE_LAUNCH_SETTINGS_GET) {
    const { key, stored: s } = (args[0] ?? {}) as {
      key: string | null
      stored: unknown
    }
    return Promise.resolve(key === 'k' ? overlay : s)
  }
  return Promise.reject(new Error(`unscripted rust call ${channel}`))
}

const gogDeps = {
  onlineMonitor: { isOnline: () => true },
  requestRustInvoke,
  libraryManagers: {
    gog: { getGameInfo: () => gogInfo, getGame: () => gameOf(gogInfo) }
  },
  launcher: { verifyWinePrefix: (...a: unknown[]) => mockVerifyPrefix(...a) },
  commandRunner: {
    getWinePath: jest.fn(),
    runWineCommand: (...a: unknown[]) => mockRunWine(...a)
  },
  spawnAsync: jest.fn(),
  paths: { userHome: '/home', toolsPath: '/tools', gamesConfigPath: '/games' },
  config: { getSettings: () => ({ disableLogs: true }) },
  gameConfigs: { get: () => ({ config: stored }) }
} as unknown as SetupDeps

const nileDeps = {
  ...gogDeps,
  libraryManagers: {
    nile: {
      getGameInfo: () => nileInfo,
      getGame: () => gameOf(nileInfo),
      fetchFuelJSON: () => fuel
    }
  }
} as unknown as Parameters<typeof nileSetup>[0]

const runners: Array<[string, (a: string) => Promise<void>]> = [
  ['gog', (a) => gogSetup(gogDeps, a)],
  ['nile', (a) => nileSetup(nileDeps, a)]
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
    mockSelect.mockResolvedValue({
      kind: 'use',
      key: 'k',
      logLines: [],
      launchSettings: overlay
    })
    await run('app')
    expect(mockSelect).toHaveBeenCalledWith([
      expect.objectContaining({
        runner: _name,
        appName: 'app',
        isNative: false,
        settings: stored,
        purpose: 'setup',
        offline: false
      })
    ])
    expect(mockCheckWine).not.toHaveBeenCalled()
    expect(mockVerifyPrefix).toHaveBeenCalledWith(overlay)
    expect(mockEnd).toHaveBeenCalledWith([{ key: 'k' }])
  })

  it('use: releases the selection even when the setup throws', async () => {
    mockSelect.mockResolvedValue({
      kind: 'use',
      key: 'k',
      logLines: [],
      launchSettings: overlay
    })
    mockVerifyPrefix.mockRejectedValue(new Error('boom'))
    await expect(run('app')).rejects.toThrow('boom')
    expect(mockEnd).toHaveBeenCalledWith([{ key: 'k' }])
  })

  it('refused: returns without any wine command', async () => {
    mockSelect.mockResolvedValue({ kind: 'refused', key: 'k', logLines: [] })
    await run('app')
    expect(mockCheckWine).not.toHaveBeenCalled()
    expect(mockVerifyPrefix).not.toHaveBeenCalled()
    expect(mockRunWine).not.toHaveBeenCalled()
    expect(mockEnd).not.toHaveBeenCalled()
  })

  it.each(['legacy', 'skip'])(
    '%s: keeps today path (checkWineBeforeLaunch, stored settings)',
    async (kind) => {
      mockSelect.mockResolvedValue(
        kind === 'skip' ? { kind } : { kind, key: 'k', logLines: [] }
      )
      await run('app')
      expect(mockCheckWine).toHaveBeenCalledTimes(1)
      expect(mockVerifyPrefix).toHaveBeenCalledWith(stored)
      expect(mockEnd).not.toHaveBeenCalled()
    }
  )
})
