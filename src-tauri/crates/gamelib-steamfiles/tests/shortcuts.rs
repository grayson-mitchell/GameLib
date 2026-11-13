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

// ---- apply ----

fn bytes(p: &PathBuf) -> Vec<u8> {
    fs::read(p).unwrap()
}

fn no_tmp(p: &PathBuf) {
    assert!(!p.with_file_name("shortcuts.vdf.tmp").exists());
}

fn names(p: &PathBuf) -> Vec<(String, Option<String>)> {
    read_shortcuts(p)
        .entries
        .into_iter()
        .map(|e| (e.index_key, e.app_name))
        .collect()
}

#[test]
fn add_creates_missing_file() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("shortcuts.vdf");
    let r = apply_shortcuts(&p, &add(vec![s("AppName", "A")], true));
    assert!(r.written);
    assert_eq!(r.index_key.as_deref(), Some("0"));
    assert_eq!(
        bytes(&p),
        b"\0shortcuts\0\x000\0\x01AppName\0A\0\x08\x08\x08"
    );
    no_tmp(&p);
}

#[test]
fn add_missing_without_create() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("shortcuts.vdf");
    let r = apply_shortcuts(&p, &add(vec![s("AppName", "A")], false));
    assert!(!r.written);
    assert_eq!(r.read_error.as_deref(), Some("missing"));
    assert!(!p.exists());
}

#[test]
fn add_appends_and_preserves_prefix() {
    let (_d, p) = staged("two-entries.vdf");
    let before = bytes(&p);
    let r = apply_shortcuts(&p, &add(vec![s("AppName", "New"), i("appid", 5)], false));
    assert!(r.written);
    assert_eq!(r.index_key.as_deref(), Some("2"));
    let after = bytes(&p);
    // Everything before the closing `\x08\x08` of the original is a prefix of the new file.
    let prefix = &before[..before.len() - 2];
    assert!(after.starts_with(prefix));
    no_tmp(&p);
}

#[test]
fn add_on_sparse_uses_max_plus_one() {
    let (_d, p) = staged("sparse-indexes.vdf");
    let r = apply_shortcuts(&p, &add(vec![s("AppName", "New")], false));
    assert_eq!(r.index_key.as_deref(), Some("3"));
    let keys: Vec<String> = names(&p).into_iter().map(|(k, _)| k).collect();
    assert_eq!(keys, ["0", "2", "3"]);
}

#[test]
fn add_duplicate_name_is_noop() {
    let (_d, p) = staged("one-entry.vdf");
    let before = bytes(&p);
    let r = apply_shortcuts(&p, &add(vec![s("AppName", "Synthetic Game")], false));
    assert!(!r.written);
    assert!(r.already_present);
    assert_eq!(r.index_key.as_deref(), Some("0"));
    assert_eq!(bytes(&p), before);
}

#[test]
fn remove_first_match_and_rekey() {
    let (_d, p) = staged("two-entries.vdf");
    let first = read_shortcuts(&p).entries[0].clone();
    let r = apply_shortcuts(
        &p,
        &ShortcutsOp::Remove {
            app_name: first.app_name.clone().unwrap(),
        },
    );
    assert!(r.written && r.matched);
    assert_eq!(r.removed_app_name, first.app_name);
    assert_eq!(r.removed_exe, first.exe);
    let after = read_shortcuts(&p);
    assert_eq!(after.entries.len(), 1);
    assert_eq!(after.entries[0].index_key, "0");
    no_tmp(&p);
}

#[test]
fn remove_absent_name() {
    let (_d, p) = staged("two-entries.vdf");
    let before = bytes(&p);
    let r = apply_shortcuts(
        &p,
        &ShortcutsOp::Remove {
            app_name: "no such".into(),
        },
    );
    assert!(!r.written && !r.matched);
    assert_eq!(bytes(&p), before);
}

#[test]
fn remove_requires_exact_name() {
    let (_d, p) = staged("one-entry.vdf");
    let before = bytes(&p);
    let r = apply_shortcuts(
        &p,
        &ShortcutsOp::Remove {
            app_name: "synthetic game".into(),
        },
    );
    assert!(!r.matched);
    assert_eq!(bytes(&p), before);
}

