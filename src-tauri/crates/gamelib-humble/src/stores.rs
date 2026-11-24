//! The Humble state files, read through the one store owner (Phase 85) and never with file I/O of
//! this crate's own (D-19).
//!
//! The eleven stores are the ones `src/backend/humble/stores.ts` creates; each row exists in the
//! shared store table (`storeTable.json`), so the host opens it with the kind, family and dot-path
//! rules the TypeScript `CacheStore` used. A file that is missing reads as an empty store, and one
//! the host cannot read is empty to a reader too (the host never overwrites it).
//!
//! Two layers live here. The first reads the stores the TypeScript library still writes through the
//! sidecar's mirror (so each of those files has one writer at every commit), and WRITES one:
//! `humble_steam_appid`, the Steam app-id resolver's cache (94-15), whose only writer is the Rust
//! resolver from that commit on.
//!
//! The second (94-19, D-07) is the complete store layer for all eleven files: a typed read and a typed
//! write per store, and [`clear_on_disconnect`]. The host's ordered [`Json`] stays the source of truth
//! (a typed value is a view over it, a field this module does not know is kept, and a write patches the
//! one field it owns), and every write goes through the host's ops, so a key nothing touched keeps its
//! exact text. A file the host could not read is [`StoreRead::Unreadable`] to a reader and
//! [`WriteError::Unreadable`] to a writer: it is never read as empty and never written over with
//! defaults (FND-06, 85 D-05; the host has already copied its bytes aside).
//!
//! The nine user-state and account files are the ones that cannot be refetched from Humble. The two
//! caches (`humble_sync`, `humble_steam_appid`) follow the host's cache rule instead: the bytes are
//! copied aside and the cache restarts empty, because a rebuildable cache that could never be written
//! again would be worse than one that restarts.

use std::collections::BTreeMap;
use std::fmt;
use std::io;
use std::sync::Arc;

use gamelib_store::engine::{OpenOutcome, ReadOnlyReason};
use gamelib_store::host::{Origin, Store};
use gamelib_store::json::{Json, Num, Obj};
use gamelib_store::ops::Op;
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
        if is_bookkeeping(&key) {
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
    put_cache_value(store, key, Json::Obj(fields), now_ms)
}

/// `CacheStore.set`: the value at `key`, then the `Date()` text at `__timestamp.<key>`, as two dot-path
/// sets in that order. The one writer every keyed store here goes through.
fn put_cache_value(store: &Store, key: &str, value: Json, now_ms: u64) -> io::Result<()> {
    store.set(key, value)?;
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

// ------------------------------------------------------------------------------------------------
// The complete store layer (94-19, D-07)
// ------------------------------------------------------------------------------------------------

/// A store whose file the host could not read, copied aside and left as it was. `detail` is the host's
/// account of why (versions and error kinds, never a value).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnreadableStore {
    pub store: HumbleStore,
    pub detail: String,
}

/// The answer of a typed read. An unreadable file is its own answer, never an empty store, so a caller
/// cannot mistake a corrupt `humble_revealed` for "nothing is revealed" and write defaults over it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreRead<T> {
    Ok(T),
    /// The host could not read the file (FND-06): its bytes were copied aside and the file is untouched.
    Unreadable(UnreadableStore),
    /// The store table has no row for it, or the host could not open it at all (a build defect).
    Unavailable(HumbleStore),
}

impl<T> StoreRead<T> {
    /// The value, or `None` for an unreadable or unavailable store.
    pub fn ok(self) -> Option<T> {
        match self {
            StoreRead::Ok(value) => Some(value),
            _ => None,
        }
    }

    pub fn is_unreadable(&self) -> bool {
        matches!(self, StoreRead::Unreadable(_))
    }
}

/// Why a typed write did not happen.
#[derive(Debug)]
pub enum WriteError {
    Unavailable(HumbleStore),
    /// The file is one the host could not read: nothing was written, so it is never reset to defaults.
    Unreadable(UnreadableStore),
    /// The host refused or failed the write (a read-only newer file, a full disk); the store is as it was.
    Io(io::Error),
}

impl fmt::Display for WriteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WriteError::Unavailable(store) => write!(f, "{} is not available", store.row_key()),
            WriteError::Unreadable(un) => {
                write!(f, "{} is unreadable: {}", un.store.row_key(), un.detail)
            }
            WriteError::Io(e) => write!(f, "store write failed: {}", e.kind()),
        }
    }
}

