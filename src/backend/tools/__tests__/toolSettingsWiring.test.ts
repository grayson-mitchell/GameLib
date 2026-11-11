/**
 * Phase 61-14 (T-61-63): the three Wine tool entry points take their settings from
 * resolveToolSettings, with the right `ensureBottle`, and handle 'unavailable' without spawning.
 * resolveToolSettings itself is covered by engine/__tests__/toolSettings.test.ts.
 */
const mockGetGame = jest.fn()
const mockRunWineCommand = jest.fn()
const mockResolve = jest.fn()
const mockValidWine = jest.fn()

jest.mock('../../engine/toolSettings', () => ({
  resolveToolSettings: (...args: unknown[]) => mockResolve(...args)
}))

jest.mock('backend/logger', () => {
  const { LogPrefix } = jest.requireActual('backend/logger/constants')
  return {
    LogPrefix,
    logError: jest.fn(),
    logInfo: jest.fn(),
    logWarning: jest.fn(),
    logDebug: jest.fn()
  }
})

import { createTools } from '../index'
import type { ToolsDeps } from '../index'
import {
  createTestServices,
  createTestStores,
  createTestToolsSlices
} from 'backend/testUtils/testServices'

const toolsDeps: ToolsDeps = {
  ...createTestToolsSlices(),
  spawnAsync: createTestServices().spawnAsync,
  runner: createTestServices().runner,
  stores: createTestStores(),
  managers: {
    library: {
      gog: { getGame: (...args: unknown[]) => mockGetGame(...args) }
    } as unknown as ToolsDeps['managers']['library']
  },
  commandRunner: {
    runWineCommand: (...args: unknown[]) => mockRunWineCommand(...args)
  } as unknown as ToolsDeps['commandRunner'],
  launcher: {
    setupEnvVars: jest.fn(),
    setupWineEnvVars: jest.fn(),
    validWine: (...args: unknown[]) => mockValidWine(...args)
  } as unknown as ToolsDeps['launcher']
}
const { runWineCommandOnGame, Winetricks } = createTools(toolsDeps)
import type { Game } from 'common/types/game_manager'

const STORED = { winePrefix: '/stored', wineVersion: { name: 'stored' } }
const RESOLVED = { winePrefix: '/bottle', wineVersion: { name: 'resolved' } }

const fakeGame = () => ({
  isNative: () => false,
  getGameInfo: () => ({
    app_name: 'g',
    folder_name: 'Folder',
    install: { install_path: '/games/g' }
  }),
  getSettings: () => Promise.resolve(STORED)
})

beforeEach(() => {
  mockGetGame.mockImplementation(fakeGame)
  mockRunWineCommand.mockResolvedValue({ stdout: 'ok', stderr: '' })
})

describe('runWineCommandOnGame', () => {
  it('runs with the resolved settings and creates the bottle (ensureBottle: true)', async () => {
    mockResolve.mockResolvedValue({
      kind: 'engine',
      key: 'gog:g',
      settings: RESOLVED
    })
    await runWineCommandOnGame('gog', 'g', { commandParts: ['winecfg'] })
    expect(mockResolve).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      STORED,
      {
        ensureBottle: true
      }
    )
    expect(mockRunWineCommand).toHaveBeenCalledWith(
      expect.objectContaining({ gameSettings: RESOLVED })
    )
  })

  it("'unavailable': no-op shape, never runs Wine", async () => {
    mockResolve.mockResolvedValue({
      kind: 'unavailable',
      reason: 'no-engine'
    })
    await expect(
      runWineCommandOnGame('gog', 'g', { commandParts: ['winecfg'] })
    ).resolves.toEqual({ stdout: '', stderr: '' })
    expect(mockRunWineCommand).not.toHaveBeenCalled()
  })
})

describe('Winetricks.listInstalled', () => {
  it("reads without creating a bottle, and returns [] on 'unavailable'", async () => {
    mockResolve.mockResolvedValue({
      kind: 'unavailable',
      reason: 'bottle-not-created'
    })
    await expect(
      Winetricks.listInstalled(fakeGame() as unknown as Game)
    ).resolves.toEqual([])
    expect(mockResolve).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      STORED,
      {
        ensureBottle: false
      }
    )
  })
})

describe('Winetricks.runWithArgs', () => {
  it("'unavailable': logs, reports failure through onDone and spawns nothing", async () => {
    mockResolve.mockResolvedValue({
      kind: 'unavailable',
      reason: 'bottle-not-created'
    })
    const onDone = jest.fn()
    await Winetricks.runWithArgs(
      'gog',
      'g',
      ['list-all'],
      false,
      undefined,
      '',
      onDone
    )
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(true)
    expect(mockValidWine).not.toHaveBeenCalled()
    expect(mockResolve).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      STORED,
      {
        ensureBottle: true
      }
    )
  })

  it('uses a settings override (Steam bridge) untouched, without resolving', async () => {
    mockValidWine.mockResolvedValue(false)
    const onDone = jest.fn()
    await Winetricks.runWithArgs(
      'gog',
      'g',
      ['list-all'],
      false,
      undefined,
      '',
      onDone,
      undefined,
      RESOLVED as never
    )
    expect(mockResolve).not.toHaveBeenCalled()
    expect(mockValidWine).toHaveBeenCalledWith(RESOLVED.wineVersion)
    expect(onDone).toHaveBeenCalledWith(true)
  })
})
