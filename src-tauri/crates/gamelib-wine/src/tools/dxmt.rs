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
//!
//! Crate-only (D-06): nothing calls these yet. The wine manager's install and remove do not call the
//! hooks, so the TS DXMT listener stays the only owner of the DXMT work until 87-31 switches every
//! hook in one commit; a TS and a Rust owner of the same event is what D-06 forbids.
//!
//! No log line carries a URL or a response body (T-87-09): a failure is a category word.

use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use gamelib_engine::ctx::Platform;
use serde::Deserialize;

use super::install_tool::{install_or_update_tool, installed_version, Tool};
use super::macho::{check_winemac_metal_view_exports, WinemacMetalCheck};
use super::{plain_name, DxvkError};
use crate::ctx::WineCtx;
use crate::manager::{log_error, log_warn, remove_guarded};

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
}

impl fmt::Display for DxmtError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DxmtError::Tool(error) => write!(f, "tool {error}"),
            DxmtError::Copy(kind) => write!(f, "copy {kind}"),
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
        DxmtError::Tool(_) => io::ErrorKind::Other,
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
}
