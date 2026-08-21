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
    useContext: () => contextValue,
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
  openExternalUrl: jest.fn()
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

// Imported after the mocks above (textual order — this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import StoreSearch from '../index'
import StoreSearchRow from '../components/StoreSearchRow'

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
    contextValue = {
      epic: { library: [] },
      gog: { library: [] },
      amazon: { library: [] },
      steam: { library: [] },
      humble: { keys: [] }
    }
    mockApi.searchStores.mockReset()
    mockApi.logError.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
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
    mockApi.searchStores.mockResolvedValue([])
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

  it('resolves ownership badges once via resolveStoreSearchBadges and never references sideloadedLibrary/zoom (D-05, T-20-03)', async () => {
    contextValue = {
      epic: { library: [] },
      gog: { library: [] },
      amazon: { library: [] },
      steam: {
        library: [{ app_name: '400', title: 'Portal' } as unknown as GameInfo]
      },
      humble: { keys: [] }
    }
    mockApi.searchStores.mockResolvedValue([
      makeResult({ gameId: 'game-1', title: 'Portal', steamAppId: '400' })
    ])
    mount()

    const tree = await search('portal')

    const row = findByType(tree, StoreSearchRow)
    expect(row).toBeDefined()
    expect(row?.props.badges).toEqual({
      owned: [{ store: 'steam', confidence: 'exact' }],
      keyAvailable: false
    })

    // D-05: assert the actual useContext destructure statement — not the
    // whole file (which legitimately documents the exclusion in prose) —
    // never binds sideloadedLibrary or zoom.
    const fs: typeof import('fs') = jest.requireActual('fs')
    const path: typeof import('path') = jest.requireActual('path')
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'index.tsx'),
      'utf8'
    )
    const destructureLine = source
      .split('\n')
      .find((line) => line.includes('useContext(ContextProvider)'))
    expect(destructureLine).toBeDefined()
    expect(destructureLine).not.toMatch(/sideloadedLibrary/)
    expect(destructureLine).not.toMatch(/\bzoom\b/)
  })
})
