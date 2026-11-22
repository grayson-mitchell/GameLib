//! D-09: the trust-boundary validator for the CrossOver compatibility index, ported from
//! `src/backend/crossover_index/schema.ts` (a zod schema). The payload is remotely published (or
//! bundled) and drives a user-facing claim ("this game won't run"), so every bound is a mitigation, not
//! styling. DO NOT LOOSEN any of them (T-86-44; the five rejection goldens in `golden_crossover.rs`
//! prove each one):
//!
//! - `version` is exactly the number 1 (a shape-drifted payload from a future publish is refused);
//! - `generatedAt` is an ISO 8601 date-time in UTC (`z.iso.datetime()`: `YYYY-MM-DDTHH:MM:SS[.f+]Z`);
//! - `entries` holds at least 1000 records (a truncated payload is refused);
//! - each record has a non-empty `name`, an integer `rating` from 1 to 5 and, when present, a string
//!   `steamid`. Unknown keys are dropped, as zod's default object does.
//!
//! The validated value is what gets stored: it is rebuilt from the parsed fields in the schema's key
//! order (`version`, `generatedAt`, `entries`; `name`, `rating`, `steamid`), which is what zod's output
//! was, so the cache file is byte-identical to the one the TS wrote.

use gamelib_store::json::{Json, Num, Obj};
use serde_json::Value;

/// The one accepted `version`.
pub const VERSION: f64 = 1.0;
/// Fewer entries than this is a truncated payload. DO NOT LOOSEN.
pub const MIN_ENTRIES: usize = 1000;
/// The lowest and highest rating an entry may carry. DO NOT LOOSEN.
pub const RATING_MIN: f64 = 1.0;
pub const RATING_MAX: f64 = 5.0;

/// One record of the index.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub name: String,
    pub rating: u8,
    pub steamid: Option<String>,
}

/// A validated index payload.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Index {
    pub generated_at: String,
    pub entries: Vec<Entry>,
}

/// Why a payload was refused. The word goes to the log; nothing the server sent does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reject {
    /// Not an object, or `entries` not a list, or an entry not an object.
    Shape,
    Version,
    GeneratedAt,
    /// Fewer than [`MIN_ENTRIES`].
    TooFewEntries,
    /// An entry with an empty or non-string name, a non-string `steamid`, or a rating that is not an
    /// integer from [`RATING_MIN`] to [`RATING_MAX`].
    Entry,
}

impl Reject {
    pub fn word(self) -> &'static str {
        match self {
            Reject::Shape => "shape",
            Reject::Version => "version",
            Reject::GeneratedAt => "generatedAt",
            Reject::TooFewEntries => "too few entries",
            Reject::Entry => "entry",
        }
    }
}

/// `crossoverIndexSchema.safeParse(value)`.
pub fn validate(value: &Value) -> Result<Index, Reject> {
    let object = value.as_object().ok_or(Reject::Shape)?;
    // `z.literal(1)`: JSON `1` and `1.0` are both the JS number 1.
    match object.get("version") {
        Some(Value::Number(n)) if n.as_f64() == Some(VERSION) => {}
        Some(_) => return Err(Reject::Version),
        None => return Err(Reject::Shape),
    }
    let generated_at = match object.get("generatedAt") {
        Some(Value::String(s)) => s.as_str(),
        _ => return Err(Reject::GeneratedAt),
    };
    if !is_iso_datetime_utc(generated_at) {
        return Err(Reject::GeneratedAt);
    }
    let list = match object.get("entries") {
        Some(Value::Array(list)) => list,
        _ => return Err(Reject::Shape),
    };
    let mut entries = Vec::with_capacity(list.len());
    for item in list {
        entries.push(validate_entry(item)?);
    }
    if entries.len() < MIN_ENTRIES {
        return Err(Reject::TooFewEntries);
    }
    Ok(Index {
        generated_at: generated_at.to_string(),
        entries,
    })
}

