//! Port of enumerate/findOtherManifests/scanDownloading/removeCopies cases. Mapping in
//! 80-05-SUMMARY.md.

use std::fs;
use std::path::Path;

use gamelib_steamfiles::acf::{write_app_manifest, AppManifestParams};
use gamelib_steampoll::acf_copies::{
    enumerate_copies, find_other_manifests_with_installdir, remove_copy, scan_downloading_app_ids,
    RemoveCopyResult, UNKNOWN_CONFLICT,
};
use gamelib_steampoll::acf_state::{AcfSource, PollRoots};
use tempfile::TempDir;

fn manifest(app_id: &str, installdir: &str, flags: &str) -> AppManifestParams {
    AppManifestParams {
        app_id: app_id.to_string(),
        installdir: installdir.to_string(),
        name: "Game".to_string(),
        size_on_disk: "9000".to_string(),
        buildid: Some("1".to_string()),
        last_owner: None,
        state_flags: Some(flags.to_string()),
        bytes: None,
        beta_key: None,
        installed_depots: Vec::new(),
    }
}

fn put(dir: &Path, p: &AppManifestParams) {
    fs::create_dir_all(dir).unwrap();
    write_app_manifest(dir, p, 1_700_000_000).unwrap();
}

fn roots(steam: &Path, bottle: Option<&Path>, bridge: Option<&Path>) -> PollRoots {
    PollRoots {
        steam_root: steam.to_string_lossy().into_owned(),
        bottle_steamapps_root: bottle.map(|p| p.to_string_lossy().into_owned()),
        bridge_steamapps_root: bridge.map(|p| p.to_string_lossy().into_owned()),
    }
}

/// A native steam root (own steamapps is the library) plus its steamapps dir.
fn native(tmp: &TempDir) -> (PollRoots, std::path::PathBuf) {
    let steam = tmp.path().join("steam");
    let sa = steam.join("steamapps");
    fs::create_dir_all(&sa).unwrap();
    let vdf = format!(
        "\"libraryfolders\"\n{{\n\"0\"\n{{\n\"path\" \"{}\"\n}}\n}}\n",
        steam.display()
    );
    fs::write(sa.join("libraryfolders.vdf"), vdf).unwrap();
    (roots(&steam, None, None), sa)
}

fn game_dir(sa: &Path, installdir: &str) -> std::path::PathBuf {
    let d = sa.join("common").join(installdir);
    fs::create_dir_all(&d).unwrap();
    fs::write(d.join("game.bin"), b"x").unwrap();
    d
}

// enumerateSteamInstallCopies

#[test]
fn enumerate_returns_only_native_when_bottle_bridge_absent() {
    let tmp = TempDir::new().unwrap();
    let (r, sa) = native(&tmp);
    put(&sa, &manifest("63000", "Hoard", "4"));
    let copies = enumerate_copies(&r, "63000");
    assert_eq!(copies.len(), 1);
    assert_eq!(copies[0].source, AcfSource::Native);
    assert_eq!(copies[0].size_on_disk, "9000");
    assert!(copies[0].install_path.ends_with("Hoard"));
}

#[test]
fn enumerate_excludes_a_downloading_root() {
    let tmp = TempDir::new().unwrap();
    let (r, sa) = native(&tmp);
    put(&sa, &manifest("63000", "Hoard", "1026"));
    assert!(enumerate_copies(&r, "63000").is_empty());
}

