//! The real-file corpus (Phase 85 D-09, `tests/fixtures/corpus`) through the Rust engine.
//!
//! `MANIFEST.json` lists every file with its `expect`: the outcome the engine must produce. This is
//! where SC1 and SC2 are proven on real bytes: a `roundtrip` file opens without a single byte
//! written (a no-op boot) and re-serialises to its exact bytes (so an unknown key at the current
//! version survives), a corrupt file is kept and copied aside, a newer file is never rewritten.
//! A `migrate` entry is an OLDER-version file: the strip deletes undeclared keys by design behind a
//! backup, so `older_versions_match_ts_oracle` asserts parity with what the real TS chains wrote for
//! the same input (`corpus-expected/`, from the oracle), while `current_version_preserves_unknown_keys`
//! asserts the opposite for a CURRENT-version file. The test cannot pass vacuously: it fails below the
//! manifest's floor and when an `expect` value or a table key has no entry.

mod common;

use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use gamelib_store::atomic::{write_atomic, Durability};
use gamelib_store::engine::{open_file, Flavour, OpenOutcome, Opened, ReadOnlyReason};
use gamelib_store::envelope::{settings_version, stamp_for_write, store_version};
use gamelib_store::json::{parse, to_settings_bytes, to_store_bytes, Json};
use gamelib_store::migrate::Chains;
use gamelib_store::ops::{apply, Op};
use gamelib_store::table::{row_for_key, Family, TableRow};
use gamelib_testutil::FakeHome;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
struct Entry {
    path: String,
    sha256: Option<String>,
    source: String,
    flavour: String,
    expect: String,
    #[serde(rename = "tableKey")]
    table_key: String,
    note: Option<String>,
}

#[derive(Deserialize)]
struct Manifest {
    floor: usize,
    files: Vec<Entry>,
}

fn corpus_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/corpus")
}

fn manifest() -> Manifest {
    let bytes = fs::read(corpus_dir().join("MANIFEST.json")).expect("MANIFEST.json");
    serde_json::from_slice(&bytes).expect("MANIFEST.json parses")
}

/// The real chains: settings 2, game 2 and the seven library chains 3 (pinned in `migrate_golden`).
fn chains() -> Chains {
    Chains::baseline()
}

fn now() -> SystemTime {
    UNIX_EPOCH + Duration::from_secs(1_795_251_600)
}

/// An entry that stands for a file on disk (the manifest-only `missing` entry has no hash).
fn has_file(e: &Entry) -> bool {
    e.sha256.is_some()
}

fn row_of(e: &Entry) -> &'static TableRow {
    row_for_key(&e.table_key)
        .unwrap_or_else(|| panic!("{}: no table row for {}", e.path, e.table_key))
}

/// The family Rust opens through the engine; `native` and `excluded` rows are never opened.
fn openable(row: &TableRow) -> bool {
    row.store_kind().is_some()
}

/// A corpus file copied into a fresh profile, mtime set far in the past so any rewrite shows.
struct Staged {
    _home: FakeHome,
    profile: PathBuf,
    path: PathBuf,
}

fn old() -> SystemTime {
    UNIX_EPOCH + Duration::from_secs(86_400)
}

fn stage(e: &Entry) -> Staged {
    let home = FakeHome::new("gamelib-store-corpus-");
    let profile = home.root().join("profile");
    // `<source>/<path inside the profile>`: the first component names the source, not a directory.
    let rel = e.path.split_once('/').map_or(e.path.as_str(), |(_, r)| r);
    let path = profile.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    if has_file(e) {
        fs::copy(corpus_dir().join(&e.path), &path).unwrap();
        File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_modified(old())
            .unwrap();
    }
    Staged {
        _home: home,
        profile,
        path,
    }
}

fn open(s: &Staged, row: &TableRow) -> Opened {
    open_file(
        &s.path,
        row.flavour,
        row.store_kind().expect("an openable row"),
        row.chain_key(),
        &chains(),
        now(),
    )
}

