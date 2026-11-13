import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import type { GameInfo } from 'common/types'
import useLibraryState, {
  readInitialLibrary,
  registerLibrarySideEffects,
  selectInstallingEpicGame
} from '../libraryState'
import { useBottleLaunchWaiting } from '../BottleLaunchWaiting'
import type { GameStatus } from 'common/types'
import useAuthState from '../authState'

let logged: string[] = []
let writes: [string, unknown][] = []
const config: Record<string, unknown> = {}
const local: Record<string, string> = {}

describe('libraryState reverse-bridge actions', () => {
  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = {
      logError: (message: string) => {
        logged.push(message)
      },
      storeGet: (_store: string, key: string, dflt?: unknown) =>
        key in config ? config[key] : dflt,
      storeSet: (_store: string, key: string, value: unknown) => {
        writes.push([key, structuredClone(value)])
      }
    }
    ;(window as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => local[k] ?? null,
      setItem: (k: string, v: string) => {
        local[k] = v
        writes.push([`local:${k}`, v])
      }
    }
    logged = []
    writes = []
    for (const k of Object.keys(config)) delete config[k]
    for (const k of Object.keys(local)) delete local[k]
  })

  afterEach(() => {
    resetAllStores()
  })

  it('resetRunnerLibrary empties only that runner and setRefreshing sets the flag', () => {
    const g = (n: string) => ({ app_name: n }) as GameInfo
    useLibraryState.setState({
      epicLibrary: [g('e')],
      gogLibrary: [g('g')],
      amazonLibrary: [g('a')],
      steamLibrary: [g('s')]
    })
    const s = useLibraryState.getState()
    s.resetRunnerLibrary('nile')
    expect(useLibraryState.getState().amazonLibrary).toEqual([])
    expect(useLibraryState.getState().gogLibrary).toHaveLength(1)
    s.resetRunnerLibrary('sideload')
    expect(useLibraryState.getState().epicLibrary).toHaveLength(1)
    s.setRefreshing(true)
    expect(useLibraryState.getState().refreshing).toBe(true)
  })
})

