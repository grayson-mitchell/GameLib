import axios from 'axios'
import type { MiscRuntimeSlice } from '../miscRuntime'
import type { AppInfo } from 'backend/process/context'
import { logError, logWarning, LogPrefix } from 'backend/logger'
import { resolveRunner } from 'common/discounts/storeMapping'
import {
  STORE_SEARCH_ERROR_MARKER,
  type StoreSearchDeal,
  type StoreSearchErrorCode,
  type StoreSearchResponse,
  type StoreSearchResult
} from 'common/types/storeSearch'
import {
  ITAD_FALLBACK_COUNTRY,
  ITAD_LOOKUP_BATCH_SIZE,
  ITAD_PRICED_COUNTRIES,
  ITAD_PRICE_AMOUNT_SOURCE,
  ITAD_SEARCH_RESULTS_PARAM,
  ITAD_SEARCH_RESULT_COUNT,
  ITAD_SHOP_ID_STEAM
} from './itadCoverage'
import {
  ITAD_FRESH_MS,
  dealsCacheKey,
  gidCacheKey,
  isGidEntryFresh,
  parseRetryAfter,
  readEntry,
  searchCacheKey,
  writePriceEntry
} from './itadCache'
import { resolveBuiltInItadKey } from './itadKey'
import type { ItadSecrets } from './itadSecrets'
import type { ItadCacheEntry } from './stores'

/**
 * IsThereAnyDeal adapter (Phase 47). All ITAD-shaped JSON is mapped to
 * GameLib's provider-neutral `common/types/storeSearch` types here and only
 * here.
 *
 * Key handling: an optional user key (D-05) is preferred over the built-in key until ITAD rejects
 * it (D-06). The key travels as a `key` query param (axios `params`,
 * never string-built). It is never logged and never placed in a thrown error:
 * failures are logged as `{endpoint, status}` only, and `StoreSearchError`
 * messages carry a marker, an endpoint label and a status.
 *
 * No timers (sidecar exit contract): the 429 gate expires by timestamp
 * comparison, and all state lives in `deps`.
 */

const ITAD_BASE = 'https://api.isthereanydeal.com'
const REQUEST_TIMEOUT_MS = 15000

type EntryStore<T> = {
  get(key: string): ItadCacheEntry<T> | undefined
  set(key: string, value: ItadCacheEntry<T>): void
  delete(key: string): void
}

export type ItadDeps = {
  appInfo: Pick<AppInfo, 'version'>
  stores: {
    storeSearch: {
      itadPricesStore: EntryStore<unknown>
      itadSteamGidsStore: EntryStore<string | null>
    }
  }
  now?: () => number
  env?: NodeJS.ProcessEnv
  /**
   * The optional user-key owner (D-05, D-06). Optional on purpose: PRICE-01..03 run on the
   * built-in key alone, so a caller with no owner (the Steam deals path) keeps working.
   */
  itadSecrets?: Pick<ItadSecrets, 'getApiKey' | 'isRejected' | 'markRejected'>
} & MiscRuntimeSlice<'itadGate'>

export class StoreSearchError extends Error {
  readonly code: StoreSearchErrorCode

  constructor(code: StoreSearchErrorCode, endpoint: string, status?: number) {
    // Marker first: IPC flattens errors to strings, the marker is the stable code. No URL, no key.
    super(`${STORE_SEARCH_ERROR_MARKER[code]} ${endpoint} ${status ?? 'none'}`)
    this.name = 'StoreSearchError'
    this.code = code
    Object.setPrototypeOf(this, StoreSearchError.prototype)
  }
}

// --- ITAD wire shapes (only the fields read) ---------------------------------

type ItadMoney = { amount: number; amountInt: number; currency: string }
type ItadDeal = {
  shop: { id: number | string; name: string }
  price: ItadMoney
  regular: ItadMoney
  url: string
}
type ItadSearchItem = {
  id: string
  title: string
  assets?: { banner145?: string; banner300?: string; boxart?: string }
}
type ItadGamePrices = { id: string; deals: ItadDeal[] }

type SearchPayload = { results: StoreSearchResult[]; pricedCountry: string }

// --- helpers -----------------------------------------------------------------

function clock(deps: ItadDeps): number {
  return (deps.now ?? Date.now)()
}

