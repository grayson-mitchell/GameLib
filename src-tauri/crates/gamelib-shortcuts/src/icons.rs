//! `getIcon` (D-12), ported from `backend/shortcuts/utils.ts`: the icon a shortcut uses on macOS (the
//! `.icns` source) and on Linux, and the GOG icon the Windows chain never reaches.
//!
//! Order, first hit wins:
//!   1. a GOG game: `<install>/goggame-<id>.ico`, then `<install>/support/icon.png`, when they exist;
//!   2. a GOG game whose product API names an icon: `https:` + that URL, saved as `<icons>/<id>.png`
//!      (a PNG keeps its transparency);
//!   3. the game's `art_square` with spaces as `%20` and the first `{ext}` as `jpg`, saved as
//!      `<icons>/<id>.jpg`.
//!
//! An icon file that already exists is reused and nothing is requested. No URL, a failed download and a
//! download that left no file all answer `None` with a fixed-text log line (never the URL, which can carry a
//! signed query).
//!
//! Choices the goldens do not pin (T-94-30): the app name becomes a file name under the shell-supplied icon
//! folder, so a name that is not a plain file name (a separator, a drive or stream colon, `.`, `..`, a NUL)
//! gets no icon at all; a download is written beside its destination and renamed into place, so a failed
//! or interrupted one leaves nothing; a zero-byte answer is a failed download; and the body is capped.

use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::ctx::ShortcutsCtx;
use crate::http::Request;

/// How long an icon download may take.
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(60);

/// The largest icon or cover accepted (the icns decoder's own file bound).
const MAX_ICON_BYTES: usize = 32 * 1024 * 1024;

/// What `get_icon` reads of a game.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IconInput {
    pub app_name: String,
    /// `gameInfo.art_square`; `None` and `""` are the same (no URL).
    pub art_square: Option<String>,
    /// `isStore(gameInfo, 'gog')`.
    pub is_gog: bool,
    /// `gameInfo.install.install_path`, GOG only; `None` or empty skips the local files.
    pub install_path: Option<PathBuf>,
    /// The GOG product API's `images.icon` exactly as the API returned it (a protocol-relative URL such
    /// as `//images.gog.example/abc_icon.png`; `https:` is put in front here, as the TS did). The TS
    /// resolver supplies it: this crate has no GOG client. `None` and `""`: the API had none.
    pub gog_product_icon_url: Option<String>,
}

/// A file name the icon folder can safely take: not empty, not `.` or `..`, no separator, no colon, no NUL.
fn is_plain_file_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\\', ':', '\0'])
}

/// `<folder>/<app>.<ext>` the way the TS wrote it: a template string with a forward slash, not a path join.
fn icon_path(folder: &Path, app_name: &str, ext: &str) -> PathBuf {
    PathBuf::from(format!("{}/{app_name}.{ext}", folder.display()))
}

/// The icon a GOG install ships: `<install>/goggame-<id>.ico`, else `<install>/support/icon.png`, when it
/// exists. A caller that resolves the GOG product API itself (this crate has no GOG client) asks this first
/// and calls the API only on `None`, as the TS did: the API is never consulted for an installed game.
pub fn gog_local_icon(install_path: &Path, app_name: &str) -> Option<PathBuf> {
    let ico = install_path.join(format!("goggame-{app_name}.ico"));
    if ico.exists() {
        return Some(ico);
    }
    let native = install_path.join("support").join("icon.png");
    native.exists().then_some(native)
}

/// The icon file for `input`, or `None`. Holds a shutdown registrant (`shortcuts-icon`) while a download
/// runs, and gives the download up when shutdown starts.
pub async fn get_icon(ctx: &ShortcutsCtx, input: &IconInput) -> Option<PathBuf> {
    if !is_plain_file_name(&input.app_name) {
        ctx.note("shortcuts icon: the app name is not a plain file name, no icon");
        return None;
    }
    let folder = ctx.paths.icon_folder.as_path();
    if !folder.exists() {
        // Not recursive, as the TS `mkdirSync`: the icon folder's parent is the app folder.
        if std::fs::create_dir(folder).is_err() && !folder.is_dir() {
            ctx.note("shortcuts icon: the icon folder could not be created");
            return None;
        }
    }

    // By default the vertical image: art_square as a jpg.
    let mut image = input
        .art_square
        .as_deref()
        .unwrap_or_default()
        .replace(' ', "%20")
        .replacen("{ext}", "jpg", 1);
    let mut icon = icon_path(folder, &input.app_name, "jpg");

    if input.is_gog {
        if let Some(install) = input
            .install_path
            .as_deref()
            .filter(|p| !p.as_os_str().is_empty())
        {
            if let Some(local) = gog_local_icon(install, &input.app_name) {
                return Some(local);
            }
        }
        if let Some(api_icon) = input
            .gog_product_icon_url
            .as_deref()
            .filter(|u| !u.is_empty())
        {
            image = format!("https:{api_icon}");
            // Allow transparency.
            icon = icon_path(folder, &input.app_name, "png");
        }
    }

    if !icon.exists() {
        if image.is_empty() {
            ctx.note("shortcuts icon: no icon URL available, skipping the download");
            return None;
        }
        if !download_image(ctx, &image, &icon).await {
            ctx.note("shortcuts icon: the icon download failed");
            return None;
        }
    }

    if !icon.exists() {
        ctx.note("shortcuts icon: the icon is missing after the download");
        return None;
    }
    Some(icon)
}

/// Downloads `url` to `dest`, atomically. `true` only when the file is in place.
async fn download_image(ctx: &ShortcutsCtx, url: &str, dest: &Path) -> bool {
    let _registrant = ctx.shutdown.register("shortcuts-icon");
    let token = ctx.shutdown.token();
    let request = Request::get(url, DOWNLOAD_TIMEOUT).max_body(MAX_ICON_BYTES);
    let answered = tokio::select! {
        biased;
        _ = token.cancelled() => return false,
        answered = ctx.http.send(request) => answered,
    };
    let Ok(response) = answered else {
        return false;
    };
    // axios rejects a non-2xx answer, and an empty image is no image.
    if !(200..300).contains(&response.status) || response.body.is_empty() {
        return false;
    }
    let part = PathBuf::from(format!("{}.part", dest.display()));
    let dest = dest.to_path_buf();
    let written = tokio::task::spawn_blocking(move || {
        if std::fs::write(&part, &response.body).is_err() {
            let _ = std::fs::remove_file(&part);
            return false;
        }
        if std::fs::rename(&part, &dest).is_err() {
            let _ = std::fs::remove_file(&part);
            return false;
        }
        true
    })
    .await;
    written.unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_plain_file_name_becomes_an_icon_name() {
        for yes in ["1207658645", "icon-app", "Some Game", "a.b", "幻想"] {
            assert!(is_plain_file_name(yes), "{yes}");
        }
        for no in [
            "", ".", "..", "a/b", "a\\b", "C:x", "x:stream", "a\0b", "../x",
        ] {
            assert!(!is_plain_file_name(no), "{no:?}");
        }
    }

    #[test]
    fn the_icon_name_is_a_template_with_a_forward_slash() {
        assert_eq!(
            icon_path(Path::new("C:\\u\\icons"), "app", "png").to_string_lossy(),
            "C:\\u\\icons/app.png"
        );
    }
}
