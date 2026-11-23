//! `getCustomWinePaths`: the wines the user named in `config.json` (`customWinePaths`).

use super::{wine_execs, DiscoverySettings};
use crate::wine_cmd::{WineInstallation, WineKind};
use std::path::Path;

/// One entry per configured path, in order: a path ending in `proton` is a Proton, anything else a
/// wine (with its sibling `wineserver` when there is one). Nothing is checked or executed: a path
/// that does not exist is still listed, as the TS listed it, and `valid_wine` decides later.
///
/// Skipped (an empty list) when `config.json` does not exist: on a new installation the settings are
/// the factory defaults and reading them would recurse into the discovery that builds them.
pub fn custom_wine_paths(
    settings: &DiscoverySettings,
    config_path: &Path,
) -> Vec<WineInstallation> {
    if !config_path.exists() {
        return Vec::new();
    }
    settings
        .custom_wine_paths
        .iter()
        .map(|path| {
            if path.ends_with("proton") {
                WineInstallation {
                    bin: path.clone(),
                    name: format!("Custom Proton - {path}"),
                    kind: WineKind::Proton,
                    lib: None,
                    lib32: None,
                    wineserver: None,
                }
            } else {
                WineInstallation {
                    bin: path.clone(),
                    name: format!("Custom Wine - {path}"),
                    kind: WineKind::Wine,
                    lib: None,
                    lib32: None,
                    wineserver: Some(wine_execs(path)),
                }
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_testutil::FakeHome;

    fn settings(paths: &[&str]) -> DiscoverySettings {
        DiscoverySettings {
            custom_wine_paths: paths.iter().map(|p| (*p).to_string()).collect(),
            show_valve_proton: false,
        }
    }

    #[test]
    fn a_missing_config_file_skips_the_custom_paths() {
        let home = FakeHome::new("wine-custom-");
        let list = custom_wine_paths(
            &settings(&["/w/bin/wine"]),
            &home.root().join("config.json"),
        );
        assert!(list.is_empty());
    }

    #[test]
    fn a_proton_path_is_a_proton_and_any_other_a_wine_with_its_sibling_wineserver() {
        let home = FakeHome::new("wine-custom-");
        let config = home.root().join("config.json");
        std::fs::write(&config, "{}").unwrap();
        let bin = home.root().join("w/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("wineserver"), "").unwrap();
        let wine = bin.join("wine").to_string_lossy().into_owned();
        let list = custom_wine_paths(&settings(&[&wine, "/x/Proton-X/proton"]), &config);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].kind, WineKind::Wine);
        assert_eq!(list[0].name, format!("Custom Wine - {wine}"));
        assert!(list[0]
            .wineserver
            .as_deref()
            .unwrap()
            .ends_with("wineserver"));
        assert_eq!(list[1].kind, WineKind::Proton);
        assert_eq!(list[1].name, "Custom Proton - /x/Proton-X/proton");
        assert_eq!(list[1].wineserver, None);
    }
}
