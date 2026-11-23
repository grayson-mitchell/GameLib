//! `installOrUpdateTool` (`tools/index.ts`): bring one release-feed tool (DXVK, VKD3D, dxvk-nvapi,
//! the macOS DXVK, and DXMT in 87-30) up to the version its feed names.
//!
//! The order is the TS: skip a tool for another OS, ask the feed (a GitHub releases URL) for its
//! first asset, compare the asset's version with `<tools>/<tool>/latest_<tool>`, and when it
//! differs download the archive through the `Fetch` seam to `<tools>/<tool>/<asset>`, extract it
//! with `tar` through `extract_tar` (a `Helper` child) into `<tools>/<tool>/<version>`, remove the
//! archive and write the version file. Two things go beyond the TS (D-17, T-87-28): the archive and
//! the version the new one replaces are removed through `gamelib-safety`, with `<tools>/<tool>` as
//! the trust root, so nothing outside the tool's own directory can be deleted whatever the feed or
//! the version file say; and a feed asset name is accepted only as one plain path component.
//!
//! No log line carries a URL or a response body (T-87-09): a failure is a category word.

use std::path::{Path, PathBuf};

use gamelib_engine::ctx::Platform;
use gamelib_engine::fetch::FetchRequest;
use serde_json::{Map, Value};

use super::{plain_name, DxvkError};
use crate::ctx::WineCtx;
use crate::extract::extract_tar;
use crate::manager::{log_error, log_info, log_warn, remove_guarded};

/// One tool of a release feed (`Tool` in `common/types.ts`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tool {
    pub name: &'static str,
    /// The GitHub releases URL (`.../releases/latest` or `.../releases/tags/<tag>`).
    pub url: String,
    /// The OS the tool is for, as Node names it: `linux` or `darwin`.
    pub os: &'static str,
    /// The leading path components `tar` strips; `None` is one (the TS default).
    pub strip: Option<u32>,
}

/// What one `install_or_update_tool` call did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolOutcome {
    /// The tool is for another OS.
    OtherOs,
    /// The feed listed no asset.
    NoAssets,
    /// The installed version is the feed's and its directory is there.
    UpToDate,
    /// The archive could not be downloaded (the user was told).
    DownloadFailed,
    /// The archive was downloaded but would not extract; the partial extraction was removed.
    ExtractFailed,
    /// The new version is extracted and `latest_<tool>` names it.
    Updated,
}

/// The OS a platform is, as Node's `process.platform` names it.
pub(crate) fn node_os(platform: Platform) -> &'static str {
    match platform {
        Platform::Mac => "darwin",
        Platform::Linux => "linux",
        Platform::Windows => "win32",
    }
}

/// The text of the first line of `<tools>/<tool>/latest_<tool>`, or `""` when it is not there.
pub(crate) fn installed_version(ctx: &WineCtx, tool: &str) -> String {
    let file = tool_dir(ctx, tool).join(format!("latest_{tool}"));
    first_line(&std::fs::read(file).unwrap_or_default())
}

/// The first line of `bytes` (`.toString().split('\n')[0]`).
pub(crate) fn first_line(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes)
        .split('\n')
        .next()
        .unwrap_or_default()
        .to_string()
}

/// `<tools>/<tool>`.
pub(crate) fn tool_dir(ctx: &WineCtx, tool: &str) -> PathBuf {
    ctx.engine.paths.tools_path.join(tool)
}

/// The two texts of the download-failure dialog: DXMT has its own, every other tool shares DXVK's.
fn failure_text(ctx: &WineCtx, tool: &str) -> (String, String) {
    let t = |key: &str, default: &str| ctx.engine.i18n.t(key, default, &Map::new());
    if tool == "dxmt" {
        (
            t("box.error.dxmt.title", "DXMT Download Error"),
            t(
                "box.error.dxmt.message",
                "Error downloading DXMT! Check your connection!",
            ),
        )
    } else {
        (
            t("box.error.dxvk.title", "DXVK/VKD3D error"),
            t(
                "box.error.dxvk.message",
                "Error installing DXVK/VKD3D! Check your connection!",
            ),
        )
    }
}

