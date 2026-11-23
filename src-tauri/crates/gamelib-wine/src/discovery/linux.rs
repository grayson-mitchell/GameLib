//! The Linux wine set (`getLinuxWineSet`): what GameLib installed under `<tools>/wine` and
//! `<tools>/proton`, Lutris's wine runners, Proton in the Steam libraries, the wine on `PATH` and
//! the user's custom paths, in that order.

use std::path::Path;

use super::custom::custom_wine_paths;
use super::default_wine::{default_wine_from_path, is_executable_file};
use super::{list_dir, wine_execs, wine_version_line, DiscoveryHost, SteamLibraries};
use crate::ctx::WineCtx;
use crate::manager::log_error;
use crate::wine_cmd::{js_dirname, js_join, WineInstallation, WineKind};

fn text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// `getWineLibs`: `(lib, lib32)`, each `""` when its directory (`../lib64`, `../lib`) is absent.
fn wine_libs(wine_bin: &str) -> (String, String) {
    let dir = js_dirname(wine_bin);
    let found = |relative: &str| {
        let candidate = js_join(&[&dir, relative]);
        if candidate.exists() {
            text(&candidate)
        } else {
            String::new()
        }
    };
    (found("../lib64"), found("../lib"))
}

/// A wine in `<root>/<version>/bin/wine`, with the lib folders and `wineserver` it has.
fn wine_in(root: &str, version: &str) -> WineInstallation {
    let bin = text(&js_join(&[root, version, "bin", "wine"]));
    let (lib, lib32) = wine_libs(&bin);
    WineInstallation {
        wineserver: Some(wine_execs(&bin)),
        lib: Some(lib),
        lib32: Some(lib32),
        name: version.to_string(),
        kind: WineKind::Wine,
        bin,
    }
}

/// `getSteamLibraries`: `/usr/share/steam` (when the roots name it) and, when `libraryfolders.vdf`
/// was found and parsed, the libraries it names that exist. A failed, missing or unparsed read keeps
/// only `/usr/share/steam`. The read itself is the shell's (`gamelib-steamfiles`), handed in.
fn steam_libraries(host: &DiscoveryHost) -> Vec<String> {
    let system = host.roots.system_steam.as_deref().map(text);
    match &host.steam_libraries {
        Some(SteamLibraries {
            exists: true,
            parsed: true,
            paths,
        }) => system
            .into_iter()
            .chain(paths.iter().cloned())
            .filter(|path| Path::new(path).exists())
            .collect(),
        _ => system.into_iter().collect(),
    }
}

