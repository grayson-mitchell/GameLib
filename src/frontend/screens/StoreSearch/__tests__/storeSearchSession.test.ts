/**
 * Session-only Store Search query and rows (G-47-12a). In-memory module
 * state; D-22 / WR-11 forbid any storage key, because the rows carry prices
 * that the backend may serve from a cache entry up to an hour old.
 *
 * The restore rules are what stop a region change, a stale price or a
 * failed search from coming back as current: the query always comes back, the
 * rows only when they were fetched for the same trimmed query and country,
 * within KEPT_RESULTS_MAX_AGE_MS, and ended in 'results' or 'empty'.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import type { StoreSearchResult } from 'common/types/storeSearch'

import {
  KEPT_RESULTS_MAX_AGE_MS,
  resetStoreSearchSessionForTests,
  restoreStoreSearchSession,
  writeStoreSearchSession,
  type StoreSearchStatus
} from '../storeSearchSession'

const T = 1_000_000

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

function keepRows(
  overrides: {
    query?: string
    status?: StoreSearchStatus
    fetchedQuery?: string
    countryCode?: string
    at?: number
  } = {}
) {
  const rows = [makeResult()]
  writeStoreSearchSession({
    query: overrides.query ?? 'portal',
    results: rows,
    status: overrides.status ?? 'results',
    pricedCountry: 'US',
    fetchedFor: {
      query: overrides.fetchedQuery ?? 'portal',
      countryCode: overrides.countryCode ?? 'US',
      at: overrides.at ?? T
    }
  })
  return rows
}

const queryOnly = (query: string, debouncedQuery: string) => ({
  query,
  debouncedQuery,
  results: [],
  status: 'prompt',
  pricedCountry: null,
  fetchedFor: null
})

beforeEach(() => {
  resetStoreSearchSessionForTests()
})

describe('storeSearchSession', () => {
  it('keeps rows for 15 minutes, so a restored row is at most 1h15m old end to end', () => {
    // The renderer stamps the age at response time, and the backend may have
    // served the response from a cache entry up to ITAD_FRESH_MS (1h) old.
    expect(KEPT_RESULTS_MAX_AGE_MS).toBe(15 * 60_000)
    expect(KEPT_RESULTS_MAX_AGE_MS).toBeLessThan(60 * 60_000)
  })

  it('starts empty', () => {
    expect(restoreStoreSearchSession('US', T)).toEqual(queryOnly('', ''))
  })

  it('restores the rows in full for the same query and country, up to the max age inclusive', () => {
    const rows = keepRows()
    const expected = {
      query: 'portal',
      debouncedQuery: 'portal',
      results: rows,
      status: 'results',
      pricedCountry: 'US',
      fetchedFor: { query: 'portal', countryCode: 'US', at: T }
    }
    expect(restoreStoreSearchSession('US', T)).toEqual(expected)
    expect(
      restoreStoreSearchSession('US', T + KEPT_RESULTS_MAX_AGE_MS)
    ).toEqual(expected)
  })

  it('restores an empty result set too', () => {
    keepRows({ status: 'empty' })
    expect(restoreStoreSearchSession('US', T).status).toBe('empty')
  })

  it('restores the query only for a different country', () => {
    keepRows()
    expect(restoreStoreSearchSession('DE', T)).toEqual(
      queryOnly('portal', 'portal')
    )
  })

  it('restores the query only once the rows are past the max age', () => {
    keepRows()
    expect(
      restoreStoreSearchSession('US', T + KEPT_RESULTS_MAX_AGE_MS + 1)
    ).toEqual(queryOnly('portal', 'portal'))
  })

  it('restores the query only when it was edited after the rows were fetched', () => {
    keepRows({ query: 'portals' })
    expect(restoreStoreSearchSession('US', T)).toEqual(
      queryOnly('portals', 'portals')
    )
  })

  it.each<StoreSearchStatus>(['error', 'loading', 'prompt'])(
    'restores the query only for a kept status of %s, never resurrecting it',
    (status) => {
      keepRows({ status })
      const restored = restoreStoreSearchSession('US', T)
      expect(restored).toEqual(queryOnly('portal', 'portal'))
      expect(restored.status).not.toBe('error')
    }
  )

  it('keeps a query shorter than three characters as typed, with no rows', () => {
    writeStoreSearchSession({
      query: 'po',
      results: [],
      status: 'prompt',
      pricedCountry: null,
      fetchedFor: null
    })
    expect(restoreStoreSearchSession('US', T)).toEqual(queryOnly('po', ''))
  })

  it('restores the trimmed query as the committed query', () => {
    keepRows({ query: '  portal ' })
    expect(restoreStoreSearchSession('US', T).debouncedQuery).toBe('portal')
  })

  it('hands out a copy of the rows, not the kept array', () => {
    keepRows()
    restoreStoreSearchSession('US', T).results.pop()
    expect(restoreStoreSearchSession('US', T).results).toHaveLength(1)
  })

  it('keeps a copy of the rows it was given', () => {
    const rows = keepRows()
    rows.pop()
    expect(restoreStoreSearchSession('US', T).results).toHaveLength(1)
  })

  it('never touches localStorage or sessionStorage (D-22)', () => {
    const makeStore = () => ({
      getItem: jest.fn(),
      setItem: jest.fn()
    })
    const g = globalThis as unknown as Record<string, unknown>
    const local = makeStore()
    const session = makeStore()
    g.localStorage = local
    g.sessionStorage = session
    keepRows()
    restoreStoreSearchSession('US', T)
    expect(local.setItem).not.toHaveBeenCalled()
    expect(local.getItem).not.toHaveBeenCalled()
    expect(session.setItem).not.toHaveBeenCalled()
    expect(session.getItem).not.toHaveBeenCalled()
  })
})

describe('useDebouncedStoreSearch wiring (source gate)', () => {
  const hook = stripSourceComments(
    readFileSync(
      join(__dirname, '..', 'hooks', 'useDebouncedStoreSearch.ts'),
      'utf8'
    )
  )
  const session = stripSourceComments(
    readFileSync(join(__dirname, '..', 'storeSearchSession.ts'), 'utf8')
  )

  it('seeds from the session store inside a lazy useState initialiser', () => {
    expect(hook).toMatch(/useState\(\s*\(\) =>\s*restoreStoreSearchSession\(/)
  })

  it('writes back from a useEffect', () => {
    expect(hook).toMatch(/useEffect\(\(\) => \{\s*writeStoreSearchSession\(/)
  })

  it('uses no storage in the hook or the session module', () => {
    for (const source of [hook, session]) {
      expect(source).not.toMatch(/\blocalStorage\./)
      expect(source).not.toMatch(/\bsessionStorage\./)
      expect(source).not.toMatch(/storage\.setItem\(/)
    }
  })
})