#[test]
fn enumerate_probes_native_bottle_bridge_in_order_and_skips_failed_probe() {
    let tmp = TempDir::new().unwrap();
    let (_, sa) = native(&tmp);
    let bottle = tmp.path().join("bottle/steamapps");
    let bridge = tmp.path().join("bridge/steamapps");
    put(&sa, &manifest("63000", "Hoard", "4"));
    put(&bottle, &manifest("63000", "Hoard", "4"));
    put(&bridge, &manifest("63000", "Hoard", "4"));
    let steam = tmp.path().join("steam");
    let r = roots(&steam, Some(&bottle), Some(&bridge));
    let order: Vec<AcfSource> = enumerate_copies(&r, "63000")
        .iter()
        .map(|c| c.source)
        .collect();
    assert_eq!(
        order,
        vec![AcfSource::Native, AcfSource::Bottle, AcfSource::Bridge]
    );
    // An unprovisioned bridge root reads Unknown: skipped, the rest still listed.
    let r2 = roots(&steam, Some(&bottle), None);
    let order2: Vec<AcfSource> = enumerate_copies(&r2, "63000")
        .iter()
        .map(|c| c.source)
        .collect();
    assert_eq!(order2, vec![AcfSource::Native, AcfSource::Bottle]);
}

// findOtherManifestsWithInstalldir

#[test]
fn other_manifests_empty_when_dir_missing() {
    let tmp = TempDir::new().unwrap();
    let missing = tmp.path().join("nope");
    assert!(
        find_other_manifests_with_installdir(&missing.to_string_lossy(), "Hoard", "63000")
            .is_empty()
    );
}

#[test]
fn other_manifests_finds_same_installdir() {
    let tmp = TempDir::new().unwrap();
    let sa = tmp.path().join("steamapps");
    put(&sa, &manifest("63000", "Hoard", "4"));
    put(&sa, &manifest("228980", "Hoard", "4"));
    assert_eq!(
        find_other_manifests_with_installdir(&sa.to_string_lossy(), "Hoard", "63000"),
        vec!["228980".to_string()]
    );
}

/// 80-REVIEW A/WR-02: on the case-insensitive default volumes of macOS and Windows, `hoard` and
/// `Hoard` are one directory, so they conflict. Linux filesystems keep them apart.
#[test]
fn other_manifests_case_differing_installdir_follows_platform_case_rule() {
    let tmp = TempDir::new().unwrap();
    let sa = tmp.path().join("steamapps");
    put(&sa, &manifest("63000", "Hoard", "4"));
    put(&sa, &manifest("228980", "hoard", "4"));
    let found = find_other_manifests_with_installdir(&sa.to_string_lossy(), "Hoard", "63000");
    if cfg!(any(target_os = "macos", windows)) {
        assert_eq!(found, vec!["228980".to_string()]);
    } else {
        assert!(found.is_empty());
    }
}

#[test]
fn other_manifests_sibling_installdir_is_not_a_conflict() {
    let tmp = TempDir::new().unwrap();
    let sa = tmp.path().join("steamapps");
    put(&sa, &manifest("63000", "Hoard", "4"));
    put(
        &sa,
        &manifest("228980", "Steamworks Common Redistributables", "4"),
    );
    assert!(
        find_other_manifests_with_installdir(&sa.to_string_lossy(), "Hoard", "63000").is_empty()
    );
}

#[test]
fn other_manifests_never_reports_self() {
    let tmp = TempDir::new().unwrap();
    let sa = tmp.path().join("steamapps");
    put(&sa, &manifest("63000", "Hoard", "4"));
    assert!(
        find_other_manifests_with_installdir(&sa.to_string_lossy(), "Hoard", "63000").is_empty()
    );
}

#[test]
fn other_manifests_corrupt_sibling_is_unknown_conflict() {
    let tmp = TempDir::new().unwrap();
    let sa = tmp.path().join("steamapps");
    put(&sa, &manifest("63000", "Hoard", "4"));
    fs::write(sa.join("appmanifest_999.acf"), b"\0\0 not vdf {{{").unwrap();
    assert_eq!(
        find_other_manifests_with_installdir(&sa.to_string_lossy(), "Hoard", "63000"),
        vec![UNKNOWN_CONFLICT.to_string()]
    );
}

#[test]
fn other_manifests_own_corrupt_manifest_is_not_a_conflict() {
    let tmp = TempDir::new().unwrap();
    let sa = tmp.path().join("steamapps");
    fs::create_dir_all(&sa).unwrap();
    fs::write(sa.join("appmanifest_63000.acf"), b"\0\0 not vdf {{{").unwrap();
    assert!(
        find_other_manifests_with_installdir(&sa.to_string_lossy(), "Hoard", "63000").is_empty()
    );
}

