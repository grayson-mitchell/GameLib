//! DXMT (`tools/dxmt.ts`): the Direct3D 10/11 to Metal layer a `-DXMT` copy of a Wine-Staging-macOS
//! bundle carries. Ported from the TS and replayed against the goldens 87-09 recorded
//! (`tests/golden_dxmt.rs`).
//!
//! - [`get_latest`]: the latest-release lookup and download (`DXMT.getLatest`): GitHub's
//!   `3Shain/dxmt` `releases/latest`, through `install_or_update_tool`, into `<tools>/dxmt/<version>`
//!   with `<tools>/dxmt/latest_dxmt` naming it. Offline, it logs and does nothing.
//! - [`on_wine_installed`]: a new Wine-Staging-macOS passes the export gate (the injected
//!   [`MachoScan`](super::macho::MachoScan)), the latest DXMT is fetched, the bundle is copied to
//!   `<version>-DXMT`, the eleven DXMT files are written into the copy and the plist's two version
//!   strings gain `-DXMT`.
//! - [`on_wine_uninstalled`]: removes that copy.
//! - [`on_releases_info`] and [`boot_update`]: the `releasesInfoReady` listener, which brings the DXMT
//!   inside every existing `-DXMT` copy up to the feed's version, and the bounded boot task that runs
//!   it ([`spawn_dxmt_boot_update`], D-17: a shutdown registrant, an abandoned-after-the-bound wait
//!   and one log line).
//!
//! Crate-only (D-06): nothing calls these yet. The wine manager's install and remove do not call the
//! hooks, so the TS DXMT listener stays the only owner of the DXMT work until 87-31 switches every
//! hook in one commit; a TS and a Rust owner of the same event is what D-06 forbids.
//!
//! No log line carries a URL or a response body (T-87-09): a failure is a category word.

use std::fmt;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use gamelib_engine::ctx::Platform;
use gamelib_store::json::Json;
use serde::Deserialize;

use super::install_tool::{install_or_update_tool, installed_version, Tool};
use super::macho::{check_winemac_metal_view_exports, WinemacMetalCheck};
use super::{plain_name, DxvkError};
use crate::ctx::WineCtx;
use crate::manager::{log_error, log_info, log_warn, remove_guarded, store, text_of};

/// How long the boot update may run before it is abandoned (D-17). The fetch it guards is the whole
/// cold-boot cost of an unbounded one (measured at 27 s for the five-connection download), so the
/// bound is twice that: a slow link finishes, a stuck one is let go and tried again next boot.
pub const DXMT_BOOT_BOUND: Duration = Duration::from_secs(60);

/// The release type of a Wine whose bundle DXMT is copied into (`Wine-Staging-macOS`).
const STAGING_TYPE: &str = "Wine-Staging-macOS";

/// The files of a DXMT build copied into a Wine bundle's `lib/wine`, in the TS order.
const FILES_TO_COPY: [&str; 11] = [
    "x86_64-windows/d3d10core.dll",
    "x86_64-windows/d3d11.dll",
    "x86_64-windows/dxgi.dll",
    "x86_64-windows/nvapi64.dll",
    "x86_64-windows/nvngx.dll",
    "x86_64-windows/winemetal.dll",
    "x86_64-unix/winemetal.so",
    "i386-windows/d3d10core.dll",
    "i386-windows/d3d11.dll",
    "i386-windows/dxgi.dll",
    "i386-windows/winemetal.dll",
];

/// A Wine-manager entry as the install and uninstall events carry it (`WineVersionInfo`): the keys
/// DXMT reads, every other key ignored.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WineVersionInfo {
    pub version: String,
    /// The release type (`type` in the TS).
    #[serde(rename = "type", default)]
    pub kind: String,
    /// The version's own directory (`<wine dir>/<version>`); `None` before it is installed.
    #[serde(default)]
    pub install_dir: Option<String>,
    #[serde(default)]
    pub is_installed: bool,
}

/// Why a DXMT step ended in an error (a TS rejection). A category and nothing else: no path, URL or
/// response text (T-87-09, T-87-21).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DxmtError {
    /// The release lookup or download rejected (the feed did not answer, or answered nothing usable).
    Tool(DxvkError),
    /// A DXMT file could not be copied into an existing copy (the TS `copyFileSync` threw).
    Copy(io::ErrorKind),
    /// The releases payload names no DXMT tag (the TS read `releasesInfo['dxmt'].tag` and threw).
    Info,
}

