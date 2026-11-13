//! Fixture tests for the library scan (plan 75-10).

use gamelib_steamfiles::library::*;
use std::path::{Path, PathBuf};

fn fx(rel: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(rel)
}

fn fixtures_str() -> String {
    fx("").to_string_lossy().trim_end_matches('/').to_string()
}

fn sub(p: &str) -> String {
    p.replace("${FIXTURES}", &fixtures_str())
}

#[test]
fn modern_in_file_order() {
    let r = read_library_folders(&fx("libraryfolders/modern.vdf"));
    assert!(r.exists && r.parsed);
    assert_eq!(
        r.paths,
        vec![
            "${FIXTURES}/scan/lib1",
            "${FIXTURES}/scan/lib2",
            "${FIXTURES}/scan/missing-lib"
        ]
    );
}

#[test]
fn windows_paths_decoded() {
    let r = read_library_folders(&fx("libraryfolders/windows-paths.vdf"));
    assert_eq!(
        r.paths,
        vec!["C:\\Program Files (x86)\\Steam", "C:\\Games\\SteamLibrary"]
    );
}

#[test]
fn legacy_numeric_values() {
    let r = read_library_folders(&fx("libraryfolders/legacy.vdf"));
    assert!(r.parsed);
    assert_eq!(
        r.paths,
        vec!["${FIXTURES}/scan/lib1", "${FIXTURES}/scan/lib2"]
    );
}

#[test]
fn malformed_not_parsed() {
    let r = read_library_folders(&fx("libraryfolders/malformed.vdf"));
    assert!(r.exists && !r.parsed);
    assert!(r.read_error.is_some());
    assert!(r.paths.is_empty());
}

#[test]
fn missing_file() {
    let r = read_library_folders(&fx("libraryfolders/nope.vdf"));
    assert!(!r.exists && !r.parsed);
    assert!(r.paths.is_empty());
}

#[test]
fn no_root_is_parsed_empty() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("x.vdf");
    std::fs::write(&p, "\"other\"\n{\n\"0\"\n{\n\"path\" \"/x\"\n}\n}\n").unwrap();
    let r = read_library_folders(&p);
    assert!(r.parsed);
    assert!(r.paths.is_empty());
    let _ = sub("");
}

fn lib(n: u8) -> String {
    fx(&format!("scan/lib{n}/steamapps"))
        .to_string_lossy()
        .into_owned()
}

#[test]
fn scan_collects_in_dir_then_name_order() {
    let r = scan_acfs(&[lib(1), lib(2)]);
    let got: Vec<(String, String)> = r
        .records
        .iter()
        .map(|s| {
            (
                s.steamapps_dir.rsplit('/').nth(1).unwrap().to_string(),
                s.file_name.clone(),
            )
        })
        .collect();
    let want: Vec<(String, String)> = [
        ("lib1", "appmanifest_10.acf"),
        ("lib1", "appmanifest_20.acf"),
        ("lib1", "appmanifest_abc.acf"),
        ("lib2", "appmanifest_10.acf"),
        ("lib2", "appmanifest_40.acf"),
    ]
    .iter()
    .map(|(a, b)| (a.to_string(), b.to_string()))
    .collect();
    assert_eq!(got, want);
    let abc = r
        .records
        .iter()
        .find(|s| s.file_name == "appmanifest_abc.acf")
        .unwrap();
    assert_eq!(abc.record.appid.as_deref(), Some("abc"));
}

#[test]
fn scan_skips_corrupt_and_ignores_other_files() {
    let r = scan_acfs(&[lib(1)]);
    assert_eq!(r.skipped.len(), 1);
    assert_eq!(r.skipped[0].file_name, "appmanifest_30.acf");
    assert!(r.skipped[0].reason.starts_with("parse:"), "{:?}", r.skipped);
    assert!(r.records.iter().all(|s| s.file_name != "notes.txt"));
}

#[test]
fn scan_missing_dir_is_reported() {
    let missing = fx("scan/nope/steamapps").to_string_lossy().into_owned();
    let r = scan_acfs(&[missing.clone(), lib(2)]);
    assert_eq!(r.missing_dirs, vec![missing]);
    assert_eq!(r.records.len(), 2);
}

#[test]
fn find_first_dir_wins() {
    let a = find_acf(&[lib(1), lib(2)], "10");
    assert!(a.found);
    assert_eq!(a.steamapps_dir.as_deref(), Some(lib(1).as_str()));
    let b = find_acf(&[lib(2), lib(1)], "10");
    assert_eq!(b.steamapps_dir.as_deref(), Some(lib(2).as_str()));
    assert!(b.record.is_some());
}

#[test]
fn find_corrupt_or_absent_not_found() {
    assert!(!find_acf(&[lib(1)], "30").found);
    assert!(!find_acf(&[lib(1), lib(2)], "99").found);
}

#[test]
fn find_rejects_non_numeric_ids() {
    for id in ["../10", "", "abc", "10/", "123456789012345678901"] {
        assert!(!find_acf(&[lib(1), lib(2)], id).found, "{id}");
    }
}

#[test]
fn scan_caps_directory_entries() {
    let d = tempfile::tempdir().unwrap();
    for i in 0..20_001u32 {
        std::fs::write(d.path().join(format!("f{i:05}.txt")), b"").unwrap();
    }
    let dir = d.path().to_string_lossy().into_owned();
    let r = scan_acfs(&[dir]);
    assert_eq!(r.skipped.len(), 1);
    assert_eq!(r.skipped[0].reason, "too-many-entries");
}
