//! The Windows `.lnk` writer (D-12), ported from `writeWindowsShortcut` in
//! `backend/shortcuts/shortcuts/windowsShortcut.ts`.
//!
//! A `.lnk` is written by PowerShell: it compiles a small `IShellLinkW` helper with `Add-Type` and saves
//! the link through `IPersistFile`. No shell string is ever built. `powershell.exe` is spawned with a fixed
//! argv (`-Command -`: the script comes from stdin), the script is a CONSTANT, and every caller-supplied
//! value (the `.lnk` path, target, arguments, icon) reaches it only as an environment variable it reads
//! with `$env:`. A game title with quotes, `$(...)`, backticks or non-ASCII characters is data, never
//! code (T-94-29). The 94-07 goldens pin the script, the argv, the environment and the timeout byte for
//! byte.
//!
//! The child is one `ProcSpec` labelled `shortcuts-lnk`, started hidden (a GUI app's console child would
//! flash a window, Pitfall 12), bounded to 30 s, through the `SpecRunner` the shell injects (a gamelib-proc
//! helper, D-21). The crate reads no environment variable: the base environment and `%SystemRoot%` are
//! arguments.

use std::path::Path;
use std::time::Duration;

use gamelib_core::process::{ProcSpec, SpecRunner};

use crate::registry::win32_normalize;

/// The fixed argv: `-Command -` reads the script from stdin.
pub const POWERSHELL_ARGS: [&str; 6] = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "-",
];

/// Bounds the child: a PowerShell that never exits must not keep the app alive.
pub const WRITE_SHORTCUT_TIMEOUT: Duration = Duration::from_millis(30_000);

/// The `IShellLinkW` helper, collapsed to ONE line, exactly as the TS built it: `-Command -` parses stdin
/// line by line and silently stops (exit 0, nothing on stderr) at a here-string opener, so the C# travels
/// as a single-line, single-quoted PowerShell string. It must never contain a single quote nor a `//`
/// comment. The `IShellLinkW` member order is the COM vtable order: do not tidy or sort it.
macro_rules! shell_link_csharp {
    () => {
        r#"using System; using System.Text; using System.Runtime.InteropServices; using System.Runtime.InteropServices.ComTypes; namespace GameLibLnk { [ComImport, Guid("00021401-0000-0000-C000-000000000046")] public class ShellLink {} [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")] public interface IShellLinkW { void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cch, IntPtr pfd, int fFlags); void GetIDList(out IntPtr ppidl); void SetIDList(IntPtr pidl); void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cch); void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName); void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cch); void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir); void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cch); void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs); void GetHotkey(out short pwHotkey); void SetHotkey(short wHotkey); void GetShowCmd(out int piShowCmd); void SetShowCmd(int iShowCmd); void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cch, out int piIcon); void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon); void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, int dwReserved); void Resolve(IntPtr hwnd, int fFlags); void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile); } public static class Writer { public static void Write(string lnk, string target, string args, string icon, int iconIndex) { IShellLinkW link = (IShellLinkW)new ShellLink(); link.SetPath(target); if (!string.IsNullOrEmpty(args)) link.SetArguments(args); if (!string.IsNullOrEmpty(icon)) link.SetIconLocation(icon, iconIndex); ((IPersistFile)link).Save(lnk, true); } } }"#
    };
}

/// The one-line C# helper (see [`WRITE_SHORTCUT_SCRIPT`]).
pub const SHELL_LINK_CSHARP: &str = shell_link_csharp!();

/// Fed to `powershell.exe -Command -` on stdin, CRLF-joined and CRLF-terminated, one statement per line.
/// Every value arrives only through `$env:`. `exit 1` from the catch is what reports failure; the caller
/// also checks that the `.lnk` exists afterwards. A constant: nothing is ever formatted into it.
pub const WRITE_SHORTCUT_SCRIPT: &str = concat!(
    "$ErrorActionPreference = 'Stop'\r\n",
    "$src = '",
    shell_link_csharp!(),
    "'\r\n",
    "try { Add-Type -TypeDefinition $src; [GameLibLnk.Writer]::Write($env:GAMELIB_LNK_PATH, $env:GAMELIB_LNK_TARGET, $env:GAMELIB_LNK_ARGS, $env:GAMELIB_LNK_ICON, [int]$env:GAMELIB_LNK_ICON_INDEX) } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }\r\n",
    "exit 0\r\n"
);

