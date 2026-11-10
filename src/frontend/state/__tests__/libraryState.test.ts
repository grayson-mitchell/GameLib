import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import type { GameInfo } from 'common/types'
import useLibraryState, {
  installLibraryBridgeSlots,
  readInitialLibrary,
  registerLibrarySideEffects
} from '../libraryState'
import useAuthState from '../authState'

let logged: string[] = []
let writes: [string, unknown][] = []
const config: Record<string, unknown> = {}
const local: Record<string, string> = {}

describe('libraryState bridge slots', () => {
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

  it('logs and does nothing before install, refreshLibrary resolving', async () => {
    const s = useLibraryState.getState()
    await expect(s.refreshLibrary({})).resolves.toBeUndefined()
    expect(logged).toEqual([
      'library slot refreshLibrary called before GlobalState installed it'
    ])
  })

  it('routes refreshLibrary to the installed implementation', async () => {
    const calls: unknown[][] = []
    installLibraryBridgeSlots({
      refreshLibrary: async (o) => {
        calls.push(['refresh', o])
      }
    })
    await useLibraryState.getState().refreshLibrary({ library: 'gog' })
    expect(calls).toEqual([['refresh', { library: 'gog' }]])
    expect(logged).toEqual([])
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
    // The category actions mutate the held object in place (preserved class
    // behaviour), so each test seeds its own.
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
    useLibraryState.setState({
      gameOverrides: { s: { wineVersion: 'x' } as never }
    })
    const init = readInitialLibrary()
    expect(init.epicLibrary.map((g) => g.app_name)).toEqual(['e'])
    expect(init.gogLibrary[0].is_installed).toBe(true)
    expect(init.gogLibrary[0].install).toEqual({ appName: 'g1' })
    expect(init.gogLibrary[1].is_installed).toBeUndefined()
    expect(init.amazonLibrary).toHaveLength(1)
    expect(init.steamLibrary[0].overrides).toEqual({ wineVersion: 'x' })
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
    expect(lib().epicLibrary[0].overrides).toEqual({ wineVersion: 'y' })
    expect(lib().sideloadedLibrary).toHaveLength(1)
    expect(lib().steamLibrary[0].overrides).toBeUndefined()
  })

  it('applyGamePush ignores no app_name, upserts per store, ignores other runners', () => {
    lib().applyGamePush({ runner: 'gog' } as GameInfo)
    lib().applyGamePush(game('g'))
    lib().applyGamePush(game('g', 'gog', { title: 'new' }))
    lib().applyGamePush(game('e', 'legendary'))
    lib().applyGamePush(game('s', 'steam'))
    lib().applyGamePush(game('a', 'nile'))
    expect(lib().gogLibrary).toHaveLength(1)
    expect(lib().gogLibrary[0].title).toBe('new')
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
