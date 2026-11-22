//! Measured IsThereAnyDeal coverage constants for the store search. The countries, the fallback and the
//! shop ids live in `src/common/itadCoverage.json`, the file the renderer's price-region list reads
//! through `src/common/itadCoverage.ts`, so the two sides cannot drift. The Phase 47 Wave 0 sweep is
//! their source (`47-ITAD-COVERAGE.json`, measuredAt 2026-11-17).

use std::sync::OnceLock;

use serde::Deserialize;

const COVERAGE_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../src/common/itadCoverage.json"
));

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Coverage {
    priced_countries: Vec<String>,
    fallback_country: String,
    shop_ids: ShopIds,
}

#[derive(Deserialize)]
struct ShopIds {
    steam: String,
    gog: String,
    epic: String,
}

fn coverage() -> &'static Coverage {
    static COVERAGE: OnceLock<Coverage> = OnceLock::new();
    COVERAGE.get_or_init(|| {
        serde_json::from_str(COVERAGE_JSON).expect("src/common/itadCoverage.json is valid")
    })
}

/// Countries ITAD prices in their own currency. Any other country gets [`fallback_country`] (D-13):
/// there is no nearest-region table.
pub fn priced_countries() -> &'static [String] {
    &coverage().priced_countries
}

/// D-13: unpriced countries fall back to this one.
pub fn fallback_country() -> &'static str {
    &coverage().fallback_country
}

/// The Steam shop id from `GET /service/shops/v1` (sweep `shops`).
pub fn shop_id_steam() -> &'static str {
    &coverage().shop_ids.steam
}

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
    let ids = &coverage().shop_ids;
    if store_id == ids.steam {
        Some("steam")
    } else if store_id == ids.gog {
        Some("gog")
    } else if store_id == ids.epic {
        Some("legendary")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_constants_are_the_swept_ones() {
        assert_eq!(priced_countries().len(), 32);
        assert!(priced_countries().iter().any(|c| c == fallback_country()));
        assert_eq!(LOOKUP_BATCH_SIZE, 200);
        assert_eq!(SEARCH_RESULT_COUNT, 20);
        assert_eq!(SEARCH_RESULTS_PARAM, "results");
        assert_eq!(PRICE_AMOUNT_SOURCE, "amount");
        assert_eq!(shop_id_steam(), "61");
    }

    #[test]
    fn the_country_count_is_the_json_array_length() {
        let raw: serde_json::Value = serde_json::from_str(COVERAGE_JSON).unwrap();
        let listed = raw["pricedCountries"].as_array().unwrap().len();
        assert_eq!(priced_countries().len(), listed);
        assert_eq!(fallback_country(), raw["fallbackCountry"].as_str().unwrap());
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