function buildHeaders(deps: ItadDeps): Record<string, string> {
  return { 'User-Agent': `GameLib/${deps.appInfo.version}` }
}

/** D-13: a country ITAD does not price in its own currency is priced as the fallback. */
function pricedCountryFor(requested: string): string {
  return ITAD_PRICED_COUNTRIES.includes(requested)
    ? requested
    : ITAD_FALLBACK_COUNTRY
}

type ResolvedKey = { key: string; source: 'user' | 'env' | 'baked' }

/**
 * Key precedence (D-02, D-05): the user key (set, and not rejected this session) >
 * GAMELIB_ITAD_API_KEY > the baked key. D-03: no key at all is a typed error, not a crash.
 */
async function resolveKey(
  deps: ItadDeps,
  endpoint: string
): Promise<ResolvedKey> {
  const secrets = deps.itadSecrets
  if (secrets && !secrets.isRejected()) {
    const user = (await secrets.getApiKey()) ?? ''
    if (user) return { key: user, source: 'user' }
  }
  const builtIn = resolveBuiltInItadKey(deps.env)
  if (!builtIn) throw new StoreSearchError('notConfigured', endpoint)
  return builtIn
}

/**
 * Runs `request` with the resolved key. D-06: when ITAD answers 401/403 to a request made with the
 * USER key, the key is marked rejected for the session and that same request is retried once with
 * the built-in key (or fails notConfigured when there is none). A rejection of a built-in key is not
 * retried. `first` lets a caller that already resolved the key (to fail early) reuse it.
 */
async function withKey<T>(
  deps: ItadDeps,
  endpoint: string,
  request: (key: string) => Promise<T>,
  first?: ResolvedKey
): Promise<T> {
  const resolved = first ?? (await resolveKey(deps, endpoint))
  try {
    return await request(resolved.key)
  } catch (err) {
    const status = statusOf(err)
    if (
      resolved.source !== 'user' ||
      !deps.itadSecrets ||
      (status !== 401 && status !== 403)
    ) {
      throw err
    }
    deps.itadSecrets.markRejected()
    logWarning(
      `[itad] user key rejected status=${status}; using the built-in key`,
      LogPrefix.Backend
    )
    const fallback = await resolveKey(deps, endpoint)
    return request(fallback.key)
  }
}

function isHttpsUrl(u: unknown): u is string {
  if (typeof u !== 'string') return false
  try {
    return new URL(u).protocol === 'https:'
  } catch {
    return false
  }
}

function isUuid(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  )
}

function fractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency
    }).resolvedOptions().maximumFractionDigits as number
  } catch {
    return 2
  }
}

function priceString(price: ItadMoney): string {
  if (ITAD_PRICE_AMOUNT_SOURCE === 'amount') return String(price.amount)
  const digits = fractionDigits(price.currency)
  return (price.amountInt / 10 ** digits).toFixed(digits)
}

function isMoney(m: unknown): m is ItadMoney {
  if (typeof m !== 'object' || m === null) return false
  const o = m as Record<string, unknown>
  return (
    typeof o.amount === 'number' &&
    typeof o.amountInt === 'number' &&
    typeof o.currency === 'string'
  )
}

/** The HTTP status of a failed axios call, or undefined for a network error. */
function statusOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const status = (err as { response?: { status?: unknown } }).response?.status
  return typeof status === 'number' ? status : undefined
}

function retryAfterOf(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const headers = (err as { response?: { headers?: Record<string, unknown> } })
    .response?.headers
  const value = headers?.['retry-after']
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return undefined
}

/** Logs the endpoint and status only: never the error object, its config, the URL or the key. */
function logFailure(endpoint: string, err: unknown): void {
  logError(
    `[itad] ${endpoint} failed status=${statusOf(err) ?? 'none'}`,
    LogPrefix.Backend
  )
}

function toStoreSearchError(endpoint: string, err: unknown): StoreSearchError {
  if (err instanceof StoreSearchError) return err
  const status = statusOf(err)
  return new StoreSearchError(
    status === 429 ? 'rateLimited' : 'provider',
    endpoint,
    status
  )
}

/** ITAD failed in a way the stale copy can cover: rate limit, network error or a 5xx. */
function isStaleCoverable(err: unknown): boolean {
  const status = statusOf(err)
  return status === undefined || status === 429 || status >= 500
}