#[test]
fn update_changes_only_that_field() {
    let (_d, p) = staged("one-entry.vdf");
    let before = bytes(&p);
    let r = apply_shortcuts(
        &p,
        &ShortcutsOp::Update {
            app_name: "Synthetic Game".into(),
            fields: vec![s("LaunchOptions", "--x")],
        },
    );
    assert!(r.written && r.matched);
    let after = bytes(&p);
    let old = read_shortcuts(&staged("one-entry.vdf").1).entries[0]
        .launch_options
        .clone()
        .unwrap();
    assert_eq!(
        after.len() as isize - before.len() as isize,
        "--x".len() as isize - old.len() as isize
    );
    assert_eq!(
        read_shortcuts(&p).entries[0].launch_options.as_deref(),
        Some("--x")
    );
    // Prefix up to LaunchOptions value is identical.
    let at = before
        .windows(14)
        .position(|w| w == b"LaunchOptions\0")
        .unwrap();
    assert_eq!(&after[..at], &before[..at]);
}

#[test]
fn update_appends_missing_field() {
    let (_d, p) = staged("one-entry.vdf");
    let r = apply_shortcuts(
        &p,
        &ShortcutsOp::Update {
            app_name: "Synthetic Game".into(),
            fields: vec![s("Extra", "v")],
        },
    );
    assert!(r.written);
    assert!(bytes(&p).windows(6).any(|w| w == b"Extra\0"));
}

#[test]
fn update_absent_name() {
    let (_d, p) = staged("one-entry.vdf");
    let before = bytes(&p);
    let r = apply_shortcuts(
        &p,
        &ShortcutsOp::Update {
            app_name: "zzz".into(),
            fields: vec![s("Exe", "x")],
        },
    );
    assert!(!r.written && !r.matched);
    assert_eq!(bytes(&p), before);
}

#[test]
fn update_keeps_unknown_type_nodes() {
    let (_d, p) = staged("unknown-type.vdf");
    let before = bytes(&p);
    let r = apply_shortcuts(
        &p,
        &ShortcutsOp::Update {
            app_name: "Unknown Types".into(),
            fields: vec![s("Exe", "\"/bin/false\"")],
        },
    );
    assert!(r.written);
    let after = bytes(&p);
    let start = before
        .windows(9)
        .position(|w| w == b"\x07BigField")
        .unwrap();
    let end = before.windows(4).position(|w| w == b"\x01Exe").unwrap();
    assert!(after.windows(end - start).any(|w| w == &before[start..end]));
}

#[test]
fn truncated_refuses_every_op() {
    for op in [
        add(vec![s("AppName", "A")], true),
        ShortcutsOp::Update {
            app_name: "A".into(),
            fields: vec![],
        },
        ShortcutsOp::Remove {
            app_name: "A".into(),
        },
    ] {
        let (_d, p) = staged("truncated.vdf");
        let before = bytes(&p);
        let r = apply_shortcuts(&p, &op);
        assert!(!r.written);
        assert!(r.read_error.is_some());
        assert_eq!(bytes(&p), before);
        no_tmp(&p);
    }
}

#[test]
fn refuses_missing_root_and_non_list() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("shortcuts.vdf");
    fs::write(&p, b"\0other\0\x08\x08").unwrap();
    let r = apply_shortcuts(&p, &add(vec![s("AppName", "A")], false));
    assert!(!r.written);
    assert_eq!(r.read_error.as_deref(), Some("no-shortcuts-root"));
    fs::write(&p, b"\0shortcuts\0\x01name\0v\0\x08\x08").unwrap();
    let r = apply_shortcuts(&p, &add(vec![s("AppName", "A")], false));
    assert!(!r.written);
    assert_eq!(r.read_error.as_deref(), Some("not-list"));
}

#[test]
fn int32_range_checks() {
    let (_d, p) = staged("one-entry.vdf");
    let before = bytes(&p);
    for bad in [i64::from(u32::MAX) + 1, i64::from(i32::MIN) - 1] {
        let r = apply_shortcuts(&p, &add(vec![s("AppName", "B"), i("appid", bad)], false));
        assert!(!r.written);
        assert_eq!(r.read_error.as_deref(), Some("bad-int32"));
    }
    assert_eq!(bytes(&p), before);
}

#[test]
fn u32_int32_stored_as_bit_pattern() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("shortcuts.vdf");
    let r = apply_shortcuts(&p, &add(vec![i("appid", 0xFFFF_FFFE)], true));
    assert!(r.written);
    assert!(bytes(&p)
        .windows(10)
        .any(|w| w == b"\x02appid\0\xFE\xFF\xFF\xFF"));
}

#[test]
fn op_json_shape() {
    let op: ShortcutsOp = serde_json::from_str(
        r#"{"op":"add","createIfMissing":true,"entry":[{"kind":"string","key":"AppName","value":"A"}]}"#,
    )
    .unwrap();
    assert_eq!(op, add(vec![s("AppName", "A")], true));
    assert!(serde_json::from_str::<ShortcutsOp>(r#"{"op":"remove","appName":"A","x":1}"#).is_err());
}
