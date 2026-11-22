//! ITAD-shaped JSON mapped to GameLib's provider-neutral store-search types (`itad.ts`): deals,
//! the price lookup by game id, search rows and thumbnails. Only the fields TS read are read, and a
//! malformed entry is dropped the way TS dropped it.

use serde_json::Value;

use gamelib_store::json::{js_number_text, Json, Obj};

use super::collate::locale_compare;
use super::coverage::runner_for;

/// One deal of a game, as `mapDeals` builds it.
#[derive(Debug, Clone, PartialEq)]
pub struct Deal {
    pub store_id: String,
    pub store_name: String,
    pub runner: Option<&'static str>,
    pub price: String,
    pub retail_price: String,
    pub currency_code: String,
    /// CONTRACTUAL (ITAD terms): the deal url byte for byte, never normalised, re-encoded, extended
    /// or rebuilt.
    pub buy_url: String,
}

impl Deal {
    /// The object as TS wrote it: `storeId, storeName, runner?, price, retailPrice, currencyCode,
    /// buyUrl` (`runner` is absent for a shop with no mapping, as `undefined` is not serialised).
    pub fn to_json(&self) -> Json {
        let mut object = Obj::new();
        object.insert_js("storeId", Json::Str(self.store_id.clone()));
        object.insert_js("storeName", Json::Str(self.store_name.clone()));
        if let Some(runner) = self.runner {
            object.insert_js("runner", Json::Str(runner.to_string()));
        }
        object.insert_js("price", Json::Str(self.price.clone()));
        object.insert_js("retailPrice", Json::Str(self.retail_price.clone()));
        object.insert_js("currencyCode", Json::Str(self.currency_code.clone()));
        object.insert_js("buyUrl", Json::Str(self.buy_url.clone()));
        Json::Obj(object)
    }
}

pub fn deals_json(deals: &[Deal]) -> Json {
    Json::Arr(deals.iter().map(Deal::to_json).collect())
}

/// `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.
pub fn is_uuid(text: &str) -> bool {
    let groups: Vec<&str> = text.split('-').collect();
    const LENGTHS: [usize; 5] = [8, 4, 4, 4, 12];
    groups.len() == LENGTHS.len()
        && groups
            .iter()
            .zip(LENGTHS)
            .all(|(group, len)| group.len() == len && group.bytes().all(|b| b.is_ascii_hexdigit()))
}

/// `new URL(u).protocol === 'https:'`.
fn is_https_url(text: &str) -> bool {
    url::Url::parse(text).is_ok_and(|u| u.scheme() == "https")
}