impl fmt::Display for DxmtError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DxmtError::Tool(error) => write!(f, "tool {error}"),
            DxmtError::Copy(kind) => write!(f, "copy {kind}"),
            DxmtError::Info => f.write_str("info"),
        }
    }
}

impl std::error::Error for DxmtError {}

fn is_mac(ctx: &WineCtx) -> bool {
    ctx.engine.platform == Platform::Mac
}

/// The DXMT entry of `tools/index.ts` (`createDxmt`'s tool): the GitHub latest release, macOS only.
fn dxmt_tool() -> Tool {
    Tool {
        name: "dxmt",
        url: "https://api.github.com/repos/3Shain/dxmt/releases/latest".to_string(),
        os: "darwin",
        strip: None,
    }
}

/// `DXMT.getLatest`: bring `<tools>/dxmt` up to the latest release. Offline it logs and does nothing
/// (the TS `onlineMonitor.isOnline()` check), which still lets the caller go on to copy what is
/// already there, as the TS did.
pub async fn get_latest(ctx: &WineCtx) -> Result<(), DxmtError> {
    if !ctx.engine.is_online() {
        log_warn(ctx, "App offline, skipping possible DXMT update.");
        return Ok(());
    }
    install_or_update_tool(ctx, &dxmt_tool())
        .await
        .map(|_| ())
        .map_err(DxmtError::Tool)
}

/// The skip warning (`logDXMTSkip`): a copy is not made or not updated because its `winemac.so` lacks
/// the exports DXMT v0.80 needs. Existing copies are deliberately left alone (quick 261031-rjv).
fn log_skip(ctx: &WineCtx, action: &str, version: &str, check: &WinemacMetalCheck) {
    let WinemacMetalCheck::Fail {
        winemac_path,
        reason,
        missing,
    } = check
    else {
        return;
    };
    log_warn(
        ctx,
        &format!(
            "Not {action} DXMT copy of {version}: {winemac_path} {reason}; missing {}. DXMT v0.80 needs _macdrv_functions or all three _macdrv_view_*_metal_* exports, so D3D11 games could not present on it. Existing -DXMT copies are left untouched.",
            missing.join(", ")
        ),
    );
}

/// `<tools>/dxmt/<version>` for the installed `latest_dxmt`. An empty version (no file) names
/// `<tools>/dxmt` itself, as the TS join did, so a missing build fails on its first file; a version
/// that is not one plain folder name is refused.
fn dxmt_build_dir(ctx: &WineCtx) -> io::Result<PathBuf> {
    let version = installed_version(ctx, "dxmt");
    let base = ctx.engine.paths.tools_path.join("dxmt");
    if version.is_empty() {
        return Ok(base);
    }
    if !plain_name(&version) {
        return Err(io::Error::from(io::ErrorKind::InvalidInput));
    }
    Ok(base.join(version))
}

/// `DXMT.copyLatestDXMTFiles`: the eleven files of the installed build into a Wine bundle's
/// `Contents/Resources/wine/lib/wine`. The first failure ends the copy, as the TS `forEach` threw.
/// The per-file DEBUG line of the TS has no sink here (the engine log is info, warn and error).
pub(crate) fn copy_latest_files(ctx: &WineCtx, path_to_wine: &Path) -> Result<(), DxmtError> {
    let build = dxmt_build_dir(ctx).map_err(|e| DxmtError::Copy(e.kind()))?;
    let wine_internal = path_to_wine
        .join("Contents")
        .join("Resources")
        .join("wine")
        .join("lib")
        .join("wine");
    for file in FILES_TO_COPY {
        fs::copy(build.join(file), wine_internal.join(file))
            .map_err(|e| DxmtError::Copy(e.kind()))?;
    }
    Ok(())
}

