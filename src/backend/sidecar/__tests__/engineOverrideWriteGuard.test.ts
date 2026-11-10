/**
 * Phase 61 (T-61-13): only closed-grammar engineOverride ids reach storage,
 * through setSetting (game and global) and writeConfig.
 */
const handlers: Record<string, (...a: unknown[]) => unknown> = {}
const listeners: Record<string, (...a: unknown[]) => unknown> = {}
jest.mock('../../platform', () => ({
  ipcMain: {
    handle: (c: string, f: never) => (handlers[c] = f),
    on: (c: string, f: never) => (listeners[c] = f)
  }
}))
jest.mock('../../storeManagers', () => ({ libraryManagerMap: {} }))
jest.mock('../../storeManagers/steam/state', () => ({ library: new Map() }))
const mockGlobalSet = jest.fn()
jest.mock('../../config', () => ({
  GlobalConfig: { get: () => ({ setSetting: mockGlobalSet }) }
}))
jest.mock('../../game_config', () => ({ GameConfig: { get: jest.fn() } }))
const mockApply = jest.fn()
jest.mock('../gameSettingWrite', () => ({
  applyGameSetting: (...a: unknown[]) => mockApply(...a)
}))
const mockWriteConfig = jest.fn()
jest.mock('../../utils', () => ({
  writeConfig: (...a: unknown[]) => mockWriteConfig(...a)
}))
jest.mock('../../constants/paths', () => ({
  gamesConfigPath: '/nonexistent/gamesconfig'
}))
jest.mock('../../logger/paths', () => ({ getLogFilePath: jest.fn() }))
jest.mock('../../utils/systeminfo', () => ({ getSystemInfo: jest.fn() }))
jest.mock('../../utils/os/path', () => ({ hasExecutable: jest.fn() }))

import { defined } from 'backend/testUtils/indexed'
import { ENGINE_PINS } from '../../engine/enginePins'
import { registerSettingsFlows } from '../settingsFlowRegistration'

let stderr: jest.SpyInstance
const settingsDeps = {
  stores: { kvs: { configStore: { get_nodefault: jest.fn(), set: jest.fn() } } }
} as unknown as Parameters<typeof registerSettingsFlows>[0]
beforeAll(() => registerSettingsFlows(settingsDeps))
beforeEach(() => {
  jest.clearAllMocks()
  stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
})
afterEach(() => stderr.mockRestore())

const set = (appName: string, value: unknown) =>
  defined(listeners['setSetting'], 'setSetting listener')(
    {},
    { appName, key: 'engineOverride', value }
  )

describe('setSetting engineOverride guard', () => {
  it.each(['legacy:Wine GPTK', '/usr/local/bin/wine', 'pinned:does-not-exist'])(
    'drops %s',
    (value) => {
      set('Fortnite', value)
      expect(mockApply).not.toHaveBeenCalled()
      expect(stderr).toHaveBeenCalledTimes(1)
    }
  )
  it.each(['automatic', `pinned:${ENGINE_PINS.current.id}`])(
    'writes %s',
    (value) => {
      set('Fortnite', value)
      expect(mockApply).toHaveBeenCalledTimes(1)
      expect(mockApply).toHaveBeenCalledWith(
        'Fortnite',
        'engineOverride',
        value
      )
    }
  )
  it('drops an invalid value for the global default too', () => {
    set('default', 'legacy:x')
    expect(mockGlobalSet).not.toHaveBeenCalled()
    set('default', 'crossover')
    expect(mockGlobalSet).toHaveBeenCalledWith(
      'engineOverride',
      'crossover',
      settingsDeps.stores.kvs
    )
  })
})

describe('writeConfig engineOverride guard', () => {
  it('removes an invalid engineOverride and keeps the rest', async () => {
    await defined(handlers['writeConfig'], 'writeConfig handler')(
      {},
      {
        appName: 'Fortnite',
        config: { engineOverride: 'legacy:x', wineCrossoverBottle: 'B' }
      }
    )
    expect(mockWriteConfig).toHaveBeenCalledWith(settingsDeps, 'Fortnite', {
      wineCrossoverBottle: 'B'
    })
  })
  it('keeps a valid engineOverride', async () => {
    await defined(handlers['writeConfig'], 'writeConfig handler')(
      {},
      {
        appName: 'Fortnite',
        config: { engineOverride: 'crossover' }
      }
    )
    expect(mockWriteConfig).toHaveBeenCalledWith(settingsDeps, 'Fortnite', {
      engineOverride: 'crossover'
    })
  })
})
