//! IsThereAnyDeal store search (Phase 86, SVC-01), ported from `src/backend/storeSearch/itad.ts`,
//! `itadCache.ts`, `itadCoverage.ts` and the `handlers.ts` rethrow contract.
//!
//! The requests are the ones the TS made and the 86-07 goldens pin (D-10): `GET /games/search/v1`
//! with `title`, `results` and `key` (written the way axios writes a query), `POST /games/prices/v3`
//! with `country` and `key` and the gid list as the JSON body, and the keyless `POST
//! /lookup/id/shop/61/v1` in batches of 200. The caches are `itad_prices` and `itad_steam_gids`
//! through [`CacheView`] with the TS entry rules on top ([`cache`]).
//!
//! Error contract kept (D-14 of Phase 20): a failure is the fixed string `[storeSearch:<code>]
//! <endpoint> <status|none>`, which the renderer turns into its provider-failed state by the marker
//! alone. A 429 closes the in-memory [`gate::ItadGate`] from `Retry-After` and serves a stale entry
//! with `cachedAt` when there is one, as a network error or a 5xx does; a 401 or 403 sent with the
//! user key marks it rejected for the session and retries once with the built-in key.
//!
//! The key travels only as the `key` query parameter. It is never put in a log line, an error string
//! or a fixture: the HTTP seam drops the URL from every transport error ([`crate::http`]), and a
//! failure is reduced to its endpoint and status here (Pitfall 10, T-28-04, T-86-35).

pub mod cache;
pub mod collate;
pub mod coverage;
pub mod gate;
pub mod mapping;

use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::cache_view::{CacheView, ITAD_PRICES};
use crate::ctx::InfoCtx;
use crate::http::{axios_query, Request};
use crate::secrets::{KeySource, ResolvedKey};
use gamelib_store::json::{Json, Obj};

use cache::{
    deals_cache_key, parse_retry_after, read_entry, search_cache_key, write_price_entry, Entry,
    FRESH_MS,
};
use coverage::{FALLBACK_COUNTRY, PRICED_COUNTRIES, SEARCH_RESULTS_PARAM, SEARCH_RESULT_COUNT};
use mapping::{map_search_results, prices_by_id, search_items, Deal};

const ITAD_BASE: &str = "https://api.isthereanydeal.com";
/// One request's bound, as `REQUEST_TIMEOUT_MS` in TS.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

/// The renderer-facing bounds (the zod schemas they replace), in UTF-16 code units. The native decode
/// in the shell checks them first; the crate checks them again.
pub const QUERY_MAX_UTF16: usize = 256;
pub const COUNTRY_MAX_UTF16: usize = 16;

/// The three error codes and their fixed markers (`STORE_SEARCH_ERROR_MARKER`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Code {
    RateLimited,
    NotConfigured,
    Provider,
}

impl Code {
    pub fn marker(self) -> &'static str {
        match self {
            Code::RateLimited => "[storeSearch:rateLimited]",
            Code::NotConfigured => "[storeSearch:notConfigured]",
            Code::Provider => "[storeSearch:provider]",
        }
    }
}

/// `new StoreSearchError(code, endpoint, status)`'s message: the marker first (IPC flattens errors
/// to strings, so it is the stable code), an endpoint label and a status. No URL, no key.
pub fn error_message(code: Code, endpoint: &str, status: Option<u16>) -> String {
    match status {
        Some(status) => format!("{} {endpoint} {status}", code.marker()),
        None => format!("{} {endpoint} none", code.marker()),
    }
}

/// Why a step failed. `Typed` is TS's `StoreSearchError` (it has no `response`, so it never counts as
/// an HTTP status when a failure is classified); `Http` is a failed request, `status` `None` for a
/// transport failure.
#[derive(Debug)]
enum Fail {
    Typed {
        code: Code,
        endpoint: &'static str,
        status: Option<u16>,
    },
    Http {
        status: Option<u16>,
        retry_after: Option<String>,
    },
}

impl Fail {
    /// TS `statusOf`: the HTTP status of a failed call, `None` for a network error or a typed error.
    fn status(&self) -> Option<u16> {
        match self {
            Fail::Http { status, .. } => *status,
            Fail::Typed { .. } => None,
        }
    }

