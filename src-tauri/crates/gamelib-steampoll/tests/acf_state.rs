//! Port of the read half of library.acfState.test.ts. Mapping table in 80-04-SUMMARY.md.

use std::fs;
use std::path::{Path, PathBuf};

use gamelib_steamfiles::acf::{write_app_manifest, AppManifestParams};
use gamelib_steampoll::acf_state::{
    read_acf_state, steam_libraries, AcfSource, AcfState, PollRoots,
};
use tempfile::TempDir;

fn manifest(app_id: &str, installdir: &str, flags: &str, bytes: Option<&str>) -> AppManifestParams {
    AppManifestParams {
        app_id: app_id.to_string(),
        installdir: installdir.to_string(),
        name: "Game".to_string(),
        size_on_disk: "9000".to_string(),
        buildid: Some("555".to_string()),
        last_owner: Some("76561197960287930".to_string()),
        state_flags: Some(flags.to_string()),
        bytes: bytes.map(str::to_string),
        beta_key: None,
        installed_depots: Vec::new(),
    }
}

fn put(dir: &Path, p: &AppManifestParams) {
    fs::create_dir_all(dir).unwrap();
    write_app_manifest(dir, p, 1_700_000_000).unwrap();
}

/// A native steam root whose libraryfolders.vdf lists `libs`; returns roots.
fn native(tmp: &TempDir, libs: &[&Path]) -> PollRoots {
    let steam = tmp.path().join("steam");
    fs::create_dir_all(steam.join("steamapps")).unwrap();
    let mut vdf = String::from("\"libraryfolders\"\n{\n");
    for (i, l) in libs.iter().enumerate() {
        vdf.push_str(&format!("\"{i}\"\n{{\n\"path\" \"{}\"\n}}\n", l.display()));
    }
    vdf.push_str("}\n");
    fs::write(steam.join("steamapps").join("libraryfolders.vdf"), vdf).unwrap();
    PollRoots {
        steam_root: steam.to_string_lossy().into_owned(),
        bottle_steamapps_root: None,
        bridge_steamapps_root: None,
    }
}

fn lib(tmp: &TempDir, name: &str) -> PathBuf {
    let p = tmp.path().join(name);
    fs::create_dir_all(p.join("steamapps")).unwrap();
    p
}

#[test]
fn installed_when_bit_4_set() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    put(&l.join("steamapps"), &manifest("730", "csgo", "4", None));
    let roots = native(&tmp, &[&l]);
    match read_acf_state(&roots, "730", AcfSource::Native) {
        AcfState::Installed {
            state_flags,
            install_path,
            size_on_disk,
            buildid,
        } => {
            assert_eq!(state_flags, 4);
            assert_eq!(PathBuf::from(install_path), l.join("steamapps/common/csgo"));
            assert_eq!(size_on_disk, "9000");
            assert_eq!(buildid.as_deref(), Some("555"));
        }
        other => panic!("{other:?}"),
    }
}

#[test]
fn downloading_when_bit_4_unset() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    put(&l.join("steamapps"), &manifest("730", "csgo", "2", None));
    let roots = native(&tmp, &[&l]);
    assert!(matches!(
        read_acf_state(&roots, "730", AcfSource::Native),
        AcfState::Downloading {
            state_flags: Some(2),
            ..
        }
    ));
}

#[test]
fn downloading_carries_byte_counters() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    let dir = l.join("steamapps");
    fs::write(
        dir.join("appmanifest_730.acf"),
        "\"AppState\"\n{\n\"appid\" \"730\"\n\"StateFlags\" \"1026\"\n\"installdir\" \"csgo\"\n\"BytesDownloaded\" \"500\"\n\"BytesToDownload\" \"1000\"\n\"BytesStaged\" \"junk\"\n}\n",
    )
    .unwrap();
    let roots = native(&tmp, &[&l]);
    assert_eq!(
        read_acf_state(&roots, "730", AcfSource::Native),
        AcfState::Downloading {
            state_flags: Some(1026),
            bytes_downloaded: 500,
            bytes_to_download: 1000,
            bytes_staged: 0,
            bytes_to_stage: 0,
        }
    );
}

