//! `shortcuts_add` (SVC-05, D-17): writes a game's desktop shortcut files, ported from `addShortcuts`
//! (`backend/shortcuts/shortcuts/shortcuts.ts`) and the `addShortcut` handler's notifications
//! (`sidecar/shortcutsFlowRegistration.ts`).
//!
//! What it writes, per operating system:
//!
//! - macOS: one `.app` in `~/Applications` (when the Start Menu setting, `fromMenu` or the Desktop setting is
//!   on), and, when the Desktop setting is on, a Desktop symlink to it. A menu add never touches the Desktop
//!   unless the user opted in.
//! - Linux: the same `.desktop` text in the Desktop folder (mode 0o777) and in
//!   `~/.local/share/applications`, each when its setting or `fromMenu` asks.
//! - Windows: a `.lnk` in the registry Desktop folder and one in the Start Menu, through PowerShell. A
//!   Desktop folder the registry could not answer is a failed Desktop shortcut, never a guessed path.
//!
//! Every requested file is attempted before a partial failure is reported (`failed` holds one
//! `<file>: <error>` per file that could not be written, in the order tried). A DLC writes nothing. The icon
//! comes from [`crate::icons::get_icon`] (macOS and Linux) or the Windows chain
//! ([`crate::windows::icon`]); an icon that cannot be had gives an iconless shortcut, not a failure.
//!
//! Choices the TS did not make (D-22): the macOS Desktop link replaces only an item GameLib provably wrote
//! (see [`crate::mac::link_desktop`]); anything else there is left alone and reported in `refused`. And
//! the macOS bundle is not written at all when the shell executable it would launch is unknown (the TS threw
//! and wrote nothing).
//!
//! The Add-to-Steam step of the TS (`addNonSteamGame`, gated on [`steam_registration_wanted`]) joins this op in
//! 94-20; nothing here reaches `shortcuts.vdf`.
//!
//! With `notify: true` (the renderer path) the op raises the notification the handler raised, chosen by
//! re-reading the disk after the work; with `notify: false` (the store managers' path) nothing is shown.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::ctx::{Platform, ShortcutsCtx};
use crate::exists::{shortcut_path_present, shortcuts_exist_at, windows_desktop_for};
use crate::game::{ShortcutGame, ShortcutSettings};
use crate::icons::{get_icon, IconInput};
use crate::launch_url::launch_url;
use crate::linux::{write_desktop_file, DESKTOP_COPY_MODE};
use crate::mac::{link_desktop, write_mac_app, DesktopRefused};
use crate::notice;
use crate::paths::shortcut_files;
use crate::windows::icon::{resolve_windows_shortcut_icon, IconGame};
use crate::windows::lnk::{write_windows_shortcut, ShortcutDetails};

/// Why a Windows Desktop shortcut was not written when the registry could not name the Desktop folder
/// (the TS's own words, pinned by the 94-07 goldens).
const NO_WINDOWS_DESKTOP: &str = "the Windows Desktop folder could not be read from the registry (User Shell Folders \"Desktop\"), so no Desktop shortcut was written";

/// The arguments of `shortcuts_add`.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AddArgs {
    pub game: ShortcutGame,
    pub settings: ShortcutSettings,
    /// The add came from the game's menu: both files are written whatever the settings say (and a macOS
    /// menu add still never touches the Desktop unless that setting is on).
    #[serde(default)]
    pub from_menu: bool,
    /// Raise the TS handler's notification (the renderer path). `false` shows nothing.
    pub notify: bool,
}

/// What `shortcuts_add` did. `written` are the files that are now in place; `failed` holds one
/// `<file>: <error>` for each that could not be written, in the order they were tried; `refused` are the
/// paths left alone because GameLib cannot prove it wrote what is already there (they are in `failed` too);
/// `exists_after` is the disk re-check the renderer sets its state from.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddOutcome {
    pub written: Vec<String>,
    pub failed: Vec<String>,
    pub refused: Vec<String>,
    pub exists_after: bool,
}

