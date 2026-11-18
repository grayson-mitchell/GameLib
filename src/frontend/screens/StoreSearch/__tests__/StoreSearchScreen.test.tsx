/**
 * Component tests for the StoreSearch screen container (STORESEARCH-01/05/
 * 06/08, D-05/D-14, T-20-03/T-20-04).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js docstring) — following the established
 * "mock react + invoke directly" pattern (StoreSearchRow.test.tsx,
 * HumbleKeysWaiting's __tests__), `StoreSearch` is invoked as a plain
 * function against a hand-rolled useState/useRef/useEffect/useMemo/
 * useContext harness and its returned React-element object graph is
 * inspected without a DOM. The useEffect mock is dependency-AND-cleanup-
 * aware (needed by the nested useDebouncedStoreSearch hook's debounce
 * timer cleanup — see useDebouncedStoreSearch.test.ts for why an unaware
 * mock would misreport call counts).
 */
import 'frontend/testUtils/tauriWindow'
import type { ReactElement, ReactNode } from 'react'

import type { HumbleKey } from 'common/types/humble'
import type { StoreSearchResult } from 'common/types/storeSearch'
import type { GameInfo } from 'common/types'

type MockContextValue = {
  epic: { library: GameInfo[] }
  gog: { library: GameInfo[] }
  amazon: { library: GameInfo[] }
  steam: { library: GameInfo[] }
  humble: { keys: HumbleKey[] }
}

let contextValue: MockContextValue = {
  epic: { library: [] },
  gog: { library: [] },
  amazon: { library: [] },
  steam: { library: [] },
  humble: { keys: [] }
}

// Colocated CSS side-effect import (shared with StoreSearchRow/Breakdown) —
// no CSS transform configured for this jest project.
jest.mock('../index.css', () => ({}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (
      _key: string,
      defaultValue: string,
      params?: Record<string, unknown>
    ): string =>
      Object.entries(params ?? {}).reduce(
        (str: string, [k, v]) => str.replace(`{{${k}}}`, String(v)),
        defaultValue
      )
  })
}))

// The real SearchBar imports './index.scss' (no CSS transform configured) —
// stub it down to a mock component so we can assert on its props (value/
// loading) without a DOM.
jest.mock('frontend/components/UI/SearchBar', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-search-bar',
    props
  })
}))

// StoreSearchRow is rendered via JSX only (never invoked directly by this
// test), but importing it transitively pulls in the same heavy barrel/asset
// imports StoreSearchRow.test.tsx already had to stub.
jest.mock('frontend/components/UI', () => ({
  CachedImage: (props: Record<string, unknown>) => ({
    type: 'mock-cached-image',
    props
  })
}))
jest.mock('frontend/components/UI/StoreLogos', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-store-logo',
    props
  })
}))
jest.mock('frontend/assets/gamelib_card.svg?url', () => 'mock-fallback.svg', {
  virtual: true
})

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let refSlots: { current: unknown }[] = []
  let refCursor = 0
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCleanups: (void | (() => void))[] = []
  let effectCursor = 0
  let memoSlots: unknown[] = []
  let memoDeps: (unknown[] | undefined)[] = []
  let memoCursor = 0

  const depsChanged = (
    prev: unknown[] | undefined,
    next: unknown[] | undefined
  ): boolean => {
    if (!prev || !next) return true
    if (prev.length !== next.length) return true
    return prev.some((d, i) => !Object.is(d, next[i]))
  }

  return {
    ...actualReact,
    useState: (initial: unknown) => {
      const idx = stateCursor++
      if (idx >= stateSlots.length) {
        stateSlots[idx] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const setState = (updater: unknown) => {
        stateSlots[idx] =
          typeof updater === 'function'
            ? (updater as (prev: unknown) => unknown)(stateSlots[idx])
            : updater
      }
      return [stateSlots[idx], setState]
    },
    useRef: (initial: unknown) => {
      const idx = refCursor++
      if (idx >= refSlots.length) {
        refSlots[idx] = { current: initial }
      }
      return refSlots[idx]
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      if (depsChanged(effectDeps[idx], deps)) {
        const priorCleanup = effectCleanups[idx]
        if (typeof priorCleanup === 'function') {
          priorCleanup()
        }
        effectDeps[idx] = deps
        effectCleanups[idx] = effect()
      }
    },
    useMemo: (factory: () => unknown, deps?: unknown[]) => {
      const idx = memoCursor++
      if (idx >= memoSlots.length || depsChanged(memoDeps[idx], deps)) {
        memoDeps[idx] = deps
        memoSlots[idx] = factory()
      }
      return memoSlots[idx]
    },
    useDebugValue: () => undefined,
    useLayoutEffect: () => undefined,
    useInsertionEffect: () => undefined,
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) =>
      getSnapshot(),
    __beginRender: () => {
      stateCursor = 0
      refCursor = 0
      effectCursor = 0
      memoCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      stateCursor = 0
      refSlots = []
      refCursor = 0
      effectDeps = []
      effectCleanups = []
      effectCursor = 0
      memoSlots = []
      memoDeps = []
      memoCursor = 0
    }
  }
})