describe('libraryState collections', () => {
  const lib = () => useLibraryState.getState()
  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = {
      logError: () => undefined,
      storeHas: () => false,
      storeGet: (_s: string, key: string, dflt?: unknown) =>
        key in config ? config[key] : dflt,
      storeSet: (_s: string, key: string, value: unknown) => {
        writes.push([key, structuredClone(value)])
      }
    }
    ;(window as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => local[k] ?? null,
      setItem: (k: string, v: string) => {
        local[k] = v
        writes.push([`local:${k}`, v])
      }
    }
    // Kept as explicit per-test isolation; the in-place mutation of the held
    // object was fixed in quick 261110-v11.
    useLibraryState.setState({ customCategories: {} })
    writes = []
    for (const k of Object.keys(config)) delete config[k]
    for (const k of Object.keys(local)) delete local[k]
  })
  afterEach(() => {
    resetAllStores()
  })

  it('hides and unhides, writing games.hidden each time', () => {
    lib().hideGame('a', 'A')
    lib().hideGame('b', 'B')
    lib().unhideGame('a')
    expect(lib().hiddenGames).toEqual([{ appName: 'b', title: 'B' }])
    expect(writes).toEqual([
      ['games.hidden', [{ appName: 'a', title: 'A' }]],
      [
        'games.hidden',
        [
          { appName: 'a', title: 'A' },
          { appName: 'b', title: 'B' }
        ]
      ],
      ['games.hidden', [{ appName: 'b', title: 'B' }]]
    ])
  })

  it('favourites dedupe by appName then append, and remove filters', () => {
    lib().addGameToFavourites('a', 'A')
    lib().addGameToFavourites('b', 'B')
    lib().addGameToFavourites('a', 'A2')
    expect(lib().favouriteGames).toEqual([
      { appName: 'b', title: 'B' },
      { appName: 'a', title: 'A2' }
    ])
    lib().removeGameFromFavourites('b')
    expect(lib().favouriteGames).toEqual([{ appName: 'a', title: 'A2' }])
    expect(writes.at(-1)).toEqual([
      'games.favourites',
      [{ appName: 'a', title: 'A2' }]
    ])
  })

  it('setCurrentCustomCategories writes localStorage then state', () => {
    lib().setCurrentCustomCategories(['x'])
    expect(lib().currentCustomCategories).toEqual(['x'])
    expect(writes).toEqual([['local:current_custom_categories', '["x"]']])
  })

  it('adds a category, selecting it only when some are already selected', () => {
    lib().setCustomCategory('one')
    expect(lib().currentCustomCategories).toEqual([])
    lib().setCurrentCustomCategories(['one'])
    lib().setCustomCategory('two')
    expect(lib().currentCustomCategories).toEqual(['one', 'two'])
    expect(lib().customCategories).toEqual({ one: [], two: [] })
    expect(writes.at(-1)).toEqual([
      'games.customCategories',
      { one: [], two: [] }
    ])
    expect(lib().getCustomCategories()).toEqual(['one', 'two'])
  })

  it('adds and removes a game in a category', () => {
    lib().setCustomCategory('c')
    lib().addGameToCustomCategory('c', 'g1')
    lib().addGameToCustomCategory('c', 'g2')
    lib().removeGameFromCustomCategory('c', 'g1')
    expect(lib().customCategories).toEqual({ c: ['g2'] })
    expect(writes.at(-1)).toEqual(['games.customCategories', { c: ['g2'] }])
    const before = writes.length
    lib().removeGameFromCustomCategory('missing', 'g2')
    expect(writes).toHaveLength(before)
  })

  it('renames a category and remaps the current selection', () => {
    lib().setCustomCategory('old')
    lib().setCurrentCustomCategories(['old', 'keep'])
    lib().renameCustomCategory('old', 'new')
    expect(lib().customCategories).toEqual({ new: [] })
    expect(lib().currentCustomCategories).toEqual(['new', 'keep'])
    expect(writes).toContainEqual(['games.customCategories', { new: [] }])
    const before = writes.length
    lib().renameCustomCategory('nope', 'x')
    expect(writes).toHaveLength(before)
  })

  it('removing the last current category falls back to uncategorized', () => {
    lib().setCustomCategory('only')
    lib().setCurrentCustomCategories(['only'])
    lib().removeCustomCategory('only')
    expect(lib().customCategories).toEqual({})
    expect(lib().currentCustomCategories).toEqual(['preset_uncategorized'])
    expect(local.current_custom_categories).toBe('["preset_uncategorized"]')
    expect(writes.at(-1)).toEqual(['games.customCategories', {}])
  })

  it('removing a category keeps the other current ones', () => {
    lib().setCustomCategory('a')
    lib().setCustomCategory('b')
    lib().setCurrentCustomCategories(['a', 'b'])
    lib().removeCustomCategory('a')
    expect(lib().currentCustomCategories).toEqual(['b'])
    const before = writes.length
    lib().removeCustomCategory('absent')
    expect(writes).toHaveLength(before)
  })

  describe('category actions never mutate the prior object', () => {
    const seed = (value: Record<string, string[]>) => {
      const prior = Object.freeze(
        Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, Object.freeze([...v])])
        )
      ) as Record<string, string[]>
      useLibraryState.setState({ customCategories: prior })
      return { prior, snapshot: structuredClone(value) }
    }

    it('setCustomCategory builds a new object', () => {
      const { prior, snapshot } = seed({ a: ['g'] })
      expect(() => lib().setCustomCategory('b')).not.toThrow()
      expect(lib().customCategories).not.toBe(prior)
      expect(lib().customCategories).toEqual({ a: ['g'], b: [] })
      expect(prior).toEqual(snapshot)
    })

    it('removeCustomCategory builds a new object and persists it', () => {
      const { prior, snapshot } = seed({ a: ['g'], b: [] })
      expect(() => lib().removeCustomCategory('a')).not.toThrow()
      expect(lib().customCategories).not.toBe(prior)
      expect(lib().customCategories).toEqual({ b: [] })
      expect(prior).toEqual(snapshot)
      expect(writes.at(-1)).toEqual(['games.customCategories', { b: [] }])
    })

    it('renameCustomCategory builds a new object, newName last', () => {
      const { prior, snapshot } = seed({ a: ['g'], b: [] })
      expect(() => lib().renameCustomCategory('a', 'z')).not.toThrow()
      expect(lib().customCategories).not.toBe(prior)
      expect(Object.keys(lib().customCategories)).toEqual(['b', 'z'])
      expect(lib().customCategories.z).toEqual(['g'])
      expect(prior).toEqual(snapshot)
      expect(writes).toContainEqual([
        'games.customCategories',
        { b: [], z: ['g'] }
      ])
    })

    it('addGameToCustomCategory builds new object and array', () => {
      const { prior, snapshot } = seed({ c: ['g1'] })
      expect(() => lib().addGameToCustomCategory('c', 'g2')).not.toThrow()
      expect(lib().customCategories).not.toBe(prior)
      expect(lib().customCategories.c).not.toBe(prior.c)
      expect(lib().customCategories.c).toEqual(['g1', 'g2'])
      expect(prior).toEqual(snapshot)
      lib().addGameToCustomCategory('new', 'g')
      expect(lib().customCategories).toEqual({ c: ['g1', 'g2'], new: ['g'] })
    })

    it('never mutates the store initial {}', () => {
      resetAllStores()
      lib().setCustomCategory('x')
      lib().renameCustomCategory('x', 'y')
      lib().addGameToCustomCategory('y', 'g')
      resetAllStores()
      expect(lib().customCategories).toEqual({})
    })
  })

  it('readInitialLibrary reads configStore and the new localStorage key', () => {
    config['games.hidden'] = [{ appName: 'h', title: 'H' }]
    config['games.favourites'] = [{ appName: 'f', title: 'F' }]
    config['games.customCategories'] = { c: ['g'] }
    local.current_custom_categories = '["c"]'
    expect(readInitialLibrary()).toMatchObject({
      hiddenGames: [{ appName: 'h', title: 'H' }],
      favouriteGames: [{ appName: 'f', title: 'F' }],
      customCategories: { c: ['g'] },
      currentCustomCategories: ['c']
    })
  })

  it('readInitialLibrary falls back to the legacy single-category key, then []', () => {
    local.current_custom_category = 'legacy'
    expect(readInitialLibrary().currentCustomCategories).toEqual(['legacy'])
    delete local.current_custom_category
    const empty = readInitialLibrary()
    expect(empty.currentCustomCategories).toEqual([])
    expect(empty.hiddenGames).toEqual([])
    expect(empty.customCategories).toEqual({})
  })

  it('holds the per-game display data and its setters', () => {
    expect(lib().crossoverRatings).toEqual({})
    expect(lib().runsForMe).toEqual({})
    lib().setCrossoverRatings({ a: 3, b: null })
    lib().setRunsForMe({ a_steam: { value: true } as never })
    lib().setGameOverrides({ a: { title: 'T' } as never })
    expect(lib().crossoverRatings).toEqual({ a: 3, b: null })
    expect(Object.keys(lib().runsForMe)).toEqual(['a_steam'])
    expect(lib().gameOverrides).toEqual({ a: { title: 'T' } })
  })
})

