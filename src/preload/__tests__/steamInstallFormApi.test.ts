/**
 * Preload wiring proof for Phase 34.13 Plan 07's install-form channels
 * (`isSteamBottleEligible` / `persistBottleWineVersion`).
 *
 * Phase 35 plan 16 collapsed `../ipc.ts`'s `makeHandlerInvoker` to an
 * unconditional Tauri call -- the old "Electron transport" describe block
 * asserted a routing decision (Tauri-context check false -> `ipcRenderer.invoke`)
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

// Phase 35 Plan 18 (T-27-07): this suite used to guard against 'electron' being resolved on
// the Tauri preload path via a throw-on-require jest.mock('electron', ...) factory. Plan 18
// retired the 'electron' devDependency outright, so the guard is now structural: 'electron'
// cannot resolve on ANY path, in ANY suite, because it no longer exists in node_modules at
// all. A jest.mock('electron', ...) call here would itself throw "Cannot find module
// 'electron'" at REGISTRATION time (before this factory could ever run), which is a strictly
// stronger guarantee than the runtime throw it replaces. See meta/__tests__/electronAbsence.test.ts
// for the project-wide mechanized version of this same guarantee.

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
