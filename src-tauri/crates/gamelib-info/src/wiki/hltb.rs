//! HowLongToBeat (Phase 86, SVC-01), ported from `src/backend/wiki_game_info/howlongtobeat/utils.ts`: the
//! playtime of a game, from the first of three places that has it. [`get`] is `getHowLongToBeat`:
//!
//! 1. a GOG game: the box on its gog.com store page ([`get_gog`], the store link from
//!    [`super::gog_ctx::gog_store_url`], D-23);
//! 2. any other game with an HLTB id (PCGamingWiki's): the `__NEXT_DATA__` of `/game/<id>` ([`get_by_id`]);
//! 3. any other game with a title, when 2 had no id or found nothing: HLTB's own search
//!    ([`get_by_title`]): the `/api/search/site/init` handshake, then `POST /api/search/site`, and a
//!    candidate is taken only when [`super::title_match::pick_best_match`] finds one that is
//!    unambiguously the game.
//!
//! The requests are the ones the TS made and the 86-06 goldens pin (D-10): every one carries the browser
//! headers (HLTB sits behind Cloudflare and refuses anything that does not look like a browser) and a
//! `Referer`, the init GET carries `?t=<Date.now()>` and the search carries the handshake token in
//! `x-auth-token` and the honeypot pair in `x-hp-key` and `x-hp-val` AND in the body. Every status below
//! 500 is accepted (the TS `validateStatus`), a 5xx and a transport failure fail soft to `None`.
//!
//! `Accept-Encoding` is not sent (Pitfall 3): the shell's reqwest has no gzip, brotli or deflate feature, so
//! a compressed body would reach the parser raw. The header is outside the replay pin, and a server that is
//! asked for no encoding answers in the clear. No reqwest feature and no lockfile change.
//!
//! The search credentials are in memory, per [`InfoCtx`] (so per process), fetched on first use and
//! never written anywhere (T-86-51): [`HltbState`]. Concurrent callers share one handshake and a failed
//! handshake is never cached, as in the TS.
//!
//! Parity points copied, not fixed (D-03):
//! - a GOG game whose store page has no HLTB box (or whose link fails) has no title-search fallback;
//! - a 403 from the search is treated as an expired token: one re-handshake and one retry, then `None`;
//! - the by-title lookup uses the title as the game's `title`, not the cleaned wiki-cache key.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use gamelib_store::json::{js_number_text, to_compact_bytes, Json, Num, Obj};
use serde_json::Value;

use crate::crossover::GameRef;
use crate::ctx::InfoCtx;
use crate::http::{Method, Request, Response};
use crate::js::{index, opt_prop, to_js_text, truthy};

use super::agw::BROWSER_USER_AGENT;
use super::gog_ctx::gog_store_url;
use super::title_match::{pick_best_match, to_search_terms};
use super::{data_of, regexes, Thrown, TIMEOUT};

const BASE_URL: &str = "https://howlongtobeat.com";
const SEARCH_INIT_URL: &str = "https://howlongtobeat.com/api/search/site/init";
const SEARCH_URL: &str = "https://howlongtobeat.com/api/search/site";

/// `BROWSER_HEADERS` of the TS, without `Accept-Encoding` (see the module docs).
const BROWSER_HEADERS: [(&str, &str); 5] = [
    ("User-Agent", BROWSER_USER_AGENT),
    (
        "Accept",
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    ),
    ("Accept-Language", "en-US,en;q=0.9"),
    ("Connection", "keep-alive"),
    ("Upgrade-Insecure-Requests", "1"),
];

/// `HeroicHowLongToBeatEntry`: hours (whole numbers) and, when known, the HLTB game's identity. A field
/// that is `None` is `undefined` in the TS and absent from the JSON.
#[derive(Debug, Clone, PartialEq)]
pub struct HltbEntry {
    pub main_story: f64,
    pub main_extra: f64,
    pub completionist: f64,
    pub game_id: Option<Value>,
    pub game_name: Option<Value>,
    pub game_image_url: Option<String>,
    pub game_web_link: Option<String>,
}

