//! Title -> Steam app id resolver for Humble Steam keys, ported from
//! `src/backend/humble/steamAppIdResolver.ts` (Phase 94, D-06, D-21).
//!
//! Humble's library API no longer carries `steam_app_id`, so the exact "Owned on Steam" tier in
//! dedup could never fire. This resolves an id from the key title through Steam's public store search
//! and caches the answer in `humble_steam_appid`.
//!
//! Precision rule: accept only a UNIQUE `type == "app"` item whose strictly normalised name equals the
//! strictly normalised title. Ambiguity and near-misses (sequels, "Deluxe Edition") are misses.
//! [`crate::title_match::normalize_title`] is deliberately NOT reused: it strips every parenthetical
//! and edition suffix, which would equate "X" with "X Deluxe Edition", the near-miss this rule rejects.
//!
//! A pass is bounded in every way the TypeScript's was (a cap of 40 requests, an 8 s timeout per
//! request, a 350 ms gap, stop at the first error, a stale fence) and in one more way the Rust
//! shutdown contract adds (D-21): it holds a `Shutdown` registrant for exactly its duration, and every
//! gap AND the request in flight race the shutdown token, so exit never waits on a pass and a pass
//! stops at the next await after shutdown begins.
//!
//! Only titles ever reach this module: never key values, cookies or tokens. Every log line is the
//! fixed summary with counts.

use std::collections::HashSet;
use std::sync::OnceLock;
use std::time::Duration;

use regex::Regex;
use serde_json::Value;
use unicode_normalization::UnicodeNormalization;

use crate::ctx::HumbleCtx;
use crate::http::{axios_query, Request};
use crate::js_date::is_js_whitespace;
use crate::js_value::js_number_to_string;
use crate::stores::{app_id_entry, put_app_id_entry, AppIdEntry, HumbleStore};

const STEAM_STORE_SEARCH_URL: &str = "https://store.steampowered.com/api/storesearch/";

/// A recorded miss is asked again after this long (7 days).
pub const HUMBLE_APPID_MISS_TTL_MS: f64 = 7.0 * 24.0 * 60.0 * 60.0 * 1000.0;
/// The pause between two requests of one pass.
pub const HUMBLE_APPID_REQUEST_GAP_MS: u64 = 350;
/// The most requests one pass makes; the rest stay deferred.
pub const HUMBLE_APPID_RESOLVE_CAP: usize = 40;
const HUMBLE_APPID_REQUEST_TIMEOUT_MS: u64 = 8000;

/// Bumped when the search TERM changes, so misses recorded under an older term are retried instead of
/// waiting out the TTL. v2: the term drops the Humble "(Steam)" suffix.
pub const HUMBLE_APPID_TERM_VERSION: u32 = 2;

/// One item of a store-search answer.
#[derive(Debug, Clone, PartialEq)]
pub struct SteamStoreSearchItem {
    pub kind: String,
    pub name: String,
    pub id: f64,
}

/// What one pass did (`ResolveSummary`, plus whether shutdown cut it short).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ResolveOutcome {
    pub requested: usize,
    pub resolved: usize,
    pub cached: usize,
    pub misses: usize,
    pub errors: usize,
    pub deferred: usize,
    /// Shutdown began and the pass stopped at its next gap or request (or never started).
    pub stopped_by_shutdown: bool,
}

// ------------------------------------------------------------------------------------------------
// Normalisation (JavaScript semantics, spelled out)
// ------------------------------------------------------------------------------------------------

fn marks() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\p{M}+").expect("a valid pattern"))
}

fn not_letter_or_number() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[^\p{L}\p{N}]+").expect("a valid pattern"))
}

/// `String.prototype.trim`.
fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_whitespace)
}

fn skip_ws(chars: &[char], mut at: usize) -> usize {
    while chars.get(at).copied().is_some_and(is_js_whitespace) {
        at += 1;
    }
    at
}

fn rest_is_ws(chars: &[char], at: usize) -> bool {
    skip_ws(chars, at) == chars.len()
}

/// `literal` (ASCII, lower case) at `chars[at..]`, ignoring ASCII case as a non-Unicode JavaScript `/i`
/// does (a non-ASCII character never equals an ASCII one). Returns the index after it.
fn literal(chars: &[char], at: usize, literal: &str) -> Option<usize> {
    let mut end = at;
    for expected in literal.chars() {
        let got = *chars.get(end)?;
        if !got.eq_ignore_ascii_case(&expected) {
            return None;
        }
        end += 1;
    }
    Some(end)
}