/// The five variables the script reads. Any inherited variable of the same name (Windows names are
/// case-insensitive) is dropped, so the script sees only ours.
const LNK_ENV_NAMES: [&str; 5] = [
    "GAMELIB_LNK_PATH",
    "GAMELIB_LNK_TARGET",
    "GAMELIB_LNK_ARGS",
    "GAMELIB_LNK_ICON",
    "GAMELIB_LNK_ICON_INDEX",
];

/// How much of PowerShell's stderr an error message carries (UTF-16 units, as the TS `slice(0, 4096)`).
const STDERR_UNITS: usize = 4096;

/// The `.lnk` fields a caller supplies (the shape Electron's `shell.writeShortcutLink` took, minus the
/// fields the helper never read: `cwd`, `description`, `appUserModelId`, `toastActivatorClsid`).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ShortcutDetails {
    pub target: String,
    pub args: Option<String>,
    pub icon: Option<String>,
    pub icon_index: Option<i32>,
}

/// `/^[a-z][a-z0-9+.-]+:/i`: a scheme of at least two characters, so a drive letter (`C:`) is never taken
/// for one. ASCII case folding only, as JS's non-Unicode `i` flag.
fn is_url(target: &str) -> bool {
    let mut chars = target.chars();
    if !chars.next().is_some_and(|c| c.is_ascii_alphabetic()) {
        return false;
    }
    let mut run = 0usize;
    for c in chars {
        if c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-') {
            run += 1;
        } else {
            return run >= 1 && c == ':';
        }
    }
    false
}

/// The environment the script reads. A URL target (`gamelib://launch?...`) is not a file a `.lnk` can point
/// at, so it becomes an argument to `explorer.exe`, which opens it through the registered protocol handler.
///
/// The URL must be a QUOTED argument: unquoted, `explorer.exe` never dispatches a `scheme://host?query`
/// token and opens Documents instead (measured 2026-11-13). A double quote inside the URL is
/// percent-encoded to `%22`, because a raw one would end the quoted argument early.
///
/// `system_root` is `%SystemRoot%` as the shell read it; `None` or empty is `C:\Windows`.
pub fn build_shortcut_env(
    base: &[(String, String)],
    system_root: Option<&Path>,
    lnk_path: &Path,
    details: &ShortcutDetails,
) -> Vec<(String, String)> {
    let url = is_url(&details.target);
    let root = system_root
        .map(|p| p.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "C:\\Windows".to_string());
    let target = if url {
        win32_normalize(&format!("{root}\\explorer.exe"))
    } else {
        details.target.clone()
    };
    let args = if url {
        let quoted = format!("\"{}\"", details.target.replace('"', "%22"));
        match details.args.as_deref().filter(|a| !a.is_empty()) {
            Some(extra) => format!("{quoted} {extra}"),
            None => quoted,
        }
    } else {
        details.args.clone().unwrap_or_default()
    };
    let mut env: Vec<(String, String)> = base
        .iter()
        .filter(|(name, _)| {
            !LNK_ENV_NAMES
                .iter()
                .any(|own| own.eq_ignore_ascii_case(name))
        })
        .cloned()
        .collect();
    env.push((
        LNK_ENV_NAMES[0].to_string(),
        lnk_path.to_string_lossy().into_owned(),
    ));
    env.push((LNK_ENV_NAMES[1].to_string(), target));
    env.push((LNK_ENV_NAMES[2].to_string(), args));
    env.push((
        LNK_ENV_NAMES[3].to_string(),
        details.icon.clone().unwrap_or_default(),
    ));
    env.push((
        LNK_ENV_NAMES[4].to_string(),
        details.icon_index.unwrap_or(0).to_string(),
    ));
    env
}

/// JavaScript's `String.prototype.trim` set: the ASCII whitespace, the Unicode space separators, the line
/// terminators and the BOM (Rust's `trim` differs: it trims U+0085 and keeps U+FEFF).
fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{0B}' | '\u{0C}' | '\r' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// `stderr.slice(0, 4096).trim()`: the first 4096 UTF-16 units (a cut astral character becomes U+FFFD, as a
/// lone surrogate is rendered), trimmed with JavaScript's whitespace set.
fn stderr_excerpt(stderr: &str) -> String {
    let units: Vec<u16> = stderr.encode_utf16().take(STDERR_UNITS).collect();
    let cut = String::from_utf16_lossy(&units);
    cut.trim_matches(is_js_space).to_string()
}

