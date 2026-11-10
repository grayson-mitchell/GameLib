import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import useLibraryState, {
  installLibraryBridgeSlots,
  readInitialLibrary
} from '../libraryState'

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
    s.resetRunnerLibrary('gog')
    s.setRefreshing(true)
    expect(logged).toEqual([
      'library slot refreshLibrary called before GlobalState installed it',
      'library slot resetRunnerLibrary called before GlobalState installed it',
      'library slot setRefreshing called before GlobalState installed it'
    ])
  })

  it('routes to the installed implementation', async () => {
    const calls: unknown[][] = []
    installLibraryBridgeSlots({
      refreshLibrary: async (o) => {
        calls.push(['refresh', o])
      },
      resetRunnerLibrary: (r) => {
        calls.push(['reset', r])
      },
      setRefreshing: (v) => {
        calls.push(['refreshing', v])
      }
    })
    const s = useLibraryState.getState()
    await s.refreshLibrary({ library: 'gog' })
    s.resetRunnerLibrary('nile')
    s.setRefreshing(false)
    expect(calls).toEqual([
      ['refresh', { library: 'gog' }],
      ['reset', 'nile'],
      ['refreshing', false]
    ])
    expect(logged).toEqual([])
  })
})

describe('libraryState collections', () => {
  const lib = () => useLibraryState.getState()
  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = {
      logError: () => undefined,
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
    expect(readInitialLibrary()).toEqual({
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
