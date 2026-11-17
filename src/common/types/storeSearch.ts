import type { Runner } from '../types'

/**
 * Provider-neutral type vocabulary for the aggregated store-search feature.
 * These shapes are the IsThereAnyDeal adapter's OUTPUT (Phase 47), not its
 * input: `backend/storeSearch/itad.ts` converts ITAD's raw JSON into these
 * types, so no consumer is shaped by the provider.
 *
 * D-13/STORESEARCH-04: every price-bearing type below carries an explicit
 * `currencyCode` field. It is the real per-price ISO 4217 code ITAD returns
 * for the priced country (which is the requested country unless the D-13 US
 * fallback applied, see `StoreSearchResponse.pricedCountry`). It stays a bare
 * `string` rather than a literal union so a new currency needs no type change.
 */

/** A single search-result row: one game, its cheapest known deal. */
export interface StoreSearchResult {
  gameId: string
  title: string
  /**
   * Injected renderer-side from the appid -> gid map (`lookupSteamGids`); the
   * adapter never sets it.
   */
  steamAppId?: string
  thumb: string
  /** Decimal string, e.g. "9.99" — the cheapest known price for this game. */
  cheapestPrice: string
  /** D-13: explicit per-price currency; see file-level doc comment. */
  currencyCode: string
  /**
   * ITAD's deal url passed through verbatim. Contractual (ITAD terms): never
   * normalised, re-encoded, extended with params or rebuilt.
   */
  buyUrl: string
  /**
   * Epoch ms of the cached entry. Present ONLY when this row was served from
   * cache because ITAD was rate-limited or unreachable (PRICE-03).
   */
  cachedAt?: number
}

/** A single per-store deal row within a game's store-search breakdown. */
export interface StoreSearchDeal {
  storeId: string
  storeName: string
  runner?: Runner
  /** Decimal string, e.g. "9.99". */
  price: string
  /** Decimal string, e.g. "19.99". */
  retailPrice: string
  /** D-13: explicit per-price currency; see file-level doc comment. */
  currencyCode: string
  /** ITAD's deal url passed through verbatim (contractual, see StoreSearchResult). */
  buyUrl: string
  /** Epoch ms of the cached entry; present only when served stale (PRICE-03). */
  cachedAt?: number
}

/** A single store entry from the provider's store directory. */
export interface StoreSearchStore {
  storeId: string
  storeName: string
  runner?: Runner
  isActive: boolean
}

/** The search envelope: rows plus the country ITAD actually priced. */
export interface StoreSearchResponse {
  results: StoreSearchResult[]
  /**
   * The country ITAD actually priced. Differs from the requested country only
   * on the D-13 US fallback, so the UI can state it.
   */
  pricedCountry: string
}

export type StoreSearchErrorCode = 'rateLimited' | 'notConfigured' | 'provider'

/**
 * IPC flattens errors to strings (sidecarRpc sends `error.message`; Rust
 * passes it through), so a leading message marker is the stable error code.
 * Same idiom as `IPC_INVALID_ARGS_MARKER`.
 */
export const STORE_SEARCH_ERROR_MARKER = {
  rateLimited: '[storeSearch:rateLimited]',
  notConfigured: '[storeSearch:notConfigured]',
  provider: '[storeSearch:provider]'
} as const

/** Classifies an Error or a string rejection by its marker; anything else is 'provider'. */
export function storeSearchErrorCode(err: unknown): StoreSearchErrorCode {
  const text = err instanceof Error ? err.message : String(err)
  for (const code of ['rateLimited', 'notConfigured', 'provider'] as const) {
    if (text.includes(STORE_SEARCH_ERROR_MARKER[code])) return code
  }
  return 'provider'
}