impl std::error::Error for WriteError {}

impl From<io::Error> for WriteError {
    fn from(e: io::Error) -> WriteError {
        WriteError::Io(e)
    }
}

impl HumbleStore {
    /// [`HumbleStore::open`], but a file the host could not read is [`StoreRead::Unreadable`] rather than
    /// an empty store. A rebuildable cache the host restarted empty (`StartEmpty`: its bytes are already
    /// copied aside) is usable, as the host's cache rule says.
    pub fn open_checked(self, ctx: &HumbleCtx) -> StoreRead<Arc<Store>> {
        let Some(store) = self.open(ctx) else {
            return StoreRead::Unavailable(self);
        };
        match store.open_outcome() {
            OpenOutcome::ReadOnly {
                reason: ReadOnlyReason::Failed,
                detail,
            } => StoreRead::Unreadable(UnreadableStore {
                store: self,
                detail: detail.clone(),
            }),
            _ => StoreRead::Ok(store),
        }
    }
}

fn read_with<T>(ctx: &HumbleCtx, which: HumbleStore, f: impl FnOnce(&Store) -> T) -> StoreRead<T> {
    match which.open_checked(ctx) {
        StoreRead::Ok(store) => StoreRead::Ok(f(&store)),
        StoreRead::Unreadable(un) => StoreRead::Unreadable(un),
        StoreRead::Unavailable(w) => StoreRead::Unavailable(w),
    }
}

fn write_with(
    ctx: &HumbleCtx,
    which: HumbleStore,
    f: impl FnOnce(&Store) -> io::Result<()>,
) -> Result<(), WriteError> {
    match which.open_checked(ctx) {
        StoreRead::Ok(store) => f(&store).map_err(WriteError::Io),
        StoreRead::Unreadable(un) => Err(WriteError::Unreadable(un)),
        StoreRead::Unavailable(w) => Err(WriteError::Unavailable(w)),
    }
}

/// The cache's own bookkeeping next to the values: `__timestamp` (or a dot-path child of it).
fn is_bookkeeping(key: &str) -> bool {
    key == "__timestamp" || key.starts_with("__timestamp.")
}

/// Every top-level value of a keyed cache store, in file order, without the bookkeeping.
fn keyed_values(store: &Store) -> Vec<(String, Json)> {
    store
        .snapshot()
        .into_iter()
        .filter(|(key, _)| !is_bookkeeping(key))
        .collect()
}

/// One entry of a keyed store, as an ordered object. A field this module does not know stays where it
/// was, so a typed write never drops what an older or newer writer put there.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Entry(Obj);

impl Entry {
    /// `None` for a value that is not an object.
    pub fn from_json(json: &Json) -> Option<Entry> {
        match json {
            Json::Obj(fields) => Some(Entry(fields.clone())),
            _ => None,
        }
    }

    pub fn get(&self, field: &str) -> Option<&Json> {
        self.0.get(field)
    }

    pub fn str_field(&self, field: &str) -> Option<&str> {
        self.0.get(field).and_then(Json::as_str)
    }

    pub fn num_field(&self, field: &str) -> Option<f64> {
        self.0.get(field).and_then(Json::as_f64)
    }

    /// `{...entry, [field]: value}`: an existing field keeps its place, a new one goes last.
    #[must_use]
    pub fn with(mut self, field: &str, value: Json) -> Entry {
        self.0.insert_js(field, value);
        self
    }

    pub fn to_json(&self) -> Json {
        Json::Obj(self.0.clone())
    }

    pub fn fields(&self) -> impl Iterator<Item = (&String, &Json)> {
        self.0.iter()
    }
}

fn keyed_entries(store: &Store) -> Vec<(String, Entry)> {
    keyed_values(store)
        .into_iter()
        .filter_map(|(key, value)| Entry::from_json(&value).map(|entry| (key, entry)))
        .collect()
}

