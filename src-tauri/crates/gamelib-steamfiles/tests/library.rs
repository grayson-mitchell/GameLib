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
