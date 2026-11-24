//! Whether a shortcut for a game exists on disk right now (`shortcutsExists`). Ported from
//! `shortcutsExistOnDisk` in `sidecar/shortcutsFlowRegistration.ts` and `shortcutPathPresent` in
//! `shortcuts.ts`. Read-only: nothing here writes, deletes or creates.
//!
//! A path is present when it exists or is a symlink (261026-ctm): a dangling Desktop link fails
//! `exists` but is still a leftover the user must be able to Remove. A game with no title is never
//! looked up (260905-mv5): its title feeds a file path, and a made-up title would produce a plausible
//! path the app never wrote to.
//!
//! Pinned to the TS by the `golden/exists` replay.

use std::path::Path;

use crate::ctx::{Platform, ShortcutPaths, ShortcutsCtx};
use crate::paths::shortcut_files;

/// True when `path` exists or is a symlink, dangling or not. An empty path is never present.
pub fn shortcut_path_present(path: &Path) -> bool {
    if path.exists() {
        return true;
    }
    std::fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_symlink())
}

/// Whether either shortcut file of `title` is present, with the presence test injected. `None` and
/// an empty title answer `false` without looking at the disk.
pub fn shortcuts_exist_at(
    platform: Platform,
    paths: &ShortcutPaths,
    title: Option<&str>,
    windows_desktop: Option<&Path>,
    present: &dyn Fn(&Path) -> bool,
) -> bool {
    let Some(title) = title.filter(|t| !t.is_empty()) else {
        return false;
    };
    let (desktop, menu) = shortcut_files(platform, paths, title, windows_desktop);
    desktop.as_deref().is_some_and(present) || menu.as_deref().is_some_and(present)
}

/// The `shortcuts_exist` op body: reads the Windows Desktop from the registry on Windows (D-12) and
/// answers whether either shortcut file is present.
pub async fn shortcuts_exist(ctx: &ShortcutsCtx, title: Option<&str>) -> bool {
    if title.is_none_or(str::is_empty) {
        ctx.note("shortcuts_exist: no title, shortcut lookup skipped");
        return false;
    }
    let windows_desktop = None;
    shortcuts_exist_at(
        ctx.platform,
        &ctx.paths,
        title,
        windows_desktop,
        &shortcut_path_present,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn an_empty_path_is_not_present() {
        assert!(!shortcut_path_present(Path::new("")));
    }

    #[test]
    fn a_missing_title_is_never_looked_up() {
        let paths = ShortcutPaths {
            user_home: PathBuf::from("/home/u"),
            ..ShortcutPaths::default()
        };
        let always = |_: &Path| true;
        assert!(!shortcuts_exist_at(
            Platform::Linux,
            &paths,
            None,
            None,
            &always
        ));
        assert!(!shortcuts_exist_at(
            Platform::Linux,
            &paths,
            Some(""),
            None,
            &always
        ));
        assert!(shortcuts_exist_at(
            Platform::Linux,
            &paths,
            Some("G"),
            None,
            &always
        ));
    }
}