const mockApi = {
  searchStores: jest.fn(),
  logError: jest.fn(),
  getStoreSearchDeals: jest.fn(),
  getItadSteamGids: jest.fn(),
  openExternalUrl: jest.fn()
}
// Imported after the mocks above (textual order — this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import StoreSearch from '../index'
import StoreSearchRow from '../components/StoreSearchRow'
import RegionPicker from 'frontend/components/UI/RegionPicker'
import { STORE_SEARCH_REGION_CODES } from 'frontend/helpers/storeRegion'
import useAuthState from 'frontend/state/authState'
import useLibraryState from 'frontend/state/libraryState'
import { resetAllStores } from 'frontend/state/storeKit'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { resetStoreSearchSessionForTests } from '../storeSearchSession'

// The screen reads the account libraries and humble keys from the stores;
// contextValue stays the fixture holder and is pushed into them here.
function seedStores() {
  useLibraryState.setState({
    epicLibrary: contextValue.epic.library,
    gogLibrary: contextValue.gog.library,
    amazonLibrary: contextValue.amazon.library,
    steamLibrary: contextValue.steam.library
  })
  useAuthState.setState({
    humble: {
      ...useAuthState.getState().humble,
      keys: contextValue.humble.keys
    }
  })
}

type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function mount(): ReactElement {
  harness().__resetMount()
  harness().__beginRender()
  return StoreSearch() as unknown as ReactElement
}

function rerender(): ReactElement {
  harness().__beginRender()
  return StoreSearch() as unknown as ReactElement
}

function flushPromises(): Promise<void> {
  return Promise.resolve()
    .then(() => Promise.resolve())
    .then(() => Promise.resolve())
}

/** See useDebouncedStoreSearch.test.ts's file-level doc comment for why a
 * fixed render-hop count is used instead of an equality-based early exit. */
async function settle(): Promise<ReactElement> {
  let value: ReactElement = rerender()
  for (let i = 0; i < 8; i++) {
    await flushPromises()
    value = rerender()
  }
  return value
}

type PropsWithChildren = {
  children?: ReactNode
  className?: string
  type?: string
}

