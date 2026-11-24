//! `shortcuts_remove` (SVC-05, D-22, D-29): removes a game's desktop shortcut files, and only the ones
//! GameLib provably created.
//!
//! The TypeScript `removeShortcuts` deleted whatever stood at the shortcut paths, a user's own same-named
//! `.app` included. This is the one deliberate behaviour change of SVC-05: an item is deleted only when
//! [`crate::proof`] attributes it to GameLib, and an item the proof cannot attribute, or cannot read, is
//! left in place and reported in `refused` (refuse on unknown). The 94-07 removal goldens replay with their
//! recorded D-29 deltas applied.
//!
//! Every delete goes through `gamelib-safety`'s `remove_tree` with the folder the shortcut lives in as its
//! trust root (`<home>/Applications` for the bundle, `<home>/Desktop` for the Desktop item), which unlinks a
//! link instead of following it and refuses a target outside its root. This module calls no recursive delete
//! of its own.
//!
//! With `notify: true` (the renderer path) the op raises the notification the TS `removeShortcut` handler
//! raised, chosen by re-reading the disk after the work; with `notify: false` (the store managers' path)
//! nothing is shown.

use std::fs;
use std::path::{Path, PathBuf};

use gamelib_safety::remove::remove_tree;
use gamelib_safety::safe_path::CaseMode;
use gamelib_safety::wire::{Outcome, Request, Target, TargetKind};
use serde::{Deserialize, Serialize};

use crate::ctx::{Platform, ShortcutPaths, ShortcutsCtx};
use crate::exists::{shortcut_path_present, shortcuts_exist_at, windows_desktop_for};
use crate::game::ShortcutGame;
use crate::notice;
use crate::paths::shortcut_files;
use crate::proof::{
    is_gamelib_bundle, is_gamelib_desktop_file, is_gamelib_desktop_link, is_gamelib_lnk,
};

/// The arguments of `shortcuts_remove`.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RemoveArgs {
    pub game: ShortcutGame,
    /// Raise the TS handler's notification (the renderer path). `false` shows nothing.
    pub notify: bool,
}

/// What `shortcuts_remove` did. `removed` and `refused` are the shortcut paths; `refused` holds an item
/// that is still there because GameLib could not prove it wrote it (or could not delete it).
/// `exists_after` is the disk re-check the renderer sets its state from.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveOutcome {
    pub removed: Vec<String>,
    pub refused: Vec<String>,
    pub exists_after: bool,
}

/// One shortcut file: where it is and the folder it must lie strictly inside to be deleted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Shortcut {
    pub path: PathBuf,
    pub trust_root: PathBuf,
}

/// The Desktop item and the Applications or Start Menu item of one title. `None`: no such path on this
/// platform (a Windows Desktop the registry could not answer is never guessed).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Planned {
    pub desktop: Option<Shortcut>,
    pub menu: Option<Shortcut>,
}

/// Where `title`'s shortcut files live, each with its trust root: the folder the shell supplied that the
/// file name is joined under, never anything derived from the file itself.
pub fn plan(
    platform: Platform,
    paths: &ShortcutPaths,
    title: &str,
    windows_desktop: Option<&Path>,
) -> Planned {
    let (desktop, menu) = shortcut_files(platform, paths, title, windows_desktop);
    let (desktop_root, menu_root) = match platform {
        Platform::Mac => (
            Some(paths.user_home.join("Desktop")),
            Some(paths.user_home.join("Applications")),
        ),
        Platform::Linux => (
            Some(paths.linux_desktop()),
            Some(paths.user_home.join(".local/share/applications")),
        ),
        Platform::Windows => (
            windows_desktop.map(Path::to_path_buf),
            paths.app_data.as_ref().map(|app_data| {
                PathBuf::from(format!(
                    "{}\\Microsoft\\Windows\\Start Menu\\Programs",
                    app_data.to_string_lossy()
                ))
            }),
        ),
    };
    let pair = |path: Option<PathBuf>, trust_root: Option<PathBuf>| {
        path.zip(trust_root)
            .map(|(path, trust_root)| Shortcut { path, trust_root })
    };
    Planned {
        desktop: pair(desktop, desktop_root),
        menu: pair(menu, menu_root),
    }
}

/// What the proof says about one path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Verdict {
    /// Nothing is there: nothing to remove, nothing to refuse.
    Absent,
    /// GameLib provably wrote it.
    Ours,
    /// Something is there that GameLib cannot attribute to itself, or that cannot be read.
    Unproven,
}

