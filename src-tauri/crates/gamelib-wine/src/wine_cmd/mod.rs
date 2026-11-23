//! The wine command core (Phase 87, D-22): the pieces DXVK, Winetricks, bottle creation and the
//! three resolver channels need in Rust, ported from `launcher.ts` and `commandRunner.ts` and
//! replayed against the goldens `87-08` recorded from the TS.
//!
//! - [`valid`]: `validWine`, the existence rule of each wine type.
//! - [`env`]: `setupEnvVars` and `setupWineEnvVars`, pure functions over the settings, the platform
//!   and an [`EnvSnapshot`] of the process environment (this crate reads no environment of its own).
//! - [`command`]: `runWineCommand`, the prefix check, the environment merge and the spawn.
//! - [`prefix`]: `verifyWinePrefix`, creating a prefix with `wineboot --init` (or umu's
//!   `createprefix`).
//!
//! Crate-only for now: ops `wine_valid` and `wine_run_command` exist with no channel, shim or caller
//! (D-06); 87-24 serves them to the renderer and switches the TS callers. A launched game's wine is
//! not spawned here (Phase 88).

pub mod command;
pub mod env;
pub mod prefix;
pub mod valid;

use serde::Deserialize;
use std::path::{Component, Path, PathBuf};

/// The wine flavour of an installation (`WineInstallation.type`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WineKind {
    Wine,
    Proton,
    Crossover,
    Toolkit,
}

/// One wine installation as the settings store it (`WineInstallation` in `common/types.ts`).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WineInstallation {
    pub bin: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: WineKind,
    #[serde(default)]
    pub lib: Option<String>,
    #[serde(default)]
    pub lib32: Option<String>,
    #[serde(default)]
    pub wineserver: Option<String>,
}

/// The facts of the running process the shell reads and hands the crate, which reads no environment
/// variable and asks no OS question of its own. Every field is optional on the wire.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WineHost {
    /// The process environment (`process.env`): the base of a wine command's environment, the six
    /// keys the builders read and the `PATH` the umu lookup scans.
    #[serde(default)]
    pub env: env::EnvSnapshot,
    /// The Darwin kernel release (`os.release()` on macOS, e.g. `24.1.0`); `validWine` compares its
    /// major to 14 for a toolkit. `None` is "not recent enough", as on any other OS.
    #[serde(default)]
    pub darwin_release: Option<String>,
    /// What `runWineCommand` runs with when it is given no settings (`getDefaultSettings()`).
    #[serde(default)]
    pub default_settings: Option<env::GameSettingsView>,
    /// A cancel the caller owns: it ends the running wine child and the wineserver wait.
    #[serde(skip)]
    pub cancel: Option<tokio_util::sync::CancellationToken>,
}

/// `path.join` as Node does on POSIX: the parts joined, then normalised (duplicate separators and
/// `.` dropped, `..` resolved against the part before it). An empty result is `.`.
pub(crate) fn js_join(parts: &[&str]) -> PathBuf {
    let mut joined = PathBuf::new();
    for part in parts.iter().filter(|p| !p.is_empty()) {
        joined.push(part);
    }
    let rooted = joined.has_root();
    let mut out: Vec<Component> = Vec::new();
    for component in joined.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => match out.last() {
                Some(Component::Normal(_)) => {
                    out.pop();
                }
                Some(Component::RootDir | Component::Prefix(_)) => {}
                _ if rooted => {}
                _ => out.push(component),
            },
            other => out.push(other),
        }
    }
    let result: PathBuf = out.iter().collect();
    if result.as_os_str().is_empty() {
        PathBuf::from(".")
    } else {
        result
    }
}

/// `path.dirname`: the parent, `.` for a bare name and the root for the root.
pub(crate) fn js_dirname(path: &str) -> String {
    match Path::new(path).parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_string_lossy().into_owned(),
        Some(_) => ".".to_string(),
        None => {
            if path.is_empty() {
                ".".to_string()
            } else {
                path.to_string()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn js_join_normalises_like_node() {
        assert_eq!(js_join(&["/a/b/", "c"]), PathBuf::from("/a/b/c"));
        assert_eq!(js_join(&["/a", "./b", "../c"]), PathBuf::from("/a/c"));
        assert_eq!(js_join(&["/a", "..", ".."]), PathBuf::from("/"));
        assert_eq!(js_join(&["", "dosdevices"]), PathBuf::from("dosdevices"));
        assert_eq!(js_join(&["a", ".."]), PathBuf::from("."));
        assert_eq!(js_join(&["..", "a"]), PathBuf::from("../a"));
        assert_eq!(js_join(&[]), PathBuf::from("."));
    }

    #[test]
    fn js_dirname_matches_node() {
        assert_eq!(js_dirname("/a/b/proton"), "/a/b");
        assert_eq!(js_dirname("proton"), ".");
        assert_eq!(js_dirname("/"), "/");
        assert_eq!(js_dirname("/proton"), "/");
    }

    #[test]
    fn a_wine_installation_rejects_unknown_fields_and_types() {
        let ok = serde_json::json!({"bin": "/b", "name": "n", "type": "wine", "wineserver": "/s"});
        assert!(serde_json::from_value::<WineInstallation>(ok).is_ok());
        let extra = serde_json::json!({"bin": "/b", "name": "n", "type": "wine", "x": 1});
        assert!(serde_json::from_value::<WineInstallation>(extra).is_err());
        let kind = serde_json::json!({"bin": "/b", "name": "n", "type": "lutris"});
        assert!(serde_json::from_value::<WineInstallation>(kind).is_err());
    }
}
