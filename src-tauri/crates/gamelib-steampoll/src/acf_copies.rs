//! Copy half of acfState.ts (enumerate, find-other-manifests, scan-downloading, remove). Ported by
//! plan 05 (D-12).
//!
//! `remove_copy` deletes directories, so it is the security-critical piece of Phase 80: the install
//! root passes [`guard_install_root`] (and only that guard, which exists only in Rust) before any
//! `remove_dir_all`. Bottle lifecycle stays TS: a bridge removal only reports which per-game
//! bottle the caller should hand to `removePerGameBridgeBottle`; this module never removes a
//! bottle. Logging: appId, source and outcome only (T-80-14).
//!
//! Known deltas from the TS, all in the refusing direction: a symlinked install root or common dir
//! is refused (TS removed the link only), and an `installdir` that is absolute, drive-prefixed or
//! has a `.`/`..` segment is refused. The library root is the steamapps dir the manifest was read
//! from, never one recovered from the installdir-derived install path (80-REVIEW A/CR-01).

use std::path::{Component, Path, PathBuf};

use gamelib_steamfiles::library::scan_acfs;
use serde::{Deserialize, Serialize};

use crate::acf_state::{
    read_acf_state, read_acf_state_located, steam_libraries, AcfSource, AcfState, PollRoots,
};

/// Sentinel conflict: "could not read, assume a co-installed app" (T-75-55, WR-02).
pub const UNKNOWN_CONFLICT: &str = "<unknown>";

/// Per-game bridge bottle name prefix (`bridgeBottleNameFor`).
const BRIDGE_BOTTLE_PREFIX: &str = "GameLibSteamBridge-";

const ALL_ACF_SOURCES: [AcfSource; 3] = [AcfSource::Native, AcfSource::Bottle, AcfSource::Bridge];

fn is_numeric_app_id(app_id: &str) -> bool {
    !app_id.is_empty() && app_id.bytes().all(|b| b.is_ascii_digit())
}

fn source_name(source: AcfSource) -> &'static str {
    match source {
        AcfSource::Native => "native",
        AcfSource::Bottle => "bottle",
        AcfSource::Bridge => "bridge",
    }
}

/// One installed copy (acfState.ts `SteamInstallCopy`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamInstallCopy {
    pub source: AcfSource,
    pub install_path: String,
    pub size_on_disk: String,
}

/// Probes native, bottle, bridge in that order; lists installed copies only. A probe that learns
/// nothing (`Unknown`) is skipped, never fatal.
pub fn enumerate_copies(roots: &PollRoots, app_id: &str) -> Vec<SteamInstallCopy> {
    let mut copies = Vec::new();
    for source in ALL_ACF_SOURCES {
        match read_acf_state(roots, app_id, source) {
            AcfState::Installed {
                install_path,
                size_on_disk,
                ..
            } if !install_path.is_empty() => copies.push(SteamInstallCopy {
                source,
                install_path,
                size_on_disk,
            }),
            AcfState::Unknown => {
                eprintln!(
                    "gamelib-steampoll: enumerate_copies probe unknown for appId {app_id} source {}",
                    source_name(source)
                );
            }
            _ => {}
        }
    }
    copies
}

/// AppIds in `steamapps_dir` (other than `self_app_id`) whose manifest declares the same
/// `installdir`. Any manifest or directory the scan could not read yields [`UNKNOWN_CONFLICT`]
/// instead of "no conflict", because the result gates a recursive delete. A missing directory is
/// `[]`, as in the TS. On macOS and Windows the comparison ignores case, because the default
/// volumes there are case-insensitive and `Game`/`game` are one directory (80-REVIEW A/WR-02);
/// over-reporting only downgrades the removal to manifest-only, the safe direction. Elsewhere it
/// is exact.
pub fn find_other_manifests_with_installdir(
    steamapps_dir: &str,
    installdir_segment: &str,
    self_app_id: &str,
) -> Vec<String> {
    let scan = scan_acfs(&[steamapps_dir.to_string()]);
    let own = format!("appmanifest_{self_app_id}.acf");
    let mut conflicting = Vec::new();
    if scan.skipped.iter().any(|s| s.file_name != own) {
        conflicting.push(UNKNOWN_CONFLICT.to_string());
    }
    for rec in &scan.records {
        if rec.file_name == own {
            continue;
        }
        if !rec
            .record
            .installdir
            .as_deref()
            .is_some_and(|d| same_installdir(d, installdir_segment))
        {
            continue;
        }
        let appid = rec.record.appid.clone().unwrap_or_default();
        if !appid.is_empty() && appid != self_app_id {
            conflicting.push(appid);
        }
    }
    conflicting
}

/// Whether two installdirs name the same directory on this platform's default filesystem.
#[cfg(any(target_os = "macos", windows))]
fn same_installdir(a: &str, b: &str) -> bool {
    a == b || a.to_lowercase() == b.to_lowercase()
}
#[cfg(not(any(target_os = "macos", windows)))]
fn same_installdir(a: &str, b: &str) -> bool {
    a == b
}

