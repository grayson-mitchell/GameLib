//! `shortcuts.vdf` summary read and described-mutation edits with atomic write.
//!
//! Only file facts cross the pipe (a typed summary) and only described edits come back
//! (add / update / remove); the tree is re-read and re-parsed on every call and never cached.
//!
//! Index rules (match `steam-shortcut-editor` as far as plan 11's golden confirms): Add keys the
//! new entry at max numeric key + 1 ("0" when empty); Remove deletes the first entry whose
//! `AppName` equals the name exactly, then re-keys every remaining entry "0".."n-1" in file
//! order. Everything GameLib does not touch (unknown fields, type tags, key order) is preserved.

use crate::atomic::atomic_write;
use crate::kv_bin::{parse_bin, serialize_bin, BinDoc, BinLimits, BinNode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum EntryField {
    #[serde(rename = "string")]
    Str { key: String, value: String },
    #[serde(rename = "int32")]
    Int32 { key: String, value: i64 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", deny_unknown_fields)]
pub enum ShortcutsOp {
    #[serde(rename = "add", rename_all = "camelCase")]
    Add {
        entry: Vec<EntryField>,
        create_if_missing: bool,
    },
    #[serde(rename = "update", rename_all = "camelCase")]
    Update {
        app_name: String,
        fields: Vec<EntryField>,
    },
    #[serde(rename = "remove", rename_all = "camelCase")]
    Remove { app_name: String },
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutEntrySummary {
    pub index_key: String,
    pub app_name: Option<String>,
    pub exe: Option<String>,
    pub launch_options: Option<String>,
    pub has_app_name: bool,
    pub has_exe: bool,
    pub has_launch_options: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutsReadResult {
    pub exists: bool,
    pub parsed: bool,
    pub read_error: Option<String>,
    pub has_shortcuts_root: bool,
    pub root_is_list: bool,
    pub entries: Vec<ShortcutEntrySummary>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutsApplyResult {
    pub written: bool,
    pub read_error: Option<String>,
    pub already_present: bool,
    pub matched: bool,
    pub index_key: Option<String>,
    pub removed_exe: Option<String>,
    pub removed_app_name: Option<String>,
}

fn find_ci<'a>(pairs: &'a [(Vec<u8>, BinNode)], key: &str) -> Option<&'a BinNode> {
    pairs
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(key.as_bytes()))
        .map(|(_, v)| v)
}

fn str_of(node: Option<&BinNode>) -> Option<String> {
    match node {
        Some(BinNode::Str(b)) => Some(String::from_utf8_lossy(b).into_owned()),
        _ => None,
    }
}

fn shortcuts_root(doc: &BinDoc) -> Option<&Vec<(Vec<u8>, BinNode)>> {
    doc.root
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(b"shortcuts"))
        .and_then(|(_, v)| match v {
            BinNode::Map(m) => Some(m),
            _ => None,
        })
}

fn is_list(map: &[(Vec<u8>, BinNode)]) -> bool {
    map.iter().all(|(k, v)| {
        !k.is_empty() && k.iter().all(u8::is_ascii_digit) && matches!(v, BinNode::Map(_))
    })
}

pub fn read_shortcuts(path: &Path) -> ShortcutsReadResult {
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return ShortcutsReadResult::default()
        }
        Err(e) => {
            return ShortcutsReadResult {
                exists: true,
                read_error: Some(format!("io: {e}")),
                ..Default::default()
            }
        }
    };
    let doc = match parse_bin(&bytes, &BinLimits::shortcuts()) {
        Ok(d) => d,
        Err(e) => {
            return ShortcutsReadResult {
                exists: true,
                read_error: Some(format!("parse: {e:?}")),
                ..Default::default()
            }
        }
    };
    let mut out = ShortcutsReadResult {
        exists: true,
        parsed: true,
        ..Default::default()
    };
    if let Some(map) = shortcuts_root(&doc) {
        out.has_shortcuts_root = true;
        out.root_is_list = is_list(map);
        for (k, v) in map {
            if let BinNode::Map(f) = v {
                out.entries.push(ShortcutEntrySummary {
                    index_key: String::from_utf8_lossy(k).into_owned(),
                    app_name: str_of(find_ci(f, "appname")),
                    exe: str_of(find_ci(f, "exe")),
                    launch_options: str_of(find_ci(f, "launchoptions")),
                    has_app_name: find_ci(f, "appname").is_some(),
                    has_exe: find_ci(f, "exe").is_some(),
                    has_launch_options: find_ci(f, "launchoptions").is_some(),
                });
            }
        }
    }
    out
}

fn to_node(f: &EntryField) -> Result<(Vec<u8>, BinNode), &'static str> {
    match f {
        EntryField::Str { key, value } => Ok((
            key.as_bytes().to_vec(),
            BinNode::Str(value.as_bytes().to_vec()),
        )),
        EntryField::Int32 { key, value } => {
            let v = if let Ok(v) = i32::try_from(*value) {
                v
            } else if let Ok(v) = u32::try_from(*value) {
                v as i32
            } else {
                return Err("bad-int32");
            };
            Ok((key.as_bytes().to_vec(), BinNode::Int32(v)))
        }
    }
}

fn nodes(fields: &[EntryField]) -> Result<Vec<(Vec<u8>, BinNode)>, &'static str> {
    fields.iter().map(to_node).collect()
}