/// `steam(?: key)?` at `at`, then only white space to the end.
fn steam_then_end(chars: &[char], at: usize) -> bool {
    let Some(after) = literal(chars, at, "steam") else {
        return false;
    };
    if let Some(with_key) = literal(chars, after, " key") {
        if rest_is_ws(chars, with_key) {
            return true;
        }
    }
    rest_is_ws(chars, after)
}

/// `/(?:\s*\(steam(?: key)?\)|\s*\[steam\]|\s+steam key|\s+-\s*steam(?: key)?)\s*$/i` anchored at `at`.
fn steam_suffix_at(chars: &[char], at: usize) -> bool {
    let after_ws = skip_ws(chars, at);
    if let Some(open) = literal(chars, after_ws, "(steam") {
        if let Some(key) = literal(chars, open, " key") {
            if literal(chars, key, ")").is_some_and(|end| rest_is_ws(chars, end)) {
                return true;
            }
        }
        if literal(chars, open, ")").is_some_and(|end| rest_is_ws(chars, end)) {
            return true;
        }
    }
    if literal(chars, after_ws, "[steam]").is_some_and(|end| rest_is_ws(chars, end)) {
        return true;
    }
    if after_ws > at {
        if let Some(end) = literal(chars, after_ws, "steam key") {
            if rest_is_ws(chars, end) {
                return true;
            }
        }
        if chars.get(after_ws) == Some(&'-') {
            let before_steam = skip_ws(chars, after_ws + 1);
            if steam_then_end(chars, before_steam) {
                return true;
            }
        }
    }
    false
}

/// `/\s+-\s*steam key\s*$/i` anchored at `at`.
fn steam_key_dash_at(chars: &[char], at: usize) -> bool {
    let after_ws = skip_ws(chars, at);
    after_ws > at
        && chars.get(after_ws) == Some(&'-')
        && literal(chars, skip_ws(chars, after_ws + 1), "steam key")
            .is_some_and(|end| rest_is_ws(chars, end))
}

/// `text.replace(re, '')` for a pattern that ends in `$`: the leftmost start at which it matches.
fn strip_suffix_matching(text: &str, matches_at: fn(&[char], usize) -> bool) -> String {
    let chars: Vec<char> = text.chars().collect();
    match (0..=chars.len()).find(|&at| matches_at(&chars, at)) {
        Some(at) => chars[..at].iter().collect(),
        None => text.to_string(),
    }
}

/// Strips the Humble delivery suffix ("(Steam)", "[Steam]", "Steam Key", "- Steam Key") until none
/// is left, trimming after each round, as the TypeScript's `do ... while` loop does.
fn strip_steam_suffixes(text: &str) -> String {
    let mut s = js_trim(text).to_string();
    loop {
        let prev = s.clone();
        let stripped = strip_suffix_matching(&s, steam_key_dash_at);
        let stripped = strip_suffix_matching(&stripped, steam_suffix_at);
        s = js_trim(&stripped).to_string();
        if s == prev {
            return s;
        }
    }
}

/// `normalizeForAppIdMatch`: trademark symbols out BEFORE NFKD (which turns a trade mark sign into
/// the letters "TM"), accents out, lower case, the Steam suffix out, and every run of anything but a
/// letter or a number one space.
pub fn normalize_for_app_id_match(title: &str) -> String {
    let without_symbols: String = title
        .chars()
        .filter(|c| !matches!(c, '\u{2122}' | '\u{ae}' | '\u{a9}'))
        .collect();
    let decomposed: String = without_symbols.nfkd().collect();
    let unmarked = marks().replace_all(&decomposed, "");
    let lowered = unmarked.to_lowercase();
    let stripped = strip_steam_suffixes(&lowered);
    js_trim(&not_letter_or_number().replace_all(&stripped, " ")).to_string()
}

/// `searchTermFor`: the title as Humble shows it, minus trademark symbols and the Steam delivery
/// suffix. Punctuation and case are kept; only the match normalises fully.
pub fn search_term_for(title: &str) -> String {
    let without_symbols: String = title
        .chars()
        .filter(|c| !matches!(c, '\u{2122}' | '\u{ae}' | '\u{a9}'))
        .collect();
    strip_steam_suffixes(&without_symbols)
}