function collectElements(
  node: ReactNode,
  out: ReactElement<PropsWithChildren>[] = []
): ReactElement<PropsWithChildren>[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const element = node as ReactElement<PropsWithChildren>
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

function findByClassNamePart(
  tree: ReactNode,
  part: string
): ReactElement<PropsWithChildren & Record<string, unknown>> | undefined {
  return collectElements(tree).find((el) => {
    const className = el.props?.className
    return typeof className === 'string' && className.split(' ').includes(part)
  }) as ReactElement<PropsWithChildren & Record<string, unknown>> | undefined
}

function findByType(
  tree: ReactNode,
  type: unknown
): ReactElement<Record<string, unknown>> | undefined {
  return collectElements(tree).find((el) => el.type === type) as
    | ReactElement<Record<string, unknown>>
    | undefined
}

function makeResult(
  overrides: Partial<StoreSearchResult> = {}
): StoreSearchResult {
  return {
    gameId: 'game-1',
    title: 'Portal',
    steamAppId: '400',
    thumb: 'https://example.com/thumb.jpg',
    cheapestPrice: '9.99',
    currencyCode: 'USD',
    buyUrl: 'https://www.cheapshark.com/redirect?dealID=abc',
    ...overrides
  }
}

/** Concatenated string children of an element subtree (no DOM available). */
function allText(node: ReactNode): string {
  return collectElements(node, [])
    .flatMap((el) => {
      const c = el.props?.children
      return (Array.isArray(c) ? c : [c]).filter(
        (x): x is string => typeof x === 'string'
      )
    })
    .join('|')
}

/** The mocked SearchBar is referenced (never invoked) via JSX, so it's
 * found the same way any other element is — by its props shape, since its
 * `type` is a function reference, not a string. */
function findSearchBar(
  tree: ReactNode
): ReactElement<Record<string, unknown>> | undefined {
  return collectElements(tree).find(
    (el) => typeof el.type === 'function' && 'placeholder' in (el.props ?? {})
  ) as ReactElement<Record<string, unknown>> | undefined
}

/** Types a query into the mocked SearchBar, lets the 400ms debounce fire,
 * and settles the resulting async chain (see settle()'s doc comment). */
async function search(query: string): Promise<ReactElement> {
  const tree = rerender()
  const searchBar = findSearchBar(tree)!
  ;(searchBar.props.onInputChanged as (v: string) => void)(query)
  rerender()
  jest.advanceTimersByTime(400)
  return settle()
}

describe('StoreSearch screen container', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    resetStoreSearchSessionForTests()
    contextValue = {
      epic: { library: [] },
      gog: { library: [] },
      amazon: { library: [] },
      steam: { library: [] },
      humble: { keys: [] }
    }
    ;(globalThis as unknown as { window: { api: unknown } }).window.api =
      mockApi
    seedStores()
    mockApi.searchStores.mockReset()
    mockApi.logError.mockReset()
    mockApi.getItadSteamGids.mockReset()
    mockApi.getItadSteamGids.mockResolvedValue({})
  })

  afterEach(() => {
    jest.useRealTimers()
    resetAllStores()
  })

  it('renders the explanatory prompt block (with icon) before any search', () => {
    mount()
    const tree = rerender()

    expect(
      findByClassNamePart(tree, 'storeSearchScreen__message--prompt')
    ).toBeDefined()
    expect(
      findByClassNamePart(tree, 'storeSearchScreen__promptIcon')
    ).toBeDefined()
    expect(
      findByClassNamePart(tree, 'storeSearchScreen__errorBanner')
    ).toBeUndefined()
    expect(findSearchBar(tree)).toBeDefined()
    expect(findSearchBar(tree)?.props.loading).toBe(false)
  })

  it('a successful empty result renders the no-results block (no icon), distinct from the prompt block', async () => {
    mockApi.searchStores.mockResolvedValue({ results: [], pricedCountry: 'US' })
    mount()

    const tree = await search('portal')

    expect(
      findByClassNamePart(tree, 'storeSearchScreen__message')
    ).toBeDefined()
    expect(
      findByClassNamePart(tree, 'storeSearchScreen__promptIcon')
    ).toBeUndefined()
    expect(
      findByClassNamePart(tree, 'storeSearchScreen__errorBanner')
    ).toBeUndefined()
    expect(
      findByClassNamePart(tree, 'storeSearchScreen__message--prompt')
    ).toBeUndefined()
  })

  it('a rejected search renders the error banner with a working Retry button, and the SearchBar stays present/enabled', async () => {
    mockApi.searchStores.mockRejectedValue(new Error('network down'))
    mount()

    const tree = await search('portal')

    const errorBanner = findByClassNamePart(
      tree,
      'storeSearchScreen__errorBanner'
    )
    expect(errorBanner).toBeDefined()
    expect(
      findByClassNamePart(tree, 'storeSearchScreen__message--prompt')
    ).toBeUndefined()

    const retryButton = findByClassNamePart(
      tree,
      'storeSearchScreen__retryButton'
    )
    expect(retryButton).toBeDefined()
    expect(typeof retryButton?.props.onClick).toBe('function')

    // The error banner and no-results block are structurally different
    // containers — never the same __message paragraph (D-14).
    expect(errorBanner?.type).not.toBe('p')

    // SearchBar remains present (mounted, same component instance) after
    // the failed search — fail-soft (D-14).
    expect(findSearchBar(tree)).toBeDefined()

    expect(mockApi.logError).toHaveBeenCalledWith(
      expect.stringContaining('network down')
    )
  })

  it('resolves ownership badges once via resolveStoreSearchBadges and never references sideloadedLibrary (D-05, T-20-03)', async () => {
    contextValue = {
      epic: { library: [] },
      gog: { library: [] },
      amazon: { library: [] },
      steam: {
        library: [{ app_name: '400', title: 'Portal' } as unknown as GameInfo]
      },
      humble: { keys: [] }
    }
    seedStores()
    // PRICE-02: ownership is joined through ITAD's gid -> appid mapping.
    mockApi.getItadSteamGids.mockResolvedValue({ '400': 'game-1' })
    mockApi.searchStores.mockResolvedValue({
      results: [
        makeResult({ gameId: 'game-1', title: 'Portal', steamAppId: '400' })
      ],
      pricedCountry: 'US'
    })
    mount()

    const tree = await search('portal')

    const row = findByType(tree, StoreSearchRow)
    expect(row).toBeDefined()
    expect(row?.props.badges).toEqual({
      owned: [{ store: 'steam', confidence: 'exact' }],
      keyAvailable: false
    })

    // D-05: the screen source (comments stripped, so the prose that
    // documents the exclusion does not count) never references
    // sideloadedLibrary. Anti-vacuity: it does read the steam account.
    const fs: typeof import('fs') = jest.requireActual('fs')
    const path: typeof import('path') = jest.requireActual('path')
    const source = stripSourceComments(
      fs.readFileSync(path.join(__dirname, '..', 'index.tsx'), 'utf8')
    )
    expect(source).toContain('useSteamAccount()')
    expect(source).not.toMatch(/sideloadedLibrary/)
  })

  it('always shows the region caption naming the country', () => {
    mount()
    const tree = rerender()

    const caption = findByClassNamePart(tree, 'storeSearchScreen__region')
    expect(caption).toBeDefined()
    expect(caption?.props.children).toBe('Showing prices for United States.')
  })

  it('sends the derived country with the search', async () => {
    mockApi.searchStores.mockResolvedValue({ results: [], pricedCountry: 'US' })
    mount()

    await search('portal')

    expect(mockApi.searchStores).toHaveBeenCalledWith('portal', 'US')
  })

  it('G-47-12a: leaving and returning shows the same query and rows on the first frame with no new request', async () => {
    mockApi.searchStores.mockResolvedValue({
      results: [makeResult()],
      pricedCountry: 'US'
    })
    mount()
    await search('portal')
    expect(mockApi.searchStores).toHaveBeenCalledTimes(1)

    // Leave and come back: a fresh mount; only the module store survives.
    const tree = mount()
    expect(findSearchBar(tree)?.props.value).toBe('portal')
    expect(findByType(tree, StoreSearchRow)).toBeDefined()
    expect(
      findByClassNamePart(tree, 'storeSearchScreen__message--prompt')
    ).toBeUndefined()

    jest.advanceTimersByTime(400)
    await settle()
    expect(mockApi.searchStores).toHaveBeenCalledTimes(1)
  })

  it('renders the region-fallback note only when pricedCountry differs from the requested country', async () => {
    mockApi.searchStores.mockResolvedValue({
      results: [makeResult()],
      pricedCountry: 'US'
    })
    mount()
    let tree = await search('portal')
    expect(
      findByClassNamePart(tree, 'storeSearchScreen__regionNote')
    ).toBeUndefined()

    mockApi.searchStores.mockResolvedValue({
      results: [makeResult()],
      pricedCountry: 'CA'
    })
    // A second, independent session, not a return visit to the first.
    resetStoreSearchSessionForTests()
    mount()
    tree = await search('portal')
    const note = findByClassNamePart(tree, 'storeSearchScreen__regionNote')
    expect(note).toBeDefined()
    expect(note?.props.role).toBe('note')
    expect(allText(note)).toContain(
      "Prices aren't available for United States yet, so these are shown for Canada."
    )
  })

  it('a rateLimited failure shows the busy copy with Retry; the SearchBar stays enabled', async () => {
    mockApi.searchStores.mockRejectedValue(
      new Error('x [storeSearch:rateLimited]')
    )
    mount()

    const tree = await search('portal')

    const banner = findByClassNamePart(tree, 'storeSearchScreen__errorBanner')
    expect(banner?.props.role).toBe('alert')
    expect(allText(banner)).toContain(
      'Price lookups are busy right now. Try again in a minute.'
    )
    expect(
      findByClassNamePart(tree, 'storeSearchScreen__retryButton')
    ).toBeDefined()
    expect(findSearchBar(tree)?.props.disabled).toBeUndefined()
  })

  it('a notConfigured failure shows the Settings > Advanced copy and NO Retry button', async () => {
    mockApi.searchStores.mockRejectedValue(
      new Error('x [storeSearch:notConfigured]')
    )
    mount()

    const tree = await search('portal')

    const banner = findByClassNamePart(tree, 'storeSearchScreen__errorBanner')
    expect(allText(banner)).toContain(
      "Price lookups aren't set up in this build. Add an IsThereAnyDeal API key in Settings > Advanced."
    )
    expect(
      findByClassNamePart(tree, 'storeSearchScreen__retryButton')
    ).toBeUndefined()
    expect(findSearchBar(tree)).toBeDefined()
  })

  it('a generic failure keeps the provider copy', async () => {
    mockApi.searchStores.mockRejectedValue(new Error('network down'))
    mount()

    const tree = await search('portal')

    const banner = findByClassNamePart(tree, 'storeSearchScreen__errorBanner')
    expect(allText(banner)).toContain("Couldn't reach the price provider.")
    expect(
      findByClassNamePart(tree, 'storeSearchScreen__retryButton')
    ).toBeDefined()
  })

  it('PRICE-02: a result whose gid maps to a library appid is Owned on Steam', async () => {
    contextValue.steam.library = [
      { app_name: '400', title: 'Some Other Name' } as unknown as GameInfo
    ]
    seedStores()
    mockApi.getItadSteamGids.mockResolvedValue({ '400': 'gid-portal' })
    mockApi.searchStores.mockResolvedValue({
      results: [
        makeResult({
          gameId: 'gid-portal',
          title: 'Portal',
          steamAppId: undefined
        })
      ],
      pricedCountry: 'US'
    })
    mount()

    const tree = await search('portal')

    expect(mockApi.getItadSteamGids).toHaveBeenCalledWith(['400'])
    expect(findByType(tree, StoreSearchRow)?.props.badges).toEqual({
      owned: [{ store: 'steam', confidence: 'exact' }],
      keyAvailable: false
    })
  })

  it('PRICE-02: a failed gid lookup shows no Steam badge and search still works', async () => {
    contextValue.steam.library = [
      { app_name: '400', title: 'Some Other Name' } as unknown as GameInfo
    ]
    seedStores()
    mockApi.getItadSteamGids.mockRejectedValue(new Error('offline'))
    mockApi.searchStores.mockResolvedValue({
      results: [
        makeResult({
          gameId: 'gid-portal',
          title: 'Portal',
          steamAppId: undefined
        })
      ],
      pricedCountry: 'US'
    })
    mount()

    const tree = await search('portal')

    expect(findByType(tree, StoreSearchRow)?.props.badges).toEqual({
      owned: [],
      keyAvailable: false
    })
    expect(mockApi.logError).toHaveBeenCalledWith(
      expect.stringContaining('gid lookup failed')
    )
  })

  it('PRICE-02: a waiting Humble key whose appid maps to the result gid yields Key available', async () => {
    contextValue.humble.keys = [
      {
        title: 'Unrelated Key Title',
        steamAppId: '400',
        state: 'UNREVEALED',
        platform: 'steam',
        ownedElsewhere: false
      } as unknown as HumbleKey
    ]
    seedStores()
    mockApi.getItadSteamGids.mockResolvedValue({ '400': 'gid-portal' })
    mockApi.searchStores.mockResolvedValue({
      results: [
        makeResult({
          gameId: 'gid-portal',
          title: 'Portal',
          steamAppId: undefined
        })
      ],
      pricedCountry: 'US'
    })
    mount()

    const tree = await search('portal')

    expect(mockApi.getItadSteamGids).toHaveBeenCalledWith(['400'])
    expect(findByType(tree, StoreSearchRow)?.props.badges).toEqual({
      owned: [],
      keyAvailable: true
    })
  })
})