/// The asset the tool installs from a feed answer: the first one, except that the macOS DXVK
/// never takes a `-builtin` asset (its repack is used instead). `Ok(None)` is a feed that lists
/// no asset; `Err` is an answer that is not a release.
fn pick_asset(tool: &Tool, body: &Value) -> Result<Option<(String, String)>, DxvkError> {
    let assets = body
        .get("assets")
        .and_then(Value::as_array)
        .ok_or(DxvkError::Feed)?;
    let Some(first) = assets.first() else {
        return Ok(None);
    };
    let name_of = |asset: &Value| -> Option<(String, String)> {
        Some((
            asset.get("name")?.as_str()?.to_string(),
            asset.get("browser_download_url")?.as_str()?.to_string(),
        ))
    };
    let mut chosen = name_of(first).ok_or(DxvkError::Feed)?;
    if tool.name == "dxvk-macOS" && chosen.0.contains("-builtin") {
        // Do not use the -builtin asset for dxvk macOS (the TS did the same).
        chosen = assets
            .iter()
            .filter_map(name_of)
            .find(|(name, _)| name.ends_with("repack.tar.gz"))
            .ok_or(DxvkError::Feed)?;
    }
    Ok(Some(chosen))
}

/// `name.replace('.tar.gz', '').replace('.tar.xz', '')`: the first occurrence of each.
fn version_of(name: &str) -> String {
    name.replacen(".tar.gz", "", 1).replacen(".tar.xz", "", 1)
}

/// Removes `path` through `gamelib-safety` with `<tools>/<tool>` as the folder it must lie
/// strictly inside. Failure is logged and is not an error of the install.
fn remove_inside(ctx: &WineCtx, tool: &str, path: &Path, what: &str) {
    if !path.exists() {
        return;
    }
    if remove_guarded(ctx, path, &tool_dir(ctx, tool)).is_err() {
        log_warn(ctx, &format!("Could not remove {what} of {tool}"));
    }
}