/// JS `String(value)` for the shapes a JSON document holds.
pub fn js_string(value: Option<&Value>) -> String {
    match value {
        None => "undefined".to_string(),
        Some(Value::Null) => "null".to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => n.as_f64().map_or_else(|| n.to_string(), js_number_text),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| match item {
                Value::Null => String::new(),
                other => js_string(Some(other)),
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".to_string(),
    }
}

/// `isMoney`: an object with a numeric `amount` and `amountInt` and a string `currency`.
fn money(value: Option<&Value>) -> Option<(f64, &str)> {
    let object = value?.as_object()?;
    let amount = object.get("amount")?.as_f64()?;
    object.get("amountInt")?.as_f64()?;
    let currency = object.get("currency")?.as_str()?;
    Some((amount, currency))
}

/// `mapDeals`: every well-formed deal (a shop with a string name, two money values, an https url),
/// sorted by numeric price and then by the store name as `localeCompare` orders it. The sort is
/// stable, as JS's is.
pub fn map_deals(deals: &Value) -> Vec<Deal> {
    let Some(list) = deals.as_array() else {
        return Vec::new();
    };
    let mut out: Vec<Deal> = Vec::new();
    for deal in list {
        let Some(object) = deal.as_object() else {
            continue;
        };
        let Some(shop) = object.get("shop").and_then(Value::as_object) else {
            continue;
        };
        let Some(store_name) = shop.get("name").and_then(Value::as_str) else {
            continue;
        };
        let (Some((price, currency)), Some((regular, _))) =
            (money(object.get("price")), money(object.get("regular")))
        else {
            continue;
        };
        // A non-https url drops the deal; it is never rewritten.
        let Some(url) = object.get("url").and_then(Value::as_str) else {
            continue;
        };
        if !is_https_url(url) {
            continue;
        }
        let store_id = js_string(shop.get("id"));
        out.push(Deal {
            runner: runner_for(&store_id),
            store_id,
            store_name: store_name.to_string(),
            price: js_number_text(price),
            retail_price: js_number_text(regular),
            currency_code: currency.to_string(),
            buy_url: url.to_string(),
        });
    }
    out.sort_by(|a, b| {
        let by_price = a
            .price
            .parse::<f64>()
            .unwrap_or(f64::NAN)
            .partial_cmp(&b.price.parse::<f64>().unwrap_or(f64::NAN));
        match by_price {
            Some(std::cmp::Ordering::Equal) | None => locale_compare(&a.store_name, &b.store_name),
            Some(order) => order,
        }
    });
    out
}

/// `pricesById`: the deals of each game in a `/games/prices/v3` answer, in answer order. A repeated
/// id keeps its first position and takes the later deals, as a JS `Map` does.
pub fn prices_by_id(json: &Value) -> Vec<(String, Vec<Deal>)> {
    let mut by_id: Vec<(String, Vec<Deal>)> = Vec::new();
    let Some(list) = json.as_array() else {
        return by_id;
    };
    for raw in list {
        let Some(object) = raw.as_object() else {
            continue;
        };
        let Some(id) = object
            .get("id")
            .and_then(Value::as_str)
            .filter(|i| is_uuid(i))
        else {
            continue;
        };
        let deals = map_deals(object.get("deals").unwrap_or(&Value::Null));
        match by_id.iter_mut().find(|(existing, _)| existing == id) {
            Some(slot) => slot.1 = deals,
            None => by_id.push((id.to_string(), deals)),
        }
    }
    by_id
}

/// The first of `banner300`, `banner145`, `boxart` that is present and not null, else `""` (JS `??`
/// chain). The thumbnail box is sized to `banner300`'s ratio, so the two change together (G-47-7).
fn thumb_of(item: &serde_json::Map<String, Value>) -> Json {
    let assets = item.get("assets").and_then(Value::as_object);
    ["banner300", "banner145", "boxart"]
        .iter()
        .find_map(|name| {
            assets
                .and_then(|a| a.get(*name))
                .filter(|v| !v.is_null())
                .map(|v| Json::from(v.clone()))
        })
        .unwrap_or_else(|| Json::Str(String::new()))
}

/// A search hit that passed the filter: a uuid `id` and a string `title`.
pub struct SearchItem<'a> {
    pub id: &'a str,
    pub title: &'a str,
    object: &'a serde_json::Map<String, Value>,
}

/// The items of a `/games/search/v1` answer a row may be built from, in answer order.
pub fn search_items(found: &Value) -> Vec<SearchItem<'_>> {
    let Some(list) = found.as_array() else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|item| {
            let object = item.as_object()?;
            let id = object.get("id")?.as_str().filter(|i| is_uuid(i))?;
            let title = object.get("title")?.as_str()?;
            Some(SearchItem { id, title, object })
        })
        .collect()
}

