//! The ITAD cache rules over [`CacheView`] (`itadCache.ts`): the key builders, the one-hour freshness,
//! the 30-day gid TTL and its 24-hour miss TTL, the 500-entry cap with its `index` key, and the
//! Retry-After parse. The two stores' own parameters (43200-minute lifespan, `invalidate: Never`) are
//! [`crate::cache_view::ITAD_PRICES`] and [`crate::cache_view::ITAD_STEAM_GIDS`]; the TS entry rules
//! sit on top of them, so a v0.10 cache file is read and extended byte-compatibly.
//!
//! No timers: the 429 block expires by a timestamp compared against the clock.

use sha2::{Digest, Sha256};

use crate::cache_view::{parse_js_date, CacheView};
use gamelib_store::json::{Json, Num, Obj};

/// D-08: a search or deals entry younger than this is fresh.
pub const FRESH_MS: f64 = 60.0 * 60.0 * 1000.0;
/// D-10: an appid to gid mapping is fresh this long.
pub const GID_TTL_MS: f64 = 30.0 * 24.0 * 60.0 * 60.0 * 1000.0;
/// D-10: an unmapped (null) appid is retried after this long.
pub const GID_MISS_TTL_MS: f64 = 24.0 * 60.0 * 60.0 * 1000.0;
/// The most entries `itad_prices` keeps before the oldest is deleted.
pub const PRICES_ENTRY_CAP: usize = 500;
const RETRY_AFTER_DEFAULT_MS: f64 = 60_000.0;
const RETRY_AFTER_MIN_MS: f64 = 1_000.0;
const RETRY_AFTER_MAX_MS: f64 = 15.0 * 60_000.0;
const INDEX_KEY: &str = "index";

