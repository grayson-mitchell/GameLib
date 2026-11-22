//! GOG catalog discounts (Phase 86, SVC-01), ported from `src/backend/discounts/fetchDiscounts.ts`.
//!
//! One operation, [`gog_discounts`]: the discounted games of the GOG catalog for a locale, as the
//! renderer's Discounts screen shows them. The request is the one the TS made and the 86-06 goldens
//! pin (D-10): `GET https://catalog.gog.com/v1/catalog`, the query in `URLSearchParams` order,
//! `User-Agent: HeroicGamesLauncher/<version>`, and `Authorization: Bearer <token>` only when a flag
//! is set and a token exists. Each request has the TS's 15 s timeout.
//!
//! The GOG bearer token is the one input the TS keeps (D-24): it comes from the `gogdl` child process,
//! which stays TypeScript until Phase 92, so the caller collects it and passes it in `token`. It is held
//! in memory for the call, travels only in the `Authorization` header, and never reaches a log line, an
//! error text or a URL (T-86-42).
//!
//! Parity points copied, not fixed (D-03):
//! - page 1 is fetched first; pages 2 to `min(pages, 30)` are then fetched concurrently, a failed page
//!   is logged and skipped, and the pages are merged in page order whatever order they finish in;
//! - products are deduplicated by `id`, the first occurrence wins (the catalog is ordered by dynamic
//!   trending, so a product can sit on two pages);
//! - a flag with no token resets BOTH flags and logs a warning, then the plain catalog is fetched;
//! - an empty result for a locale other than US/en-US/USD is retried once with that fallback locale;
//! - any other failure is logged and answered as an `Err` whose text is what axios threw
//!   (`Request failed with status code N`, `Network Error`, ...), so the renderer sees a rejection.
//!
//! Products are handed on as the catalog sent them: nothing is narrowed or renamed.

use std::future::Future;
use std::pin::Pin;
use std::task::Poll;
use std::time::Duration;

use serde::Deserialize;
use serde_json::Value;

use crate::ctx::InfoCtx;
use crate::http::{HttpError, Request};

/// The catalog endpoint.
pub const CATALOG_URL: &str = "https://catalog.gog.com/v1/catalog";

/// The most pages one call fetches (48 products each).
const MAX_PAGES: u64 = 30;

/// One request's bound (the TS's `timeout: 15000`).
const TIMEOUT: Duration = Duration::from_secs(15);

/// The locale the empty-result retry uses.
const FALLBACK_COUNTRY: &str = "US";
const FALLBACK_LOCALE: &str = "en-US";
const FALLBACK_CURRENCY: &str = "USD";

/// The longest locale component accepted, in UTF-16 code units. A country, a locale tag and a currency
/// code are a few characters; the bound only keeps a hostile caller from growing a URL.
pub const LOCALE_PART_MAX_UTF16: usize = 32;

/// The catalog locale: `{countryCode, locale, currencyCode}`. Unknown fields are rejected.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Locale {
    pub country_code: String,
    pub locale: String,
    pub currency_code: String,
}

impl Locale {
    fn fallback() -> Locale {
        Locale {
            country_code: FALLBACK_COUNTRY.to_string(),
            locale: FALLBACK_LOCALE.to_string(),
            currency_code: FALLBACK_CURRENCY.to_string(),
        }
    }

    fn is_fallback(&self) -> bool {
        self.country_code == FALLBACK_COUNTRY
            && self.currency_code == FALLBACK_CURRENCY
            && self.locale == FALLBACK_LOCALE
    }

    fn within_bounds(&self) -> bool {
        [&self.country_code, &self.locale, &self.currency_code]
            .iter()
            .all(|part| part.encode_utf16().count() <= LOCALE_PART_MAX_UTF16)
    }
}

/// `{locale, hideOwned, wishlistOnly, token}`. `token` is the GOG access token, or `null` when the
/// caller asked for none or there is no signed-in GOG account. Unknown fields are rejected.
#[derive(Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DiscountsArgs {
    pub locale: Locale,
    pub hide_owned: bool,
    pub wishlist_only: bool,
    pub token: Option<String>,
}

