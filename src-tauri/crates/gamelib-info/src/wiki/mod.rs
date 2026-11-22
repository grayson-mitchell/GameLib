//! The wiki game info sources (Phase 86, SVC-01), ported from `src/backend/wiki_game_info/`:
//! [`pcgw`] (PCGamingWiki), [`agw`] (AppleGamingWiki), [`protondb`], [`deck`] (Steam Deck
//! compatibility) and [`codeweavers`] (the slug), plus [`hltb`] (HowLongToBeat, with [`title_match`]),
//! [`gamesdb`] and [`gog_ctx`] (the two unauthenticated GOG GETs D-23 moved into Rust, 86-21). The
//! aggregator that calls them, the 30 day cache and the stale rules are [`get`] (86-22).
//!
//! Every source asks through `ctx.http`, with the 10 s timeout of the TS `axiosClient`, the response read
//! the way axios reads it (a 2xx status, the body parsed as JSON when it parses and kept as text when it
//! does not) and the properties of the answer read with the JS semantics of [`crate::js`]: a read of
//! `undefined` throws, and a source maps what its TS threw to its own failure value (`error` for
//! PCGamingWiki, `null` for AppleGamingWiki, ProtonDB and Steam Deck).
//!
//! A diagnostic line (`ctx.note`) is fixed text plus a status number or a category word: never a URL, a
//! title, or anything the server sent.

use std::time::Duration;

use gamelib_store::json::{Json, Obj};
use serde::Deserialize;
use serde_json::Value;

use crate::cache_view::{CacheView, WIKIGAMEINFO};
use crate::crossover::{self, GameRef};
use crate::ctx::{InfoCtx, Platform};
use crate::http::{HttpError, Request, Response};
use crate::js::{remove_special_characters, to_js_text, truthy};
use crate::runner_caps;
use crate::umu::{self, UmuArgs};

pub mod agw;
pub mod codeweavers;
pub mod deck;
pub mod gamesdb;
pub mod gog_ctx;
pub mod hltb;
pub mod pcgw;
pub mod protondb;
pub mod regexes;
pub mod title_match;

/// The TS `axiosClient`'s `timeout: 10 * 1000`.
pub const TIMEOUT: Duration = Duration::from_secs(10);

/// What the TS `axiosClient` sends as its `User-Agent`: `GameLib/<version> (+<repository>)`.
pub fn user_agent(ctx: &InfoCtx) -> String {
    format!(
        "GameLib/{} (+https://github.com/grayson-mitchell/GameLib)",
        ctx.app_version
    )
}

/// Why a lookup threw. [`Thrown::word`] is what a diagnostic line says.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Thrown {
    /// A status outside 2xx (axios rejects every one of them).
    Status(u16),
    Timeout,
    TooLarge,
    Network,
    /// The answer did not have the shape the code reads (a property read of `undefined`, a value that is
    /// not the text the parser needs).
    Shape,
}

impl Thrown {
    pub fn word(&self) -> String {
        match self {
            Thrown::Status(status) => format!("status {status}"),
            Thrown::Timeout => "timeout".to_string(),
            Thrown::TooLarge => "too large".to_string(),
            Thrown::Network => "network".to_string(),
            Thrown::Shape => "shape".to_string(),
        }
    }
}

impl From<HttpError> for Thrown {
    fn from(error: HttpError) -> Thrown {
        match error {
            HttpError::Timeout => Thrown::Timeout,
            HttpError::TooLarge => Thrown::TooLarge,
            HttpError::Network(_) | HttpError::Cancelled => Thrown::Network,
        }
    }
}

impl From<crate::js::TypeError> for Thrown {
    fn from(_: crate::js::TypeError) -> Thrown {
        Thrown::Shape
    }
}

/// The outcome a source reports with its data (`WikiSourceOutcome` in `common/types`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Ok,
    NotFound,
    Error,
}

impl Outcome {
    /// The word the wiki info cache stores.
    pub fn word(self) -> &'static str {
        match self {
            Outcome::Ok => "ok",
            Outcome::NotFound => "notfound",
            Outcome::Error => "error",
        }
    }
}

/// `axiosClient.get(url, { headers: { 'User-Agent': user_agent } })` and then `response.data`: a 2xx
/// answer's body, parsed as JSON when it parses (a leading BOM is stripped first, as axios strips it) and
/// otherwise the text itself; anything else is what axios would have rejected with.
pub(crate) async fn get_data(
    ctx: &InfoCtx,
    url: String,
    user_agent: &str,
) -> Result<Value, Thrown> {
    let request = Request::get(url, TIMEOUT).header("User-Agent", user_agent);
    let response = ctx.http.send(request).await.map_err(Thrown::from)?;
    if !(200..300).contains(&response.status) {
        return Err(Thrown::Status(response.status));
    }
    Ok(data_of(&response))
}

