//! Recent games (Phase 86, SVC-01): the `games.recent` list of `store/config.json`, ported from
//! `src/backend/recent_games/recent_games.ts`.
//!
//! The list is read and written only through the Phase 85 StoreHost (D-18): the `store/config` row
//! is opened by path, and the host dedups by path, so this module and the shell's boot sweep share
//! one [`Store`]. Parity quirks of the TS original are copied, not fixed (D-03), each with a pending
//! todo:
//! - an entry with a falsy `appName` is dropped by every add and every remove;
//! - a remove on an empty list writes nothing and tells nobody, while a remove on a non-empty list
//!   that holds no such game rewrites the (unchanged) list and still tells the sink.
//!
//! One deliberate change from the TS original, by operator ruling 2026-11-23 (quick 261123-bax):
//! [`add`] caps the stored list at [`MAX_STORED`] after putting the game first, dropping the oldest
//! entries. [`list`] and [`remove`] never trim, so a list an older build stored longer stays as it
//! is until the next add.
//!
//! Every add and remove is a read-modify-write of one key, so each runs under one module-level
//! [`Mutex`] (research Pitfall 7): a launch's add and a tray or renderer remove never lose one
//! another's effect. The [`RecentSink`] is called under that lock, after the write, so a sink sees
//! changes in the order they were written. A sink must therefore not block and must not call back
//! into this module.

use std::sync::{Arc, Mutex, MutexGuard};

use gamelib_store::host::Store;
use gamelib_store::json::{Json, Obj};
use gamelib_store::table::row_for_key;
use serde::Deserialize;

use crate::cache_view::is_falsy;
use crate::ctx::InfoCtx;

/// The store table row and the dot path the list lives under.
const STORE_ROW: &str = "store/config";
const LIST_KEY: &str = "games.recent";

/// The most entries [`add`] keeps, by operator ruling 2026-11-23 (quick 261123-bax). Older history
/// is dropped at the next add.
const MAX_STORED: usize = 50;

/// The longest `appName` an op accepts, in UTF-16 code units (the renderer-facing zod bound).
pub const APP_NAME_MAX_UTF16: usize = 1024;

/// Told about every change of the list, with the list as it now stands. The shell's implementation
/// emits `recentGamesChanged` to the renderer and rebuilds the tray (D-08); the crate stays
/// Tauri-free.
pub trait RecentSink: Send + Sync {
    fn changed(&self, list: &Json);
}

/// `{appName, title, runner}`: the game a launch adds. Unknown fields are rejected.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AddArgs {
    pub app_name: String,
    pub title: String,
    pub runner: String,
}

/// `{appName}`: the game a remove drops. Unknown fields are rejected.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RemoveArgs {
    pub app_name: String,
}

fn valid_app_name(name: &str) -> bool {
    !name.is_empty() && name.encode_utf16().count() <= APP_NAME_MAX_UTF16
}

/// Serialises every read-modify-write. Poison-tolerant: a panic in one op must not wedge the list.
fn lock() -> MutexGuard<'static, ()> {
    static RMW: Mutex<()> = Mutex::new(());
    RMW.lock().unwrap_or_else(|e| e.into_inner())
}

fn open(ctx: &InfoCtx, op: &str) -> Result<Arc<Store>, String> {
    let row = row_for_key(STORE_ROW).ok_or_else(|| format!("{op}:no-store-row"))?;
    let path = ctx.paths.user_data.join("store").join("config.json");
    // Fixed text: an io error can carry the path.
    ctx.host
        .open_row(row, path)
        .map_err(|_| format!("{op}:store-unavailable"))
}

/// The stored list: absent reads as empty (the TS fallback `[]`); anything but an array is a
/// corrupt value the TS `.filter` would throw on.
fn stored(store: &Store, op: &str) -> Result<Vec<Json>, String> {
    match store.get(LIST_KEY) {
        None => Ok(Vec::new()),
        Some(Json::Arr(items)) => Ok(items),
        Some(_) => Err(format!("{op}:corrupt-list")),
    }
}

/// `a.appName && a.appName !== appName`: a falsy `appName` is dropped, and so is the game itself.
fn keeps(entry: &Json, app_name: &str) -> bool {
    match entry.get("appName") {
        None => false,
        Some(name) if is_falsy(name) => false,
        Some(Json::Str(s)) => s != app_name,
        // A truthy non-string is never `===` a string.
        Some(_) => true,
    }
}