/// Every file under the profile with its bytes and mtime: what a no-op boot must leave alone.
fn snapshot(root: &Path) -> BTreeMap<String, (Vec<u8>, SystemTime)> {
    fn walk(dir: &Path, prefix: &str, out: &mut BTreeMap<String, (Vec<u8>, SystemTime)>) {
        for e in fs::read_dir(dir).unwrap().flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let rel = if prefix.is_empty() {
                name
            } else {
                format!("{prefix}/{name}")
            };
            if e.path().is_dir() {
                walk(&e.path(), &rel, out);
            } else {
                let mtime = e.metadata().unwrap().modified().unwrap();
                out.insert(rel, (fs::read(e.path()).unwrap(), mtime));
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, "", &mut out);
    out
}

fn files_of(m: &Manifest) -> Vec<&Entry> {
    m.files.iter().filter(|e| has_file(e)).collect()
}

fn is_semantic_only(e: &Entry) -> bool {
    e.note
        .as_deref()
        .is_some_and(|n| n.starts_with("semantic roundtrip"))
}

#[test]
fn manifest_is_complete() {
    let m = manifest();
    let files = files_of(&m);
    println!(
        "corpus: {} files on disk, manifest floor {}",
        files.len(),
        m.floor
    );
    assert!(
        files.len() >= m.floor,
        "the corpus has {} files, the manifest floor is {}",
        files.len(),
        m.floor
    );
    for e in &files {
        assert!(
            corpus_dir().join(&e.path).is_file(),
            "{} is listed but missing",
            e.path
        );
    }
    let seen: BTreeSet<&str> = m.files.iter().map(|e| e.expect.as_str()).collect();
    for want in [
        "roundtrip",
        "migrate",
        "readOnly-failed",
        "readOnly-newer",
        "startEmpty",
        "missing",
    ] {
        assert!(seen.contains(want), "no manifest entry expects {want}");
    }
    let sources: BTreeSet<&str> = m.files.iter().map(|e| e.source.as_str()).collect();
    for want in ["operator", "backup", "v0.8", "v0.9", "v0.10", "edge"] {
        assert!(sources.contains(want), "no manifest entry from {want}");
    }
    for e in &m.files {
        row_of(e); // every table key resolves
        let flavour = if row_of(e).flavour == Flavour::Settings {
            "settings"
        } else {
            "store"
        };
        assert_eq!(
            e.flavour, flavour,
            "{}: manifest and table disagree on the flavour",
            e.path
        );
    }
}

#[test]
fn roundtrip_is_byte_identical() {
    let m = manifest();
    let (mut opened, mut skipped) = (0, 0);
    for e in files_of(&m).into_iter().filter(|e| e.expect == "roundtrip") {
        let row = row_of(e);
        if !openable(row) {
            skipped += 1;
            assert!(
                matches!(row.family, Family::Excluded | Family::Native),
                "{}: only native and excluded rows are skipped",
                e.path
            );
            continue;
        }
        if is_semantic_only(e) {
            continue; // crlf_edge_roundtrips_semantically_only
        }
        let s = stage(e);
        let original = fs::read(&s.path).unwrap();
        let o = open(&s, row);
        assert!(
            matches!(o.outcome, OpenOutcome::Ok | OpenOutcome::Adopted),
            "{}: {:?}",
            e.path,
            o.outcome
        );
        assert_eq!(
            fs::read(&s.path).unwrap(),
            original,
            "{}: the open rewrote the file",
            e.path
        );
        // The view carries the envelope as the file had it, so printing it gives the file back.
        let printed = if e.flavour == "settings" {
            to_settings_bytes(&o.view)
        } else {
            to_store_bytes(&o.view)
        };
        // A file one of the tagged releases wrote may be laid out in that release's own way; the
        // content must still be the same document.
        if e.source.starts_with("v0.") {
            assert_eq!(
                parse(&printed).unwrap(),
                parse(&original).unwrap(),
                "{}",
                e.path
            );
        } else {
            assert_eq!(
                String::from_utf8_lossy(&printed),
                String::from_utf8_lossy(&original),
                "{}: re-serialising changed the bytes",
                e.path
            );
        }
        opened += 1;
    }
    println!("corpus roundtrip: {opened} files opened, {skipped} native or excluded skipped");
    assert!(opened >= 60, "only {opened} roundtrip files were exercised");
}

/// The CRLF fixture is valid JSON that TS never wrote: opening it is a no-op, and the document is
/// the same after a re-serialisation, but its bytes are not (a real write rewrites it with LF).
#[test]
fn crlf_edge_roundtrips_semantically_only() {
    let m = manifest();
    let e = m
        .files
        .iter()
        .find(|e| is_semantic_only(e))
        .expect("the manifest has a semantic-only roundtrip entry");
    let s = stage(e);
    let original = fs::read(&s.path).unwrap();
    assert!(
        original.windows(2).any(|w| w == b"\r\n"),
        "the fixture has CRLF line breaks"
    );
    let o = open(&s, row_of(e));
    assert!(
        matches!(o.outcome, OpenOutcome::Ok | OpenOutcome::Adopted),
        "{:?}",
        o.outcome
    );
    assert_eq!(fs::read(&s.path).unwrap(), original);
    let printed = to_store_bytes(&o.view);
    assert_ne!(printed, original);
    assert_eq!(parse(&printed).unwrap(), o.view);
}

#[test]
fn noop_open_writes_nothing() {
    let m = manifest();
    let mut checked = 0;
    for e in files_of(&m).into_iter().filter(|e| e.expect == "roundtrip") {
        let row = row_of(e);
        if !openable(row) {
            continue;
        }
        let s = stage(e);
        let before = snapshot(&s.profile);
        for round in 1..=2 {
            open(&s, row);
            assert_eq!(
                snapshot(&s.profile),
                before,
                "{}: open #{round} changed the profile (a no-op boot must write nothing)",
                e.path
            );
        }
        checked += 1;
    }
    println!("corpus no-op boots: {checked} files opened twice, nothing written");
    assert!(checked >= 60);
}

/// SC1, CURRENT-version files: a file with keys no schema declares keeps them through a read-write
/// cycle. (An older-version file is the opposite case: its strip removes them, see
/// `older_versions_match_ts_oracle`.)
#[test]
fn current_version_preserves_unknown_keys() {
    let m = manifest();
    let e = m
        .files
        .iter()
        .find(|e| e.path.ends_with("edge_unknown_keys.json"))
        .expect("edge_unknown_keys.json is in the manifest");
    let row = row_of(e);
    let s = stage(e);
    let original = parse(&fs::read(&s.path).unwrap()).unwrap();
    let mut o = open(&s, row);
    assert!(
        matches!(o.outcome, OpenOutcome::Ok | OpenOutcome::Adopted),
        "{:?}",
        o.outcome
    );
    let op = Op::Set {
        key: "added.by.a.write".to_string(),
        value: Json::Bool(true),
    };
    assert_eq!(apply(&mut o.view, &op, row.dot_paths), Ok(true));
    let stamped = stamp_for_write(&o.view, o.version);
    write_atomic(&s.path, &to_store_bytes(&stamped), Durability::Unsynced).unwrap();
    let after = parse(&fs::read(&s.path).unwrap()).unwrap();
    let before_obj = original.as_object().unwrap();
    for (k, v) in before_obj
        .iter()
        .filter(|(k, _)| k.as_str() != "__internal__")
    {
        assert_eq!(after.get(k), Some(v), "key {k} did not survive the write");
    }
    assert!(
        after.get("added.by.a.write").is_none(),
        "the dotted key was split into a path"
    );
    assert!(after.get("added").and_then(|a| a.get("by")).is_some());
}

#[test]
fn outcomes_match_manifest() {
    let m = manifest();
    let mut seen: BTreeMap<&str, usize> = BTreeMap::new();
    for e in &m.files {
        let row = row_of(e);
        match e.expect.as_str() {
            "roundtrip" | "migrate" => continue, // above, and migrate_entries_have_a_pending_chain
            "missing" => {
                assert!(!has_file(e));
                let s = stage(e);
                let o = open(&s, row);
                assert_eq!(o.outcome, OpenOutcome::Missing, "{}", e.path);
                assert!(
                    !s.path.exists(),
                    "{}: opening a missing file created it",
                    e.path
                );
                assert!(
                    snapshot(&s.profile).is_empty(),
                    "{}: something was created",
                    e.path
                );
            }
            "readOnly-failed" | "readOnly-newer" | "startEmpty" => {
                assert!(openable(row), "{}", e.path);
                let s = stage(e);
                let original = fs::read(&s.path).unwrap();
                let o = open(&s, row);
                match (e.expect.as_str(), &o.outcome) {
                    (
                        "readOnly-failed",
                        OpenOutcome::ReadOnly {
                            reason: ReadOnlyReason::Failed,
                            ..
                        },
                    )
                    | (
                        "readOnly-newer",
                        OpenOutcome::ReadOnly {
                            reason: ReadOnlyReason::Newer,
                            ..
                        },
                    )
                    | ("startEmpty", OpenOutcome::StartEmpty { .. }) => {}
                    (want, got) => panic!("{}: expected {want}, the engine said {got:?}", e.path),
                }
                assert_eq!(
                    fs::read(&s.path).unwrap(),
                    original,
                    "{}: the original bytes changed",
                    e.path
                );
                let copies: Vec<PathBuf> = fs::read_dir(s.path.parent().unwrap())
                    .unwrap()
                    .flatten()
                    .map(|d| d.path())
                    .filter(|p| p.to_string_lossy().contains(".corrupt."))
                    .collect();
                if e.expect == "readOnly-newer" {
                    assert!(copies.is_empty(), "{}: a newer file is not corrupt", e.path);
                } else {
                    assert_eq!(copies.len(), 1, "{}: exactly one corrupt copy", e.path);
                    assert_eq!(
                        fs::read(&copies[0]).unwrap(),
                        original,
                        "{}: the copy is byte-equal",
                        e.path
                    );
                }
                if let OpenOutcome::StartEmpty { copy } = &o.outcome {
                    assert!(
                        copy.is_file(),
                        "{}: StartEmpty before the copy exists",
                        e.path
                    );
                }
            }
            other => panic!("{}: unknown expect {other}", e.path),
        }
        *seen
            .entry(match e.expect.as_str() {
                "missing" => "missing",
                "readOnly-failed" => "readOnly-failed",
                "readOnly-newer" => "readOnly-newer",
                _ => "startEmpty",
            })
            .or_default() += 1;
    }
    println!("corpus outcomes: {seen:?}");
    for want in ["missing", "readOnly-failed", "readOnly-newer", "startEmpty"] {
        assert!(
            seen.get(want).copied().unwrap_or(0) >= 1,
            "no {want} entry was checked"
        );
    }
}

/// Where the engine finds the file of a table row, relative to the profile (the same placement the
/// TS oracle used): the entry's corpus path can be a captured backup's name, which is not a store name.
fn placement(row: &TableRow) -> String {
    match row.key.as_str() {
        "settings/global" => "config.json".to_string(),
        "settings/game" => "GamesConfig/app.json".to_string(),
        _ => format!(
            "{}/{}.json",
            row.dir,
            row.name.as_deref().expect("a named row")
        ),
    }
}

#[derive(Deserialize)]
struct OracleOutcome {
    path: String,
    result: String,
    backups: Vec<String>,
}

fn oracle_outcomes() -> Vec<OracleOutcome> {
    let bytes = fs::read(corpus_expected_dir().join("outcomes.json"))
        .expect("corpus-expected/outcomes.json (regenerate with GAMELIB_WRITE_STORE_GOLDEN=1)");
    serde_json::from_slice(&bytes).expect("outcomes.json parses")
}

fn corpus_expected_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/corpus-expected")
}