/// A JS number as JSON: `NaN` and the infinities are `null` (`JSON.stringify`), a whole number is an
/// integer, anything else a float.
fn number_json(number: f64) -> Json {
    if !number.is_finite() {
        Json::Null
    } else if number.fract() == 0.0 && number.abs() < 9.0e15 {
        // `-0` is "0" in JSON.
        if number >= 0.0 {
            Json::Num(Num::U(number as u64))
        } else {
            Json::Num(Num::I(number as i64))
        }
    } else {
        Json::Num(Num::F(number))
    }
}

impl HltbEntry {
    /// The entry as the wiki cache stores it, keys in the TS order.
    pub fn to_json(&self) -> Json {
        let mut object = Obj::new();
        object.insert_js("mainStory", number_json(self.main_story));
        object.insert_js("mainExtra", number_json(self.main_extra));
        object.insert_js("completionist", number_json(self.completionist));
        if let Some(id) = &self.game_id {
            object.insert_js("gameId", Json::from(id.clone()));
        }
        if let Some(name) = &self.game_name {
            object.insert_js("gameName", Json::from(name.clone()));
        }
        if let Some(url) = &self.game_image_url {
            object.insert_js("gameImageUrl", Json::Str(url.clone()));
        }
        if let Some(link) = &self.game_web_link {
            object.insert_js("gameWebLink", Json::Str(link.clone()));
        }
        Json::Obj(object)
    }

    pub fn to_value(&self) -> Value {
        self.to_json().to_value()
    }
}

/// JS `Number(value)` for the values a playtime field can hold.
fn to_number(value: &Value) -> f64 {
    match value {
        Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        Value::Bool(true) => 1.0,
        Value::Bool(false) | Value::Null => 0.0,
        Value::String(text) => text.trim().parse::<f64>().unwrap_or(f64::NAN),
        Value::Array(_) | Value::Object(_) => f64::NAN,
    }
}

/// JS `Math.round`: halves go up (`-2.5` to `-2`), `NaN` stays `NaN`.
fn js_round(x: f64) -> f64 {
    if !x.is_finite() {
        return x;
    }
    let floor = x.floor();
    if x - floor >= 0.5 {
        floor + 1.0
    } else {
        floor
    }
}

/// `gameData.comp_x ? Math.round(gameData.comp_x / 3600) : 0`: times arrive in seconds, the UI wants
/// whole hours.
fn hours(game: &Value, key: &str) -> f64 {
    match game.get(key) {
        Some(seconds) if truthy(seconds) => js_round(to_number(seconds) / 3600.0),
        _ => 0.0,
    }
}

/// `toHltbEntry(gameData)` over the raw game of a `/game/<id>` page or a search result.
fn to_hltb_entry(game: &Value) -> HltbEntry {
    let field = |key: &str| game.get(key).filter(|v| truthy(v));
    HltbEntry {
        main_story: hours(game, "comp_main"),
        main_extra: hours(game, "comp_plus"),
        completionist: hours(game, "comp_100"),
        game_id: game.get("game_id").cloned(),
        game_name: field("game_name").cloned(),
        game_image_url: field("game_image")
            .map(|image| format!("{BASE_URL}/games/{}", to_js_text(image))),
        game_web_link: field("game_id").map(|id| format!("{BASE_URL}/game/{}", to_js_text(id))),
    }
}

// ---- requests ----

fn browser_request(request: Request, referer: Option<&str>) -> Request {
    let request = BROWSER_HEADERS
        .iter()
        .fold(request, |request, (name, value)| {
            request.header(name, value)
        });
    match referer {
        Some(referer) => request.header("Referer", referer),
        None => request,
    }
}