fn validate_entry(item: &Value) -> Result<Entry, Reject> {
    let object = item.as_object().ok_or(Reject::Shape)?;
    let name = match object.get("name") {
        Some(Value::String(s)) if !s.is_empty() => s.clone(),
        _ => return Err(Reject::Entry),
    };
    // `z.number().int().min(1).max(5)`: JSON `3` and `3.0` are both the integer 3.
    let rating = match object.get("rating") {
        Some(Value::Number(n)) => match n.as_f64() {
            Some(r) if r.fract() == 0.0 && (RATING_MIN..=RATING_MAX).contains(&r) => r as u8,
            _ => return Err(Reject::Entry),
        },
        _ => return Err(Reject::Entry),
    };
    let steamid = match object.get("steamid") {
        None => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(_) => return Err(Reject::Entry),
    };
    Ok(Entry {
        name,
        rating,
        steamid,
    })
}

impl Index {
    /// The stored form of the payload (`{ version, generatedAt, entries }`), in schema key order.
    pub fn to_json(&self) -> Json {
        let entries = self
            .entries
            .iter()
            .map(|entry| {
                let mut object = Obj::new();
                object.insert_js("name", Json::Str(entry.name.clone()));
                object.insert_js("rating", Json::Num(Num::U(u64::from(entry.rating))));
                if let Some(steamid) = &entry.steamid {
                    object.insert_js("steamid", Json::Str(steamid.clone()));
                }
                Json::Obj(object)
            })
            .collect();
        let mut object = Obj::new();
        object.insert_js("version", Json::Num(Num::U(1)));
        object.insert_js("generatedAt", Json::Str(self.generated_at.clone()));
        object.insert_js("entries", Json::Arr(entries));
        Json::Obj(object)
    }
}