/// JS `parseInt(s, 10)` for non-negative values: leading digits, else `None`.
fn parse_int_prefix(s: &str) -> Option<u64> {
    let t = s.trim_start();
    let digits: String = t.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

/// AppIds whose manifest has StateFlags bit 4 unset (download in progress), across all native
/// libraries. The TS additionally keeps only appIds present in the in-memory library map; that
/// filter is sidecar state, so the caller applies it. An unreadable library list or scan yields
/// `[]`.
pub fn scan_downloading_app_ids(roots: &PollRoots) -> Vec<String> {
    let Ok(libs) = steam_libraries(&roots.steam_root, false) else {
        return Vec::new();
    };
    let dirs: Vec<String> = libs
        .iter()
        .map(|l| l.join("steamapps").to_string_lossy().into_owned())
        .collect();
    let scan = scan_acfs(&dirs);
    let mut out = Vec::new();
    for rec in scan.records {
        let Some(id) = rec.record.appid.as_deref().and_then(parse_int_prefix) else {
            continue;
        };
        if let Some(flags) = rec.record.state_flags {
            if flags & 4 == 0 {
                out.push(id.to_string());
            }
        }
    }
    out
}

/// Outcome of a single-root [`remove_copy`] (acfState.ts `RemoveCopyResult`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum RemoveCopyResult {
    #[serde(rename_all = "camelCase")]
    Removed {
        source: AcfSource,
        manifest_only: bool,
        /// Set only for a full `bridge` removal: the per-game bottle name
        /// (`GameLibSteamBridge-<appId>`) the TS caller resolves (legacy shared bottle => skip)
        /// and hands to `removePerGameBridgeBottle`. Rust never removes a bottle.
        bridge_bottle: Option<String>,
    },
    Absent {
        source: AcfSource,
    },
    Refused {
        source: AcfSource,
        reason: String,
    },
}

fn refused(source: AcfSource, reason: &str) -> RemoveCopyResult {
    RemoveCopyResult::Refused {
        source,
        reason: reason.to_string(),
    }
}

/// Whether an untrusted manifest `installdir` is safe to delete as `common/<installdir>`.
#[derive(Debug, PartialEq, Eq)]
enum InstalldirShape {
    /// Exactly one plain segment.
    Single,
    /// Plain relative segments, but more than one (`Studio/GameA`): deleting it would mean
    /// deleting a parent other apps may share (80-REVIEW A/WR-01).
    Nested,
    /// Absolute, drive-prefixed, or carrying a `.`/`..` segment (80-REVIEW A/CR-01).
    Escaping,
}

fn installdir_shape(installdir: &str) -> InstalldirShape {
    // `\` and `:` are separators or drive markers on Windows; NUL is never a valid name. Refuse
    // them on every OS so one manifest means one thing everywhere.
    if installdir.contains(['\\', ':', '\0']) {
        return InstalldirShape::Escaping;
    }
    let path = Path::new(installdir);
    if path.is_absolute() || path.has_root() {
        return InstalldirShape::Escaping;
    }
    let mut count = 0usize;
    for c in path.components() {
        match c {
            Component::Normal(_) => count += 1,
            _ => return InstalldirShape::Escaping,
        }
    }
    match count {
        0 => InstalldirShape::Escaping,
        1 => InstalldirShape::Single,
        _ => InstalldirShape::Nested,
    }
}

fn is_symlink(p: &Path) -> bool {
    std::fs::symlink_metadata(p).is_ok_and(|m| m.file_type().is_symlink())
}

/// Windows junctions and mount points are reparse points that `is_symlink` does not report.
#[cfg(windows)]
fn is_reparse_point(p: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    std::fs::symlink_metadata(p)
        .is_ok_and(|m| m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0)
}
#[cfg(not(windows))]
fn is_reparse_point(_p: &Path) -> bool {
    false
}

/// The only install-root guard (D-12, T-80-11/12). Refuses unless `install_root` is absolute, has
/// no `.` or `..` segment, has a `steamapps` ancestor (case-insensitive), is not itself a symlink
/// or reparse point, has a `common` parent that is not one, and (when it exists) canonicalizes
/// inside `canonicalize(steamapps_dir)/common`.
pub fn guard_install_root(steamapps_dir: &Path, install_root: &Path) -> Result<(), String> {
    let bad = |why: &str| Err(format!("install root refused: {why}"));
    if !install_root.is_absolute() {
        return bad("not absolute");
    }
    let text = install_root.to_string_lossy();
    let segs: Vec<&str> = text.split(['/', '\\']).filter(|s| !s.is_empty()).collect();
    if segs.iter().any(|s| *s == "." || *s == "..") {
        return bad("dot segment");
    }
    let Some((_leaf, ancestors)) = segs.split_last() else {
        return bad("empty");
    };
    if !ancestors
        .iter()
        .any(|s| s.eq_ignore_ascii_case("steamapps"))
    {
        return bad("no steamapps ancestor");
    }
    let Some(common) = install_root.parent() else {
        return bad("no parent");
    };
    if is_symlink(install_root)
        || is_reparse_point(install_root)
        || is_symlink(common)
        || is_reparse_point(common)
    {
        return bad("symlinked root");
    }
    if std::fs::symlink_metadata(install_root).is_err() {
        // Nothing to delete; the caller removes the manifest only.
        return Ok(());
    }
    let (Ok(canon_root), Ok(canon_steamapps)) = (
        std::fs::canonicalize(install_root),
        std::fs::canonicalize(steamapps_dir),
    ) else {
        return bad("cannot canonicalize");
    };
    if canon_root.starts_with(canon_steamapps.join("common")) && canon_root.parent().is_some() {
        Ok(())
    } else {
        bad("outside steamapps/common")
    }
}

