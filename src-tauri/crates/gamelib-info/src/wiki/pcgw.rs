//! PCGamingWiki (Phase 86, SVC-01), ported from `src/backend/wiki_game_info/pcgamingwiki/utils.ts`:
//! the page id (a cargoquery by GOG id first, then a title search), the page's wikitext, and the scores,
//! ids and lists read out of it.
//!
//! The requests are the ones the TS made and the 86-06 goldens pin (D-10), with two departures. The
//! first: the search term (the title with its first ` -` replaced by `:`) is encoded as
//! `encodeURIComponent` would encode it (`crate::js::encode_uri_component`, as AppleGamingWiki's search
//! does), where the TS encoded only its spaces. A `#`, `&`, `=` or `;` in a title therefore stays inside
//! the term instead of cutting or splitting the URL (todo `2026-11-23-pcgw-search-term-not-url-encoded`;
//! the TS was deleted in 86-24, so there is no parity left to keep). The second: a 2xx answer to the
//! GOG-id cargoquery that has no `cargoquery` property is read as no GOG id and falls through to the
//! title search. The live API's `permissiondenied` error object (HTTP 200) is that answer today; the TS
//! threw on it, so every GOG title was `error` and re-fetched on every visit (todo
//! `2026-11-22-pcgw-cargoquery-permissiondenied-gog-lookup`). A non-2xx status or a transport failure of
//! the cargo query is still `error`. The page id goes into the URL as the JS template literal prints
//! it, and each request carries the `GameLib/<version>` User-Agent.
//!
//! Parity points copied, not fixed (D-03):
//! - every failure (a status outside 2xx, a transport failure, an answer without the property the code
//!   reads, except the cargoquery answer above) is outcome `error`, which the wiki cache re-fetches; a
//!   page that is not there is `notfound`;
//! - an empty `direct3d versions` or `genres` is the list `[""]`, not `[]`.

use gamelib_store::json::{Json, Obj};
use serde_json::Value;

use crate::ctx::InfoCtx;
use crate::js::{encode_uri_component, index, opt_prop, prop, to_js_text, truthy};

use super::regexes;
use super::{get_data, is_numeric_id, user_agent, Outcome, Thrown};

const API: &str = "https://www.pcgamingwiki.com/w/api.php";

/// `GameScoreInfo`: a score and the page id it came from, both text (empty when the page has none).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Score {
    pub score: String,
    pub urlid: String,
}

impl Score {
    fn to_json(&self) -> Json {
        let mut object = Obj::new();
        object.insert_js("score", Json::Str(self.score.clone()));
        object.insert_js("urlid", Json::Str(self.urlid.clone()));
        Json::Obj(object)
    }
}

/// `PCGamingWikiInfo`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PcgwInfo {
    pub steam_id: String,
    pub how_long_to_beat_id: String,
    pub metacritic: Score,
    pub opencritic: Score,
    pub igdb: Score,
    pub direct3d_versions: Vec<String>,
    pub genres: Vec<String>,
    pub release_date: Vec<String>,
}

fn strings(list: &[String]) -> Json {
    Json::Arr(list.iter().map(|s| Json::Str(s.clone())).collect())
}

impl PcgwInfo {
    /// The object as the wiki cache stores it, keys in the TS order.
    pub fn to_json(&self) -> Json {
        let mut object = Obj::new();
        object.insert_js("steamID", Json::Str(self.steam_id.clone()));
        object.insert_js(
            "howLongToBeatID",
            Json::Str(self.how_long_to_beat_id.clone()),
        );
        object.insert_js("metacritic", self.metacritic.to_json());
        object.insert_js("opencritic", self.opencritic.to_json());
        object.insert_js("igdb", self.igdb.to_json());
        object.insert_js("direct3DVersions", strings(&self.direct3d_versions));
        object.insert_js("genres", strings(&self.genres));
        object.insert_js("releaseDate", strings(&self.release_date));
        Json::Obj(object)
    }

    pub fn to_value(&self) -> Value {
        self.to_json().to_value()
    }
}

/// The TS `PCGamingWikiResult`: the info (`None` unless the outcome is [`Outcome::Ok`]) and why.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PcgwResult {
    pub info: Option<PcgwInfo>,
    pub outcome: Outcome,
}