/// `bundle` is the Applications bundle a macOS Desktop link must point at to be GameLib's.
fn judge(platform: Platform, path: &Path, bundle: Option<&Path>) -> Verdict {
    let meta = match fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Verdict::Absent,
        Err(_) => return Verdict::Unproven,
    };
    let ours = match platform {
        Platform::Mac if meta.file_type().is_symlink() => {
            bundle.is_some_and(|bundle| is_gamelib_desktop_link(path, bundle))
        }
        Platform::Mac => is_gamelib_bundle(path),
        Platform::Linux => is_gamelib_desktop_file(path),
        Platform::Windows => is_gamelib_lnk(path),
    };
    if ours {
        Verdict::Ours
    } else {
        Verdict::Unproven
    }
}

/// Deletes `item`, already proven GameLib's, through the safety library.
fn delete_proven(item: &Shortcut) -> bool {
    let (Some(path), Some(root)) = (item.path.to_str(), item.trust_root.to_str()) else {
        return false;
    };
    let request = Request {
        targets: vec![Target {
            id: "shortcut".to_string(),
            path: path.to_string(),
            kind: TargetKind::AppData,
            trust_root: Some(root.to_string()),
            executable: None,
        }],
        known_installs: Some(Vec::new()),
        self_key: None,
        protected_roots: Vec::new(),
    };
    remove_tree(&request, CaseMode::Auto).outcome == Outcome::Removed
}

/// What [`remove_shortcut_files`] did, as paths.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FilesOutcome {
    pub removed: Vec<PathBuf>,
    pub refused: Vec<PathBuf>,
}

/// Removes the proven files of `planned`, the Desktop item first (a macOS Desktop link is judged against
/// the Applications bundle, so it must go before the bundle does). An absent item is neither removed nor
/// refused. Nothing here follows a link.
pub fn remove_shortcut_files(platform: Platform, planned: &Planned) -> FilesOutcome {
    let mut outcome = FilesOutcome::default();
    let bundle = planned.menu.as_ref().map(|menu| menu.path.as_path());
    for (item, link_target) in [(&planned.desktop, bundle), (&planned.menu, None)] {
        let Some(item) = item else {
            continue;
        };
        match judge(platform, &item.path, link_target) {
            Verdict::Absent => {}
            Verdict::Ours if delete_proven(item) => outcome.removed.push(item.path.clone()),
            Verdict::Ours | Verdict::Unproven => outcome.refused.push(item.path.clone()),
        }
    }
    outcome
}

fn display(paths: &[PathBuf]) -> Vec<String> {
    paths
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

/// The `shortcuts_remove` op body.
pub async fn shortcuts_remove(ctx: &ShortcutsCtx, args: RemoveArgs) -> RemoveOutcome {
    let title = args.game.title.as_str();
    let windows_desktop = windows_desktop_for(ctx).await;
    let planned = plan(ctx.platform, &ctx.paths, title, windows_desktop.as_deref());
    // A game with no title is never looked up (260905-mv5): its title feeds a path. A DLC has no shortcut.
    let nothing_to_do = args.game.is_dlc || title.is_empty();
    // 261027-c4g: snapshot BEFORE removal, the notice follows what was on disk, not the setting.
    let had_desktop_item = ctx.platform == Platform::Mac
        && !nothing_to_do
        && planned
            .desktop
            .as_ref()
            .is_some_and(|desktop| shortcut_path_present(&desktop.path));

    let files = if nothing_to_do {
        FilesOutcome::default()
    } else {
        if ctx.platform == Platform::Windows && planned.desktop.is_none() {
            ctx.note("shortcuts remove: no Windows Desktop folder, a Desktop shortcut (if any) was not looked for");
        }
        remove_shortcut_files(ctx.platform, &planned)
    };
    if !files.refused.is_empty() {
        ctx.note(
            "shortcuts remove: an item was left in place, it is not provably a GameLib shortcut",
        );
    }

    let exists_after = shortcuts_exist_at(
        ctx.platform,
        &ctx.paths,
        Some(title),
        windows_desktop.as_deref(),
        &shortcut_path_present,
    );
    notice::raise(
        ctx,
        args.notify,
        notice::remove_notice(ctx.platform, had_desktop_item, exists_after),
    );
    RemoveOutcome {
        removed: display(&files.removed),
        refused: display(&files.refused),
        exists_after,
    }
}
