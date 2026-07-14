/**
 * Unit tests for the CheapShark HTTP adapter (Phase 20 / STORESEARCH-01).
 * axios is mocked — no live network calls. The dealID double-encoding
 * regression test is MANDATORY (RESEARCH Pitfall 1): a mis-implemented
 * redirect-URL builder that re-encodes an already-percent-encoded dealID
 * 404s in production, so this test permanently guards against that
 * regression.
 */

import axios from 'axios'
import {
  buildRedirectUrl,
  mapSearchResults,
  mapGameDeals,
  searchGames,
  getGameDeals,
  getStoreMap
} from '../cheapshark'

jest.mock('axios')
jest.mock('backend/logger')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('buildRedirectUrl', () => {
  it('interpolates dealID verbatim, never re-encoded', () => {
    const dealId = 'rPSCN3%2FJpoZ0%3D'
    const url = buildRedirectUrl(dealId)
    expect(url).toBe(
      'https://www.cheapshark.com/redirect?dealID=rPSCN3%2FJpoZ0%3D'
    )
    // The %2F and %3D must survive verbatim — a '%25' anywhere in the
    // output means the '%' of an already-encoded dealID got re-encoded.
    expect(url).not.toContain('%25')
  })
})

describe('mapSearchResults', () => {
  it('maps CheapShark search rows to StoreSearchResult with USD currency and a verbatim buyUrl', () => {
    const raw = [
      {
        gameID: '82',
        steamAppID: '400',
        cheapest: '9.99',
        cheapestDealID: 'abc%3D',
        external: 'Portal',
        internalName: 'PORTAL',
        thumb: 'https://cdn.example/portal.jpg'
      },
      {
        gameID: '99',
        // steamAppID intentionally omitted — non-Steam-listed title
        cheapest: '4.99',
        cheapestDealID: 'xyz',
        external: 'Some Indie Game',
        internalName: 'SOME_INDIE_GAME',
        thumb: 'https://cdn.example/indie.jpg'
      }
    ]

    const results = mapSearchResults(raw)

    expect(results).toEqual([
      {
        gameId: '82',
        title: 'Portal',
        steamAppId: '400',
        thumb: 'https://cdn.example/portal.jpg',
        cheapestPrice: '9.99',
        currencyCode: 'USD',
        buyUrl: 'https://www.cheapshark.com/redirect?dealID=abc%3D'
      },
      {
        gameId: '99',
        title: 'Some Indie Game',
        steamAppId: undefined,
        thumb: 'https://cdn.example/indie.jpg',
        cheapestPrice: '4.99',
        currencyCode: 'USD',
        buyUrl: 'https://www.cheapshark.com/redirect?dealID=xyz'
      }
    ])
  })
})

describe('mapGameDeals', () => {
  it('resolves storeName/runner via the store map and builds a verbatim buyUrl per deal', () => {
    const storeMap = {
      '1': {
        storeId: '1',
        storeName: 'Steam',
        runner: 'steam' as const,
        isActive: true
      },
      '7': {
        storeId: '7',
        storeName: 'GOG',
        runner: 'gog' as const,
        isActive: true
      }
    }
    const raw = {
      info: { title: 'Portal', steamAppID: '400', thumb: 'thumb.jpg' },
      cheapestPriceEver: { price: '4.99', date: 1000 },
      deals: [
        {
          storeID: '1',
          dealID: 'deal1%3D',
          price: '9.99',
          retailPrice: '19.99',
          savings: '50.000000'
        },
        {
          storeID: '7',
          dealID: 'deal2',
          price: '8.99',
          retailPrice: '19.99',
          savings: '55.000000'
        }
      ]
    }

    const deals = mapGameDeals(raw, storeMap)

    expect(deals).toEqual([
      {
        storeId: '1',
        storeName: 'Steam',
        runner: 'steam',
        price: '9.99',
        retailPrice: '19.99',
        currencyCode: 'USD',
        buyUrl: 'https://www.cheapshark.com/redirect?dealID=deal1%3D'
      },
      {
        storeId: '7',
        storeName: 'GOG',
        runner: 'gog',
        price: '8.99',
        retailPrice: '19.99',
        currencyCode: 'USD',
        buyUrl: 'https://www.cheapshark.com/redirect?dealID=deal2'
      }
    ])
  })

  it('falls back to the raw storeID when the store map has no entry (e.g. unmapped/new store)', () => {
    const deals = mapGameDeals(
      {
        info: { title: 'Unknown', thumb: '' },
        cheapestPriceEver: { price: '1.00', date: 0 },
        deals: [
          {
            storeID: '999',
            dealID: 'dealX',
            price: '1.00',
            retailPrice: '2.00',
            savings: '50.000000'
          }
        ]
      },
      {}
    )

    expect(deals[0].storeName).toBe('999')
    expect(deals[0].runner).toBeUndefined()
  })
})

describe('searchGames', () => {
  it('uses axios params with title+limit=60 and does NOT pass exact=1', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [
        {
          gameID: '82',
          steamAppID: '400',
          cheapest: '9.99',
          cheapestDealID: 'abc',
          external: 'Portal',
          internalName: 'PORTAL',
          thumb: 'thumb.jpg'
        }
      ]
    })

    const results = await searchGames('portal')

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://www.cheapshark.com/api/1.0/games',
      expect.objectContaining({
        params: { title: 'portal', limit: 60 }
      })
    )
    const callArgs = mockedAxios.get.mock.calls[0][1] as {
      params: Record<string, unknown>
    }
    expect(callArgs.params).not.toHaveProperty('exact')
    expect(results).toHaveLength(1)
    expect(results[0].currencyCode).toBe('USD')
  })

  it('logs and re-throws on failure (does not swallow)', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('network error'))

    await expect(searchGames('portal')).rejects.toThrow('network error')
  })
})

// NOTE: getStoreMap()'s cache is a module-level singleton, so this is the
// single combined test exercising both getGameDeals (which populates the
// cache on first use) and a subsequent direct getStoreMap() call (which
// must reuse the cache) — keeping cache-state assumptions self-contained
// in one test rather than spread across independently-ordered tests.
describe('getStoreMap + getGameDeals (session-cached /stores)', () => {
  it('fetches /stores at most once per process, resolving deal store names via the cache', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [
        { storeID: '1', storeName: 'Steam', isActive: 1, images: {} },
        { storeID: '4', storeName: 'Amazon', isActive: 0, images: {} }
      ]
    })
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        info: { title: 'Portal', steamAppID: '400', thumb: 'thumb.jpg' },
        cheapestPriceEver: { price: '4.99', date: 1000 },
        deals: [
          {
            storeID: '1',
            dealID: 'deal1',
            price: '9.99',
            retailPrice: '19.99',
            savings: '50.000000'
          }
        ]
      }
    })

    const deals = await getGameDeals('82')

    expect(deals).toEqual([
      {
        storeId: '1',
        storeName: 'Steam',
        runner: 'steam',
        price: '9.99',
        retailPrice: '19.99',
        currencyCode: 'USD',
        buyUrl: 'https://www.cheapshark.com/redirect?dealID=deal1'
      }
    ])
    // 1 call for /stores + 1 call for the game detail.
    expect(mockedAxios.get).toHaveBeenCalledTimes(2)

    // A second, independent getStoreMap() call must reuse the memoized
    // map — no third axios call.
    const storeMap = await getStoreMap()
    expect(storeMap['1'].storeName).toBe('Steam')
    expect(storeMap['4'].isActive).toBe(false)
    expect(mockedAxios.get).toHaveBeenCalledTimes(2)
  })
})
