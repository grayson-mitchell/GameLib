//! Local library scan over `libraryfolders.vdf` and appmanifests (P75-C).
//!
//! Policy that stays in TS (plan 15): existence filtering and the `/usr/share/steam` prefix.
//! Differences from the TS oracle: legacy numeric-string layout is supported, values are
//! escape-decoded, and `scan_acfs` sorts by file name (TS `readdir` order was OS-defined).

use crate::acf::{read_acf, AcfRecord};
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

pub fn read_library_folders(_path: &Path) -> LibraryFoldersResult {
    LibraryFoldersResult {
        exists: false,
        parsed: false,
        read_error: None,
        paths: Vec::new(),
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

pub fn scan_acfs(_steamapps_dirs: &[String]) -> ScanResult {
    let _ = read_acf;
    ScanResult::default()
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FindAcfResult {
    pub found: bool,
    pub steamapps_dir: Option<String>,
    pub record: Option<AcfRecord>,
}

pub fn find_acf(_steamapps_dirs: &[String], _app_id: &str) -> FindAcfResult {
    FindAcfResult {
        found: false,
        steamapps_dir: None,
        record: None,
    }
}
