import type { Runner } from '../types'

/**
 * Provider-neutral type vocabulary for the aggregated store-search feature
 * (Phase 20). These shapes are the CheapShark adapter's OUTPUT, not its
 * input — the Plan 04 backend adapter converts CheapShark's raw JSON into
 * these types, so a future second provider (e.g. IsThereAnyDeal) can be
 * added later without reshaping any consumer (D-11/D-12).
 *
 * D-13/STORESEARCH-04: every price-bearing type below carries an explicit
 * `currencyCode` field. In practice this is always the US dollar code today
 * because CheapShark is a US-only price source, but the field is typed as
 * `string` (never a literal currency-code union) so that debt stays visible
 * in the type system rather than implicit, and a future non-USD provider
 * needs no type change — only a different value flowing through the same
 * field.
 */

/** A single search-result row: one game, its cheapest known deal. */
export interface StoreSearchResult {
  gameId: string
  title: string
  steamAppId?: string
  thumb: string
  /** Decimal string, e.g. "9.99" — the cheapest known price for this game. */
  cheapestPrice: string
  /** D-13: explicit per-price currency; see file-level doc comment. */
  currencyCode: string
  /** Pre-built, verbatim redirect URL for the cheapest deal (built backend-side, Plan 04). */
  buyUrl: string
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
  buyUrl: string
}

/** A single store entry from the provider's store directory. */
export interface StoreSearchStore {
  storeId: string
  storeName: string
  runner?: Runner
  isActive: boolean
}
