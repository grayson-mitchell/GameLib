import axios from 'axios'
import { app } from 'backend/platform'
import { logError, LogPrefix } from 'backend/logger'
import { resolveRunner } from 'common/discounts/storeMapping'
import type {
  StoreSearchResult,
  StoreSearchDeal,
  StoreSearchStore
} from 'common/types/storeSearch'

/**
 * CheapShark HTTP adapter (Phase 20 / STORESEARCH-01). All CheapShark-shaped
 * JSON is mapped to GameLib's provider-neutral `common/types/storeSearch`
 * types here — this is the ONLY place the USD-only debt (D-13) is applied,
 * so a future second provider (e.g. IsThereAnyDeal) reshapes nothing
 * downstream.
 *
 * RESEARCH Pitfall 1 (VERIFIED live): CheapShark's `dealID`/`cheapestDealID`
 * values are ALREADY percent-encoded. The redirect URL
 * (`https://www.cheapshark.com/redirect?dealID={dealID}`) MUST interpolate
 * the dealID VERBATIM — never through a second URL-encoding pass — or the
 * double-encoding 404s (see `buildRedirectUrl`).
 */

const CHEAPSHARK_BASE = 'https://www.cheapshark.com/api/1.0'
const CHEAPSHARK_REDIRECT = 'https://www.cheapshark.com/redirect'
/** D-13: the single place CheapShark's USD-only knowledge is applied. */
const SEARCH_CURRENCY = 'USD'

// CheapShark title search — verified live shape (RESEARCH Code Examples).
type CheapSharkGameSearchResult = {
  gameID: string
  steamAppID?: string
  cheapest: string
  cheapestDealID: string
  external: string
  internalName: string
  thumb: string
}

// CheapShark per-game deal breakdown — verified live shape.
type CheapSharkGameDetail = {
  info: { title: string; steamAppID?: string; thumb: string }
  cheapestPriceEver: { price: string; date: number }
  deals: Array<{
    storeID: string
    dealID: string
    price: string
    retailPrice: string
    savings: string
  }>
}

// CheapShark /stores lookup — verified live shape (partial).
type CheapSharkStore = {
  storeID: string
  storeName: string
  isActive: 0 | 1
  images: { banner: string; logo: string; icon: string }
}

/** Module-level, in-memory, per-app-session cache — NOT an electron-store
 * schema entry (RESEARCH explicitly rejects a persisted-cache alternative). */
let storeMapCache: Record<string, StoreSearchStore> | undefined

function buildHeaders(): Record<string, string> {
  return {
    'User-Agent': `GameLib/${app.getVersion()}`
  }
}

/**
 * T-20-01 mitigation: the ONLY untrusted fragment ever interpolated into
 * this URL is `dealId` itself — the host+path prefix is always the fixed
 * `CHEAPSHARK_REDIRECT` constant, never a full URL-shaped field trusted
 * from CheapShark's response. `dealId` is interpolated VERBATIM — never
 * passed through a second URL-encoding pass (RESEARCH Pitfall 1 —
 * double-encoding an already-percent-encoded dealID 404s).
 */
export function buildRedirectUrl(dealId: string): string {
  return `${CHEAPSHARK_REDIRECT}?dealID=${dealId}`
}

export function mapSearchResults(
  raw: CheapSharkGameSearchResult[]
): StoreSearchResult[] {
  return raw.map((item) => ({
    gameId: item.gameID,
    title: item.external,
    steamAppId: item.steamAppID,
    thumb: item.thumb,
    cheapestPrice: item.cheapest,
    currencyCode: SEARCH_CURRENCY,
    buyUrl: buildRedirectUrl(item.cheapestDealID)
  }))
}

export function mapGameDeals(
  raw: CheapSharkGameDetail,
  storeMap: Record<string, StoreSearchStore>
): StoreSearchDeal[] {
  return raw.deals.map((deal) => {
    const store = storeMap[deal.storeID]
    return {
      storeId: deal.storeID,
      storeName: store?.storeName ?? deal.storeID,
      runner: store?.runner,
      price: deal.price,
      retailPrice: deal.retailPrice,
      currencyCode: SEARCH_CURRENCY,
      buyUrl: buildRedirectUrl(deal.dealID)
    }
  })
}

/**
 * Fetches CheapShark's `/stores` directory at most once per process
 * (RESEARCH: "fetch once backend-side... cached in-memory"). A second call
 * returns the memoized value without a second network request.
 */
export async function getStoreMap(): Promise<Record<string, StoreSearchStore>> {
  if (storeMapCache) {
    return storeMapCache
  }
  try {
    const { data } = await axios.get<CheapSharkStore[]>(
      `${CHEAPSHARK_BASE}/stores`,
      { timeout: 15000, headers: buildHeaders() }
    )
    const map: Record<string, StoreSearchStore> = {}
    for (const store of data) {
      map[store.storeID] = {
        storeId: store.storeID,
        storeName: store.storeName,
        runner: resolveRunner(store.storeID),
        isActive: Boolean(store.isActive)
      }
    }
    storeMapCache = map
    return storeMapCache
  } catch (err) {
    logError(
      `Failed to fetch CheapShark store map: ${String(err)}`,
      LogPrefix.Backend
    )
    throw err
  }
}

/**
 * `GET /games?title=` — one row per game with the cheapest known price
 * already included (STORESEARCH-03/D-12). Uses axios `params` so the query
 * is auto-encoded (RESEARCH Security Domain V5) — never string-concat.
 * Does NOT pass `exact=1` — CheapShark's title search is case-insensitive
 * substring by design (RESEARCH Pitfall 3).
 */
export async function searchGames(query: string): Promise<StoreSearchResult[]> {
  try {
    const { data } = await axios.get<CheapSharkGameSearchResult[]>(
      `${CHEAPSHARK_BASE}/games`,
      {
        params: { title: query, limit: 60 },
        timeout: 15000,
        headers: buildHeaders()
      }
    )
    return mapSearchResults(data)
  } catch (err) {
    logError(
      `Failed to search CheapShark for "${query}": ${String(err)}`,
      LogPrefix.Backend
    )
    throw err
  }
}

/**
 * `GET /games?id=` — lazy per-game breakdown (STORESEARCH-03/D-12), fetched
 * only on row expand. Resolves each deal's store name/runner via the cached
 * `/stores` map.
 */
export async function getGameDeals(gameId: string): Promise<StoreSearchDeal[]> {
  try {
    const storeMap = await getStoreMap()
    const { data } = await axios.get<CheapSharkGameDetail>(
      `${CHEAPSHARK_BASE}/games`,
      {
        params: { id: gameId },
        timeout: 15000,
        headers: buildHeaders()
      }
    )
    return mapGameDeals(data, storeMap)
  } catch (err) {
    logError(
      `Failed to fetch CheapShark deals for game ${gameId}: ${String(err)}`,
      LogPrefix.Backend
    )
    throw err
  }
}