/// `cpSync(src, dest, { recursive: true })`: directories recreated, files copied with their
/// permission bits, links recreated as links (never followed), what is already there overwritten.
fn copy_tree(src: &Path, dst: &Path) -> io::Result<()> {
    let meta = fs::symlink_metadata(src)?;
    if meta.file_type().is_symlink() {
        let target = fs::read_link(src)?;
        if fs::symlink_metadata(dst).is_ok() {
            fs::remove_file(dst)?;
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(target, dst)?;
        #[cfg(not(unix))]
        {
            let _ = target;
            fs::copy(src, dst)?;
        }
    } else if meta.is_dir() {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            copy_tree(&entry.path(), &dst.join(entry.file_name()))?;
        }
        // After the children, so a read-only source directory does not stop its own contents.
        fs::set_permissions(dst, meta.permissions())?;
    } else {
        fs::copy(src, dst)?;
    }
    Ok(())
}

/// The text with `-DXMT` appended to the string that follows `<key>{key}</key>` (the TS
/// `content.replace(/(<key>K<\/key>\n.*<string>)(.*)(<\/string>)/m, '$1$2-DXMT$3')`: the first match,
/// the value on the line after the key, greedy within that line). Unchanged when nothing matches.
fn suffix_after_key(content: &str, key: &str) -> String {
    let marker = format!("<key>{key}</key>\n");
    for (at, _) in content.match_indices(&marker) {
        let start = at + marker.len();
        // JS `.` stops at any line terminator.
        let end = content[start..]
            .find(['\n', '\r', '\u{2028}', '\u{2029}'])
            .map_or(content.len(), |n| start + n);
        let line = &content[start..end];
        let Some(close) = line.rfind("</string>") else {
            continue;
        };
        // The greedy match needs a `<string>` before that closing tag.
        if line[..close].contains("<string>") {
            let mut out = String::with_capacity(content.len() + 5);
            out.push_str(&content[..start + close]);
            out.push_str("-DXMT");
            out.push_str(&content[start + close..]);
            return out;
        }
    }
    content.to_string()
}

/// `DXMT.addDXMTSuffixInPlist`: the bundle's short version and bundle version gain `-DXMT`.
fn add_suffix_in_plist(path_to_wine: &Path) -> io::Result<()> {
    let info = path_to_wine.join("Contents").join("Info.plist");
    let content = fs::read_to_string(&info)?;
    let content = suffix_after_key(&content, "CFBundleShortVersionString");
    let content = suffix_after_key(&content, "CFBundleVersion");
    fs::write(info, content)
}

/// `DXMT.copyWineAndConfigure`: copy the bundle `<wine dir>/<version>` to `<version>-DXMT`, write the
/// DXMT files into it and mark its plist. A failure is logged, and the half-made copy is removed
/// through `gamelib-safety` inside the wine directory.
fn copy_wine_and_configure(ctx: &WineCtx, wine_dir: &Path, version: &str) {
    let wine_path = wine_dir.join(version);
    let copy_path = wine_dir.join(format!("{version}-DXMT"));
    let made = copy_tree(&wine_path, &copy_path)
        .map_err(|e| e.kind())
        .and_then(|()| copy_latest_files(ctx, &copy_path).map_err(|e| copy_kind(&e)))
        .and_then(|()| add_suffix_in_plist(&copy_path).map_err(|e| e.kind()));
    if let Err(kind) = made {
        log_error(
            ctx,
            &format!("Error copying wine staging for DXMT version {kind}"),
        );
        if copy_path.exists() && remove_guarded(ctx, &copy_path, wine_dir).is_err() {
            log_warn(ctx, "Could not remove the half-made DXMT copy");
        }
    }
}

fn copy_kind(error: &DxmtError) -> io::ErrorKind {
    match error {
        DxmtError::Copy(kind) => *kind,
        DxmtError::Tool(_) | DxmtError::Info => io::ErrorKind::Other,
    }
}

/// The `wineVersionInstalled` listener (`onWineVersionInstalled`): for a new Wine-Staging-macOS at
/// `<install_dir>/<version>`, run the export gate, fetch the latest DXMT and make the `-DXMT` copy. A
/// Wine that fails the gate is skipped with a warning, and a gate that could not run counts as failed.
/// `Err` is the TS rejection of the lookup (a feed that did not answer, or answered nothing usable).
pub async fn on_wine_installed(
    ctx: &WineCtx,
    version: &WineVersionInfo,
    install_dir: &Path,
) -> Result<(), DxmtError> {
    if !is_mac(ctx) || version.kind != STAGING_TYPE || !plain_name(&version.version) {
        return Ok(());
    }
    let bundle = install_dir.join(&version.version);
    let check = check_winemac_metal_view_exports(ctx.macho.as_ref(), &bundle);
    if matches!(check, WinemacMetalCheck::Fail { .. }) {
        log_skip(ctx, "creating", &version.version, &check);
        return Ok(());
    }
    get_latest(ctx).await?;
    copy_wine_and_configure(ctx, install_dir, &version.version);
    Ok(())
}