/// Sends `request`; every status below 500 is an answer (`validateStatus: status < 500`), a 5xx and a
/// transport failure are what axios would have thrown.
async fn send(ctx: &InfoCtx, request: Request) -> Result<Response, Thrown> {
    let response = ctx.http.send(request).await.map_err(Thrown::from)?;
    if response.status >= 500 {
        return Err(Thrown::Status(response.status));
    }
    Ok(response)
}

/// A page's text: the body of a 200 answer when it is text. A body that parses as JSON is not text to
/// axios (`response.data` is the parsed value), and calling `.match` on it threw in the TS.
async fn page_text(ctx: &InfoCtx, request: Request) -> Result<Option<String>, Thrown> {
    let response = send(ctx, request).await?;
    if response.status != 200 {
        return Ok(None);
    }
    match data_of(&response) {
        Value::String(text) => Ok(Some(text)),
        _ => Err(Thrown::Shape),
    }
}

// ---- by id ----

/// `getGameDataById(gameId)`: the entry of `/game/<id>`, `None` for anything but a 200 page that holds the
/// game (no `__NEXT_DATA__`, no game, no `game_id`) and for every failure.
pub async fn get_by_id(ctx: &InfoCtx, game_id: &str) -> Option<HltbEntry> {
    let request = Request::get(format!("{BASE_URL}/game/{game_id}"), TIMEOUT);
    let html = match page_text(ctx, browser_request(request, Some(BASE_URL))).await {
        Ok(Some(html)) => html,
        Ok(None) => return None,
        Err(thrown) => {
            ctx.note(&format!("hltb game page failed ({})", thrown.word()));
            return None;
        }
    };
    let next_data = regexes::next_data().captures(&html)?.get(1)?.as_str();
    let Ok(next_data) = serde_json::from_str::<Value>(next_data) else {
        ctx.note("hltb game page data is not JSON");
        return None;
    };
    // `nextData.props?.pageProps?.game?.data?.game?.[0]`: anything missing ends the chain.
    let game = (|| {
        let props = opt_prop(Some(&next_data), "props").ok()??;
        let page_props = opt_prop(Some(props), "pageProps").ok()??;
        let game = opt_prop(Some(page_props), "game").ok()??;
        let data = opt_prop(Some(game), "data").ok()??;
        let games = opt_prop(Some(data), "game").ok()??;
        index(Some(games), 0).ok()?
    })();
    // `!gameData || !gameData.game_id`
    let game = game.filter(|game| game.get("game_id").is_some_and(truthy))?;
    Some(to_hltb_entry(game))
}

// ---- GOG ----

/// `parseFloat` over the text a `[\d.]+` group captured: the longest `digits[.digits]` or `.digits`
/// prefix, `NaN` when there is none.
fn parse_float(text: &str) -> f64 {
    let digits = |s: &str| s.bytes().take_while(u8::is_ascii_digit).count();
    let whole = digits(text);
    let (fraction, rest) = match text[whole..].strip_prefix('.') {
        Some(rest) => (digits(rest), rest),
        None => (0, ""),
    };
    if whole == 0 && fraction == 0 {
        return f64::NAN;
    }
    let whole_text = if whole == 0 { "0" } else { &text[..whole] };
    format!("{whole_text}.{}0", &rest[..fraction])
        .parse()
        .unwrap_or(f64::NAN)
}

