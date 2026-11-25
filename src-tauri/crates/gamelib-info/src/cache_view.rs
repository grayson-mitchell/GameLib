//! The TS `CacheStore` (`src/backend/cache.ts`) over the shipped StoreHost, never with file I/O of
//! its own (D-18).
//!
//! A cache entry is two keys in `<userData>/store_cache/<name>.json`: the value at `key` and a
//! timestamp at `__timestamp.<key>`. Both go through the host's dot-path store, so a key containing
//! `.` (a title such as `S.T.A.L.K.E.R.`) nests, and the timestamps nest under one `__timestamp`
//! object, exactly as conf wrote them.
//!
//! Reads follow `CacheStore.get`: the fallback when the key is absent, or when a lifespan is set and
//! the timestamp is absent; on expiry (age in minutes greater than the lifespan) both keys are
//! deleted and the fallback returned only when the store's invalidate check says so. When the check
//! says no (the CrossOver index, `() => false`) the expired value is returned and kept, which is
//! what TS does: control falls through to `return this.current_store.get(key)`.

use std::io;
use std::path::Path;
use std::sync::Arc;

use gamelib_core::clock::Clock;
use gamelib_store::host::{Origin, Store, StoreHost};
use gamelib_store::json::{Json, Num};
use gamelib_store::ops::Op;

/// The store's `invalidateCheck`, which decides whether an expired entry is deleted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InvalidateCheck {
    /// The default, `() => true`: an expired entry is always deleted.
    Always,
    /// `() => false`: an expired entry is kept and still served.
    Never,
    /// `(data) => !data`: only a falsy value (JS truthiness) is deleted; a truthy expired value is
    /// kept and served.
    WhenFalsy,
}

impl InvalidateCheck {
    fn deletes(self, value: &Json) -> bool {
        match self {
            InvalidateCheck::Always => true,
            InvalidateCheck::Never => false,
            InvalidateCheck::WhenFalsy => is_falsy(value),
        }
    }
}

/// JS falsiness of a parsed JSON value: `null`, `false`, `0`, `-0`, `NaN` and `""`.
pub(crate) fn is_falsy(value: &Json) -> bool {
    match value {
        Json::Null => true,
        Json::Bool(b) => !*b,
        Json::Num(Num::U(n)) => *n == 0,
        Json::Num(Num::I(n)) => *n == 0,
        Json::Num(Num::F(f)) => *f == 0.0 || f.is_nan(),
        Json::Str(s) => s.is_empty(),
        Json::Arr(_) | Json::Obj(_) => false,
    }
}

/// One cache store's parameters, as its TS `new CacheStore(name, lifespan, { invalidateCheck })`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CacheParams {
    /// The file name under `store_cache/`, which is also the renderer's store name.
    pub store: &'static str,
    /// Minutes an entry lives. `None` (TS `null`) and `Some(0)` (falsy) mean no expiry.
    pub lifespan_min: Option<u64>,
    pub invalidate: InvalidateCheck,
}

/// `wiki_game_info/stores.ts`: 30 days, the default check.
pub const WIKIGAMEINFO: CacheParams = CacheParams {
    store: "wikigameinfo",
    lifespan_min: Some(60 * 24 * 30),
    invalidate: InvalidateCheck::Always,
};
/// `wiki_game_info/umu/stores.ts`: 6 hours, `(data) => !data`.
pub const UMU: CacheParams = CacheParams {
    store: "umu",
    lifespan_min: Some(60 * 6),
    invalidate: InvalidateCheck::WhenFalsy,
};
/// `crossover_index/stores.ts`: 24 hours, `() => false`.
pub const CROSSOVER_INDEX: CacheParams = CacheParams {
    store: "crossover_index",
    lifespan_min: Some(60 * 24),
    invalidate: InvalidateCheck::Never,
};
/// `storeSearch/stores.ts`: 30 days, `() => false`.
pub const ITAD_PRICES: CacheParams = CacheParams {
    store: "itad_prices",
    lifespan_min: Some(60 * 24 * 30),
    invalidate: InvalidateCheck::Never,
};
/// `storeSearch/stores.ts`: 30 days, `() => false`.
pub const ITAD_STEAM_GIDS: CacheParams = CacheParams {
    store: "itad_steam_gids",
    lifespan_min: Some(60 * 24 * 30),
    invalidate: InvalidateCheck::Never,
};