// --- mapping -----------------------------------------------------------------

function mapDeals(deals: unknown): StoreSearchDeal[] {
  if (!Array.isArray(deals)) return []
  const out: StoreSearchDeal[] = []
  for (const deal of deals as Array<Partial<ItadDeal> | null>) {
    if (!deal || typeof deal !== 'object') continue
    const { shop, price, regular } = deal
    if (!shop || typeof shop.name !== 'string') continue
    if (!isMoney(price) || !isMoney(regular)) continue
    // A non-https url drops the deal; it is never rewritten.
    if (!isHttpsUrl(deal.url)) continue
    const storeId = String(shop.id)
    out.push({
      storeId,
      storeName: shop.name,
      runner: resolveRunner(storeId),
      price: priceString(price),
      retailPrice: priceString(regular),
      currencyCode: price.currency,
      // CONTRACTUAL (ITAD terms): pass the deal url through byte-for-byte; never normalise, re-encode, extend or rebuild it.
      buyUrl: deal.url
    })
  }
  return out.sort(
    (a, b) =>
      Number(a.price) - Number(b.price) ||
      a.storeName.localeCompare(b.storeName)
  )
}

function pricesById(json: unknown): Map<string, StoreSearchDeal[]> {
  const byId = new Map<string, StoreSearchDeal[]>()
  if (!Array.isArray(json)) return byId
  for (const raw of json as Array<Partial<ItadGamePrices> | null>) {
    if (!raw || !isUuid(raw.id)) continue
    byId.set(raw.id, mapDeals(raw.deals))
  }
  return byId
}

function thumbOf(item: ItadSearchItem): string {
  const a = item.assets
  return a?.banner145 ?? a?.banner300 ?? a?.boxart ?? ''
}

/** Keeps search order, one row per game from its cheapest deal; a game with no deal is dropped (D-11). */
function mapSearchResults(
  found: ItadSearchItem[],
  priced: Map<string, StoreSearchDeal[]>
): StoreSearchResult[] {
  const rows: StoreSearchResult[] = []
  for (const item of found) {
    const cheapest = priced.get(item.id)?.[0]
    if (!cheapest) continue
    rows.push({
      gameId: item.id,
      title: item.title,
      thumb: thumbOf(item),
      cheapestPrice: cheapest.price,
      currencyCode: cheapest.currencyCode,
      buyUrl: cheapest.buyUrl
    })
  }
  return rows
}

// --- cache reads ---------------------------------------------------------------

function isSearchPayload(d: unknown): d is SearchPayload {
  if (typeof d !== 'object' || d === null) return false
  const o = d as Record<string, unknown>
  return Array.isArray(o.results) && typeof o.pricedCountry === 'string'
}

function isDealsPayload(d: unknown): d is StoreSearchDeal[] {
  return Array.isArray(d)
}

function readTyped<T>(
  store: EntryStore<unknown>,
  key: string,
  now: number,
  guard: (d: unknown) => d is T
): { entry: ItadCacheEntry<T>; fresh: boolean } | undefined {
  const hit = readEntry<unknown>(store, key, now, ITAD_FRESH_MS)
  if (!hit || !guard(hit.entry.data)) return undefined
  return {
    entry: { data: hit.entry.data, fetchedAt: hit.entry.fetchedAt },
    fresh: hit.fresh
  }
}

/** PRICE-03: serve the stale copy when there is one, else throw the typed error. */
function staleOrThrow<T, R>(
  hit: { entry: ItadCacheEntry<T> } | undefined,
  serve: (entry: ItadCacheEntry<T>) => R,
  err: StoreSearchError
): R {
  if (hit) return serve(hit.entry)
  throw err
}

// --- network -------------------------------------------------------------------

/**
 * POST /games/prices/v3. For a country other than the fallback, a 4xx (not an auth/rate error) is
 * retried once as the fallback country (ITAD answers some countries with a 4xx) and the returned
 * `pricedCountry` says so (D-13).
 */
async function postPrices(
  deps: ItadDeps,
  endpoint: string,
  gids: string[],
  country: string,
  first?: ResolvedKey
): Promise<{ byId: Map<string, StoreSearchDeal[]>; pricedCountry: string }> {
  return withKey(
    deps,
    endpoint,
    (key) => postPricesWithKey(deps, key, gids, country),
    first
  )
}

