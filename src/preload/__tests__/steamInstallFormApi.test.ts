/**
 * Preload wiring proof for Phase 34.13 Plan 07's install-form channels
 * (`isSteamBottleEligible` / `persistBottleWineVersion`).
 *
 * Phase 35 plan 16 collapsed `../ipc.ts`'s `makeHandlerInvoker` to an
 * unconditional Tauri call -- the old "Electron transport" describe block
 * asserted a routing decision (`isTauri() === false` -> `ipcRenderer.invoke`)
 * that no longer exists, so it is removed rather than left to assert nothing
 * (see `gamepadActionRouting.test.ts` for the same treatment). The `electron`
 * mock below is now a THROW, not a working stub: this suite exercises the
 * REAL `makeHandlerInvoker` (`../ipc.ts`, unmocked); only its
 * `../tauriTransport` dependency is mocked. An assertion that an export
 * merely exists would NOT satisfy this task -- every spec below calls the
 * export and asserts the exact channel string and argument shape reached the
 * underlying transport call, so a typo in either `makeHandlerInvoker`
 * argument makes these specs fail.
 *
 * jest.config sets `resetMocks: true` -- every mock's implementation/return
 * value is (re)established in each describe block's own `beforeEach`.
 */

jest.mock('electron', () => {
  throw new Error('electron must not be resolved on the Tauri path (T-27-07)')
})

const mockedTauriInvoke = jest.fn()
jest.mock('../tauriTransport', () => ({
  invoke: (...args: unknown[]) => mockedTauriInvoke(...args),
  send: jest.fn(),
  listen: jest.fn()
}))

import { isSteamBottleEligible, persistBottleWineVersion } from '../api/steam'
import type { WineInstallation } from 'common/types'

const engine: WineInstallation = {
  bin: '/opt/crossover/bin/wine',
  name: 'CrossOver 24',
  type: 'crossover'
}

describe('steam.ts install-form preload exports (Phase 34.13 Plan 07)', () => {
  beforeEach(() => {
    mockedTauriInvoke.mockResolvedValue(undefined)
  })

  it('isSteamBottleEligible invokes the exact channel name with args as an ARRAY', () => {
    isSteamBottleEligible('570')

    expect(mockedTauriInvoke).toHaveBeenCalledWith('isSteamBottleEligible', ['570'])
  })

  it('persistBottleWineVersion invokes the exact channel name with args as an ARRAY', () => {
    persistBottleWineVersion(engine)

    expect(mockedTauriInvoke).toHaveBeenCalledWith('persistBottleWineVersion', [engine])
  })
})