/// Deletes ONE root's install copy for `app_id` (acfState.ts `removeSteamInstallCopy`), branch for
/// branch. Never panics; every refusal leaves the disk untouched.
pub fn remove_copy(roots: &PollRoots, app_id: &str, source: AcfSource) -> RemoveCopyResult {
    let src = source_name(source);
    if !is_numeric_app_id(app_id) {
        eprintln!("gamelib-steampoll: remove_copy rejected non-numeric appId (source {src})");
        return refused(source, "invalid appId");
    }
    let (state, location) = read_acf_state_located(roots, app_id, source);
    match state {
        AcfState::Absent => return RemoveCopyResult::Absent { source },
        AcfState::Unknown => return refused(source, "install state unknown"),
        AcfState::Downloading { .. } => {
            eprintln!("gamelib-steampoll: remove_copy refused appId {app_id} source {src}: install in progress");
            return refused(source, "install in progress");
        }
        AcfState::Installed { .. } => {}
    }
    let Some(location) = location else {
        return refused(source, "no install path");
    };
    let installdir = location.installdir.unwrap_or_default();
    if installdir.is_empty() {
        return refused(source, "no install path");
    }

    // The library root is the steamapps dir the manifest was actually read from (one of the
    // configured roots), never recovered from installPath: an absolute or `..`-climbing
    // installdir could otherwise point the root, the guard and the conflict scan at another
    // library (80-REVIEW A/CR-01). The installdir itself must be exactly one plain segment, so
    // the directory deleted is the one the manifest names and the conflict scan compares like
    // with like (80-REVIEW A/WR-01).
    match installdir_shape(&installdir) {
        InstalldirShape::Single => {}
        InstalldirShape::Nested => {
            eprintln!(
                "gamelib-steampoll: remove_copy refused appId {app_id} source {src}: nested installdir"
            );
            return refused(source, "installdir is not a single folder");
        }
        InstalldirShape::Escaping => {
            eprintln!(
                "gamelib-steampoll: remove_copy refused appId {app_id} source {src}: outside common/"
            );
            return refused(source, "install path outside common/");
        }
    }
    let segment = Path::new(&installdir)
        .components()
        .next()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .unwrap_or_default();

    let steamapps_dir = PathBuf::from(&location.steamapps_dir);
    let common_root = steamapps_dir.join("common");
    let install_root = common_root.join(&segment);
    let manifest_path = steamapps_dir.join(format!("appmanifest_{app_id}.acf"));

    if let Err(reason) = guard_install_root(&steamapps_dir, &install_root) {
        eprintln!("gamelib-steampoll: remove_copy refused appId {app_id} source {src}: {reason}");
        return refused(source, "install path outside common/");
    }

    let conflicting =
        find_other_manifests_with_installdir(&steamapps_dir.to_string_lossy(), &segment, app_id);
    if !conflicting.is_empty() {
        eprintln!(
            "gamelib-steampoll: remove_copy appId {app_id} source {src}: installdir shared with {}; manifest only",
            conflicting.join(",")
        );
        let _ = std::fs::remove_file(&manifest_path);
        return RemoveCopyResult::Removed {
            source,
            manifest_only: true,
            bridge_bottle: None,
        };
    }

    // guard_install_root above has vetted install_root; remove_dir_all does not follow a
    // symlink at the top level either.
    if let Err(e) = std::fs::remove_dir_all(&install_root) {
        if e.kind() != std::io::ErrorKind::NotFound {
            eprintln!(
                "gamelib-steampoll: remove_copy appId {app_id} source {src}: remove failed ({:?})",
                e.kind()
            );
            return refused(source, "remove failed");
        }
    }
    let _ = std::fs::remove_file(&manifest_path);
    eprintln!("gamelib-steampoll: remove_copy removed appId {app_id} source {src}");

    RemoveCopyResult::Removed {
        source,
        manifest_only: false,
        bridge_bottle: (source == AcfSource::Bridge)
            .then(|| format!("{BRIDGE_BOTTLE_PREFIX}{app_id}")),
    }
}
