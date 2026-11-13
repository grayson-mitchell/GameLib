//! shortcuts.vdf read summary and described-mutation edits over fixtures copied to temp dirs.

use gamelib_steamfiles::shortcuts::{apply_shortcuts, read_shortcuts, EntryField, ShortcutsOp};
use std::fs;
use std::path::PathBuf;

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/shortcuts")
        .join(name)
}

/// Copy a fixture into a fresh temp dir as `shortcuts.vdf`.
fn staged(name: &str) -> (tempfile::TempDir, PathBuf) {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("shortcuts.vdf");
    fs::copy(fixture_path(name), &p).unwrap();
    (d, p)
}

fn s(key: &str, value: &str) -> EntryField {
    EntryField::Str {
        key: key.into(),
        value: value.into(),
    }
}

fn i(key: &str, value: i64) -> EntryField {
    EntryField::Int32 {
        key: key.into(),
        value,
    }
}

fn add(entry: Vec<EntryField>, create: bool) -> ShortcutsOp {
    ShortcutsOp::Add {
        entry,
        create_if_missing: create,
    }
}

// ---- read ----

#[test]
fn read_missing_path() {
    let d = tempfile::tempdir().unwrap();
    let r = read_shortcuts(&d.path().join("nope.vdf"));
    assert!(!r.exists);
    assert!(!r.parsed);
}

#[test]
fn read_empty() {
    let (_d, p) = staged("empty.vdf");
    let r = read_shortcuts(&p);
    assert!(r.exists && r.parsed && r.has_shortcuts_root && r.root_is_list);
    assert!(r.entries.is_empty());
}

#[test]
fn read_missing_exe() {
    let (_d, p) = staged("upstream/shortcuts_missing_exe.vdf");
    let r = read_shortcuts(&p);
    assert_eq!(r.entries.len(), 1);
    assert!(!r.entries[0].has_exe);
    assert!(r.entries[0].has_app_name);
}

#[test]
fn read_one_entry_values() {
    let (_d, p) = staged("one-entry.vdf");
    let r = read_shortcuts(&p);
    let e = &r.entries[0];
    assert_eq!(e.index_key, "0");
    assert_eq!(e.app_name.as_deref(), Some("Synthetic Game"));
    assert_eq!(e.exe.as_deref(), Some("\"/opt/gamelib/gamelib\""));
    assert!(e
        .launch_options
        .as_deref()
        .unwrap()
        .starts_with("--no-gui --no-sandbox"));
    assert!(e.has_app_name && e.has_exe && e.has_launch_options);
}

#[test]
fn read_sparse_indexes() {
    let (_d, p) = staged("sparse-indexes.vdf");
    let r = read_shortcuts(&p);
    assert!(r.root_is_list);
    let keys: Vec<&str> = r.entries.iter().map(|e| e.index_key.as_str()).collect();
    assert_eq!(keys, ["0", "2"]);
}

#[test]
fn read_truncated() {
    let (_d, p) = staged("truncated.vdf");
    let r = read_shortcuts(&p);
    assert!(r.exists);
    assert!(!r.parsed);
    assert!(r.read_error.is_some());
}

#[test]
fn read_no_shortcuts_root() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("shortcuts.vdf");
    fs::write(&p, b"\0other\0\x08\x08").unwrap();
    let r = read_shortcuts(&p);
    assert!(r.parsed);
    assert!(!r.has_shortcuts_root);
}
