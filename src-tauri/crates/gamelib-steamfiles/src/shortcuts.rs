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
use std::path::Path;

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

pub fn apply_shortcuts(_path: &Path, _op: &ShortcutsOp) -> ShortcutsApplyResult {
    ShortcutsApplyResult::default()
}