/// `store.set(key, {...existing, ...fields})` and the `__timestamp.<key>` stamp: the TS shape of a
/// record update, with a field this module does not know carried over.
fn patch_entry(store: &Store, key: &str, fields: Vec<(&str, Json)>, now_ms: u64) -> io::Result<()> {
    let mut entry = store
        .get(key)
        .as_ref()
        .and_then(Entry::from_json)
        .unwrap_or_default();
    for (field, value) in fields {
        entry = entry.with(field, value);
    }
    put_cache_value(store, key, entry.to_json(), now_ms)
}

/// A millisecond count as a store number.
fn ms_json(ms: u64) -> Json {
    Json::Num(float_num(ms as f64))
}

/// JavaScript `Boolean(value)` over a stored value.
fn truthy(value: &Json) -> bool {
    match value {
        Json::Null => false,
        Json::Bool(b) => *b,
        Json::Num(_) => value.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Json::Str(s) => !s.is_empty(),
        Json::Arr(_) | Json::Obj(_) => true,
    }
}

// ---- humbleConfigStore (humble_store/config.json) ----------------------------------------------

/// What `HumbleUser` keeps in the config store; the session secrets are in the keyring, not here.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ConfigState {
    /// `Boolean(configStore.get_nodefault('isLoggedIn'))`.
    pub is_logged_in: bool,
    pub expired: Option<bool>,
    pub encryption_degraded: Option<bool>,
    /// `userData.username`.
    pub username: Option<String>,
}

/// A flag `HumbleUser` writes at the top level of the config store.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfigFlag {
    IsLoggedIn,
    Expired,
    EncryptionDegraded,
}

impl ConfigFlag {
    fn key(self) -> &'static str {
        match self {
            ConfigFlag::IsLoggedIn => "isLoggedIn",
            ConfigFlag::Expired => "expired",
            ConfigFlag::EncryptionDegraded => "encryptionDegraded",
        }
    }
}

pub fn load_config(ctx: &HumbleCtx) -> StoreRead<ConfigState> {
    read_with(ctx, HumbleStore::Config, |store| ConfigState {
        is_logged_in: store.get("isLoggedIn").as_ref().is_some_and(truthy),
        expired: store.get("expired").and_then(|v| v.as_bool()),
        encryption_degraded: store.get("encryptionDegraded").and_then(|v| v.as_bool()),
        username: store
            .get("userData")
            .as_ref()
            .and_then(Entry::from_json)
            .and_then(|user| user.str_field("username").map(str::to_string)),
    })
}

pub fn set_config_flag(ctx: &HumbleCtx, flag: ConfigFlag, value: bool) -> Result<(), WriteError> {
    write_with(ctx, HumbleStore::Config, |store| {
        store.set(flag.key(), Json::Bool(value))
    })
}

/// `configStore.set('userData', {...userData, username})`.
pub fn set_username(ctx: &HumbleCtx, username: &str) -> Result<(), WriteError> {
    write_with(ctx, HumbleStore::Config, |store| {
        let user = store
            .get("userData")
            .as_ref()
            .and_then(Entry::from_json)
            .unwrap_or_default()
            .with("username", Json::Str(username.to_string()));
        store.set("userData", user.to_json())
    })
}

// ---- humble_library ------------------------------------------------------------------------------

/// Every cached order, keyed by gamekey, with the entry's own fields (`gamekey`, `keys`, ...).
pub fn load_library(ctx: &HumbleCtx) -> StoreRead<Vec<(String, Entry)>> {
    read_with(ctx, HumbleStore::Library, keyed_entries)
}

pub fn put_library_entry(
    ctx: &HumbleCtx,
    key: &str,
    entry: &Entry,
    now_ms: u64,
) -> Result<(), WriteError> {
    write_with(ctx, HumbleStore::Library, |store| {
        put_cache_value(store, key, entry.to_json(), now_ms)
    })
}

// ---- humble_sync ---------------------------------------------------------------------------------

/// `HumbleSyncState`, the one record under the `state` key.
#[derive(Debug, Clone, PartialEq)]
pub struct SyncState {
    pub synced_at: Option<f64>,
    /// `none`, `denied`, `network` or `partial`.
    pub sync_error: String,
    pub cooldown_until: Option<f64>,
    pub classifier_version: Option<f64>,
}

impl Default for SyncState {
    /// What `getSyncState()` answers before the first sync.
    fn default() -> SyncState {
        SyncState {
            synced_at: None,
            sync_error: "none".to_string(),
            cooldown_until: None,
            classifier_version: None,
        }
    }
}