/// `getInfoFromPCGamingWiki(title, gogID)`. `gog_id` is the GOG product id for a GOG title (an empty
/// text is as absent as in JS).
pub async fn get_info(ctx: &InfoCtx, title: &str, gog_id: Option<&str>) -> PcgwResult {
    match lookup(ctx, title, gog_id).await {
        Ok(Some(info)) => PcgwResult {
            info: Some(info),
            outcome: Outcome::Ok,
        },
        Ok(None) => PcgwResult {
            info: None,
            outcome: Outcome::NotFound,
        },
        Err(thrown) => {
            // `error`, NOT `notfound`: a 403, a timeout or a DNS failure is not "this game is not on the wiki".
            ctx.note(&format!("pcgamingwiki lookup failed ({})", thrown.word()));
            PcgwResult {
                info: None,
                outcome: Outcome::Error,
            }
        }
    }
}

async fn lookup(
    ctx: &InfoCtx,
    title: &str,
    gog_id: Option<&str>,
) -> Result<Option<PcgwInfo>, Thrown> {
    // pcgamingwiki does not like "-" and mostly replaces it with ":"
    let title = title.replacen(" -", ":", 1);

    let Some(id) = page_id(ctx, &title, gog_id.filter(|id| !id.is_empty())).await? else {
        return Ok(None);
    };
    let Some(wikitext) = wiki_text(ctx, &id).await? else {
        return Ok(None);
    };
    // `wikitext.match(...)` is not a function for anything but a text.
    let Value::String(wikitext) = wikitext else {
        return Err(Thrown::Shape);
    };

    let first = |re: &regex::Regex| -> String {
        re.captures(&wikitext)
            .and_then(|caps| caps.get(1))
            .map_or_else(String::new, |m| m.as_str().to_string())
    };
    let score = |re: &regex::Regex| -> Score {
        let caps = re.captures(&wikitext);
        let group = |n: usize| {
            caps.as_ref()
                .and_then(|caps| caps.get(n))
                .map_or_else(String::new, |m| m.as_str().to_string())
        };
        Score {
            score: group(2),
            urlid: group(1),
        }
    };
    let list = |text: String| -> Vec<String> {
        text.replace(' ', "")
            .split(',')
            .map(str::to_string)
            .collect()
    };

    Ok(Some(PcgwInfo {
        steam_id: first(regexes::steam_id()),
        how_long_to_beat_id: first(regexes::hltb_id()),
        metacritic: score(regexes::metacritic()),
        opencritic: score(regexes::opencritic()),
        igdb: score(regexes::igdb()),
        direct3d_versions: list(first(regexes::direct3d_versions())),
        genres: list(first(regexes::genres())),
        release_date: regexes::release_date()
            .captures_iter(&wikitext)
            .map(|caps| format!("{}: {}", &caps[1], &caps[2]))
            .collect(),
    }))
}

/// `getPageID(title, id)`: the cargoquery page id for a GOG id when it has one, otherwise the first
/// title-search hit. `None` is a falsy id (`undefined`, `0`, `""`): the page is not there.
async fn page_id(
    ctx: &InfoCtx,
    title: &str,
    gog_id: Option<&str>,
) -> Result<Option<Value>, Thrown> {
    let agent = user_agent(ctx);
    if let Some(id) = gog_id {
        let url = format!(
            "{API}?action=cargoquery&tables=Infobox_game&fields=Infobox_game._pageID%3DpageID%2C&where=Infobox_game.GOGcom_ID%20HOLDS%20{}&format=json",
            encode_uri_component(id)
        );
        let data = get_data(ctx, url, &agent).await?;
        // `data?.cargoquery?.[0]?.title?.pageID`: a 2xx answer without `cargoquery` (the live
        // `permissiondenied` error object, `{}`, or a null `cargoquery`) is no GOG id, not a throw.
        if let Some(cargoquery) = opt_prop(Some(&data), "cargoquery")?.filter(|v| !v.is_null()) {
            let first = index(Some(cargoquery), 0)?;
            let number = opt_prop(opt_prop(first, "title")?, "pageID")?;
            if let Some(number) = number.filter(|n| truthy(n)) {
                return Ok(Some(number.clone()));
            }
        } else {
            ctx.note("pcgamingwiki gog id answer has no cargoquery, searching by title");
        }
    }

    let url = format!(
        "{API}?action=query&list=search&srsearch={}&format=json",
        encode_uri_component(title)
    );
    let data = get_data(ctx, url, &agent).await?;
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
    let data = get_data(ctx, url, &user_agent(ctx)).await?;
    let wikitext = prop(prop(Some(&data), "parse")?, "wikitext")?;
    if !wikitext.is_some_and(truthy) {
        return Ok(None);
    }
    let star = prop(wikitext, "*")?;
    Ok(star.filter(|text| truthy(text)).cloned())
}