/// `mapSearchResults`: search order, one row per game from its cheapest deal, a game with no deal
/// dropped (D-11). A row is `gameId, title, thumb, cheapestPrice, currencyCode, buyUrl`.
pub fn map_search_results(items: &[SearchItem<'_>], priced: &[(String, Vec<Deal>)]) -> Vec<Json> {
    let mut rows = Vec::new();
    for item in items {
        let Some(cheapest) = priced
            .iter()
            .find(|(id, _)| id == item.id)
            .and_then(|(_, deals)| deals.first())
        else {
            continue;
        };
        let mut row = Obj::new();
        row.insert_js("gameId", Json::Str(item.id.to_string()));
        row.insert_js("title", Json::Str(item.title.to_string()));
        row.insert_js("thumb", thumb_of(item.object));
        row.insert_js("cheapestPrice", Json::Str(cheapest.price.clone()));
        row.insert_js("currencyCode", Json::Str(cheapest.currency_code.clone()));
        row.insert_js("buyUrl", Json::Str(cheapest.buy_url.clone()));
        rows.push(Json::Obj(row));
    }
    rows
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn deal(shop: Value, price: f64, url: &str) -> Value {
        json!({
            "shop": shop,
            "price": {"amount": price, "amountInt": 1, "currency": "USD"},
            "regular": {"amount": 20, "amountInt": 2000, "currency": "USD"},
            "url": url,
        })
    }

    #[test]
    fn uuids_are_the_8_4_4_4_12_hex_shape_in_either_case() {
        assert!(is_uuid("018d937f-1749-73f8-bf5a-8e0aa3cdd9ff"));
        assert!(is_uuid("018D937F-1749-73F8-BF5A-8E0AA3CDD9FF"));
        for bad in [
            "",
            "../not-a-uuid",
            "018d937f-1749-73f8-bf5a-8e0aa3cdd9f",
            "018d937f-1749-73f8-bf5a-8e0aa3cdd9fff",
            "018d937f17494-3f8-bf5a-8e0aa3cdd9ff",
            "018d937g-1749-73f8-bf5a-8e0aa3cdd9ff",
            "018d937f-1749-73f8-bf5a-8e0aa3cdd9ff\n",
        ] {
            assert!(!is_uuid(bad), "{bad:?}");
        }
    }

    #[test]
    fn only_an_https_url_passes_and_it_is_passed_through_byte_for_byte() {
        let url = "https://itad.link/abc/?app=tagwff&x=%7Efoo+bar#frag";
        let deals = map_deals(&json!([
            deal(json!({"id": 61, "name": "Steam"}), 5.0, url),
            deal(json!({"id": 61, "name": "Http"}), 4.0, "http://itad.link/x"),
            deal(json!({"id": 61, "name": "Ftp"}), 4.0, "ftp://itad.link/x"),
            deal(json!({"id": 61, "name": "Junk"}), 4.0, "not a url"),
            deal(json!({"id": 61, "name": "Js"}), 4.0, "javascript:alert(1)"),
        ]));
        assert_eq!(deals.len(), 1);
        assert_eq!(deals[0].buy_url, url);
    }

    #[test]
    fn malformed_deals_are_dropped() {
        let ok = deal(json!({"id": 1, "name": "A"}), 1.0, "https://a/x");
        let mut no_name = ok.clone();
        no_name["shop"] = json!({"id": 1});
        let mut name_not_string = ok.clone();
        name_not_string["shop"] = json!({"id": 1, "name": 5});
        let mut bad_money = ok.clone();
        bad_money["price"] = json!({"amount": "1", "amountInt": 1, "currency": "USD"});
        let mut no_regular = ok.clone();
        no_regular["regular"] = json!(null);
        let mut no_url = ok.clone();
        no_url["url"] = json!(5);
        let deals = map_deals(&json!([
            null,
            5,
            "x",
            [],
            ok,
            no_name,
            name_not_string,
            bad_money,
            no_regular,
            no_url
        ]));
        assert_eq!(deals.len(), 1);
        assert!(map_deals(&json!({"not": "an array"})).is_empty());
        assert!(map_deals(&json!(null)).is_empty());
    }

    #[test]
    fn the_price_is_js_string_of_the_amount_and_the_runner_comes_from_the_shop_id() {
        let deals = map_deals(&json!([
            deal(json!({"id": 61, "name": "Steam"}), 9.99, "https://a/1"),
            deal(json!({"id": "35", "name": "GOG"}), 1e21, "https://a/2"),
            deal(json!({"id": 16, "name": "Epic"}), 0.0000001, "https://a/3"),
            deal(json!({"id": 99, "name": "Other"}), 10.0, "https://a/4"),
        ]));
        let by_name = |n: &str| deals.iter().find(|d| d.store_name == n).unwrap();
        assert_eq!(by_name("Steam").price, "9.99");
        assert_eq!(by_name("Steam").runner, Some("steam"));
        assert_eq!(by_name("GOG").price, "1e+21");
        assert_eq!(by_name("GOG").runner, Some("gog"));
        assert_eq!(by_name("Epic").price, "1e-7");
        assert_eq!(by_name("Epic").runner, Some("legendary"));
        assert_eq!(by_name("Other").price, "10");
        assert_eq!(by_name("Other").runner, None);
        assert_eq!(by_name("Other").retail_price, "20");
    }

    #[test]
    fn a_deal_without_a_mapped_shop_has_no_runner_key() {
        let deals = map_deals(&json!([deal(
            json!({"id": 99, "name": "O"}),
            1.0,
            "https://a/1"
        )]));
        let text = serde_json::to_string(&deals[0].to_json().to_value()).unwrap();
        assert!(!text.contains("runner"), "{text}");
        let mapped = map_deals(&json!([deal(
            json!({"id": 61, "name": "S"}),
            1.0,
            "https://a/1"
        )]));
        assert!(serde_json::to_string(&mapped[0].to_json().to_value())
            .unwrap()
            .contains("\"runner\":\"steam\""));
    }

    #[test]
    fn deals_sort_by_numeric_price_not_text_then_by_store_name() {
        let deals = map_deals(&json!([
            deal(json!({"id": 1, "name": "B"}), 10.0, "https://a/1"),
            deal(json!({"id": 1, "name": "A"}), 9.5, "https://a/2"),
            deal(json!({"id": 1, "name": "Z"}), 2.0, "https://a/3"),
            deal(json!({"id": 1, "name": "a"}), 10.0, "https://a/4"),
        ]));
        let names: Vec<&str> = deals.iter().map(|d| d.store_name.as_str()).collect();
        assert_eq!(names, ["Z", "A", "a", "B"]);
    }

    #[test]
    fn the_sort_is_stable_for_equal_price_and_equal_name() {
        let deals = map_deals(&json!([
            deal(json!({"id": 1, "name": "Same"}), 5.0, "https://a/first"),
            deal(json!({"id": 2, "name": "Same"}), 5.0, "https://a/second"),
        ]));
        assert_eq!(deals[0].buy_url, "https://a/first");
    }

    #[test]
    fn js_string_follows_string_of_a_json_value() {
        assert_eq!(js_string(None), "undefined");
        assert_eq!(js_string(Some(&json!(null))), "null");
        assert_eq!(js_string(Some(&json!(61))), "61");
        assert_eq!(js_string(Some(&json!(1.5))), "1.5");
        assert_eq!(js_string(Some(&json!(true))), "true");
        assert_eq!(js_string(Some(&json!("x"))), "x");
        assert_eq!(js_string(Some(&json!([1, null, "a"]))), "1,,a");
        assert_eq!(js_string(Some(&json!({"a": 1}))), "[object Object]");
    }

    #[test]
    fn prices_by_id_keeps_answer_order_skips_bad_ids_and_a_repeat_takes_the_later_deals() {
        let g1 = "018d937f-012f-73b8-ab2c-898516969e6a";
        let g2 = "018d937f-1212-7232-b23f-a046f6fd4a57";
        let answer = json!([
            {"id": g2, "deals": [deal(json!({"id": 1, "name": "A"}), 1.0, "https://a/g2a")]},
            {"id": "not-a-uuid", "deals": []},
            null,
            {"id": g1, "deals": [deal(json!({"id": 1, "name": "A"}), 1.0, "https://a/g1a")]},
            {"id": g2, "deals": [deal(json!({"id": 1, "name": "A"}), 1.0, "https://a/g2b")]},
        ]);
        let by_id = prices_by_id(&answer);
        assert_eq!(by_id.len(), 2);
        assert_eq!(by_id[0].0, g2);
        assert_eq!(by_id[0].1[0].buy_url, "https://a/g2b");
        assert_eq!(by_id[1].0, g1);
        assert!(prices_by_id(&json!({"x": 1})).is_empty());
    }

    #[test]
    fn the_thumbnail_takes_the_first_present_asset_and_an_empty_string_counts_as_present() {
        let thumb = |assets: Value| {
            let item = json!({"id": "x", "title": "t", "assets": assets});
            thumb_of(item.as_object().unwrap()).to_value()
        };
        assert_eq!(
            thumb(json!({"banner300": "3", "banner145": "1", "boxart": "b"})),
            json!("3")
        );
        assert_eq!(thumb(json!({"banner145": "1", "boxart": "b"})), json!("1"));
        assert_eq!(thumb(json!({"boxart": "b"})), json!("b"));
        assert_eq!(thumb(json!({})), json!(""));
        assert_eq!(thumb(json!(null)), json!(""));
        // `??` only skips null and undefined, so an empty banner300 wins over banner145.
        assert_eq!(thumb(json!({"banner300": "", "banner145": "1"})), json!(""));
        assert_eq!(
            thumb(json!({"banner300": null, "banner145": "1"})),
            json!("1")
        );
    }

    #[test]
    fn search_items_need_a_uuid_id_and_a_string_title_and_rows_need_a_deal() {
        let g1 = "018d937f-012f-73b8-ab2c-898516969e6a";
        let g2 = "018d937f-1212-7232-b23f-a046f6fd4a57";
        let g3 = "018d937f-1749-73f8-bf5a-8e0aa3cdd9ff";
        let found = json!([
            {"id": g1, "title": "One", "assets": {"banner145": "u1"}},
            {"id": "bad", "title": "Bad"},
            {"id": g2, "title": 7},
            null,
            {"id": g3, "title": "Three"},
        ]);
        let items = search_items(&found);
        assert_eq!(items.iter().map(|i| i.id).collect::<Vec<_>>(), [g1, g3]);
        let priced = vec![(
            g1.to_string(),
            map_deals(&json!([deal(
                json!({"id": 1, "name": "A"}),
                3.0,
                "https://a/x"
            )])),
        )];
        let rows = map_search_results(&items, &priced);
        assert_eq!(rows.len(), 1);
        assert_eq!(
            rows[0].to_value(),
            json!({"gameId": g1, "title": "One", "thumb": "u1", "cheapestPrice": "3",
                   "currencyCode": "USD", "buyUrl": "https://a/x"})
        );
        assert!(search_items(&json!({"not": "a list"})).is_empty());
    }
}
