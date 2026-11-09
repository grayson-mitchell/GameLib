import { resetAllStores, type StoreHooks } from '../storeKit'
import type { UiState } from '../uiState'
import type * as InitModule from '../initStateSubscriptions'

type Handler = (...args: unknown[]) => unknown

/**
 * A fake `window.api`: every `handle*`/`on*` property records its handler in
 * call order; the awaited getters resolve from `values`.
 */
const calls: string[] = []
const handlers = new Map<string, Handler[]>()
const values: Record<string, unknown> = {}
const fakeApi = new Proxy(
  {},
  {
    get: (_t, name: string) => {
      if (name === 'isFullscreen' || name === 'isFrameless') {
        return () => {
          calls.push(`seed:${name}`)
          return Promise.resolve(values[name] ?? false)
        }
      }
      if (name === 'getConnectivityStatus') {
        return () => new Promise(() => undefined)
      }
      if (/^(handle|on)[A-Z]/.test(name)) {
        return (fn: Handler) => {
          calls.push(`register:${name}`)
          handlers.set(name, [...(handlers.get(name) ?? []), fn])
        }
      }
      return () => undefined
    }
  }
)

// Node-env frontend project (no jsdom): give the modules a window first.
;(globalThis as unknown as { window: object }).window = {
  platform: 'linux',
  api: fakeApi,
  __TAURI_INTERNALS__: {
    invoke: () => Promise.resolve(undefined),
    transformCallback: () => 0,
    unregisterCallback: () => undefined,
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' }
    }
  }
}

const MOVED_LISTENERS = [
  'handleInstallGame',
  'handleSteamBottleSetupRequired',
  'handleSteamClientSetupRequired',
  'handleSteamBridgeSetupRequired',
  'handleSteamBridgeRouteNotice',
  'handleSteamGoOfflineRequired',
  'handleEngineStateChanged',
  'handleSteamRequestNotice',
  'handleReadOnlyStoresNotice',
  'handleSteamBottleLaunchWaiting'
]

describe('initStateSubscriptions', () => {
  let init: typeof InitModule
  let useUiState: StoreHooks<UiState>

  beforeAll(async () => {
    // window.api is replaced after helpers attach their own at import time.
    init = await import('../initStateSubscriptions')
    useUiState = (await import('../uiState')).default
  })

  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = fakeApi
    calls.length = 0
    handlers.clear()
    for (const k of Object.keys(values)) delete values[k]
    init.__resetInitStateSubscriptionsGuardForTests()
  })

  afterEach(() => {
    resetAllStores()
  })

  it('returns no disposer and registers every moved listener', () => {
    expect(init.initStateSubscriptions()).toBeUndefined()
    for (const name of MOVED_LISTENERS) {
      expect(handlers.get(name)).toHaveLength(1)
    }
  })

  it('registers each listener exactly once when called twice', () => {
    init.initStateSubscriptions()
    init.initStateSubscriptions()
    for (const name of MOVED_LISTENERS) {
      expect(handlers.get(name)).toHaveLength(1)
    }
  })

  it('guard reset allows a second registration (anti-vacuity)', () => {
    init.initStateSubscriptions()
    init.__resetInitStateSubscriptionsGuardForTests()
    init.initStateSubscriptions()
    expect(handlers.get('handleInstallGame')).toHaveLength(2)
  })

  it('section (1) applies readInitialUi', () => {
    ;(window as unknown as { platform: string }).platform = 'linux'
    init.initStateSubscriptions()
    expect(useUiState.getState().platform).toBe('linux')
  })

  it('the install-game handler writes showInstallModal', async () => {
    const helpers = await import('../../helpers')
    const gameInfo = { app_name: 'g', runner: 'gog', title: 'G' }
    const spy = jest
      .spyOn(helpers, 'getGameInfo')
      .mockResolvedValue(gameInfo as never)
    init.initStateSubscriptions()
    const handler = handlers.get('handleInstallGame')?.[0]
    await handler?.({}, 'g', 'gog')
    expect(useUiState.getState().showInstallModal).toEqual({
      show: true,
      appName: 'g',
      runner: 'gog',
      gameInfo
    })
    spy.mockRestore()
  })

  it('seedAndFollowWindowChrome seeds before it registers, and a push lands', async () => {
    values.isFrameless = true
    await init.seedAndFollowWindowChrome()
    expect(calls).toEqual([
      'seed:isFullscreen',
      'seed:isFrameless',
      'register:handleFullscreen',
      'register:handleFramelessChanged'
    ])
    expect(useUiState.getState().isFrameless).toBe(true)
    handlers.get('handleFramelessChanged')?.[0]?.(false)
    expect(useUiState.getState().isFrameless).toBe(false)
    handlers.get('handleFullscreen')?.[0]?.({}, true)
    expect(useUiState.getState().isFullscreen).toBe(true)
  })
})
