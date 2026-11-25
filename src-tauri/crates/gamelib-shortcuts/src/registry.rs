//! The Windows Desktop folder, read from the registry (D-12, D-21). Ported from
//! `readWindowsShellFolder` and its helpers in `backend/sidecar/knownFolders.ts`.
//!
//! The Desktop of a Windows user is a registry known folder (`User Shell Folders`), often redirected to
//! OneDrive, so it cannot be guessed from the home directory. `reg.exe query` runs as a hidden, bounded
//! helper through the injected `SpecRunner` (a GUI process that spawned a console would flash a window),
//! its output is parsed, `%VAR%` is expanded against the shell-supplied environment and the result must be
//! an absolute path. Anything else, a failed or timed-out query included, is `None`, and `None` means "no
//! Desktop path": the caller never falls back to `<home>\Desktop`.
//!
//! The crate reads no environment variable: the expansion environment is an argument.
//!
//! JavaScript semantics this module copies on purpose (the goldens pin them): `\s` and `.` in the line
//! pattern follow the JS classes, a value name matches case-insensitively, the expansion applies to
//! `REG_SZ` as well as `REG_EXPAND_SZ`, and an unset variable makes the whole answer `None`. Path
//! absoluteness and normalisation follow Node's `path.win32`, ported by hand so they behave the same on
//! every host the golden replay runs on.

use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use gamelib_core::process::{ProcSpec, SpecRunner};
use regex::{Captures, Regex};

/// The registry key holding the redirected shell folders.
pub const USER_SHELL_FOLDERS_KEY: &str =
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders";

/// How long `reg.exe query` may run (the TS `REG_QUERY_TIMEOUT_MS`).
pub const REG_QUERY_TIMEOUT: Duration = Duration::from_millis(5_000);

/// The `reg.exe` value names the shell reads: Documents is stored as `Personal`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowsShellFolder {
    Desktop,
    Personal,
}

impl WindowsShellFolder {
    /// The registry value name.
    pub fn value_name(self) -> &'static str {
        match self {
            WindowsShellFolder::Desktop => "Desktop",
            WindowsShellFolder::Personal => "Personal",
        }
    }
}

/// JavaScript's `\s`: the ASCII whitespace plus the Unicode space separators and the BOM.
const JS_SPACE: &str = r"[ \t\n\x0B\x0C\r\x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]";

/// JavaScript's `.`: anything but a line terminator.
const JS_DOT: &str = r"[^\n\r\x{2028}\x{2029}]";

fn line_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        // `^\s+(.+?)\s{2,}(REG_EXPAND_SZ|REG_SZ)\s{2,}(.*?)\s*$`, spelled out class by class.
        let pattern = format!(
            "^{s}+({d}+?){s}{{2,}}(REG_EXPAND_SZ|REG_SZ){s}{{2,}}({d}*?){s}*$",
            s = JS_SPACE,
            d = JS_DOT
        );
        match Regex::new(&pattern) {
            Ok(regex) => regex,
            Err(e) => unreachable!("the reg line pattern is a constant: {e}"),
        }
    })
}

fn variable_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| match Regex::new("%([^%]+)%") {
        Ok(regex) => regex,
        Err(e) => unreachable!("the variable pattern is a constant: {e}"),
    })
}

/// Pulls `value_name`'s data out of `reg query <key> /v <value_name>` output: the first line whose name
/// matches (case-insensitively) and whose type is `REG_SZ` or `REG_EXPAND_SZ`.
pub fn parse_reg_query_value(output: &str, value_name: &str) -> Option<String> {
    let wanted = value_name.to_lowercase();
    for piece in output.split('\n') {
        // JS splits on `/\r?\n/`: one `\r` before the `\n` goes with the break, any other stays.
        let line = piece.strip_suffix('\r').unwrap_or(piece);
        let Some(caps) = line_pattern().captures(line) else {
            continue;
        };
        if caps[1].to_lowercase() == wanted {
            return Some(caps[3].to_string());
        }
    }
    None
}

/// Expands `%NAME%` against `env`, case-insensitively as Windows does. `None` when any variable is unset,
/// rather than leaving a literal `%NAME%` in a path.
pub fn expand_windows_env(value: &str, env: &[(String, String)]) -> Option<String> {
    // Later entries win, as the TS builds a `Map` from the entries.
    let lookup: std::collections::HashMap<String, &str> = env
        .iter()
        .map(|(name, v)| (name.to_uppercase(), v.as_str()))
        .collect();
    let mut unresolved = false;
    let expanded = variable_pattern().replace_all(value, |caps: &Captures| {
        match lookup.get(&caps[1].to_uppercase()) {
            Some(resolved) => (*resolved).to_string(),
            None => {
                unresolved = true;
                String::new()
            }
        }
    });
    if unresolved {
        None
    } else {
        Some(expanded.into_owned())
    }
}

const BACKSLASH: u16 = 0x5C;
const SLASH: u16 = 0x2F;
const DOT: u16 = 0x2E;
const COLON: u16 = 0x3A;

fn is_separator(unit: u16) -> bool {
    unit == BACKSLASH || unit == SLASH
}

