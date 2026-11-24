//! The Linux `.desktop` writer. Ported from the `linux` arm of `addShortcuts`
//! (`backend/shortcuts/shortcuts/shortcuts.ts`).
//!
//! The same text is written to two places, the Desktop folder (mode 0o777, so a file manager treats
//! it as a trusted launcher) and `~/.local/share/applications` (the default mode). The text is the
//! TypeScript's template byte for byte, pinned by the `golden/text` replay.
//!
//! Two behaviours of the TypeScript are reproduced on purpose and recorded in the 94-14 summary:
//!
//! - `Exec=` carries `appName` and `runner` unencoded (the macOS and Windows arms percent-encode
//!   them). A name holding a space or `&` therefore breaks the launch, and a `Name=` line holding a
//!   newline starts a new key. Not fixed here: the goldens pin the bytes and the fix is a decision
//!   for todo 2026-11-24-macos-shortcut-run-sh-breaks-on-single-quote-in-app-name.
//! - The parent folder is not created: a missing Desktop or applications folder is a failed write,
//!   as in the TypeScript.

use std::fs;
use std::io::Write;
use std::path::Path;

use crate::launch_url::launch_url;

/// The Desktop copy's mode (`writeFile(..., { mode: 0o777 })`). The umask applies, as it does to
/// Node's `mode` option, and only when the file is created.
pub const DESKTOP_COPY_MODE: u32 = 0o777;

/// The `.desktop` text: `Icon=` only when an icon was found, `Exec=` with the raw launch URL.
pub fn desktop_entry(title: &str, app_name: &str, runner: &str, icon: Option<&Path>) -> String {
    let launch = launch_url(app_name, runner, false);
    let icon_line = icon
        .map(|icon| format!("Icon={}\n", icon.display()))
        .unwrap_or_default();
    format!(
        "[Desktop Entry]\nName={title}\nExec=xdg-open {launch}\nTerminal=false\nType=Application\n{icon_line}Categories=Game;\n"
    )
}

/// Writes the `.desktop` file at `path`. `mode` is the creation mode (`Some(DESKTOP_COPY_MODE)` for
/// the Desktop copy, `None` for the default); it is ignored off Unix.
pub fn write_desktop_file(
    path: &Path,
    title: &str,
    app_name: &str,
    runner: &str,
    icon: Option<&Path>,
    mode: Option<u32>,
) -> Result<(), String> {
    let text = desktop_entry(title, app_name, runner, icon);
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    if let Some(mode) = mode {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(mode);
    }
    #[cfg(not(unix))]
    let _ = mode;
    let mut file = options.open(path).map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_testutil::FakeHome;

    #[test]
    fn the_entry_has_an_icon_line_only_when_there_is_an_icon() {
        let with = desktop_entry("T", "a", "r", Some(Path::new("/i/a.jpg")));
        let without = desktop_entry("T", "a", "r", None);
        assert!(with.contains("\nIcon=/i/a.jpg\nCategories=Game;\n"));
        assert!(!without.contains("Icon="));
        assert_eq!(with.replace("Icon=/i/a.jpg\n", ""), without);
        assert!(without.starts_with("[Desktop Entry]\nName=T\nExec=xdg-open gamelib://launch?"));
        assert!(without.ends_with("Type=Application\nCategories=Game;\n"));
    }

    #[test]
    fn a_missing_parent_folder_is_a_failed_write_not_a_created_folder() {
        let home = FakeHome::new("gamelib-linux-");
        let path = home.root().join("no-such-dir").join("T.desktop");
        assert!(write_desktop_file(&path, "T", "a", "r", None, None).is_err());
        assert!(!home.root().join("no-such-dir").exists());
    }

    #[test]
    fn rewriting_truncates_the_file() {
        let home = FakeHome::new("gamelib-linux-");
        let path = home.root().join("T.desktop");
        write_desktop_file(&path, "A long first title", "a", "r", None, None).expect("first");
        write_desktop_file(&path, "T", "a", "r", None, None).expect("second");
        assert_eq!(
            fs::read_to_string(&path).expect("read"),
            desktop_entry("T", "a", "r", None)
        );
    }
}