impl std::fmt::Debug for DiscountsArgs {
    /// Never the token.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DiscountsArgs")
            .field("locale", &self.locale)
            .field("hide_owned", &self.hide_owned)
            .field("wishlist_only", &self.wishlist_only)
            .finish_non_exhaustive()
    }
}

/// One page's catalog answer: the page count and the products as sent.
struct Page {
    pages: u64,
    products: Vec<Value>,
}

/// The error text axios gave for a request that produced no response. Fixed categories only: the
/// request URL (which carries the locale) and the token never reach it.
fn transport_message(error: &HttpError) -> String {
    match error {
        HttpError::Timeout => format!("timeout of {}ms exceeded", TIMEOUT.as_millis()),
        HttpError::TooLarge => format!(
            "maxContentLength size of {} exceeded",
            crate::http::DEFAULT_MAX_BODY
        ),
        HttpError::Cancelled => "canceled".to_string(),
        HttpError::Network(_) => "Network Error".to_string(),
    }
}

/// The page URL, the query in the order the TS built it: the fixed parameters, `page`, the locale,
/// then `hideOwned` and `wishlist` when set. Written the way `URLSearchParams` writes it.
fn page_url(page: u64, locale: &Locale, hide_owned: bool, wishlist_only: bool) -> String {
    let page = page.to_string();
    let mut pairs: Vec<(&str, &str)> = vec![
        ("limit", "48"),
        ("order", "desc:trending"),
        ("discounted", "eq:true"),
        ("productType", "in:game,pack,dlc"),
        ("page", &page),
        ("countryCode", &locale.country_code),
        ("locale", &locale.locale),
        ("currencyCode", &locale.currency_code),
    ];
    if hide_owned {
        pairs.push(("hideOwned", "true"));
    }
    if wishlist_only {
        pairs.push(("wishlist", "eq:true"));
    }
    format!("{CATALOG_URL}?{}", url_search_params(&pairs))
}

/// `URLSearchParams.toString()`: `application/x-www-form-urlencoded`, so everything but
/// `A-Z a-z 0-9 * - . _` is percent-encoded over UTF-8 and a space is `+`.
fn url_search_params(pairs: &[(&str, &str)]) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let encode = |text: &str, out: &mut String| {
        for byte in text.bytes() {
            match byte {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'*' | b'-' | b'.' | b'_' => {
                    out.push(char::from(byte))
                }
                b' ' => out.push('+'),
                _ => {
                    out.push('%');
                    out.push(char::from(HEX[usize::from(byte >> 4)]));
                    out.push(char::from(HEX[usize::from(byte & 0x0F)]));
                }
            }
        }
    };
    let mut out = String::new();
    for (i, (key, value)) in pairs.iter().enumerate() {
        if i > 0 {
            out.push('&');
        }
        encode(key, &mut out);
        out.push('=');
        encode(value, &mut out);
    }
    out
}

/// One page, or the error text the TS threw.
async fn fetch_page(
    ctx: &InfoCtx,
    page: u64,
    locale: &Locale,
    hide_owned: bool,
    wishlist_only: bool,
    token: Option<&str>,
) -> Result<Page, String> {
    let mut request = Request::get(page_url(page, locale, hide_owned, wishlist_only), TIMEOUT)
        .header("Accept", "application/json, text/plain, */*")
        .header(
            "User-Agent",
            &format!("HeroicGamesLauncher/{}", ctx.app_version),
        );
    // The TS sent the header only when a flag was set AND a token existed.
    if let Some(token) = token.filter(|t| !t.is_empty()) {
        if hide_owned || wishlist_only {
            request = request.header("Authorization", &format!("Bearer {token}"));
        }
    }
    let response = ctx
        .http
        .send(request)
        .await
        .map_err(|e| transport_message(&e))?;
    if !(200..300).contains(&response.status) {
        return Err(format!(
            "Request failed with status code {}",
            response.status
        ));
    }
    // axios parses a JSON-looking body; the TS then read `.pages` and `.products` off it. A body that
    // is not an object with a `products` list is a failure on the first page (`first.products` is
    // read) and an empty page elsewhere; both are reported with the TS's own wording.
    let body: Value = serde_json::from_slice(&response.body).unwrap_or(Value::Null);
    let Some(object) = body.as_object() else {
        return Err("Cannot read properties of undefined (reading 'pages')".to_string());
    };
    let pages = object.get("pages").and_then(Value::as_u64).unwrap_or(0);
    let products = match object.get("products") {
        Some(Value::Array(items)) => items.clone(),
        _ => Vec::new(),
    };
    Ok(Page { pages, products })
}

