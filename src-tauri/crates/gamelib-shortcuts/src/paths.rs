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

/// JavaScript's `\s`, the whitespace the `user-dirs.dirs` line pattern allows around its tokens.
fn is_js_space(c: char) -> bool {
    matches!(
        c,
        ' ' | '\t' | '\n' | '\u{0B}' | '\u{0C}' | '\r' | '\u{A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// JavaScript's `.` does not match a line terminator.
fn is_js_line_terminator(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// Node's `path.posix.normalize`: collapses `//`, `.` and `..`, keeps a trailing slash.
fn posix_normalize(path: &str) -> String {
    if path.is_empty() {
        return ".".to_string();
    }
    let absolute = path.starts_with('/');
    let trailing = path.ends_with('/');
    let mut stack: Vec<&str> = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                if stack.last().is_some_and(|last| *last != "..") {
                    stack.pop();
                } else if !absolute {
                    stack.push("..");
                }
            }
            other => stack.push(other),
        }
    }
    let mut out = stack.join("/");
    if out.is_empty() && !absolute {
        out.push('.');
    }
    if !out.is_empty() && trailing {
        out.push('/');
    }
    if absolute {
        format!("/{out}")
    } else {
        out
    }
}

/// The Linux Desktop folder `user-dirs.dirs` names (`XDG_DESKTOP_DIR`), ported from `parseUserDirs`
/// (`knownFolders.ts`), which mirrors GLib's own reader: a value must be double-quoted and start with
/// `$HOME` (followed by `/` or the closing quote) or `/`; anything else is skipped. A backslash escapes the
/// next character, a trailing slash is stripped, and a later valid line overrides an earlier one.
pub fn user_dirs_desktop(content: &str, home: &Path) -> Option<PathBuf> {
    let mut found: Option<String> = None;
    for piece in content.split('\n') {
        let line = piece.strip_suffix('\r').unwrap_or(piece);
        // `^\s*(XDG_[A-Z]+_DIR)\s*=\s*"(.*)"\s*$`, for the one key this crate reads.
        let rest = line.trim_start_matches(is_js_space);
        let Some(rest) = rest.strip_prefix("XDG_DESKTOP_DIR") else {
            continue;
        };
        let Some(rest) = rest.trim_start_matches(is_js_space).strip_prefix('=') else {
            continue;
        };
        let Some(rest) = rest.trim_start_matches(is_js_space).strip_prefix('"') else {
            continue;
        };
        let Some(quoted) = rest.trim_end_matches(is_js_space).strip_suffix('"') else {
            continue;
        };
        if quoted.chars().any(is_js_line_terminator) {
            continue;
        }
        // `quoted.replace(/\\(.)/g, '$1')`
        let mut value = String::with_capacity(quoted.len());
        let mut chars = quoted.chars();
        while let Some(c) = chars.next() {
            if c == '\\' {
                match chars.next() {
                    Some(next) => value.push(next),
                    None => value.push('\\'),
                }
            } else {
                value.push(c);
            }
        }
        let resolved = if value == "$HOME" || value.starts_with("$HOME/") {
            let joined = format!("{}/{}", home.to_string_lossy(), &value["$HOME".len()..]);
            posix_normalize(&joined)
        } else if value.starts_with('/') {
            value
        } else {
            continue;
        };
        // GLib strips a trailing slash.
        found = Some(if resolved.len() > 1 {
            resolved.trim_end_matches('/').to_string()
        } else {
            resolved
        });
    }
    found.map(PathBuf::from)
}

/// The Linux Desktop folder the TS `resolveKnownFolder` answers, minus its final `<home>/Desktop`
/// fallback (the crate applies that, see [`ShortcutPaths::linux_desktop`]): the exported
/// `XDG_DESKTOP_DIR`, then `user-dirs.dirs`. An empty exported value counts as unset.
pub fn linux_desktop_dir(
    exported: Option<&str>,
    user_dirs_content: Option<&str>,
    home: &Path,
) -> Option<PathBuf> {
    if let Some(dir) = exported.filter(|dir| !dir.is_empty()) {
        return Some(PathBuf::from(dir));
    }
    user_dirs_content.and_then(|content| user_dirs_desktop(content, home))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_dirs_resolves_home_relative_and_absolute_entries_skipping_comments() {
        let home = Path::new("/home/j\u{f6}rg");
        let content = [
            "# This file is written by xdg-user-dirs-update",
            "# If you want to change or add directories, just edit the line you are interested in.",
            "XDG_DESKTOP_DIR=\"$HOME/Schreibtisch\"",
            "XDG_DOCUMENTS_DIR=\"/data/Dokumente\"",
            "",
        ]
        .join("\n");
        assert_eq!(
            user_dirs_desktop(&content, home),
            Some(PathBuf::from("/home/j\u{f6}rg/Schreibtisch"))
        );
        assert_eq!(
            user_dirs_desktop("XDG_DESKTOP_DIR=\"/data/Desk\"", home),
            Some(PathBuf::from("/data/Desk"))
        );
    }

    #[test]
    fn user_dirs_treats_home_slash_as_the_home_itself() {
        let home = Path::new("/home/u");
        assert_eq!(
            user_dirs_desktop("XDG_DESKTOP_DIR=\"$HOME/\"", home),
            Some(PathBuf::from("/home/u"))
        );
        assert_eq!(
            user_dirs_desktop("XDG_DESKTOP_DIR=\"$HOME\"", home),
            Some(PathBuf::from("/home/u"))
        );
    }

    #[test]
    fn user_dirs_unescapes_backslash_escaped_characters() {
        assert_eq!(
            user_dirs_desktop(
                "XDG_DESKTOP_DIR=\"$HOME/My \\\"Desk\\\" top\"",
                Path::new("/home/u")
            ),
            Some(PathBuf::from("/home/u/My \"Desk\" top"))
        );
    }

    #[test]
    fn user_dirs_ignores_relative_unquoted_and_lookalike_values() {
        let home = Path::new("/home/u");
        for line in [
            "XDG_DESKTOP_DIR=\"Desktop\"",
            "XDG_DESKTOP_DIR=$HOME/Desktop",
            "XDG_DESKTOP_DIR=\"$HOMEBOY/Desktop\"",
            "XDG_MUSIC_DIR=\"/music\"",
        ] {
            assert_eq!(user_dirs_desktop(line, home), None, "{line}");
        }
    }

    #[test]
    fn user_dirs_accepts_crlf_and_a_later_valid_line_wins() {
        let home = Path::new("/home/u");
        assert_eq!(
            user_dirs_desktop("XDG_DESKTOP_DIR=\"$HOME/Bureau\"\r\n", home),
            Some(PathBuf::from("/home/u/Bureau"))
        );
        assert_eq!(
            user_dirs_desktop(
                "XDG_DESKTOP_DIR=\"/a\"\nXDG_DESKTOP_DIR=\"/b\"\nXDG_DESKTOP_DIR=\"rel\"\n",
                home
            ),
            Some(PathBuf::from("/b"))
        );
    }

    #[test]
    fn the_exported_variable_beats_user_dirs_and_empty_counts_as_unset() {
        let home = Path::new("/home/u");
        let content = "XDG_DESKTOP_DIR=\"$HOME/Bureau\"";
        assert_eq!(
            linux_desktop_dir(Some("/exported"), Some(content), home),
            Some(PathBuf::from("/exported"))
        );
        assert_eq!(
            linux_desktop_dir(Some(""), Some(content), home),
            Some(PathBuf::from("/home/u/Bureau"))
        );
        assert_eq!(linux_desktop_dir(None, None, home), None);
    }

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
