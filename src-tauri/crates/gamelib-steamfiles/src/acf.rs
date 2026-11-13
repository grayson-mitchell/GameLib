//! `appmanifest_*.acf` codec: the one ACF reader/writer shared with gamelib-depot (P75-D).
//!
//! The builder ([`build_app_manifest_text`], [`write_app_manifest`]) moved here from
//! gamelib-depot unchanged; the typed reader ([`read_acf`]) sits on [`crate::kv_text`]. Every
//! reader value is a decoded string (D-03): the oracle (`@node-steam/vdf`) turned numeric-looking
//! values into JS numbers, which loses precision on SteamID64s and manifest gids. Missing file,
//! unreadable file, parse error and missing `AppState` are result values, never errors.
//!
//! Per-field table (Pitfall 1): which TS caller reads which field, and as what.
//!
//! | field | TS callers | type the caller uses today | oracle runtime type |
//! |---|---|---|---|
//! | `StateFlags` | library/acfState.ts, library/installedMap.ts, macSteamAdoption.ts | number via `parseInt(x, 10)` | JS number when numeric (parseInt of a number still works) |
//! | `installdir` | library/acfState.ts, library/installedMap.ts, acfInstalldir.ts | string | string (number if all digits) |
//! | `SizeOnDisk` | library/installedMap.ts (`state.SizeOnDisk ?? '0'`), library/acfState.ts | declared string | JS number when numeric, despite the declared type |
//! | `appid`, `name`, `buildid`, `LastOwner` | library/installedMap.ts, macSteamAdoption.ts, meta/bridgeCensus.ts | string | JS number when numeric (`name "1979"` -> 1979; `LastOwner` loses precision) |
//! | `BytesDownloaded`, `BytesToDownload`, `BytesStaged`, `BytesToStage` | library/acfState.ts | number via `Number(x) \|\| 0` | JS number |
//! | `TargetBuildID`, `ScheduledAutoUpdate` | library/acfUpdateState.ts | `Number(x)` | JS number |
//! | `UserConfig.BetaKey` | depot/betaBranch.ts | string | string |
//! | `InstalledDepots.<id>.manifest`, `.size`, `.dlcappid` | acfInstalledDepots.ts, library/resumeBreadcrumbs.ts, cancelDelete.ts | string / number | gids above 2^53 lose precision as JS numbers |
//!
//! Reader keys are matched ASCII-case-insensitively (D-07). `installdir` is returned as decoded;
//! traversal containment stays with the callers (TS sanitizeInstalldir, depot
//! `resolve_contained_path`).

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::kv_text::{merged, parse, KvError, Limits, MergedMap, MergedValue};

/// ACF files above this size are not read (T-75-17).
pub const ACF_MAX_BYTES: usize = 4 * 1024 * 1024;

/// One `InstalledDepots` child.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AcfDepot {
    pub depot_id: String,
    pub manifest: String,
    pub size: String,
    pub dlc_app_id: Option<String>,
}

/// Typed `AppState`. Every value is a decoded string; `state_flags` is also parsed.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AcfRecord {
    pub appid: Option<String>,
    pub name: Option<String>,
    pub installdir: Option<String>,
    pub state_flags: Option<u32>,
    pub state_flags_raw: Option<String>,
    pub size_on_disk: Option<String>,
    pub buildid: Option<String>,
    pub last_owner: Option<String>,
    pub bytes_downloaded: Option<String>,
    pub bytes_to_download: Option<String>,
    pub bytes_staged: Option<String>,
    pub bytes_to_stage: Option<String>,
    pub target_build_id: Option<String>,
    pub scheduled_auto_update: Option<String>,
    pub beta_key: Option<String>,
    pub installed_depots: Vec<AcfDepot>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AcfReadResult {
    pub exists: bool,
    pub parsed: bool,
    pub read_error: Option<String>,
    pub record: Option<AcfRecord>,
}

fn parse_error(e: KvError) -> String {
    format!("parse: {:?} at {}", e.kind, e.offset)
}

fn result(exists: bool, read_error: Option<String>, record: Option<AcfRecord>) -> AcfReadResult {
    AcfReadResult {
        exists,
        parsed: record.is_some(),
        read_error,
        record,
    }
}

fn depots(state: &MergedMap) -> Vec<AcfDepot> {
    let Some(block) = state.map("InstalledDepots") else {
        return Vec::new();
    };
    block
        .iter()
        .filter(|(k, _)| !k.is_empty() && k.bytes().all(|b| b.is_ascii_digit()))
        .filter_map(|(k, v)| match v {
            MergedValue::Map(m) => Some(AcfDepot {
                depot_id: k.to_string(),
                manifest: m.str("manifest").unwrap_or_default(),
                size: m.str("size").unwrap_or_default(),
                dlc_app_id: m.str("dlcappid"),
            }),
            MergedValue::Str(_) => None,
        })
        .collect()
}

/// Parse ACF bytes. `exists` is true.
pub fn read_acf_bytes(bytes: &[u8]) -> AcfReadResult {
    let limits = Limits {
        max_bytes: ACF_MAX_BYTES,
        max_depth: 64,
    };
    let pairs = match parse(bytes, &limits) {
        Ok(p) => p,
        Err(e) => return result(true, Some(parse_error(e)), None),
    };
    let root = merged(&pairs);
    let Some(state) = root.map("AppState") else {
        return result(true, None, None);
    };
    let state_flags_raw = state.str("StateFlags");
    let record = AcfRecord {
        appid: state.str("appid"),
        name: state.str("name"),
        installdir: state.str("installdir"),
        state_flags: state_flags_raw
            .as_deref()
            .and_then(|s| s.trim().parse::<u32>().ok()),
        state_flags_raw,
        size_on_disk: state.str("SizeOnDisk"),
        buildid: state.str("buildid"),
        last_owner: state.str("LastOwner"),
        bytes_downloaded: state.str("BytesDownloaded"),
        bytes_to_download: state.str("BytesToDownload"),
        bytes_staged: state.str("BytesStaged"),
        bytes_to_stage: state.str("BytesToStage"),
        target_build_id: state.str("TargetBuildID"),
        scheduled_auto_update: state.str("ScheduledAutoUpdate"),
        beta_key: state.map("UserConfig").and_then(|u| u.str("BetaKey")),
        installed_depots: depots(state),
    };
    result(true, None, Some(record))
}

/// Read and parse an ACF file. Missing and unreadable files are results.
pub fn read_acf(path: &Path) -> AcfReadResult {
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return result(false, None, None),
        Err(e) => return result(true, Some(format!("read: {e}")), None),
    };
    if meta.len() > ACF_MAX_BYTES as u64 {
        return result(true, Some("parse: TooLarge at 0".to_string()), None);
    }
    match std::fs::read(path) {
        Ok(b) => read_acf_bytes(&b),
        Err(e) => result(true, Some(format!("read: {e}")), None),
    }
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
pub fn is_valid_beta_key(s: &str) -> bool {
    (1..=64).contains(&s.len())
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b == b'-')
}

pub fn is_numeric(s: &str) -> bool {
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
    crate::atomic::atomic_write(&final_path, text.as_bytes())
        .map_err(|e| format!("writeAppManifest: {e}"))?;
    Ok(final_path)
}
