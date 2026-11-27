//! The Windows Desktop folder, read from the registry (D-12, D-21). Ported from
//! `readWindowsShellFolder` and its helpers in `backend/sidecar/knownFolders.ts`.
//!
//! The Desktop of a Windows user is a registry known folder (`User Shell Folders`), often redirected to
//! OneDrive, so it cannot be guessed from the home directory. The primary read is the injected native
//! [`ShellFolderSource`] (`RegGetValueW`, UTF-16, so a redirect outside the console code page arrives
//! intact; quick 261128-7wv). `reg.exe query` is the fallback, used when no source is installed or it has
//! no answer: it runs as a hidden, bounded helper through the injected `SpecRunner` (a GUI process that
//! spawned a console would flash a window) and prints in the console code page, so its output can carry
//! U+FFFD, which is rejected. Either way the value goes through one pipeline: `%VAR%` is expanded against
//! the shell-supplied environment and the result must be an absolute path. Anything else, a failed or
//! timed-out query included, is `None`, and `None` means "no Desktop path": the caller never falls back
//! to `<home>\Desktop`.
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

/// The same key as a subkey of `HKEY_CURRENT_USER`, the form `RegGetValueW` takes.
pub const USER_SHELL_FOLDERS_SUBKEY: &str =
    "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders";

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

/// The native reader of a `User Shell Folders` value, installed by the shell on Windows. It returns the
/// raw, unexpanded data of a `REG_SZ` or `REG_EXPAND_SZ` value, or `None` when the value cannot be read.
/// It takes the typed folder, not a name, so only the two known values can ever be read.
pub trait ShellFolderSource: Send + Sync {
    fn read(&self, folder: WindowsShellFolder) -> Option<String>;
}

/// The Windows registry API (`RegGetValueW` on `HKEY_CURRENT_USER`): UTF-16 data, so no console code
/// page is involved. The value is returned unexpanded (`RRF_NOEXPAND`); `%VAR%` stays literal for
/// [`expand_windows_env`].
#[cfg(windows)]
pub struct Win32ShellFolders;

#[cfg(windows)]
impl ShellFolderSource for Win32ShellFolders {
    fn read(&self, folder: WindowsShellFolder) -> Option<String> {
        use windows_sys::Win32::Foundation::ERROR_SUCCESS;
        use windows_sys::Win32::System::Registry::{
            RegGetValueW, HKEY_CURRENT_USER, RRF_NOEXPAND, RRF_RT_REG_EXPAND_SZ, RRF_RT_REG_SZ,
        };

        const MAX_U16: u32 = 32_768;
        const FLAGS: u32 = RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ | RRF_NOEXPAND;
        let wide = |s: &str| -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() };
        let (sub, val) = (wide(USER_SHELL_FOLDERS_SUBKEY), wide(folder.value_name()));

        // Size query (bytes, including the terminating NUL).
        let mut bytes: u32 = 0;
        // SAFETY: `sub` and `val` are NUL-terminated and outlive the call; a null data pointer with a
        // valid `bytes` out-pointer is the documented size query.
        let st = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                sub.as_ptr(),
                val.as_ptr(),
                FLAGS,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut bytes,
            )
        };
        if st != ERROR_SUCCESS || bytes == 0 || bytes / 2 > MAX_U16 {
            return None;
        }
        let mut buf = vec![0u16; (bytes as usize).div_ceil(2)];
        let mut len = (buf.len() * 2) as u32;
        // SAFETY: `buf` holds `len` bytes exactly (len == buf.len() * 2), the invariant RegGetValueW
        // relies on for the write; the pointers are valid for the duration of the call.
        let st = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                sub.as_ptr(),
                val.as_ptr(),
                FLAGS,
                std::ptr::null_mut(),
                buf.as_mut_ptr().cast(),
                &mut len,
            )
        };
        // Any other status, ERROR_MORE_DATA (a value that grew between the calls) included, is no answer.
        if st != ERROR_SUCCESS {
            return None;
        }
        let units = ((len as usize) / 2).min(buf.len());
        let end = buf[..units].iter().position(|&c| c == 0).unwrap_or(units);
        Some(String::from_utf16_lossy(&buf[..end]))
    }
}

/// Why no Desktop path was found. [`ShellFolderMiss::reason`] is one fixed phrase per variant, so a log
/// line can say why without ever carrying the value (it holds the user's name, T-28-04).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellFolderMiss {
    /// Neither a native source nor a `SpecRunner` is installed.
    NoReader,
    /// The `reg.exe` query failed, timed out or was cancelled.
    QueryFailed,
    /// The `reg.exe` output held no matching value line.
    ValueAbsent,
    /// A `%VAR%` in the value is not in the expansion environment.
    UnsetVariable,
    /// The value is empty or not an absolute path.
    NotAbsolute,
    /// The value holds U+FFFD.
    Mangled,
}