impl AddOutcome {
    /// The TS's rejection message, `Could not write shortcuts: <failure>; <failure>`; `None` when nothing
    /// failed.
    pub fn message(&self) -> Option<String> {
        (!self.failed.is_empty())
            .then(|| format!("Could not write shortcuts: {}", self.failed.join("; ")))
    }
}

/// Whether the add also registers the game as a non-Steam game in Steam: the setting is on and the game's
/// store is not Steam itself (a Steam game is already in Steam; 261026-c7r). Read by the Add-to-Steam step
/// (94-20).
pub fn steam_registration_wanted(game: &ShortcutGame, settings: &ShortcutSettings) -> bool {
    settings.add_steam_shortcuts && game.can_add_steam_shortcut
}

/// The files written and failed so far, in the order the TS attempted them.
#[derive(Default)]
struct Attempts {
    written: Vec<PathBuf>,
    failed: Vec<String>,
    refused: Vec<PathBuf>,
}

impl Attempts {
    fn wrote(&mut self, file: &Path) {
        self.written.push(file.to_path_buf());
    }

    fn failure(&mut self, file: &Path, error: impl std::fmt::Display) {
        self.failed.push(format!("{}: {error}", file.display()));
    }
}

pub(crate) fn icon_input(game: &ShortcutGame) -> IconInput {
    IconInput {
        app_name: game.app_name.clone(),
        art_square: game.art_square.clone(),
        is_gog: game.runner == "gog",
        install_path: game.install_path.as_deref().map(PathBuf::from),
        gog_product_icon_url: game.gog_product_icon.clone(),
    }
}