/// `games.recent`, newest first, as the store holds it (an array; empty when absent).
pub fn list(ctx: &InfoCtx) -> Result<Json, String> {
    const OP: &str = "info_recent_list";
    let _guard = lock();
    let store = open(ctx, OP)?;
    Ok(Json::Arr(stored(&store, OP)?))
}

fn write(ctx: &InfoCtx, store: &Store, list: Vec<Json>, op: &str) -> Result<(), String> {
    let list = Json::Arr(list);
    store
        .set(LIST_KEY, list.clone())
        .map_err(|_| format!("{op}:write-failed"))?;
    if let Some(sink) = &ctx.recent_sink {
        sink.changed(&list);
    }
    Ok(())
}

/// `addRecentGame`: drops the game and any entry with no `appName`, then puts the game first. The
/// entry's keys are `appName`, `title`, `runner`, in that order. It then keeps the first
/// [`MAX_STORED`] entries, dropping the oldest.
pub fn add(ctx: &InfoCtx, args: AddArgs) -> Result<(), String> {
    const OP: &str = "info_recent_add";
    if !valid_app_name(&args.app_name) {
        return Err(format!("{OP}:bad-args"));
    }
    let _guard = lock();
    let store = open(ctx, OP)?;
    let mut list = stored(&store, OP)?;
    list.retain(|entry| keeps(entry, &args.app_name));
    let mut entry = Obj::new();
    entry.insert_js("appName", Json::Str(args.app_name));
    entry.insert_js("title", Json::Str(args.title));
    entry.insert_js("runner", Json::Str(args.runner));
    list.insert(0, Json::Obj(entry));
    list.truncate(MAX_STORED);
    write(ctx, &store, list, OP)
}

/// `removeRecentGame`: writes only when the list was non-empty (so removing from an empty list is
/// silent), and then rewrites it without the game and without any entry that has no `appName`.
pub fn remove(ctx: &InfoCtx, args: RemoveArgs) -> Result<(), String> {
    const OP: &str = "info_recent_remove";
    if !valid_app_name(&args.app_name) {
        return Err(format!("{OP}:bad-args"));
    }
    let _guard = lock();
    let store = open(ctx, OP)?;
    let mut list = stored(&store, OP)?;
    if list.is_empty() {
        return Ok(());
    }
    list.retain(|entry| keeps(entry, &args.app_name));
    write(ctx, &store, list, OP)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_store::json::parse;

    fn json(text: &str) -> Json {
        parse(text.as_bytes()).unwrap()
    }

    #[test]
    fn keeps_follows_the_ts_filter() {
        // `a.appName && a.appName !== appName`
        assert!(keeps(&json(r#"{"appName":"b"}"#), "a"));
        assert!(!keeps(&json(r#"{"appName":"a"}"#), "a"));
        assert!(!keeps(&json(r#"{"appName":""}"#), "a"));
        assert!(!keeps(&json(r#"{"appName":null}"#), "a"));
        assert!(!keeps(&json(r#"{"appName":0}"#), "a"));
        assert!(!keeps(&json(r#"{"title":"no name"}"#), "a"));
        assert!(!keeps(&json(r#""just a string""#), "a"));
        // Truthy but not a string: never strictly equal to one, so it stays.
        assert!(keeps(&json(r#"{"appName":7}"#), "7"));
    }

    #[test]
    fn app_name_bound_counts_utf16_units() {
        assert!(valid_app_name("a"));
        assert!(!valid_app_name(""));
        assert!(valid_app_name(&"x".repeat(1024)));
        assert!(!valid_app_name(&"x".repeat(1025)));
        // An astral character is two UTF-16 units: 512 of them fit, 513 do not.
        assert!(valid_app_name(&"\u{1F3AE}".repeat(512)));
        assert!(!valid_app_name(&"\u{1F3AE}".repeat(513)));
    }

    #[test]
    fn args_reject_unknown_and_missing_fields() {
        let add = |text: &str| serde_json::from_str::<AddArgs>(text);
        assert!(add(r#"{"appName":"a","title":"t","runner":"gog"}"#).is_ok());
        assert!(add(r#"{"appName":"a","title":"t"}"#).is_err());
        assert!(add(r#"{"appName":"a","title":"t","runner":"gog","x":1}"#).is_err());
        assert!(add(r#"{"app_name":"a","title":"t","runner":"gog"}"#).is_err());
        let remove = |text: &str| serde_json::from_str::<RemoveArgs>(text);
        assert!(remove(r#"{"appName":"a"}"#).is_ok());
        assert!(remove(r#"{"appName":"a","x":1}"#).is_err());
    }
}