/// The `wineVersionUninstalled` listener (`onWineVersionUninstalled`, `DXMT.deleteWineCopy`): removes
/// `<install_dir>-DXMT` of a Wine-Staging-macOS. The copy is removed through `gamelib-safety`, and only
/// if it lies strictly inside `<tools>/wine`; a failure is logged and never raised.
pub async fn on_wine_uninstalled(ctx: &WineCtx, version: &WineVersionInfo) {
    if !is_mac(ctx) || version.kind != STAGING_TYPE {
        return;
    }
    let Some(install_dir) = version.install_dir.as_deref().filter(|d| !d.is_empty()) else {
        return;
    };
    let copy = PathBuf::from(format!("{install_dir}-DXMT"));
    if !copy.exists() {
        return;
    }
    let wine_dir = ctx.engine.paths.tools_path.join("wine");
    if remove_guarded(ctx, &copy, &wine_dir).is_err() {
        log_error(ctx, "Could not remove a DXMT copy");
        log_warn(
            ctx,
            &format!("Couldn't remove DXMT copy of {}!", version.version),
        );
    }
}

/// The `dxmt` part of the `releasesInfoReady` payload (`ReleasesInfo['dxmt']`): the feed's tag.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct DxmtStamp {
    #[serde(default)]
    pub tag: Option<String>,
}

/// The part of the `releasesInfoReady` payload DXMT reads. Every other key is ignored.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct DxmtReleasesInfo {
    #[serde(default)]
    pub dxmt: Option<DxmtStamp>,
}

/// The installed build's version as the feed names it: `latest_dxmt` holds the asset name
/// (`dxmt-v0.80-builtin`), the feed's tag is `v0.80`
/// (`.replace(/.*dxmt-/, '').replace(/-builtin.*/, '')`).
fn tag_of_installed(file_text: &str) -> String {
    let after = file_text
        .rfind("dxmt-")
        .map_or(file_text, |at| &file_text[at + "dxmt-".len()..]);
    after
        .find("-builtin")
        .map_or(after, |at| &after[..at])
        .to_string()
}

/// `path` lies strictly inside `dir`, with no `..` to walk back out.
fn strictly_inside(dir: &Path, path: &Path) -> bool {
    path != dir
        && path.starts_with(dir)
        && !path.components().any(|c| matches!(c, Component::ParentDir))
}

/// The one body of the `releasesInfoReady` listener (`onReleasesInfoReady`): when the feed's tag is not
/// the installed one, check every installed Wine-Staging-macOS that has a `-DXMT` copy against the
/// export gate, fetch the latest DXMT once if any copy passes, and write it into the passing copies.
/// A cold profile (no copy) issues no request at all (quick 260916-9vh), and a copy that fails the
/// gate is left alone (quick 261031-rjv).
///
/// `skip_offline` is the one difference between the two entry points: the listener goes on after the
/// offline skip of [`get_latest`] as the TS did, the boot task stops there.
async fn update_copies(
    ctx: &WineCtx,
    info: &DxmtReleasesInfo,
    skip_offline: bool,
) -> Result<(), DxmtError> {
    if !is_mac(ctx) {
        return Ok(());
    }
    let tag = info
        .dxmt
        .as_ref()
        .and_then(|d| d.tag.as_deref())
        .ok_or(DxmtError::Info)?;
    if tag == tag_of_installed(&installed_version(ctx, "dxmt")) {
        return Ok(());
    }
    if skip_offline && !ctx.engine.is_online() {
        log_warn(ctx, "App offline, skipping possible DXMT update.");
        return Ok(());
    }

    // The census runs before the download, and returns early when there is nothing to update: it used
    // to run after, so a cold profile fetched the archive and copied it into zero wines.
    let wine_dir = ctx.engine.paths.tools_path.join("wine");
    let wines: Vec<Json> = match store::open(ctx) {
        Ok(handle) => store::read(&handle).unwrap_or_default(),
        Err(error) => {
            log_warn(
                ctx,
                &format!("DXMT boot update: wine store {:?}", error.kind()),
            );
            Vec::new()
        }
    };
    let mut copies: Vec<PathBuf> = Vec::new();
    for wine in &wines {
        let installed = wine.get("isInstalled").and_then(Json::as_bool) == Some(true);
        if text_of(wine, "type") != Some(STAGING_TYPE) || !installed {
            continue;
        }
        let version = text_of(wine, "version").unwrap_or_default();
        let Some(install_dir) = text_of(wine, "installDir").filter(|d| !d.is_empty()) else {
            continue;
        };
        let copy = PathBuf::from(format!("{install_dir}-DXMT"));
        if !copy.exists() {
            continue;
        }
        // The entry comes from the store: only a copy inside the wine directory is written to.
        if !strictly_inside(&wine_dir, &copy) {
            log_warn(
                ctx,
                &format!("Not updating DXMT copy of {version}: it is outside the wine directory"),
            );
            continue;
        }
        let check = check_winemac_metal_view_exports(ctx.macho.as_ref(), &copy);
        if matches!(check, WinemacMetalCheck::Fail { .. }) {
            log_skip(ctx, "updating", version, &check);
        } else {
            copies.push(copy);
        }
    }
    if copies.is_empty() {
        return Ok(());
    }

    get_latest(ctx).await?;
    for copy in &copies {
        copy_latest_files(ctx, copy)?;
    }
    Ok(())
}

