//! Anti-cheat compatibility info (Phase 86, SVC-01), ported from `src/backend/anticheat/utils.ts`.
//!
//! The data is the community AreWeAntiCheatYet list (the Heroic MacAnticheatData list on macOS),
//! kept as the plain file `<appFolder>/areweanticheatyet.json`. D-18 names it as the one exception
//! to "persisted state goes through the StoreHost": it is a downloaded copy of somebody else's
//! document, not GameLib state, so it is read and written with `std::fs` on that one path.
//!
//! [`info`] is the renderer's lookup. Parity quirks of the TS original are copied, not fixed (D-03):
//! - only the FILE side is lower-cased, so an upper-case argument finds nothing;
//! - an entry with no truthy `storeIds.epic.namespace` never matches, even on its Steam id;
//! - a file that is not a JSON array, or a malformed entry in front of the match (not an object, or
//!   without `storeIds`, or a truthy non-string namespace), throws inside the TS `find` and so
//!   answers `null` for the whole lookup;
//! - the TS `find` answered `undefined` for no match; Rust answers `null`, which the renderer
//!   receives identically over IPC (D-03, todo 2026-11-22-anticheat-lookup-returned-undefined).

use std::path::PathBuf;

use serde::Deserialize;
use serde_json::Value;

use crate::ctx::{InfoCtx, Platform};

/// The data file, inside the app folder.
pub const DATA_FILE: &str = "areweanticheatyet.json";

/// The longest argument an op accepts, in UTF-16 code units (the renderer-facing zod bound).
pub const NAMESPACE_MAX_UTF16: usize = 1024;

/// `{appNamespace?}`: the Epic namespace of the game on the page. Absent means no namespace (the
/// TS `undefined`). Unknown fields are rejected.
#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct InfoArgs {
    #[serde(default)]
    pub app_namespace: Option<String>,
}

/// Where the data file lives.
pub fn data_path(ctx: &InfoCtx) -> PathBuf {
    ctx.paths.app_folder.join(DATA_FILE)
}

/// The entry of the data file whose Epic namespace contains `args.app_namespace`, or `null`.
///
/// `null` as well for: no namespace given, Windows, a missing or unreadable file, a file that does
/// not parse, and the malformed shapes the TS threw on (see the module docs). The file is read
/// whole on every call, as TS did.
pub fn info(ctx: &InfoCtx, args: InfoArgs) -> Result<Value, String> {
    let Some(namespace) = args.app_namespace else {
        return Ok(Value::Null);
    };
    if namespace.encode_utf16().count() > NAMESPACE_MAX_UTF16 {
        return Err("info_anticheat_info:bad-args".to_string());
    }
    if ctx.platform == Platform::Windows {
        return Ok(Value::Null);
    }
    // Node's `readFile(.., 'utf-8')` replaces invalid sequences rather than failing; so does this.
    let Ok(bytes) = std::fs::read(data_path(ctx)) else {
        return Ok(Value::Null);
    };
    let Ok(data) = serde_json::from_str::<Value>(&String::from_utf8_lossy(&bytes)) else {
        return Ok(Value::Null);
    };
    Ok(find(&data, &namespace).unwrap_or(Value::Null))
}

/// The TS `jsonData.find(...)`: `Some(entry)` for the first match, `None` for no match and also for
/// a callback that would have thrown.
fn find(data: &Value, wanted: &str) -> Option<Value> {
    // `.find` is not a function on anything but an array.
    let entries = data.as_array()?;
    for entry in entries {
        // `Err` is a TypeError inside the callback: the whole lookup ends in the TS `catch`.
        match matches(entry, wanted) {
            Ok(true) => return Some(entry.clone()),
            Ok(false) => {}
            Err(()) => return None,
        }
    }
    None
}

/// The TS callback: `const namespace = info.storeIds.epic?.namespace; namespace ?
/// namespace.toLowerCase().includes(wanted) : false`.
fn matches(entry: &Value, wanted: &str) -> Result<bool, ()> {
    // `info.storeIds`: an array, a primitive or null entry has no `storeIds`, and reading `.epic` of
    // `undefined` or `null` throws.
    let store_ids = entry.as_object().ok_or(())?.get("storeIds").ok_or(())?;
    if store_ids.is_null() {
        return Err(());
    }
    // `.epic` of a primitive or an array is `undefined`; `?.` then stops without reading further.
    let Some(epic) = store_ids.as_object().and_then(|o| o.get("epic")) else {
        return Ok(false);
    };
    // `.namespace` of a primitive is `undefined`; of `null` the `?.` already stopped.
    let Some(namespace) = epic.as_object().and_then(|o| o.get("namespace")) else {
        return Ok(false);
    };
    match namespace {
        // Falsy: undefined, null, "", 0, false.
        Value::Null | Value::Bool(false) => Ok(false),
        Value::String(s) if s.is_empty() => Ok(false),
        Value::Number(n) if n.as_f64() == Some(0.0) => Ok(false),
        Value::String(s) => Ok(s.to_lowercase().contains(wanted)),
        // A truthy non-string has no `toLowerCase`: TypeError.
        _ => Err(()),
    }
}
