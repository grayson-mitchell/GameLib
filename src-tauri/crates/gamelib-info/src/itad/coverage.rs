//! Measured IsThereAnyDeal coverage constants for the store search (`itadCoverage.ts`), copied
//! verbatim. The Phase 47 Wave 0 sweep is their source (`47-ITAD-COVERAGE.json`, measuredAt
//! 2026-11-17).

/// Countries ITAD prices in their own currency. Any other country gets [`FALLBACK_COUNTRY`] (D-13):
/// there is no nearest-region table.
pub const PRICED_COUNTRIES: &[&str] = &[
    "US", "AU", "BR", "CA", "CN", "CZ", "DK", "FI", "FR", "DE", "GR", "HU", "IT", "JP", "NL", "NO",
    "PL", "PT", "RO", "KR", "ES", "SE", "CH", "TW", "TR", "GB", "AR", "NZ", "IE", "AT", "BE", "IN",
];

/// D-13: unpriced countries fall back to this one.
pub const FALLBACK_COUNTRY: &str = "US";

/// The Steam shop id from `GET /service/shops/v1` (sweep `shops`).
pub const SHOP_ID_STEAM: &str = "61";

/// The query parameter that caps `/games/search/v1` results (graded SPEC: the official OpenAPI
/// spec defines `results`, 1..100, default 20, and has no `limit`).
pub const SEARCH_RESULTS_PARAM: &str = "results";

/// D-09: rows requested per search.
pub const SEARCH_RESULT_COUNT: u32 = 20;

/// The sweep's lookup ceiling was 1000; the adapter chunks at the smaller of that and 200.
pub const LOOKUP_BATCH_SIZE: usize = 200;

/// The deal price is the `amount` (the sweep found it agreed with `amountInt` for every recorded
/// currency), written as JS `String(amount)`.
pub const PRICE_AMOUNT_SOURCE: &str = "amount";

/// The ITAD shop id to GameLib `Runner` mapping (`common/discounts/storeMapping.ts`).
pub fn runner_for(store_id: &str) -> Option<&'static str> {
    match store_id {
        "61" => Some("steam"),
        "35" => Some("gog"),
        "16" => Some("legendary"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_constants_are_the_swept_ones() {
        assert_eq!(PRICED_COUNTRIES.len(), 32);
        assert!(PRICED_COUNTRIES.contains(&FALLBACK_COUNTRY));
        assert_eq!(LOOKUP_BATCH_SIZE, 200);
        assert_eq!(SEARCH_RESULT_COUNT, 20);
        assert_eq!(SEARCH_RESULTS_PARAM, "results");
        assert_eq!(PRICE_AMOUNT_SOURCE, "amount");
        assert_eq!(SHOP_ID_STEAM, "61");
    }

    #[test]
    fn only_the_three_mapped_shops_have_a_runner() {
        assert_eq!(runner_for("61"), Some("steam"));
        assert_eq!(runner_for("35"), Some("gog"));
        assert_eq!(runner_for("16"), Some("legendary"));
        assert_eq!(runner_for("1"), None);
        assert_eq!(runner_for(""), None);
    }
}