    /// `isStaleCoverable`: a rate limit, a network error or a 5xx (a typed error counts as no status).
    fn is_stale_coverable(&self) -> bool {
        self.status().map_or(true, |s| s == 429 || s >= 500)
    }

    /// `toStoreSearchError(endpoint, err).message`.
    fn into_message(self, endpoint: &'static str) -> String {
        match self {
            Fail::Typed {
                code,
                endpoint,
                status,
            } => error_message(code, endpoint, status),
            Fail::Http { status, .. } => {
                let code = if status == Some(429) {
                    Code::RateLimited
                } else {
                    Code::Provider
                };
                error_message(code, endpoint, status)
            }
        }
    }
}

fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

/// `{query, country?}`: a search term and an optional country. Unknown fields are rejected.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SearchArgs {
    pub query: String,
    #[serde(default)]
    pub country: Option<String>,
}

/// `normalizeCountry`: only an upper-case ISO 3166-1 alpha-2 shape is taken as given, anything else
/// prices as US (RESEARCH D3).
fn normalize_country(country: Option<&str>) -> &str {
    match country {
        Some(c) if c.len() == 2 && c.bytes().all(|b| b.is_ascii_uppercase()) => c,
        _ => FALLBACK_COUNTRY,
    }
}

/// D-13: a country ITAD does not price in its own currency is priced as the fallback.
fn priced_country_for(requested: &str) -> &str {
    if PRICED_COUNTRIES.contains(&requested) {
        requested
    } else {
        FALLBACK_COUNTRY
    }
}

fn user_agent(ctx: &InfoCtx) -> String {
    format!("GameLib/{}", ctx.app_version)
}

/// A cache opened through the host, or `None` when its file cannot be opened (a damaged file is
/// never overwritten): the search then runs uncached rather than failing.
fn open_cache(ctx: &InfoCtx) -> Option<CacheView> {
    CacheView::open(
        &ctx.host,
        &ctx.paths.user_data,
        ITAD_PRICES,
        Arc::clone(&ctx.clock),
    )
    .ok()
}

fn read(view: &Option<CacheView>, key: &str) -> Option<Entry> {
    view.as_ref().and_then(|v| read_entry(v, key))
}

fn write_price(view: &Option<CacheView>, key: &str, data: Json, now: u64) {
    if let Some(view) = view {
        write_price_entry(view, key, data, now);
    }
}

// --- keys -------------------------------------------------------------------------------------

/// Key precedence (D-02, D-05): the user key (set, and not rejected this session), then
/// `GAMELIB_ITAD_API_KEY`, then the baked key. D-03: no key at all is a typed error, not a crash.
fn resolve_key(ctx: &InfoCtx, endpoint: &'static str) -> Result<ResolvedKey, Fail> {
    ctx.itad_key.effective(ctx).ok_or(Fail::Typed {
        code: Code::NotConfigured,
        endpoint,
        status: None,
    })
}

/// Runs `request` with the resolved key. D-06: when ITAD answers 401 or 403 to a request made with
/// the USER key, the key is marked rejected for the session and that same request is retried once
/// with the built-in key (or fails `notConfigured` when there is none). A rejection of a built-in key
/// is not retried. `first` lets a caller that already resolved the key (to fail early) reuse it.
async fn with_key<T, F, Fut>(
    ctx: &InfoCtx,
    endpoint: &'static str,
    first: Option<ResolvedKey>,
    mut request: F,
) -> Result<T, Fail>
where
    F: FnMut(String) -> Fut,
    Fut: Future<Output = Result<T, Fail>>,
{
    let resolved = match first {
        Some(resolved) => resolved,
        None => resolve_key(ctx, endpoint)?,
    };
    match request(resolved.key.clone()).await {
        Ok(value) => Ok(value),
        Err(fail) => {
            if resolved.source != KeySource::User || !matches!(fail.status(), Some(401 | 403)) {
                return Err(fail);
            }
            ctx.itad_key.mark_rejected();
            let fallback = resolve_key(ctx, endpoint)?;
            request(fallback.key).await
        }
    }
}

// --- network ----------------------------------------------------------------------------------

/// The body as axios hands it over: parsed JSON, or the text when it is not JSON.
fn parse_body(body: &[u8]) -> Value {
    serde_json::from_slice(body)
        .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(body).into()))
}