fn is_device_letter(unit: u16) -> bool {
    (0x41..=0x5A).contains(&unit) || (0x61..=0x7A).contains(&unit)
}

/// Node's `path.win32.isAbsolute`: a leading separator, or a drive letter, a colon and a separator.
pub fn win32_is_absolute(path: &str) -> bool {
    let units: Vec<u16> = path.encode_utf16().collect();
    match units.first() {
        None => false,
        Some(&first) => {
            is_separator(first)
                || (units.len() > 2
                    && is_device_letter(first)
                    && units[1] == COLON
                    && is_separator(units[2]))
        }
    }
}

/// Node's `normalizeString` for the Windows separator, with `allowAboveRoot` as given.
fn normalize_string(path: &[u16], allow_above_root: bool) -> Vec<u16> {
    let mut res: Vec<u16> = Vec::new();
    let mut last_segment_length = 0usize;
    let mut last_slash: isize = -1;
    let mut dots: i32 = 0;
    let mut code: u16 = 0;
    let mut i: usize = 0;
    while i <= path.len() {
        if i < path.len() {
            code = path[i];
        } else if is_separator(code) {
            break;
        } else {
            code = SLASH;
        }
        let idx = i as isize;
        if is_separator(code) {
            if last_slash == idx - 1 || dots == 1 {
                // NOOP
            } else if dots == 2 {
                let ends_with_dotdot =
                    res.len() >= 2 && res[res.len() - 1] == DOT && res[res.len() - 2] == DOT;
                if res.len() < 2 || last_segment_length != 2 || !ends_with_dotdot {
                    if res.len() > 2 {
                        match res.iter().rposition(|&u| u == BACKSLASH) {
                            None => {
                                res.clear();
                                last_segment_length = 0;
                            }
                            Some(at) => {
                                res.truncate(at);
                                last_segment_length =
                                    match res.iter().rposition(|&u| u == BACKSLASH) {
                                        None => res.len(),
                                        Some(prev) => res.len() - 1 - prev,
                                    };
                            }
                        }
                        last_slash = idx;
                        dots = 0;
                        i += 1;
                        continue;
                    } else if !res.is_empty() {
                        res.clear();
                        last_segment_length = 0;
                        last_slash = idx;
                        dots = 0;
                        i += 1;
                        continue;
                    }
                }
                if allow_above_root {
                    if !res.is_empty() {
                        res.push(BACKSLASH);
                    }
                    res.extend_from_slice(&[DOT, DOT]);
                    last_segment_length = 2;
                }
            } else {
                let segment = &path[(last_slash + 1) as usize..i];
                if !res.is_empty() {
                    res.push(BACKSLASH);
                }
                res.extend_from_slice(segment);
                last_segment_length = (idx - last_slash - 1) as usize;
            }
            last_slash = idx;
            dots = 0;
        } else if code == DOT && dots != -1 {
            dots += 1;
        } else {
            dots = -1;
        }
        i += 1;
    }
    res
}

/// Node's `path.win32.normalize`, for the absolute paths this module accepts (a relative path never
/// reaches it: [`read_windows_shell_folder`] checks [`win32_is_absolute`] first).
pub fn win32_normalize(path: &str) -> String {
    let units: Vec<u16> = path.encode_utf16().collect();
    let len = units.len();
    if len == 0 {
        return ".".to_string();
    }
    if len == 1 {
        return if is_separator(units[0]) {
            "\\".to_string()
        } else {
            path.to_string()
        };
    }
    let mut root_end = 0usize;
    let mut device: Option<Vec<u16>> = None;
    let mut absolute = false;
    let first = units[0];
    if is_separator(first) {
        absolute = true;
        if is_separator(units[1]) {
            // A possible UNC root: `\\server\share`.
            let mut j = 2usize;
            let mut last = j;
            while j < len && !is_separator(units[j]) {
                j += 1;
            }
            if j < len && j != last {
                let first_part = units[last..j].to_vec();
                last = j;
                while j < len && is_separator(units[j]) {
                    j += 1;
                }
                if j < len && j != last {
                    last = j;
                    while j < len && !is_separator(units[j]) {
                        j += 1;
                    }
                    if j == len {
                        // A UNC root only: normalised, nothing left to process.
                        let mut out: Vec<u16> = vec![BACKSLASH, BACKSLASH];
                        out.extend_from_slice(&first_part);
                        out.push(BACKSLASH);
                        out.extend_from_slice(&units[last..]);
                        out.push(BACKSLASH);
                        return String::from_utf16_lossy(&out);
                    }
                    if j != last {
                        let mut dev: Vec<u16> = vec![BACKSLASH, BACKSLASH];
                        dev.extend_from_slice(&first_part);
                        dev.push(BACKSLASH);
                        dev.extend_from_slice(&units[last..j]);
                        device = Some(dev);
                        root_end = j;
                    }
                }
            }
        } else {
            root_end = 1;
        }
    } else if is_device_letter(first) && units[1] == COLON {
        device = Some(units[..2].to_vec());
        root_end = 2;
        if len > 2 && is_separator(units[2]) {
            absolute = true;
            root_end = 3;
        }
    }
    let mut tail = if root_end < len {
        normalize_string(&units[root_end..], !absolute)
    } else {
        Vec::new()
    };
    if tail.is_empty() && !absolute {
        tail = vec![DOT];
    }
    if !tail.is_empty() && is_separator(units[len - 1]) {
        tail.push(BACKSLASH);
    }
    let out: Vec<u16> = match device {
        None => {
            if absolute {
                let mut out = vec![BACKSLASH];
                out.extend_from_slice(&tail);
                out
            } else {
                tail
            }
        }
        Some(mut dev) => {
            if absolute {
                dev.push(BACKSLASH);
            }
            dev.extend_from_slice(&tail);
            dev
        }
    };
    String::from_utf16_lossy(&out)
}

