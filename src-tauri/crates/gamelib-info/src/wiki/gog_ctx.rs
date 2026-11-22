//! The two unauthenticated GOG requests the wiki lookups need (Phase 86, SVC-01, D-23). In the TS they went
//! through the GOG library manager (`getGamesdbData`, and `getExtraInfo` for the store link), which
//! carries the logged-in session and the `gog_api_info` cache. Rust makes them itself, because neither
//! needs a login:
//!
//! - [`gamesdb_release`]: `GET https://gamesdb.gog.com/platforms/<store>/external_releases/<id>`, the
//!   source of a non-Steam title's Steam id;
//! - [`gog_store_url`]: `GET https://api.gog.com/v2/games/<id>?locale=en-US`, then the store link
//!   `_links.store.href` rewritten to the affiliate host (`af.gog.com`, `as=1838482841`) the way
//!   `GOGGame.getExtraInfo` rewrote it.
//!
//! Two differences from the TS, both D-23 and both filed as todos:
//! - nothing is written to GOG's `gog_api_info` cache (the TS stored each GamesDB answer there, keyed by
//!   store and id, with its ETag), nor to any other store: these functions only read the network;
//! - `getExtraInfo` also asked for the system-requirements array and the product changelog before
//!   reading the store link. Rust skips both requests (they are the recorded `tsOnly` exchanges), so a
//!   malformed `_embedded` block, which made the TS reject, no longer does.
//!
//! The headers are the TS `axiosClient`'s: the `GameLib/<version>` User-Agent and nothing else (no
//! `If-None-Match`, certificate or token: the TS sent those only for an authenticated, non-forced call).

use serde_json::Value;
use url::Url;

use crate::ctx::InfoCtx;
use crate::js::{opt_prop, prop, to_js_text, truthy};

use super::{get_data, user_agent, Thrown};

/// The affiliate id `getExtraInfo` puts on every store link.
const AFFILIATE: &str = "1838482841";

/// `GOGLibraryManager.getGamesdbData(store, id, true)`: the answer parsed as JSON. `None` for every
/// failure the TS turned into "no data": a failed request, any non-2xx status (the 404 and the rest),
/// and an answer that is not an object or an array (the TS assigned `data.etag` and a text or `null`
/// cannot take it).
pub async fn gamesdb_release(ctx: &InfoCtx, store: &str, id: &str) -> Option<Value> {
    let url = format!("https://gamesdb.gog.com/platforms/{store}/external_releases/{id}");
    match get_data(ctx, url, &user_agent(ctx)).await {
        Ok(data @ (Value::Object(_) | Value::Array(_))) => Some(data),
        Ok(_) => {
            ctx.note("gamesdb answer is not an object");
            None
        }
        Err(thrown) => {
            ctx.note(&format!("gamesdb request failed ({})", thrown.word()));
            None
        }
    }
}

/// The GOG store link of a game, as `getExtraInfo` made it for the HowLongToBeat page: `Ok(None)` when
/// the request failed or the answer carries no link (the TS answered `storeUrl: undefined`), `Err` when
/// the answer has a `_links` block with no `store` (a property read of `undefined`: the TS rejected, and
/// so did the whole wiki lookup) or a link that is not a URL.
pub async fn gog_store_url(ctx: &InfoCtx, id: &str) -> Result<Option<String>, Thrown> {
    // `getGamesData(appName)`: `locale=en-US`, any failure is `null`.
    let url = format!("https://api.gog.com/v2/games/{id}?locale=en-US");
    let data = match get_data(ctx, url, &user_agent(ctx)).await {
        Ok(data) => data,
        Err(thrown) => {
            ctx.note(&format!("gog games request failed ({})", thrown.word()));
            return Ok(None);
        }
    };
    // `gamesData?._links?.store.href`: a missing or null `_links` ends the chain, a `store` that is
    // missing or null throws.
    let Some(links) = opt_prop(Some(&data), "_links")?.filter(|links| !links.is_null()) else {
        return Ok(None);
    };
    let href = prop(prop(Some(links), "store")?, "href")?;
    let Some(href) = href.filter(|href| truthy(href)) else {
        return Ok(None);
    };
    affiliate_link(&to_js_text(href)).map(Some)
}

/// `const storeUrl = new URL(href); storeUrl.hostname = 'af.gog.com'; storeUrl.searchParams.set('as',
/// '1838482841'); storeUrl.toString()`: the host replaced (the port stays), the first `as` parameter set
/// and the others removed, and the whole query written out again in the form-urlencoded way
/// (`URLSearchParams` serialisation).
fn affiliate_link(href: &str) -> Result<String, Thrown> {
    let mut url = Url::parse(href).map_err(|_| Thrown::Shape)?;
    url.set_host(Some("af.gog.com"))
        .map_err(|_| Thrown::Shape)?;
    let mut pairs: Vec<(String, String)> = url
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    match pairs.iter().position(|(k, _)| k == "as") {
        Some(first) => {
            pairs[first].1 = AFFILIATE.to_string();
            let mut seen = 0;
            pairs.retain(|(k, _)| {
                let keep = k != "as" || seen == 0;
                if k == "as" {
                    seen += 1;
                }
                keep
            });
        }
        None => pairs.push(("as".to_string(), AFFILIATE.to_string())),
    }
    url.query_pairs_mut().clear().extend_pairs(&pairs);
    Ok(url.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_store_link_goes_to_the_affiliate_host_with_the_affiliate_id() {
        assert_eq!(
            affiliate_link("https://www.gog.com/en/game/cyberpunk_2077").unwrap(),
            "https://af.gog.com/en/game/cyberpunk_2077?as=1838482841"
        );
    }

    /// Each expectation is what `URL` and `searchParams.set` gave in node for the same input.
    #[test]
    fn an_existing_query_is_kept_rewritten_and_as_is_set_once() {
        assert_eq!(
            affiliate_link("https://www.gog.com/en/game/x?pp=1&as=5&q=a%20b&as=6").unwrap(),
            "https://af.gog.com/en/game/x?pp=1&as=1838482841&q=a+b"
        );
        assert_eq!(
            affiliate_link("https://www.gog.com:8443/game/x?q=1#frag").unwrap(),
            "https://af.gog.com:8443/game/x?q=1&as=1838482841#frag"
        );
    }

    #[test]
    fn a_link_that_is_not_a_url_is_a_shape_error() {
        assert_eq!(affiliate_link("not a url"), Err(Thrown::Shape));
        assert_eq!(affiliate_link("/en/game/x"), Err(Thrown::Shape));
    }
}