impl ShellFolderMiss {
    /// A fixed phrase, never the value or the path.
    pub fn reason(self) -> &'static str {
        match self {
            ShellFolderMiss::NoReader => "no registry reader",
            ShellFolderMiss::QueryFailed => "the reg.exe query failed, timed out or was cancelled",
            ShellFolderMiss::ValueAbsent => "the value is absent",
            ShellFolderMiss::UnsetVariable => "a %VAR% in the value is unset",
            ShellFolderMiss::NotAbsolute => "the value is not an absolute path",
            ShellFolderMiss::Mangled => "the value holds U+FFFD, the reg.exe console code page",
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

/// The one acceptance pipeline both the native and the `reg.exe` answer go through: expand `%VAR%`, require
/// a non-empty absolute path, reject U+FFFD, normalise. The check order is the TS's: absolute before U+FFFD.
fn accept_shell_folder_value(
    raw: &str,
    env: &[(String, String)],
) -> Result<PathBuf, ShellFolderMiss> {
    let expanded = expand_windows_env(raw, env).ok_or(ShellFolderMiss::UnsetVariable)?;
    if expanded.is_empty() || !win32_is_absolute(&expanded) {
        return Err(ShellFolderMiss::NotAbsolute);
    }
    if expanded.contains('\u{FFFD}') {
        return Err(ShellFolderMiss::Mangled);
    }
    Ok(PathBuf::from(win32_normalize(&expanded)))
}

/// The redirected location of a Windows shell folder: the native `source` first, then `reg.exe` through
/// `proc`. A native answer, accepted or not, is final (`reg.exe` would return the same data, only mangled
/// by the console code page); the fallback is for "no native answer". `Err` says why there is no path.
pub async fn read_windows_shell_folder_from(
    source: Option<&dyn ShellFolderSource>,
    proc: Option<&dyn SpecRunner>,
    folder: WindowsShellFolder,
    env: &[(String, String)],
) -> Result<PathBuf, ShellFolderMiss> {
    if let Some(raw) = source.and_then(|s| s.read(folder)) {
        return accept_shell_folder_value(&raw, env);
    }
    let Some(proc) = proc else {
        return Err(ShellFolderMiss::NoReader);
    };
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
        return Err(ShellFolderMiss::QueryFailed);
    }
    let raw = parse_reg_query_value(&out.stdout, name).ok_or(ShellFolderMiss::ValueAbsent)?;
    accept_shell_folder_value(&raw, env)
}

/// The `reg.exe` read alone, as [`read_windows_shell_folder_from`] with no native source: the location,
/// or `None` when the query failed, timed out or was cancelled, the value is absent, a variable is unset,
/// the result is not an absolute path, or it holds U+FFFD (`reg.exe` prints in the console code page, so
/// a path outside it comes back mangled; the registry default `%USERPROFILE%\Desktop` is ASCII and covers
/// the OneDrive case).
///
/// One registry query per call: both callers are user-initiated, so there is no cache.
pub async fn read_windows_shell_folder(
    proc: &dyn SpecRunner,
    folder: WindowsShellFolder,
    env: &[(String, String)],
) -> Option<PathBuf> {
    read_windows_shell_folder_from(None, Some(proc), folder, env)
        .await
        .ok()
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

    use crate::testing::ScriptedRunner;
    use gamelib_core::process::SpecOutput;

    /// A source answering the same raw value for any folder, recording what it was asked.
    struct FakeSource {
        answer: Option<String>,
        asked: std::sync::Mutex<Vec<WindowsShellFolder>>,
    }

    impl FakeSource {
        fn answering(answer: Option<&str>) -> FakeSource {
            FakeSource {
                answer: answer.map(str::to_string),
                asked: std::sync::Mutex::new(Vec::new()),
            }
        }
    }

    impl ShellFolderSource for FakeSource {
        fn read(&self, folder: WindowsShellFolder) -> Option<String> {
            if let Ok(mut asked) = self.asked.lock() {
                asked.push(folder);
            }
            self.answer.clone()
        }
    }

    fn reg_stdout(value: &str) -> SpecOutput {
        SpecOutput {
            code: Some(0),
            stdout: format!("\r\nHKEY\\x\r\n    Desktop    REG_SZ    {value}\r\n\r\n"),
            ..SpecOutput::default()
        }
    }

    #[test]
    fn the_subkey_is_the_key_without_its_hive() {
        assert_eq!(
            USER_SHELL_FOLDERS_KEY,
            format!("HKCU\\{USER_SHELL_FOLDERS_SUBKEY}")
        );
    }

    #[tokio::test]
    async fn a_native_answer_keeps_every_character_and_spawns_nothing() {
        let source = FakeSource::answering(Some("C:\\Users\\Zoë\\OneDrive\\.\\デスクトップ"));
        let runner = ScriptedRunner::answering(SpecOutput::default());
        let got = read_windows_shell_folder_from(
            Some(&source),
            Some(&runner),
            WindowsShellFolder::Desktop,
            &[],
        )
        .await;
        assert_eq!(
            got,
            Ok(PathBuf::from("C:\\Users\\Zoë\\OneDrive\\デスクトップ"))
        );
        assert!(runner.spawns().is_empty());
        assert_eq!(
            source.asked.lock().map(|a| a.clone()).unwrap_or_default(),
            vec![WindowsShellFolder::Desktop]
        );
    }

    #[tokio::test]
    async fn a_native_answer_expands_against_the_environment() {
        let source = FakeSource::answering(Some("%USERPROFILE%\\Desktop"));
        let runner = ScriptedRunner::answering(SpecOutput::default());
        let got = read_windows_shell_folder_from(
            Some(&source),
            Some(&runner),
            WindowsShellFolder::Desktop,
            &env(&[("USERPROFILE", "C:\\Users\\Zoë")]),
        )
        .await;
        assert_eq!(got, Ok(PathBuf::from("C:\\Users\\Zoë\\Desktop")));
        assert!(runner.spawns().is_empty());
    }

    #[tokio::test]
    async fn no_native_answer_falls_back_to_one_hidden_bounded_reg_query() {
        let source = FakeSource::answering(None);
        let runner = ScriptedRunner::answering(reg_stdout("Z:\\GameLibOracle\\Desktop"));
        let got = read_windows_shell_folder_from(
            Some(&source),
            Some(&runner),
            WindowsShellFolder::Desktop,
            &[],
        )
        .await;
        assert_eq!(got, Ok(PathBuf::from("Z:\\GameLibOracle\\Desktop")));
        let spawns = runner.spawns();
        assert_eq!(spawns.len(), 1);
        assert_eq!(spawns[0].program, "reg.exe");
        assert!(spawns[0].hide_window);
        assert_eq!(spawns[0].timeout, Some(REG_QUERY_TIMEOUT));
    }

    #[tokio::test]
    async fn a_rejected_native_answer_does_not_fall_back() {
        let runner = ScriptedRunner::answering(reg_stdout("Z:\\GameLibOracle\\Desktop"));
        for (raw, miss) in [
            ("Desktop", ShellFolderMiss::NotAbsolute),
            ("", ShellFolderMiss::NotAbsolute),
            ("%NOPE%\\Desktop", ShellFolderMiss::UnsetVariable),
            ("C:\\Users\\\u{FFFD}\\Desktop", ShellFolderMiss::Mangled),
        ] {
            let source = FakeSource::answering(Some(raw));
            let got = read_windows_shell_folder_from(
                Some(&source),
                Some(&runner),
                WindowsShellFolder::Desktop,
                &[],
            )
            .await;
            assert_eq!(got, Err(miss), "{raw:?}");
        }
        assert!(runner.spawns().is_empty());
    }

    #[tokio::test]
    async fn each_reg_exe_failure_names_its_miss() {
        let mangled = ScriptedRunner::answering(reg_stdout("C:\\Users\\\u{FFFD}\\Desktop"));
        assert_eq!(
            read_windows_shell_folder_from(None, Some(&mangled), WindowsShellFolder::Desktop, &[])
                .await,
            Err(ShellFolderMiss::Mangled)
        );
        let failed = ScriptedRunner::answering(SpecOutput {
            code: Some(1),
            ..SpecOutput::default()
        });
        assert_eq!(
            read_windows_shell_folder_from(None, Some(&failed), WindowsShellFolder::Desktop, &[])
                .await,
            Err(ShellFolderMiss::QueryFailed)
        );
        let absent = ScriptedRunner::answering(SpecOutput {
            code: Some(0),
            stdout: "nothing to see".to_string(),
            ..SpecOutput::default()
        });
        assert_eq!(
            read_windows_shell_folder_from(None, Some(&absent), WindowsShellFolder::Desktop, &[])
                .await,
            Err(ShellFolderMiss::ValueAbsent)
        );
        assert_eq!(
            read_windows_shell_folder_from(None, None, WindowsShellFolder::Desktop, &[]).await,
            Err(ShellFolderMiss::NoReader)
        );
    }

    #[test]
    fn every_miss_has_a_fixed_reason() {
        for miss in [
            ShellFolderMiss::NoReader,
            ShellFolderMiss::QueryFailed,
            ShellFolderMiss::ValueAbsent,
            ShellFolderMiss::UnsetVariable,
            ShellFolderMiss::NotAbsolute,
            ShellFolderMiss::Mangled,
        ] {
            assert!(!miss.reason().is_empty());
        }
    }

    /// A read-only probe of the real HKCU: the values Windows itself writes for every profile.
    #[cfg(windows)]
    #[test]
    fn the_real_registry_answers_desktop_and_documents() {
        for folder in [WindowsShellFolder::Desktop, WindowsShellFolder::Personal] {
            let got = Win32ShellFolders.read(folder);
            let value = got.unwrap_or_else(|| panic!("no value for {}", folder.value_name()));
            assert!(!value.is_empty());
            assert!(
                win32_is_absolute(&value) || value.starts_with('%'),
                "{}: not absolute or %-prefixed",
                folder.value_name()
            );
            assert!(!value.contains('\u{FFFD}') && !value.contains('\0'));
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
