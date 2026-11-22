/**
 * Measured IsThereAnyDeal coverage constants, read by the renderer (the store-search price region list) and
 * by the Rust store search (`gamelib-info` `itad/coverage.rs` includes the same JSON file with `include_str!`),
 * so the two sides cannot drift.
 *
 * Source: the Phase 47 Wave 0 sweep recorded in
 * .planning/phases/47-migrate-aggregated-store-search-from-cheapshark-to-istherean/47-ITAD-COVERAGE.json
 * (measuredAt 2026-11-17T07:55:47.347Z).
 */
import coverage from './itadCoverage.json'

/**
 * Countries ITAD prices in their own currency (sweep `pricedCountries`; status 200 and not identical to the
 * US run). An array, not a Set: the module-state census flags any `new Set` at module scope, and this constant is
 * only ever membership-tested with `.includes`. Any other country gets the US fallback, D-13: there is no
 * nearest-region table.
 */
export const ITAD_PRICED_COUNTRIES: readonly string[] = coverage.pricedCountries

/** D-13: unpriced countries fall back to this one. */
export const ITAD_FALLBACK_COUNTRY: string = coverage.fallbackCountry

/** Shop ids from GET /service/shops/v1, looked up by title (sweep `shops`). Epic's title is "Epic Game Store". */
export const ITAD_SHOP_ID_STEAM: string = coverage.shopIds.steam
export const ITAD_SHOP_ID_GOG: string = coverage.shopIds.gog
export const ITAD_SHOP_ID_EPIC: string = coverage.shopIds.epic