/// A `migrate` entry is an OLDER-version file. Opened through the real Rust chains it is `Migrated`,
/// writes a backup holding the original bytes, and its migrated bytes (and the backup's name) equal
/// what the real TS chains produced for the same input. The strip deletes undeclared keys by design,
/// so parity with the oracle, not preservation, is the claim for these files.
#[test]
fn older_versions_match_ts_oracle() {
    let m = manifest();
    let oracle = oracle_outcomes();
    let entries: Vec<&Entry> = files_of(&m)
        .into_iter()
        .filter(|e| e.expect == "migrate")
        .collect();
    assert_eq!(
        oracle.iter().map(|o| o.path.as_str()).collect::<Vec<_>>(),
        entries.iter().map(|e| e.path.as_str()).collect::<Vec<_>>(),
        "outcomes.json lists exactly the manifest migrate entries"
    );
    assert!(
        entries.len() >= 60,
        "only {} migrate entries",
        entries.len()
    );
    let mut by_chain: BTreeMap<&str, usize> = BTreeMap::new();
    for (e, want) in entries.iter().zip(&oracle) {
        let row = row_of(e);
        let home = FakeHome::new("gamelib-store-corpus-migrate-");
        let profile = home.root().join("profile");
        let rel = placement(row);
        let path = profile.join(&rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let original = fs::read(corpus_dir().join(&e.path)).unwrap();
        fs::write(&path, &original).unwrap();

        let opened = open_file(
            &path,
            row.flavour,
            row.store_kind().expect("an openable row"),
            row.chain_key(),
            &chains(),
            common::golden_now(),
        );
        let got = common::tree(&profile);
        match (want.result.as_str(), &opened.outcome) {
            ("migrated", OpenOutcome::Migrated { .. }) => {
                let expected = fs::read(corpus_expected_dir().join(&e.path))
                    .unwrap_or_else(|err| panic!("{}: corpus-expected: {err}", e.path));
                assert_eq!(
                    String::from_utf8_lossy(&fs::read(&path).unwrap()),
                    String::from_utf8_lossy(&expected),
                    "{}: migrated bytes differ from the TS oracle",
                    e.path
                );
                assert_eq!(fs::read(&path).unwrap(), expected, "{}", e.path);
                assert_eq!(want.backups.len(), 1, "{}", e.path);
                assert_eq!(
                    fs::read(profile.join(&want.backups[0])).unwrap(),
                    original,
                    "{}: the backup holds the original bytes",
                    e.path
                );
            }
            ("discarded", OpenOutcome::CacheDiscarded) => {
                assert!(
                    !path.exists(),
                    "{}: a discarded cache keeps no file",
                    e.path
                );
            }
            (result, outcome) => {
                panic!(
                    "{}: TS said {result}, the Rust engine said {outcome:?}",
                    e.path
                )
            }
        }
        let mut want_files: BTreeSet<String> = want.backups.iter().cloned().collect();
        if want.result == "migrated" {
            want_files.insert(rel);
        }
        assert_eq!(got, want_files, "{}: file set differs from TS", e.path);
        *by_chain.entry(e.table_key.as_str()).or_default() += 1;
    }
    println!("corpus older versions: {by_chain:?}");
    for key in [
        "settings/global",
        "settings/game",
        "store_cache/steam_library",
        "store_cache/gog_library",
        "gog_store/installed",
        "store_cache/legendary_library",
        "store_cache/nile_library",
        "sideload_apps/library",
        "store/download-manager",
    ] {
        assert!(
            by_chain.get(key).copied().unwrap_or(0) >= 1,
            "no corpus entry exercises the {key} chain"
        );
    }
}

/// The classification the engine makes before it runs a step: every `migrate` entry's stored version
/// is below its chain's current version and has a non-identity step pending.
#[test]
fn migrate_entries_have_a_pending_chain() {
    let m = manifest();
    let chains = chains();
    let mut n = 0;
    for e in files_of(&m).into_iter().filter(|e| e.expect == "migrate") {
        let row = row_of(e);
        let doc = parse(&fs::read(corpus_dir().join(&e.path)).unwrap())
            .unwrap_or_else(|err| panic!("{}: {err}", e.path));
        let version = if row.flavour == Flavour::Settings {
            settings_version(&doc)
        } else {
            store_version(&doc)
        };
        let current = chains.current_version_of(row.chain_key());
        assert!(
            version < current,
            "{}: v{version} is not below the chain's v{current}",
            e.path
        );
        assert!(
            chains
                .pending(row.chain_key(), version)
                .iter()
                .any(|s| !s.identity),
            "{}: no non-identity step is pending",
            e.path
        );
        n += 1;
    }
    println!("corpus migrate: {n} entries have a pending chain");
    assert!(n >= 60, "only {n} migrate entries were classified");
}