#[test]
fn missing_or_non_numeric_byte_fields_default_to_zero() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    fs::write(
        l.join("steamapps/appmanifest_730.acf"),
        "\"AppState\"\n{\n\"appid\" \"730\"\n\"StateFlags\" \"2\"\n\"installdir\" \"csgo\"\n\"SizeOnDisk\" \"0\"\n}\n",
    )
    .unwrap();
    let roots = native(&tmp, &[&l]);
    assert_eq!(
        read_acf_state(&roots, "730", AcfSource::Native),
        AcfState::Downloading {
            state_flags: Some(2),
            bytes_downloaded: 0,
            bytes_to_download: 0,
            bytes_staged: 0,
            bytes_to_stage: 0,
        }
    );
}

#[test]
fn absent_when_no_manifest_in_any_existing_dir() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    let missing = tmp.path().join("missing");
    let roots = native(&tmp, &[&l, &missing]);
    assert_eq!(
        read_acf_state(&roots, "730", AcfSource::Native),
        AcfState::Absent
    );
}

#[test]
fn corrupt_acf_is_skipped_as_absent() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    fs::write(l.join("steamapps/appmanifest_730.acf"), "\u{0}{{{").unwrap();
    let roots = native(&tmp, &[&l]);
    assert_eq!(
        read_acf_state(&roots, "730", AcfSource::Native),
        AcfState::Absent
    );
}

#[test]
fn gamelib_written_1026_manifest_reads_as_downloading() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    put(
        &l.join("steamapps"),
        &manifest("730", "csgo", "1026", Some("0")),
    );
    let roots = native(&tmp, &[&l]);
    assert!(matches!(
        read_acf_state(&roots, "730", AcfSource::Native),
        AcfState::Downloading {
            state_flags: Some(1026),
            ..
        }
    ));
}

#[test]
fn steam_flipped_state_flags_4_reads_as_installed() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    put(
        &l.join("steamapps"),
        &manifest("730", "csgo", "4", Some("0")),
    );
    let roots = native(&tmp, &[&l]);
    match read_acf_state(&roots, "730", AcfSource::Native) {
        AcfState::Installed { install_path, .. } => {
            assert_eq!(PathBuf::from(install_path), l.join("steamapps/common/csgo"));
        }
        other => panic!("{other:?}"),
    }
}

fn with_bottle(roots: &mut PollRoots, dir: &Path) {
    roots.bottle_steamapps_root = Some(dir.to_string_lossy().into_owned());
}

fn with_bridge(roots: &mut PollRoots, dir: &Path) {
    roots.bridge_steamapps_root = Some(dir.to_string_lossy().into_owned());
}

#[test]
fn bottle_reads_manifest_under_bottle_root() {
    let tmp = TempDir::new().unwrap();
    let bottle = tmp.path().join("bottle/steamapps");
    put(&bottle, &manifest("730", "csgo", "4", None));
    let mut roots = native(&tmp, &[]);
    with_bottle(&mut roots, &bottle);
    match read_acf_state(&roots, "730", AcfSource::Bottle) {
        AcfState::Installed { install_path, .. } => {
            assert_eq!(PathBuf::from(install_path), bottle.join("common/csgo"));
        }
        other => panic!("{other:?}"),
    }
}

#[test]
fn bottle_is_not_conflated_with_native() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    put(&l.join("steamapps"), &manifest("730", "csgo", "4", None));
    let bottle = tmp.path().join("bottle/steamapps");
    fs::create_dir_all(&bottle).unwrap();
    let mut roots = native(&tmp, &[&l]);
    with_bottle(&mut roots, &bottle);
    assert_eq!(
        read_acf_state(&roots, "730", AcfSource::Bottle),
        AcfState::Absent
    );
    assert!(matches!(
        read_acf_state(&roots, "730", AcfSource::Native),
        AcfState::Installed { .. }
    ));
}

#[test]
fn bottle_win32_layout_program_files_root_resolves_installed() {
    let tmp = TempDir::new().unwrap();
    let bottle = tmp.path().join("drive_c/Program Files/Steam/steamapps");
    put(&bottle, &manifest("730", "csgo", "4", None));
    let mut roots = native(&tmp, &[]);
    with_bottle(&mut roots, &bottle);
    match read_acf_state(&roots, "730", AcfSource::Bottle) {
        AcfState::Installed { install_path, .. } => {
            assert_eq!(PathBuf::from(install_path), bottle.join("common/csgo"));
        }
        other => panic!("{other:?}"),
    }
}

