//! The tier-2 overlay catalogue (quick 261027-n77, Phase 88 D-03): the overlays' ids, release
//! coordinates, archive and per-file sha256 and sizes, and the env var each target puts its directory
//! on. The one file both languages read is `src/common/knownFixOverlayCatalogue.json`: the TS
//! `KNOWN_FIX_OVERLAY_CATALOGUE` imports it, this module compiles it in, and the jest test
//! `knownFixOverlayCatalogue.test.ts` proves the TS view equals the file field for field.
//!
//! The pins are the trust anchor of every overlay download: a profile entry names only an overlay id,
//! never a URL or a hash. A parse failure is an error, never an empty catalogue.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

const CATALOGUE_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../src/common/knownFixOverlayCatalogue.json"
));

/// What the overlay runs on: the OS and the Wine flavour.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OverlayPlatform {
    pub os: String,
    pub wine: String,
}

/// The GitHub release the archive is published on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OverlayRelease {
    pub repo: String,
    pub tag: String,
    pub asset: String,
}

/// One file the archive unpacks to, fixed by size and sha256.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OverlayFile {
    pub path: String,
    pub sha256: String,
    pub size: u64,
}

/// One pinned overlay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OverlayCatalogueEntry {
    pub id: String,
    pub target: String,
    /// Directory, relative to the install dir, that is put on the env var.
    pub plugin_subdir: String,
    pub platform: OverlayPlatform,
    pub release: OverlayRelease,
    pub archive_sha256: String,
    pub archive_size: u64,
    pub files: Vec<OverlayFile>,
}

/// The whole catalogue: the env var per target, and the entries in file order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OverlayCatalogue {
    pub target_env: BTreeMap<String, String>,
    pub entries: Vec<OverlayCatalogueEntry>,
}

/// The catalogue, parsed once. `Err` is a fixed word: the file's text never reaches it.
pub fn catalogue() -> Result<&'static OverlayCatalogue, &'static str> {
    static CATALOGUE: OnceLock<Result<OverlayCatalogue, &'static str>> = OnceLock::new();
    CATALOGUE
        .get_or_init(
            || match serde_json::from_str::<OverlayCatalogue>(CATALOGUE_JSON) {
                Ok(parsed) if !parsed.entries.is_empty() => Ok(parsed),
                _ => Err("overlay-catalogue:corrupt-table"),
            },
        )
        .as_ref()
        .map_err(|e| *e)
}

/// Own-id lookup (an exact match: a prefix or a different case misses).
pub fn lookup(id: &str) -> Option<&'static OverlayCatalogueEntry> {
    catalogue().ok()?.entries.iter().find(|e| e.id == id)
}

/// The archive's download URL, the shape `overlayArchiveUrl` builds in the TS.
pub fn archive_url(entry: &OverlayCatalogueEntry) -> String {
    let OverlayRelease { repo, tag, asset } = &entry.release;
    format!("https://github.com/{repo}/releases/download/{tag}/{asset}")
}

/// The notices page, the release page of the first entry (`KNOWN_FIX_OVERLAY_NOTICES_URL` in the TS).
pub fn notices_url() -> Result<String, &'static str> {
    let first = catalogue()?
        .entries
        .first()
        .ok_or("overlay-catalogue:corrupt-table")?;
    let OverlayRelease { repo, tag, .. } = &first.release;
    Ok(format!("https://github.com/{repo}/releases/tag/{tag}"))
}