/// ECMAScript `WhiteSpace` and `LineTerminator`: what `String.prototype.trim` and the regex `\s`
/// match. It differs from Rust's `char::is_whitespace` (it has U+FEFF and not U+0085).
pub fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\u{9}'..='\u{D}' | '\u{20}' | '\u{A0}' | '\u{1680}' | '\u{2028}' | '\u{2029}'
    ) || matches!(c, '\u{2000}'..='\u{200A}')
        || matches!(c, '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

/// `q.trim().toLowerCase().replace(/\s+/g, ' ')`.
pub fn normalize_query(query: &str) -> String {
    let lowered = query.trim_matches(is_js_space).to_lowercase();
    let mut out = String::with_capacity(lowered.len());
    let mut in_space = false;
    for c in lowered.chars() {
        if is_js_space(c) {
            if !in_space {
                out.push(' ');
            }
            in_space = true;
        } else {
            out.push(c);
            in_space = false;
        }
    }
    out
}

/// `search:<country>:<sha256 hex of the normalised query, first 32>`. Hashed so a dot in a title
/// never reaches the store key (a dot is a path separator).
pub fn search_cache_key(country: &str, query: &str) -> String {
    let digest = Sha256::digest(normalize_query(query).as_bytes());
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    format!("search:{country}:{}", &hex[..32])
}

/// `deals:<country>:<gid>`. The caller guarantees `gid` is a validated UUID.
pub fn deals_cache_key(country: &str, gid: &str) -> String {
    format!("deals:{country}:{gid}")
}

/// `app<id>`. The caller guarantees `app_id` is digits only.
pub fn gid_cache_key(app_id: &str) -> String {
    format!("app{app_id}")
}

/// A stored `{ data, fetchedAt }` entry. Either part may be absent in a damaged file, which JS reads
/// as `undefined`.
#[derive(Debug, Clone)]
pub struct Entry {
    pub data: Option<Json>,
    pub fetched_at: Option<Json>,
}

impl Entry {
    /// `now - entry.fetchedAt < fresh_ms`; a missing or non-numeric `fetchedAt` is `NaN` in JS, so
    /// never fresh.
    pub fn is_fresh(&self, now: u64, fresh_ms: f64) -> bool {
        self.fetched_at
            .as_ref()
            .and_then(Json::as_f64)
            .is_some_and(|fetched| (now as f64 - fetched) < fresh_ms)
    }
}

/// `store.get(key)`: an entry object, or `None` for an absent key or a value that is not an object
/// (JS reads `undefined` for every field of one, which no reader here tells from absence).
pub fn read_entry(view: &CacheView, key: &str) -> Option<Entry> {
    match view.get_opt(key)? {
        Json::Obj(object) => Some(Entry {
            data: object.get("data").cloned(),
            fetched_at: object.get("fetchedAt").cloned(),
        }),
        _ => None,
    }
}

fn entry_json(data: Json, now: u64) -> Json {
    let mut object = Obj::new();
    object.insert_js("data", data);
    object.insert_js("fetchedAt", Json::Num(Num::U(now)));
    Json::Obj(object)
}

/// Serialises [`write_price_entry`]. The TS ran this read-modify-write on the one Node thread; here
/// several shell worker threads call it for different keys, and an unserialised `index` update
/// from one would overwrite the other's, leaving an entry in no index (never evicted) and the cap
/// exceeded. Module-level because each op opens its own [`CacheView`] over the same store.
fn write_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

/// `writePriceEntry`: the entry, then the `index` key list (the key moved to the end), deleting the
/// oldest while the list is over [`PRICES_ENTRY_CAP`]. A failed write is dropped: the cache is a
/// best-effort copy and the answer is already in hand.
pub fn write_price_entry(view: &CacheView, key: &str, data: Json, now: u64) {
    let _serialised = write_lock();
    let _ = view.set(key, entry_json(data, now));
    let prior: Vec<String> = match read_entry(view, INDEX_KEY).and_then(|e| e.data) {
        Some(Json::Arr(items)) => items
            .into_iter()
            .filter_map(|item| match item {
                Json::Str(text) => Some(text),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    };
    let mut index: Vec<String> = prior.into_iter().filter(|k| k != key).collect();
    index.push(key.to_string());
    while index.len() > PRICES_ENTRY_CAP {
        let oldest = index.remove(0);
        let _ = view.delete(&oldest);
    }
    let list = Json::Arr(index.into_iter().map(Json::Str).collect());
    let _ = view.set(INDEX_KEY, entry_json(list, now));
}

/// `store.set(app<id>, { data: gid | null, fetchedAt })` for the gid store (no index).
pub fn write_gid_entry(view: &CacheView, key: &str, gid: Option<&str>, now: u64) {
    let data = gid.map_or(Json::Null, |g| Json::Str(g.to_string()));
    let _ = view.set(key, entry_json(data, now));
}

/// `isGidEntryFresh`: a mapped entry lives [`GID_TTL_MS`], an unmapped (null) one [`GID_MISS_TTL_MS`].
pub fn is_gid_entry_fresh(entry: &Entry, now: u64) -> bool {
    let ttl = if matches!(entry.data, Some(Json::Null)) {
        GID_MISS_TTL_MS
    } else {
        GID_TTL_MS
    };
    entry.is_fresh(now, ttl)
}

/// `parseRetryAfter`: delta-seconds or an HTTP date, clamped to 1 s..15 min, 60 s when absent or
/// unreadable. The date forms read are the JS long form, ISO 8601 and RFC 2822 (the HTTP-date a
/// server sends); `Date.parse` accepts more legacy shapes than these, which fall to the default.
pub fn parse_retry_after(header: Option<&str>, now: u64) -> u64 {
    let mut ms = RETRY_AFTER_DEFAULT_MS;
    if let Some(header) = header {
        let trimmed = header.trim_matches(is_js_space);
        if !trimmed.is_empty() && trimmed.bytes().all(|b| b.is_ascii_digit()) {
            ms = trimmed.parse::<f64>().unwrap_or(f64::INFINITY) * 1000.0;
        } else if let Some(date) = parse_date_ms(trimmed) {
            ms = date as f64 - now as f64;
        }
    }
    ms.clamp(RETRY_AFTER_MIN_MS, RETRY_AFTER_MAX_MS) as u64
}

fn parse_date_ms(text: &str) -> Option<i64> {
    parse_js_date(text).or_else(|| {
        jiff::fmt::rfc2822::DateTimeParser::new()
            .parse_timestamp(text)
            .ok()
            .map(|t| t.as_millisecond())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_query_is_normalised_as_the_ts_did() {
        assert_eq!(normalize_query("  PORTAL  "), "portal");
        assert_eq!(normalize_query("Half \t Life\n2"), "half life 2");
        // U+FEFF trims in JS and U+0085 does not.
        assert_eq!(normalize_query("\u{FEFF}a\u{FEFF}"), "a");
        assert_eq!(normalize_query("a\u{85}b"), "a\u{85}b");
        assert_eq!(normalize_query(""), "");
    }

    #[test]
    fn the_search_key_is_country_and_the_first_32_hex_of_the_sha256() {
        // sha256("portal") = d0960501f8971be812f2e5494426e08c...; the golden's cache file key.
        assert_eq!(
            search_cache_key("US", "  PORTAL "),
            "search:US:d0960501f8971be812f2e5494426e08c"
        );
        assert_eq!(
            search_cache_key("US", "portal"),
            search_cache_key("US", "Portal")
        );
        assert_ne!(
            search_cache_key("DE", "portal"),
            search_cache_key("US", "portal")
        );
    }

    #[test]
    fn deals_and_gid_keys() {
        assert_eq!(deals_cache_key("AU", "abc"), "deals:AU:abc");
        assert_eq!(gid_cache_key("220"), "app220");
    }

    #[test]
    fn freshness_is_strictly_under_the_window_and_a_missing_stamp_is_never_fresh() {
        let at = |ms: u64| Entry {
            data: None,
            fetched_at: Some(Json::Num(Num::U(ms))),
        };
        let now = 10_000_000;
        assert!(at(now - 3_599_999).is_fresh(now, FRESH_MS));
        assert!(!at(now - 3_600_000).is_fresh(now, FRESH_MS));
        let none = Entry {
            data: None,
            fetched_at: None,
        };
        assert!(!none.is_fresh(now, FRESH_MS));
        let text = Entry {
            data: None,
            fetched_at: Some(Json::Str("x".into())),
        };
        assert!(!text.is_fresh(now, FRESH_MS));
    }

    #[test]
    fn a_gid_hit_lives_30_days_and_a_miss_one_day() {
        let day = 24 * 60 * 60 * 1000;
        let now = 100 * day;
        let mapped = Entry {
            data: Some(Json::Str("g".into())),
            fetched_at: Some(Json::Num(Num::U(now - 29 * day))),
        };
        assert!(is_gid_entry_fresh(&mapped, now));
        let old = Entry {
            fetched_at: Some(Json::Num(Num::U(now - 31 * day))),
            ..mapped.clone()
        };
        assert!(!is_gid_entry_fresh(&old, now));
        let miss = Entry {
            data: Some(Json::Null),
            fetched_at: Some(Json::Num(Num::U(now - 23 * 60 * 60 * 1000))),
        };
        assert!(is_gid_entry_fresh(&miss, now));
        let old_miss = Entry {
            fetched_at: Some(Json::Num(Num::U(now - day))),
            ..miss
        };
        assert!(!is_gid_entry_fresh(&old_miss, now));
    }

    #[test]
    fn retry_after_is_seconds_or_a_date_clamped_with_a_60_second_default() {
        let now = 1_000_000_000_000;
        assert_eq!(parse_retry_after(None, now), 60_000);
        assert_eq!(parse_retry_after(Some("30"), now), 30_000);
        assert_eq!(parse_retry_after(Some(" 120 "), now), 120_000);
        assert_eq!(parse_retry_after(Some("0"), now), 1_000);
        assert_eq!(parse_retry_after(Some("99999"), now), 900_000);
        assert_eq!(parse_retry_after(Some("soon"), now), 60_000);
        assert_eq!(parse_retry_after(Some(""), now), 60_000);
        // A digit run too long for a double is infinite and clamps to the ceiling.
        assert_eq!(parse_retry_after(Some(&"9".repeat(400)), now), 900_000);
        // An HTTP date 90 s ahead, one in the past, one far ahead.
        let at = |ms: i64| {
            let stamp = jiff::Timestamp::from_millisecond(ms).unwrap();
            jiff::fmt::rfc2822::to_string(&stamp.to_zoned(jiff::tz::TimeZone::UTC)).unwrap()
        };
        assert_eq!(
            parse_retry_after(Some(&at(now as i64 + 90_000)), now),
            90_000
        );
        assert_eq!(
            parse_retry_after(Some(&at(now as i64 - 90_000)), now),
            1_000
        );
        assert_eq!(
            parse_retry_after(Some(&at(now as i64 + 9_000_000)), now),
            900_000
        );
        assert_eq!(
            parse_retry_after(
                Some("Sat Nov 21 2026 18:07:08 GMT+0000 (Coordinated Universal Time)"),
                1_795_400_000_000
            ),
            1_000
        );
    }
}