#[test]
fn native_default_unchanged_with_same_fixture() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    put(&l.join("steamapps"), &manifest("730", "csgo", "4", None));
    // A bottle root being configured must not be consulted for native reads.
    let mut roots = native(&tmp, &[&l]);
    with_bottle(&mut roots, &tmp.path().join("nope"));
    assert!(matches!(
        read_acf_state(&roots, "730", AcfSource::Native),
        AcfState::Installed { .. }
    ));
}

#[test]
fn bridge_reads_manifest_under_bridge_root() {
    let tmp = TempDir::new().unwrap();
    let bridge = tmp.path().join("bridge/steamapps");
    put(&bridge, &manifest("730", "csgo", "4", None));
    let mut roots = native(&tmp, &[]);
    with_bridge(&mut roots, &bridge);
    assert!(matches!(
        read_acf_state(&roots, "730", AcfSource::Bridge),
        AcfState::Installed { .. }
    ));
}

#[test]
fn bridge_absent_when_dir_does_not_exist() {
    let tmp = TempDir::new().unwrap();
    let mut roots = native(&tmp, &[]);
    with_bridge(&mut roots, &tmp.path().join("no-such/steamapps"));
    assert_eq!(
        read_acf_state(&roots, "730", AcfSource::Bridge),
        AcfState::Absent
    );
}

#[test]
fn bridge_not_conflated_with_native() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    put(&l.join("steamapps"), &manifest("730", "csgo", "4", None));
    let bridge = tmp.path().join("bridge/steamapps");
    fs::create_dir_all(&bridge).unwrap();
    let mut roots = native(&tmp, &[&l]);
    with_bridge(&mut roots, &bridge);
    assert_eq!(
        read_acf_state(&roots, "730", AcfSource::Bridge),
        AcfState::Absent
    );
}

#[test]
fn bridge_only_acf_is_absent_under_native_and_bottle() {
    let tmp = TempDir::new().unwrap();
    let bridge = tmp.path().join("bridge/steamapps");
    put(&bridge, &manifest("730", "csgo", "4", None));
    let bottle = tmp.path().join("bottle/steamapps");
    fs::create_dir_all(&bottle).unwrap();
    let mut roots = native(&tmp, &[]);
    with_bridge(&mut roots, &bridge);
    with_bottle(&mut roots, &bottle);
    assert_eq!(
        read_acf_state(&roots, "730", AcfSource::Native),
        AcfState::Absent
    );
    assert_eq!(
        read_acf_state(&roots, "730", AcfSource::Bottle),
        AcfState::Absent
    );
}

#[test]
fn rust_installed_reports_path_under_dir_record_was_found_in() {
    let tmp = TempDir::new().unwrap();
    let a = lib(&tmp, "a");
    let b = lib(&tmp, "b");
    put(&b.join("steamapps"), &manifest("730", "csgo", "4", None));
    let roots = native(&tmp, &[&a, &b]);
    match read_acf_state(&roots, "730", AcfSource::Native) {
        AcfState::Installed {
            install_path,
            size_on_disk,
            buildid,
            ..
        } => {
            assert_eq!(PathBuf::from(install_path), b.join("steamapps/common/csgo"));
            assert_eq!(size_on_disk, "9000");
            assert_eq!(buildid.as_deref(), Some("555"));
        }
        other => panic!("{other:?}"),
    }
}

#[test]
fn installed_size_defaults_to_zero_and_buildid_optional() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    fs::write(
        l.join("steamapps/appmanifest_9.acf"),
        "\"AppState\"\n{\n\"appid\" \"9\"\n\"StateFlags\" \"4\"\n\"installdir\" \"x\"\n}\n",
    )
    .unwrap();
    let roots = native(&tmp, &[&l]);
    match read_acf_state(&roots, "9", AcfSource::Native) {
        AcfState::Installed {
            size_on_disk,
            buildid,
            ..
        } => {
            assert_eq!(size_on_disk, "0");
            assert_eq!(buildid, None);
        }
        other => panic!("{other:?}"),
    }
}