/// Sends `request`; a status outside 2xx or a transport failure is a [`Fail::Http`] that carries no
/// URL (the key rides in it).
async fn send(ctx: &InfoCtx, request: Request) -> Result<Value, Fail> {
    let response = ctx.http.send(request).await.map_err(|_| Fail::Http {
        status: None,
        retry_after: None,
    })?;
    if !(200..300).contains(&response.status) {
        let retry_after = response
            .headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case("retry-after"))
            .map(|(_, value)| value.clone());
        return Err(Fail::Http {
            status: Some(response.status),
            retry_after,
        });
    }
    Ok(parse_body(&response.body))
}

fn get_search_request(ctx: &InfoCtx, query: &str, key: &str) -> Request {
    let count = SEARCH_RESULT_COUNT.to_string();
    let url = format!(
        "{ITAD_BASE}/games/search/v1?{}",
        axios_query(&[
            ("title", query),
            (SEARCH_RESULTS_PARAM, &count),
            ("key", key)
        ])
    );
    Request::get(url, REQUEST_TIMEOUT)
        .header("Accept", "application/json, text/plain, */*")
        .header("User-Agent", &user_agent(ctx))
}

/// A JSON `POST` the way axios sends an array body.
fn post_request(ctx: &InfoCtx, url: String, body: &[String]) -> Request {
    let mut request = Request::new(crate::http::Method::Post, url, REQUEST_TIMEOUT)
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/json")
        .header("User-Agent", &user_agent(ctx));
    // A list of strings always serialises.
    request.body = Some(serde_json::to_vec(body).unwrap_or_default());
    request
}

type ByGame = Vec<(String, Vec<Deal>)>;

async fn prices_call(
    ctx: &InfoCtx,
    key: &str,
    gids: &[String],
    country: &str,
) -> Result<ByGame, Fail> {
    let url = format!(
        "{ITAD_BASE}/games/prices/v3?{}",
        axios_query(&[("country", country), ("key", key)])
    );
    let data = send(ctx, post_request(ctx, url, gids)).await?;
    Ok(prices_by_id(&data))
}

/// `POST /games/prices/v3`. For a country other than the fallback, a 4xx (not an auth or rate error)
/// is retried once as the fallback country (ITAD answers some countries with a 4xx) and the returned
/// `pricedCountry` says so (D-13).
async fn prices_with_key(
    ctx: &InfoCtx,
    key: &str,
    gids: &[String],
    country: &str,
) -> Result<(ByGame, String), Fail> {
    match prices_call(ctx, key, gids, country).await {
        Ok(by_id) => Ok((by_id, country.to_string())),
        Err(fail) => {
            let fallbackable = country != FALLBACK_COUNTRY
                && matches!(fail.status(), Some(s) if (400..500).contains(&s) && !matches!(s, 401 | 403 | 429));
            if !fallbackable {
                return Err(fail);
            }
            let by_id = prices_call(ctx, key, gids, FALLBACK_COUNTRY).await?;
            Ok((by_id, FALLBACK_COUNTRY.to_string()))
        }
    }
}

async fn post_prices(
    ctx: &InfoCtx,
    endpoint: &'static str,
    gids: &[String],
    country: &str,
    first: Option<ResolvedKey>,
) -> Result<(ByGame, String), Fail> {
    with_key(ctx, endpoint, first, |key| async move {
        prices_with_key(ctx, &key, gids, country).await
    })
    .await
}

/// Caches one deals entry per gid so expanding a row is a cache hit (Pitfall 8).
fn cache_deals(
    prices: &Option<CacheView>,
    countries: &[&str],
    by_id: &[(String, Vec<Deal>)],
    now: u64,
) {
    for (gid, deals) in by_id {
        let mut seen: Vec<&str> = Vec::new();
        for country in countries {
            if seen.contains(country) {
                continue;
            }
            seen.push(country);
            write_price(
                prices,
                &deals_cache_key(country, gid),
                mapping::deals_json(deals),
                now,
            );
        }
    }
}