pub fn load_sync_state(ctx: &HumbleCtx) -> StoreRead<SyncState> {
    read_with(ctx, HumbleStore::Sync, |store| {
        let Some(state) = store.get("state").as_ref().and_then(Entry::from_json) else {
            return SyncState::default();
        };
        SyncState {
            synced_at: state.num_field("syncedAt"),
            sync_error: state.str_field("syncError").unwrap_or("none").to_string(),
            cooldown_until: state.num_field("cooldownUntil"),
            classifier_version: state.num_field("classifierVersion"),
        }
    })
}

/// `Partial<HumbleSyncState>` in the order its fields were named, as `{...current, ...patch}` applies it.
#[derive(Debug, Clone, Default)]
pub struct SyncPatch(Vec<(&'static str, Json)>);

impl SyncPatch {
    pub fn new() -> SyncPatch {
        SyncPatch::default()
    }

    /// `None` is the JSON `null` of "never synced".
    #[must_use]
    pub fn synced_at(mut self, ms: Option<u64>) -> SyncPatch {
        self.0.push(("syncedAt", ms.map_or(Json::Null, ms_json)));
        self
    }

    #[must_use]
    pub fn sync_error(mut self, error: &str) -> SyncPatch {
        self.0.push(("syncError", Json::Str(error.to_string())));
        self
    }

    #[must_use]
    pub fn cooldown_until(mut self, ms: u64) -> SyncPatch {
        self.0.push(("cooldownUntil", ms_json(ms)));
        self
    }

    #[must_use]
    pub fn classifier_version(mut self, version: u32) -> SyncPatch {
        self.0
            .push(("classifierVersion", Json::Num(Num::U(u64::from(version)))));
        self
    }
}

/// `setSyncState(patch)`: the record under `state` with the patch spread over it (over the
/// `{syncedAt: null, syncError: 'none'}` default before the first sync), and the stamp.
pub fn patch_sync_state(ctx: &HumbleCtx, patch: &SyncPatch, now_ms: u64) -> Result<(), WriteError> {
    write_with(ctx, HumbleStore::Sync, |store| {
        let mut state = store
            .get("state")
            .as_ref()
            .and_then(Entry::from_json)
            .unwrap_or_else(|| {
                Entry::default()
                    .with("syncedAt", Json::Null)
                    .with("syncError", Json::Str("none".to_string()))
            });
        for (field, value) in &patch.0 {
            state = state.with(field, value.clone());
        }
        put_cache_value(store, "state", state.to_json(), now_ms)
    })
}

// ---- the four timestamp records: revealed, override, gifted, settle-declined ---------------------

/// The four stores whose entry is one millisecond timestamp under a fixed field, keyed by machine name
/// (or `gamekey:machineName` for the settle-declined store).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StampStore {
    /// `humble_revealed`, `{revealedAt}`.
    Revealed,
    /// `humble_ownership_override`, `{overriddenAt}`.
    OwnershipOverride,
    /// `humble_gifted_at`, `{giftedAt}`.
    GiftedAt,
    /// `humble_settle_declined`, `{declinedAt}`.
    SettleDeclined,
}

impl StampStore {
    pub fn store(self) -> HumbleStore {
        match self {
            StampStore::Revealed => HumbleStore::Revealed,
            StampStore::OwnershipOverride => HumbleStore::OwnershipOverride,
            StampStore::GiftedAt => HumbleStore::GiftedAt,
            StampStore::SettleDeclined => HumbleStore::SettleDeclined,
        }
    }

    fn field(self) -> &'static str {
        match self {
            StampStore::Revealed => "revealedAt",
            StampStore::OwnershipOverride => "overriddenAt",
            StampStore::GiftedAt => "giftedAt",
            StampStore::SettleDeclined => "declinedAt",
        }
    }
}

/// Key to the recorded time, for every entry that carries one.
pub fn load_stamps(ctx: &HumbleCtx, which: StampStore) -> StoreRead<BTreeMap<String, f64>> {
    read_with(ctx, which.store(), |store| {
        keyed_entries(store)
            .into_iter()
            .filter_map(|(key, entry)| entry.num_field(which.field()).map(|at| (key, at)))
            .collect()
    })
}