/// Awaits every future and answers their outputs in input order, polling them together so they run
/// concurrently on one task (`Promise.all` for a list of the same future type; no `futures` crate).
async fn join_all<F: Future>(futures: Vec<F>) -> Vec<F::Output> {
    let mut slots: Vec<Option<Pin<Box<F>>>> =
        futures.into_iter().map(|f| Some(Box::pin(f))).collect();
    let mut done: Vec<Option<F::Output>> = slots.iter().map(|_| None).collect();
    std::future::poll_fn(move |cx| {
        let mut pending = false;
        for (slot, out) in slots.iter_mut().zip(done.iter_mut()) {
            if let Some(future) = slot {
                match future.as_mut().poll(cx) {
                    Poll::Ready(value) => {
                        *out = Some(value);
                        *slot = None;
                    }
                    Poll::Pending => pending = true,
                }
            }
        }
        if pending {
            Poll::Pending
        } else {
            Poll::Ready(done.iter_mut().filter_map(Option::take).collect::<Vec<_>>())
        }
    })
    .await
}

/// Every discounted product for `locale`: page 1, then pages 2 to the cap together, merged in page
/// order and deduplicated by `id` (first wins).
async fn fetch_all(
    ctx: &InfoCtx,
    locale: &Locale,
    hide_owned: bool,
    wishlist_only: bool,
    token: Option<&str>,
) -> Result<Vec<Value>, String> {
    let first = fetch_page(ctx, 1, locale, hide_owned, wishlist_only, token).await?;
    let total_pages = first.pages.min(MAX_PAGES);
    if total_pages <= 1 {
        return Ok(first.products);
    }
    let rest = join_all(
        (2..=total_pages)
            .map(|page| async move {
                match fetch_page(ctx, page, locale, hide_owned, wishlist_only, token).await {
                    Ok(page) => page.products,
                    Err(message) => {
                        ctx.note(&format!(
                            "gog discounts: page {page} failed ({message}); skipped"
                        ));
                        Vec::new()
                    }
                }
            })
            .collect(),
    )
    .await;
    let mut all = first.products;
    all.extend(rest.into_iter().flatten());
    // `seen` keys on the id as JSON text, so `1` and `"1"` stay two products as in a JS `Set`.
    let mut seen = std::collections::HashSet::new();
    all.retain(|product| seen.insert(product.get("id").map(Value::to_string)));
    Ok(all)
}

/// The Discounts screen's list: `[product]` as the catalog sent it. `Err` is the text of what failed
/// (the renderer sees a rejection), or `info_gog_discounts:bad-args`.
pub async fn gog_discounts(ctx: &InfoCtx, args: DiscountsArgs) -> Result<Value, String> {
    const OP: &str = "info_gog_discounts";
    if !args.locale.within_bounds() {
        return Err(format!("{OP}:bad-args"));
    }
    let DiscountsArgs {
        locale,
        mut hide_owned,
        mut wishlist_only,
        token,
    } = args;
    // A flag needs the token. With none, the TS dropped both flags and went on with the plain catalog.
    if (hide_owned || wishlist_only) && token.is_none() {
        hide_owned = false;
        wishlist_only = false;
        ctx.note("WARN: gog discounts: no GOG credentials, fetching without the account filters");
    }
    let token = token.as_deref();
    let outcome = async {
        let products = fetch_all(ctx, &locale, hide_owned, wishlist_only, token).await?;
        if !products.is_empty() || locale.is_fallback() {
            return Ok(products);
        }
        ctx.note("gog discounts: no discounts for the locale, retrying with US/USD");
        fetch_all(ctx, &Locale::fallback(), hide_owned, wishlist_only, token).await
    }
    .await;
    match outcome {
        Ok(products) => Ok(Value::Array(products)),
        Err(message) => {
            ctx.note(&format!("gog discounts: the request failed ({message})"));
            Err(message)
        }
    }
}