/// `getGogHLTBGameData`: the HowLongToBeat box on the game's gog.com store page. `Err` only where the
/// store-link lookup threw outside the TS `try` (see [`gog_store_url`]); a page that does not match is
/// `Ok(None)`.
pub async fn get_gog(
    ctx: &InfoCtx,
    app_name: &str,
    title: &str,
) -> Result<Option<HltbEntry>, Thrown> {
    let Some(store_url) = gog_store_url(ctx, app_name).await? else {
        return Ok(None);
    };
    let request = browser_request(Request::get(store_url, TIMEOUT), None);
    let html = match page_text(ctx, request).await {
        Ok(Some(html)) => html,
        Ok(None) => return Ok(None),
        Err(thrown) => {
            ctx.note(&format!("hltb gog page failed ({})", thrown.word()));
            return Ok(None);
        }
    };
    // `captureGroup` throws when the page no longer matches; the TS catches it and fails soft.
    let capture = |regex: &regex::Regex| {
        regex
            .captures(&html)
            .and_then(|caps| caps.get(1))
            .map(|m| m.as_str())
    };
    let times = (
        capture(regexes::gog_main()),
        capture(regexes::gog_main_sides()),
        capture(regexes::gog_completionist()),
        capture(regexes::gog_hltb_id()),
    );
    let (Some(main), Some(main_sides), Some(completionist), Some(id)) = times else {
        ctx.note("hltb gog page does not match");
        return Ok(None);
    };
    // `parseInt` of a run of digits.
    let hltb_id: f64 = id.parse().unwrap_or(f64::NAN);
    Ok(Some(HltbEntry {
        main_story: js_round(parse_float(main)),
        main_extra: js_round(parse_float(main_sides)),
        completionist: js_round(parse_float(completionist)),
        game_id: Some(number_json(hltb_id).to_value()),
        game_name: Some(Value::String(title.to_string())),
        game_image_url: None,
        game_web_link: Some(format!("{BASE_URL}/game/{}", js_number_text(hltb_id))),
    }))
}

// ---- the search handshake ----

/// The handshake's result: a short-lived token and the honeypot pair. Held in memory only; `Debug`
/// shows none of it (T-86-51).
#[derive(Clone)]
pub struct Credentials {
    token: String,
    hp_key: String,
    /// `undefined` when the server sent none: the body key and the header are then omitted.
    hp_val: Option<Value>,
}

impl std::fmt::Debug for Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Credentials").finish_non_exhaustive()
    }
}

/// The credentials cache of one [`InfoCtx`]: `createHltbCredentials()` of the TS.
#[derive(Default)]
pub struct HltbState {
    cached: Mutex<Option<Credentials>>,
    /// The outcome of the latest finished handshake, held under the lock that serialises handshakes.
    latest: tokio::sync::Mutex<Option<Credentials>>,
    /// How many handshakes have finished: a caller that waited for the lock and finds this moved
    /// shares that handshake's outcome instead of starting another (the TS `inFlight` promise).
    finished: AtomicU64,
}

impl HltbState {
    pub fn new() -> HltbState {
        HltbState::default()
    }

