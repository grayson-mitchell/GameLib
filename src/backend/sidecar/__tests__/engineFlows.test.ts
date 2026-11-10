/**
 * Phase 61 Plan 13: the store-agnostic engine IPC channels registered by registerEngineFlows --
 * renderer args pass through UNCAST to the backend validators, Steam is dispatched by capability,
 * and the state publisher pushes `engineStateChanged`.
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
const envState = { isMac: true }
jest.mock('../../constants/environment', () => ({
  get isMac() {
    return envState.isMac
  }
}))
const getGame = jest.fn()

const dismiss = jest.fn()
const setPublisher = jest.fn()
jest.mock('backend/engine/engineState', () => ({
  dismissEngineNotice: (...a: unknown[]) => dismiss(...a),
  setEngineStatePublisher: (...a: unknown[]) => setPublisher(...a)
}))
const gameState = jest.fn()
const gameOptions = jest.fn()
const defaultEngine = jest.fn()
const bottleName = jest.fn()
jest.mock('backend/engine/gameEngineState', () => ({
  getGameEngineState: (...a: unknown[]) => gameState(...a),
  listGameEngineOptions: (...a: unknown[]) => gameOptions(...a),
  getDefaultEngine: (...a: unknown[]) => defaultEngine(...a),
  getPerGameBottleNameFor: (...a: unknown[]) => bottleName(...a)
}))
const steamState = jest.fn()
jest.mock('backend/storeManagers/steam/engine/steamEngineDeps', () => ({
  getSteamEngineState: (...a: unknown[]) => steamState(...a)
}))
const send = jest.fn()
jest.mock('../../ipc', () => ({
  sendFrontendMessage: (...a: unknown[]) => send(...a)
}))

import { registerEngineFlows } from '../engineFlowRegistration'
import { createTestServices } from 'backend/testUtils/testServices'
import {
  createTestManagers,
  createTestStores
} from 'backend/testUtils/testServices'

const stores = createTestStores()
const managers = createTestManagers({
  library: {
    legendary: { getGame: (...a: [string]) => getGame(...a) },
    gog: { getGame: (...a: [string]) => getGame(...a) },
    steam: { getGame: (...a: [string]) => getGame(...a) }
  }
})

function fakeGame(over: { native?: boolean; platform?: string } = {}) {
  return {
    isNative: () => over.native ?? false,
    getGameInfo: () => ({ install: { platform: over.platform ?? 'Windows' } })
  }
}

const spawnAsync = createTestServices().spawnAsync
const runner = createTestServices().runner

describe('engine flows', () => {
  beforeAll(() => registerEngineFlows({ managers, stores, spawnAsync, runner }))
  beforeEach(() => {
    jest.clearAllMocks()
    envState.isMac = true
  })

  it('registers the five invoke channels', () => {
    expect([...handlers.keys()].sort()).toEqual([
      'dismissEngineNotice',
      'getDefaultEngine',
      'getEngineState',
      'getPerGameBottleName',
      'listEngineOptions'
    ])
  })

  it('dispatches a bottle-runtime store to the Steam adapter with the app id', async () => {
    steamState.mockResolvedValue({ kind: 's' })
    expect(
      await handlers.get('getEngineState')!(
        {},
        { runner: 'steam', appName: '220' }
      )
    ).toEqual({ kind: 's' })
    expect(steamState).toHaveBeenCalledWith(
      { managers, stores, spawnAsync, runner },
      '220'
    )
    expect(getGame).not.toHaveBeenCalled()
    expect(gameState).not.toHaveBeenCalled()
  })

  it('dispatches a non-Steam Windows game to the non-Steam state, args uncast', async () => {
    getGame.mockReturnValue(fakeGame())
    gameState.mockResolvedValue({ kind: 'n' })
    const arg = { runner: 'legendary', appName: 'abc' }
    expect(await handlers.get('getEngineState')!({}, arg)).toEqual({
      kind: 'n'
    })
    expect(gameState).toHaveBeenCalledWith(
      { spawnAsync, wineManagerReleases: expect.any(Function) },
      arg
    )
  })

  it('returns null for an invalid identity without any game lookup', async () => {
    for (const bad of [
      null,
      'x',
      {},
      { runner: 5, appName: 'a' },
      { runner: 'nope', appName: 'a' },
      { runner: 'legendary', appName: '../x' },
      { runner: 'steam', appName: 'notanumber' }
    ]) {
      expect(await handlers.get('getEngineState')!({}, bad)).toBeNull()
    }
    expect(getGame).not.toHaveBeenCalled()
    expect(gameState).not.toHaveBeenCalled()
    expect(steamState).not.toHaveBeenCalled()
  })

  it('returns null for a native or Browser game, off macOS, or a failing lookup', async () => {
    const arg = { runner: 'gog', appName: 'abc' }
    getGame.mockReturnValue(fakeGame({ native: true }))
    expect(await handlers.get('getEngineState')!({}, arg)).toBeNull()
    getGame.mockReturnValue(fakeGame({ platform: 'Browser' }))
    expect(await handlers.get('getEngineState')!({}, arg)).toBeNull()
    getGame.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(await handlers.get('getEngineState')!({}, arg)).toBeNull()
    getGame.mockReturnValue(fakeGame())
    envState.isMac = false
    expect(await handlers.get('getEngineState')!({}, arg)).toBeNull()
    expect(gameState).not.toHaveBeenCalled()
  })

  it('lists options, passes args through, and exposes no path', async () => {
    gameOptions.mockResolvedValue([{ id: 'a', label: 'A' }])
    const arg = { appName: 'default' }
    const out = await handlers.get('listEngineOptions')!({}, arg)
    expect(gameOptions).toHaveBeenCalledWith(
      { spawnAsync, wineManagerReleases: expect.any(Function) },
      arg
    )
    expect(JSON.stringify(out)).not.toContain('/')
  })

  it('serves the default engine and per-game bottle name', async () => {
    defaultEngine.mockReturnValue({
      effectiveEngineId: 'x',
      engineSource: 'derived',
      legacyLabel: null
    })
    expect(await handlers.get('getDefaultEngine')!({})).toEqual({
      effectiveEngineId: 'x',
      engineSource: 'derived',
      legacyLabel: null
    })
    bottleName.mockReturnValue('GameLib-abc')
    const arg = { runner: 'gog', appName: 'abc' }
    expect(await handlers.get('getPerGameBottleName')!({}, arg)).toBe(
      'GameLib-abc'
    )
    expect(bottleName).toHaveBeenCalledWith(arg)
  })

  it('passes dismissEngineNotice args[0] through unmodified', async () => {
    dismiss.mockResolvedValue({ ok: false })
    const arg = { kind: 'bogus' }
    await handlers.get('dismissEngineNotice')!({}, arg)
    expect(dismiss).toHaveBeenCalledWith(arg)
  })

  it('wires the publisher to engineStateChanged', () => {
    registerEngineFlows({ managers, stores, spawnAsync, runner })
    const publisher = setPublisher.mock.calls[0][0] as (s: unknown) => void
    const state = { appId: '1' }
    publisher(state)
    expect(send).toHaveBeenCalledWith('engineStateChanged', state)
  })
})