/// `systeminfo/gpu/pci_ids.ts`: the device-name cache, 7 days, the default check. The on-disk name is
/// fixed (87 D-07), so a rolled-back build reads what Rust wrote.
pub const PCI_IDS_DEVICE: CacheParams = CacheParams {
    store: "pci_ids_device",
    lifespan_min: Some(60 * 24 * 7),
    invalidate: InvalidateCheck::Always,
};
/// `systeminfo/gpu/pci_ids.ts`: the vendor-name cache, 7 days, the default check.
pub const PCI_IDS_VENDOR: CacheParams = CacheParams {
    store: "pci_ids_vendor",
    lifespan_min: Some(60 * 24 * 7),
    invalidate: InvalidateCheck::Always,
};

/// One cache store, opened through the host.
pub struct CacheView {
    store: Arc<Store>,
    params: CacheParams,
    clock: Arc<dyn Clock>,
}

fn timestamp_key(key: &str) -> String {
    format!("__timestamp.{key}")
}

impl CacheView {
    /// Opens `<user_data>/store_cache/<params.store>.json` through `host`. A missing file is an
    /// empty store; a file that is not a JSON object is `InvalidData` and is never overwritten.
    pub fn open(
        host: &StoreHost,
        user_data: &Path,
        params: CacheParams,
        clock: Arc<dyn Clock>,
    ) -> io::Result<CacheView> {
        let store = host.open_cache(&user_data.join("store_cache"), params.store)?;
        Ok(CacheView {
            store,
            params,
            clock,
        })
    }

    pub fn params(&self) -> &CacheParams {
        &self.params
    }

    /// `CacheStore.get(key)`: `None` is the caller's fallback (TS `undefined`).
    pub fn get_opt(&self, key: &str) -> Option<Json> {
        let value = self.store.get(key)?;
        let Some(lifespan) = self.params.lifespan_min.filter(|m| *m != 0) else {
            return Some(value);
        };
        let stamp = match self.store.get(&timestamp_key(key)) {
            Some(Json::Str(s)) if !s.is_empty() => Stamp::Text(s),
            Some(Json::Num(n)) if !is_falsy(&Json::Num(n.clone())) => Stamp::Millis(num_ms(&n)),
            Some(other) if !is_falsy(&other) => Stamp::Unreadable,
            // Absent, null, false, 0 or "": JS `!lastUpdateTimestamp`.
            _ => return None,
        };
        let updated_ms = match stamp {
            Stamp::Text(s) => parse_js_date(&s),
            Stamp::Millis(ms) => ms,
            Stamp::Unreadable => None,
        };
        // `new Date(garbage).getTime()` is NaN and `NaN > lifespan` is false: the value is served.
        let expired = updated_ms.is_some_and(|ms| {
            let minutes = (self.clock.now_ms() as f64 - ms as f64) / 1000.0 / 60.0;
            minutes > lifespan as f64
        });
        if expired && self.params.invalidate.deletes(&value) {
            // Best effort, as TS: a failed delete must not turn a read into an error.
            let _ = self.store.remove(key);
            let _ = self.store.remove(&timestamp_key(key));
            return None;
        }
        Some(value)
    }

    /// `CacheStore.get(key, fallback)`.
    pub fn get(&self, key: &str, fallback: Json) -> Json {
        self.get_opt(key).unwrap_or(fallback)
    }

    /// `CacheStore.set(key, value)`: the value at `key`, then the `Date()` text at
    /// `__timestamp.<key>`, as two dot-path writes. A read-only store refuses silently (TS
    /// `refusesDiskWrite`).
    pub fn set(&self, key: &str, value: Json) -> io::Result<()> {
        if self.store.read_only().is_some() {
            return Ok(());
        }
        let stamp = Json::Str(js_date_string(self.clock.now_ms() as i64));
        self.store.set(key, value)?;
        self.store.set(&timestamp_key(key), stamp)
    }

    /// `CacheStore.delete(key)`: removes the value and its timestamp. An absent key is not an
    /// error.
    pub fn delete(&self, key: &str) -> io::Result<()> {
        if self.store.read_only().is_some() {
            return Ok(());
        }
        self.store.remove(key)?;
        self.store.remove(&timestamp_key(key))?;
        Ok(())
    }

    /// `CacheStore.clear()`: the store becomes `{}` (the version envelope is stamped back on write).
    pub fn clear(&self) -> io::Result<()> {
        if self.store.read_only().is_some() {
            return Ok(());
        }
        self.store
            .apply(Op::Clear, Origin::Rust)
            .map(|_| ())
            .map_err(io::Error::from)
    }

