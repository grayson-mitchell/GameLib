//! appmanifest_*.acf write (D-11). Ports `depot/manifest.ts` (`buildAppManifestText`,
//! `writeAppManifest`) and `depot/finalize.ts` (`finalizeToSteam`), plus the completeness gate
//! `canWriteFullOwnership` / `shouldFinalizeAfterThrow` from `depot/download.ts`.
//!
//! `finalize` is the single convergence point: cancel, failure and success all call it (one
//! exception: `preserve_installed_manifest`, a user cancel that changed nothing over an already
//! installed manifest), and the ACF rename is the last filesystem action it takes. StateFlags "4" needs BOTH the TS policy
//! input (`FinalizeSpec::allow_full_ownership`) and `can_write_full_ownership`; anything absent or
//! ambiguous writes the "1026" verify-handoff.
//!
//! The ACF text codec lives in gamelib-steamfiles::acf (Phase 75, P75-D); this module re-exports it.

use std::fs;
use std::path::{Path, PathBuf};

use crate::job::{FinalizeSpec, PlannedDepot};
use crate::outcome::{ErrorKind, Failure};
use crate::post::resolve_contained_path;

/// Depots attempted this run (TS `FinalizeDepotEntry`): `depot_id`, `gid`, declared `size`.
pub type AttemptedDepot = PlannedDepot;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunOutcome {
    Completed,
    Cancelled,
}

/// What the download/reconcile run reports to `finalize` (TS `DepotDownloadResult`).
#[derive(Debug, Clone)]
pub struct RunResult {
    pub outcome: RunOutcome,
    pub failures: Vec<Failure>,
    pub all_files_verified: bool,
    pub all_modes_applied: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AcfWritten {
    pub path: PathBuf,
    pub state_flags: String,
    pub size_on_disk: u64,
}

pub use gamelib_steamfiles::acf::{
    build_app_manifest_text, is_numeric, vdf_escape, write_app_manifest, AppManifestParams,
    InstalledDepot,
};

/// Real bytes on disk (spike 001), never a manifest-derived sum. Missing root measures 0.
/// Symlinks are not followed.
pub fn measure_installed_bytes(root: &Path) -> u64 {
    let Ok(rd) = fs::read_dir(root) else {
        return 0;
    };
    let mut total = 0u64;
    for entry in rd.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            total += measure_installed_bytes(&entry.path());
        } else if ft.is_file() {
            if let Ok(m) = entry.metadata() {
                total += m.len();
            }
        }
    }
    total
}

/// The only decision point for StateFlags "4". Fails closed on every absent input.
pub fn can_write_full_ownership(
    outcome: RunOutcome,
    failure_count: usize,
    buildid: Option<&str>,
    all_files_verified: bool,
    all_modes_applied: bool,
) -> bool {
    outcome == RunOutcome::Completed
        && failure_count == 0
        && buildid.is_some_and(|b| !b.is_empty() && b != "0")
        && all_files_verified
        && all_modes_applied
}

/// Catch-path gate: finalize after a throw only if a download was actually attempted.
pub fn should_finalize_after_throw(download_attempted: Option<bool>) -> bool {
    download_attempted == Some(true)
}

