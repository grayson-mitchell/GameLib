/**
 * Unit tests for useDebouncedStoreSearch (STORESEARCH-02, D-11, T-20-04).
 *
 * No jsdom / react-test-renderer / `@testing-library/react-hooks` is
 * installed in this project (see src/frontend/jest.config.js docstring), so
 * `renderHook()` is unavailable. Following this project's established
 * "mock react + invoke directly" pattern (StoreSearchRow.test.tsx,
 * HumbleKeysWaiting's __tests__), the hook is invoked as a plain function
 * against a hand-rolled slot-based useState/useRef, backed by a
 * dependency-AND-cleanup-aware useEffect mock — cleanup-awareness is a
 * strict requirement here (not just an improvement) because the debounce
 * effect's `clearTimeout` cleanup must actually run on every requery, or
 * the "one call per pause" assertion (T-20-04) would pass for the wrong
 * reason (multiple orphaned timers instead of one surviving timer).
 *
 * Unlike a real React re-render, this mock does not auto-schedule a
 * re-invocation when an effect mutates state mid-render (a `setState` call
 * from inside an effect that ran during THIS render is only visible on the
 * NEXT call to the hook). `settle()` below repeatedly flushes microtasks
 * and re-invokes the hook until its externally-observable fields
 * (query/results/status/loading) stop changing, so tests don't have to
 * hand-count how many render-hops a given async step needs.
 *
 * jest.useFakeTimers() drives the 400ms setTimeout; window.api.searchStores
 * is a manually-resolved mock so response ordering can be controlled
 * independently of call ordering (generation-guard race test).
 */

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let refSlots: { current: unknown }[] = []
  let refCursor = 0
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCleanups: (void | (() => void))[] = []
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
    __beginRender: () => {
      stateCursor = 0
      refCursor = 0
      effectCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      stateCursor = 0
      refSlots = []
      refCursor = 0
      effectDeps = []
      effectCleanups = []
      effectCursor = 0
    }
  }
})