    /// `credentials.get(forceRefresh)`: the cached pair unless a refresh is forced, else the outcome of
    /// the one handshake in flight (started here when none is).
    async fn get(&self, ctx: &InfoCtx, force_refresh: bool) -> Option<Credentials> {
        if !force_refresh {
            if let Some(cached) = lock(&self.cached).clone() {
                return Some(cached);
            }
        }
        let finished_before = self.finished.load(Ordering::SeqCst);
        let mut latest = self.latest.lock().await;
        if self.finished.load(Ordering::SeqCst) != finished_before {
            return latest.clone();
        }
        let outcome = fetch_credentials(ctx).await;
        // Success caches, failure clears (`cachedCredentials = null`): a failed handshake is never kept.
        *lock(&self.cached) = outcome.clone();
        *latest = outcome.clone();
        self.finished.fetch_add(1, Ordering::SeqCst);
        outcome
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// `fetchCredentials()`: `GET /api/search/site/init?t=<now>`. A status other than 200, or an answer
/// with no `token` or no `hpKey`, and every failure, give `None`.
async fn fetch_credentials(ctx: &InfoCtx) -> Option<Credentials> {
    let url = format!("{SEARCH_INIT_URL}?t={}", ctx.clock.now_ms());
    let request = browser_request(Request::get(url, TIMEOUT), Some(&format!("{BASE_URL}/")));
    let response = match send(ctx, request).await {
        Ok(response) => response,
        Err(thrown) => {
            ctx.note(&format!("hltb search session failed ({})", thrown.word()));
            return None;
        }
    };
    // `const { token, hpKey, hpVal } = response.data ?? {}`
    let data = data_of(&response);
    let read = |key: &str| opt_prop(Some(&data), key).ok().flatten();
    let (token, hp_key, hp_val) = (read("token"), read("hpKey"), read("hpVal"));
    let (Some(token), Some(hp_key)) = (token.filter(|t| truthy(t)), hp_key.filter(|k| truthy(k)))
    else {
        ctx.note("hltb search session has no credentials");
        return None;
    };
    if response.status != 200 {
        ctx.note("hltb search session has no credentials");
        return None;
    }
    Some(Credentials {
        token: to_js_text(token),
        hp_key: to_js_text(hp_key),
        hp_val: hp_val.cloned(),
    })
}

// ---- by title ----

/// A header value as axios sends it: `null` and `false` are not sent at all.
fn header_text(value: &Value) -> Option<String> {
    match value {
        Value::Null | Value::Bool(false) => None,
        other => Some(to_js_text(other)),
    }
}

fn json_obj(members: Vec<(&str, Json)>) -> Json {
    let mut object = Obj::new();
    for (key, value) in members {
        object.insert_js(key, value);
    }
    Json::Obj(object)
}

fn text(value: &str) -> Json {
    Json::Str(value.to_string())
}

/// The `postSearch` body, key order as the TS object literal wrote it, then the honeypot value under
/// its server-chosen key.
fn search_body(title: &str, credentials: &Credentials) -> Vec<u8> {
    let games = json_obj(vec![
        ("userId", Json::Num(Num::U(0))),
        ("platform", text("")),
        ("sortCategory", text("popular")),
        ("rangeCategory", text("main")),
        (
            "rangeTime",
            json_obj(vec![("min", Json::Null), ("max", Json::Null)]),
        ),
        (
            "gameplay",
            json_obj(vec![
                ("perspective", text("")),
                ("flow", text("")),
                ("genre", text("")),
                ("difficulty", text("")),
            ]),
        ),
        ("year", text("")),
        ("modifier", text("")),
    ]);
    let options = json_obj(vec![
        ("games", games),
        ("users", json_obj(vec![("sortCategory", text("postcount"))])),
        ("lists", json_obj(vec![("sortCategory", text("follows"))])),
        ("filter", text("")),
        ("sort", Json::Num(Num::U(0))),
        ("randomizer", Json::Num(Num::U(0))),
    ]);
    let mut body = json_obj(vec![
        ("searchType", text("games")),
        (
            "searchTerms",
            Json::Arr(to_search_terms(title).iter().map(|t| text(t)).collect()),
        ),
        ("searchPage", Json::Num(Num::U(1))),
        ("size", Json::Num(Num::U(20))),
        ("searchOptions", options),
        ("useCache", Json::Bool(true)),
    ]);
    if let Json::Obj(object) = &mut body {
        match &credentials.hp_val {
            Some(value) => {
                object.insert_js(credentials.hp_key.clone(), Json::from(value.clone()));
            }
            // `body[key] = undefined` and `JSON.stringify` drops the key.
            None => {
                object.remove(&credentials.hp_key);
            }
        }
    }
    to_compact_bytes(&body)
}

/// `postSearch(title, credentials)`: the answer's status and its `data.data ?? []`.
async fn post_search(
    ctx: &InfoCtx,
    title: &str,
    credentials: &Credentials,
) -> Result<(u16, Vec<Value>), Thrown> {
    let mut request = browser_request(
        Request::new(Method::Post, SEARCH_URL, TIMEOUT),
        Some(&format!("{BASE_URL}/")),
    )
    .header("Content-Type", "application/json")
    .header("x-auth-token", &credentials.token)
    .header("x-hp-key", &credentials.hp_key)
    .body(search_body(title, credentials));
    if let Some(value) = credentials.hp_val.as_ref().and_then(header_text) {
        request = request.header("x-hp-val", &value);
    }
    let response = send(ctx, request).await?;
    let data = data_of(&response);
    let games = match opt_prop(Some(&data), "data")? {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(games)) => games.clone(),
        // `games.length` is not `0` and `games.filter` is not a function.
        Some(_) => return Err(Thrown::Shape),
    };
    Ok((response.status, games))
}

/// `getGameDataByTitle(deps, title)`: the one unambiguous match of HLTB's search, else `None`. A 403 is an
/// expired token: one re-handshake and one retry.
pub async fn get_by_title(ctx: &InfoCtx, title: &str) -> Option<HltbEntry> {
    match search_by_title(ctx, title).await {
        Ok(entry) => entry,
        Err(thrown) => {
            ctx.note(&format!("hltb search failed ({})", thrown.word()));
            None
        }
    }
}

async fn search_by_title(ctx: &InfoCtx, title: &str) -> Result<Option<HltbEntry>, Thrown> {
    let Some(mut credentials) = ctx.hltb.get(ctx, false).await else {
        return Ok(None);
    };
    let (mut status, mut games) = post_search(ctx, title, &credentials).await?;
    if status == 403 {
        credentials = match ctx.hltb.get(ctx, true).await {
            Some(credentials) => credentials,
            None => return Ok(None),
        };
        (status, games) = post_search(ctx, title, &credentials).await?;
    }
    if status != 200 || games.is_empty() {
        ctx.note("hltb search returned no results");
        return Ok(None);
    }

    // `games.filter((game) => game.game_name)`: a `null` result throws on the read.
    let mut candidates = Vec::new();
    for game in &games {
        let name = opt_prop_strict(game)?;
        if let Some(name) = name {
            candidates.push((name, game));
        }
    }
    let Some(game) = pick_best_match(title, candidates) else {
        ctx.note("hltb search had no unambiguous match");
        return Ok(None);
    };
    Ok(Some(to_hltb_entry(game)))
}

/// `game.game_name` of one search result when it is truthy: a `null` result throws (`Err`), a name that
/// is not a text makes `normalizeTitle` throw later (`Err`), anything else falsy is skipped.
fn opt_prop_strict(game: &Value) -> Result<Option<String>, Thrown> {
    let name = crate::js::prop(Some(game), "game_name")?;
    match name {
        Some(Value::String(text)) if !text.is_empty() => Ok(Some(text.clone())),
        Some(other) if truthy(other) => Err(Thrown::Shape),
        _ => Ok(None),
    }
}

// ---- the whole lookup ----

/// `getHowLongToBeat(deps, game, hltbId)`. `hltb_id` is what PCGamingWiki found. `Err` only where the GOG
/// store-link lookup threw (the TS rejected the whole wiki lookup there).
pub async fn get(
    ctx: &InfoCtx,
    game: &GameRef<'_>,
    hltb_id: Option<&str>,
) -> Result<Option<HltbEntry>, Thrown> {
    let is_gog = game.runner == "gog";
    if is_gog {
        ctx.note("getting hltb data (gog)");
        if let Some(entry) = get_gog(ctx, game.app_name, game.title).await? {
            return Ok(Some(entry));
        }
    } else if let Some(id) = hltb_id.filter(|id| !id.is_empty()) {
        ctx.note("getting hltb data (id)");
        if let Some(entry) = get_by_id(ctx, id).await {
            return Ok(Some(entry));
        }
    }

    // `hltbId` only ever comes from PCGamingWiki: with no id, or a stale one that 404s, a non-GOG game
    // is looked up by title.
    if !is_gog && !game.title.is_empty() {
        ctx.note("searching hltb by title");
        if let Some(entry) = get_by_title(ctx, game.title).await {
            return Ok(Some(entry));
        }
    }
    ctx.note("no hltb data available");
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_float_reads_the_longest_number_prefix() {
        assert_eq!(parse_float("12.5"), 12.5);
        assert_eq!(parse_float("7"), 7.0);
        assert_eq!(parse_float("1.2.3"), 1.2);
        assert_eq!(parse_float(".5"), 0.5);
        assert_eq!(parse_float("5."), 5.0);
        assert!(parse_float(".").is_nan());
        assert!(parse_float("..5").is_nan());
    }

    #[test]
    fn js_round_rounds_halves_up_like_math_round() {
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(0.49999999999999994), 0.0);
        assert_eq!(js_round(10.4), 10.0);
        assert!(js_round(f64::NAN).is_nan());
    }