/// The `releasesInfoReady` listener (`onReleasesInfoReady`): updates the DXMT inside existing `-DXMT`
/// copies when the feed names a newer one. `Err` is the TS rejection (no DXMT tag in the payload, a feed
/// that did not answer, a copy that found no file to copy), including offline, where the TS went on
/// to copy from the build already in the tools directory and failed if there was none
/// (`golden/dxmt/deltas.json`, `offline-boot-returns-early`).
pub async fn on_releases_info(ctx: &WineCtx, info: &DxmtReleasesInfo) -> Result<(), DxmtError> {
    update_copies(ctx, info, false).await
}

/// The boot update: [`on_releases_info`] that does nothing offline (one warning, no scan, no request,
/// no copy). This is the body of [`spawn_dxmt_boot_update`].
pub async fn boot_update(ctx: &WineCtx, info: &DxmtReleasesInfo) -> Result<(), DxmtError> {
    update_copies(ctx, info, true).await
}

/// Runs [`boot_update`] once, in the background on the crate's runtime, as bounded boot work (D-17):
/// it holds a `Shutdown` registrant named `wine-dxmt-boot` for exactly as long as it runs, is dropped
/// (its in-flight request and download with it) after `bound` or when the application begins to exit,
/// and logs one line with the outcome word and nothing else: `done`, `failed`, `timeout`, `shutdown` or
/// `panic`. Nothing starts it yet: 87-31 starts it in the commit that removes the TS boot wiring.
///
/// Callable from any thread. An error is only a runtime that could not be built.
pub fn spawn_dxmt_boot_update(
    ctx: Arc<WineCtx>,
    info: DxmtReleasesInfo,
    bound: Duration,
) -> Result<(), String> {
    let runtime = crate::runtime().map_err(|e| format!("dxmt_boot:no-runtime ({e})"))?;
    runtime.spawn(async move {
        let token = ctx.engine.shutdown.token();
        let word = if token.is_cancelled() {
            "shutdown"
        } else {
            // The registrant lives in the work itself, so dropping the work (on the bound, or on
            // shutdown) releases it.
            let registrant = ctx.engine.shutdown.register("wine-dxmt-boot");
            let work_ctx = Arc::clone(&ctx);
            let mut work = tokio::spawn(async move {
                let _registrant = registrant;
                boot_update(&work_ctx, &info).await
            });
            tokio::select! {
                biased;
                _ = token.cancelled() => {
                    work.abort();
                    "shutdown"
                }
                done = tokio::time::timeout(bound, &mut work) => match done {
                    Ok(Ok(Ok(()))) => "done",
                    Ok(Ok(Err(_))) => "failed",
                    Ok(Err(_)) => "panic",
                    Err(_) => {
                        work.abort();
                        "timeout"
                    }
                },
            }
        };
        let line = format!("DXMT boot update: {word}");
        if word == "done" {
            log_info(&ctx, &line);
        } else {
            log_warn(&ctx, &line);
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_plist_suffix_is_added_to_the_first_matching_value_only() {
        let plist = "<dict>\n\t<key>CFBundleShortVersionString</key>\n\t<string>9.0</string>\n\t<key>CFBundleVersion</key>\n\t<string>9.0</string>\n</dict>\n";
        let once = suffix_after_key(plist, "CFBundleShortVersionString");
        assert_eq!(
            once,
            "<dict>\n\t<key>CFBundleShortVersionString</key>\n\t<string>9.0-DXMT</string>\n\t<key>CFBundleVersion</key>\n\t<string>9.0</string>\n</dict>\n"
        );
        let both = suffix_after_key(&once, "CFBundleVersion");
        assert_eq!(both.matches("-DXMT").count(), 2);
    }

    #[test]
    fn a_plist_without_the_key_or_its_string_is_left_as_it_was() {
        let none = "<dict>\n</dict>\n";
        assert_eq!(suffix_after_key(none, "CFBundleVersion"), none);
        // The value is not on the line after the key: no match, as the regex.
        let stray = "<key>CFBundleVersion</key>\n\n<string>1</string>\n";
        assert_eq!(suffix_after_key(stray, "CFBundleVersion"), stray);
        // The key's own line must end the key with a newline.
        let spaced = "<key>CFBundleVersion</key> <string>1</string>\n";
        assert_eq!(suffix_after_key(spaced, "CFBundleVersion"), spaced);
    }

    #[test]
    fn the_greedy_value_runs_to_the_last_closing_tag_of_the_line() {
        let plist = "<key>K</key>\n<string>a</string><string>b</string>\n";
        assert_eq!(
            suffix_after_key(plist, "K"),
            "<key>K</key>\n<string>a</string><string>b-DXMT</string>\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_tree_is_copied_with_its_links_kept_as_links() {
        let home = gamelib_testutil::FakeHome::new("dxmt-copy-");
        let src = home.root().join("src");
        fs::create_dir_all(src.join("a/b")).unwrap();
        fs::write(src.join("a/b/f.txt"), "one").unwrap();
        std::os::unix::fs::symlink("b/f.txt", src.join("a/link")).unwrap();
        let dst = home.root().join("dst");
        copy_tree(&src, &dst).unwrap();
        assert_eq!(fs::read_to_string(dst.join("a/b/f.txt")).unwrap(), "one");
        assert_eq!(
            fs::read_link(dst.join("a/link")).unwrap(),
            PathBuf::from("b/f.txt")
        );
        // A second copy over the first overwrites, as `cpSync` does.
        fs::write(src.join("a/b/f.txt"), "two").unwrap();
        copy_tree(&src, &dst).unwrap();
        assert_eq!(fs::read_to_string(dst.join("a/b/f.txt")).unwrap(), "two");
    }

    #[test]
    fn an_error_is_a_category_word() {
        assert_eq!(DxmtError::Tool(DxvkError::Feed).to_string(), "tool feed");
        assert!(DxmtError::Copy(io::ErrorKind::NotFound)
            .to_string()
            .starts_with("copy "));
    }

    // ---- the boot update, its bound and its registrant ----

    use std::future::pending;
    use std::path::Path as StdPath;
    use std::sync::Arc;
    use std::time::Instant;

    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::ctx::{EngineCtx, EnginePaths};
    use gamelib_engine::fetch::{
        DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Progress,
    };
    use gamelib_engine::testing::RecordingLog;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use tokio_util::sync::CancellationToken;

    use crate::tools::macho::ScriptedScan;

    /// A network that never answers: the in-flight request a bound has to cut off.
    struct Hanging;

    impl Fetch for Hanging {
        fn get(&self, _req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
            Box::pin(pending())
        }

        fn download<'a>(
            &'a self,
            _req: FetchRequest,
            _dest: &'a StdPath,
            _progress: &'a (dyn Fn(Progress) + Send + Sync),
            _cancel: CancellationToken,
        ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
            Box::pin(pending())
        }
    }

    /// A Mac context over a fake HOME holding one installed Wine-Staging-macOS with a `-DXMT` copy
    /// (so the census reaches the fetch), a hanging network and a passing gate.
    fn kit(home: &FakeHome, online: bool) -> (Arc<WineCtx>, Arc<RecordingLog>) {
        let root = home.root().to_path_buf();
        let tools = root.join("tools");
        let wine = tools.join("wine").join("Wine-Staging-macOS-9");
        fs::create_dir_all(tools.join("wine").join("Wine-Staging-macOS-9-DXMT")).unwrap();
        fs::create_dir_all(&wine).unwrap();
        let log = Arc::new(RecordingLog::new());
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.join("userdata"),
                tools_path: tools,
                user_home: root.clone(),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
        .with_fetch(Arc::new(Hanging))
        .with_log(log.clone())
        .with_online(online);
        let ctx = Arc::new(
            WineCtx::new(Arc::new(engine), root.join("runtime"))
                .with_macho_scan(Arc::new(ScriptedScan::passing())),
        );
        let handle = store::open(&ctx).unwrap();
        let entry = serde_json::json!({
            "version": "Wine-Staging-macOS-9",
            "type": "Wine-Staging-macOS",
            "isInstalled": true,
            "installDir": wine.to_str().unwrap(),
        });
        store::write(&handle, vec![Json::from(entry)]).unwrap();
        (ctx, log)
    }

    fn info(tag: &str) -> DxmtReleasesInfo {
        serde_json::from_value(serde_json::json!({ "dxmt": { "tag": tag } })).unwrap()
    }

    /// Waits for the boot task's one line, returning it.
    fn wait_for_line(log: &RecordingLog, within: Duration) -> (&'static str, String) {
        let start = Instant::now();
        loop {
            if let Some(line) = log
                .lines()
                .into_iter()
                .find(|(_, l)| l.starts_with("DXMT boot update: "))
            {
                return line;
            }
            assert!(start.elapsed() < within, "no boot line: {:?}", log.lines());
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn the_installed_file_name_reduces_to_the_feeds_tag() {
        assert_eq!(tag_of_installed("dxmt-v0.80-builtin"), "v0.80");
        assert_eq!(tag_of_installed("v0.80"), "v0.80");
        assert_eq!(tag_of_installed(""), "");
        // The greedy prefix runs to the LAST `dxmt-`; the suffix cut is at the FIRST `-builtin`.
        assert_eq!(tag_of_installed("dxmt-dxmt-v1-builtin-x-builtin"), "v1");
    }

    #[test]
    fn only_a_path_strictly_inside_the_wine_dir_is_written_to() {
        let dir = Path::new("/t/wine");
        assert!(strictly_inside(dir, Path::new("/t/wine/W-DXMT")));
        assert!(!strictly_inside(dir, dir));
        assert!(!strictly_inside(dir, Path::new("/t/other/W-DXMT")));
        assert!(!strictly_inside(dir, Path::new("/t/wine/../x-DXMT")));
        // A sibling that only shares the text prefix is not inside.
        assert!(!strictly_inside(dir, Path::new("/t/wine2/W-DXMT")));
    }

    #[tokio::test]
    async fn a_payload_with_no_dxmt_tag_is_the_ts_rejection() {
        let home = FakeHome::new("dxmt-info-");
        let (ctx, _log) = kit(&home, true);
        for bad in [
            serde_json::json!({}),
            serde_json::json!({ "dxmt": {} }),
            serde_json::json!({ "dxmt": { "tag": null } }),
        ] {
            let info: DxmtReleasesInfo = serde_json::from_value(bad).unwrap();
            assert_eq!(on_releases_info(&ctx, &info).await, Err(DxmtError::Info));
            assert_eq!(boot_update(&ctx, &info).await, Err(DxmtError::Info));
        }
    }

    #[tokio::test]
    async fn a_store_entry_outside_the_wine_dir_is_never_written_to() {
        let home = FakeHome::new("dxmt-outside-");
        let (ctx, log) = kit(&home, true);
        // The only wine now points outside `<tools>/wine`, with a `-DXMT` folder beside it.
        let outside = home.root().join("elsewhere").join("W");
        fs::create_dir_all(home.root().join("elsewhere").join("W-DXMT")).unwrap();
        let handle = store::open(&ctx).unwrap();
        let entry = serde_json::json!({
            "version": "W", "type": "Wine-Staging-macOS", "isInstalled": true,
            "installDir": outside.to_str().unwrap(),
        });
        store::write(&handle, vec![Json::from(entry)]).unwrap();
        // Not one request (the network hangs forever, so a request would never return).
        let done = tokio::time::timeout(Duration::from_secs(5), boot_update(&ctx, &info("v0.80")))
            .await
            .expect("a refused copy must not reach the network");
        assert_eq!(done, Ok(()));
        assert!(log
            .lines()
            .iter()
            .any(|(level, l)| *level == "warn" && l.contains("outside the wine directory")));
    }

    #[test]
    fn a_boot_update_that_would_outlive_the_bound_is_abandoned_and_releases_its_registrant() {
        let home = FakeHome::new("dxmt-bound-");
        let (ctx, log) = kit(&home, true);
        let started = Instant::now();
        spawn_dxmt_boot_update(Arc::clone(&ctx), info("v0.80"), Duration::from_millis(150))
            .unwrap();
        let (level, line) = wait_for_line(&log, Duration::from_secs(10));
        assert_eq!(
            (level, line.as_str()),
            ("warn", "DXMT boot update: timeout")
        );
        assert!(started.elapsed() >= Duration::from_millis(150));
        // The registrant went with the abandoned work: an exit has nothing to wait for.
        assert!(ctx.engine.shutdown.drain(Duration::from_secs(2)).is_empty());
        // One line, whichever way it ended.
        assert_eq!(
            log.lines()
                .iter()
                .filter(|(_, l)| l.starts_with("DXMT boot update: "))
                .count(),
            1
        );
    }

    #[test]
    fn the_application_exiting_ends_the_boot_update_and_releases_its_registrant() {
        let home = FakeHome::new("dxmt-exit-");
        let (ctx, log) = kit(&home, true);
        spawn_dxmt_boot_update(Arc::clone(&ctx), info("v0.80"), Duration::from_secs(600)).unwrap();
        // Let the work reach its (never answered) request, then begin to exit.
        std::thread::sleep(Duration::from_millis(200));
        assert!(ctx.engine.shutdown.drain(Duration::from_secs(2)).is_empty());
        let (level, line) = wait_for_line(&log, Duration::from_secs(10));
        assert_eq!(
            (level, line.as_str()),
            ("warn", "DXMT boot update: shutdown")
        );
    }

    #[test]
    fn a_boot_update_that_finishes_says_done_and_one_after_exit_began_never_starts() {
        // Already current: nothing to fetch, so it finishes at once.
        let home = FakeHome::new("dxmt-done-");
        let (ctx, log) = kit(&home, true);
        let tools = home.root().join("tools").join("dxmt");
        fs::create_dir_all(&tools).unwrap();
        fs::write(tools.join("latest_dxmt"), "dxmt-v0.80-builtin").unwrap();
        spawn_dxmt_boot_update(Arc::clone(&ctx), info("v0.80"), DXMT_BOOT_BOUND).unwrap();
        let (level, line) = wait_for_line(&log, Duration::from_secs(10));
        assert_eq!((level, line.as_str()), ("info", "DXMT boot update: done"));

        // Exit already begun: the work is not started at all.
        let home = FakeHome::new("dxmt-late-");
        let (ctx, log) = kit(&home, true);
        ctx.engine.shutdown.token().cancel();
        spawn_dxmt_boot_update(Arc::clone(&ctx), info("v0.80"), DXMT_BOOT_BOUND).unwrap();
        let (level, line) = wait_for_line(&log, Duration::from_secs(10));
        assert_eq!(
            (level, line.as_str()),
            ("warn", "DXMT boot update: shutdown")
        );
    }

    #[test]
    fn a_boot_update_that_fails_says_failed() {
        // Online with a build missing: the (hanging) fetch is never reached because the census finds
        // no copy to update, so make the failure a missing DXMT tag instead.
        let home = FakeHome::new("dxmt-failed-");
        let (ctx, log) = kit(&home, true);
        let no_tag = DxmtReleasesInfo::default();
        spawn_dxmt_boot_update(Arc::clone(&ctx), no_tag, DXMT_BOOT_BOUND).unwrap();
        let (level, line) = wait_for_line(&log, Duration::from_secs(10));
        assert_eq!((level, line.as_str()), ("warn", "DXMT boot update: failed"));
    }
}