/// `z.iso.datetime()` with no options (zod 4.6): `YYYY-MM-DDTHH:MM:SS`, optional `.` and one or more
/// digits, then `Z`. The date must exist (a leap day only in a leap year), the hour is 00 to 23 and
/// the minute and second 00 to 59. No offset and no local form is accepted. `\d` is ASCII only.
fn is_iso_datetime_utc(text: &str) -> bool {
    let b = text.as_bytes();
    // YYYY-MM-DDTHH:MM:SSZ is the shortest form: 20 bytes.
    if b.len() < 20 || b[b.len() - 1] != b'Z' {
        return false;
    }
    let digits = |range: std::ops::Range<usize>| -> Option<u32> {
        let slice = b.get(range)?;
        if !slice.iter().all(u8::is_ascii_digit) {
            return None;
        }
        slice
            .iter()
            .try_fold(0u32, |acc, d| Some(acc * 10 + u32::from(d - b'0')))
    };
    let separators =
        b[4] == b'-' && b[7] == b'-' && b[10] == b'T' && b[13] == b':' && b[16] == b':';
    if !separators {
        return false;
    }
    let (Some(year), Some(month), Some(day), Some(hour), Some(minute), Some(second)) = (
        digits(0..4),
        digits(5..7),
        digits(8..10),
        digits(11..13),
        digits(14..16),
        digits(17..19),
    ) else {
        return false;
    };
    // What sits between the seconds and the `Z`: nothing, or `.` and at least one digit.
    let fraction = &b[19..b.len() - 1];
    let fraction_ok = fraction.is_empty()
        || (fraction[0] == b'.'
            && fraction.len() > 1
            && fraction[1..].iter().all(u8::is_ascii_digit));
    if !fraction_ok {
        return false;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days).contains(&day) && hour <= 23 && minute <= 59 && second <= 59
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn payload(entries: usize) -> Value {
        let list: Vec<Value> = (0..entries)
            .map(|n| json!({ "name": format!("Game {n}"), "rating": 1 + (n % 5) }))
            .collect();
        json!({ "version": 1, "generatedAt": "2026-11-21T14:04:59.908Z", "entries": list })
    }

    #[test]
    fn a_valid_payload_is_accepted_and_keeps_its_entries() {
        let index = validate(&payload(1000)).unwrap();
        assert_eq!(index.entries.len(), 1000);
        assert_eq!(index.generated_at, "2026-11-21T14:04:59.908Z");
        assert_eq!(index.entries[0].rating, 1);
        assert_eq!(index.entries[4].rating, 5);
    }

    #[test]
    fn version_two_is_refused() {
        let mut p = payload(1000);
        p["version"] = json!(2);
        assert_eq!(validate(&p), Err(Reject::Version));
        p["version"] = json!("1");
        assert_eq!(validate(&p), Err(Reject::Version));
    }

    #[test]
    fn a_rating_outside_one_to_five_or_not_an_integer_is_refused() {
        for bad in [json!(6), json!(0), json!(-1), json!(2.5), json!("3")] {
            let mut p = payload(1000);
            p["entries"][7]["rating"] = bad.clone();
            assert_eq!(validate(&p), Err(Reject::Entry), "{bad}");
        }
        // JS reads 3.0 as the integer 3.
        let mut p = payload(1000);
        p["entries"][7]["rating"] = json!(3.0);
        assert!(validate(&p).is_ok());
    }

    #[test]
    fn fewer_than_a_thousand_entries_is_refused() {
        assert_eq!(validate(&payload(999)), Err(Reject::TooFewEntries));
        assert_eq!(validate(&payload(0)), Err(Reject::TooFewEntries));
        assert!(validate(&payload(1000)).is_ok());
    }

    #[test]
    fn generated_at_must_be_an_utc_iso_datetime() {
        for good in [
            "2026-11-21T14:04:59Z",
            "2026-11-21T14:04:59.9Z",
            "2026-11-21T14:04:59.908123Z",
            "2024-02-29T00:00:00Z",
            "2000-02-29T23:59:59Z",
        ] {
            assert!(is_iso_datetime_utc(good), "{good}");
        }
        for bad in [
            "not-a-date",
            "",
            "2026-11-21",
            "2026-11-21T14:04Z",
            "2026-11-21T14:04:59",
            "2026-11-21T14:04:59+00:00",
            "2026-11-21T14:04:59.Z",
            "2026-11-21t14:04:59Z",
            "2026-11-21T24:00:00Z",
            "2026-11-21T14:60:00Z",
            "2026-11-21T14:04:60Z",
            "2026-13-01T00:00:00Z",
            "2026-00-10T00:00:00Z",
            "2026-11-31T00:00:00Z",
            "2026-02-29T00:00:00Z",
            "1900-02-29T00:00:00Z",
            "2026-11-21T14:04:59Z\n",
            "2026-11-21T14:04:59 Z",
        ] {
            assert!(!is_iso_datetime_utc(bad), "{bad:?}");
        }
        let mut p = payload(1000);
        p["generatedAt"] = json!("not-a-date");
        assert_eq!(validate(&p), Err(Reject::GeneratedAt));
        p["generatedAt"] = json!(5);
        assert_eq!(validate(&p), Err(Reject::GeneratedAt));
    }

    #[test]
    fn an_empty_name_or_a_non_string_steamid_is_refused() {
        let mut p = payload(1000);
        p["entries"][0]["name"] = json!("");
        assert_eq!(validate(&p), Err(Reject::Entry));
        let mut p = payload(1000);
        p["entries"][0]["steamid"] = json!(525480);
        assert_eq!(validate(&p), Err(Reject::Entry));
        let mut p = payload(1000);
        p["entries"][0]["steamid"] = json!(null);
        assert_eq!(validate(&p), Err(Reject::Entry));
    }

    #[test]
    fn a_non_object_payload_or_missing_parts_are_refused() {
        assert_eq!(validate(&json!([])), Err(Reject::Shape));
        assert_eq!(validate(&json!({})), Err(Reject::Shape));
        let mut p = payload(1000);
        p["entries"] = json!("none");
        assert_eq!(validate(&p), Err(Reject::Shape));
        let mut p = payload(1000);
        p["entries"][3] = json!(7);
        assert_eq!(validate(&p), Err(Reject::Shape));
    }

    #[test]
    fn unknown_keys_are_dropped_and_the_stored_order_is_the_schemas() {
        let mut p = payload(1000);
        p["extra"] = json!(true);
        p["entries"][0]["extra"] = json!(1);
        p["entries"][0]["steamid"] = json!("42");
        let stored = validate(&p).unwrap().to_json().to_value();
        assert!(stored.get("extra").is_none());
        assert!(stored["entries"][0].get("extra").is_none());
        assert_eq!(stored["entries"][0]["steamid"], json!("42"));
        let bytes = gamelib_store::json::to_compact_bytes(&validate(&p).unwrap().to_json());
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.starts_with(
            r#"{"version":1,"generatedAt":"2026-11-21T14:04:59.908Z","entries":[{"name":"Game 0","rating":1,"steamid":"42"},"#
        ));
    }
}
