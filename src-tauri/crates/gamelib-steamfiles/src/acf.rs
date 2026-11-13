//! `appmanifest_*.acf` codec: the one ACF reader/writer shared with gamelib-depot (P75-D).

use std::path::{Path, PathBuf};

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
