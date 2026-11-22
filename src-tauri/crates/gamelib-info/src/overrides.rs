//! Per-game metadata overrides (Phase 86, SVC-01): the `overrides` key of `store/game-overrides.json`
//! and the images stored beside it, ported from `src/backend/game_overrides/index.ts`.
//!
//! The map is read and written only through the Phase 85 StoreHost (D-18): the `store/game-overrides`
//! row is opened by path, and the host dedups by path, so this module and the renderer's store reads
//! share one [`Store`]. The one documented exception is the image folder: clearing an override
//! removes its `<appName>-*` files from `<userData>/game_overrides_images/`, a GameLib-owned scratch
//! folder outside the install tree, so `gamelib-safety`'s install-tree rule does not apply to it
//! (86-RESEARCH assumption A4).
//!
//! The image cleanup is the only place in the crate that deletes files, so it is built to be unable
//! to reach beyond its folder (T-86-19):
//! - the folder is the fixed `<user_data>/game_overrides_images`; no part of it comes from `appName`;
//! - the names come from `read_dir` of that folder and are compared, never joined from renderer text;
//! - a name qualifies only when it starts with `<appName>-` (so `app1x-1.png` survives clearing
//!   `app1`) and `appName` is a non-empty string;
//! - `remove_file` removes a symlink itself and never follows it, so a link out of the folder loses
//!   the link and the target stays;
//! - an entry that cannot be removed (a directory, a permission error) is left and the rest go on,
//!   as the TS `try/catch` per file did.
//!
//! Parity (D-03): the TS `getGameOverrides` / `getAllGameOverrides` / `setGameOverrides` never throw,
//! they log and give `null` / `{}` / `false`. So `get` and `get_all` answer `null` / `{}` when the
//! store cannot be read, and `set` answers `false` when it cannot read, clean up or write. The TS log
//! lines (`Saved overrides for <app>`, `Failed to ...`) are not written here: the crate has no
//! logger and `gamelib-log` has no `GameOverrides` prefix, so the TS shim that owns the call writes
//! them from the boolean (86-11).
//!
//! `set` is a read-modify-write of one key, so it runs under one module-level [`Mutex`] (research
//! Pitfall 7): two concurrent sets for different games both persist.

use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};

use gamelib_store::host::Store;
use gamelib_store::json::{Json, Obj};
use gamelib_store::table::row_for_key;
use serde::Deserialize;
use serde_json::Value;

use crate::cache_view::is_falsy;
use crate::ctx::InfoCtx;
use crate::recent::APP_NAME_MAX_UTF16;

/// The store table row and the key the map lives under.
const STORE_ROW: &str = "store/game-overrides";
const MAP_KEY: &str = "overrides";

/// The image folder, a child of `user_data`.
const IMAGES_DIR: &str = "game_overrides_images";

/// `{appName}`: the game a read looks up. Unknown fields are rejected.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GetArgs {
    pub app_name: String,
}

/// The override a write stores: `title`, `art_cover`, `art_square`, each optional (an absent key is
/// the TS `undefined`, which JSON drops). Unknown fields are rejected.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq, Default)]
#[serde(deny_unknown_fields)]
pub struct OverrideArgs {
    pub title: Option<String>,
    pub art_cover: Option<String>,
    pub art_square: Option<String>,
}

impl OverrideArgs {
    /// TS `!override.title && !override.art_cover && !override.art_square`.
    fn is_empty(&self) -> bool {
        [&self.title, &self.art_cover, &self.art_square]
            .iter()
            .all(|field| field.as_deref().map_or(true, str::is_empty))
    }

    /// The stored entry: the fields that are present, in the order the TS literal builds them.
    fn to_entry(&self) -> Json {
        let mut entry = Obj::new();
        for (key, value) in [
            ("title", &self.title),
            ("art_cover", &self.art_cover),
            ("art_square", &self.art_square),
        ] {
            if let Some(text) = value {
                entry.insert_js(key, Json::Str(text.clone()));
            }
        }
        Json::Obj(entry)
    }
}

/// `{appName, overrideData}`: the game a write targets and what it gets. Unknown fields are rejected.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SetArgs {
    pub app_name: String,
    pub override_data: OverrideArgs,
}

/// `{gameInfo}`: the game object an attach decorates. Unknown fields are rejected.
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AttachArgs {
    pub game_info: Value,
}

fn valid_app_name(name: &str) -> bool {
    !name.is_empty() && name.encode_utf16().count() <= APP_NAME_MAX_UTF16
}

/// Serialises every read-modify-write. Poison-tolerant: a panic in one op must not wedge the map.
fn lock() -> MutexGuard<'static, ()> {
    static RMW: Mutex<()> = Mutex::new(());
    RMW.lock().unwrap_or_else(|e| e.into_inner())
}

