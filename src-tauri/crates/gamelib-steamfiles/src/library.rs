//! Local library scan over `libraryfolders.vdf` and appmanifests (P75-C).
//!
//! Policy that stays in TS (plan 15): existence filtering and the `/usr/share/steam` prefix.
//! Differences from the TS oracle: legacy numeric-string layout is supported, values are
//! escape-decoded, and `scan_acfs` sorts by file name (TS `readdir` order was OS-defined).

use crate::acf::{read_acf, AcfRecord};
use crate::kv_text::{merged, parse, Limits, MergedValue};
use serde::Serialize;
use std::path::Path;

pub const LIBRARY_MAX_BYTES: u64 = 4 * 1024 * 1024;
pub const MAX_DIR_ENTRIES: usize = 20_000;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFoldersResult {
    pub exists: bool,
    pub parsed: bool,
    pub read_error: Option<String>,
    pub paths: Vec<String>,
}

pub fn read_library_folders(path: &Path) -> LibraryFoldersResult {
    let fail = |exists: bool, e: Option<String>| LibraryFoldersResult {
        exists,
        parsed: false,
        read_error: e,
        paths: Vec::new(),
    };
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return fail(false, None),
        Err(e) => return fail(true, Some(format!("read: {e}"))),
    };
    if meta.len() > LIBRARY_MAX_BYTES {
        return fail(true, Some("parse: TooLarge at 0".to_string()));
    }
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) => return fail(true, Some(format!("read: {e}"))),
    };
    let limits = Limits {
        max_bytes: LIBRARY_MAX_BYTES as usize,
        max_depth: 64,
    };
    let pairs = match parse(&bytes, &limits) {
        Ok(p) => p,
        Err(e) => return fail(true, Some(format!("parse: {:?} at {}", e.kind, e.offset))),
    };
    let root = merged(&pairs);
    let mut paths = Vec::new();
    if let Some(folders) = root.map("libraryfolders") {
        for (k, v) in folders.iter() {
            if k.is_empty() || !k.bytes().all(|b| b.is_ascii_digit()) {
                continue;
            }
            match v {
                MergedValue::Map(m) => {
                    if let Some(p) = m.str("path") {
                        paths.push(p);
                    }
                }
                MergedValue::Str(s) => paths.push(s.decoded()),
            }
        }
    }
    LibraryFoldersResult {
        exists: true,
        parsed: true,
        read_error: None,
        paths,
    }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScannedAcf {
    pub steamapps_dir: String,
    pub file_name: String,
    pub record: AcfRecord,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkippedAcf {
    pub steamapps_dir: String,
    pub file_name: String,
    pub reason: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub records: Vec<ScannedAcf>,
    pub skipped: Vec<SkippedAcf>,
    pub missing_dirs: Vec<String>,
}

pub fn scan_acfs(steamapps_dirs: &[String]) -> ScanResult {
    let mut out = ScanResult::default();
    for dir in steamapps_dirs {
        let rd = match std::fs::read_dir(dir) {
            Ok(rd) => rd,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                out.missing_dirs.push(dir.clone());
                continue;
            }
            Err(e) => {
                out.skipped.push(SkippedAcf {
                    steamapps_dir: dir.clone(),
                    file_name: String::new(),
                    reason: format!("read: {e}"),
                });
                continue;
            }
        };
        let mut names = Vec::new();
        let mut count = 0usize;
        let mut capped = false;
        for entry in rd.flatten() {
            count += 1;
            if count > MAX_DIR_ENTRIES {
                capped = true;
                break;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with("appmanifest_") && name.ends_with(".acf") {
                names.push(name);
            }
        }
        names.sort();
        for name in names {
            let r = read_acf(&Path::new(dir).join(&name));
            match r.record {
                Some(record) => out.records.push(ScannedAcf {
                    steamapps_dir: dir.clone(),
                    file_name: name,
                    record,
                }),
                None => out.skipped.push(SkippedAcf {
                    steamapps_dir: dir.clone(),
                    file_name: name,
                    reason: r.read_error.unwrap_or_else(|| "no AppState".to_string()),
                }),
            }
        }
        if capped {
            out.skipped.push(SkippedAcf {
                steamapps_dir: dir.clone(),
                file_name: String::new(),
                reason: "too-many-entries".to_string(),
            });
        }
    }
    out
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FindAcfResult {
    pub found: bool,
    pub steamapps_dir: Option<String>,
    pub record: Option<AcfRecord>,
}

pub fn find_acf(steamapps_dirs: &[String], app_id: &str) -> FindAcfResult {
    let none = FindAcfResult {
        found: false,
        steamapps_dir: None,
        record: None,
    };
    if app_id.is_empty() || app_id.len() > 20 || !app_id.bytes().all(|b| b.is_ascii_digit()) {
        return none;
    }
    let file = format!("appmanifest_{app_id}.acf");
    for dir in steamapps_dirs {
        if let Some(record) = read_acf(&Path::new(dir).join(&file)).record {
            return FindAcfResult {
                found: true,
                steamapps_dir: Some(dir.clone()),
                record: Some(record),
            };
        }
    }
    none
}
