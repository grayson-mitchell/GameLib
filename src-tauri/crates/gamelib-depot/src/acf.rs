//! appmanifest_*.acf write (D-11). Ports `depot/manifest.ts` (`buildAppManifestText`,
//! `writeAppManifest`) and `depot/finalize.ts` (`finalizeToSteam`), plus the completeness gate
//! `canWriteFullOwnership` / `shouldFinalizeAfterThrow` from `depot/download.ts`.
//!
//! `finalize` is the single convergence point: cancel, failure and success all call it (one
//! exception: `preserve_installed_manifest`, a user cancel that changed nothing over an already
//! installed manifest), and the ACF rename is the last filesystem action it takes. StateFlags "4" needs BOTH the TS policy
//! input (`FinalizeSpec::allow_full_ownership`) and `can_write_full_ownership`; anything absent or
//! ambiguous writes the "1026" verify-handoff.

use std::fs;
use std::io::Write;
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

#[derive(Debug, Clone)]
pub struct InstalledDepot {
    pub depot_id: String,
    pub manifest: String,
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct AppManifestParams {
    pub app_id: String,
    pub installdir: String,
    pub name: String,
    pub size_on_disk: String,
    /// Defaults to "0".
    pub buildid: Option<String>,
    /// SteamID64 string; defaults to "0".
    pub last_owner: Option<String>,
    /// Defaults to "1026".
    pub state_flags: Option<String>,
    /// BytesToDownload / BytesDownloaded; defaults to "0".
    pub bytes: Option<String>,
    /// quick 261110-up7: Steam beta branch, written into UserConfig as BetaKey. Omitted when
    /// None, "public" or not a valid branch name.
    pub beta_key: Option<String>,
    pub installed_depots: Vec<InstalledDepot>,
}

/// Same rule as TS isValidBetaKey: ASCII alphanumeric or `.`/`_`/`-`, 1..=64 bytes.
fn is_valid_beta_key(s: &str) -> bool {
    (1..=64).contains(&s.len())
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b == b'-')
}

fn is_numeric(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

fn assert_numeric(id: &str, label: &str) -> Result<(), String> {
    if is_numeric(id) {
        Ok(())
    } else {
        Err(format!(
            "writeAppManifest: rejected non-numeric {label} \"{id}\""
        ))
    }
}

/// "0" is the intentional untouched sentinel and is exempt from the numeric shape check.
fn assert_numeric_buildid(buildid: &str) -> Result<(), String> {
    if buildid == "0" || is_numeric(buildid) {
        Ok(())
    } else {
        Err(format!(
            "writeAppManifest: rejected non-numeric buildid \"{buildid}\""
        ))
    }
}

/// Backslash first, then quote; line breaks and tabs become a space (WR-01).
pub fn vdf_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\r' | '\n' | '\t' => out.push(' '),
            c => out.push(c),
        }
    }
    out
}

/// Pure text builder. `last_updated` is injected (unix seconds) so goldens are stable.
pub fn build_app_manifest_text(p: &AppManifestParams, last_updated: u64) -> Result<String, String> {
    assert_numeric(&p.app_id, "appId")?;
    let buildid = p.buildid.as_deref().unwrap_or("0");
    assert_numeric_buildid(buildid)?;
    let last_owner = p.last_owner.as_deref().unwrap_or("0");
    let state_flags = p.state_flags.as_deref().unwrap_or("1026");
    let bytes = p.bytes.as_deref().unwrap_or("0");

    let mut depots = Vec::with_capacity(p.installed_depots.len());
    for d in &p.installed_depots {
        assert_numeric(&d.depot_id, "depotId")?;
        assert_numeric(&d.manifest, "manifest")?;
        depots.push(format!(
            "\t\t\"{}\"\n\t\t{{\n\t\t\t\"manifest\"\t\t\"{}\"\n\t\t\t\"size\"\t\t\"{}\"\n\t\t}}",
            d.depot_id, d.manifest, d.size
        ));
    }
    let block = depots.join("\n");
    let beta_line = p
        .beta_key
        .as_deref()
        .filter(|k| *k != "public" && is_valid_beta_key(k))
        .map(|k| format!("\n\t\t\"BetaKey\"\t\t\"{k}\""))
        .unwrap_or_default();

    let lines = [
        "\"AppState\"".to_string(),
        "{".to_string(),
        format!("\t\"appid\"\t\t\"{}\"", p.app_id),
        "\t\"Universe\"\t\t\"1\"".to_string(),
        format!("\t\"StateFlags\"\t\t\"{state_flags}\""),
        format!("\t\"installdir\"\t\t\"{}\"", vdf_escape(&p.installdir)),
        format!("\t\"name\"\t\t\"{}\"", vdf_escape(&p.name)),
        format!("\t\"LastUpdated\"\t\t\"{last_updated}\""),
        format!("\t\"SizeOnDisk\"\t\t\"{}\"", p.size_on_disk),
        format!("\t\"buildid\"\t\t\"{buildid}\""),
        format!("\t\"LastOwner\"\t\t\"{last_owner}\""),
        format!("\t\"BytesToDownload\"\t\t\"{bytes}\""),
        format!("\t\"BytesDownloaded\"\t\t\"{bytes}\""),
        "\t\"AutoUpdateBehavior\"\t\t\"0\"".to_string(),
        "\t\"InstalledDepots\"".to_string(),
        "\t{".to_string(),
        block,
        "\t}".to_string(),
        "\t\"UserConfig\"".to_string(),
        format!("\t{{{beta_line}"),
        "\t}".to_string(),
        "\t\"MountedDepots\"".to_string(),
        "\t{".to_string(),
        "\t}".to_string(),
        "}".to_string(),
    ];
    Ok(lines.join("\n") + "\n")
}

/// tmp + fsync + rename in the same directory. The tmp file is removed on any error.
pub fn write_app_manifest(
    steamapps_dir: &Path,
    p: &AppManifestParams,
    last_updated: u64,
) -> Result<PathBuf, String> {
    let text = build_app_manifest_text(p, last_updated)?;
    let final_path = steamapps_dir.join(format!("appmanifest_{}.acf", p.app_id));
    let tmp_path = steamapps_dir.join(format!("appmanifest_{}.acf.tmp", p.app_id));
    let res = (|| -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp_path)?;
        f.write_all(text.as_bytes())?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp_path, &final_path)
    })();
    if let Err(e) = res {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("writeAppManifest: {e}"));
    }
    Ok(final_path)
}

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

/// Reads `StateFlags` from `appmanifest_<app_id>.acf` in `steamapps_dir`. `None` for a missing
/// file, no `StateFlags` line, or a non-numeric value.
pub fn read_existing_state_flags(steamapps_dir: &Path, app_id: &str) -> Option<u32> {
    let text = fs::read_to_string(steamapps_dir.join(format!("appmanifest_{app_id}.acf"))).ok()?;
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
    if !is_numeric(app_id) {
        return Err(io_failure(format!(
            "writeAppManifest: rejected non-numeric appId \"{app_id}\""
        )));
    }
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