fn open(ctx: &InfoCtx) -> Option<Arc<Store>> {
    let row = row_for_key(STORE_ROW)?;
    let path = ctx
        .paths
        .user_data
        .join("store")
        .join("game-overrides.json");
    ctx.host.open_row(row, path).ok()
}

/// TS `store.get('overrides', {})`: the stored value as it is, `{}` when the key is absent.
fn stored(store: &Store) -> Json {
    store.get(MAP_KEY).unwrap_or_else(|| Json::Obj(Obj::new()))
}

/// `getAllGameOverrides`: every stored override, `{}` when there is none or the store cannot be
/// opened.
pub fn get_all(ctx: &InfoCtx) -> Json {
    match open(ctx) {
        Some(store) => stored(&store),
        None => Json::Obj(Obj::new()),
    }
}

/// `getGameOverrides`: the entry for the game, `null` when there is none (a falsy entry reads as
/// none, the TS `|| null`), when the stored map is not an object, or when the store cannot be
/// opened.
pub fn get(ctx: &InfoCtx, args: &GetArgs) -> Json {
    let Some(store) = open(ctx) else {
        return Json::Null;
    };
    entry_for(&stored(&store), &args.app_name)
}

fn entry_for(map: &Json, app_name: &str) -> Json {
    match map.get(app_name) {
        Some(entry) if !is_falsy(entry) => entry.clone(),
        _ => Json::Null,
    }
}

/// `setGameOverrides`: stores the override, or (every field empty) drops the entry and the game's
/// images. `true` on success, `false` when the map is unreadable, the cleanup cannot list its folder
/// or the write fails (the TS `catch`).
pub fn set(ctx: &InfoCtx, args: SetArgs) -> Result<bool, String> {
    const OP: &str = "info_overrides_set";
    if !valid_app_name(&args.app_name) {
        return Err(format!("{OP}:bad-args"));
    }
    let _guard = lock();
    let Some(store) = open(ctx) else {
        return Ok(false);
    };
    // A map that is not an object is corrupt: the TS write would throw on it (null) or build on it
    // unpredictably (a string, a number, an array), so nothing is written and the answer is `false`.
    let Json::Obj(mut map) = stored(&store) else {
        return Ok(false);
    };
    if args.override_data.is_empty() {
        map.remove(&args.app_name);
        if remove_images_for(&ctx.paths.user_data, &args.app_name).is_err() {
            return Ok(false);
        }
    } else {
        map.insert_js(args.app_name, args.override_data.to_entry());
    }
    Ok(store.set(MAP_KEY, Json::Obj(map)).is_ok())
}

/// Removes `<user_data>/game_overrides_images/<appName>-*`. A missing folder is a no-op; any other
/// failure to list it is an `Err` (the TS `readdirSync` throws into `setGameOverrides`'s catch). A
/// file that cannot be removed is skipped.
fn remove_images_for(user_data: &Path, app_name: &str) -> Result<(), ()> {
    let dir = user_data.join(IMAGES_DIR);
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(()),
    };
    let prefix = format!("{app_name}-");
    for entry in entries {
        let Ok(entry) = entry else { continue };
        let name = entry.file_name();
        if !name.as_encoded_bytes().starts_with(prefix.as_bytes()) {
            continue;
        }
        // `remove_file` on a symlink removes the link; it never follows it.
        let _ = std::fs::remove_file(dir.join(&name));
    }
    Ok(())
}

