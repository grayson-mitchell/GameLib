//! Path-guard refusals for `remove_copy` (T-80-11 .. T-80-13). Each test asserts a sentinel file
//! OUTSIDE steamapps survives.

use std::fs;
use std::path::{Path, PathBuf};

use gamelib_steamfiles::acf::{write_app_manifest, AppManifestParams};
use gamelib_steampoll::acf_copies::{guard_install_root, remove_copy, RemoveCopyResult};
use gamelib_steampoll::acf_state::{AcfSource, PollRoots};
use tempfile::TempDir;

fn put(sa: &Path, app_id: &str, installdir: &str) {
    fs::create_dir_all(sa).unwrap();
    let p = AppManifestParams {
        app_id: app_id.to_string(),
        installdir: installdir.to_string(),
        name: "G".into(),
        size_on_disk: "1".into(),
        buildid: None,
        last_owner: None,
        state_flags: Some("4".into()),
        bytes: None,
        beta_key: None,
        installed_depots: Vec::new(),
    };
    write_app_manifest(sa, &p, 1).unwrap();
}

/// Bottle-style root; returns (roots, steamapps, victim dir outside, sentinel file).
fn setup(tmp: &TempDir) -> (PollRoots, PathBuf, PathBuf, PathBuf) {
    let sa = tmp.path().join("bottle/steamapps");
    fs::create_dir_all(sa.join("common")).unwrap();
    let victim = tmp.path().join("victim");
    fs::create_dir_all(&victim).unwrap();
    let sentinel = victim.join("precious.txt");
    fs::write(&sentinel, b"keep").unwrap();
    let roots = PollRoots {
        steam_root: tmp.path().join("steam").to_string_lossy().into_owned(),
        bottle_steamapps_root: Some(sa.to_string_lossy().into_owned()),
        bridge_steamapps_root: None,
    };
    (roots, sa, victim, sentinel)
}

fn assert_refused(res: &RemoveCopyResult) {
    assert!(
        matches!(res, RemoveCopyResult::Refused { .. }),
        "expected refusal, got {res:?}"
    );
}

#[test]
fn refuses_non_numeric_app_id() {
    let tmp = TempDir::new().unwrap();
    let (r, _sa, _v, sentinel) = setup(&tmp);
    assert_refused(&remove_copy(&r, "1/../../victim", AcfSource::Bottle));
    assert!(sentinel.exists());
}

#[test]
fn refuses_traversal_installdir() {
    let tmp = TempDir::new().unwrap();
    let (r, sa, victim, sentinel) = setup(&tmp);
    put(&sa, "10", "../../../victim");
    assert_refused(&remove_copy(&r, "10", AcfSource::Bottle));
    assert!(victim.exists() && sentinel.exists());
}

#[test]
fn refuses_empty_installdir() {
    let tmp = TempDir::new().unwrap();
    let (r, sa, _v, sentinel) = setup(&tmp);
    put(&sa, "10", "");
    assert_refused(&remove_copy(&r, "10", AcfSource::Bottle));
    assert!(sa.join("common").exists() && sentinel.exists());
}

#[test]
fn refuses_absolute_installdir() {
    let tmp = TempDir::new().unwrap();
    let (r, sa, victim, sentinel) = setup(&tmp);
    put(&sa, "10", &victim.to_string_lossy());
    assert_refused(&remove_copy(&r, "10", AcfSource::Bottle));
    assert!(victim.exists() && sentinel.exists());
}

#[test]
fn refuses_dot_segment_installdir() {
    let tmp = TempDir::new().unwrap();
    let (r, sa, _v, sentinel) = setup(&tmp);
    put(&sa, "10", ".");
    assert_refused(&remove_copy(&r, "10", AcfSource::Bottle));
    assert!(sa.join("common").exists() && sentinel.exists());
}

/// A victim that itself sits in another library's `steamapps/common`, so a library root derived
/// from the install path would make the guard tautological (80-REVIEW A/CR-01).
fn other_library_victim(tmp: &TempDir) -> (PathBuf, PathBuf) {
    let victim = tmp.path().join("other/steamapps/common/Victim");
    fs::create_dir_all(&victim).unwrap();
    let sentinel = victim.join("precious.txt");
    fs::write(&sentinel, b"keep").unwrap();
    (victim, sentinel)
}

#[test]
fn refuses_traversal_installdir_into_another_library() {
    let tmp = TempDir::new().unwrap();
    let (r, sa, _v, _s) = setup(&tmp);
    let (victim, sentinel) = other_library_victim(&tmp);
    put(&sa, "10", "../../../other/steamapps/common/Victim");
    assert_refused(&remove_copy(&r, "10", AcfSource::Bottle));
    assert!(victim.exists() && sentinel.exists());
}

