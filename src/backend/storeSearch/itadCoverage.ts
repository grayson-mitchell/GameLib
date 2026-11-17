/**
 * Measured IsThereAnyDeal coverage constants for the Store Search adapter.
 *
 * Source: the Phase 47 Wave 0 sweep recorded in
 * .planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-ITAD-COVERAGE.json
 * (measuredAt 2026-11-17T07:55:47.347Z). Every value below is traced to that file unless a comment says
 * otherwise. Pure constants: no imports, no module state.
 */

/**
 * Countries ITAD prices in their own currency (sweep `pricedCountries`; status 200 and not identical to the
 * US run). An array, not a Set: the module-state census (moduleStateCensus.test.ts) flags any `new Set` at module
 * scope, and this constant is only ever membership-tested with `.includes`. Any other country gets the US fallback, D-13: there is no nearest-region table.
 */
export const ITAD_PRICED_COUNTRIES: readonly string[] = [
  'US',
  'AU',
  'BR',
  'CA',
  'CN',
  'CZ',
  'DK',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IT',
  'JP',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'KR',
  'ES',
  'SE',
  'CH',
  'TW',
  'TR',
  'GB',
  'AR',
  'NZ',
  'IE',
  'AT',
  'BE',
  'IN'
]

/** D-13: unpriced countries fall back to this one. */
export const ITAD_FALLBACK_COUNTRY = 'US'

/** Shop ids from GET /service/shops/v1, looked up by title (sweep `shops`). Epic's title is "Epic Game Store". */
export const ITAD_SHOP_ID_STEAM = '61'
export const ITAD_SHOP_ID_GOG = '35'
export const ITAD_SHOP_ID_EPIC = '16'

/**
 * Query param that caps /games/search/v1 results. Graded SPEC, not MEASURED: the official ITAD OpenAPI spec
 * (docs.isthereanydeal.com, game search) defines `results` as a number 1..100, default 20, and has no `limit`
 * param. The sweep could not discriminate (47-ITAD-COVERAGE.json `searchCounts` is {results: 20, limit: 20}
 * with `resultsParam: null`) because 20 is the default and the unknown `limit` was ignored.
 */
export const ITAD_SEARCH_RESULTS_PARAM = 'results'

/** D-09: rows requested per search. */
export const ITAD_SEARCH_RESULT_COUNT = 20

/** Sweep `lookupBatchCeiling` was 1000; the adapter chunks at the smaller of that and 200. */
export const ITAD_LOOKUP_BATCH_SIZE = Math.min(1000, 200)

/** Sweep `amountSource`: `amount` agreed with `amountInt` for every recorded currency. */
export const ITAD_PRICE_AMOUNT_SOURCE: 'amount' | 'amountInt' = 'amount'

/**
 * Sweep `authStyle`: the key travels as a `key` query parameter. Documentation of the measured
 * value only (the adapter builds its `key` params inline), so it is deliberately not exported.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ITAD_AUTH_STYLE = 'query:key'