    /// `CacheStore.has(key)`: the key exists, whatever its age.
    pub fn has(&self, key: &str) -> bool {
        self.store.get(key).is_some()
    }

    /// `CacheStore.entries()`: every top-level entry in file order, without the version envelope
    /// and without the timestamp bookkeeping (the nested `__timestamp` object a dot-path write
    /// produces, and any literal `__timestamp.*` key).
    pub fn entries(&self) -> Vec<(String, Json)> {
        self.store
            .snapshot()
            .into_iter()
            .filter(|(k, _)| k != "__timestamp" && !k.starts_with("__timestamp."))
            .collect()
    }
}

enum Stamp {
    Text(String),
    Millis(Option<i64>),
    Unreadable,
}

fn num_ms(n: &Num) -> Option<i64> {
    match n {
        Num::U(u) => i64::try_from(*u).ok(),
        Num::I(i) => Some(*i),
        Num::F(f) if f.is_finite() => Some(f.trunc() as i64),
        Num::F(_) => None,
    }
}

const WEEKDAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/// JS `Date()` as Node prints it under `TZ=UTC`: `Sat Nov 21 2026 18:07:08 GMT+0000 (Coordinated
/// Universal Time)`. TS wrote the local-time form of the same instant; Rust has no long zone names,
/// so it writes the UTC one. Both parse to the same instant (a quirk todo records the difference).
/// A millisecond count outside JS's date range is `Invalid Date`, as in JS.
pub fn js_date_string(ms: i64) -> String {
    let Ok(stamp) = jiff::Timestamp::from_millisecond(ms) else {
        return "Invalid Date".to_string();
    };
    let dt = jiff::tz::Offset::UTC.to_datetime(stamp);
    let weekday = WEEKDAYS
        .get(usize::from(dt.weekday().to_sunday_zero_offset() as u8))
        .copied()
        .unwrap_or("Sun");
    let month = MONTHS
        .get(usize::from((dt.month() - 1) as u8))
        .copied()
        .unwrap_or("Jan");
    format!(
        "{weekday} {month} {:02} {:04} {:02}:{:02}:{:02} GMT+0000 (Coordinated Universal Time)",
        dt.day(),
        dt.year(),
        dt.hour(),
        dt.minute(),
        dt.second()
    )
}

const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// Parses a cache timestamp to epoch milliseconds, as `new Date(text).getTime()` did.
///
/// Accepted: the JS `Date()` long form, UTC or local (`Sat Nov 21 2026 18:07:08 GMT+0000
/// (Coordinated Universal Time)`, `... GMT+1300 (New Zealand Daylight Time)`), where the
/// parenthetical is ignored and the numeric offset decides the instant; and ISO 8601 (`...Z`,
/// `...+01:00`; a date-time with no offset is read as UTC, because the crate has no time zone to
/// read it in). Anything else is `None`.
pub fn parse_js_date(text: &str) -> Option<i64> {
    let text = text.trim();
    parse_long_form(text).or_else(|| parse_iso(text))
}

fn parse_long_form(text: &str) -> Option<i64> {
    let body = match text.find('(') {
        Some(i) => &text[..i],
        None => text,
    };
    let parts: Vec<&str> = body.split_whitespace().collect();
    // Weekday Month DD YYYY HH:MM:SS GMT+HHMM
    let [_weekday, month, day, year, clock, zone] = parts.as_slice() else {
        return None;
    };
    let month = MONTHS.iter().position(|m| m.eq_ignore_ascii_case(month))? as i8 + 1;
    let day: i8 = day.parse().ok()?;
    let year: i16 = year.parse().ok()?;
    let mut hms = clock.split(':');
    let hour: i8 = hms.next()?.parse().ok()?;
    let minute: i8 = hms.next()?.parse().ok()?;
    let second: i8 = hms.next()?.parse().ok()?;
    if hms.next().is_some() {
        return None;
    }
    let offset = parse_gmt_offset(zone)?;
    let civil = jiff::civil::DateTime::new(year, month, day, hour, minute, second, 0).ok()?;
    let stamp = offset.to_timestamp(civil).ok()?;
    Some(stamp.as_millisecond())
}

