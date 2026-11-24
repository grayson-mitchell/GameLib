//! The Humble state files, read through the one store owner (Phase 85) and never with file I/O of
//! this crate's own (D-19).
//!
//! The eleven stores are the ones `src/backend/humble/stores.ts` creates; each row exists in the
//! shared store table (`storeTable.json`), so the host opens it with the kind, family and dot-path
//! rules the TypeScript `CacheStore` used. A file that is missing reads as an empty store, and one
//! the host cannot read is empty to a reader too (the host never overwrites it).
//!
//! This module only reads. The TypeScript library still writes the files through the sidecar's
//! mirror until the write ports land, so each file has one writer at every commit.

use std::collections::BTreeMap;
use std::sync::Arc;

use gamelib_store::host::Store;
use gamelib_store::json::Json;
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

#[cfg(test)]
mod tests {
    use super::*;

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
