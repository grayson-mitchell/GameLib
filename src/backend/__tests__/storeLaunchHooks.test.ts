/**
 * 62-14: the per-runner hook table is behaviour-identical to the runner
 * branches launcher.ts used to carry.
 */
const gogSetupMock = jest.fn()
const nileSetupMock = jest.fn()
const legendarySetupMock = jest.fn()
const resolveEpicOfflineModeMock = jest.fn()
const getNodefaultMock = jest.fn()
const setCurrentGameMock = jest.fn()
const setPresenceMock = jest.fn()
const isEnabledMock = jest.fn()
const persistMock = jest.fn()
const sendFrontendMessageMock = jest.fn()

jest.mock('backend/storeManagers/gog/setup', () => ({
  __esModule: true,
  default: (...a: unknown[]) => gogSetupMock(...a)
}))
jest.mock('backend/storeManagers/nile/setup', () => ({
  __esModule: true,
  default: (...a: unknown[]) => nileSetupMock(...a)
}))
jest.mock('backend/storeManagers/legendary/setup', () => ({
  legendarySetup: (...a: unknown[]) => legendarySetupMock(...a)
}))
jest.mock('backend/storeManagers/legendary/epicOfflineMode', () => ({
  resolveEpicOfflineMode: (...a: unknown[]) => resolveEpicOfflineModeMock(...a)
}))
jest.mock('backend/storeManagers/gog/presence', () => ({
  __esModule: true,
  default: {
    setCurrentGame: (...a: unknown[]) => setCurrentGameMock(...a),
    setPresence: (...a: unknown[]) => setPresenceMock(...a)
  }
}))
jest.mock('backend/storeManagers/legendary/eos_overlay/eos_overlay', () => ({
  isEnabled: (...a: unknown[]) => isEnabledMock(...a)
}))
jest.mock('backend/ipc', () => ({
  ...jest.requireActual('backend/ipc'),
  sendFrontendMessage: (...a: unknown[]) => sendFrontendMessageMock(...a)
}))

import type LogWriter from 'backend/logger/log_writer'
import type { WineInstallation } from 'common/types'
import { buildLaunchHooks } from 'backend/storeManagers'
import {
  createTestManagerDeps,
  createTestStores
} from 'backend/testUtils/testServices'
import type { Stores } from 'backend/services/types'

// The hooks are built from deps (66.1-23); the legendary expired flag reads the injected store.
const legendaryStores = {
  legendaryConfigStore: {
    get_nodefault: (...a: unknown[]) => getNodefaultMock(...a)
  }
} as unknown as Stores['legendary']
const storeLaunchHooks = buildLaunchHooks(
  createTestManagerDeps({
    // 66.3-15: the steam hook persists through the boot-owned bottle instance on the deps.
    steamBottle: {
      persistBottleWineVersion: (...a: unknown[]) => persistMock(...a)
    } as never,
    stores: createTestStores({ legendary: legendaryStores })
  })
)

const logWriter = {} as LogWriter

beforeEach(() => jest.clearAllMocks())

describe('storeLaunchHooks', () => {
  test('every runner has an entry', () => {
    expect(Object.keys(storeLaunchHooks).sort()).toEqual([
      'gog',
      'legendary',
      'nile',
      'sideload',
      'steam'
    ])
  })

  test('gog prepareLaunch runs gogSetup(appName) then announces launching', async () => {
    await storeLaunchHooks.gog.prepareLaunch!('a1', logWriter)
    expect(gogSetupMock).toHaveBeenCalledWith(expect.anything(), 'a1')
    expect(sendFrontendMessageMock).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: 'a1',
      runner: 'gog',
      status: 'launching'
    })
  })

  test('nile prepareLaunch runs nileSetup(appName)', async () => {
    await storeLaunchHooks.nile.prepareLaunch!('n1', logWriter)
    expect(nileSetupMock).toHaveBeenCalledWith(expect.anything(), 'n1')
  })

  test('legendary prepareLaunch runs legendarySetup(appName, logWriter)', async () => {
    await storeLaunchHooks.legendary.prepareLaunch!('l1', logWriter)
    expect(legendarySetupMock).toHaveBeenCalledWith(
      expect.anything(),
      'l1',
      logWriter
    )
  })

  test('steam and sideload have no prepareLaunch', () => {
    expect(storeLaunchHooks.steam.prepareLaunch).toBeUndefined()
    expect(storeLaunchHooks.sideload.prepareLaunch).toBeUndefined()
  })

  test('gog setPresence sets the current game then awaits setPresence', async () => {
    await storeLaunchHooks.gog.setPresence!('a1')
    expect(setCurrentGameMock).toHaveBeenCalledWith(expect.anything(), 'a1')
    expect(setPresenceMock).toHaveBeenCalledTimes(1)
  })

  test('gog clearPresence sets the empty game then awaits setPresence', async () => {
    await storeLaunchHooks.gog.clearPresence!()
    expect(setCurrentGameMock).toHaveBeenCalledWith(expect.anything(), '')
    expect(setPresenceMock).toHaveBeenCalledTimes(1)
  })

  test('other runners have neither presence hook', () => {
    for (const r of ['legendary', 'nile', 'steam', 'sideload'] as const) {
      expect(storeLaunchHooks[r].setPresence).toBeUndefined()
      expect(storeLaunchHooks[r].clearPresence).toBeUndefined()
    }
  })

  test('legendary resolveOfflineMode forwards input plus storeExpired', () => {
    getNodefaultMock.mockReturnValue(true)
    resolveEpicOfflineModeMock.mockReturnValue(true)
    const input = {
      offlineMode: false,
      runner: 'legendary' as const,
      canRunOffline: true
    }
    expect(storeLaunchHooks.legendary.resolveOfflineMode!(input)).toBe(true)
    expect(getNodefaultMock).toHaveBeenCalledWith('expired')
    expect(resolveEpicOfflineModeMock).toHaveBeenCalledWith({
      ...input,
      storeExpired: true
    })
  })

  test('legendary isOverlayEnabled delegates to the eos overlay check', async () => {
    isEnabledMock.mockResolvedValue(true)
    await expect(
      storeLaunchHooks.legendary.isOverlayEnabled!('l1')
    ).resolves.toBe(true)
    expect(isEnabledMock).toHaveBeenCalledWith(expect.anything(), 'l1')
  })

  test('steam persistBottleWineVersion persists through the deps bottle instance', async () => {
    const v = { name: 'cx' } as WineInstallation
    await storeLaunchHooks.steam.persistBottleWineVersion!(v)
    expect(persistMock).toHaveBeenCalledWith(v)
  })
})