/// `attachOverrides`: the game object with its stored override added as `overrides` (an existing
/// `overrides` key is replaced in place, the object spread), or the object unchanged when the game
/// has none. A `gameInfo` that is not an object, or has no string `app_name`, comes back as given.
pub fn attach(ctx: &InfoCtx, args: AttachArgs) -> Result<Value, String> {
    let mut game = args.game_info;
    let Some(app_name) = game.get("app_name").and_then(Value::as_str) else {
        return Ok(game);
    };
    let found = get(
        ctx,
        &GetArgs {
            app_name: app_name.to_string(),
        },
    );
    if found != Json::Null {
        if let Some(object) = game.as_object_mut() {
            object.insert("overrides".to_string(), found.to_value());
        }
    }
    Ok(game)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_store::json::parse;

    fn json(text: &str) -> Json {
        parse(text.as_bytes()).unwrap()
    }

    #[test]
    fn the_empty_override_is_the_ts_falsy_triple() {
        let o = |t: Option<&str>, c: Option<&str>, s: Option<&str>| OverrideArgs {
            title: t.map(str::to_string),
            art_cover: c.map(str::to_string),
            art_square: s.map(str::to_string),
        };
        assert!(o(None, None, None).is_empty());
        assert!(o(Some(""), Some(""), None).is_empty());
        assert!(!o(Some("T"), None, None).is_empty());
        assert!(!o(None, Some("x"), None).is_empty());
        assert!(!o(Some(""), None, Some("x")).is_empty());
    }

    #[test]
    fn the_entry_keeps_present_fields_in_ts_order_including_empty_strings() {
        let entry = OverrideArgs {
            title: Some(String::new()),
            art_cover: None,
            art_square: Some("s".to_string()),
        }
        .to_entry();
        assert_eq!(entry, json(r#"{"title":"","art_square":"s"}"#));
        let keys: Vec<&String> = entry.as_object().unwrap().iter().map(|(k, _)| k).collect();
        assert_eq!(keys, ["title", "art_square"]);
    }

    #[test]
    fn entry_for_reads_a_falsy_or_missing_entry_as_null() {
        let map = json(r#"{"a":{"title":"T"},"b":null,"c":"","d":0}"#);
        assert_eq!(entry_for(&map, "a"), json(r#"{"title":"T"}"#));
        for absent in ["b", "c", "d", "zzz"] {
            assert_eq!(entry_for(&map, absent), Json::Null, "{absent}");
        }
        // A stored map that is not an object has no entries.
        assert_eq!(entry_for(&json("[1]"), "a"), Json::Null);
        assert_eq!(entry_for(&json(r#""abc""#), "a"), Json::Null);
    }

    #[test]
    fn app_name_bound_counts_utf16_units() {
        assert!(valid_app_name("a"));
        assert!(!valid_app_name(""));
        assert!(valid_app_name(&"x".repeat(1024)));
        assert!(!valid_app_name(&"x".repeat(1025)));
        assert!(valid_app_name(&"\u{1F3AE}".repeat(512)));
        assert!(!valid_app_name(&"\u{1F3AE}".repeat(513)));
    }

    #[test]
    fn args_reject_unknown_and_misspelled_fields() {
        let set = |text: &str| serde_json::from_str::<SetArgs>(text);
        assert!(set(r#"{"appName":"a","overrideData":{"title":"T"}}"#).is_ok());
        assert!(set(r#"{"appName":"a","overrideData":{}}"#).is_ok());
        assert!(set(r#"{"appName":"a"}"#).is_err());
        assert!(set(r#"{"appName":"a","overrideData":{},"x":1}"#).is_err());
        assert!(set(r#"{"appName":"a","overrideData":{"x":1}}"#).is_err());
        assert!(set(r#"{"app_name":"a","overrideData":{}}"#).is_err());
        assert!(set(r#"{"appName":"a","overrideData":{"title":1}}"#).is_err());
        let get = |text: &str| serde_json::from_str::<GetArgs>(text);
        assert!(get(r#"{"appName":"a"}"#).is_ok());
        assert!(get(r#"{"appName":"a","x":1}"#).is_err());
        let attach = |text: &str| serde_json::from_str::<AttachArgs>(text);
        assert!(attach(r#"{"gameInfo":{"app_name":"a"}}"#).is_ok());
        assert!(attach(r#"{"gameInfo":{},"x":1}"#).is_err());
        assert!(attach(r#"{"game_info":{}}"#).is_err());
    }

    #[test]
    fn image_cleanup_matches_only_the_app_prefix_and_reaches_nothing_else() {
        let dir = tempfile::tempdir().unwrap();
        let images = dir.path().join(IMAGES_DIR);
        std::fs::create_dir_all(&images).unwrap();
        for name in [
            "app1-1.png",
            "app1-cover.jpg",
            "app1x-1.png",
            "other-1.png",
            "app1",
            "app1.png",
        ] {
            std::fs::write(images.join(name), b"x").unwrap();
        }
        // A directory whose name matches cannot be unlinked: it is skipped, the rest still go.
        std::fs::create_dir(images.join("app1-dir")).unwrap();
        remove_images_for(dir.path(), "app1").unwrap();
        let mut left: Vec<String> = std::fs::read_dir(&images)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(
            left,
            ["app1", "app1-dir", "app1.png", "app1x-1.png", "other-1.png"]
        );
    }

    #[test]
    fn a_missing_images_folder_is_not_an_error_and_a_file_in_its_place_is() {
        let dir = tempfile::tempdir().unwrap();
        assert!(remove_images_for(dir.path(), "app1").is_ok());
        std::fs::write(dir.path().join(IMAGES_DIR), b"not a folder").unwrap();
        assert!(remove_images_for(dir.path(), "app1").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_out_of_the_folder_loses_the_link_and_keeps_the_target() {
        let dir = tempfile::tempdir().unwrap();
        let images = dir.path().join(IMAGES_DIR);
        std::fs::create_dir_all(&images).unwrap();
        let outside = dir.path().join("outside");
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(outside.join("precious.txt"), b"keep").unwrap();
        std::os::unix::fs::symlink(&outside, images.join("app1-link")).unwrap();
        std::os::unix::fs::symlink(outside.join("precious.txt"), images.join("app1-file")).unwrap();
        remove_images_for(dir.path(), "app1").unwrap();
        assert!(std::fs::read_dir(&images).unwrap().next().is_none());
        assert_eq!(
            std::fs::read(outside.join("precious.txt")).unwrap(),
            b"keep"
        );
    }
}