#[test]
fn rust_downloading_numeric_counters_non_numeric_zero() {
    // Same subject as downloading_carries_byte_counters; kept as the rust-branch counterpart
    // with a staged counter populated and the to-stage one absent.
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    fs::write(
        l.join("steamapps/appmanifest_730.acf"),
        "\"AppState\"\n{\n\"appid\" \"730\"\n\"StateFlags\" \"1026\"\n\"BytesStaged\" \"7\"\n\"BytesToStage\" \"x\"\n}\n",
    )
    .unwrap();
    let roots = native(&tmp, &[&l]);
    assert_eq!(
        read_acf_state(&roots, "730", AcfSource::Native),
        AcfState::Downloading {
            state_flags: Some(1026),
            bytes_downloaded: 0,
            bytes_to_download: 0,
            bytes_staged: 7,
            bytes_to_stage: 0,
        }
    );
}

#[test]
fn absent_when_nothing_found_and_unknown_when_manifest_read_fails_not_applicable() {
    // The TS "invoke rejects => unknown" case has no Rust analogue for the manifest read (there
    // is no transport); the Rust equivalents of "nothing was learned" are the next two tests.
    let tmp = TempDir::new().unwrap();
    let roots = native(&tmp, &[]);
    assert_eq!(
        read_acf_state(&roots, "1", AcfSource::Native),
        AcfState::Absent
    );
}

#[test]
fn unknown_when_native_library_list_cannot_be_read() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    put(&l.join("steamapps"), &manifest("730", "csgo", "4", None));
    let roots = native(&tmp, &[&l]);
    // libraryfolders.vdf becomes a directory: it exists but cannot be read (I/O error).
    let vdf = Path::new(&roots.steam_root).join("steamapps/libraryfolders.vdf");
    fs::remove_file(&vdf).unwrap();
    fs::create_dir(&vdf).unwrap();
    assert_eq!(
        read_acf_state(&roots, "730", AcfSource::Native),
        AcfState::Unknown
    );
    assert!(steam_libraries(&roots.steam_root, true).is_err());
    // Non-strict degrades to the system path only.
    assert_eq!(
        steam_libraries(&roots.steam_root, false).unwrap(),
        vec![PathBuf::from("/usr/share/steam")]
    );
}

#[test]
fn unknown_when_bottle_or_bridge_root_unprovisioned() {
    let tmp = TempDir::new().unwrap();
    let roots = native(&tmp, &[]);
    assert_eq!(
        read_acf_state(&roots, "1", AcfSource::Bottle),
        AcfState::Unknown
    );
    assert_eq!(
        read_acf_state(&roots, "1", AcfSource::Bridge),
        AcfState::Unknown
    );
}

#[test]
fn traversal_shaped_app_ids_are_unknown_and_never_joined() {
    // T-80-08.
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    put(&l.join("steamapps"), &manifest("1", "x", "4", None));
    put(&l.join("steamapps"), &manifest("2", "y", "4", None));
    let roots = native(&tmp, &[&l]);
    for bad in ["../1", "1/../2", "", "1a", "-1", " 1"] {
        assert_eq!(
            read_acf_state(&roots, bad, AcfSource::Native),
            AcfState::Unknown,
            "{bad}"
        );
    }
}

#[test]
fn steam_libraries_strips_quotes_and_filters_existing() {
    let tmp = TempDir::new().unwrap();
    let l = lib(&tmp, "lib");
    let missing = tmp.path().join("gone");
    let roots = native(&tmp, &[&l, &missing]);
    let quoted = format!("'{}'", roots.steam_root);
    let libs = steam_libraries(&quoted, true).unwrap();
    assert!(libs.contains(&l));
    assert!(!libs.contains(&missing));
}

#[test]
fn steam_libraries_missing_list_yields_system_path_only() {
    let tmp = TempDir::new().unwrap();
    let libs = steam_libraries(&tmp.path().to_string_lossy(), true).unwrap();
    assert_eq!(libs, vec![PathBuf::from("/usr/share/steam")]);
}