/// `GMT`, `GMT+1300` or `GMT-0500` as a fixed offset.
fn parse_gmt_offset(zone: &str) -> Option<jiff::tz::Offset> {
    let rest = zone.strip_prefix("GMT")?;
    if rest.is_empty() {
        return Some(jiff::tz::Offset::UTC);
    }
    let (sign, digits) = match (rest.strip_prefix('+'), rest.strip_prefix('-')) {
        (Some(d), _) => (1i32, d),
        (_, Some(d)) => (-1i32, d),
        _ => return None,
    };
    if digits.len() != 4 || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let hours: i32 = digits[..2].parse().ok()?;
    let minutes: i32 = digits[2..].parse().ok()?;
    jiff::tz::Offset::from_seconds(sign * (hours * 3600 + minutes * 60)).ok()
}

fn parse_iso(text: &str) -> Option<i64> {
    if let Ok(ts) = text.parse::<jiff::Timestamp>() {
        return Some(ts.as_millisecond());
    }
    if let Ok(dt) = text.parse::<jiff::civil::DateTime>() {
        return jiff::tz::Offset::UTC
            .to_timestamp(dt)
            .ok()
            .map(|t| t.as_millisecond());
    }
    if let Ok(d) = text.parse::<jiff::civil::Date>() {
        return jiff::tz::Offset::UTC
            .to_timestamp(d.at(0, 0, 0, 0))
            .ok()
            .map(|t| t.as_millisecond());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOV_21_2026_180708_UTC_MS: i64 = 1_795_284_428_000;

    #[test]
    fn parses_the_utc_long_form() {
        assert_eq!(
            parse_js_date("Sat Nov 21 2026 18:07:08 GMT+0000 (Coordinated Universal Time)"),
            Some(NOV_21_2026_180708_UTC_MS)
        );
    }

    #[test]
    fn a_local_long_form_uses_its_numeric_offset_and_ignores_the_parenthetical() {
        // 13:07:08 at GMT-0500 is 18:07:08 UTC.
        assert_eq!(
            parse_js_date("Sat Nov 21 2026 13:07:08 GMT-0500 (Eastern Standard Time)"),
            Some(NOV_21_2026_180708_UTC_MS)
        );
        assert_eq!(
            parse_js_date("Sat Nov 21 2026 13:07:08 GMT-0500 (a nonsense parenthetical)"),
            Some(NOV_21_2026_180708_UTC_MS)
        );
        // A real operator entry: New Zealand daylight time is +13:00.
        assert_eq!(
            parse_js_date("Tue Nov 17 2026 21:32:56 GMT+1300 (New Zealand Daylight Time)"),
            Some(1_794_904_376_000)
        );
        assert_eq!(
            parse_js_date("Sat Nov 21 2026 18:07:08 GMT+0000"),
            Some(NOV_21_2026_180708_UTC_MS)
        );
    }

    #[test]
    fn parses_iso_8601() {
        assert_eq!(
            parse_js_date("2026-11-21T18:07:08Z"),
            Some(NOV_21_2026_180708_UTC_MS)
        );
        assert_eq!(
            parse_js_date("2026-11-21T19:07:08+01:00"),
            Some(NOV_21_2026_180708_UTC_MS)
        );
        assert_eq!(
            parse_js_date("2026-11-21T18:07:08.250Z"),
            Some(NOV_21_2026_180708_UTC_MS + 250)
        );
        // No offset: UTC (the crate has no zone to read it in).
        assert_eq!(
            parse_js_date("2026-11-21T18:07:08"),
            Some(NOV_21_2026_180708_UTC_MS)
        );
    }

    #[test]
    fn rejects_what_is_not_a_date() {
        assert_eq!(parse_js_date(""), None);
        assert_eq!(parse_js_date("yesterday"), None);
        assert_eq!(parse_js_date("Sat Foo 21 2026 18:07:08 GMT+0000"), None);
        assert_eq!(parse_js_date("Sat Nov 32 2026 18:07:08 GMT+0000"), None);
        assert_eq!(parse_js_date("Sat Nov 21 2026 18:07:08 GMT+00"), None);
    }

    #[test]
    fn falsiness_follows_js() {
        assert!(is_falsy(&Json::Null));
        assert!(is_falsy(&Json::Bool(false)));
        assert!(is_falsy(&Json::Str(String::new())));
        assert!(is_falsy(&Json::Num(Num::U(0))));
        assert!(is_falsy(&Json::Num(Num::F(-0.0))));
        assert!(!is_falsy(&Json::Str("0".into())));
        assert!(!is_falsy(&Json::Arr(Vec::new())));
        assert!(!is_falsy(&Json::Num(Num::I(-1))));
    }
}