#[test]
fn other_manifests_ignores_non_manifest_files() {
    let tmp = TempDir::new().unwrap();
    let sa = tmp.path().join("steamapps");
    put(&sa, &manifest("63000", "Hoard", "4"));
    fs::write(sa.join("libraryfolders.vdf"), b"junk").unwrap();
    fs::write(sa.join("notes.txt"), b"junk").unwrap();
    assert!(
        find_other_manifests_with_installdir(&sa.to_string_lossy(), "Hoard", "63000").is_empty()
    );
}

// scanDownloadingAppIds

#[test]
fn scan_downloading_returns_bit_4_unset_ids() {
    let tmp = TempDir::new().unwrap();
    let (r, sa) = native(&tmp);
    put(&sa, &manifest("111", "A", "1026"));
    put(&sa, &manifest("222", "B", "4"));
    assert_eq!(scan_downloading_app_ids(&r), vec!["111".to_string()]);
}

#[test]
fn scan_downloading_empty_when_library_list_unreadable() {
    let tmp = TempDir::new().unwrap();
    let r = roots(&tmp.path().join("no-steam"), None, None);
    assert!(scan_downloading_app_ids(&r).is_empty());
}

// remove_copy functional cases (the guard refusals live in acf_copies_security.rs)

#[test]
fn remove_non_numeric_app_id_is_refused() {
    let tmp = TempDir::new().unwrap();
    let (r, sa) = native(&tmp);
    let d = game_dir(&sa, "Hoard");
    let res = remove_copy(&r, "../1", AcfSource::Native);
    assert!(matches!(res, RemoveCopyResult::Refused { .. }));
    assert!(d.join("game.bin").exists());
}

#[test]
fn remove_unknown_state_is_refused() {
    let tmp = TempDir::new().unwrap();
    let r = roots(&tmp.path().join("steam"), None, None);
    // bridge root unprovisioned => Unknown
    let res = remove_copy(&r, "63000", AcfSource::Bridge);
    assert_eq!(
        res,
        RemoveCopyResult::Refused {
            source: AcfSource::Bridge,
            reason: "install state unknown".into()
        }
    );
}

#[test]
fn remove_absent_is_absent() {
    let tmp = TempDir::new().unwrap();
    let (r, _) = native(&tmp);
    assert_eq!(
        remove_copy(&r, "63000", AcfSource::Native),
        RemoveCopyResult::Absent {
            source: AcfSource::Native
        }
    );
}

#[test]
fn remove_downloading_is_refused_and_untouched() {
    let tmp = TempDir::new().unwrap();
    let (r, sa) = native(&tmp);
    put(&sa, &manifest("63000", "Hoard", "1026"));
    let d = game_dir(&sa, "Hoard");
    let res = remove_copy(&r, "63000", AcfSource::Native);
    assert_eq!(
        res,
        RemoveCopyResult::Refused {
            source: AcfSource::Native,
            reason: "install in progress".into()
        }
    );
    assert!(d.join("game.bin").exists());
}

#[test]
fn remove_happy_path_removes_dir_and_manifest() {
    let tmp = TempDir::new().unwrap();
    let (r, sa) = native(&tmp);
    put(&sa, &manifest("63000", "Hoard", "4"));
    let d = game_dir(&sa, "Hoard");
    let res = remove_copy(&r, "63000", AcfSource::Native);
    assert_eq!(
        res,
        RemoveCopyResult::Removed {
            source: AcfSource::Native,
            manifest_only: false,
            bridge_bottle: None
        }
    );
    assert!(!d.exists());
    assert!(!sa.join("appmanifest_63000.acf").exists());
}

#[test]
fn remove_manifest_only_when_install_dir_absent() {
    let tmp = TempDir::new().unwrap();
    let (r, sa) = native(&tmp);
    put(&sa, &manifest("63000", "Hoard", "4"));
    let res = remove_copy(&r, "63000", AcfSource::Native);
    assert!(matches!(
        res,
        RemoveCopyResult::Removed {
            manifest_only: false,
            ..
        }
    ));
    assert!(!sa.join("appmanifest_63000.acf").exists());
}

