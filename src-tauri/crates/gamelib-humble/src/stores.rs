//! The Humble state files, read through the one store owner (Phase 85) and never with file I/O of
//! this crate's own (D-19).
//!
//! The eleven stores are the ones `src/backend/humble/stores.ts` creates; each row exists in the
//! shared store table (`storeTable.json`), so the host opens it with the kind, family and dot-path
//! rules the TypeScript `CacheStore` used. A file that is missing reads as an empty store, and one
//! the host cannot read is empty to a reader too (the host never overwrites it).
//!
//! This module reads the stores the TypeScript library still writes through the sidecar's mirror (so
//! each of those files has one writer at every commit), and WRITES one: `humble_steam_appid`, the
//! Steam app-id resolver's cache (94-15), whose only writer is the Rust resolver from that commit on.

use std::collections::BTreeMap;
use std::sync::Arc;

use gamelib_store::host::Store;
use gamelib_store::json::{Json, Num, Obj};
use gamelib_store::table::row_for_key;
use serde_json::Value;

use crate::ctx::HumbleCtx;

/// A Humble store, named as `stores.ts` names it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HumbleStore {
    /// `humbleConfigStore`, `humble_store/config.json` (the encrypted session cookies).
    Config,
    /// `humble_library`.
    Library,
    /// `humble_sync`.
    Sync,
    /// `humble_revealed`.
    Revealed,
    /// `humble_ownership_override`.
    OwnershipOverride,
    /// `humble_gifted_at`.
    GiftedAt,
    /// `humble_audit`.
    Audit,
    /// `humble_local_redeemed`.
    LocalRedeemed,
    /// `humble_notified_expiration`.
    NotifiedExpiration,
    /// `humble_settle_declined`.
    SettleDeclined,
    /// `humble_steam_appid`.
    SteamAppId,
}

impl HumbleStore {
    /// All eleven, in the order `stores.ts` creates them.
    pub const ALL: [HumbleStore; 11] = [
        HumbleStore::Config,
        HumbleStore::Library,
        HumbleStore::Sync,
        HumbleStore::Revealed,
        HumbleStore::OwnershipOverride,
        HumbleStore::GiftedAt,
        HumbleStore::Audit,
        HumbleStore::LocalRedeemed,
        HumbleStore::NotifiedExpiration,
        HumbleStore::SettleDeclined,
        HumbleStore::SteamAppId,
    ];

    /// The directory under the user-data folder (`cwd` for the config store, `store_cache` for the
    /// ten cache stores).
    pub fn dir(self) -> &'static str {
        match self {
            HumbleStore::Config => "humble_store",
            _ => "store_cache",
        }
    }

    /// The file name without `.json` (electron-store's default `config` for the config store).
    pub fn name(self) -> &'static str {
        match self {
            HumbleStore::Config => "config",
            HumbleStore::Library => "humble_library",
            HumbleStore::Sync => "humble_sync",
            HumbleStore::Revealed => "humble_revealed",
            HumbleStore::OwnershipOverride => "humble_ownership_override",
            HumbleStore::GiftedAt => "humble_gifted_at",
            HumbleStore::Audit => "humble_audit",
            HumbleStore::LocalRedeemed => "humble_local_redeemed",
            HumbleStore::NotifiedExpiration => "humble_notified_expiration",
            HumbleStore::SettleDeclined => "humble_settle_declined",
            HumbleStore::SteamAppId => "humble_steam_appid",
        }
    }

    /// The store table's key, `<dir>/<name>`.
    pub fn row_key(self) -> String {
        format!("{}/{}", self.dir(), self.name())
    }

    /// The store, opened through the host. `None` when the store table has no row (a build defect a
    /// test pins) or the host cannot open the file at all.
    pub fn open(self, ctx: &HumbleCtx) -> Option<Arc<Store>> {
        let row = row_for_key(&self.row_key())?;
        let path = ctx
            .user_data
            .join(self.dir())
            .join(format!("{}.json", self.name()));
        ctx.host.open_row(row, path).ok()
    }
}

/// `CacheStore.entries()` followed by `result[key] = entry[field]`: one value per top-level entry,
/// skipping the `__timestamp` bookkeeping the cache writes beside the values. An entry that is not an
/// object, or has no such field, contributes nothing, as `undefined` does not survive the JSON the
/// renderer receives.
///
/// The object key order a JavaScript object would give is not modelled: the answer is a
/// `serde_json` map, which orders its keys, and the renderer reads it by key.
fn field_by_entry(store: HumbleStore, ctx: &HumbleCtx, field: &str) -> BTreeMap<String, Value> {
    let mut out = BTreeMap::new();
    let Some(opened) = store.open(ctx) else {
        return out;
    };
    for (key, entry) in opened.snapshot() {
        if key == "__timestamp" || key.starts_with("__timestamp.") {
            continue;
        }
        if let Json::Obj(fields) = &entry {
            if let Some(value) = fields.get(field) {
                out.insert(key, value.to_value());
            }
        }
    }
    out
}

/// `HumbleLibrary.getAllGiftedAt()`: machine name to the time the user confirmed the gift action.
pub fn gifted_at(ctx: &HumbleCtx) -> BTreeMap<String, Value> {
    field_by_entry(HumbleStore::GiftedAt, ctx, "giftedAt")
}

/// `HumbleLibrary.getAllOwnershipOverrides()`: machine name to the time of the "not the same game"
/// correction.
pub fn ownership_overrides(ctx: &HumbleCtx) -> BTreeMap<String, Value> {
    field_by_entry(HumbleStore::OwnershipOverride, ctx, "overriddenAt")
}

