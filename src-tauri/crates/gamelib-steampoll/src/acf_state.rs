//! Read half of acfState.ts and all of acfUpdateState.ts. Ported by plan 04.
//!
//! Parsing goes only through `gamelib-steamfiles` (D-12): this module never tokenizes VDF or ACF
//! text. A read failure is `Unknown` (or `None` for the update fields), never `Absent`.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::constants::STATE_FLAG_FULLY_INSTALLED;

/// Roots a poll reads. Native libraries are resolved per tick from `steamRoot` exactly as
/// `getSteamLibraries` (src/backend/utils.ts:610-640) does.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PollRoots {
    pub steam_root: String,
    pub bottle_steamapps_root: Option<String>,
    pub bridge_steamapps_root: Option<String>,
}

/// Which steamapps root(s) a read scans (installRoot.ts `AcfSource`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AcfSource {
    Native,
    Bottle,
    Bridge,
}

/// Mirror of the TS `readAcfState` return union.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum AcfState {
    Absent,
    /// Nothing was learned (library list or manifest read failed). Pollers skip the tick, delete
    /// paths refuse; never read this as absent.
    Unknown,
    #[serde(rename_all = "camelCase")]
    Downloading {
        /// `None` when the manifest has no parsable StateFlags (TS `NaN`).
        state_flags: Option<u32>,
        bytes_downloaded: u64,
        bytes_to_download: u64,
        bytes_staged: u64,
        bytes_to_stage: u64,
    },
    #[serde(rename_all = "camelCase")]
    Installed {
        state_flags: u32,
        install_path: String,
        size_on_disk: String,
        buildid: Option<String>,
    },
}

/// `^\d+$` (NUMERIC_APP_ID). Checked before any path join (T-80-08).
fn is_numeric_app_id(app_id: &str) -> bool {
    !app_id.is_empty() && app_id.bytes().all(|b| b.is_ascii_digit())
}

/// `Number(x) || 0` for the unsigned byte counters (non-numeric, absent, negative => 0).
fn bytes_field(v: &Option<String>) -> u64 {
    v.as_deref()
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or(0)
}

/// `getSteamLibraries`: `/usr/share/steam` first, then libraryfolders.vdf paths, existing dirs
/// only. A missing or unparsable list yields the system path only; with `strict`, an I/O read
/// failure of an existing list is an error so an install-state reader cannot mistake it for
/// "nothing installed elsewhere" (WR-01).
pub fn steam_libraries(steam_root: &str, strict: bool) -> Result<Vec<PathBuf>, String> {
    let root = steam_root.replace('\'', "");
    let vdf = Path::new(&root)
        .join("steamapps")
        .join("libraryfolders.vdf");
    let system = PathBuf::from("/usr/share/steam");
    let res = gamelib_steamfiles::library::read_library_folders(&vdf);
    if !res.exists {
        return Ok(vec![system]);
    }
    if !res.parsed {
        let io_failure = res
            .read_error
            .as_deref()
            .is_some_and(|e| e.starts_with("read:"));
        if strict && io_failure {
            return Err(res.read_error.unwrap_or_default());
        }
        return Ok(vec![system]);
    }
    Ok(std::iter::once(system)
        .chain(res.paths.into_iter().map(PathBuf::from))
        .filter(|p| p.exists())
        .collect())
}

/// The steamapps dirs a read covers, or `None` when the source's root is not provisioned or the
/// library list could not be read.
fn steamapps_dirs(roots: &PollRoots, source: AcfSource, strict: bool) -> Option<Vec<String>> {
    match source {
        AcfSource::Bottle => roots.bottle_steamapps_root.clone().map(|r| vec![r]),
        AcfSource::Bridge => roots.bridge_steamapps_root.clone().map(|r| vec![r]),
        AcfSource::Native => steam_libraries(&roots.steam_root, strict).ok().map(|libs| {
            libs.iter()
                .map(|l| l.join("steamapps").to_string_lossy().into_owned())
                .collect()
        }),
    }
}

