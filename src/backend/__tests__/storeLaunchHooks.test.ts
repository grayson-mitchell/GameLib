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
jest.mock('backend/storeManagers/legendary/electronStores', () => ({
  legendaryConfigStore: {
    get_nodefault: (...a: unknown[]) => getNodefaultMock(...a)
  }
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
jest.mock('backend/storeManagers/steam/bottle', () => ({
  persistBottleWineVersion: (...a: unknown[]) => persistMock(...a)
}))
jest.mock('backend/ipc', () => ({
  sendFrontendMessage: (...a: unknown[]) => sendFrontendMessageMock(...a)
}))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  RunnerToLogPrefixMap: {}
}))
jest.mock('backend/downloadmanager/downloadqueue', () => ({
  addToQueue: jest.fn()
}))
for (const lib of ['sideload', 'gog', 'legendary', 'nile', 'steam']) {
  jest.mock(`backend/storeManagers/${lib}/library`, () => ({
    __esModule: true,
    default: class {}
  }))
}

import type LogWriter from 'backend/logger/log_writer'
import type { WineInstallation } from 'common/types'
import { storeLaunchHooks } from 'backend/storeManagers'

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
    expect(gogSetupMock).toHaveBeenCalledWith('a1')
    expect(sendFrontendMessageMock).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: 'a1',
      runner: 'gog',
      status: 'launching'
    })
  })

  test('nile prepareLaunch runs nileSetup(appName)', async () => {
    await storeLaunchHooks.nile.prepareLaunch!('n1', logWriter)
    expect(nileSetupMock).toHaveBeenCalledWith('n1')
  })

  test('legendary prepareLaunch runs legendarySetup(appName, logWriter)', async () => {
    await storeLaunchHooks.legendary.prepareLaunch!('l1', logWriter)
    expect(legendarySetupMock).toHaveBeenCalledWith('l1', logWriter)
  })

  test('steam and sideload have no prepareLaunch', () => {
    expect(storeLaunchHooks.steam.prepareLaunch).toBeUndefined()
    expect(storeLaunchHooks.sideload.prepareLaunch).toBeUndefined()
  })

  test('gog setPresence sets the current game then awaits setPresence', async () => {
    await storeLaunchHooks.gog.setPresence!('a1')
    expect(setCurrentGameMock).toHaveBeenCalledWith('a1')
    expect(setPresenceMock).toHaveBeenCalledTimes(1)
  })

  test('gog clearPresence sets the empty game then awaits setPresence', async () => {
    await storeLaunchHooks.gog.clearPresence!()
    expect(setCurrentGameMock).toHaveBeenCalledWith('')
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
    expect(isEnabledMock).toHaveBeenCalledWith('l1')
  })

  test('steam persistBottleWineVersion lazy-imports bottle and persists', async () => {
    const v = { name: 'cx' } as WineInstallation
    await storeLaunchHooks.steam.persistBottleWineVersion!(v)
    expect(persistMock).toHaveBeenCalledWith(v)
  })
})
