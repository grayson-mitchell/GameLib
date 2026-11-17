/**
 * Component tests for StoreSearchRow + StoreSearchBreakdown (STORESEARCH-03,
 * D-04/D-06/D-07/D-08/D-09/D-13).
 *
 * No jsdom / react-test-renderer / jest-environment-jsdom is installed in
 * this project (see src/frontend/jest.config.js docstring) —
 * @testing-library/react's `render()` requires a real DOM and cannot run
 * under the `node` test environment this project uses. Following this
 * project's established pattern (HumbleClaimWizard/index.test.tsx,
 * HumbleOriginInfo.test.tsx), 'react' is mocked at the module level so both
 * components can be invoked directly as plain functions and their returned
 * React-element object graphs inspected without a DOM.
 *
 * Unlike the HumbleClaimWizard harness, this file's `useEffect` mock DOES
 * respect the dependency array (only re-runs an effect when a dep actually
 * changed) — needed to assert `getStoreSearchDeals` fires exactly once per
 * expand rather than on every `rerender()` call.
 *
 * StoreSearchRow and StoreSearchBreakdown are separate component instances
 * with independent hook state; `mount*()` calls `__resetMount()` before
 * invoking a *different* component so their useState slots never collide.
 */
import type { ReactElement, ReactNode } from 'react'

import type {
  StoreSearchDeal,
  StoreSearchResult
} from 'common/types/storeSearch'
import type { StoreOwnershipMatch } from 'common/discounts/badges'
import { formatCachedAt, formatPrice } from '../helpers'

// Colocated CSS side-effect import used by both components under test.
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

// The real barrel (frontend/components/UI) transitively imports many heavy
// components (Header, SteamGridDBPicker, ...); stub it down to just the one
// export this screen uses.
jest.mock('frontend/components/UI', () => ({
  CachedImage: (props: Record<string, unknown>) => ({
    type: 'mock-cached-image',
    props
  })
}))

// StoreLogos imports 6 raw asset files (svg?react/.png) with no jest
// transform configured for them — stub the whole module instead of the
// assets, matching the CachedImage-barrel workaround above.
jest.mock('frontend/components/UI/StoreLogos', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-store-logo',
    props
  })
}))

// vite `?url` asset import — not a real resolvable path under Jest's
// resolver, so this needs `virtual: true`.
jest.mock('frontend/assets/gamelib_card.svg?url', () => 'mock-fallback.svg', {
  virtual: true
})

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let slots: unknown[] = []
  let effectDeps: (unknown[] | undefined)[] = []
  let cursor = 0
  let effectCursor = 0

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
      const idx = cursor++
      if (idx >= slots.length) {
        slots[idx] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const setState = (updater: unknown) => {
        slots[idx] =
          typeof updater === 'function'
            ? (updater as (prev: unknown) => unknown)(slots[idx])
            : updater
      }
      return [slots[idx], setState]
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      if (depsChanged(effectDeps[idx], deps)) {
        effectDeps[idx] = deps
        effect()
      }
    },
    __beginRender: () => {
      cursor = 0
      effectCursor = 0
    },
    __resetMount: () => {
      slots = []
      effectDeps = []
      cursor = 0
      effectCursor = 0
    }
  }
})

