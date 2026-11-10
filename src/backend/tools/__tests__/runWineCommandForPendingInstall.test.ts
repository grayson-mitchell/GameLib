/**
 * CR-04 (D-01, D-17): Sideload "Run installer" runs before the game is in the library, so
 * runWineCommandOnGame (which needs a library entry) cannot serve it. runWineCommandForPendingInstall
 * resolves the game's own bottle from the config the dialog just wrote.
 */
const mockGetGame = jest.fn()
const mockRunWineCommand = jest.fn()
const mockLogError = jest.fn()
const mockResolveForId = jest.fn()
const mockGetSettings = jest.fn()

jest.mock('../../game_config', () => ({
  GameConfig: {
    get: () => ({ getSettings: (...a: unknown[]) => mockGetSettings(...a) })
  }
}))

jest.mock('../../engine/toolSettings', () => ({
  resolveToolSettings: jest.fn(),
  resolveToolSettingsForId: (...args: unknown[]) => mockResolveForId(...args)
}))

jest.mock('backend/logger', () => {
  const { LogPrefix } = jest.requireActual('backend/logger/constants')
  return {
    LogPrefix,
    logError: (...args: unknown[]) => mockLogError(...args),
    logInfo: jest.fn(),
    logWarning: jest.fn(),
    logDebug: jest.fn()
  }
})

import { createTools } from '../index'
import type { ToolsDeps } from '../index'
import {
  createTestServices,
  createTestStores
} from 'backend/testUtils/testServices'

const toolsDeps: ToolsDeps = {
  spawnAsync: createTestServices().spawnAsync,
  stores: createTestStores(),
  managers: {
    library: {
      sideload: { getGame: (...args: unknown[]) => mockGetGame(...args) }
    } as unknown as ToolsDeps['managers']['library']
  },
  commandRunner: {
    runWineCommand: (...args: unknown[]) => mockRunWineCommand(...args)
  } as unknown as ToolsDeps['commandRunner'],
  launcher: {
    setupEnvVars: jest.fn(),
    setupWineEnvVars: jest.fn(),
    validWine: jest.fn()
  } as unknown as ToolsDeps['launcher']
}
const { runWineCommandForPendingInstall } = createTools(toolsDeps)

const stored = { winePrefix: '/old' }
const resolvedSettings = { winePrefix: '/bottle', marker: 'resolved' }

describe('runWineCommandForPendingInstall (CR-04)', () => {
  beforeEach(() => {
    mockGetSettings.mockResolvedValue(stored)
    mockRunWineCommand.mockResolvedValue({ stdout: 'ok', stderr: '' })
    mockResolveForId.mockResolvedValue({
      kind: 'engine',
      key: 'sideload:abc',
      settings: resolvedSettings
    })
  })

  it('runs the command in the resolved bottle with ensureBottle, never touching the library', async () => {
    const out = await runWineCommandForPendingInstall({
      runner: 'sideload',
      appName: 'abc',
      commandParts: ['/x/setup.exe'],
      wait: true
    })
    expect(out).toEqual({ stdout: 'ok', stderr: '' })
    expect(mockResolveForId).toHaveBeenCalledWith(
      expect.objectContaining({ spawnAsync: expect.any(Function) }),
      { runner: 'sideload', appName: 'abc', platform: 'Windows' },
      stored,
      { ensureBottle: true }
    )
    expect(mockRunWineCommand).toHaveBeenCalledTimes(1)
    expect(mockRunWineCommand).toHaveBeenCalledWith({
      gameSettings: resolvedSettings,
      commandParts: ['/x/setup.exe'],
      wait: true,
      protonVerb: 'runinprefix'
    })
    expect(mockGetGame).not.toHaveBeenCalled()
  })

  it('rejects a runner other than sideload without running anything', async () => {
    const out = await runWineCommandForPendingInstall({
      runner: 'legendary',
      appName: 'abc',
      commandParts: ['/x/setup.exe'],
      wait: true
    })
    expect(out).toEqual({ stdout: '', stderr: '' })
    expect(mockLogError).toHaveBeenCalled()
    expect(mockRunWineCommand).not.toHaveBeenCalled()
    expect(mockResolveForId).not.toHaveBeenCalled()
  })

  it('an unavailable resolution runs nothing and logs the reason without the exe path', async () => {
    mockResolveForId.mockResolvedValue({
      kind: 'unavailable',
      reason: 'bottle-not-created'
    })
    const out = await runWineCommandForPendingInstall({
      runner: 'sideload',
      appName: 'abc',
      commandParts: ['/secret/setup.exe'],
      wait: true
    })
    expect(out).toEqual({ stdout: '', stderr: '' })
    expect(mockRunWineCommand).not.toHaveBeenCalled()
    const logged = JSON.stringify(mockLogError.mock.calls)
    expect(logged).toContain('bottle-not-created')
    expect(logged).not.toContain('/secret/setup.exe')
  })
})