/// A 429 closes the gate from its `Retry-After` (clamped 1 s to 15 min, 60 s when absent).
fn note_rate_limit(ctx: &InfoCtx, fail: &Fail) {
    if let Fail::Http {
        status: Some(429),
        retry_after,
    } = fail
    {
        let now = ctx.clock.now_ms();
        ctx.itad_gate
            .block(parse_retry_after(retry_after.as_deref(), now), now);
    }
}

// --- search -----------------------------------------------------------------------------------

/// A cached search answer.
struct SearchHit {
    results: Vec<Json>,
    priced_country: String,
    fetched_at: Option<Json>,
    fresh: bool,
}

/// `readTyped(store, key, now, isSearchPayload)`: the entry when its data is `{results: [], pricedCountry: ""}`.
fn read_search_hit(prices: &Option<CacheView>, key: &str, now: u64) -> Option<SearchHit> {
    let entry = read(prices, key)?;
    let fresh = entry.is_fresh(now, FRESH_MS);
    let Some(Json::Obj(data)) = entry.data else {
        return None;
    };
    let (Some(Json::Arr(results)), Some(Json::Str(priced))) =
        (data.get("results"), data.get("pricedCountry"))
    else {
        return None;
    };
    Some(SearchHit {
        results: results.clone(),
        priced_country: priced.clone(),
        fetched_at: entry.fetched_at,
        fresh,
    })
}

/// The row with `cachedAt` set to the entry's `fetchedAt` (`{ ...r, cachedAt }`).
fn with_cached_at(row: &Json, fetched_at: &Option<Json>) -> Json {
    let Json::Obj(object) = row else {
        return row.clone();
    };
    let mut copy: Obj = object.clone();
    match fetched_at {
        Some(stamp) => {
            copy.insert_js("cachedAt", stamp.clone());
        }
        // `cachedAt: undefined` is not serialised, and it replaces any `cachedAt` the row had.
        None => {
            copy.remove("cachedAt");
        }
    }
    Json::Obj(copy)
}

fn response_value(results: Vec<Json>, priced_country: &str) -> Value {
    json!({
        "results": Json::Arr(results).to_value(),
        "pricedCountry": priced_country,
    })
}

fn serve_stale_search(hit: &SearchHit) -> Value {
    response_value(
        hit.results
            .iter()
            .map(|row| with_cached_at(row, &hit.fetched_at))
            .collect(),
        &hit.priced_country,
    )
}

fn search_payload(results: Vec<Json>, priced_country: &str) -> Json {
    let mut data = Obj::new();
    data.insert_js("results", Json::Arr(results));
    data.insert_js("pricedCountry", Json::Str(priced_country.to_string()));
    Json::Obj(data)
}

/// The network half of a search: the search request, then the price lookup, then the cache writes.
async fn search_remote(
    ctx: &InfoCtx,
    prices: &Option<CacheView>,
    query: &str,
    country: &str,
    cache_key: &str,
    resolved: ResolvedKey,
) -> Result<Value, Fail> {
    let found = with_key(ctx, "search", Some(resolved), |key| async move {
        send(ctx, get_search_request(ctx, query, &key)).await
    })
    .await?;
    let items = search_items(&found);
    if items.is_empty() {
        write_price(
            prices,
            cache_key,
            search_payload(Vec::new(), country),
            ctx.clock.now_ms(),
        );
        return Ok(response_value(Vec::new(), country));
    }
    // Resolved afresh: a rejected user key from the search call must not be reused here.
    let gids: Vec<String> = items.iter().map(|i| i.id.to_string()).collect();
    let (by_id, priced_country) = post_prices(ctx, "search", &gids, country, None).await?;
    let rows = map_search_results(&items, &by_id);
    let now = ctx.clock.now_ms();
    write_price(
        prices,
        cache_key,
        search_payload(rows.clone(), &priced_country),
        now,
    );
    cache_deals(prices, &[country, &priced_country], &by_id, now);
    Ok(response_value(rows, &priced_country))
}

