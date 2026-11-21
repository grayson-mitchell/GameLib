//! Every file the TS store stack left in the golden parses and re-serialises byte-identical (D-05).
//!
//! The tree under `tests/fixtures/golden/expected` is what the real TS store (conf over
//! `store_backend.ts`, the versioning engine, `writeSettingsFile`) wrote for each case. The Rust
//! parser and writers must reproduce those bytes without ever seeing the TS code.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use gamelib_store::json::{parse, to_compact_bytes, to_settings_bytes, to_store_bytes};

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden")
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("read_dir {}: {e}", dir.display()))
        .flatten()
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let p = e.path();
        if p.is_dir() {
            walk(&p, out);
        } else {
            out.push(p);
        }
    }
}

/// Every `(case id, relative path)` pair `outcomes.json` says the case left behind, rounds included.
fn recorded_files() -> BTreeSet<(String, String)> {
    let text = fs::read_to_string(golden_dir().join("outcomes.json")).unwrap();
    let outcomes: serde_json::Value = serde_json::from_str(&text).unwrap();
    let mut pairs = BTreeSet::new();
    for case in outcomes.as_array().unwrap() {
        let id = case["id"].as_str().unwrap().to_string();
        for f in case["files"].as_array().into_iter().flatten() {
            pairs.insert((id.clone(), f.as_str().unwrap().to_string()));
        }
    }
    pairs
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Flavour {
    Store,
    Settings,
    Compact,
}

fn write(f: Flavour, bytes: &[u8]) -> Vec<u8> {
    let v = parse(bytes).unwrap_or_else(|e| panic!("parse: {e}"));
    match f {
        Flavour::Store => to_store_bytes(&v),
        Flavour::Settings => to_settings_bytes(&v),
        Flavour::Compact => to_compact_bytes(&v),
    }
}

#[test]
fn every_golden_expected_file_round_trips_byte_identical() {
    let root = golden_dir().join("expected");
    let mut files = Vec::new();
    walk(&root, &mut files);

    let recorded = recorded_files();
    assert!(
        files.len() >= recorded.len(),
        "the walk found {} files but outcomes.json records {}",
        files.len(),
        recorded.len()
    );
    for (id, rel) in &recorded {
        assert!(
            root.join(id).join(rel).is_file(),
            "outcomes.json records {id}/{rel} but it is missing from expected/"
        );
    }

    let mut matched = [0usize; 3];
    let mut backups = 0usize;
    let mut failures = Vec::new();
    for path in &files {
        let rel = path.strip_prefix(&root).unwrap();
        let rel_s = rel.to_string_lossy().replace('\\', "/");
        let bytes = fs::read(path).unwrap();
        let name = path.file_name().unwrap().to_string_lossy();

        if name.contains(".bak.") {
            // A backup holds the bytes the file had BEFORE the migration, in whatever layout the
            // older release or the hand-written input used. It must parse, and the store's own
            // output for it must parse back to the same document.
            backups += 1;
            let v = parse(&bytes).unwrap_or_else(|e| panic!("{rel_s}: {e}"));
            let again = parse(&to_store_bytes(&v)).unwrap();
            assert_eq!(
                again, v,
                "{rel_s}: a re-serialised backup parses back differently"
            );
            continue;
        }

        // A settings document is two-space; a migration rewrite goes through the engine and is
        // tab-indented until the next write; an untouched input stays whatever it was (compact).
        let is_settings_doc = rel_s
            .split('/')
            .nth(1)
            .is_some_and(|p| p == "config.json" || p == "GamesConfig");
        let order: &[Flavour] = if is_settings_doc {
            &[Flavour::Settings, Flavour::Store, Flavour::Compact]
        } else {
            &[Flavour::Store, Flavour::Compact]
        };
        let hit = order.iter().find(|f| write(**f, &bytes) == bytes);
        match hit {
            Some(Flavour::Store) => matched[0] += 1,
            Some(Flavour::Settings) => matched[1] += 1,
            Some(Flavour::Compact) => matched[2] += 1,
            None => failures.push(rel_s),
        }
    }

    println!(
        "golden: {} files ({} backups); round-tripped store={} settings={} compact={}",
        files.len(),
        backups,
        matched[0],
        matched[1],
        matched[2]
    );
    assert!(
        failures.is_empty(),
        "not byte-identical in any flavour: {failures:#?}"
    );
    assert!(
        matched.iter().all(|n| *n > 0),
        "a flavour was never exercised: {matched:?}"
    );
}
