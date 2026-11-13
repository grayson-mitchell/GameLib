import i18next from 'i18next'
import { resetAllStores, type StoreHooks } from '../storeKit'
import type { UiState } from '../uiState'
import type { SettingsState } from '../settingsState'
import type { AuthState } from '../authState'
import type { LibraryState } from '../libraryState'
import type * as InitModule from '../initStateSubscriptions'

type Handler = (...args: unknown[]) => unknown

/**
 * A fake `window.api`: every `handle*`/`on*` property records its handler in
 * call order; the awaited getters resolve from `values`.
 */
const calls: string[] = []
const errors: string[] = []
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
      if (name === 'getDMQueueInformation') {
        return () =>
          Promise.resolve({ elements: [], finished: [], state: 'idle' })
      }
      if (name === 'getCrossoverIndex' || name === 'getRunsForMeMap') {
        const key =
          name === 'getCrossoverIndex' ? 'crossoverIndex' : 'runsForMe'
        return () => {
          if (values[`${key}Reject`]) return Promise.reject(new Error('boom'))
          return key in values
            ? Promise.resolve(values[key])
            : new Promise(() => undefined)
        }
      }
      if (name === 'logError') {
        return (message: string) => {
          errors.push(message)
        }
      }
      if (name === 'humbleGetKeys') {
        return () => Promise.resolve(values.humbleKeys ?? [])
      }
      if (name === 'humbleGetSyncState') {
        return () =>
          Promise.resolve(
            values.humbleSyncState ?? { syncedAt: null, syncError: 'none' }
          )
      }
      if (name === 'humbleSync') {
        return () => {
          calls.push('humbleSync')
          return Promise.resolve()
        }
      }
      if (name === 'getSignInProbeOutcomes') {
        return () => Promise.resolve([])
      }
      if (name === 'getConnectivityStatus') {
        return () => new Promise(() => undefined)
      }
      if (name === 'setZoomFactor') {
        return (factor: string) => {
          calls.push(`zoom:${factor}`)
        }
      }
      if (name === 'lock') {
        return (playing: boolean) => {
          calls.push(`lock:${playing}`)
        }
      }
      if (name === 'unlock') {
        return () => {
          calls.push('unlock')
        }
      }
      if (name === 'storeGet') {
        return (_store: string, key: string, dflt?: unknown) =>
          key in config ? config[key] : dflt
      }
      if (name === 'storeHas') {
        // CacheStore.get gates on storeHas + a `__timestamp.<key>` companion
        return (_store: string, key: string) => key in config
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
  addEventListener: () => undefined,
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
  'handleGameStatus',
  'handleInstallGame',
  'handleCrossoverIndexChanged',
  'handleRunsForMeChanged',
  'handleSteamMetadataSyncing',
  'handleSteamSyncStatus',
  'handleRefreshLibrary',
  'handleMetadataChanged',
  'handleGamePush',
  'handleSteamBottleSetupRequired',
  'handleSteamClientSetupRequired',
  'handleSteamBridgeSetupRequired',
  'handleSteamBridgeRouteNotice',
  'handleSteamGoOfflineRequired',
  'handleEngineStateChanged',
  'handleSteamRequestNotice',
  'handleReadOnlyStoresNotice',
  'handleSteamBottleLaunchWaiting',
  'handleDMQueueInformation',
  'handleHumbleAuthState',
  'handleSignInProbeOutcomes',
  'handleHumbleKeysUpdated',
  'handleHumbleSyncProgress',
  'handleHumbleSyncStateChanged'
]

// Node-env: settingsState reads/writes these when the boot module runs.
;(globalThis as unknown as Record<string, unknown>).document = {
  documentElement: { style: { setProperty: () => undefined } },
  body: { classList: { toggle: () => undefined } }
}
;(globalThis as unknown as Record<string, unknown>).getComputedStyle = () => ({
  getPropertyValue: () => ''
})

