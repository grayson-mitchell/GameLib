//! AppleGamingWiki (Phase 86, SVC-01), ported from `src/backend/wiki_game_info/applegamingwiki/utils.ts`:
//! the CrossOver and Wine ratings and the CodeWeavers link read out of a game's wikitext.
//!
//! The requests are the ones the TS made and the 86-06 goldens pin (D-10): the title has its first ` -`
//! replaced by `:` and goes through `encodeURIComponent`, and each request carries the browser
//! `User-Agent` (the site is behind Cloudflare, which refuses axios's default one).
//!
//! Parity points copied, not fixed (D-03):
//! - a title with no page answers the "checked, none found" value (three empty texts) rather than
//!   `None`, so the wiki cache keeps it; only a failed request answers `None`, which is retried next time;
//! - a page with no wikitext answers the same three empty texts.

use gamelib_store::json::{Json, Obj};
use serde_json::Value;

use crate::ctx::InfoCtx;
use crate::js::{encode_uri_component, index, opt_prop, prop, to_js_text, truthy};

use super::regexes;
use super::{get_data, is_numeric_id, Thrown};

const API: &str = "https://www.applegamingwiki.com/w/api.php";

/// AppleGamingWiki sits behind Cloudflare, which 403s requests without a browser-like User-Agent (axios'
/// default `axios/x.y` is blocked). Mirrors the same workaround used for HowLongToBeat.
pub const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// `AppleGamingWikiInfo`: three texts, empty when the wiki has no value.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct AgwInfo {
    pub crossover_rating: String,
    pub wine_rating: String,
    pub crossover_link: String,
}

impl AgwInfo {
    /// The object as the wiki cache stores it, keys in the TS order.
    pub fn to_json(&self) -> Json {
        let mut object = Obj::new();
        object.insert_js("crossoverRating", Json::Str(self.crossover_rating.clone()));
        object.insert_js("wineRating", Json::Str(self.wine_rating.clone()));
        object.insert_js("crossoverLink", Json::Str(self.crossover_link.clone()));
        Json::Obj(object)
    }

    pub fn to_value(&self) -> Value {
        self.to_json().to_value()
    }
}

/// `getInfoFromAppleGamingWiki(title)`. `None` is a failed lookup (the TS `null`, which the wiki cache
/// treats as "try again"); a title with no page is the empty [`AgwInfo`].
pub async fn get_info(ctx: &InfoCtx, title: &str) -> Option<AgwInfo> {
    match lookup(ctx, title).await {
        Ok(info) => Some(info),
        Err(thrown) => {
            ctx.note(&format!(
                "applegamingwiki lookup failed ({})",
                thrown.word()
            ));
            None
        }
    }
}

async fn lookup(ctx: &InfoCtx, title: &str) -> Result<AgwInfo, Thrown> {
    // applegamingwiki does not like "-" and mostly replaces it with ":"
    let title = title.replacen(" -", ":", 1);

    let Some(id) = page_id(ctx, &title).await? else {
        return Ok(AgwInfo::default());
    };
    let wikitext = wiki_text(ctx, &id).await?;

    // `wikitext?.match(re)?.[1] ?? ''`: no wikitext reads as no match; a value that is not a text has no
    // `match` to call.
    let wikitext = match wikitext {
        None => None,
        Some(Value::String(text)) => Some(text),
        Some(_) => return Err(Thrown::Shape),
    };
    let first = |re: &regex::Regex| -> String {
        wikitext
            .as_deref()
            .and_then(|text| re.captures(text))
            .and_then(|caps| caps.get(1))
            .map_or_else(String::new, |m| m.as_str().to_string())
    };
    Ok(AgwInfo {
        crossover_rating: first(regexes::crossover_rating()),
        wine_rating: first(regexes::wine_rating()),
        crossover_link: first(regexes::crossover_link()),
    })
}

/// `getPageID(title)`: the first title-search hit's `pageid`, `None` when it is falsy (`undefined`).
async fn page_id(ctx: &InfoCtx, title: &str) -> Result<Option<Value>, Thrown> {
    let url = format!(
        "{API}?action=query&list=search&srsearch={}&format=json",
        encode_uri_component(title)
    );
    let data = get_data(ctx, url, BROWSER_USER_AGENT).await?;
    // `data.query.search[0]?.pageid`
    let search = prop(prop(Some(&data), "query")?, "search")?;
    let found = opt_prop(index(search, 0)?, "pageid")?;
    Ok(found.filter(|id| truthy(id)).cloned())
}

/// `getWikiText(id)`: the page's wikitext (`data.parse.wikitext['*']`), `None` when the page has none.
async fn wiki_text(ctx: &InfoCtx, id: &Value) -> Result<Option<Value>, Thrown> {
    // WR-03: a page id is digits; anything else is not put into the request.
    let id = to_js_text(id);
    if !is_numeric_id(&id) {
        return Ok(None);
    }
    let url = format!("{API}?action=parse&format=json&pageid={id}&redirects=true&prop=wikitext");
    let data = get_data(ctx, url, BROWSER_USER_AGENT).await?;
    let wikitext = prop(prop(Some(&data), "parse")?, "wikitext")?;
    if !wikitext.is_some_and(truthy) {
        return Ok(None);
    }
    let star = prop(wikitext, "*")?;
    Ok(star.filter(|text| truthy(text)).cloned())
}