/// Installs or updates `tool`. `Err` is a feed that did not answer or answered nothing usable (the
/// TS awaited the request, so a failed feed rejected the whole install).
pub async fn install_or_update_tool(ctx: &WineCtx, tool: &Tool) -> Result<ToolOutcome, DxvkError> {
    if tool.os != node_os(ctx.engine.platform) {
        return Ok(ToolOutcome::OtherOs);
    }

    let request = FetchRequest::get(&tool.url).gamelib_agent(&ctx.engine.app_version);
    let response = ctx
        .fetch
        .get(request)
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|_| DxvkError::Feed)?;
    let body: Value = serde_json::from_slice(&response.body).map_err(|_| DxvkError::Feed)?;
    let Some((name, download_url)) = pick_asset(tool, &body)? else {
        log_error(ctx, &format!("No release assets found for {}", tool.name));
        return Ok(ToolOutcome::NoAssets);
    };
    // The name becomes a path component and the URL is fetched: the feed is GitHub's, but a name
    // that walks out of the tool directory or a URL that is not https is refused all the same.
    if !plain_name(&name) || !download_url.starts_with("https://") {
        return Err(DxvkError::Feed);
    }

    let latest_version = version_of(&name);
    if !plain_name(&latest_version) {
        return Err(DxvkError::Feed);
    }
    let dir = tool_dir(ctx, tool.name);
    let archive = dir.join(&name);
    let version_file = dir.join(format!("latest_{}", tool.name));
    let installed = installed_version(ctx, tool.name);

    let up_to_date = installed == latest_version && dir.join(&installed).exists();
    if up_to_date {
        return Ok(ToolOutcome::UpToDate);
    }

    std::fs::create_dir_all(&dir).map_err(|_| DxvkError::Unreadable)?;
    log_info(ctx, &format!("Updating {} to: {latest_version}", tool.name));

    let request = FetchRequest::get(&download_url).gamelib_agent(&ctx.engine.app_version);
    let downloaded = ctx
        .fetch
        .download(request, &archive, &|_| {}, ctx.engine.shutdown.token())
        .await;
    if let Err(error) = downloaded {
        log_warn(
            ctx,
            &format!("Error when downloading {} {error}", tool.name),
        );
        let (title, message) = failure_text(ctx, tool.name);
        if let Some(ui) = &ctx.engine.ui {
            ui.show_dialog(&title, &message, "ERROR", "");
        }
        return Ok(ToolOutcome::DownloadFailed);
    }

    log_info(ctx, &format!("Downloaded {}, extracting...", tool.name));
    let destination = dir.join(&latest_version);
    let extracted = extract_tar(ctx, &archive, &destination, tool.strip.unwrap_or(1)).await;
    remove_inside(ctx, tool.name, &archive, "the archive");

    if extracted.is_err() {
        log_error(ctx, &format!("Could not extract {}", tool.name));
        // A half-made (or, if the archive escaped, hostile) tree is ours to remove.
        remove_inside(ctx, tool.name, &destination, "the partial extraction");
        return Ok(ToolOutcome::ExtractFailed);
    }
    if std::fs::write(&version_file, &latest_version).is_err() {
        log_error(
            ctx,
            &format!("Could not record the version of {}", tool.name),
        );
        return Ok(ToolOutcome::ExtractFailed);
    }
    log_info(ctx, &format!("{} updated!", tool.name));

    // The version this one replaces (read from a file, so it is checked like any name).
    if !installed.is_empty() && installed != latest_version {
        if plain_name(&installed) {
            remove_inside(
                ctx,
                tool.name,
                &dir.join(&installed),
                "the replaced version",
            );
        } else {
            log_warn(
                ctx,
                &format!("The recorded version of {} is not a folder name", tool.name),
            );
        }
    }
    Ok(ToolOutcome::Updated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tool(name: &'static str) -> Tool {
        Tool {
            name,
            url: "https://api.github.com/x".to_string(),
            os: "linux",
            strip: None,
        }
    }

    #[test]
    fn the_version_drops_the_first_archive_extension_of_each_kind() {
        assert_eq!(version_of("dxvk-2.9.tar.gz"), "dxvk-2.9");
        assert_eq!(version_of("vkd3d-proton-3.0.tar.xz"), "vkd3d-proton-3.0");
        assert_eq!(version_of("plain"), "plain");
    }

    #[test]
    fn the_first_asset_is_used_and_the_macos_builtin_one_is_skipped() {
        let body = json!({"assets": [
            {"name": "a-builtin.tar.gz", "browser_download_url": "https://x/a-builtin.tar.gz"},
            {"name": "a-repack.tar.gz", "browser_download_url": "https://x/a-repack.tar.gz"}
        ]});
        assert_eq!(
            pick_asset(&tool("dxvk"), &body).unwrap().unwrap().0,
            "a-builtin.tar.gz"
        );
        assert_eq!(
            pick_asset(&tool("dxvk-macOS"), &body).unwrap().unwrap().0,
            "a-repack.tar.gz"
        );
        // Only a builtin asset: the TS dereferenced undefined; this is a bad feed.
        let only = json!({"assets": [{"name": "b-builtin.tar.gz", "browser_download_url": "u"}]});
        assert_eq!(pick_asset(&tool("dxvk-macOS"), &only), Err(DxvkError::Feed));
    }

    #[test]
    fn an_answer_that_is_not_a_release_is_an_error_and_no_assets_is_not() {
        assert_eq!(pick_asset(&tool("dxvk"), &json!({})), Err(DxvkError::Feed));
        assert_eq!(
            pick_asset(&tool("dxvk"), &json!({"assets": [{"name": 1}]})),
            Err(DxvkError::Feed)
        );
        assert_eq!(pick_asset(&tool("dxvk"), &json!({"assets": []})), Ok(None));
    }

    #[test]
    fn the_first_line_is_what_precedes_the_first_newline() {
        assert_eq!(first_line(b"dxvk-2.9\nignored"), "dxvk-2.9");
        assert_eq!(first_line(b""), "");
        assert_eq!(first_line(b"\nx"), "");
    }

    #[test]
    fn node_names_the_platforms() {
        assert_eq!(node_os(Platform::Mac), "darwin");
        assert_eq!(node_os(Platform::Linux), "linux");
        assert_eq!(node_os(Platform::Windows), "win32");
    }
}