const mockApi = {
  searchStores: jest.fn(),
  logError: jest.fn()
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

// Imported after the mocks above (textual order — this project's ts-jest
// setup does not hoist jest.mock like babel-jest; see HumbleOriginInfo.test.tsx).
import { useDebouncedStoreSearch } from '../hooks/useDebouncedStoreSearch'
import type { StoreSearchResult } from 'common/types/storeSearch'
import fs from 'fs'
import path from 'path'

const DEBOUNCE_WINDOW = 400

type Hook = ReturnType<typeof useDebouncedStoreSearch>
type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function mount(): Hook {
  harness().__resetMount()
  harness().__beginRender()
  return useDebouncedStoreSearch()
}

function rerender(): Hook {
  harness().__beginRender()
  return useDebouncedStoreSearch()
}

function flushPromises(): Promise<void> {
  return Promise.resolve()
    .then(() => Promise.resolve())
    .then(() => Promise.resolve())
}

/**
 * Flushes microtasks and re-invokes the hook a fixed number of times so any
 * chain of out-of-render state mutations (timer callbacks, resolved/
 * rejected fetch promises) has enough render-hops to become observable —
 * see file-level doc comment for why a single rerender() isn't enough, and
 * why an equality-based "stop once unchanged" early exit is unsafe (an
 * in-flight mutation can coincidentally serialize identically to the prior
 * render on one hop, before a later hop changes it again).
 */
async function settle(current: Hook): Promise<Hook> {
  let value = current
  for (let i = 0; i < 8; i++) {
    await flushPromises()
    value = rerender()
  }
  return value
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

describe('useDebouncedStoreSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockApi.searchStores.mockReset()
    mockApi.logError.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('rapid sequential setQuery within the 400ms window fires searchStores exactly once, with the final value', async () => {
    mockApi.searchStores.mockResolvedValue([])

    let hook = mount()
    hook.setQuery('p')
    hook = rerender()
    jest.advanceTimersByTime(100)

    hook.setQuery('po')
    hook = rerender()
    jest.advanceTimersByTime(100)

    hook.setQuery('por')
    hook = rerender()
    jest.advanceTimersByTime(100)

    hook.setQuery('port')
    hook = rerender()
    jest.advanceTimersByTime(DEBOUNCE_WINDOW)
    hook = await settle(hook)

    expect(mockApi.searchStores).toHaveBeenCalledTimes(1)
    expect(mockApi.searchStores).toHaveBeenCalledWith('port')
  })

  it('a query trimmed to <3 chars fires no request and exposes status "prompt"', async () => {
    let hook = mount()
    hook.setQuery('po')
    hook = rerender()
    jest.advanceTimersByTime(500)
    hook = await settle(hook)

    expect(mockApi.searchStores).not.toHaveBeenCalled()
    expect(hook.status).toBe('prompt')
    expect(hook.loading).toBe(false)
  })

  it('ignores a stale (superseded) resolution via the generation guard', async () => {
    const resolvers: Array<(value: StoreSearchResult[]) => void> = []
    mockApi.searchStores.mockImplementation(
      () =>
        new Promise<StoreSearchResult[]>((resolve) => {
          resolvers.push(resolve)
        })
    )

    let hook = mount()
    hook.setQuery('portal')
    hook = rerender()
    jest.advanceTimersByTime(DEBOUNCE_WINDOW)
    hook = await settle(hook)

    hook.setQuery('portal 2')
    hook = rerender()
    jest.advanceTimersByTime(DEBOUNCE_WINDOW)
    hook = await settle(hook)

    expect(resolvers).toHaveLength(2)

    // Newer (generation 2) resolves first with its real result.
    const newerResult = [makeResult({ gameId: 'portal-2', title: 'Portal 2' })]
    resolvers[1](newerResult)
    hook = await settle(hook)
    expect(hook.results).toEqual(newerResult)
    expect(hook.status).toBe('results')

    // Stale (generation 1) resolves AFTER the newer query already fired —
    // must be discarded, not overwrite the newer results.
    resolvers[0]([makeResult({ gameId: 'portal-1', title: 'Portal' })])
    hook = await settle(hook)
    expect(hook.results).toEqual(newerResult)
    expect(hook.status).toBe('results')
  })

  it('WR-01: discards a stale in-flight response after the query is cleared below MIN_QUERY_LENGTH', async () => {
    let resolveFetch: (value: StoreSearchResult[]) => void = () => {}
    mockApi.searchStores.mockImplementation(
      () =>
        new Promise<StoreSearchResult[]>((resolve) => {
          resolveFetch = resolve
        })
    )

    let hook = mount()
    hook.setQuery('portal')
    hook = rerender()
    jest.advanceTimersByTime(DEBOUNCE_WINDOW)
    hook = await settle(hook)

    // Request now in-flight.
    expect(mockApi.searchStores).toHaveBeenCalledTimes(1)
    expect(hook.loading).toBe(true)

    // User clears the query below MIN_QUERY_LENGTH while the request is
    // still in flight — this must invalidate the generation immediately
    // (WR-01), not just when a new fetch eventually starts.
    hook.setQuery('')
    hook = rerender()
    hook = await settle(hook)

    expect(hook.status).toBe('prompt')
    expect(hook.results).toEqual([])
    expect(hook.loading).toBe(false)

    // The stale in-flight response now resolves — it must be discarded,
    // not repopulate results or flip the screen back to a results view.
    resolveFetch([makeResult()])
    hook = await settle(hook)

    expect(hook.status).toBe('prompt')
    expect(hook.results).toEqual([])
    expect(hook.loading).toBe(false)
  })

  it('a rejected searchStores exposes status "error", leaves the query editable, and logs the raw error (not returned state)', async () => {
    mockApi.searchStores.mockRejectedValue(new Error('network down'))

    let hook = mount()
    hook.setQuery('portal')
    hook = rerender()
    jest.advanceTimersByTime(DEBOUNCE_WINDOW)
    hook = await settle(hook)

    expect(hook.status).toBe('error')
    expect(hook.query).toBe('portal')
    expect(mockApi.logError).toHaveBeenCalledWith(
      expect.stringContaining('network down')
    )

    // Query remains editable — setQuery still works after an error.
    hook.setQuery('portal 2')
    hook = rerender()
    expect(hook.query).toBe('portal 2')
  })

  it('exposes loading=true while the debounce timer is pending, and while a request is in-flight', async () => {
    let resolveFetch: (value: StoreSearchResult[]) => void = () => {}
    mockApi.searchStores.mockImplementation(
      () =>
        new Promise<StoreSearchResult[]>((resolve) => {
          resolveFetch = resolve
        })
    )

    let hook = mount()
    hook.setQuery('portal')
    hook = rerender()
    hook = await settle(hook)

    // Debounce timer pending, no request fired yet.
    expect(hook.loading).toBe(true)
    expect(mockApi.searchStores).not.toHaveBeenCalled()

    jest.advanceTimersByTime(DEBOUNCE_WINDOW)
    hook = await settle(hook)

    // Request now in-flight.
    expect(hook.loading).toBe(true)
    expect(mockApi.searchStores).toHaveBeenCalledTimes(1)

    resolveFetch([])
    hook = await settle(hook)

    expect(hook.loading).toBe(false)
  })

  it('does not use AbortController for cross-IPC supersede (generation ref only)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'hooks', 'useDebouncedStoreSearch.ts'),
      'utf8'
    )
    expect(source).not.toContain('new AbortController')
  })
})