async function postPricesWithKey(
  deps: ItadDeps,
  key: string,
  gids: string[],
  country: string
): Promise<{ byId: Map<string, StoreSearchDeal[]>; pricedCountry: string }> {
  const call = async (c: string) => {
    const { data } = await axios.post<unknown>(
      `${ITAD_BASE}/games/prices/v3`,
      gids,
      {
        params: { country: c, key },
        timeout: REQUEST_TIMEOUT_MS,
        headers: buildHeaders(deps)
      }
    )
    return pricesById(data)
  }
  try {
    return { byId: await call(country), pricedCountry: country }
  } catch (err) {
    const status = statusOf(err)
    const fallbackable =
      country !== ITAD_FALLBACK_COUNTRY &&
      status !== undefined &&
      status >= 400 &&
      status < 500 &&
      status !== 401 &&
      status !== 403 &&
      status !== 429
    if (!fallbackable) throw err
    return {
      byId: await call(ITAD_FALLBACK_COUNTRY),
      pricedCountry: ITAD_FALLBACK_COUNTRY
    }
  }
}

/** Caches one deals entry per gid so expanding a row is a cache hit (Pitfall 8). */
function cacheDeals(
  deps: ItadDeps,
  countries: string[],
  byId: Map<string, StoreSearchDeal[]>,
  now: number
): void {
  const store = deps.stores.storeSearch.itadPricesStore
  for (const [gid, deals] of byId) {
    for (const c of new Set(countries)) {
      writePriceEntry(store, dealsCacheKey(c, gid), deals, now)
    }
  }
}

function noteRateLimit(deps: ItadDeps, err: unknown): void {
  if (statusOf(err) !== 429) return
  const now = clock(deps)
  deps.miscRuntime.itadGate.block(parseRetryAfter(retryAfterOf(err), now), now)
}

// --- public API ------------------------------------------------------------------

export async function searchGames(
  deps: ItadDeps,
  query: string,
  requestedCountry: string
): Promise<StoreSearchResponse> {
  const country = pricedCountryFor(requestedCountry)
  const store = deps.stores.storeSearch.itadPricesStore
  const cacheKey = searchCacheKey(country, query)
  const hit = readTyped(store, cacheKey, clock(deps), isSearchPayload)
  if (hit?.fresh) {
    return {
      results: hit.entry.data.results,
      pricedCountry: hit.entry.data.pricedCountry
    }
  }

  const serveStale = (entry: ItadCacheEntry<SearchPayload>) => ({
    results: entry.data.results.map((r) => ({
      ...r,
      cachedAt: entry.fetchedAt
    })),
    pricedCountry: entry.data.pricedCountry
  })

  if (deps.miscRuntime.itadGate.isBlocked(clock(deps))) {
    return staleOrThrow(
      hit,
      serveStale,
      new StoreSearchError('rateLimited', 'search', 429)
    )
  }
  const resolved = await resolveKey(deps, 'search')

  return deps.miscRuntime.itadGate.singleFlight(cacheKey, async () => {
    try {
      const { data: found } = await withKey(
        deps,
        'search',
        (key) =>
          axios.get<ItadSearchItem[]>(`${ITAD_BASE}/games/search/v1`, {
            params: {
              title: query,
              [ITAD_SEARCH_RESULTS_PARAM]: ITAD_SEARCH_RESULT_COUNT,
              key
            },
            timeout: REQUEST_TIMEOUT_MS,
            headers: buildHeaders(deps)
          }),
        resolved
      )
      const items = (Array.isArray(found) ? found : []).filter(
        (i) => i && isUuid(i.id) && typeof i.title === 'string'
      )
      if (items.length === 0) {
        const empty: SearchPayload = { results: [], pricedCountry: country }
        writePriceEntry(store, cacheKey, empty, clock(deps))
        return { ...empty }
      }
      // Resolved afresh: a rejected user key from the search call must not be reused here.
      const { byId, pricedCountry } = await postPrices(
        deps,
        'search',
        items.map((i) => i.id),
        country
      )
      const payload: SearchPayload = {
        results: mapSearchResults(items, byId),
        pricedCountry
      }
      const now = clock(deps)
      writePriceEntry(store, cacheKey, payload, now)
      cacheDeals(deps, [country, pricedCountry], byId, now)
      return { results: payload.results, pricedCountry }
    } catch (err) {
      noteRateLimit(deps, err)
      if (isStaleCoverable(err) && hit) return serveStale(hit.entry)
      logFailure('search', err)
      throw toStoreSearchError('search', err)
    }
  })
}