fn io_failure(message: String) -> Failure {
    Failure {
        file: None,
        kind: ErrorKind::Io,
        message,
        code: None,
        eresult: None,
        http_status: None,
        scope: None,
        ms_since_progress: None,
    }
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Rejects a non-numeric `app_id` before it is joined into any path (75 WR-08).
pub fn check_app_id(app_id: &str) -> Result<(), Failure> {
    if is_numeric(app_id) {
        Ok(())
    } else {
        Err(io_failure(format!(
            "writeAppManifest: rejected non-numeric appId \"{app_id}\""
        )))
    }
}

/// Reads `StateFlags` from `appmanifest_<app_id>.acf` in `steamapps_dir`. `None` for a missing
/// file, no `StateFlags` line, or a non-numeric value.
///
/// The strict parser answers first. When it cannot parse the file at all (truncated, oversized),
/// a line scan still finds a `"StateFlags" "4"` written before the damage, as the pre-Phase-75
/// reader did, so the cancel-preserve check never reads a damaged installed manifest as "not
/// installed" and downgrades it (75 WR-07).
pub fn read_existing_state_flags(steamapps_dir: &Path, app_id: &str) -> Option<u32> {
    let path = steamapps_dir.join(format!("appmanifest_{app_id}.acf"));
    let read = gamelib_steamfiles::acf::read_acf(&path);
    match read.record {
        Some(r) => r.state_flags,
        None if read.exists => scan_state_flags_line(&path),
        None => None,
    }
}

/// Line-scan fallback for [`read_existing_state_flags`]: the first `"StateFlags" "<n>"` line
/// (key ASCII-case-insensitive), reading at most 64 MiB.
fn scan_state_flags_line(path: &Path) -> Option<u32> {
    use std::io::Read;
    let mut bytes = Vec::new();
    fs::File::open(path)
        .ok()?
        .take(64 * 1024 * 1024)
        .read_to_end(&mut bytes)
        .ok()?;
    let text = String::from_utf8_lossy(&bytes);
    for line in text.lines() {
        let mut quoted = line.split('"').skip(1).step_by(2);
        let Some(key) = quoted.next() else { continue };
        if !key.eq_ignore_ascii_case("StateFlags") {
            continue;
        }
        return quoted.last().and_then(|v| v.trim().parse::<u32>().ok());
    }
    None
}

/// A user-cancelled job that fetched nothing and wrote no file must not downgrade a manifest that
/// was already fully installed (todo 2026-11-09, 73-18 Zomboid data loss).
pub fn preserve_installed_manifest(
    cancelled: bool,
    bytes_fetched: u64,
    files_written: u64,
    existing: Option<u32>,
) -> bool {
    cancelled && bytes_fetched == 0 && files_written == 0 && existing.is_some_and(|f| f & 4 != 0)
}

/// Single recovery function (cancel, failure and success). The ACF rename is the last
/// filesystem action. Blocking work runs on `spawn_blocking`.
pub async fn finalize(
    spec: &FinalizeSpec,
    app_id: &str,
    attempted: &[AttemptedDepot],
    result: &RunResult,
) -> Result<AcfWritten, Failure> {
    check_app_id(app_id)?;
    let steamapps = PathBuf::from(&spec.steamapps_dir);
    let common = steamapps.join("common");
    let install_root =
        resolve_contained_path(&common, &spec.installdir).map_err(|e| io_failure(e.message))?;

    let can4 = spec.allow_full_ownership
        && can_write_full_ownership(
            result.outcome,
            result.failures.len(),
            spec.buildid.as_deref(),
            result.all_files_verified,
            result.all_modes_applied,
        );

    let spec = spec.clone();
    let app_id = app_id.to_string();
    let depots: Vec<InstalledDepot> = attempted
        .iter()
        .map(|d| InstalledDepot {
            depot_id: d.depot_id.clone(),
            manifest: d.gid.clone(),
            size: d.size,
        })
        .collect();

    tokio::task::spawn_blocking(move || {
        let size = measure_installed_bytes(&install_root);
        fs::create_dir_all(&steamapps).map_err(|e| io_failure(format!("writeAppManifest: {e}")))?;
        let last_owner = spec.last_owner.clone().filter(|o| is_numeric(o));
        let params = AppManifestParams {
            app_id,
            installdir: spec.installdir.clone(),
            name: spec.name.clone(),
            size_on_disk: size.to_string(),
            buildid: if can4 { spec.buildid.clone() } else { None },
            last_owner,
            state_flags: if can4 { Some("4".into()) } else { None },
            bytes: if can4 { Some(size.to_string()) } else { None },
            beta_key: spec.beta_key.clone(),
            installed_depots: depots,
        };
        let path = write_app_manifest(&steamapps, &params, unix_now()).map_err(io_failure)?;
        Ok(AcfWritten {
            path,
            state_flags: if can4 { "4" } else { "1026" }.to_string(),
            size_on_disk: size,
        })
    })
    .await
    .map_err(|e| io_failure(format!("finalize task: {e}")))?
}