#[test]
fn remove_shared_installdir_is_manifest_only_and_dir_untouched() {
    let tmp = TempDir::new().unwrap();
    let (r, sa) = native(&tmp);
    put(&sa, &manifest("63000", "Hoard", "4"));
    put(&sa, &manifest("228980", "Hoard", "4"));
    let d = game_dir(&sa, "Hoard");
    let res = remove_copy(&r, "63000", AcfSource::Native);
    assert_eq!(
        res,
        RemoveCopyResult::Removed {
            source: AcfSource::Native,
            manifest_only: true,
            bridge_bottle: None
        }
    );
    assert!(d.join("game.bin").exists());
    assert!(!sa.join("appmanifest_63000.acf").exists());
    assert!(sa.join("appmanifest_228980.acf").exists());
}

#[test]
fn remove_in_non_default_library_uses_that_library() {
    let tmp = TempDir::new().unwrap();
    let (_, _) = native(&tmp);
    let lib2 = tmp.path().join("lib2");
    let sa2 = lib2.join("steamapps");
    fs::create_dir_all(&sa2).unwrap();
    let steam = tmp.path().join("steam");
    let vdf = format!(
        "\"libraryfolders\"\n{{\n\"0\"\n{{\n\"path\" \"{}\"\n}}\n}}\n",
        lib2.display()
    );
    fs::write(steam.join("steamapps/libraryfolders.vdf"), vdf).unwrap();
    put(&sa2, &manifest("63000", "Hoard", "4"));
    let d = game_dir(&sa2, "Hoard");
    let res = remove_copy(&roots(&steam, None, None), "63000", AcfSource::Native);
    assert!(matches!(res, RemoveCopyResult::Removed { .. }));
    assert!(!d.exists());
    assert!(!sa2.join("appmanifest_63000.acf").exists());
}

#[test]
fn bridge_full_removal_reports_bottle_and_removes_no_bottle() {
    let tmp = TempDir::new().unwrap();
    let bottles = tmp.path().join("Bottles/GameLibSteamBridge-63000");
    let sa = bottles.join("steamapps");
    put(&sa, &manifest("63000", "Hoard", "4"));
    game_dir(&sa, "Hoard");
    let r = roots(&tmp.path().join("steam"), None, Some(&sa));
    let res = remove_copy(&r, "63000", AcfSource::Bridge);
    assert_eq!(
        res,
        RemoveCopyResult::Removed {
            source: AcfSource::Bridge,
            manifest_only: false,
            bridge_bottle: Some("GameLibSteamBridge-63000".into())
        }
    );
    assert!(bottles.exists(), "bottle dir itself is never removed here");
}

#[test]
fn bridge_manifest_only_reports_no_bottle_and_native_bottle_sources_never_do() {
    let tmp = TempDir::new().unwrap();
    let sa = tmp.path().join("b/steamapps");
    put(&sa, &manifest("63000", "Hoard", "4"));
    put(&sa, &manifest("228980", "Hoard", "4"));
    game_dir(&sa, "Hoard");
    let r = roots(&tmp.path().join("steam"), Some(&sa), Some(&sa));
    for source in [AcfSource::Bridge, AcfSource::Bottle] {
        let res = remove_copy(&r, "63000", source);
        assert!(matches!(
            res,
            RemoveCopyResult::Removed {
                manifest_only: true,
                bridge_bottle: None,
                ..
            }
        ));
        put(&sa, &manifest("63000", "Hoard", "4"));
    }
    let single = tmp.path().join("c/steamapps");
    put(&single, &manifest("63000", "Hoard", "4"));
    let r2 = roots(&tmp.path().join("steam"), Some(&single), None);
    assert!(matches!(
        remove_copy(&r2, "63000", AcfSource::Bottle),
        RemoveCopyResult::Removed {
            bridge_bottle: None,
            ..
        }
    ));
}