pub fn put_stamp(
    ctx: &HumbleCtx,
    which: StampStore,
    key: &str,
    at_ms: u64,
    now_ms: u64,
) -> Result<(), WriteError> {
    write_with(ctx, which.store(), |store| {
        patch_entry(store, key, vec![(which.field(), ms_json(at_ms))], now_ms)
    })
}

// ---- humble_local_redeemed -----------------------------------------------------------------------

/// Where a local-redeemed record came from (D-42-01).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RedeemSource {
    User,
    OwnershipExact,
}

impl RedeemSource {
    fn as_str(self) -> &'static str {
        match self {
            RedeemSource::User => "user",
            RedeemSource::OwnershipExact => "ownership-exact",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LocalRedeemed {
    pub redeemed_at: f64,
    /// The record's own `source`, `None` when it has none. Read it through [`LocalRedeemed::origin`].
    pub source: Option<RedeemSource>,
}

impl LocalRedeemed {
    /// A record with no `source` (every one written before Phase 42) reads as `User`, and is never
    /// migrated.
    pub fn origin(&self) -> RedeemSource {
        self.source.unwrap_or(RedeemSource::User)
    }
}

pub fn load_local_redeemed(ctx: &HumbleCtx) -> StoreRead<BTreeMap<String, LocalRedeemed>> {
    read_with(ctx, HumbleStore::LocalRedeemed, |store| {
        keyed_entries(store)
            .into_iter()
            .filter_map(|(key, entry)| {
                let redeemed_at = entry.num_field("redeemedAt")?;
                let source = match entry.str_field("source") {
                    Some("ownership-exact") => Some(RedeemSource::OwnershipExact),
                    Some(_) => Some(RedeemSource::User),
                    None => None,
                };
                Some((
                    key,
                    LocalRedeemed {
                        redeemed_at,
                        source,
                    },
                ))
            })
            .collect()
    })
}

/// `source: None` writes no `source` field (an existing one is kept).
pub fn put_local_redeemed(
    ctx: &HumbleCtx,
    key: &str,
    redeemed_at_ms: u64,
    source: Option<RedeemSource>,
    now_ms: u64,
) -> Result<(), WriteError> {
    write_with(ctx, HumbleStore::LocalRedeemed, |store| {
        let mut fields = vec![("redeemedAt", ms_json(redeemed_at_ms))];
        if let Some(source) = source {
            fields.push(("source", Json::Str(source.as_str().to_string())));
        }
        patch_entry(store, key, fields, now_ms)
    })
}

// ---- humble_notified_expiration ------------------------------------------------------------------

/// `gamekey:machineName` (or a legacy bare machine name) to the expiration last notified.
pub fn load_notified_expirations(ctx: &HumbleCtx) -> StoreRead<BTreeMap<String, String>> {
    read_with(ctx, HumbleStore::NotifiedExpiration, |store| {
        keyed_entries(store)
            .into_iter()
            .filter_map(|(key, entry)| {
                entry
                    .str_field("expiration")
                    .map(|expiration| (key, expiration.to_string()))
            })
            .collect()
    })
}

pub fn put_notified_expiration(
    ctx: &HumbleCtx,
    key: &str,
    expiration: &str,
    now_ms: u64,
) -> Result<(), WriteError> {
    write_with(ctx, HumbleStore::NotifiedExpiration, |store| {
        patch_entry(
            store,
            key,
            vec![("expiration", Json::Str(expiration.to_string()))],
            now_ms,
        )
    })
}

// ---- humble_audit --------------------------------------------------------------------------------

/// One line of the guided claim flow's audit trail. It never carries a key value (C4/D-76).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditRecord {
    pub event: String,
    pub at: u64,
    pub outcome: Option<String>,
    pub title: String,
    pub platform: String,
}

impl AuditRecord {
    /// The fields in the order the TypeScript interface lists them.
    fn to_entry(&self) -> Entry {
        let mut entry = Entry::default()
            .with("event", Json::Str(self.event.clone()))
            .with("at", ms_json(self.at));
        if let Some(outcome) = &self.outcome {
            entry = entry.with("outcome", Json::Str(outcome.clone()));
        }
        entry
            .with("title", Json::Str(self.title.clone()))
            .with("platform", Json::Str(self.platform.clone()))
    }
}

/// Composite key to the append-only record array. An entry that is not an array is skipped, as a
/// value the TypeScript could not have written.
pub fn load_audit(ctx: &HumbleCtx) -> StoreRead<Vec<(String, Vec<Entry>)>> {
    read_with(ctx, HumbleStore::Audit, |store| {
        keyed_values(store)
            .into_iter()
            .filter_map(|(key, value)| {
                let records = value.as_array()?;
                Some((key, records.iter().filter_map(Entry::from_json).collect()))
            })
            .collect()
    })
}

/// `store.set(key, [...existing, record])`. An existing value that is not an array is refused
/// (`InvalidData`), never replaced.
pub fn append_audit(
    ctx: &HumbleCtx,
    key: &str,
    record: &AuditRecord,
    now_ms: u64,
) -> Result<(), WriteError> {
    write_with(ctx, HumbleStore::Audit, |store| {
        let mut records = match store.get(key) {
            None => Vec::new(),
            Some(Json::Arr(existing)) => existing,
            Some(_) => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "the audit entry is not an array",
                ))
            }
        };
        records.push(record.to_entry().to_json());
        put_cache_value(store, key, Json::Arr(records), now_ms)
    })
}