    #[test]
    fn hours_are_seconds_over_3600_rounded_and_zero_when_falsy() {
        let game = serde_json::json!({ "comp_main": 5400, "comp_plus": 0, "comp_100": 99_999 });
        assert_eq!(hours(&game, "comp_main"), 2.0);
        assert_eq!(hours(&game, "comp_plus"), 0.0);
        assert_eq!(hours(&game, "comp_100"), 28.0);
        assert_eq!(hours(&game, "comp_missing"), 0.0);
    }

    #[test]
    fn an_entry_keeps_the_ts_key_order_and_drops_undefined_fields() {
        let entry = to_hltb_entry(&serde_json::json!({
            "game_id": 4242, "game_name": "Zzqx", "game_image": "4242_zzqx.jpg",
            "comp_main": 36000, "comp_plus": 72000, "comp_100": 108_000
        }));
        let text = String::from_utf8(to_compact_bytes(&entry.to_json())).unwrap();
        assert_eq!(
            text,
            "{\"mainStory\":10,\"mainExtra\":20,\"completionist\":30,\"gameId\":4242,\"gameName\":\"Zzqx\",\"gameImageUrl\":\"https://howlongtobeat.com/games/4242_zzqx.jpg\",\"gameWebLink\":\"https://howlongtobeat.com/game/4242\"}"
        );
        // No name, no image: `gameName: '' || undefined` and a falsy image are both left out.
        let bare = to_hltb_entry(&serde_json::json!({ "game_id": 7, "game_name": "" }));
        let text = String::from_utf8(to_compact_bytes(&bare.to_json())).unwrap();
        assert_eq!(
            text,
            "{\"mainStory\":0,\"mainExtra\":0,\"completionist\":0,\"gameId\":7,\"gameWebLink\":\"https://howlongtobeat.com/game/7\"}"
        );
    }