// ------------------------------------------------------------------------------------------------
// The Steam app-id cache (`humble_steam_appid`)
// ------------------------------------------------------------------------------------------------

/// One entry of `humble_steam_appid`, as `HumbleSteamAppIdCacheEntry` stores it: the app id the title
/// resolved to (`None` is a recorded miss), when it was checked, and the search-term version a miss
/// was recorded under (absent in an entry written before the term changed).
#[derive(Debug, Clone, PartialEq)]
pub struct AppIdEntry {
    pub app_id: Option<String>,
    /// Milliseconds since the epoch, as JavaScript's `Date.now()` wrote it.
    pub checked_at: f64,
    pub term_version: Option<f64>,
}

/// The cache entry at `key`. An entry that is not an object, or whose `appId` is neither a string nor
/// null, or whose `checkedAt` is not a number, is unusable and reads as absent (the resolver asks
/// again and overwrites it).
pub fn app_id_entry(store: &Store, key: &str) -> Option<AppIdEntry> {
    let Json::Obj(fields) = store.get(key)? else {
        return None;
    };
    let app_id = match fields.get("appId")? {
        Json::Str(id) => Some(id.clone()),
        Json::Null => None,
        _ => return None,
    };
    let Json::Num(checked) = fields.get("checkedAt")? else {
        return None;
    };
    let number = |n: &Num| match n {
        Num::U(u) => *u as f64,
        Num::I(i) => *i as f64,
        Num::F(f) => *f,
    };
    let term_version = match fields.get("termVersion") {
        Some(Json::Num(n)) => Some(number(n)),
        _ => None,
    };
    Some(AppIdEntry {
        app_id,
        checked_at: number(checked),
        term_version,
    })
}

/// `CacheStore.set`: the entry (`appId`, `checkedAt`, `termVersion`, in that order), then the `Date()`
/// text at `__timestamp.<key>`, as two dot-path sets exactly as the TypeScript wrote them.
pub fn put_app_id_entry(
    store: &Store,
    key: &str,
    entry: &AppIdEntry,
    now_ms: u64,
) -> std::io::Result<()> {
    let mut fields = Obj::new();
    fields.insert_js("appId", entry.app_id.clone().map_or(Json::Null, Json::Str));
    fields.insert_js("checkedAt", Json::Num(float_num(entry.checked_at)));
    if let Some(version) = entry.term_version {
        fields.insert_js("termVersion", Json::Num(float_num(version)));
    }
    store.set(key, Json::Obj(fields))?;
    store.set(
        &format!("__timestamp.{key}"),
        Json::Str(js_date_string(now_ms)),
    )
}

/// A JavaScript number as a store number: an integral value is an integer, as `JSON.stringify` prints it.
fn float_num(value: f64) -> Num {
    if value.fract() == 0.0 && (0.0..9_007_199_254_740_992.0).contains(&value) {
        Num::U(value as u64)
    } else {
        Num::F(value)
    }
}

const WEEKDAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// JS `Date()` as Node prints it under `TZ=UTC`: `Tue Nov 24 2026 12:00:00 GMT+0000 (Coordinated
/// Universal Time)`. The TypeScript wrote the machine's local form of the same instant; Rust has no long
/// zone names, so it writes the UTC one (the same stamp `gamelib-info`'s cache view and the engine's
/// notice store write). Both parse to the same instant, which is all a reader uses.
pub fn js_date_string(ms: u64) -> String {
    let Ok(stamp) = jiff::Timestamp::from_millisecond(ms as i64) else {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_date_stamp_is_the_js_utc_long_form() {
        // 2026-11-24 12:00:00 UTC, the goldens' clock.
        assert_eq!(
            js_date_string(1_795_521_600_000),
            "Tue Nov 24 2026 12:00:00 GMT+0000 (Coordinated Universal Time)"
        );
        assert_eq!(
            js_date_string(0),
            "Thu Jan 01 1970 00:00:00 GMT+0000 (Coordinated Universal Time)"
        );
        assert_eq!(
            js_date_string(1_709_164_800_000),
            "Thu Feb 29 2024 00:00:00 GMT+0000 (Coordinated Universal Time)"
        );
    }

    #[test]
    fn an_integral_number_is_stored_as_an_integer() {
        assert_eq!(float_num(1_795_521_600_000.0), Num::U(1_795_521_600_000));
        assert_eq!(float_num(2.5), Num::F(2.5));
        assert_eq!(float_num(-1.0), Num::F(-1.0));
    }

    #[test]
    fn every_store_has_a_row_in_the_store_table() {
        for store in HumbleStore::ALL {
            let row = row_for_key(&store.row_key())
                .unwrap_or_else(|| panic!("no store table row for {}", store.row_key()));
            assert_eq!(row.dir, store.dir());
            assert_eq!(row.name.as_deref(), Some(store.name()));
        }
    }

    #[test]
    fn the_names_are_unique_and_the_config_store_is_the_only_one_outside_the_cache_folder() {
        let mut keys: Vec<String> = HumbleStore::ALL.iter().map(|s| s.row_key()).collect();
        keys.sort();
        keys.dedup();
        assert_eq!(keys.len(), 11);
        let outside: Vec<_> = HumbleStore::ALL
            .iter()
            .filter(|s| s.dir() != "store_cache")
            .collect();
        assert_eq!(outside, [&HumbleStore::Config]);
    }
}