/// The redirected location of a Windows shell folder, or `None` when it cannot be read: the query failed,
/// timed out or was cancelled, the value is absent, a variable is unset, the result is not an absolute
/// path, or it holds U+FFFD (`reg.exe` prints in the console code page, so a path outside it comes back
/// mangled; the registry default `%USERPROFILE%\Desktop` is ASCII and covers the OneDrive case).
///
/// One registry query per call: both callers are user-initiated, so there is no cache.
pub async fn read_windows_shell_folder(
    proc: &dyn SpecRunner,
    folder: WindowsShellFolder,
    env: &[(String, String)],
) -> Option<PathBuf> {
    let name = folder.value_name();
    let mut spec = ProcSpec::new("shortcuts-reg", "reg.exe");
    spec.argv = vec![
        "query".to_string(),
        USER_SHELL_FOLDERS_KEY.to_string(),
        "/v".to_string(),
        name.to_string(),
    ];
    spec.timeout = Some(REG_QUERY_TIMEOUT);
    // The TS `windowsHide: true`: no console window for a GUI app's child (Pitfall 12).
    spec.hide_window = true;
    let out = proc.run(spec, None).await;
    if out.code != Some(0) || out.timed_out || out.cancelled {
        return None;
    }
    let raw = parse_reg_query_value(&out.stdout, name)?;
    let expanded = expand_windows_env(&raw, env)?;
    if !expanded.is_empty() && win32_is_absolute(&expanded) && !expanded.contains('\u{FFFD}') {
        Some(PathBuf::from(win32_normalize(&expanded)))
    } else {
        None
    }
}

/// The Windows Desktop folder, or `None` (D-12: then there is no Desktop path).
pub async fn windows_desktop_dir(
    proc: &dyn SpecRunner,
    env: &[(String, String)],
) -> Option<PathBuf> {
    read_windows_shell_folder(proc, WindowsShellFolder::Desktop, env).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect()
    }

    #[test]
    fn a_query_line_yields_its_data_for_either_registry_type() {
        let out = "\r\nHKEY\\x\r\n    Desktop    REG_EXPAND_SZ    %USERPROFILE%\\Desktop\r\n\r\n";
        assert_eq!(
            parse_reg_query_value(out, "Desktop"),
            Some("%USERPROFILE%\\Desktop".to_string())
        );
        let sz = "    Desktop    REG_SZ    C:\\D \n";
        assert_eq!(
            parse_reg_query_value(sz, "desktop"),
            Some("C:\\D".to_string())
        );
        assert_eq!(
            parse_reg_query_value("    Desktop    REG_DWORD    1", "Desktop"),
            None
        );
    }

    #[test]
    fn expansion_is_case_insensitive_and_unset_is_none() {
        let e = env(&[("UserProfile", "C:\\U")]);
        assert_eq!(
            expand_windows_env("%userprofile%\\Desktop", &e),
            Some("C:\\U\\Desktop".to_string())
        );
        assert_eq!(expand_windows_env("%NOPE%\\Desktop", &e), None);
        assert_eq!(
            expand_windows_env("100%\\x", &e),
            Some("100%\\x".to_string())
        );
    }

    #[test]
    fn win32_absoluteness_follows_node() {
        for yes in ["C:\\a", "c:/a", "\\a", "/a", "\\\\server\\share\\a"] {
            assert!(win32_is_absolute(yes), "{yes}");
        }
        for no in ["", "a", "C:a", "C:", "Z:Desktop", ".\\a"] {
            assert!(!win32_is_absolute(no), "{no}");
        }
    }

    #[test]
    fn win32_normalize_follows_node_for_absolute_paths() {
        let cases = [
            ("C:\\a\\b\\..\\c\\.", "C:\\a\\c"),
            ("C:/a//b/", "C:\\a\\b\\"),
            ("C:\\a\\..\\..\\b", "C:\\b"),
            ("\\\\server\\share\\Desktop", "\\\\server\\share\\Desktop"),
            ("\\\\server\\share", "\\\\server\\share\\"),
            ("\\\\server\\share\\a\\..\\b", "\\\\server\\share\\b"),
            ("/a/b", "\\a\\b"),
            ("C:\\", "C:\\"),
        ];
        for (input, want) in cases {
            assert_eq!(win32_normalize(input), want, "{input}");
        }
    }
}