/// axios's `response.data` for any status: the body parsed as JSON when it parses (a leading BOM is
/// stripped first, as axios strips it) and otherwise the text itself.
pub(crate) fn data_of(response: &Response) -> Value {
    let text = String::from_utf8_lossy(&response.body);
    let text = text.strip_prefix('\u{FEFF}').unwrap_or(&text);
    serde_json::from_str(text).unwrap_or_else(|_| Value::String(text.to_string()))
}

// ---- the aggregator (86-22) ----

const OP: &str = "info_wiki_get";

/// `{title, appName, runner, forceRefresh?}`: the game the wiki block is for. `runner` is one of the five
/// runner names and `forceRefresh` an optional boolean (the TS `forceRefresh = false`). Unknown fields are
/// rejected. The title is the renderer's own (D-23): the TS read it off the resolved `Game` instead, and
/// the two are the same text for every game the renderer shows.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct WikiArgs {
    pub title: String,
    pub app_name: String,
    pub runner: String,
    #[serde(default)]
    pub force_refresh: Option<bool>,
}

/// The longest `title` the native channel accepts, in UTF-16 code units (the zod bound it replaces).
pub const TITLE_MAX_UTF16: usize = 1024;
/// The longest `appName` the native channel accepts, in UTF-16 code units.
pub const APP_NAME_MAX_UTF16: usize = 256;

/// A property of a cached entry: `None` for anything that is not an object (a JS read of a primitive's
/// property is `undefined`).
fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    value.as_object().and_then(|object| object.get(key))
}

/// `{ macRating, linuxRating: null, slug }` in the TS key order (`CodeweaversInfo::to_value` is a
/// `serde_json::Value`, which sorts its keys, and these bytes go into the cache file).
fn codeweavers_json(info: &crossover::CodeweaversInfo) -> Json {
    let mut object = Obj::new();
    object.insert_js(
        "macRating",
        info.mac_rating
            .map_or(Json::Null, |rating| Json::from(Value::from(rating))),
    );
    object.insert_js("linuxRating", Json::Null);
    object.insert_js("slug", Json::Str(info.slug.clone()));
    Json::Obj(object)
}

/// `staleAppleData`: on macOS an entry with no truthy `applegamingwiki` is refetched.
fn stale_apple_data(mac: bool, cached: &Value) -> bool {
    mac && !field(cached, "applegamingwiki").is_some_and(truthy)
}

/// `staleCrossoverData`: on macOS an entry with no truthy `codeweavers`, or whose `macRating` is absent
/// (the old shape), or is `null` while the index now covers the game (`index_has`, asked only then), is
/// refetched. A cached "checked, none found" miss stays cached while the index lacks the game (D-13).
fn stale_crossover_data(mac: bool, cached: &Value, index_has: impl FnOnce() -> bool) -> bool {
    if !mac {
        return false;
    }
    let Some(codeweavers) = field(cached, "codeweavers").filter(|value| truthy(value)) else {
        return true;
    };
    match field(codeweavers, "macRating") {
        None => true,
        Some(Value::Null) => index_has(),
        Some(_) => false,
    }
}

/// `staleWikiFetch`: an entry with no `fetchStatus`, a failed PCGamingWiki outcome or the legacy
/// `skipped` HowLongToBeat outcome is refetched. `notfound` is a real answer and stays cached.
fn stale_wiki_fetch(cached: &Value) -> bool {
    let Some(status) = field(cached, "fetchStatus").filter(|value| truthy(value)) else {
        return true;
    };
    field(status, "pcgamingwiki") == Some(&Value::String("error".to_string()))
        || field(status, "howlongtobeat") == Some(&Value::String("skipped".to_string()))
}

/// `getWikiGameInfo(deps, game, forceRefresh)`: the cached entry for the cleaned title unless it is
/// forced or stale, else PCGamingWiki, GamesDB, AppleGamingWiki (macOS), umu (Linux) and the CrossOver
/// index (macOS) together, then HowLongToBeat with PCGamingWiki's id, then ProtonDB and the Steam Deck
/// report (Linux) with the Steam id; the merged result is cached and returned, with the keys in the TS
/// order and a `fetchStatus` naming the PCGamingWiki and HowLongToBeat outcomes.
///
/// Every failure the TS caught in its one `try` (a source that threw outside its own `try`, a cache that
/// would not open or write) is a logged line and the `null` answer. `Err` is only an unknown runner.
pub async fn get(ctx: &InfoCtx, args: WikiArgs) -> Result<Value, String> {
    let Some(caps) = runner_caps::caps(&args.runner) else {
        return Err(format!("{OP}:bad-args"));
    };
    match lookup(ctx, &args, caps.app_name_is_steam_app_id).await {
        Ok(value) => Ok(value),
        Err(failure) => {
            ctx.note(&format!("wiki lookup failed ({failure})"));
            Ok(Value::Null)
        }
    }
}