    #[test]
    fn the_search_body_is_the_ts_literal_with_the_honeypot_value_last() {
        let credentials = Credentials {
            token: "t".to_string(),
            hp_key: "hpk".to_string(),
            hp_val: Some(Value::String("hpv".to_string())),
        };
        let body = String::from_utf8(search_body("Zzqx™ Qvbnm:", &credentials)).unwrap();
        assert_eq!(
            body,
            "{\"searchType\":\"games\",\"searchTerms\":[\"Zzqx\",\"Qvbnm\"],\"searchPage\":1,\"size\":20,\"searchOptions\":{\"games\":{\"userId\":0,\"platform\":\"\",\"sortCategory\":\"popular\",\"rangeCategory\":\"main\",\"rangeTime\":{\"min\":null,\"max\":null},\"gameplay\":{\"perspective\":\"\",\"flow\":\"\",\"genre\":\"\",\"difficulty\":\"\"},\"year\":\"\",\"modifier\":\"\"},\"users\":{\"sortCategory\":\"postcount\"},\"lists\":{\"sortCategory\":\"follows\"},\"filter\":\"\",\"sort\":0,\"randomizer\":0},\"useCache\":true,\"hpk\":\"hpv\"}"
        );
    }

    #[test]
    fn credentials_never_print_their_token() {
        let credentials = Credentials {
            token: "secret-token".to_string(),
            hp_key: "key".to_string(),
            hp_val: None,
        };
        assert!(!format!("{credentials:?}").contains("secret-token"));
    }
}