describe('initStateSubscriptions', () => {
  let init: typeof InitModule
  let useUiState: StoreHooks<UiState>
  let useInstallGameModal: typeof import('../InstallGameModal').useInstallGameModal
  let useSettingsState: StoreHooks<SettingsState>
  let useAuthState: StoreHooks<AuthState>
  let useLibraryState: StoreHooks<LibraryState>

  beforeAll(async () => {
    // window.api is replaced after helpers attach their own at import time.
    init = await import('../initStateSubscriptions')
    useUiState = (await import('../uiState')).default
    useSettingsState = (await import('../settingsState')).default
    useAuthState = (await import('../authState')).default
    useLibraryState = (await import('../libraryState')).default
    useInstallGameModal = (await import('../InstallGameModal'))
      .useInstallGameModal
  })

  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = fakeApi
    calls.length = 0
    errors.length = 0
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

  it('section (1) re-reads the persisted collections', () => {
    config['games.hidden'] = [{ appName: 'h', title: 'H' }]
    init.initStateSubscriptions()
    expect(useLibraryState.getState().hiddenGames).toEqual([
      { appName: 'h', title: 'H' }
    ])
  })

  it('the CrossOver and runs-for-me pushes and pulls land in libraryState', async () => {
    values.crossoverIndex = { a: 2 }
    values.runsForMe = { a_steam: { value: true } }
    init.initStateSubscriptions()
    await Promise.resolve()
    await Promise.resolve()
    expect(useLibraryState.getState().crossoverRatings).toEqual({ a: 2 })
    expect(Object.keys(useLibraryState.getState().runsForMe)).toEqual([
      'a_steam'
    ])
    handlers.get('handleCrossoverIndexChanged')?.[0]?.({}, { b: null })
    handlers.get('handleRunsForMeChanged')?.[0]?.({}, {})
    expect(useLibraryState.getState().crossoverRatings).toEqual({ b: null })
    expect(useLibraryState.getState().runsForMe).toEqual({})
  })

  it('a game push and a metadata change update libraryState', () => {
    init.initStateSubscriptions()
    handlers.get('handleGamePush')?.[0]?.(
      {},
      {
        app_name: 'g',
        runner: 'gog',
        title: 'G'
      }
    )
    expect(useLibraryState.getState().gogLibrary).toHaveLength(1)
    const overrides = { g: { wineVersion: 'w' } }
    handlers.get('handleMetadataChanged')?.[0]?.({}, overrides)
    expect(useLibraryState.getState().gameOverrides).toBe(overrides)
  })

  it('the game-status push lands in libraryState.libraryStatus (spread copy)', () => {
    init.initStateSubscriptions()
    const args = { appName: 'e', status: 'installing', runner: 'legendary' }
    handlers.get('handleGameStatus')?.[0]?.({}, args)
    expect(useLibraryState.getState().libraryStatus).toEqual([args])
    expect(useLibraryState.getState().libraryStatus[0]).not.toBe(args)
  })

  it('boot registers the sleep subscriber: one immediate unlock, then lock on a playing push', () => {
    init.initStateSubscriptions()
    expect(calls.filter((c) => c === 'unlock')).toHaveLength(1)
    calls.length = 0
    handlers.get('handleGameStatus')?.[0]?.(
      {},
      { appName: 'p', status: 'playing', runner: 'gog' }
    )
    expect(calls).toContain('lock:true')
  })

  it('gameUpdates changes persist to localStorage updates (from boot)', () => {
    const written: string[] = []
    const w = window as unknown as { localStorage: unknown }
    const prior = w.localStorage
    w.localStorage = {
      getItem: () => null,
      setItem: (k: string, v: string) => {
        if (k === 'updates') written.push(v)
      }
    }
    try {
      init.initStateSubscriptions()
      useLibraryState.setState({ gameUpdates: ['a'] })
      // listeners from earlier boots stay registered (D-07), so assert the ends
      expect(written[0]).toBe('[]')
      expect(written.at(-1)).toBe('["a"]')
    } finally {
      w.localStorage = prior
    }
  })

  it('restoreStoredGameUpdates restores only when none are held', () => {
    const w = window as unknown as { localStorage: unknown }
    const prior = w.localStorage
    w.localStorage = { getItem: () => '["x"]', setItem: () => undefined }
    try {
      init.restoreStoredGameUpdates()
      expect(useLibraryState.getState().gameUpdates).toEqual(['x'])
      useLibraryState.setState({ gameUpdates: ['held'] })
      init.restoreStoredGameUpdates()
      expect(useLibraryState.getState().gameUpdates).toEqual(['held'])
    } finally {
      w.localStorage = prior
    }
  })

  it('shouldRunInBackgroundAtMount is true when any store library has games', () => {
    expect(init.shouldRunInBackgroundAtMount()).toBe(false)
    const g = [{ app_name: 'a' }] as never
    for (const key of [
      'epicLibrary',
      'gogLibrary',
      'amazonLibrary',
      'steamLibrary'
    ]) {
      useLibraryState.setState({ [key]: g })
      expect(init.shouldRunInBackgroundAtMount()).toBe(true)
      useLibraryState.setState({ [key]: [] })
    }
    // sideloaded alone does not count
    useLibraryState.setState({ sideloadedLibrary: g })
    expect(init.shouldRunInBackgroundAtMount()).toBe(false)
  })

  it('the Steam sync pushes land in libraryState without touching refreshingInTheBackground', () => {
    useLibraryState.setState({ refreshingInTheBackground: false })
    init.initStateSubscriptions()
    handlers.get('handleSteamMetadataSyncing')?.[0]?.({}, { syncing: true })
    handlers.get('handleSteamSyncStatus')?.[0]?.({}, { status: 'syncing' })
    const lib = useLibraryState.getState()
    expect(lib.steamMetadataSyncing).toBe(true)
    expect(lib.steamSyncStatus).toBe('syncing')
    expect(lib.refreshingInTheBackground).toBe(false)
  })

  it('the refresh push calls refreshLibrary with origin push', () => {
    const seen: unknown[] = []
    useLibraryState.setState({
      refreshLibrary: async (o) => {
        seen.push(o)
      }
    })
    init.initStateSubscriptions()
    handlers.get('handleRefreshLibrary')?.[0]?.({}, 'gog')
    expect(seen).toEqual([
      {
        checkForUpdates: false,
        runInBackground: true,
        library: 'gog',
        origin: 'push'
      }
    ])
  })

  it('runMountLibraryRefresh refreshes with origin mount only when some user exists', () => {
    const seen: Record<string, unknown>[] = []
    useLibraryState.setState({
      refreshLibrary: async (o) => {
        seen.push(o as Record<string, unknown>)
      }
    })
    const none = {
      legendaryUser: false,
      gogUser: false,
      amazonUser: false,
      steamUser: false
    }
    init.runMountLibraryRefresh(none)
    expect(seen).toEqual([])
    init.runMountLibraryRefresh({ ...none, steamUser: true })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ checkForUpdates: true, origin: 'mount' })
  })

  it('a failed pull logs the same messages', async () => {
    values.crossoverIndexReject = true
    values.runsForMeReject = true
    init.initStateSubscriptions()
    await new Promise((resolve) => setImmediate(resolve))
    expect(errors).toEqual([
      'CrossOver index pull failed: Error: boom',
      'Runs-for-me pull failed: Error: boom'
    ])
  })

  describe('install-game handler', () => {
    const gogInfo = { app_name: 'g', runner: 'gog', title: 'G' }
    let spy: jest.SpyInstance
    const closed = () => useInstallGameModal.setState({ isOpen: false })

    beforeEach(async () => {
      closed()
      const helpers = await import('../../helpers')
      spy = jest.spyOn(helpers, 'getGameInfo')
    })
    afterEach(() => {
      spy.mockRestore()
      closed()
    })

    it('opens the install modal via openInstallGameModal', async () => {
      spy.mockResolvedValue(gogInfo as never)
      init.initStateSubscriptions()
      await handlers.get('handleInstallGame')?.[0]?.({}, 'g', 'gog')
      expect(useInstallGameModal.getState()).toMatchObject({
        isOpen: true,
        appName: 'g',
        runner: 'gog',
        gameInfo: gogInfo,
        action: 'install'
      })
    })

    it.each(['installing', 'queued'] as const)(
      'skips a game whose status was set after registration: %s',
      async (status) => {
        spy.mockResolvedValue(gogInfo as never)
        init.initStateSubscriptions()
        useLibraryState.setState({
          libraryStatus: [{ appName: 'g', status }]
        })
        await handlers.get('handleInstallGame')?.[0]?.({}, 'g', 'gog')
        expect(spy).not.toHaveBeenCalled()
        expect(useInstallGameModal.getState().isOpen).toBe(false)
      }
    )

    it('does not open the modal for a sideload game', async () => {
      spy.mockResolvedValue({
        app_name: 's',
        runner: 'sideload',
        title: 'S'
      } as never)
      init.initStateSubscriptions()
      await handlers.get('handleInstallGame')?.[0]?.({}, 's', 'sideload')
      expect(useInstallGameModal.getState().isOpen).toBe(false)
    })
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

  it('focus-row hydration is armed by an empty post-hydration mirror', () => {
    init.initStateSubscriptions()
    expect(calls.filter((c) => c === 'requestAppSettings')).toHaveLength(1)
  })

  it('focus-row hydration is NOT armed when the hydrated mirror has a focusRow key', () => {
    config.settings = { focusRow: { kind: 'view', value: 'installed' } }
    init.initStateSubscriptions()
    expect(calls.includes('requestAppSettings')).toBe(false)
  })

  it('section (1) picks up settings hydrated after module import', () => {
    config.settings = {
      hideChangelogsOnStartup: true,
      experimentalFeatures: { cometSupport: false },
      focusRow: { kind: 'view', value: 'installed' },
      dismissedSignInNotices: ['gog']
    }
    init.initStateSubscriptions()
    const s = useSettingsState.getState()
    expect(s.hideChangelogsOnStartup).toBe(true)
    expect(s.experimentalFeatures.cometSupport).toBe(false)
    expect(s.focusRow).toEqual({ kind: 'view', value: 'installed' })
    expect(useAuthState.getState().dismissedSignInNotices).toEqual(['gog'])
  })

  it('section (1) attaches hydrated gameOverrides to the state and boot libraries', () => {
    config.overrides = { g: { wineVersion: 'w' } }
    config.games = [{ app_name: 'g', runner: 'gog', title: 'G' }]
    config['__timestamp.games'] = '2026-01-01T00:00:00Z'
    init.initStateSubscriptions()
    const lib = useLibraryState.getState()
    expect(lib.gameOverrides).toEqual({ g: { wineVersion: 'w' } })
    expect(lib.gogLibrary.find((g) => g.app_name === 'g')?.overrides).toEqual({
      wineVersion: 'w'
    })
  })

  it('SELF-TEST (anti-vacuity): with no hydrated overrides the boot entry carries none', () => {
    config.games = [{ app_name: 'g', runner: 'gog', title: 'G' }]
    config['__timestamp.games'] = '2026-01-01T00:00:00Z'
    init.initStateSubscriptions()
    const lib = useLibraryState.getState()
    expect(lib.gameOverrides).toEqual({})
    expect(
      lib.gogLibrary.find((g) => g.app_name === 'g')?.overrides
    ).toBeUndefined()
  })

  it('a user focus-row pick during hydration is not overwritten', async () => {
    const settings = await import('../settingsState')
    // the empty post-hydration mirror lacks focusRow, so hydration is armed
    expect(settings.readFocusRowMirrorSeed().needsMigratedValue).toBe(true)
    values.appSettings = { focusRow: 'recent' }
    init.initStateSubscriptions()
    useSettingsState.getState().handleFocusRow('picked' as never)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useSettingsState.getState().focusRow).toBe('picked')
    expect(calls.filter((c) => c.startsWith('setSetting:')).length).toBe(1)
  })

  describe('readMountStoreUsers steamUser (UAT 23 signed-out boot)', () => {
    it('is true with no userData but an installed cached Steam game', () => {
      config.games = [{ app_name: 's', runner: 'steam', is_installed: true }]
      config['__timestamp.games'] = '2026-01-01T00:00:00Z'
      expect(init.readMountStoreUsers().steamUser).toBe(true)
    })

    it('is false with no userData and no installed cached game', () => {
      config.games = [{ app_name: 's', runner: 'steam', is_installed: false }]
      config['__timestamp.games'] = '2026-01-01T00:00:00Z'
      expect(init.readMountStoreUsers().steamUser).toBe(false)
    })

    it('is true when userData is present', () => {
      config.userData = { username: 'u' }
      expect(init.readMountStoreUsers().steamUser).toBe(true)
    })
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

  it('section (1) applies readInitialAuth and the connected-flag gate starts the Humble sync', () => {
    config['userInfo.displayName'] = 'epicUser'
    config.isLoggedIn = true
    init.initStateSubscriptions()
    expect(useAuthState.getState().epicUsername).toBe('epicUser')
    expect(calls).toContain('humbleSync')
  })

  it('does not start a Humble sync when the stored session is not connected', () => {
    init.initStateSubscriptions()
    expect(calls).not.toContain('humbleSync')
  })

  it('the cache-then-sync pulls land in the store', async () => {
    values.humbleKeys = [{ id: 'k' }]
    values.humbleSyncState = { syncedAt: 9, syncError: 'denied' }
    init.initStateSubscriptions()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(useAuthState.getState().humble).toMatchObject({
      keys: [{ id: 'k' }],
      syncedAt: 9,
      syncError: 'denied',
      syncing: false
    })
  })

  it('the Humble push listeners update the store', () => {
    init.initStateSubscriptions()
    handlers.get('handleHumbleAuthState')?.[0]?.({}, { isLoggedIn: true })
    expect(useAuthState.getState().humble.isLoggedIn).toBe(true)
    handlers.get('handleHumbleSyncProgress')?.[0]?.({}, { done: 1, total: 4 })
    expect(useAuthState.getState().humble.syncing).toBe(true)
    handlers.get('handleHumbleSyncStateChanged')?.[0]?.(
      {},
      { syncedAt: 3, syncError: 'none' }
    )
    expect(useAuthState.getState().humble).toMatchObject({
      syncedAt: 3,
      syncing: false
    })
    handlers.get('handleHumbleKeysUpdated')?.[0]?.({}, [{ id: 'a' }])
    expect(useAuthState.getState().humble.keys).toEqual([{ id: 'a' }])
  })

  it('the outcome push is sanitised', () => {
    init.initStateSubscriptions()
    handlers.get('handleSignInProbeOutcomes')?.[0]?.(
      {},
      { outcomes: { gog: 'healthy', bogus: 'healthy' } }
    )
    expect(useAuthState.getState().signInProbeOutcomes).toEqual({
      gog: 'healthy'
    })
  })

  describe('runPostMountBoot', () => {
    it('runs once and ends with frontendReady after the other steps', async () => {
      const order: string[] = []
      const api = new Proxy(fakeApi as Record<string, unknown>, {
        get: (t, name: string) =>
          name === 'frontendReady'
            ? () => order.push('frontendReady')
            : name === 'isFullscreen'
              ? () => {
                  order.push('seed:isFullscreen')
                  return Promise.resolve(false)
                }
              : t[name]
      })
      ;(window as unknown as { api: unknown }).api = api
      init.initStateSubscriptions()
      await init.runPostMountBoot()
      await init.runPostMountBoot()
      expect(order.filter((o) => o === 'frontendReady')).toHaveLength(1)
      expect(order[0]).toBe('seed:isFullscreen')
      expect(order[order.length - 1]).toBe('frontendReady')
    })

    it('bootSequenceEffect triggers the boot exactly once even if called twice', async () => {
      let ready = 0
      const api = new Proxy(fakeApi as Record<string, unknown>, {
        get: (t, name: string) =>
          name === 'frontendReady' ? () => ready++ : t[name]
      })
      ;(window as unknown as { api: unknown }).api = api
      init.initStateSubscriptions()
      init.bootSequenceEffect()
      init.bootSequenceEffect()
      await new Promise((r) => setTimeout(r, 20))
      expect(ready).toBe(1)
    })
  })
  describe('i18next resolves its language a tick after init (http backend)', () => {
    // Runs first in this block: it performs the one real `i18next.init` of the
    // file, without inline `resources`, so `language` is set after a tick like
    // the production http-backend boot.
    it('settingsState.language follows i18next once it initialises', async () => {
      const ready: string[] = []
      let frontendReady = 0
      ;(window as unknown as { api: unknown }).api = new Proxy(
        fakeApi as Record<string, unknown>,
        {
          get: (t, name: string) =>
            name === 'frontendReady' ? () => frontendReady++ : t[name]
        }
      )
      const initDone = i18next.init({
        lng: 'pt-BR',
        fallbackLng: 'en',
        supportedLngs: ['en', 'pt_BR', 'pt-BR'],
        interpolation: { escapeValue: false }
      })
      // the CR-01 precondition: nothing resolved yet when the boot runs
      expect(i18next.language).toBeUndefined()
      expect(i18next.isInitialized).toBeFalsy()

      init.initStateSubscriptions()
      init.runWhenI18nextInitialized(() => ready.push('ran'))
      init.bootSequenceEffectWhenI18nReady()
      expect(useSettingsState.getState().language).toBe('en')
      expect(ready).toEqual([])
      // WR-01: the post-mount boot (frontendReady) waits for i18next
      // (runPostMountBoot's first step records a seed call synchronously)
      expect(calls).not.toContain('seed:isFullscreen')
      expect(frontendReady).toBe(0)

      await initDone
      expect(ready).toEqual(['ran'])
      expect(useSettingsState.getState().language).toBe('pt_BR')
      expect(calls).toContain('seed:isFullscreen')
      await new Promise((r) => setTimeout(r, 20))
      expect(frontendReady).toBe(1)
    })

    it('runWhenI18nextInitialized runs immediately once initialised', () => {
      let ran = 0
      init.runWhenI18nextInitialized(() => ran++)
      expect(ran).toBe(1)
    })
  })
})