fn fail(msg: impl Into<String>) -> ShortcutsApplyResult {
    ShortcutsApplyResult {
        read_error: Some(msg.into()),
        ..Default::default()
    }
}

fn app_name_of(entry: &BinNode) -> Option<String> {
    match entry {
        BinNode::Map(f) => str_of(find_ci(f, "appname")),
        _ => None,
    }
}

/// One lock per `shortcuts.vdf` path, process-wide. Each rustInvoke runs on its own thread, so
/// without it two overlapping edits would both read the old file and the second write would drop
/// the first edit (75 WR-03).
fn path_lock(path: &Path) -> Arc<Mutex<()>> {
    static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();
    // Canonicalise the directory, not the file, so the key is stable whether or not the file
    // exists yet (create-if-missing).
    let key = match (path.parent(), path.file_name()) {
        (Some(dir), Some(name)) => std::fs::canonicalize(dir)
            .map(|d| d.join(name))
            .unwrap_or_else(|_| path.to_path_buf()),
        _ => path.to_path_buf(),
    };
    let mut map = LOCKS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    Arc::clone(map.entry(key).or_default())
}

/// Apply one described edit. The re-read, edit and atomic write run under a per-path lock so
/// concurrent edits to the same file serialise instead of losing one another.
pub fn apply_shortcuts(path: &Path, op: &ShortcutsOp) -> ShortcutsApplyResult {
    let lock = path_lock(path);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());
    apply_shortcuts_locked(path, op)
}

fn apply_shortcuts_locked(path: &Path, op: &ShortcutsOp) -> ShortcutsApplyResult {
    // Validate and convert the op's fields before touching the file.
    let prepared = match op {
        ShortcutsOp::Add { entry, .. } => nodes(entry),
        ShortcutsOp::Update { fields, .. } => nodes(fields),
        ShortcutsOp::Remove { .. } => Ok(Vec::new()),
    };
    let prepared = match prepared {
        Ok(p) => p,
        Err(e) => return fail(e),
    };

    let mut doc = match std::fs::read(path) {
        Ok(b) => match parse_bin(&b, &BinLimits::shortcuts()) {
            Ok(d) => d,
            Err(e) => return fail(format!("parse: {e:?}")),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => match op {
            ShortcutsOp::Add {
                create_if_missing: true,
                ..
            } => BinDoc {
                root: vec![(b"shortcuts".to_vec(), BinNode::Map(Vec::new()))],
                trailing: Vec::new(),
            },
            _ => return fail("missing"),
        },
        Err(e) => return fail(format!("io: {e}")),
    };

    let Some(slot) = doc
        .root
        .iter_mut()
        .find(|(k, _)| k.eq_ignore_ascii_case(b"shortcuts"))
    else {
        return fail("no-shortcuts-root");
    };
    let BinNode::Map(list) = &mut slot.1 else {
        return fail("no-shortcuts-root");
    };
    if !is_list(list) {
        return fail("not-list");
    }

    let mut result = ShortcutsApplyResult::default();
    match op {
        ShortcutsOp::Add { .. } => {
            let new_name = str_of(find_ci(&prepared, "appname"));
            if let Some(name) = &new_name {
                if let Some((k, _)) = list
                    .iter()
                    .find(|(_, v)| app_name_of(v).as_deref() == Some(name.as_str()))
                {
                    result.already_present = true;
                    result.index_key = Some(String::from_utf8_lossy(k).into_owned());
                    return result;
                }
            }
            let next = list
                .iter()
                .filter_map(|(k, _)| String::from_utf8_lossy(k).parse::<u64>().ok())
                .max()
                .map_or(0, |m| m + 1);
            let key = next.to_string();
            list.push((key.clone().into_bytes(), BinNode::Map(prepared)));
            result.index_key = Some(key);
        }
        ShortcutsOp::Update { app_name, .. } => {
            let Some((k, entry)) = list
                .iter_mut()
                .find(|(_, v)| app_name_of(v).as_deref() == Some(app_name.as_str()))
            else {
                return result;
            };
            let BinNode::Map(fields) = entry else {
                return result;
            };
            for (fk, fv) in prepared {
                match fields
                    .iter_mut()
                    .find(|(k2, _)| k2.eq_ignore_ascii_case(&fk))
                {
                    Some(slot) => slot.1 = fv,
                    None => fields.push((fk, fv)),
                }
            }
            result.matched = true;
            result.index_key = Some(String::from_utf8_lossy(k).into_owned());
        }
        ShortcutsOp::Remove { app_name } => {
            let Some(pos) = list
                .iter()
                .position(|(_, v)| app_name_of(v).as_deref() == Some(app_name.as_str()))
            else {
                return result;
            };
            let (k, removed) = list.remove(pos);
            result.matched = true;
            result.index_key = Some(String::from_utf8_lossy(&k).into_owned());
            result.removed_app_name = app_name_of(&removed);
            if let BinNode::Map(f) = &removed {
                result.removed_exe = str_of(find_ci(f, "exe"));
            }
            for (i, (key, _)) in list.iter_mut().enumerate() {
                *key = i.to_string().into_bytes();
            }
        }
    }

    match atomic_write(path, &serialize_bin(&doc)) {
        Ok(()) => {
            result.written = true;
            result
        }
        Err(e) => ShortcutsApplyResult {
            read_error: Some(format!("write: {e}")),
            ..Default::default()
        },
    }
}