fn display(paths: &[PathBuf]) -> Vec<String> {
    paths
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

/// The `shortcuts_add` op body: reads the Windows Desktop from the registry (D-12), then [`add_with_desktop`].
pub async fn shortcuts_add(ctx: &ShortcutsCtx, args: AddArgs) -> AddOutcome {
    let windows_desktop = windows_desktop_for(ctx).await;
    add_with_desktop(ctx, args, windows_desktop.as_deref()).await
}

/// [`shortcuts_add`] with the registry's answer given (`None`: the registry could not name the Windows
/// Desktop). The seam the golden replays use, since a Windows Desktop is a registry value.
pub async fn add_with_desktop(
    ctx: &ShortcutsCtx,
    args: AddArgs,
    windows_desktop: Option<&Path>,
) -> AddOutcome {
    let AddArgs {
        game,
        settings,
        from_menu,
        notify,
    } = args;
    let mut attempts = Attempts::default();
    if !game.is_dlc {
        let (desktop_file, menu_file) =
            shortcut_files(ctx.platform, &ctx.paths, &game.title, windows_desktop);
        // Only Windows can lack a Desktop path (its registry lookup failed); Linux and macOS always get
        // both, so their early return keeps the TS semantics.
        let both_or_windows = desktop_file.is_some() || ctx.platform == Platform::Windows;
        if let Some(menu) = menu_file.filter(|_| both_or_windows) {
            let files = Files {
                desktop: desktop_file,
                menu,
            };
            match ctx.platform {
                Platform::Linux => {
                    add_linux(ctx, &game, &settings, from_menu, &files, &mut attempts).await;
                }
                Platform::Windows => {
                    add_windows(ctx, &game, &settings, from_menu, &files, &mut attempts).await;
                }
                Platform::Mac => {
                    add_mac(ctx, &game, &settings, from_menu, &files, &mut attempts).await;
                }
            }
        }
    }

    let exists_after = shortcuts_exist_at(
        ctx.platform,
        &ctx.paths,
        Some(&game.title),
        windows_desktop,
        &shortcut_path_present,
    );
    if !attempts.failed.is_empty() {
        ctx.note("shortcuts add: a requested shortcut could not be written");
    }
    let mac_desktop_wanted = ctx.platform == Platform::Mac && settings.add_desktop_shortcuts;
    notice::raise(
        ctx,
        notify,
        notice::add_notice(
            ctx.platform,
            mac_desktop_wanted,
            exists_after,
            !attempts.failed.is_empty(),
        ),
    );
    AddOutcome {
        written: display(&attempts.written),
        failed: attempts.failed,
        refused: display(&attempts.refused),
        exists_after,
    }
}

/// The two paths one title's shortcuts live at.
struct Files {
    desktop: Option<PathBuf>,
    menu: PathBuf,
}

async fn add_linux(
    ctx: &ShortcutsCtx,
    game: &ShortcutGame,
    settings: &ShortcutSettings,
    from_menu: bool,
    files: &Files,
    attempts: &mut Attempts,
) {
    let icon = get_icon(ctx, &icon_input(game)).await;
    if icon.is_none() {
        ctx.note("shortcuts add: no icon available, creating an iconless shortcut");
    }
    let write = |file: &Path, mode: Option<u32>, attempts: &mut Attempts| match write_desktop_file(
        file,
        &game.title,
        &game.app_name,
        &game.runner,
        icon.as_deref(),
        mode,
    ) {
        Ok(()) => attempts.wrote(file),
        Err(error) => attempts.failure(file, error),
    };
    if let (true, Some(desktop)) = (settings.add_desktop_shortcuts || from_menu, &files.desktop) {
        // 777 = -rwxrwxrwx
        write(desktop, Some(DESKTOP_COPY_MODE), attempts);
    }
    if settings.add_start_menu_shortcuts || from_menu {
        write(&files.menu, None, attempts);
    }
}

async fn add_windows(
    ctx: &ShortcutsCtx,
    game: &ShortcutGame,
    settings: &ShortcutSettings,
    from_menu: bool,
    files: &Files,
    attempts: &mut Attempts,
) {
    // appName and runner are percent-encoded: the .lnk argument is a double-quoted string and the
    // protocol handler decodes it again (T-34.5-C6-17).
    let mut details = ShortcutDetails {
        target: launch_url(&game.app_name, &game.runner, true),
        ..ShortcutDetails::default()
    };
    let store_executable = if game.runner == "gog" {
        game.gog_executable.clone()
    } else {
        game.executable.clone()
    };
    let shell_exe = Some(ctx.paths.shell_exe.clone()).filter(|exe| !exe.as_os_str().is_empty());
    let resolved = resolve_windows_shortcut_icon(
        IconGame {
            title: game.title.clone(),
            install_path: game.install_path.as_deref().map(PathBuf::from),
            store_executable,
        },
        shell_exe,
    )
    .await;
    match resolved {
        Some(found) => {
            details.icon = Some(found.icon.to_string_lossy().into_owned());
            details.icon_index = Some(found.icon_index);
        }
        None => ctx.note("shortcuts add: no icon available, creating an iconless shortcut"),
    }

    let Some(proc) = ctx.proc.as_deref() else {
        // Headless: a child cannot run, so every requested .lnk is a failure rather than a silent skip.
        if settings.add_desktop_shortcuts || from_menu {
            match &files.desktop {
                Some(desktop) => attempts.failure(desktop, "no process runner is available"),
                None => attempts
                    .failed
                    .push(format!("Desktop: {NO_WINDOWS_DESKTOP}")),
            }
        }
        if settings.add_start_menu_shortcuts || from_menu {
            attempts.failure(&files.menu, "no process runner is available");
        }
        return;
    };
    let write = |file: PathBuf| {
        let details = details.clone();
        async move {
            let result = write_windows_shortcut(
                proc,
                &ctx.base_env,
                ctx.system_root.as_deref(),
                &file,
                &details,
            )
            .await;
            (file, result)
        }
    };
    if settings.add_desktop_shortcuts || from_menu {
        match &files.desktop {
            Some(desktop) => match write(desktop.clone()).await {
                (file, Ok(())) => attempts.wrote(&file),
                (file, Err(error)) => attempts.failure(&file, error),
            },
            // No registry Desktop and no guess (quick 261111-aq4): record the Desktop .lnk as not written so
            // the caller reports it. The Start Menu .lnk below is still attempted.
            None => attempts
                .failed
                .push(format!("Desktop: {NO_WINDOWS_DESKTOP}")),
        }
    }
    if settings.add_start_menu_shortcuts || from_menu {
        match write(files.menu.clone()).await {
            (file, Ok(())) => attempts.wrote(&file),
            (file, Err(error)) => attempts.failure(&file, error),
        }
    }
}

async fn add_mac(
    ctx: &ShortcutsCtx,
    game: &ShortcutGame,
    settings: &ShortcutSettings,
    from_menu: bool,
    files: &Files,
    attempts: &mut Attempts,
) {
    // Unlike Linux and Windows, a macOS menu add never touches ~/Desktop unless the user opted in
    // (addDesktopShortcuts), so a Mac Desktop stays clean by default. The Desktop item is a symlink to the
    // single Applications bundle (261026-ctm), so the bundle is written whenever the link is wanted.
    let mut bundle: Option<PathBuf> = None;
    if settings.add_start_menu_shortcuts || from_menu || settings.add_desktop_shortcuts {
        if ctx.paths.shell_exe.as_os_str().is_empty() {
            // The TS threw and wrote nothing: a bundle that launches nothing is worse than none.
            attempts.failure(&files.menu, "the GameLib executable is not known");
        } else {
            let icon = get_icon(ctx, &icon_input(game)).await;
            if icon.is_none() {
                ctx.note("shortcuts add: no icon available, creating an iconless macOS shortcut");
            }
            match write_mac_app(
                &ctx.paths,
                &game.title,
                &game.app_name,
                &game.runner,
                &ctx.paths.shell_exe,
                icon.as_deref(),
            ) {
                Ok(written) => {
                    attempts.wrote(&written.bundle);
                    bundle = Some(written.bundle);
                }
                Err(error) => attempts.failure(&files.menu, error),
            }
        }
    }
    if let (true, Some(desktop)) = (settings.add_desktop_shortcuts, &files.desktop) {
        match &bundle {
            None => attempts.failure(
                desktop,
                format!("not linked: {} was not written", files.menu.display()),
            ),
            Some(bundle) => match link_desktop(&ctx.paths, desktop, bundle) {
                Ok(()) => attempts.wrote(desktop),
                Err(refusal) => {
                    if matches!(refusal, DesktopRefused::Unproven(_)) {
                        attempts.refused.push(desktop.clone());
                    }
                    attempts.failure(desktop, refusal);
                }
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn game(can_add_steam: bool) -> ShortcutGame {
        serde_json::from_value(json!({
            "appName": "a", "runner": "legendary", "title": "T", "isDlc": false,
            "canAddSteamShortcut": can_add_steam
        }))
        .expect("a game")
    }

    fn settings(add_steam: bool) -> ShortcutSettings {
        serde_json::from_value(json!({
            "addDesktopShortcuts": true, "addStartMenuShortcuts": true, "addSteamShortcuts": add_steam
        }))
        .expect("settings")
    }

    #[test]
    fn a_steam_game_is_never_registered_as_a_non_steam_game() {
        assert!(steam_registration_wanted(&game(true), &settings(true)));
        assert!(!steam_registration_wanted(&game(false), &settings(true)));
        assert!(!steam_registration_wanted(&game(true), &settings(false)));
    }

    #[test]
    fn the_message_is_the_ts_rejection_text_only_when_something_failed() {
        let ok = AddOutcome::default();
        assert_eq!(ok.message(), None);
        let failed = AddOutcome {
            failed: vec!["a: x".to_string(), "b: y".to_string()],
            ..AddOutcome::default()
        };
        assert_eq!(
            failed.message().as_deref(),
            Some("Could not write shortcuts: a: x; b: y")
        );
    }

    #[test]
    fn the_args_need_notify_and_default_from_menu_off() {
        let ok = json!({ "game": {
            "appName": "a", "runner": "legendary", "title": "T", "isDlc": false, "canAddSteamShortcut": true
        }, "settings": {
            "addDesktopShortcuts": true, "addStartMenuShortcuts": true, "addSteamShortcuts": false
        }, "notify": false });
        let args: AddArgs = serde_json::from_value(ok.clone()).expect("args");
        assert!(!args.from_menu);
        let mut no_notify = ok.clone();
        no_notify.as_object_mut().expect("object").remove("notify");
        assert!(serde_json::from_value::<AddArgs>(no_notify).is_err());
        let mut extra = ok;
        extra["secret-text"] = json!(1);
        assert!(serde_json::from_value::<AddArgs>(extra).is_err());
    }
}