async fn lookup(
    ctx: &InfoCtx,
    args: &WikiArgs,
    app_name_is_steam_app_id: bool,
) -> Result<Value, String> {
    let (mac, linux) = (
        ctx.platform == Platform::Mac,
        ctx.platform == Platform::Linux,
    );
    let force_refresh = args.force_refresh.unwrap_or(false);
    let title = remove_special_characters(&args.title);
    let game = GameRef {
        runner: &args.runner,
        app_name: &args.app_name,
        title: &args.title,
    };

    let view = CacheView::open(
        &ctx.host,
        &ctx.paths.user_data,
        WIKIGAMEINFO,
        ctx.clock.clone(),
    )
    .map_err(|_| "cache".to_string())?;
    // A cached falsy value is a miss for every rule below (`cachedResponse &&`).
    let cached = view
        .get_opt(&title)
        .map(|json| json.to_value())
        .filter(truthy);
    if let Some(cached) = &cached {
        if !force_refresh
            && !stale_apple_data(mac, cached)
            && !stale_crossover_data(mac, cached, || crossover::index_has(ctx, &game))
            && !stale_wiki_fetch(cached)
        {
            ctx.note("using cached wiki data");
            return Ok(cached.clone());
        }
    }

    ctx.note("getting wiki data");
    let gog_id = (args.runner == "gog").then_some(args.app_name.as_str());
    let (pcgw, gamesdb, agw_info, umu_id, codeweavers) = tokio::join!(
        pcgw::get_info(ctx, &title, gog_id),
        gamesdb::get(ctx, &title, &args.app_name, &args.runner),
        async {
            if mac {
                agw::get_info(ctx, &title).await
            } else {
                None
            }
        },
        async {
            if linux {
                Some(
                    umu::get(
                        ctx,
                        UmuArgs {
                            app_name: args.app_name.clone(),
                            runner: args.runner.clone(),
                        },
                    )
                    .await,
                )
            } else {
                None
            }
        },
        async {
            if mac {
                crossover::codeweavers_for(ctx, &game).await
            } else {
                None
            }
        },
    );
    // `Promise.all` rejected where GamesDB or umu threw: the whole lookup answers null.
    let gamesdb = gamesdb.map_err(|thrown| thrown.word())?;
    let umu_id = match umu_id {
        Some(result) => Some(result.map_err(|_| "umu".to_string())?),
        None => None,
    };

    let pcgw_id = pcgw
        .info
        .as_ref()
        .map(|info| info.how_long_to_beat_id.as_str());
    let howlongtobeat = hltb::get(ctx, &game, pcgw_id)
        .await
        .map_err(|thrown| thrown.word())?;
    let howlongtobeat_outcome = if howlongtobeat.is_some() {
        Outcome::Ok
    } else {
        Outcome::NotFound
    };

    let mut steam_info = Json::Null;
    if linux {
        // For a native Steam game the app name IS the Steam app id; otherwise GamesDB's id (queried by
        // app name, so the more accurate) and then PCGamingWiki's.
        let steam_id = if app_name_is_steam_app_id {
            Some(args.app_name.clone())
        } else if gamesdb.has_steam_id() {
            Some(to_js_text(&gamesdb.steam_id))
        } else {
            pcgw.info.as_ref().map(|info| info.steam_id.clone())
        };
        let (protondb, deck_comp) = tokio::join!(
            protondb::get_info(ctx, steam_id.as_deref()),
            deck::get_comp(ctx, steam_id.as_deref())
        );
        if protondb.is_some() || deck_comp.is_some() {
            let mut object = Obj::new();
            if let Some(protondb) = &protondb {
                object.insert_js("compatibilityLevel", Json::from(protondb.level.clone()));
            }
            if let Some(deck_comp) = &deck_comp {
                object.insert_js(
                    "steamDeckCatagory",
                    Json::from(Value::Number(deck_comp.category.clone())),
                );
            }
            steam_info = Json::Obj(object);
        }
    }

    let mut status = Obj::new();
    status.insert_js("pcgamingwiki", Json::Str(pcgw.outcome.word().to_string()));
    status.insert_js(
        "howlongtobeat",
        Json::Str(howlongtobeat_outcome.word().to_string()),
    );
    let mut result = Obj::new();
    result.insert_js(
        "pcgamingwiki",
        pcgw.info.as_ref().map_or(Json::Null, |info| info.to_json()),
    );
    result.insert_js(
        "applegamingwiki",
        agw_info.as_ref().map_or(Json::Null, |info| info.to_json()),
    );
    result.insert_js(
        "codeweavers",
        codeweavers.as_ref().map_or(Json::Null, codeweavers_json),
    );
    result.insert_js(
        "howlongtobeat",
        howlongtobeat
            .as_ref()
            .map_or(Json::Null, |entry| entry.to_json()),
    );
    result.insert_js("gamesdb", gamesdb.to_json());
    result.insert_js("steamInfo", steam_info);
    result.insert_js("umuId", umu_id.map_or(Json::Null, Json::from));
    result.insert_js("fetchStatus", Json::Obj(status));
    let result = Json::Obj(result);

    view.set(&title, result.clone())
        .map_err(|_| "cache".to_string())?;
    Ok(result.to_value())
}