/// Writes `lnk_path`. `Ok` only when PowerShell exited 0 AND the file exists; otherwise `Err(message)` in
/// the TS's words (`powershell exited N: <stderr>`, `powershell did not exit within 30000ms`). Never
/// panics. The caller holds the shutdown registrant for the op; the child itself is registered by the
/// spawn seam.
pub async fn write_windows_shortcut(
    proc: &dyn SpecRunner,
    base_env: &[(String, String)],
    system_root: Option<&Path>,
    lnk_path: &Path,
    details: &ShortcutDetails,
) -> Result<(), String> {
    let mut spec = ProcSpec::new("shortcuts-lnk", "powershell.exe");
    spec.argv = POWERSHELL_ARGS.iter().map(|a| (*a).to_string()).collect();
    spec.env = build_shortcut_env(base_env, system_root, lnk_path, details);
    spec.replace_env = true;
    spec.stdin = Some(WRITE_SHORTCUT_SCRIPT.to_string());
    spec.timeout = Some(WRITE_SHORTCUT_TIMEOUT);
    // The TS `windowsHide: true`: no console window for a GUI app's child (Pitfall 12).
    spec.hide_window = true;
    let out = proc.run(spec, None).await;
    if out.timed_out {
        return Err(format!(
            "powershell did not exit within {}ms",
            WRITE_SHORTCUT_TIMEOUT.as_millis()
        ));
    }
    if out.cancelled {
        return Err("powershell was stopped by shutdown".to_string());
    }
    match out.code {
        Some(0) if lnk_path.exists() => Ok(()),
        Some(code) => {
            let stderr = stderr_excerpt(&out.stderr);
            if stderr.is_empty() {
                Err(format!("powershell exited {code}"))
            } else {
                Err(format!("powershell exited {code}: {stderr}"))
            }
        }
        // No exit code and not timed out: the program could not be spawned (the reason is in stderr, the
        // `SpecRunner` contract). The TS reported `String(error)`.
        None => {
            let reason = stderr_excerpt(&out.stderr);
            if reason.is_empty() {
                Err("powershell exited null".to_string())
            } else {
                Err(format!("Error: {reason}"))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_script_is_a_crlf_constant_that_names_only_environment_values() {
        assert!(WRITE_SHORTCUT_SCRIPT.ends_with("exit 0\r\n"));
        assert_eq!(WRITE_SHORTCUT_SCRIPT.matches("\r\n").count(), 4);
        assert!(!WRITE_SHORTCUT_SCRIPT.replace("\r\n", "").contains('\n'));
        assert!(
            !SHELL_LINK_CSHARP.contains('\''),
            "a quote would end the string"
        );
        assert!(
            !SHELL_LINK_CSHARP.contains("//"),
            "a comment would swallow the rest"
        );
        for name in LNK_ENV_NAMES {
            assert!(
                WRITE_SHORTCUT_SCRIPT.contains(&format!("$env:{name}")),
                "{name}"
            );
        }
    }

    #[test]
    fn a_scheme_needs_two_characters() {
        for yes in [
            "gamelib://x",
            "ab:thing",
            "steam://rungameid/1",
            "a+b.c-d:x",
        ] {
            assert!(is_url(yes), "{yes}");
        }
        for no in [
            "C:\\x",
            "c:relative",
            "",
            ":x",
            "1ab:x",
            "a b:c",
            "Z:\\Games\\G.exe",
        ] {
            assert!(!is_url(no), "{no}");
        }
    }

    #[test]
    fn javascript_trim_differs_from_rusts_at_two_characters() {
        assert_eq!(stderr_excerpt("\u{FEFF} x \u{85}"), "x \u{85}");
        assert_eq!(stderr_excerpt("  a\r\n"), "a");
        // 4096 units, then a cut astral pair is a replacement character.
        let long = format!("{}\u{1F3AE}", "e".repeat(4095));
        let cut = stderr_excerpt(&long);
        assert_eq!(cut.chars().count(), 4096);
        assert!(cut.ends_with('\u{FFFD}'));
    }

    #[test]
    fn our_variables_replace_inherited_ones_of_any_case() {
        let base = vec![
            ("PATH".to_string(), "p".to_string()),
            ("gamelib_lnk_path".to_string(), "stale".to_string()),
        ];
        let env = build_shortcut_env(
            &base,
            None,
            Path::new("a.lnk"),
            &ShortcutDetails {
                target: "C:\\g.exe".to_string(),
                ..ShortcutDetails::default()
            },
        );
        assert_eq!(
            env.iter()
                .filter(|(k, _)| k.eq_ignore_ascii_case("GAMELIB_LNK_PATH"))
                .count(),
            1
        );
        assert!(env.contains(&("PATH".to_string(), "p".to_string())));
    }
}
