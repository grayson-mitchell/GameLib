//! Where a game's shortcut files live: the Desktop item and the Applications or Start Menu item, per
//! operating system. Ported from `shortcutFiles` (`backend/shortcuts/shortcuts/shortcuts.ts`).
//!
//! Every title goes through [`crate::sanitize::sanitize_filename`] (T-94-20) and is joined only under
//! a root the shell supplied in [`ShortcutPaths`]; the crate guesses no root. Pinned to the TS by the
//! `golden/paths` replay on every OS.
//!
//! The Linux and Windows arms build their paths by string concatenation, exactly as the TS template
//! strings do: the separator is part of the answer on every host, not something the host decides.

use std::path::{Path, PathBuf};

use crate::ctx::{Platform, ShortcutPaths};
use crate::sanitize::sanitize_filename;

/// `(desktop file, menu file)` for `title`, as `shortcutFiles` answers.
///
/// - Linux: `<desktop>/<title>.desktop` and `<home>/.local/share/applications/<title>.desktop`.
/// - Windows: `<windows_desktop>\<title>.lnk` and `<appData>\Microsoft\Windows\Start Menu\Programs\<title>.lnk`.
///   With no `windows_desktop` (the registry could not answer) there is NO Desktop path: never a
///   guessed `<home>\Desktop`, which does not exist on a OneDrive-redirected profile (quick 261111-aq4).
/// - macOS: `<home>/Desktop/<title>.app` and `<home>/Applications/<title>.app`.
pub fn shortcut_files(
    platform: Platform,
    paths: &ShortcutPaths,
    title: &str,
    windows_desktop: Option<&Path>,
) -> (Option<PathBuf>, Option<PathBuf>) {
    let title = sanitize_filename(title);
    match platform {
        Platform::Linux => {
            let desktop = format!(
                "{}/{title}.desktop",
                paths.linux_desktop().to_string_lossy()
            );
            let menu = format!(
                "{}/.local/share/applications/{title}.desktop",
                paths.user_home.to_string_lossy()
            );
            (Some(PathBuf::from(desktop)), Some(PathBuf::from(menu)))
        }
        Platform::Windows => {
            let desktop = windows_desktop
                .map(|dir| PathBuf::from(format!("{}\\{title}.lnk", dir.to_string_lossy())));
            let menu = paths.app_data.as_ref().map(|app_data| {
                PathBuf::from(format!(
                    "{}\\Microsoft\\Windows\\Start Menu\\Programs\\{title}.lnk",
                    app_data.to_string_lossy()
                ))
            });
            (desktop, menu)
        }
        Platform::Mac => (
            Some(paths.user_home.join("Desktop").join(format!("{title}.app"))),
            Some(
                paths
                    .user_home
                    .join("Applications")
                    .join(format!("{title}.app")),
            ),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths() -> ShortcutPaths {
        ShortcutPaths {
            user_home: PathBuf::from("/home/u"),
            app_data: Some(PathBuf::from("C:\\Users\\u\\AppData\\Roaming")),
            desktop_dir: None,
            ..ShortcutPaths::default()
        }
    }

    #[test]
    fn linux_falls_back_to_home_desktop_and_honours_the_shell_folder() {
        let (desktop, menu) = shortcut_files(Platform::Linux, &paths(), "G", None);
        assert_eq!(desktop, Some(PathBuf::from("/home/u/Desktop/G.desktop")));
        assert_eq!(
            menu,
            Some(PathBuf::from("/home/u/.local/share/applications/G.desktop"))
        );
        let mut moved = paths();
        moved.desktop_dir = Some(PathBuf::from("/home/u/Schreibtisch"));
        let (desktop, _) = shortcut_files(Platform::Linux, &moved, "G", None);
        assert_eq!(
            desktop,
            Some(PathBuf::from("/home/u/Schreibtisch/G.desktop"))
        );
    }

    #[test]
    fn windows_without_a_registry_desktop_has_no_desktop_path() {
        let (desktop, menu) = shortcut_files(Platform::Windows, &paths(), "G", None);
        assert_eq!(desktop, None);
        assert_eq!(
            menu.map(|m| m.to_string_lossy().into_owned()),
            Some(
                "C:\\Users\\u\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\G.lnk"
                    .to_string()
            )
        );
        let (desktop, _) = shortcut_files(
            Platform::Windows,
            &paths(),
            "G",
            Some(Path::new("D:\\OneDrive\\Desktop")),
        );
        assert_eq!(
            desktop.map(|d| d.to_string_lossy().into_owned()),
            Some("D:\\OneDrive\\Desktop\\G.lnk".to_string())
        );
    }

    #[test]
    fn a_hostile_title_stays_one_file_name() {
        let (desktop, menu) = shortcut_files(Platform::Linux, &paths(), "../../etc/passwd", None);
        assert_eq!(
            desktop,
            Some(PathBuf::from("/home/u/Desktop/....etcpasswd.desktop"))
        );
        assert_eq!(
            menu,
            Some(PathBuf::from(
                "/home/u/.local/share/applications/....etcpasswd.desktop"
            ))
        );
    }

    #[test]
    fn macos_joins_under_the_home() {
        let (desktop, menu) = shortcut_files(Platform::Mac, &paths(), "G", None);
        assert_eq!(desktop, Some(PathBuf::from("/home/u/Desktop/G.app")));
        assert_eq!(menu, Some(PathBuf::from("/home/u/Applications/G.app")));
    }
}