/// `pickConfidentAppId`: the one app whose normalised name is the title's, as the id's decimal text, or
/// `None` for no match, a DLC or bundle, or two different apps.
pub fn pick_confident_app_id(title: &str, items: &[SteamStoreSearchItem]) -> Option<String> {
    let want = normalize_for_app_id_match(title);
    if want.is_empty() {
        return None;
    }
    let mut ids: Vec<f64> = Vec::new();
    for item in items {
        if item.kind != "app" {
            continue;
        }
        if normalize_for_app_id_match(&item.name) == want && !ids.contains(&item.id) {
            ids.push(item.id);
        }
    }
    match ids.as_slice() {
        [only] => Some(js_number_to_string(*only)),
        _ => None,
    }
}

// ------------------------------------------------------------------------------------------------
// The store search
// ------------------------------------------------------------------------------------------------

/// Why a search produced no usable answer. Fixed categories: never a URL, a term or a body.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchFailure {
    /// The request failed (timeout, network, body too large).
    Transport,
    /// A status outside 2xx (axios throws on it).
    Status,
    /// A 200 that is not an object (an HTML error or rate-limit page, `null`): an error, not a miss.
    Shape,
    /// A JSON object with no `items` array: an error, not a miss.
    NoItems,
}

/// The request `searchSteamStoreApps` makes. A redirect IS followed (as axios did): the store search
/// carries no cookie or credential, the term is the only datum, and no Humble host is involved.
pub fn search_request(term: &str) -> Request {
    let url = format!(
        "{STEAM_STORE_SEARCH_URL}?{}",
        axios_query(&[("term", term), ("l", "english"), ("cc", "US")])
    );
    Request::get(url, Duration::from_millis(HUMBLE_APPID_REQUEST_TIMEOUT_MS))
        .header("Accept", "application/json, text/plain, */*")
        .header("User-Agent", "GameLib")
        .follow_redirects(true)
}

/// The items of a store-search answer. axios parsed a JSON body whatever its content type and left
/// anything else a string, so the body is read as JSON and a non-object is a [`SearchFailure::Shape`].
pub fn parse_search_answer(
    status: u16,
    body: &[u8],
) -> Result<Vec<SteamStoreSearchItem>, SearchFailure> {
    if !(200..300).contains(&status) {
        return Err(SearchFailure::Status);
    }
    let Ok(Value::Object(object)) = serde_json::from_slice::<Value>(body) else {
        return Err(SearchFailure::Shape);
    };
    let Some(Value::Array(items)) = object.get("items") else {
        return Err(SearchFailure::NoItems);
    };
    Ok(items
        .iter()
        .filter_map(|raw| {
            let raw = raw.as_object()?;
            let kind = raw.get("type")?.as_str()?;
            let name = raw.get("name")?.as_str()?;
            let id = raw.get("id")?.as_f64().filter(|id| id.is_finite())?;
            Some(SteamStoreSearchItem {
                kind: kind.to_string(),
                name: name.to_string(),
                id,
            })
        })
        .collect())
}

async fn search_store_apps(
    ctx: &HumbleCtx,
    term: &str,
) -> Result<Vec<SteamStoreSearchItem>, SearchFailure> {
    let response = ctx
        .http
        .send(search_request(term))
        .await
        .map_err(|_| SearchFailure::Transport)?;
    parse_search_answer(response.status, &response.body)
}

// ------------------------------------------------------------------------------------------------
// The cache and the pass
// ------------------------------------------------------------------------------------------------

/// `lookupCached`: the id a title resolved to, only a hit, never a search.
pub fn lookup_cached(ctx: &HumbleCtx, title: &str) -> Option<String> {
    let key = normalize_for_app_id_match(title);
    if key.is_empty() {
        return None;
    }
    let store = HumbleStore::SteamAppId.open(ctx)?;
    app_id_entry(&store, &key)?
        .app_id
        .filter(|id| !id.is_empty())
}

/// How the cache sees one key at the start of a pass.
enum Standing {
    /// A cached id.
    Hit,
    /// A miss recorded under the current term, not yet expired.
    FreshMiss,
    /// Absent, expired, recorded under an older term, or unusable: ask the store.
    Pending,
}

fn standing(entry: Option<&AppIdEntry>, now_ms: f64) -> Standing {
    let Some(entry) = entry else {
        return Standing::Pending;
    };
    match &entry.app_id {
        Some(id) if !id.is_empty() => Standing::Hit,
        None if entry.term_version.unwrap_or(1.0) >= f64::from(HUMBLE_APPID_TERM_VERSION)
            && now_ms - entry.checked_at < HUMBLE_APPID_MISS_TTL_MS =>
        {
            Standing::FreshMiss
        }
        _ => Standing::Pending,
    }
}