#[test]
fn refuses_absolute_installdir_into_another_library() {
    let tmp = TempDir::new().unwrap();
    let (r, sa, _v, _s) = setup(&tmp);
    let (victim, sentinel) = other_library_victim(&tmp);
    put(&sa, "10", &victim.to_string_lossy());
    assert_refused(&remove_copy(&r, "10", AcfSource::Bottle));
    assert!(victim.exists() && sentinel.exists());
}

/// 80-REVIEW A/WR-01: `Studio/GameA` must never delete `common/Studio`, which holds GameB too.
#[test]
fn refuses_nested_installdir_and_keeps_shared_parent() {
    let tmp = TempDir::new().unwrap();
    let (r, sa, _v, _s) = setup(&tmp);
    let game_a = sa.join("common/Studio/GameA");
    let game_b = sa.join("common/Studio/GameB");
    fs::create_dir_all(&game_a).unwrap();
    fs::create_dir_all(&game_b).unwrap();
    fs::write(game_b.join("game.bin"), b"x").unwrap();
    put(&sa, "10", "Studio/GameA");
    put(&sa, "11", "Studio/GameB");
    assert_refused(&remove_copy(&r, "10", AcfSource::Bottle));
    assert!(game_a.exists() && game_b.join("game.bin").exists());
}

#[test]
fn refuses_backslash_and_drive_installdir() {
    let tmp = TempDir::new().unwrap();
    let (r, sa, victim, sentinel) = setup(&tmp);
    for bad in ["..\\..\\..\\victim", "C:\\victim", "C:victim"] {
        put(&sa, "10", bad);
        assert_refused(&remove_copy(&r, "10", AcfSource::Bottle));
    }
    assert!(victim.exists() && sentinel.exists());
}

#[cfg(unix)]
#[test]
fn refuses_symlinked_install_root() {
    let tmp = TempDir::new().unwrap();
    let (r, sa, victim, sentinel) = setup(&tmp);
    std::os::unix::fs::symlink(&victim, sa.join("common").join("Hoard")).unwrap();
    put(&sa, "10", "Hoard");
    assert_refused(&remove_copy(&r, "10", AcfSource::Bottle));
    assert!(victim.exists() && sentinel.exists());
}

#[cfg(unix)]
#[test]
fn refuses_symlinked_common_dir() {
    let tmp = TempDir::new().unwrap();
    let (r, sa, victim, sentinel) = setup(&tmp);
    fs::remove_dir_all(sa.join("common")).unwrap();
    fs::create_dir_all(victim.join("Hoard")).unwrap();
    fs::write(victim.join("Hoard/game.bin"), b"x").unwrap();
    std::os::unix::fs::symlink(&victim, sa.join("common")).unwrap();
    put(&sa, "10", "Hoard");
    assert_refused(&remove_copy(&r, "10", AcfSource::Bottle));
    assert!(victim.join("Hoard/game.bin").exists() && sentinel.exists());
}

#[cfg(unix)]
#[test]
fn guard_refuses_canonical_escape_through_symlinked_steamapps_child() {
    let tmp = TempDir::new().unwrap();
    let (_r, sa, victim, sentinel) = setup(&tmp);
    // A real dir under common whose canonical form escapes is impossible without a symlink, so
    // point the guard at a root under a different steamapps than the one it is told about.
    let other = tmp.path().join("other/steamapps/common/Hoard");
    fs::create_dir_all(&other).unwrap();
    assert!(guard_install_root(&sa, &other).is_err());
    assert!(victim.exists() && sentinel.exists() && other.exists());
}

#[cfg(windows)]
#[test]
fn refuses_reparse_point_install_root() {
    let tmp = TempDir::new().unwrap();
    let (r, sa, victim, sentinel) = setup(&tmp);
    // Directory symlink (needs the symlink privilege; junctions are covered by the same
    // reparse-point attribute check).
    if std::os::windows::fs::symlink_dir(&victim, sa.join("common").join("Hoard")).is_err() {
        return;
    }
    put(&sa, "10", "Hoard");
    assert_refused(&remove_copy(&r, "10", AcfSource::Bottle));
    assert!(victim.exists() && sentinel.exists());
}

#[test]
fn guard_rejects_relative_dot_and_no_steamapps_ancestor() {
    let sa = Path::new("/x/steamapps");
    assert!(guard_install_root(sa, Path::new("steamapps/common/A")).is_err());
    assert!(guard_install_root(sa, Path::new("/x/steamapps/common/../A")).is_err());
    assert!(guard_install_root(sa, Path::new("/x/common/A")).is_err());
    assert!(guard_install_root(sa, Path::new("/")).is_err());
}