/// `getLinuxWineSet`. Creates `<tools>/wine` and `<tools>/proton` when they are missing (the TS did,
/// and the goldens' trees show it), then lists, each directory sorted. `scan_custom` adds the custom
/// wine paths (`getAlternativeWine` passes `true`; the Linux set's own default is `false`).
pub async fn linux_wine_set(
    ctx: &WineCtx,
    host: &DiscoveryHost,
    scan_custom: bool,
) -> Vec<WineInstallation> {
    let tools = text(&ctx.engine.paths.tools_path);
    for sub in ["wine", "proton"] {
        let dir = format!("{tools}/{sub}");
        if !Path::new(&dir).exists() && std::fs::create_dir_all(&dir).is_err() {
            log_error(ctx, "Could not create a wine tools directory");
        }
    }

    let mut alt_wine = Vec::new();
    for version in list_dir(Path::new(&format!("{tools}/wine/"))) {
        alt_wine.push(wine_in(&format!("{tools}/wine"), &version));
    }
    let lutris = format!(
        "{}/.local/share/lutris/runners/wine/",
        text(&host.roots.home)
    );
    if Path::new(&lutris).exists() {
        for version in list_dir(Path::new(&lutris)) {
            alt_wine.push(wine_in(&lutris, &version));
        }
    }

    let mut proton_paths = vec![format!("{tools}/proton/")];
    for library in steam_libraries(host) {
        if host.settings.show_valve_proton {
            proton_paths.push(format!("{library}/steam/steamapps/common"));
            proton_paths.push(format!("{library}/steamapps/common"));
        }
        proton_paths.push(format!("{library}/root/compatibilitytools.d"));
        proton_paths.push(format!("{library}/compatibilitytools.d"));
    }
    let mut proton = Vec::new();
    for path in &proton_paths {
        if !Path::new(path).exists() {
            continue;
        }
        for version in list_dir(Path::new(path)) {
            // Only relevant to Lutris.
            if version.starts_with("UMU-Latest") {
                continue;
            }
            let proton_bin = js_join(&[path, &version, "proton"]);
            // Check the bin exists to avoid false positives. Proton ships neither wineboot nor
            // wineserver, so there is nothing else to look for.
            if proton_bin.exists() {
                proton.push(WineInstallation {
                    bin: text(&proton_bin),
                    name: version,
                    kind: WineKind::Proton,
                    lib: None,
                    lib32: None,
                    wineserver: None,
                });
            }
        }
    }

    let mut default_wine = Vec::new();
    let mut default =
        default_wine_from_path(host.path.as_deref(), &is_executable_file, &|p| p.exists());
    if !default.name.contains("Not Found") {
        // The version the binary reports names it; a failed probe keeps the binary-name fallback.
        if let Some(name) = wine_version_line(ctx, &default.bin).await {
            if !name.is_empty() {
                default.name = name;
            }
        }
        default_wine.push(default);
    }

    let custom = if scan_custom {
        custom_wine_paths(&host.settings, &host.roots.config_path)
    } else {
        Vec::new()
    };

    let mut set = proton;
    set.extend(alt_wine);
    set.extend(default_wine);
    set.extend(custom);
    set
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::discovery::{DiscoveryRoots, DiscoverySettings};
    use gamelib_testutil::FakeHome;
    use std::path::PathBuf;

    fn host(system_steam: Option<PathBuf>, libraries: Option<SteamLibraries>) -> DiscoveryHost {
        DiscoveryHost {
            roots: DiscoveryRoots {
                home: PathBuf::from("/h"),
                config_path: PathBuf::from("/c"),
                system_steam,
            },
            path: None,
            settings: DiscoverySettings::default(),
            steam_libraries: libraries,
            scan_custom: None,
        }
    }

    #[test]
    fn the_lib_folders_are_named_when_present_and_empty_when_not() {
        let home = FakeHome::new("wine-linux-libs-");
        let bin = home.root().join("w/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::create_dir_all(home.root().join("w/lib64")).unwrap();
        let wine = text(&bin.join("wine"));
        let (lib, lib32) = wine_libs(&wine);
        assert!(lib.ends_with("w/lib64"), "{lib}");
        assert_eq!(lib32, "");
        assert_eq!(
            wine_libs("/nowhere/bin/wine"),
            (String::new(), String::new())
        );
    }

    #[test]
    fn a_missing_failed_or_unparsed_library_read_keeps_only_the_system_steam() {
        let home = FakeHome::new("wine-linux-steam-");
        let system = home.root().to_path_buf();
        let system_text = text(&system);
        let answer = |exists, parsed| SteamLibraries {
            exists,
            parsed,
            paths: vec![text(&home.root().join("nope"))],
        };
        for libraries in [None, Some(answer(false, false)), Some(answer(true, false))] {
            let host = host(Some(system.clone()), libraries);
            assert_eq!(steam_libraries(&host), std::slice::from_ref(&system_text));
        }
        // Without the system root named, nothing is left.
        assert!(steam_libraries(&host(None, None)).is_empty());
    }

    #[test]
    fn a_parsed_read_keeps_the_libraries_that_exist_in_order() {
        let home = FakeHome::new("wine-linux-steam-");
        let lib = home.root().join("lib");
        std::fs::create_dir_all(&lib).unwrap();
        let libraries = SteamLibraries {
            exists: true,
            parsed: true,
            paths: vec![text(&home.root().join("gone")), text(&lib)],
        };
        let host = host(None, Some(libraries));
        assert_eq!(steam_libraries(&host), [text(&lib)]);
    }
}