/// `resolvePending`: resolves what the cache cannot answer, for at most [`HUMBLE_APPID_RESOLVE_CAP`]
/// titles, one request at a time with [`HUMBLE_APPID_REQUEST_GAP_MS`] between them, stopping at the
/// first error, when `is_stale` turns true (a disconnect or a newer sync), and when shutdown begins.
///
/// Returns at once, with nothing started, when shutdown has already begun. Cache writes go through
/// [`crate::stores`] (the one store owner); an answer is cached with `checkedAt` read from `ctx.clock`
/// and the current term version, a miss as `appId: null`, an error never.
pub async fn resolve_pass(
    ctx: &HumbleCtx,
    titles: &[String],
    is_stale: &(dyn Fn() -> bool + Sync),
) -> ResolveOutcome {
    let _registrant = ctx.shutdown.register("humble-appid");
    let token = ctx.shutdown.token();
    let mut outcome = ResolveOutcome::default();
    if token.is_cancelled() {
        outcome.stopped_by_shutdown = true;
        return outcome;
    }

    // Titles that normalise to the same key are asked once, under the first title seen.
    let mut seen_keys: HashSet<String> = HashSet::new();
    let mut unique: Vec<(String, &str)> = Vec::new();
    for title in titles {
        let key = normalize_for_app_id_match(title);
        if !key.is_empty() && seen_keys.insert(key.clone()) {
            unique.push((key, title.as_str()));
        }
    }
    let total = unique.len();
    if total == 0 {
        return outcome;
    }

    let store = HumbleStore::SteamAppId.open(ctx);
    let mut pending: Vec<(String, &str)> = Vec::new();
    for (key, title) in unique {
        let entry = store.as_ref().and_then(|store| app_id_entry(store, &key));
        match standing(entry.as_ref(), ctx.clock.now_ms() as f64) {
            Standing::Hit => {
                outcome.cached += 1;
                outcome.resolved += 1;
            }
            Standing::FreshMiss => {
                outcome.cached += 1;
                outcome.misses += 1;
            }
            Standing::Pending => pending.push((key, title)),
        }
    }

    let mut answered = 0usize;
    let mut write_failed = store.is_none() && !pending.is_empty();
    for (index, (key, title)) in pending.iter().enumerate() {
        if index >= HUMBLE_APPID_RESOLVE_CAP || is_stale() {
            break;
        }
        if outcome.requested > 0 {
            tokio::select! {
                biased;
                () = token.cancelled() => {
                    outcome.stopped_by_shutdown = true;
                    break;
                }
                () = tokio::time::sleep(Duration::from_millis(HUMBLE_APPID_REQUEST_GAP_MS)) => {}
            }
        }
        outcome.requested += 1;
        let term = search_term_for(title);
        let searched = tokio::select! {
            biased;
            () = token.cancelled() => {
                outcome.stopped_by_shutdown = true;
                break;
            }
            result = search_store_apps(ctx, &term) => result,
        };
        let Ok(items) = searched else {
            outcome.errors += 1;
            break;
        };
        let app_id = pick_confident_app_id(title, &items);
        if let Some(store) = &store {
            let now = ctx.clock.now_ms();
            let entry = AppIdEntry {
                app_id: app_id.clone(),
                checked_at: now as f64,
                term_version: Some(f64::from(HUMBLE_APPID_TERM_VERSION)),
            };
            if put_app_id_entry(store, key, &entry, now).is_err() {
                write_failed = true;
            }
        }
        answered += 1;
        if app_id.is_some() {
            outcome.resolved += 1;
        } else {
            outcome.misses += 1;
        }
    }
    // A request that errored is not answered, so it stays deferred too.
    outcome.deferred = pending.len().saturating_sub(answered);
    if write_failed {
        ctx.warn("Humble: the Steam app id cache could not be written");
    }
    ctx.info(&format!(
        "Humble: resolved {}/{} Steam app ids ({} cached, {} misses, {} errors, {} deferred)",
        outcome.resolved, total, outcome.cached, outcome.misses, outcome.errors, outcome.deferred
    ));
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(name: &str, id: f64, kind: &str) -> SteamStoreSearchItem {
        SteamStoreSearchItem {
            kind: kind.to_string(),
            name: name.to_string(),
            id,
        }
    }

    /// `normalizeForAppIdMatch` -> `it.each`.
    #[test]
    fn normalize_for_app_id_match_titles() {
        for (input, expected) in [
            ("Portal 2\u{2122}", "portal 2"),
            ("Hades (Steam)", "hades"),
            ("Celeste - Steam Key", "celeste"),
            ("Celeste [Steam]", "celeste"),
            ("Celeste (Steam Key)", "celeste"),
            ("Celeste Steam Key", "celeste"),
            ("Pok\u{e9}mon-ish: Caf\u{e9}", "pokemon ish cafe"),
            ("Tom Clancy's\u{ae} X", "tom clancy s x"),
        ] {
            assert_eq!(normalize_for_app_id_match(input), expected, "{input}");
        }
    }

    /// `normalizeForAppIdMatch` -> keeps edition words and other parentheticals.
    #[test]
    fn normalize_for_app_id_match_keeps_edition_words_and_other_parentheticals() {
        assert_eq!(
            normalize_for_app_id_match("Celeste Deluxe Edition"),
            "celeste deluxe edition"
        );
        assert_eq!(normalize_for_app_id_match("Game (Demo)"), "game demo");
    }

    /// `normalizeForAppIdMatch` -> does not equate X with X Deluxe Edition.
    #[test]
    fn normalize_for_app_id_match_does_not_equate_x_with_x_deluxe_edition() {
        assert_ne!(
            normalize_for_app_id_match("X"),
            normalize_for_app_id_match("X Deluxe Edition")
        );
    }

    #[test]
    fn the_steam_suffix_is_stripped_in_every_shape_and_repeatedly_and_only_at_the_end() {
        for (input, term) in [
            ("Portal 2 (Steam)", "Portal 2"),
            ("Portal 2 (STEAM KEY)", "Portal 2"),
            ("Portal 2 [steam]", "Portal 2"),
            ("Portal 2 steam key", "Portal 2"),
            ("Portal 2 - Steam", "Portal 2"),
            ("Portal 2   -   steam key  ", "Portal 2"),
            ("Portal 2 (Steam) (Steam Key)", "Portal 2"),
            ("Portal 2 - Steam Key (Steam)", "Portal 2"),
            // Not at the end, not a suffix.
            ("Steam Hammer", "Steam Hammer"),
            ("(Steam) Portal 2", "(Steam) Portal 2"),
            ("Portal 2 (Steamy)", "Portal 2 (Steamy)"),
            // No whitespace before the token: the regex needs it for the word forms.
            ("Portalsteam key", "Portalsteam key"),
            // A non-ASCII look-alike never matches an ASCII letter.
            ("Portal 2 (\u{17f}team)", "Portal 2 (\u{17f}team)"),
        ] {
            assert_eq!(search_term_for(input), term, "{input}");
        }
    }

    #[test]
    fn the_search_term_keeps_punctuation_and_case_and_drops_trademark_symbols() {
        assert_eq!(
            search_term_for("Baldur's Gate\u{2122}: Dark Alliance (Steam)"),
            "Baldur's Gate: Dark Alliance"
        );
    }

    /// `pickConfidentAppId` -> returns the unique exact normalized match.
    #[test]
    fn pick_confident_app_id_returns_the_unique_exact_normalized_match() {
        assert_eq!(
            pick_confident_app_id(
                "Celeste",
                &[
                    app("Celeste Deluxe Edition", 1.0, "app"),
                    app("celeste", 504230.0, "app")
                ]
            ),
            Some("504230".to_string())
        );
    }

    /// `pickConfidentAppId` -> `it.each` rejects.
    #[test]
    fn pick_confident_app_id_rejects() {
        let cases: Vec<(&str, Vec<SteamStoreSearchItem>)> = vec![
            (
                "Hollow Knight",
                vec![app("Hollow Knight: Silksong", 1.0, "app")],
            ),
            ("Celeste", vec![app("Celeste Deluxe Edition", 1.0, "app")]),
            ("Portal", vec![app("Portal 2", 1.0, "app")]),
            ("Hades", vec![app("Hades II", 1.0, "app")]),
            ("Celeste", vec![app("Celeste", 1.0, "dlc")]),
            ("Celeste", vec![app("Celeste", 1.0, "bundle")]),
            (
                "DOOM",
                vec![app("DOOM", 1.0, "app"), app("DOOM", 2.0, "app")],
            ),
            ("Celeste", vec![]),
            ("", vec![app("", 1.0, "app")]),
        ];
        for (title, items) in cases {
            assert_eq!(pick_confident_app_id(title, &items), None, "{title}");
        }
    }

    /// `pickConfidentAppId` -> accepts the same id listed twice.
    #[test]
    fn pick_confident_app_id_accepts_the_same_id_listed_twice() {
        assert_eq!(
            pick_confident_app_id("DOOM", &[app("DOOM", 1.0, "app"), app("DOOM", 1.0, "app")]),
            Some("1".to_string())
        );
    }

    /// `searchSteamStoreApps response shape` -> parses a well-formed items array.
    #[test]
    fn search_parses_a_well_formed_items_array() {
        assert_eq!(
            parse_search_answer(
                200,
                br#"{"total":1,"items":[{"type":"app","name":"Portal","id":400}]}"#
            ),
            Ok(vec![app("Portal", 400.0, "app")])
        );
    }

    /// `searchSteamStoreApps response shape` -> throws (not an empty miss) on an HTML page, null and an
    /// object without items; and on a status outside 2xx and an unparseable body.
    #[test]
    fn search_is_an_error_not_an_empty_miss_on_a_bad_answer() {
        assert_eq!(
            parse_search_answer(200, b"<html>rate limited</html>"),
            Err(SearchFailure::Shape)
        );
        assert_eq!(parse_search_answer(200, b"null"), Err(SearchFailure::Shape));
        assert_eq!(parse_search_answer(200, b""), Err(SearchFailure::Shape));
        assert_eq!(parse_search_answer(200, b"[]"), Err(SearchFailure::Shape));
        assert_eq!(
            parse_search_answer(200, br#"{"total":0}"#),
            Err(SearchFailure::NoItems)
        );
        assert_eq!(
            parse_search_answer(500, br#"{"items":[]}"#),
            Err(SearchFailure::Status)
        );
        // An item that is not {type: string, name: string, id: finite number} is skipped.
        assert_eq!(
            parse_search_answer(
                200,
                br#"{"items":[null,{"type":"app","name":"A","id":"7"},{"type":"app","name":"B","id":8}]}"#
            ),
            Ok(vec![app("B", 8.0, "app")])
        );
    }

    #[test]
    fn the_request_is_the_one_axios_made() {
        let request = search_request("Portal 2");
        assert_eq!(
            request.url,
            "https://store.steampowered.com/api/storesearch/?term=Portal+2&l=english&cc=US"
        );
        assert_eq!(request.timeout, Duration::from_millis(8000));
        assert!(request.follow_redirects);
        assert!(request
            .headers
            .contains(&("User-Agent".to_string(), "GameLib".to_string())));
    }

    #[test]
    fn the_miss_ttl_the_gap_the_cap_and_the_term_version_are_the_typescripts() {
        assert_eq!(HUMBLE_APPID_MISS_TTL_MS, 604_800_000.0);
        assert_eq!(HUMBLE_APPID_REQUEST_GAP_MS, 350);
        assert_eq!(HUMBLE_APPID_RESOLVE_CAP, 40);
        assert_eq!(HUMBLE_APPID_TERM_VERSION, 2);
    }

    fn entry(app_id: Option<&str>, checked_at: f64, term_version: Option<f64>) -> AppIdEntry {
        AppIdEntry {
            app_id: app_id.map(str::to_string),
            checked_at,
            term_version,
        }
    }

    #[test]
    fn standing_follows_the_ttl_and_the_term_version() {
        const NOW: f64 = 2_000_000_000_000.0;
        let day = 86_400_000.0;
        assert!(matches!(standing(None, NOW), Standing::Pending));
        assert!(matches!(
            standing(Some(&entry(Some("7"), 0.0, None)), NOW),
            Standing::Hit
        ));
        // A fresh miss at the current term waits; at the TTL, or from an older term, it is asked again.
        assert!(matches!(
            standing(Some(&entry(None, NOW - 6.0 * day, Some(2.0))), NOW),
            Standing::FreshMiss
        ));
        assert!(matches!(
            standing(Some(&entry(None, NOW - 7.0 * day, Some(2.0))), NOW),
            Standing::Pending
        ));
        assert!(matches!(
            standing(Some(&entry(None, NOW - day, None)), NOW),
            Standing::Pending
        ));
        // An empty id is neither a hit nor a miss.
        assert!(matches!(
            standing(Some(&entry(Some(""), NOW, Some(2.0))), NOW),
            Standing::Pending
        ));
    }
}