/// `wikiGameInfoStore.clear()` (the wiki half of `clearCache` in `backend/utils.ts`): the wiki cache
/// becomes empty, values and timestamps together. The umu cache is another store and is not touched.
pub fn clear_cache(ctx: &InfoCtx) -> Result<(), String> {
    let view = CacheView::open(
        &ctx.host,
        &ctx.paths.user_data,
        WIKIGAMEINFO,
        ctx.clock.clone(),
    )
    .map_err(|_| "info_wiki_cache_clear:store-unavailable".to_string())?;
    view.clear()
        .map_err(|_| "info_wiki_cache_clear:store-write".to_string())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn entry(codeweavers: Value) -> Value {
        json!({
            "pcgamingwiki": null,
            "applegamingwiki": { "crossoverRating": "", "wineRating": "", "crossoverLink": "" },
            "codeweavers": codeweavers,
            "howlongtobeat": null,
            "gamesdb": { "steamID": "" },
            "steamInfo": null,
            "umuId": null,
            "fetchStatus": { "pcgamingwiki": "notfound", "howlongtobeat": "notfound" }
        })
    }

    #[test]
    fn args_reject_unknown_fields_and_wrong_types() {
        let ok: WikiArgs = serde_json::from_value(
            json!({ "title": "t", "appName": "a", "runner": "gog", "forceRefresh": true }),
        )
        .unwrap();
        assert_eq!(ok.force_refresh, Some(true));
        let bare: WikiArgs =
            serde_json::from_value(json!({ "title": "t", "appName": "a", "runner": "gog" }))
                .unwrap();
        assert_eq!(bare.force_refresh, None);
        for bad in [
            json!({ "title": "t", "appName": "a" }),
            json!({ "title": "t", "appName": "a", "runner": "gog", "x": 1 }),
            json!({ "title": 1, "appName": "a", "runner": "gog" }),
            json!({ "title": "t", "appName": "a", "runner": "gog", "forceRefresh": "yes" }),
        ] {
            assert!(serde_json::from_value::<WikiArgs>(bad).is_err());
        }
    }

    #[test]
    fn stale_crossover_data_only_applies_on_mac_and_only_asks_the_index_for_a_null_rating() {
        let miss = json!({ "macRating": null, "linuxRating": null, "slug": "" });
        let hit = json!({ "macRating": 4, "linuxRating": null, "slug": "x" });
        let never = || -> bool { panic!("the index is asked only for a null rating") };
        assert!(!stale_crossover_data(false, &entry(Value::Null), never));
        assert!(stale_crossover_data(true, &entry(Value::Null), never));
        assert!(stale_crossover_data(
            true,
            &entry(json!({ "slug": "" })),
            never
        ));
        assert!(!stale_crossover_data(true, &entry(hit), never));
        assert!(!stale_crossover_data(true, &entry(miss.clone()), || false));
        assert!(stale_crossover_data(true, &entry(miss), || true));
    }

    #[test]
    fn the_apple_and_fetch_status_rules_read_the_entry_like_js() {
        let mut cached = entry(json!({ "macRating": null }));
        assert!(!stale_apple_data(true, &cached));
        assert!(!stale_apple_data(false, &json!({})));
        cached["applegamingwiki"] = Value::Null;
        assert!(stale_apple_data(true, &cached));
        // An entry that is not an object has none of the fields.
        assert!(stale_apple_data(true, &json!("text")));
        assert!(stale_wiki_fetch(&json!("text")));

        let mut cached = entry(Value::Null);
        assert!(!stale_wiki_fetch(&cached));
        cached["fetchStatus"]["pcgamingwiki"] = json!("error");
        assert!(stale_wiki_fetch(&cached));
        cached["fetchStatus"]["pcgamingwiki"] = json!("ok");
        cached["fetchStatus"]["howlongtobeat"] = json!("skipped");
        assert!(stale_wiki_fetch(&cached));
        cached.as_object_mut().unwrap().remove("fetchStatus");
        assert!(stale_wiki_fetch(&cached));
    }
}