// ---- library data, overrides, pushes and refresh() (69-17) ----

const game = (
  name: string,
  runner: GameInfo['runner'] = 'gog',
  extra: Partial<GameInfo> = {}
) => ({ app_name: name, runner, title: name, ...extra }) as GameInfo

describe('libraryState library data', () => {
  const lib = () => useLibraryState.getState()
  const mirror: Record<string, unknown> = {}
  let infos: string[] = []
  let errors: string[] = []
  let fetched: unknown[] = []
  let updatesResult: () => Promise<string[]>

  beforeEach(() => {
    for (const k of Object.keys(mirror)) delete mirror[k]
    infos = []
    errors = []
    fetched = []
    updatesResult = async () => ['upd']
    ;(window as unknown as { api: unknown }).api = {
      logError: (m: string) => errors.push(m),
      logInfo: (m: string) => infos.push(m),
      storeNew: () => undefined,
      storeHas: (store: string, key: string) => `${store}:${key}` in mirror,
      storeGet: (store: string, key: string, dflt?: unknown) => {
        // CacheStore reads a `__timestamp.<key>` companion before the value
        if (key.startsWith('__timestamp.')) return '2026-01-01T00:00:00Z'
        return `${store}:${key}` in mirror ? mirror[`${store}:${key}`] : dflt
      },
      storeSet: () => undefined,
      refreshLibrary: async (runner: string) => {
        fetched.push(runner)
        // the backend repopulates the cache
        if (runner === 'gog') mirror['gog_library:games'] = [game('fresh')]
      },
      checkGameUpdates: () => updatesResult()
    }
    useLibraryState.setState({ gameOverrides: {} })
    useAuthState.setState({
      epicUsername: null,
      gogUsername: null,
      amazonUserId: null
    })
  })
  afterEach(() => {
    resetAllStores()
  })

  it('readInitialLibrary reads every mirror with overrides applied and merges installed GOG games', () => {
    mirror['legendary_library:library'] = [game('e', 'legendary')]
    mirror['gog_library:games'] = [game('g1'), game('g2')]
    mirror['gogInstalledGamesStore:installed'] = [{ appName: 'g1' }]
    mirror['nile_library:library'] = [game('a', 'nile')]
    mirror['steam_library:games'] = [game('s', 'steam')]
    mirror['sideloadedStore:games'] = [game('sl', 'sideload')]
    // readInitialLibrary reads the overrides post-hydration from the mirror
    mirror['gameOverridesStore:overrides'] = { s: { wineVersion: 'x' } }
    const init = readInitialLibrary()
    expect(init.gameOverrides).toEqual({ s: { wineVersion: 'x' } })
    expect(init.epicLibrary.map((g) => g.app_name)).toEqual(['e'])
    expect(init.gogLibrary[0]?.is_installed).toBe(true)
    expect(init.gogLibrary[0]?.install).toEqual({ appName: 'g1' })
    expect(init.gogLibrary[1]?.is_installed).toBeUndefined()
    expect(init.amazonLibrary).toHaveLength(1)
    expect(init.steamLibrary[0]?.overrides).toEqual({ wineVersion: 'x' })
    expect(init.sideloadedLibrary).toHaveLength(1)
  })

  it('updateGameOverrides sets overrides and reloads all but steam', () => {
    mirror['legendary_library:library'] = [game('e', 'legendary')]
    mirror['steam_library:games'] = [game('s', 'steam')]
    mirror['sideloadedStore:games'] = [game('sl', 'sideload')]
    const o = { e: { wineVersion: 'y' } as never, s: {} as never }
    useLibraryState.setState({ steamLibrary: [game('s', 'steam')] })
    lib().updateGameOverrides(o)
    expect(lib().gameOverrides).toBe(o)
    expect(lib().epicLibrary[0]?.overrides).toEqual({ wineVersion: 'y' })
    expect(lib().sideloadedLibrary).toHaveLength(1)
    expect(lib().steamLibrary[0]?.overrides).toBeUndefined()
  })

  it('applyGamePush ignores no app_name, upserts per store, ignores other runners', () => {
    lib().applyGamePush({ runner: 'gog' } as GameInfo)
    lib().applyGamePush(game('g'))
    lib().applyGamePush(game('g', 'gog', { title: 'new' }))
    lib().applyGamePush(game('e', 'legendary'))
    lib().applyGamePush(game('s', 'steam'))
    lib().applyGamePush(game('a', 'nile'))
    expect(lib().gogLibrary).toHaveLength(1)
    expect(lib().gogLibrary[0]?.title).toBe('new')
    expect(lib().epicLibrary).toHaveLength(1)
    expect(lib().steamLibrary).toHaveLength(1)
    expect(lib().amazonLibrary).toEqual([])
  })

  it('unscoped refresh sets arrays and flags, fetching only for empty caches', async () => {
    mirror['legendary_library:library'] = [game('e', 'legendary')]
    useAuthState.setState({ epicUsername: 'u', gogUsername: 'u' })
    useLibraryState.setState({
      refreshing: true,
      refreshingInTheBackground: false
    })
    await lib().refresh()
    // epic cache full: no fetch; gog cache empty: fetched
    expect(fetched).toEqual(['gog'])
    expect(infos).toContain('No cache found, getting data from gog...')
    expect(infos).not.toContain(
      'No cache found, getting data from legendary...'
    )
    expect(lib().epicLibrary.map((g) => g.app_name)).toEqual(['e'])
    expect(lib().gogLibrary.map((g) => g.app_name)).toEqual(['fresh'])
    expect(lib().refreshing).toBe(false)
    expect(lib().refreshingInTheBackground).toBe(true)
  })

  it('does not fetch a runner whose cache is non-empty', async () => {
    mirror['gog_library:games'] = [game('g')]
    mirror['nile_library:library'] = [game('a', 'nile')]
    useAuthState.setState({ gogUsername: 'u', amazonUserId: 'a' })
    await lib().refresh('all')
    expect(fetched).toEqual([])
  })

  it('a scoped refresh touches only its runner array and refreshingByRunner', async () => {
    mirror['gog_library:games'] = [game('g')]
    mirror['legendary_library:library'] = [game('e', 'legendary')]
    const keepEpic = [game('keep', 'legendary')]
    useLibraryState.setState({
      epicLibrary: keepEpic,
      refreshing: true,
      refreshingInTheBackground: false,
      refreshingByRunner: { gog: true, nile: true }
    })
    await lib().refresh('gog')
    expect(lib().gogLibrary.map((g) => g.app_name)).toEqual(['g'])
    expect(lib().epicLibrary).toBe(keepEpic)
    expect(lib().refreshing).toBe(true)
    expect(lib().refreshingInTheBackground).toBe(false)
    expect(lib().refreshingByRunner).toEqual({ gog: false, nile: true })
  })

  it('checkUpdates stores the result and keeps old updates on failure', async () => {
    useLibraryState.setState({ gameUpdates: ['old'] })
    await lib().refresh(undefined, true)
    expect(lib().gameUpdates).toEqual(['upd'])
    updatesResult = async () => {
      throw new Error('boom')
    }
    await lib().refresh(undefined, true)
    expect(lib().gameUpdates).toEqual(['upd'])
    expect(errors).toEqual(['Game update check failed: Error: boom'])
  })

  it('logs Force Update when the epic length changed', async () => {
    mirror['legendary_library:library'] = [game('e', 'legendary')]
    await lib().refresh()
    expect(infos).toContain('Force Update')
  })

  it('refreshLibrary logs runner=all when no runner is given, sets the global flags, then refreshes', async () => {
    const refreshed: unknown[][] = []
    useLibraryState.setState({
      refresh: async (...args: unknown[]) => {
        refreshed.push(args)
      }
    })
    await lib().refreshLibrary({
      checkForUpdates: true,
      runInBackground: false,
      origin: 'mount'
    })
    expect(infos).toEqual(['[refreshLibrary] runner=all origin=mount'])
    expect(fetched).toEqual([undefined])
    expect(refreshed).toEqual([[undefined, true]])
    expect(lib().refreshingInTheBackground).toBe(false)
  })

  it('refreshLibrary defaults origin to unknown and never prints undefined', async () => {
    useLibraryState.setState({ refresh: async () => undefined })
    await lib().refreshLibrary({ checkForUpdates: false, library: 'gog' })
    expect(infos).toEqual(['[refreshLibrary] runner=gog origin=unknown'])
    expect(infos.join()).not.toContain('undefined')
  })

  it('refreshLibrary returns early while a global refresh is running', async () => {
    useLibraryState.setState({ refreshing: true })
    await lib().refreshLibrary({ checkForUpdates: false })
    expect(infos).toEqual([])
    expect(fetched).toEqual([])
  })

  it('re-runs a checkForUpdates refresh requested mid-flight exactly once', async () => {
    const calls: unknown[][] = []
    let first = true
    useLibraryState.setState({
      refresh: (...args: unknown[]) => {
        calls.push(args)
        if (first) {
          first = false
          // three requests while this refresh is in flight
          void lib().refreshLibrary({ checkForUpdates: true })
          void lib().refreshLibrary({ checkForUpdates: true })
          void lib().refreshLibrary({ checkForUpdates: true })
        }
        useLibraryState.setState({ refreshing: false })
        return Promise.resolve()
      }
    })
    await lib().refreshLibrary({ checkForUpdates: false })
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual([
      [undefined, false],
      [undefined, true]
    ])
  })

  it('does not re-run a mid-flight request that did not ask for update checks', async () => {
    const calls: unknown[][] = []
    let first = true
    useLibraryState.setState({
      refresh: (...args: unknown[]) => {
        calls.push(args)
        if (first) {
          first = false
          void lib().refreshLibrary({ checkForUpdates: false })
        }
        useLibraryState.setState({ refreshing: false })
        return Promise.resolve()
      }
    })
    await lib().refreshLibrary({ checkForUpdates: false })
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toHaveLength(1)
  })

  it('refreshLibrary returns early for a runner already refreshing but not for another', async () => {
    useLibraryState.setState({
      refreshingByRunner: { gog: true },
      refresh: async () => undefined
    })
    await lib().refreshLibrary({ checkForUpdates: false, library: 'gog' })
    // the log line precedes the scoped guard, as in the class
    expect(fetched).toEqual([])
    await lib().refreshLibrary({ checkForUpdates: false, library: 'nile' })
    expect(fetched).toEqual(['nile'])
  })

  it('refreshLibrary logs and resets both flags when the backend rejects', async () => {
    ;(window.api as unknown as Record<string, unknown>).refreshLibrary =
      async () => {
        throw new Error('boom')
      }
    await lib().refreshLibrary({ checkForUpdates: false, library: 'gog' })
    expect(errors).toEqual(['Library refresh failed: Error: boom'])
    expect(lib().refreshing).toBe(false)
    expect(lib().refreshingByRunner.gog).toBe(false)
  })

  it('the Steam sync setters write only their own field', () => {
    useLibraryState.setState({ refreshingInTheBackground: false })
    lib().setSteamSyncStatus('failed' as never)
    lib().setSteamMetadataSyncing(true)
    expect(lib().steamSyncStatus).toBe('failed')
    expect(lib().steamMetadataSyncing).toBe(true)
    expect(lib().refreshingInTheBackground).toBe(false)
  })

  it('registerLibrarySideEffects writes updates now and on every change', () => {
    const written: string[] = []
    ;(window as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => null,
      setItem: (k: string, v: string) => {
        if (k === 'updates') written.push(v)
      }
    }
    registerLibrarySideEffects()
    useLibraryState.setState({ gameUpdates: ['x'] })
    expect(written).toEqual(['[]', '["x"]'])
  })
})