/// `store.set(key, records)`: the whole array of one entry, as it was read.
pub fn put_audit(
    ctx: &HumbleCtx,
    key: &str,
    records: &[Entry],
    now_ms: u64,
) -> Result<(), WriteError> {
    write_with(ctx, HumbleStore::Audit, |store| {
        let array = records.iter().map(Entry::to_json).collect();
        put_cache_value(store, key, Json::Arr(array), now_ms)
    })
}

// ---- humble_steam_appid --------------------------------------------------------------------------

/// Normalised title to the cached app-id answer, for every entry the resolver can read.
pub fn load_app_ids(ctx: &HumbleCtx) -> StoreRead<Vec<(String, AppIdEntry)>> {
    read_with(ctx, HumbleStore::SteamAppId, |store| {
        keyed_values(store)
            .into_iter()
            .filter_map(|(key, _)| app_id_entry(store, &key).map(|entry| (key, entry)))
            .collect()
    })
}

pub fn put_app_id(
    ctx: &HumbleCtx,
    key: &str,
    entry: &AppIdEntry,
    now_ms: u64,
) -> Result<(), WriteError> {
    write_with(ctx, HumbleStore::SteamAppId, |store| {
        put_app_id_entry(store, key, entry, now_ms)
    })
}

// ---- disconnect ----------------------------------------------------------------------------------

/// What `HumbleUser.disconnect()` clears, in its order: the config first (the credential boundary), then
/// the library and sync state, which are rebuilt by a re-sync. The seven user-state files (82-STATE-
/// OWNERSHIP rows 69-75) and the Steam app-id cache are never cleared, so a revealed key never
/// regresses and a correction, a gift, an audit line or a decline survives a reconnect.
pub const CLEAR_ON_DISCONNECT: [HumbleStore; 3] =
    [HumbleStore::Config, HumbleStore::Library, HumbleStore::Sync];

/// Which of the cleared stores were cleared and which were not.
#[derive(Debug, Default)]
pub struct ClearReport {
    pub cleared: Vec<HumbleStore>,
    pub failed: Vec<(HumbleStore, WriteError)>,
}

impl ClearReport {
    pub fn is_complete(&self) -> bool {
        self.failed.is_empty()
    }
}

/// `configStore.clear()`, `humbleLibraryStore.clear()`, `humbleSyncStore.clear()`, each through the host
/// (`Op::Clear`: the document becomes `{}` and the version envelope is stamped back). Every store is
/// attempted whatever an earlier one did, and a file the host could not read is reported, never
/// overwritten. The keyring secrets, the fence and the cookie wipe are the caller's.
pub fn clear_on_disconnect(ctx: &HumbleCtx) -> ClearReport {
    let mut report = ClearReport::default();
    for which in CLEAR_ON_DISCONNECT {
        let done = write_with(ctx, which, |store| {
            store
                .apply(Op::Clear, Origin::Rust)
                .map(|_| ())
                .map_err(io::Error::from)
        });
        match done {
            Ok(()) => report.cleared.push(which),
            Err(e) => report.failed.push((which, e)),
        }
    }
    report
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