/// `searchGames` (through `handleSearchStores`): rows for a title, one per game from its cheapest
/// deal. `Err` is the fixed `[storeSearch:<code>] <endpoint> <status>` string, or `<op>:bad-args`.
pub async fn search(ctx: &InfoCtx, args: SearchArgs) -> Result<Value, String> {
    const OP: &str = "info_itad_search";
    if utf16_len(&args.query) > QUERY_MAX_UTF16
        || args
            .country
            .as_deref()
            .is_some_and(|c| utf16_len(c) > COUNTRY_MAX_UTF16)
    {
        return Err(format!("{OP}:bad-args"));
    }
    let country = priced_country_for(normalize_country(args.country.as_deref())).to_string();
    let query = args.query;
    let prices = open_cache(ctx);
    let cache_key = search_cache_key(&country, &query);
    let hit = read_search_hit(&prices, &cache_key, ctx.clock.now_ms());
    if let Some(hit) = hit.as_ref().filter(|h| h.fresh) {
        return Ok(response_value(hit.results.clone(), &hit.priced_country));
    }
    if ctx.itad_gate.is_blocked(ctx.clock.now_ms()) {
        return match &hit {
            Some(hit) => Ok(serve_stale_search(hit)),
            None => Err(error_message(Code::RateLimited, "search", Some(429))),
        };
    }
    let resolved = resolve_key(ctx, "search").map_err(|fail| fail.into_message("search"))?;
    ctx.itad_gate
        .single_flight(&cache_key, async {
            match search_remote(ctx, &prices, &query, &country, &cache_key, resolved).await {
                Ok(value) => Ok(value),
                Err(fail) => {
                    note_rate_limit(ctx, &fail);
                    if fail.is_stale_coverable() {
                        if let Some(hit) = &hit {
                            return Ok(serve_stale_search(hit));
                        }
                    }
                    Err(fail.into_message("search"))
                }
            }
        })
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_error_message_is_the_marker_the_endpoint_and_the_status() {
        assert_eq!(
            error_message(Code::Provider, "search", Some(502)),
            "[storeSearch:provider] search 502"
        );
        assert_eq!(
            error_message(Code::NotConfigured, "deals", None),
            "[storeSearch:notConfigured] deals none"
        );
        assert_eq!(
            error_message(Code::RateLimited, "search", Some(429)),
            "[storeSearch:rateLimited] search 429"
        );
    }

    #[test]
    fn a_country_is_taken_only_as_two_upper_case_ascii_letters_else_it_prices_as_us() {
        for (given, want) in [
            (Some("AU"), "AU"),
            (Some("us"), "US"),
            (Some("usa"), "US"),
            (Some("ZZ"), "ZZ"),
            (Some("É1"), "US"),
            (Some(""), "US"),
            (None, "US"),
        ] {
            assert_eq!(normalize_country(given), want, "{given:?}");
        }
        assert_eq!(priced_country_for("ZZ"), "US");
        assert_eq!(priced_country_for("AU"), "AU");
    }

    #[test]
    fn a_failure_is_classified_as_ts_did() {
        let http = |status: Option<u16>| Fail::Http {
            status,
            retry_after: None,
        };
        assert!(http(None).is_stale_coverable());
        assert!(http(Some(429)).is_stale_coverable());
        assert!(http(Some(500)).is_stale_coverable());
        assert!(http(Some(502)).is_stale_coverable());
        assert!(!http(Some(400)).is_stale_coverable());
        assert!(!http(Some(401)).is_stale_coverable());
        assert!(!http(Some(404)).is_stale_coverable());
        // A StoreSearchError has no `response`, so it counts as having no status.
        let typed = Fail::Typed {
            code: Code::NotConfigured,
            endpoint: "search",
            status: None,
        };
        assert!(typed.is_stale_coverable());
        assert_eq!(
            http(Some(429)).into_message("search"),
            "[storeSearch:rateLimited] search 429"
        );
        assert_eq!(
            http(Some(403)).into_message("deals"),
            "[storeSearch:provider] deals 403"
        );
        assert_eq!(
            http(None).into_message("search"),
            "[storeSearch:provider] search none"
        );
    }

    #[test]
    fn the_search_decode_is_strict() {
        let ok: SearchArgs = serde_json::from_value(json!({"query": "x"})).unwrap();
        assert_eq!(ok.country, None);
        let with: SearchArgs =
            serde_json::from_value(json!({"query": "x", "country": null})).unwrap();
        assert_eq!(with.country, None);
        assert!(serde_json::from_value::<SearchArgs>(json!({"query": "x", "extra": 1})).is_err());
        assert!(serde_json::from_value::<SearchArgs>(json!({"country": "US"})).is_err());
    }
}
