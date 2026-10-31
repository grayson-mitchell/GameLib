/**
 * Phase 59 Plan 08: the engine IPC channels registered by
 * registerSteamAuthFlows -- renderer args pass through UNCAST to the backend
 * validators, and the state publisher pushes `steamEngineStateChanged`.
 */
const handlers = new Map<string, (...a: unknown[]) => Promise<unknown>>()

jest.mock('../../platform', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => Promise<unknown>) => {
      handlers.set(ch, fn)
    },
    on: jest.fn()
  }
}))
jest.mock('../../storeManagers', () => ({}))
jest.mock('../../storeManagers/steam/user', () => ({ SteamUser: {} }))
jest.mock('../../storeManagers/steam/electronStores', () => ({}))
jest.mock('../../storeManagers/steam/bottle', () => ({}))
jest.mock('../../storeManagers/steam/clientSetup', () => ({}))
jest.mock('../../storeManagers/steam/games', () => ({}))
jest.mock('../../storeManagers/steam/constants', () => ({}))
jest.mock('../../storeManagers/steam/installFormIpc', () => ({}))
jest.mock('../../storeManagers/steam/removeAllCopies', () => ({}))
jest.mock('../../storeManagers/steam/macSteamOffline', () => ({}))

const getState = jest.fn()
const dismiss = jest.fn()
const setPublisher = jest.fn()
jest.mock('../../storeManagers/steam/engine/engineState', () => ({
  getSteamEngineState: (...a: unknown[]) => getState(...a),
  dismissSteamEngineNotice: (...a: unknown[]) => dismiss(...a),
  setEngineStatePublisher: (...a: unknown[]) => setPublisher(...a)
}))
const listOptions = jest.fn()
jest.mock('../../storeManagers/steam/engine/engineDecision', () => ({
  listEngineOverrideOptions: (...a: unknown[]) => listOptions(...a)
}))
const send = jest.fn()
jest.mock('../../ipc', () => ({
  sendFrontendMessage: (...a: unknown[]) => send(...a)
}))

import { registerSteamAuthFlows } from '../steamAuthFlowRegistration'

describe('steam engine flows', () => {
  beforeAll(() => registerSteamAuthFlows())
  beforeEach(() => jest.clearAllMocks())

  it('passes getSteamEngineState args[0] through unmodified', async () => {
    getState.mockResolvedValue({ kind: 'x' })
    const arg = { weird: 1 }
    expect(await handlers.get('getSteamEngineState')!({}, arg)).toEqual({
      kind: 'x'
    })
    expect(getState).toHaveBeenCalledWith(arg)
  })

  it('lists engine options ignoring renderer args', async () => {
    listOptions.mockResolvedValue([{ id: 'a' }])
    expect(await handlers.get('listSteamEngineOptions')!({}, 'evil')).toEqual([
      { id: 'a' }
    ])
    expect(listOptions).toHaveBeenCalledWith()
  })

  it('passes dismissSteamEngineNotice args[0] through unmodified', async () => {
    dismiss.mockResolvedValue({ ok: false })
    const arg = { kind: 'bogus' }
    await handlers.get('dismissSteamEngineNotice')!({}, arg)
    expect(dismiss).toHaveBeenCalledWith(arg)
  })

  it('wires the publisher to steamEngineStateChanged', () => {
    registerSteamAuthFlows()
    const publisher = setPublisher.mock.calls[0][0] as (s: unknown) => void
    const state = { appId: '1' }
    publisher(state)
    expect(send).toHaveBeenCalledWith('steamEngineStateChanged', state)
  })
})