/// Install state of one appId from its ACF (acfState.ts `readAcfState`).
pub fn read_acf_state(roots: &PollRoots, app_id: &str, source: AcfSource) -> AcfState {
    if !is_numeric_app_id(app_id) {
        return AcfState::Unknown;
    }
    let Some(dirs) = steamapps_dirs(roots, source, true) else {
        return AcfState::Unknown;
    };
    let dirs: Vec<String> = dirs.into_iter().filter(|d| Path::new(d).exists()).collect();
    let found = gamelib_steamfiles::library::find_acf(&dirs, app_id);
    let (Some(record), Some(dir)) = (found.record, found.steamapps_dir) else {
        return AcfState::Absent;
    };
    match record.state_flags {
        Some(flags) if flags & STATE_FLAG_FULLY_INSTALLED != 0 => AcfState::Installed {
            state_flags: flags,
            install_path: Path::new(&dir)
                .join("common")
                .join(record.installdir.as_deref().unwrap_or(""))
                .to_string_lossy()
                .into_owned(),
            size_on_disk: record.size_on_disk.unwrap_or_else(|| "0".to_string()),
            buildid: record.buildid,
        },
        flags => AcfState::Downloading {
            state_flags: flags,
            bytes_downloaded: bytes_field(&record.bytes_downloaded),
            bytes_to_download: bytes_field(&record.bytes_to_download),
            bytes_staged: bytes_field(&record.bytes_staged),
            bytes_to_stage: bytes_field(&record.bytes_to_stage),
        },
    }
}

/// Steam sets StateFlags bit 0x2 (UpdateRequired) while an update is pending.
const STATE_FLAG_UPDATE_REQUIRED: u32 = 0x2;

/// Update-relevant ACF fields (acfUpdateState.ts `AcfUpdateFields`); build ids stay strings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcfUpdateFields {
    pub steamapps_dir: String,
    pub buildid: String,
    pub target_build_id: Option<String>,
    pub state_flags: u32,
    pub bytes_to_download: u64,
    pub bytes_downloaded: u64,
    pub scheduled_auto_update: u64,
    pub beta_key: Option<String>,
}

/// `readAcfUpdateState`: first steamapps dir (in source order) whose manifest yields fields.
pub fn read_acf_update_state(
    roots: &PollRoots,
    app_id: &str,
    source: AcfSource,
) -> Option<AcfUpdateFields> {
    if !is_numeric_app_id(app_id) {
        return None;
    }
    // Non-strict, like the TS reader: a library-list failure degrades to the system path.
    let dirs = steamapps_dirs(roots, source, false)?;
    dirs.iter()
        .find_map(|dir| read_acf_update_fields_from_dir(dir, app_id))
}

/// One steamapps dir's manifest for `app_id`; `None` when absent, corrupt, bad id or no buildid.
pub fn read_acf_update_fields_from_dir(
    steamapps_dir: &str,
    app_id: &str,
) -> Option<AcfUpdateFields> {
    if !is_numeric_app_id(app_id) {
        return None;
    }
    let path = Path::new(steamapps_dir).join(format!("appmanifest_{app_id}.acf"));
    let res = gamelib_steamfiles::acf::read_acf(&path);
    if !res.exists || res.read_error.is_some() {
        return None;
    }
    let rec = res.record?;
    let buildid = rec.buildid?;
    Some(AcfUpdateFields {
        steamapps_dir: steamapps_dir.to_string(),
        buildid,
        target_build_id: rec.target_build_id,
        state_flags: rec.state_flags.unwrap_or(0),
        bytes_to_download: bytes_field(&rec.bytes_to_download),
        bytes_downloaded: bytes_field(&rec.bytes_downloaded),
        scheduled_auto_update: bytes_field(&rec.scheduled_auto_update),
        beta_key: rec.beta_key.filter(|k| !k.is_empty()),
    })
}

/// Pending when StateFlags carries UpdateRequired, or TargetBuildID is a real build different
/// from buildid, or an update is scheduled with bytes still to fetch. A bare non-zero
/// BytesToDownload is not enough: Steam leaves the last download's counters in an up-to-date ACF.
pub fn is_acf_update_pending(f: &AcfUpdateFields) -> bool {
    if f.state_flags & STATE_FLAG_UPDATE_REQUIRED != 0 {
        return true;
    }
    if let Some(t) = f.target_build_id.as_deref() {
        if !t.is_empty() && t != "0" && t != f.buildid {
            return true;
        }
    }
    f.scheduled_auto_update > 0 && f.bytes_to_download > f.bytes_downloaded
}
