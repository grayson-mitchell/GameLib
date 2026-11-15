//! File-and-process half of library/macArch.ts and utils/macArch.ts (R6): find the binary,
//! probe it, produce the verdict. Applying the verdict (metadata store, known-fix reports, the
//! 32-bit prompt) stays in the TS handler for the `macArchVerdict` state event.
//!
//! Info.plist: the TS reads it as text and matches `CFBundleExecutable` with a regex (no plist
//! library, no plutil), so this port does the same; a binary plist is simply "no declared name".

use crate::acf_state::AcfSource;
use crate::host::ProcessRunner;
use crate::profile::Platform;
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

/// Maximum bundle files probed per game.
const MAX_CANDIDATES: usize = 8;
/// Per-probe bound (`PROBE_TIMEOUT_MS` in utils/macArch.ts).
pub const PROBE_TIMEOUT: Duration = Duration::from_millis(5_000);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MacArch {
    #[serde(rename = "32")]
    Bits32,
    #[serde(rename = "64")]
    Bits64,
}

impl MacArch {
    pub fn as_str(self) -> &'static str {
        match self {
            MacArch::Bits32 => "32",
            MacArch::Bits64 => "64",
        }
    }
}

fn word_in(output: &str, word: &str) -> bool {
    output
        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .any(|w| w == word)
}

fn archs_from_file_output(output: &str) -> Vec<String> {
    ["x86_64", "arm64", "i386"]
        .into_iter()
        .filter(|a| word_in(output, a))
        .map(String::from)
        .collect()
}

async fn probe_text(runner: &dyn ProcessRunner, cmd: &str, argv: Vec<String>) -> Option<String> {
    let r = runner.run(cmd, argv, PROBE_TIMEOUT).await;
    (r.code == Some(0)).then_some(r.stdout)
}

/// `lipo -archs` then `file`; both failing yields `[]` (inconclusive, never a 32-bit verdict).
pub async fn macho_archs(runner: &dyn ProcessRunner, path: &Path) -> Vec<String> {
    let p = path.to_string_lossy().into_owned();
    if let Some(lipo) = probe_text(runner, "lipo", vec!["-archs".into(), p.clone()]).await {
        let archs: Vec<String> = lipo.split_whitespace().map(String::from).collect();
        if !archs.is_empty() {
            return archs;
        }
    }
    match probe_text(runner, "file", vec![p]).await {
        Some(out) => archs_from_file_output(&out),
        None => Vec::new(),
    }
}

pub fn verdict_from_archs(archs: &[String]) -> Option<MacArch> {
    if archs.is_empty() {
        return None;
    }
    if archs.iter().any(|a| a == "x86_64" || a == "arm64") {
        return Some(MacArch::Bits64);
    }
    if archs.iter().any(|a| a == "i386") {
        return Some(MacArch::Bits32);
    }
    None
}

/// Lexical `path.resolve(base, rel)`: no filesystem access.
fn resolve(base: &Path, rel: &str) -> PathBuf {
    let joined = base.join(rel);
    let mut out = PathBuf::new();
    for c in joined.components() {
        match c {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn contained(install_path: &Path, launch: &str) -> Option<PathBuf> {
    let candidate = resolve(install_path, launch);
    let base = resolve(install_path, ".");
    candidate.starts_with(&base).then_some(candidate)
}

/// Only a bare file name is accepted (T-80-32): the result cannot leave Contents/MacOS.
fn bundle_executable_name(bundle: &Path) -> Option<String> {
    let xml = std::fs::read(bundle.join("Contents").join("Info.plist")).ok()?;
    let xml = String::from_utf8_lossy(&xml);
    let after =
        &xml[xml.find("<key>CFBundleExecutable</key>")? + "<key>CFBundleExecutable</key>".len()..];
    let after = after.trim_start();
    let after = after.strip_prefix("<string>")?;
    let name = after[..after.find("</string>")?].trim();
    let bare = !name.is_empty()
        && name != ".."
        && name != "."
        && !name.contains('/')
        && !name.contains('\\');
    bare.then(|| name.to_string())
}

fn read_dir_names(dir: &Path) -> std::io::Result<Vec<String>> {
    let mut names: Vec<String> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    Ok(names)
}

fn first_bundle_binary(bundle: &Path) -> Option<PathBuf> {
    let mac_os = bundle.join("Contents").join("MacOS");
    if !mac_os.exists() {
        return None;
    }
    if let Some(name) = bundle_executable_name(bundle) {
        let p = mac_os.join(&name);
        if p.exists() {
            return Some(p);
        }
    }
    read_dir_names(&mac_os)
        .ok()?
        .first()
        .map(|n| mac_os.join(n))
}

/// Locates the Mach-O binary to inspect; never errors, `None` on any miss.
pub fn locate_macho_binary(install_path: &Path) -> Option<PathBuf> {
    locate_macho_binary_with(install_path, None)
}

/// As `locate_macho_binary`, with a launch executable (resolved against `install_path`, rejected
/// when it escapes the subtree).
pub fn locate_macho_binary_with(install_path: &Path, launch: Option<&str>) -> Option<PathBuf> {
    if let Some(launch) = launch.filter(|l| !l.is_empty()) {
        if let Some(candidate) = contained(install_path, launch) {
            if launch.ends_with(".app") {
                if let Some(bin) = first_bundle_binary(&candidate) {
                    return Some(bin);
                }
            } else if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    if install_path.to_string_lossy().ends_with(".app") {
        return first_bundle_binary(install_path);
    }
    let names = read_dir_names(install_path).ok()?;
    let app = names.into_iter().find(|n| n.ends_with(".app"))?;
    first_bundle_binary(&install_path.join(app))
}

/// Up to eight files to probe: the contained launch executable, then the bundle's executable
/// first and every entry of its Contents/MacOS.
pub fn locate_macho_candidates(install_path: &Path, launch: Option<&str>) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    let mut add = |p: PathBuf| {
        if !out.contains(&p) && out.len() < MAX_CANDIDATES {
            out.push(p);
        }
    };
    if let Some(launch) = launch.filter(|l| !l.is_empty() && !l.ends_with(".app")) {
        if let Some(c) = contained(install_path, launch) {
            if c.exists() {
                add(c);
            }
        }
    }
    if let Some(first) = locate_macho_binary_with(install_path, None) {
        let dir = first.parent().map(Path::to_path_buf).unwrap_or_default();
        if dir.ends_with("Contents/MacOS") {
            add(first);
            if let Ok(names) = read_dir_names(&dir) {
                for n in names {
                    add(dir.join(n));
                }
            }
        } else {
            add(first);
        }
    }
    out
}

/// The post-install ground-truth probe. Only native installs on macOS are probed; anything
/// else, and any inconclusive result, is `None`.
pub async fn mac_arch_verdict(
    runner: &dyn ProcessRunner,
    platform: Platform,
    source: AcfSource,
    install_path: &Path,
) -> Option<MacArch> {
    if source != AcfSource::Native || platform != Platform::Darwin {
        return None;
    }
    let bin = locate_macho_binary(install_path)?;
    verdict_from_archs(&macho_archs(runner, &bin).await)
}
