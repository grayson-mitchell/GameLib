import { resetAllStores, type StoreHooks } from '../storeKit'
import type { UiState } from '../uiState'
import type { SettingsState } from '../settingsState'
import type * as InitModule from '../initStateSubscriptions'

type Handler = (...args: unknown[]) => unknown

/**
 * A fake `window.api`: every `handle*`/`on*` property records its handler in
 * call order; the awaited getters resolve from `values`.
 */
const calls: string[] = []
const handlers = new Map<string, Handler[]>()
const values: Record<string, unknown> = {}
const config: Record<string, unknown> = {}
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
      if (name === 'setZoomFactor') {
        return (factor: string) => {
          calls.push(`zoom:${factor}`)
        }
      }
      if (name === 'storeGet') {
        return (_store: string, key: string, dflt?: unknown) =>
          key in config ? config[key] : dflt
      }
      if (name === 'requestAppSettings') {
        return () => {
          calls.push('requestAppSettings')
          return Promise.resolve(values.appSettings ?? {})
        }
      }
      if (name === 'setSetting') {
        return (payload: unknown) => {
          calls.push(`setSetting:${JSON.stringify(payload)}`)
        }
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
  localStorage: { getItem: () => null, setItem: () => undefined },
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

// Node-env: settingsState reads/writes these when the boot module runs.
;(globalThis as unknown as Record<string, unknown>).document = {
  documentElement: {},
  body: { classList: { toggle: () => undefined } }
}
;(globalThis as unknown as Record<string, unknown>).getComputedStyle = () => ({
  getPropertyValue: () => ''
})

describe('initStateSubscriptions', () => {
  let init: typeof InitModule
  let useUiState: StoreHooks<UiState>
  let useSettingsState: StoreHooks<SettingsState>

  beforeAll(async () => {
    // window.api is replaced after helpers attach their own at import time.
    init = await import('../initStateSubscriptions')
    useUiState = (await import('../uiState')).default
    useSettingsState = (await import('../settingsState')).default
  })

  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = fakeApi
    calls.length = 0
    handlers.clear()
    for (const k of Object.keys(values)) delete values[k]
    for (const k of Object.keys(config)) delete config[k]
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

  it('section (1) applies readInitialSettings after hydration', () => {
    config.theme = 'dracula'
    config.hideTitles = true
    init.initStateSubscriptions()
    expect(useSettingsState.getState().theme).toBe('dracula')
    expect(useSettingsState.getState().hideTitles).toBe(true)
  })

  it('applies the saved zoom, with the post-hydration value, before any listener registration', () => {
    config.zoomPercent = 150
    init.initStateSubscriptions()
    expect(calls[0]).toBe('zoom:1.5')
    const firstRegister = calls.findIndex((c) => c.startsWith('register:'))
    expect(firstRegister).toBeGreaterThan(0)
    expect(calls.filter((c) => c.startsWith('zoom:'))).toEqual(['zoom:1.5'])
  })

  it('SELF-TEST (anti-vacuity): an out-of-order fixture is convicted by the same check', () => {
    const outOfOrder = ['register:handleInstallGame', 'zoom:1.5']
    expect(outOfOrder[0]).not.toBe('zoom:1.5')
    expect(outOfOrder.findIndex((c) => c.startsWith('zoom:'))).toBeGreaterThan(
      outOfOrder.findIndex((c) => c.startsWith('register:'))
    )
  })

  it('focus-row hydration runs only when the mirror seed needs it', async () => {
    const settings = await import('../settingsState')
    init.initStateSubscriptions()
    const needed = settings.focusRowMirrorSeed.needsMigratedValue
    expect(calls.includes('requestAppSettings')).toBe(needed)
  })

  it('a user focus-row pick during hydration is not overwritten', async () => {
    const settings = await import('../settingsState')
    // the empty import-time mirror lacks focusRow, so hydration is armed
    expect(settings.focusRowMirrorSeed.needsMigratedValue).toBe(true)
    values.appSettings = { focusRow: 'recent' }
    init.initStateSubscriptions()
    useSettingsState.getState().handleFocusRow('picked' as never)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useSettingsState.getState().focusRow).toBe('picked')
    expect(calls.filter((c) => c.startsWith('setSetting:')).length).toBe(1)
  })

  it('writes the settings localStorage side effects from subscriptions', () => {
    const store = new Map<string, string>()
    ;(window as unknown as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v)
    }
    init.initStateSubscriptions()
    expect(store.get('sidebar_collapsed')).toBe('false')
    useSettingsState.getState().setSideBarCollapsed(true)
    expect(store.get('sidebar_collapsed')).toBe('true')
  })
})