describe('libraryState handleGameStatus (hot path)', () => {
  type Refresh = ReturnType<typeof useLibraryState.getState>['refreshLibrary']
  let refreshCalls: Parameters<Refresh>[0][] = []
  const lib = () => useLibraryState.getState()
  const push = (status: Partial<GameStatus> & { appName: string }) =>
    lib().handleGameStatus({
      status: 'installing',
      runner: 'legendary',
      ...status
    } as GameStatus)

  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = {
      logError: () => undefined,
      storeHas: () => false,
      storeGet: (_s: string, _key: string, dflt?: unknown) => dflt,
      storeSet: () => undefined
    }
    ;(window as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => local[k] ?? null,
      setItem: (k: string, v: string) => {
        local[k] = v
        writes.push([`local:${k}`, v])
      }
    }
    writes = []
    refreshCalls = []
    for (const k of Object.keys(local)) delete local[k]
    useLibraryState.setState({
      refreshLibrary: (options) => {
        refreshCalls.push(options)
        return Promise.resolve()
      }
    })
  })

  afterEach(() => {
    resetAllStores()
    useBottleLaunchWaiting.setState({ entries: {} })
  })

  it('appends a status for an unseen app', async () => {
    await push({
      appName: 'a',
      folder: '/f',
      progress: { percent: 1 } as never
    })
    expect(lib().libraryStatus).toEqual([
      {
        appName: 'a',
        status: 'installing',
        folder: '/f',
        context: undefined,
        progress: { percent: 1 },
        runner: 'legendary'
      }
    ])
  })

  it('carries managedBySteam only when truthy', async () => {
    await push({ appName: 'a', managedBySteam: true })
    expect(lib().libraryStatus[0]).toHaveProperty('managedBySteam', true)
    await push({ appName: 'b' })
    expect(lib().libraryStatus[1]).not.toHaveProperty('managedBySteam')
  })

  it('does nothing when status, context and managedBySteam are unchanged', async () => {
    await push({ appName: 'a' })
    const before = lib().libraryStatus
    await push({ appName: 'a', progress: { percent: 50 } as never })
    expect(lib().libraryStatus).toBe(before)
  })

  it('replaces an entry (moved to the end) when the status changes to an active one', async () => {
    await push({ appName: 'a' })
    await push({ appName: 'b' })
    await push({ appName: 'a', status: 'updating' })
    expect(lib().libraryStatus.map((g) => [g.appName, g.status])).toEqual([
      ['b', 'installing'],
      ['a', 'updating']
    ])
    expect(refreshCalls).toEqual([])
  })

  it('treats a context change as a change', async () => {
    await push({ appName: 'a', context: 'x' as never })
    await push({ appName: 'a', context: 'y' as never })
    expect(lib().libraryStatus).toHaveLength(1)
    expect(lib().libraryStatus[0]?.context).toBe('y')
  })

  it('removes the entry on done and refreshes in the background with origin game-status', async () => {
    await push({ appName: 'a' })
    await push({ appName: 'a', status: 'done' })
    expect(lib().libraryStatus).toEqual([])
    expect(refreshCalls).toEqual([
      { runInBackground: true, library: 'legendary', origin: 'game-status' }
    ])
  })

  it('removes the entry on error', async () => {
    await push({ appName: 'a' })
    await push({ appName: 'a', status: 'error' })
    expect(lib().libraryStatus).toEqual([])
    expect(refreshCalls).toHaveLength(1)
  })

  it('an update finishing drops the app from gameUpdates, writes updates and checks for updates', async () => {
    useLibraryState.setState({ gameUpdates: ['a', 'z'] })
    await push({ appName: 'a', status: 'updating' })
    await push({ appName: 'a', status: 'done' })
    expect(lib().gameUpdates).toEqual(['z'])
    expect(local.updates).toBe(JSON.stringify(['z']))
    expect(lib().libraryStatus).toEqual([])
    expect(refreshCalls).toEqual([
      {
        checkForUpdates: true,
        runInBackground: true,
        library: 'legendary',
        origin: 'game-status'
      }
    ])
  })

  it('a Steam hand-off holds Updating until the poll ends: no hasUpdate-without-updating state (74 UAT 17)', async () => {
    useLibraryState.setState({ gameUpdates: ['a', 'z'] })
    const seen: Array<[boolean, string | undefined]> = []
    const record = () =>
      seen.push([
        lib().gameUpdates.includes('a'),
        lib().libraryStatus.find((g) => g.appName === 'a')?.status
      ])
    const steps: Array<Partial<GameStatus>> = [
      { status: 'updating' },
      { status: 'updating', managedBySteam: true },
      { status: 'updating', managedBySteam: true },
      { status: 'updating', managedBySteam: true }
    ]
    for (const step of steps) {
      await push({ appName: 'a', runner: 'steam', ...step })
      record()
    }
    for (const [hasUpdate, status] of seen) {
      expect(hasUpdate).toBe(true)
      expect(status).toBe('updating')
    }
    expect(refreshCalls).toEqual([])
    await push({ appName: 'a', runner: 'steam', status: 'done' })
    expect(lib().gameUpdates).toEqual(['z'])
    expect(lib().libraryStatus).toEqual([])
  })

  it('clears BottleLaunchWaiting on playing and done, even for an unseen app, but not on other statuses', async () => {
    useBottleLaunchWaiting.setState({
      entries: { a: { detectedCause: null }, b: { detectedCause: null } }
    })
    await push({ appName: 'a', status: 'launching' })
    expect(useBottleLaunchWaiting.getState().entries.a).toBeDefined()
    await push({ appName: 'a', status: 'playing' })
    expect(useBottleLaunchWaiting.getState().entries.a).toBeUndefined()
    await push({ appName: 'b', status: 'done' })
    expect(useBottleLaunchWaiting.getState().entries.b).toBeUndefined()
  })

  it('selectInstallingEpicGame is true only for an installing legendary entry', async () => {
    expect(selectInstallingEpicGame(lib())).toBe(false)
    await push({ appName: 'g', runner: 'gog' })
    expect(selectInstallingEpicGame(lib())).toBe(false)
    await push({ appName: 'u', status: 'updating' })
    expect(selectInstallingEpicGame(lib())).toBe(false)
    await push({ appName: 'e' })
    expect(selectInstallingEpicGame(lib())).toBe(true)
  })
})