describe('StoreSearch region picker (G-47-8)', () => {
  const REGION_KEY = 'discounts.regionOverride'
  let stored: Record<string, string>
  let setItem: jest.Mock
  let removeItem: jest.Mock

  beforeEach(() => {
    jest.useFakeTimers()
    resetStoreSearchSessionForTests()
    contextValue = {
      epic: { library: [] },
      gog: { library: [] },
      amazon: { library: [] },
      steam: { library: [] },
      humble: { keys: [] }
    }
    ;(globalThis as unknown as { window: { api: unknown } }).window.api =
      mockApi
    seedStores()
    mockApi.searchStores.mockReset()
    mockApi.searchStores.mockResolvedValue({ results: [], pricedCountry: 'US' })
    mockApi.getItadSteamGids.mockReset()
    mockApi.getItadSteamGids.mockResolvedValue({})
    stored = {}
    setItem = jest.fn((key: string, value: string) => {
      stored[key] = value
    })
    removeItem = jest.fn((key: string) => {
      delete stored[key]
    })
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (key: string) => stored[key] ?? null,
      setItem,
      removeItem
    }
  })

  afterEach(() => {
    jest.useRealTimers()
    resetAllStores()
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage
  })

  function picker(tree: ReactNode) {
    return findByType(tree, RegionPicker) as ReactElement<{
      value: string | null
      autoLabel: string
      options: { countryCode: string; label: string; currencyCode?: string }[]
      onChange: (code: string | null) => void
    }>
  }

  it('mounts with Auto, the ITAD-priced country list and no currency pills', async () => {
    const tree = mount()
    const el = picker(tree)

    expect(el.props.value).toBeNull()
    expect(el.props.autoLabel).toBe('Auto (United States)')
    expect(el.props.options.map((o) => o.countryCode)).toEqual([
      ...STORE_SEARCH_REGION_CODES
    ])
    expect(el.props.options).toHaveLength(32)
    expect(el.props.options.some((o) => o.currencyCode !== undefined)).toBe(
      false
    )
    expect(
      findByClassNamePart(tree, 'storeSearchScreen__region')?.props.children
    ).toBe('Showing prices for United States.')

    await search('portal')
    expect(mockApi.searchStores).toHaveBeenCalledWith('portal', 'US')
  })

  it('choosing a country persists it, updates the caption and re-runs the committed search there', async () => {
    mount()
    await search('portal')
    mockApi.searchStores.mockClear()

    picker(rerender()).props.onChange('DE')
    const tree = await settle()

    expect(setItem).toHaveBeenCalledWith(REGION_KEY, 'DE')
    expect(
      findByClassNamePart(tree, 'storeSearchScreen__region')?.props.children
    ).toBe('Showing prices for Germany.')
    expect(picker(tree).props.value).toBe('DE')
    expect(mockApi.searchStores).toHaveBeenCalledWith('portal', 'DE')
  })

  it('choosing Auto removes the override and returns to the language country', async () => {
    stored[REGION_KEY] = 'DE'
    mount()
    await search('portal')
    mockApi.searchStores.mockClear()

    picker(rerender()).props.onChange(null)
    const tree = await settle()

    expect(removeItem).toHaveBeenCalledWith(REGION_KEY)
    expect(picker(tree).props.value).toBeNull()
    expect(mockApi.searchStores).toHaveBeenCalledWith('portal', 'US')
  })

  it('uses a stored code from the Store Search list at mount', async () => {
    stored[REGION_KEY] = 'NZ'
    const tree = mount()

    expect(picker(tree).props.value).toBe('NZ')
    await search('portal')
    expect(mockApi.searchStores).toHaveBeenCalledWith('portal', 'NZ')
  })

  it('treats a stored code outside the Store Search list as Auto', async () => {
    stored[REGION_KEY] = 'IL'
    const tree = mount()

    expect(picker(tree).props.value).toBeNull()
    await search('portal')
    expect(mockApi.searchStores).toHaveBeenCalledWith('portal', 'US')
  })
})