export async function getGameDeals(
  deps: ItadDeps,
  gameId: string,
  requestedCountry: string
): Promise<StoreSearchDeal[]> {
  // Cache-key safety: the id reaches a store key and a request body.
  if (!isUuid(gameId)) throw new StoreSearchError('provider', 'deals')
  const country = pricedCountryFor(requestedCountry)
  const store = deps.stores.storeSearch.itadPricesStore
  const cacheKey = dealsCacheKey(country, gameId)
  const hit = readTyped(store, cacheKey, clock(deps), isDealsPayload)
  if (hit?.fresh) return hit.entry.data

  const serveStale = (entry: ItadCacheEntry<StoreSearchDeal[]>) =>
    entry.data.map((d) => ({ ...d, cachedAt: entry.fetchedAt }))

  if (deps.miscRuntime.itadGate.isBlocked(clock(deps))) {
    return staleOrThrow(
      hit,
      serveStale,
      new StoreSearchError('rateLimited', 'deals', 429)
    )
  }
  const resolved = await resolveKey(deps, 'deals')

  return deps.miscRuntime.itadGate.singleFlight(cacheKey, async () => {
    try {
      const { byId, pricedCountry } = await postPrices(
        deps,
        'deals',
        [gameId],
        country,
        resolved
      )
      const deals = byId.get(gameId) ?? []
      cacheDeals(
        deps,
        [country, pricedCountry],
        new Map([[gameId, deals]]),
        clock(deps)
      )
      return deals
    } catch (err) {
      noteRateLimit(deps, err)
      if (isStaleCoverable(err) && hit) return serveStale(hit.entry)
      logFailure('deals', err)
      throw toStoreSearchError('deals', err)
    }
  })
}

/**
 * PRICE-02: appid -> ITAD game id via the keyless lookup route. Cached 30 days (a miss 1 day,
 * D-10); only unseen/expired appids are requested; on failure returns what it has, never throws.
 * Does not touch the 429 gate (the keyless route's limit is separate).
 */
export async function lookupSteamGids(
  deps: ItadDeps,
  appIds: string[]
): Promise<Record<string, string>> {
  const store = deps.stores.storeSearch.itadSteamGidsStore
  const ids = [...new Set(appIds.filter((id) => /^\d{1,10}$/.test(id)))]
  const out: Record<string, string> = {}
  const toFetch: string[] = []
  const now = clock(deps)
  for (const id of ids) {
    const entry = store.get(gidCacheKey(id))
    if (entry && isGidEntryFresh(entry, now)) {
      if (entry.data) out[id] = entry.data
      continue
    }
    toFetch.push(id)
    // An expired mapping is still the best answer if the refresh fails.
    if (entry?.data) out[id] = entry.data
  }

  for (let i = 0; i < toFetch.length; i += ITAD_LOOKUP_BATCH_SIZE) {
    const chunk = toFetch.slice(i, i + ITAD_LOOKUP_BATCH_SIZE)
    try {
      const { data } = await axios.post<Record<string, unknown>>(
        `${ITAD_BASE}/lookup/id/shop/${ITAD_SHOP_ID_STEAM}/v1`,
        chunk.map((id) => `app/${id}`),
        { timeout: REQUEST_TIMEOUT_MS, headers: buildHeaders(deps) }
      )
      const fetchedAt = clock(deps)
      for (const id of chunk) {
        const value = data?.[`app/${id}`]
        const gid = isUuid(value) ? value : null
        store.set(gidCacheKey(id), { data: gid, fetchedAt })
        if (gid) out[id] = gid
        else delete out[id]
      }
    } catch (err) {
      logWarning(
        `[itad] lookup failed status=${statusOf(err) ?? 'none'}`,
        LogPrefix.Backend
      )
    }
  }
  return out
}
