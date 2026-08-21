/**
 * Preload wiring proof for Phase 34.13 Plan 07's install-form channels
 * (`isSteamBottleEligible` / `persistBottleWineVersion`) on BOTH transports.
 *
 * Mirrors `childWindows.test.ts`'s "electron mocked as a working stub, not a
 * throw" style plus `gamepadActionRouting.test.ts`'s controllable `isTauri`
 * -- unlike `gamepadActionRouting.test.ts`, no second file is needed here
 * because this suite exercises the REAL `makeHandlerInvoker` (`../ipc.ts`,
 * unmocked); only its `../tauriTransport` dependency is mocked. An assertion
 * that an export merely exists would NOT satisfy this task -- every spec
 * below calls the export and asserts the exact channel string reached the
 * underlying transport call, so a typo in either `makeHandlerInvoker`
 * argument makes these specs fail.
 *
 * jest.config sets `resetMocks: true` -- every mock's implementation/return
 * value is (re)established in each describe block's own `beforeEach`.
 */

const mockedIsTauri = jest.fn()
const mockedTauriInvoke = jest.fn()
jest.mock('../tauriTransport', () => ({
  isTauri: () => mockedIsTauri(),
  invoke: (...args: unknown[]) => mockedTauriInvoke(...args),
  send: jest.fn(),
  listen: jest.fn()
}))

const mockIpcRendererInvoke = jest.fn()
jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockIpcRendererInvoke(...args)
  }
}))

import { isSteamBottleEligible, persistBottleWineVersion } from '../api/steam'
import type { WineInstallation } from 'common/types'

const engine: WineInstallation = {
  bin: '/opt/crossover/bin/wine',
  name: 'CrossOver 24',
  type: 'crossover'
}

describe('steam.ts install-form preload exports (Phase 34.13 Plan 07)', () => {
  describe('Electron transport', () => {
    beforeEach(() => {
      mockedIsTauri.mockReturnValue(false)
      mockIpcRendererInvoke.mockResolvedValue(undefined)
    })

    it('isSteamBottleEligible invokes the exact channel name with args SPREAD', () => {
      isSteamBottleEligible('570')

      expect(mockIpcRendererInvoke).toHaveBeenCalledWith('isSteamBottleEligible', '570')
      expect(mockedTauriInvoke).not.toHaveBeenCalled()
    })

    it('persistBottleWineVersion invokes the exact channel name with args SPREAD', () => {
      persistBottleWineVersion(engine)

      expect(mockIpcRendererInvoke).toHaveBeenCalledWith('persistBottleWineVersion', engine)
      expect(mockedTauriInvoke).not.toHaveBeenCalled()
    })
  })

  describe('Tauri transport', () => {
    beforeEach(() => {
      mockedIsTauri.mockReturnValue(true)
      mockedTauriInvoke.mockResolvedValue(undefined)
    })

    it('isSteamBottleEligible invokes the exact channel name with args as an ARRAY', () => {
      isSteamBottleEligible('570')

      expect(mockedTauriInvoke).toHaveBeenCalledWith('isSteamBottleEligible', ['570'])
      expect(mockIpcRendererInvoke).not.toHaveBeenCalled()
    })

    it('persistBottleWineVersion invokes the exact channel name with args as an ARRAY', () => {
      persistBottleWineVersion(engine)

      expect(mockedTauriInvoke).toHaveBeenCalledWith('persistBottleWineVersion', [engine])
      expect(mockIpcRendererInvoke).not.toHaveBeenCalled()
    })
  })
})
