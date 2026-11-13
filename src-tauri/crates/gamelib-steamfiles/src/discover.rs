//! Steam root discovery per platform (D-12..D-14), as one pure decision function over an
//! injected [`Probe`] so the Windows, macOS and Linux logic is unit-tested on every CI leg.
//!
//! Behaviour change from the TypeScript it replaces (intended, D-14; recorded in 75-PARITY.md):
//! on Linux a candidate now qualifies only when `steamapps/libraryfolders.vdf` exists under it
//! (previously "the flatpak dir exists"), and `~/.local/share/Steam` and the Snap location are
//! added. The Flatpak candidate additionally needs the flatpak app installed under
//! `/var/lib/flatpak` or `~/.local/share/flatpak`.

use serde::Serialize;
use std::path::{Path, PathBuf};

const FLATPAK_STEAM_APP: &str = "com.valvesoftware.Steam";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostOs {
    Windows,
    Mac,
    Linux,
}

impl HostOs {
    pub fn current() -> Self {
        if cfg!(windows) {
            HostOs::Windows
        } else if cfg!(target_os = "macos") {
            HostOs::Mac
        } else {
            HostOs::Linux
        }
    }
}

pub trait Probe {
    fn home(&self) -> Option<PathBuf>;
    fn env(&self, name: &str) -> Option<String>;
    fn exists(&self, p: &Path) -> bool;
    fn hkcu_string(&self, subkey: &str, value: &str) -> Option<String>;
}

/// `source` is one of: registry, programFiles, macDefault, flatpak, dotSteam, localShare, snap,
/// fallback.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Discovery {
    pub path: String,
    pub source: String,
}

fn found(path: PathBuf, source: &str) -> Discovery {
    Discovery {
        path: path.to_string_lossy().into_owned(),
        source: source.to_string(),
    }
}

pub fn discover_steam_root(os: HostOs, probe: &dyn Probe) -> Discovery {
    let home = probe.home().unwrap_or_default();
    match os {
        HostOs::Windows => {
            if let Some(reg) = probe.hkcu_string("Software\\Valve\\Steam", "SteamPath") {
                if !reg.is_empty() {
                    return Discovery {
                        path: reg,
                        source: "registry".into(),
                    };
                }
            }
            let pf = probe.env("PROGRAMFILES(X86)").unwrap_or_default();
            found(PathBuf::from(pf).join("Steam"), "programFiles")
        }
        HostOs::Mac => found(home.join("Library/Application Support/Steam"), "macDefault"),
        HostOs::Linux => {
            let has_vdf =
                |root: &Path| probe.exists(&root.join("steamapps").join("libraryfolders.vdf"));
            let flatpak = home.join(".var/app/com.valvesoftware.Steam/.steam/steam");
            let flatpak_installed = [
                PathBuf::from("/var/lib/flatpak"),
                home.join(".local/share/flatpak"),
            ]
            .iter()
            .any(|r| probe.exists(&r.join("app").join(FLATPAK_STEAM_APP)));
            if flatpak_installed && has_vdf(&flatpak) {
                return found(flatpak, "flatpak");
            }
            let candidates = [
                (home.join(".steam/steam"), "dotSteam"),
                (home.join(".local/share/Steam"), "localShare"),
                (home.join("snap/steam/common/.local/share/Steam"), "snap"),
            ];
            for (root, source) in candidates {
                if has_vdf(&root) {
                    return found(root, source);
                }
            }
            found(home.join(".steam/steam"), "fallback")
        }
    }
}

pub struct RealProbe;

impl Probe for RealProbe {
    fn home(&self) -> Option<PathBuf> {
        #[cfg(target_os = "linux")]
        if let Some(h) = std::env::var_os("SNAP_REAL_HOME").filter(|v| !v.is_empty()) {
            return Some(PathBuf::from(h));
        }
        #[cfg(windows)]
        let var = "USERPROFILE";
        #[cfg(not(windows))]
        let var = "HOME";
        std::env::var_os(var).map(PathBuf::from)
    }
    fn env(&self, name: &str) -> Option<String> {
        std::env::var(name).ok()
    }
    fn exists(&self, p: &Path) -> bool {
        p.exists()
    }
    fn hkcu_string(&self, subkey: &str, value: &str) -> Option<String> {
        hkcu_string_impl(subkey, value)
    }
}

#[cfg(not(windows))]
fn hkcu_string_impl(_subkey: &str, _value: &str) -> Option<String> {
    None
}

#[cfg(windows)]
fn hkcu_string_impl(subkey: &str, value: &str) -> Option<String> {
    let _ = (subkey, value);
    None
}

pub fn discover_default() -> Discovery {
    discover_steam_root(HostOs::current(), &RealProbe)
}