const mockApi = {
  getStoreSearchDeals: jest.fn(),
  openExternalUrl: jest.fn(),
  logError: jest.fn()
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

// Imported after the mocks above (textual order — this project's ts-jest
// setup does not hoist jest.mock like babel-jest; see HumbleOriginInfo.test.tsx)
// so both components transitively require the mocked modules.
import StoreSearchRow from '../components/StoreSearchRow'
import StoreSearchBreakdown from '../components/StoreSearchBreakdown'
import StoreLogos from 'frontend/components/UI/StoreLogos'

type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

type RowProps = {
  result: StoreSearchResult
  badges: { owned: StoreOwnershipMatch[]; keyAvailable: boolean }
  countryCode?: string
}
type BreakdownProps = {
  gameId: string
  title: string
  countryCode?: string
  onFetchFailed: () => void
}

function mountRow(props: RowProps): ReactElement {
  harness().__resetMount()
  harness().__beginRender()
  return StoreSearchRow({ countryCode: 'US', ...props })
}

function rerenderRow(props: RowProps): ReactElement {
  harness().__beginRender()
  return StoreSearchRow({ countryCode: 'US', ...props })
}

function mountBreakdown(props: BreakdownProps): ReactElement {
  harness().__resetMount()
  harness().__beginRender()
  return StoreSearchBreakdown({ countryCode: 'US', ...props })
}

function rerenderBreakdown(props: BreakdownProps): ReactElement {
  harness().__beginRender()
  return StoreSearchBreakdown({ countryCode: 'US', ...props })
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
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

function findAllByClassNamePart(
  tree: ReactNode,
  part: string
): ReactElement<PropsWithChildren & Record<string, unknown>>[] {
  return collectElements(tree).filter((el) => {
    const className = el.props?.className
    return typeof className === 'string' && className.split(' ').includes(part)
  }) as ReactElement<PropsWithChildren & Record<string, unknown>>[]
}

function findByType(
  tree: ReactNode,
  type: unknown
): ReactElement<Record<string, unknown>> | undefined {
  return collectElements(tree).find((el) => el.type === type) as
    | ReactElement<Record<string, unknown>>
    | undefined
}

function textContent(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map((child) => textContent(child as ReactNode)).join('')
  }
  if (typeof node === 'object' && 'props' in node) {
    return textContent(
      (node as ReactElement<PropsWithChildren>).props?.children
    )
  }
  return ''
}

function makeResult(
  overrides: Partial<StoreSearchResult> = {}
): StoreSearchResult {
  return {
    gameId: 'game-1',
    title: 'Some Game',
    steamAppId: '12345',
    thumb: 'https://example.com/thumb.jpg',
    cheapestPrice: '14.99',
    currencyCode: 'USD',
    buyUrl: 'https://www.cheapshark.com/redirect?dealID=abc',
    ...overrides
  }
}

function makeDeal(overrides: Partial<StoreSearchDeal> = {}): StoreSearchDeal {
  return {
    storeId: '1',
    storeName: 'Steam',
    runner: 'steam',
    price: '14.99',
    retailPrice: '19.99',
    currencyCode: 'USD',
    buyUrl: 'https://www.cheapshark.com/redirect?dealID=abc',
    ...overrides
  }
}

describe('StoreSearchRow', () => {
  it('renders the cheapest price as a single formatted price-with-ISO-code text node', () => {
    const tree = mountRow({
      result: makeResult({ cheapestPrice: '14.99', currencyCode: 'USD' }),
      badges: { owned: [], keyAvailable: false }
    })

    const price = findByClassNamePart(tree, 'storeSearchRow__price')
    expect(price).toBeDefined()
    expect(textContent(price)).toContain('USD')
    expect(textContent(price)).toBe('$14.99 USD')
  })

  it('renders no owned pill and no key-available pill when badges are empty (missing beats wrong)', () => {
    const tree = mountRow({
      result: makeResult(),
      badges: { owned: [], keyAvailable: false }
    })

    expect(
      findByClassNamePart(tree, 'discountCard__badge--owned')
    ).toBeUndefined()
    expect(
      findByClassNamePart(tree, 'discountCard__badge--keyAvailable')
    ).toBeUndefined()
  })

  it('renders one combined owned pill for 2 stores AND an independent key-available pill (coexistence, D-07)', () => {
    const tree = mountRow({
      result: makeResult(),
      badges: {
        owned: [
          { store: 'steam', confidence: 'exact' },
          { store: 'gog', confidence: 'fuzzy' }
        ],
        keyAvailable: true
      }
    })

    const ownedPills = findAllByClassNamePart(
      tree,
      'discountCard__badge--owned'
    )
    expect(ownedPills).toHaveLength(1)
    expect(textContent(ownedPills[0])).toBe('Owned on Steam, GOG')

    const keyPill = findByClassNamePart(
      tree,
      'discountCard__badge--keyAvailable'
    )
    expect(keyPill).toBeDefined()
    expect(textContent(keyPill)).toBe('Key available')
  })

  it('does not render StoreSearchBreakdown before the chevron is clicked', () => {
    const tree = mountRow({
      result: makeResult(),
      badges: { owned: [], keyAvailable: false }
    })

    expect(findByType(tree, StoreSearchBreakdown)).toBeUndefined()
    const chevronButton = findByClassNamePart(
      tree,
      'storeSearchRow__expandButton'
    )
    expect(chevronButton?.props['aria-expanded']).toBe(false)
  })

  it('mounts StoreSearchBreakdown with the result gameId/title after the chevron is clicked', () => {
    const result = makeResult({ gameId: 'game-42', title: 'Clicky Game' })
    const initial = mountRow({
      result,
      badges: { owned: [], keyAvailable: false }
    })

    const chevronButton = findByClassNamePart(
      initial,
      'storeSearchRow__expandButton'
    )!
    ;(chevronButton.props.onClick as () => void)()

    const expanded = rerenderRow({
      result,
      badges: { owned: [], keyAvailable: false }
    })

    expect(
      findByClassNamePart(expanded, 'storeSearchRow__expandButton')?.props[
        'aria-expanded'
      ]
    ).toBe(true)

    const breakdown = findByType(expanded, StoreSearchBreakdown)
    expect(breakdown).toBeDefined()
    expect(breakdown?.props.gameId).toBe('game-42')
    expect(breakdown?.props.title).toBe('Clicky Game')
    expect(typeof breakdown?.props.onFetchFailed).toBe('function')
  })

  describe('cached-at line (PRICE-03)', () => {
    const CACHED_AT = Date.UTC(2026, 10, 17, 9, 30)
    const EXPLANATION =
      'Live prices are temporarily unavailable, so this is the last price we saved.'

    it('renders a separate cached line with the absolute time, title and aria-label, outside the price node', () => {
      const tree = mountRow({
        result: makeResult({ cachedAt: CACHED_AT }),
        badges: { owned: [], keyAvailable: false }
      })

      const cached = findByClassNamePart(tree, 'storeSearchRow__cached')
      expect(cached).toBeDefined()
      expect(textContent(cached)).toBe(
        `Price from ${formatCachedAt(CACHED_AT, 'en')}`
      )
      expect(cached?.props.title).toBe(EXPLANATION)
      expect(cached?.props['aria-label']).toBe(EXPLANATION)

      const price = findByClassNamePart(tree, 'storeSearchRow__price')
      expect(findByClassNamePart(price, 'storeSearchRow__cached')).toBe(
        undefined
      )
      expect(textContent(price)).toBe(formatPrice('14.99', 'USD', 'en'))
    })

    it('renders no cached line when the row carries no cachedAt', () => {
      const tree = mountRow({
        result: makeResult(),
        badges: { owned: [], keyAvailable: false }
      })

      expect(findByClassNamePart(tree, 'storeSearchRow__cached')).toBe(
        undefined
      )
    })

    it('never words the visible cached line as an error', () => {
      const tree = mountRow({
        result: makeResult({ cachedAt: CACHED_AT }),
        badges: { owned: [], keyAvailable: false }
      })

      const text = textContent(
        findByClassNamePart(tree, 'storeSearchRow__cached')
      ).toLowerCase()
      expect(text).not.toMatch(/error|failed|rate/)
    })

    it('forwards the search country to the mounted breakdown', () => {
      const result = makeResult()
      const initial = mountRow({
        result,
        countryCode: 'DE',
        badges: { owned: [], keyAvailable: false }
      })
      ;(
        findByClassNamePart(initial, 'storeSearchRow__expandButton')!.props
          .onClick as () => void
      )()
      const expanded = rerenderRow({
        result,
        countryCode: 'DE',
        badges: { owned: [], keyAvailable: false }
      })

      expect(
        findByType(expanded, StoreSearchBreakdown)?.props.countryCode
      ).toBe('DE')
    })
  })
})

describe('StoreSearchBreakdown', () => {
  afterEach(() => {
    mockApi.getStoreSearchDeals.mockReset()
    mockApi.openExternalUrl.mockReset()
    mockApi.logError.mockReset()
  })

  it('shows the row-scoped loading state before the fetch resolves', () => {
    mockApi.getStoreSearchDeals.mockReturnValue(new Promise(() => {}))

    const tree = mountBreakdown({
      gameId: 'game-1',
      title: 'Some Game',
      onFetchFailed: jest.fn()
    })

    expect(textContent(tree)).toContain('Loading store prices')
    expect(mockApi.getStoreSearchDeals).toHaveBeenCalledWith('game-1', 'US')
  })

  it('calls getStoreSearchDeals exactly once per expand (mount) even across rerenders', async () => {
    mockApi.getStoreSearchDeals.mockResolvedValue([makeDeal()])

    const props = {
      gameId: 'game-1',
      title: 'Some Game',
      onFetchFailed: jest.fn()
    }
    mountBreakdown(props)
    await flushPromises()
    rerenderBreakdown(props)
    rerenderBreakdown(props)

    expect(mockApi.getStoreSearchDeals).toHaveBeenCalledTimes(1)
  })

  it('renders each deal as a sub-row with the formatted price-with-ISO-code structure and StoreLogos only when runner is defined', async () => {
    mockApi.getStoreSearchDeals.mockResolvedValue([
      makeDeal({
        storeId: '1',
        storeName: 'Steam',
        runner: 'steam',
        price: '14.99'
      }),
      makeDeal({
        storeId: '99',
        storeName: 'Fanatical',
        runner: undefined,
        price: '12.5'
      })
    ])

    const props = {
      gameId: 'game-1',
      title: 'Some Game',
      onFetchFailed: jest.fn()
    }
    mountBreakdown(props)
    await flushPromises()
    const tree = rerenderBreakdown(props)

    const items = findAllByClassNamePart(tree, 'storeSearchRow__breakdownItem')
    expect(items).toHaveLength(2)
    expect(textContent(items[0])).toContain('$14.99 USD')
    expect(textContent(items[1])).toContain('$12.50 USD')

    // StoreLogos rendered only for the deal with a mapped runner.
    expect(findByType(items[0], StoreLogos)).toBeDefined()
    expect(findByType(items[1], StoreLogos)).toBeUndefined()
  })

  it("clicking a sub-row calls window.api.openExternalUrl with that deal's buyUrl (D-08/D-09)", async () => {
    mockApi.getStoreSearchDeals.mockResolvedValue([
      makeDeal({
        storeId: '1',
        buyUrl: 'https://www.cheapshark.com/redirect?dealID=deal-1'
      })
    ])

    const props = {
      gameId: 'game-1',
      title: 'Some Game',
      onFetchFailed: jest.fn()
    }
    mountBreakdown(props)
    await flushPromises()
    const tree = rerenderBreakdown(props)

    const item = findByClassNamePart(tree, 'storeSearchRow__breakdownItem')!
    ;(item.props.onClick as () => void)()

    expect(mockApi.openExternalUrl).toHaveBeenCalledWith(
      'https://www.cheapshark.com/redirect?dealID=deal-1'
    )
  })

  it('fetches the deals for the given country exactly once', async () => {
    mockApi.getStoreSearchDeals.mockResolvedValue([makeDeal()])

    const props = {
      gameId: 'game-1',
      title: 'Some Game',
      countryCode: 'DE',
      onFetchFailed: jest.fn()
    }
    mountBreakdown(props)
    await flushPromises()
    rerenderBreakdown(props)

    expect(mockApi.getStoreSearchDeals).toHaveBeenCalledTimes(1)
    expect(mockApi.getStoreSearchDeals).toHaveBeenCalledWith('game-1', 'DE')
  })

  it('renders a cached line only on deals that carry cachedAt, keeping the API order', async () => {
    const CACHED_AT = Date.UTC(2026, 10, 17, 9, 30)
    mockApi.getStoreSearchDeals.mockResolvedValue([
      makeDeal({ storeId: '1', storeName: 'Zeta', cachedAt: CACHED_AT }),
      makeDeal({ storeId: '2', storeName: 'Alpha' })
    ])

    const props = {
      gameId: 'game-1',
      title: 'Some Game',
      onFetchFailed: jest.fn()
    }
    mountBreakdown(props)
    await flushPromises()
    const tree = rerenderBreakdown(props)

    const items = findAllByClassNamePart(tree, 'storeSearchRow__breakdownItem')
    expect(items).toHaveLength(2)
    expect(textContent(items[0])).toContain('Zeta')
    expect(textContent(items[1])).toContain('Alpha')

    const first = findByClassNamePart(items[0], 'storeSearchRow__cached')
    expect(textContent(first)).toBe(
      `Price from ${formatCachedAt(CACHED_AT, 'en')}`
    )
    expect(
      findByClassNamePart(items[1], 'storeSearchRow__cached')
    ).toBeUndefined()
    expect(textContent(first).toLowerCase()).not.toMatch(/error|failed|rate/)
  })

  it('a fetch failure logs the error and calls onFetchFailed (retry-on-next-click, no persisted error UI)', async () => {
    mockApi.getStoreSearchDeals.mockRejectedValue(new Error('network down'))
    const onFetchFailed = jest.fn()

    mountBreakdown({ gameId: 'game-1', title: 'Some Game', onFetchFailed })
    await flushPromises()

    expect(mockApi.logError).toHaveBeenCalled()
    expect(onFetchFailed).toHaveBeenCalled()
  })
})
