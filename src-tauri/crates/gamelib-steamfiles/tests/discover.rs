//! Steam root discovery decision logic over a fake probe (runs on every CI leg).

use gamelib_steamfiles::discover::{discover_default, discover_steam_root, HostOs, Probe};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

#[derive(Default)]
struct Fake {
    home: Option<PathBuf>,
    env: HashMap<String, String>,
    exists: HashSet<PathBuf>,
    registry: Option<String>,
}

impl Probe for Fake {
    fn home(&self) -> Option<PathBuf> {
        self.home.clone()
    }
    fn env(&self, name: &str) -> Option<String> {
        self.env.get(name).cloned()
    }
    fn exists(&self, p: &Path) -> bool {
        self.exists.contains(p)
    }
    fn hkcu_string(&self, subkey: &str, value: &str) -> Option<String> {
        assert_eq!(subkey, "Software\\Valve\\Steam");
        assert_eq!(value, "SteamPath");
        self.registry.clone()
    }
}

fn p(s: &str) -> PathBuf {
    PathBuf::from(s)
}

fn s(p: PathBuf) -> String {
    p.to_string_lossy().into_owned()
}

fn linux(home: &str, existing: &[PathBuf]) -> Fake {
    Fake {
        home: Some(p(home)),
        exists: existing.iter().cloned().collect(),
        ..Default::default()
    }
}

fn vdf(root: PathBuf) -> PathBuf {
    root.join("steamapps").join("libraryfolders.vdf")
}

#[test]
fn mac_default() {
    let f = linux("/h", &[]);
    let d = discover_steam_root(HostOs::Mac, &f);
    assert_eq!(d.path, s(p("/h").join("Library/Application Support/Steam")));
    assert_eq!(d.source, "macDefault");
}

#[test]
fn windows_registry_wins() {
    let f = Fake {
        registry: Some("c:/program files (x86)/steam".into()),
        ..Default::default()
    };
    let d = discover_steam_root(HostOs::Windows, &f);
    assert_eq!(d.path, "c:/program files (x86)/steam");
    assert_eq!(d.source, "registry");
}

#[test]
fn windows_program_files_when_registry_empty() {
    let mut f = Fake {
        registry: Some(String::new()),
        ..Default::default()
    };
    f.env.insert("PROGRAMFILES(X86)".into(), "C:\\PF86".into());
    let d = discover_steam_root(HostOs::Windows, &f);
    assert_eq!(d.path, s(p("C:\\PF86").join("Steam")));
    assert_eq!(d.source, "programFiles");
}

#[test]
fn windows_program_files_when_registry_absent() {
    let mut f = Fake::default();
    f.env.insert("PROGRAMFILES(X86)".into(), "C:\\PF86".into());
    let d = discover_steam_root(HostOs::Windows, &f);
    assert_eq!(d.path, s(p("C:\\PF86").join("Steam")));
    assert_eq!(d.source, "programFiles");
}

#[test]
fn windows_nothing_set() {
    let d = discover_steam_root(HostOs::Windows, &Fake::default());
    assert_eq!(d.path, "Steam");
    assert_eq!(d.source, "programFiles");
}

fn flatpak_root(home: &str) -> PathBuf {
    p(home).join(".var/app/com.valvesoftware.Steam/.steam/steam")
}

#[test]
fn linux_flatpak_with_install_check() {
    let f = linux(
        "/h",
        &[
            vdf(flatpak_root("/h")),
            p("/var/lib/flatpak/app/com.valvesoftware.Steam"),
        ],
    );
    let d = discover_steam_root(HostOs::Linux, &f);
    assert_eq!(d.path, s(flatpak_root("/h")));
    assert_eq!(d.source, "flatpak");
}

#[test]
fn linux_flatpak_user_install_root() {
    let f = linux(
        "/h",
        &[
            vdf(flatpak_root("/h")),
            p("/h/.local/share/flatpak/app/com.valvesoftware.Steam"),
        ],
    );
    let d = discover_steam_root(HostOs::Linux, &f);
    assert_eq!(d.source, "flatpak");
}

#[test]
fn linux_flatpak_without_install_is_skipped() {
    let f = linux(
        "/h",
        &[vdf(flatpak_root("/h")), vdf(p("/h/.local/share/Steam"))],
    );
    let d = discover_steam_root(HostOs::Linux, &f);
    assert_eq!(d.path, s(p("/h").join(".local/share/Steam")));
    assert_eq!(d.source, "localShare");
}

#[test]
fn linux_only_local_share() {
    let f = linux("/h", &[vdf(p("/h/.local/share/Steam"))]);
    let d = discover_steam_root(HostOs::Linux, &f);
    assert_eq!(d.path, s(p("/h").join(".local/share/Steam")));
    assert_eq!(d.source, "localShare");
}

#[test]
fn linux_only_snap() {
    let f = linux("/h", &[vdf(p("/h/snap/steam/common/.local/share/Steam"))]);
    let d = discover_steam_root(HostOs::Linux, &f);
    assert_eq!(
        d.path,
        s(p("/h").join("snap/steam/common/.local/share/Steam"))
    );
    assert_eq!(d.source, "snap");
}

#[test]
fn linux_dot_steam_beats_local_share() {
    let f = linux(
        "/h",
        &[vdf(p("/h/.steam/steam")), vdf(p("/h/.local/share/Steam"))],
    );
    let d = discover_steam_root(HostOs::Linux, &f);
    assert_eq!(d.path, s(p("/h").join(".steam/steam")));
    assert_eq!(d.source, "dotSteam");
}

#[test]
fn linux_none_falls_back() {
    let d = discover_steam_root(HostOs::Linux, &linux("/h", &[]));
    assert_eq!(d.path, s(p("/h").join(".steam/steam")));
    assert_eq!(d.source, "fallback");
}

#[test]
fn no_home_never_panics() {
    let f = Fake::default();
    let l = discover_steam_root(HostOs::Linux, &f);
    assert_eq!(l.path, s(p("").join(".steam/steam")));
    assert_eq!(l.source, "fallback");
    let m = discover_steam_root(HostOs::Mac, &f);
    assert_eq!(m.source, "macDefault");
}

#[test]
fn real_probe_smoke() {
    let d = discover_default();
    assert!(!d.path.is_empty());
    assert!([
        "registry",
        "programFiles",
        "macDefault",
        "flatpak",
        "dotSteam",
        "localShare",
        "snap",
        "fallback"
    ]
    .contains(&d.source.as_str()));
}
