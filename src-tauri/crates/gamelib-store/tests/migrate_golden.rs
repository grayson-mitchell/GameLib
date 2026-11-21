//! Rust == TS golden for the real migration chains (D-12). Every `migrate` case in `cases.json` that
//! runs a real `STORE_MIGRATIONS` chain starts from `inputs/<id>.json`, is opened through
//! `engine::open_file` on a FakeHome profile, and must leave exactly the files the TS store stack left:
//! the migrated document and the pre-migration backup, byte for byte, under the same names.
//!
//! The one `migrate` case that is not a data migration (`migrate-sequence-backups-max3-newest-equal`,
//! an override chain over five boots) is replayed by `engine_golden`.

mod common;

use std::fs;

use common::*;
use gamelib_store::engine::{open_file, Flavour, OpenOutcome, StoreKind};
use gamelib_store::json::Json;
use gamelib_store::migrate::Chains;
use gamelib_store::table;
use gamelib_testutil::FakeHome;

/// The cases that run a real chain: every `migrate` case except the override-chain sequence.
fn real_chain_cases() -> Vec<Json> {
    load_cases()
        .into_iter()
        .filter(|c| text(c, "kind") == "migrate" && c.get("rounds").is_none())
        .collect()
}

fn replay(case: &Json) {
    let id = text(case, "id");
    let outcomes = load_outcomes();
    let outcome = outcomes
        .get(id)
        .unwrap_or_else(|| panic!("{id}: no outcome"));
    let (flavour, kind) = match text(case, "flavour") {
        "settings" => (Flavour::Settings, StoreKind::Settings),
        "conf" => (Flavour::Store, StoreKind::UserState),
        other => panic!("{id}: unknown flavour {other}"),
    };
    let home = FakeHome::new("gamelib-store-migrate-golden-");
    let user_data = home.root().to_path_buf();
    let path = user_data.join(text(case, "file"));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let input = golden_dir().join("inputs").join(format!("{id}.json"));
    fs::copy(&input, &path).unwrap_or_else(|e| panic!("{id}: {}: {e}", input.display()));
    let original = fs::read(&path).unwrap();

    let opened = open_file(
        &path,
        flavour,
        kind,
        text(case, "chain"),
        &Chains::baseline(),
        golden_now(),
    );
    assert!(
        matches!(opened.outcome, OpenOutcome::Migrated { .. }),
        "{id}: the chain must migrate this file, the engine said {:?}",
        opened.outcome
    );
    assert_files(id, &user_data, outcome, true);

    // The backup holds the bytes the file had before, under the oracle's name.
    let backups: Vec<String> = outcome
        .get("backups")
        .and_then(Json::as_array)
        .expect("backups")
        .iter()
        .map(|b| b.as_str().unwrap().to_string())
        .collect();
    assert_eq!(backups.len(), 1, "{id}: one backup");
    assert_eq!(fs::read(user_data.join(&backups[0])).unwrap(), original);
}

#[test]
fn every_migrate_case_replays_byte_identical() {
    let cases = real_chain_cases();
    // The sequence case is the one `migrate` case that is not a real chain.
    let total = load_cases()
        .iter()
        .filter(|c| text(c, "kind") == "migrate")
        .count();
    assert_eq!(cases.len() + 1, total, "only the sequence case is skipped");
    for case in &cases {
        replay(case);
    }
    println!(
        "migrate_golden: {} of {total} migrate cases replayed (the other, the override-chain sequence, runs in engine_golden)",
        cases.len()
    );
}

/// A library file at the current version writes nothing: the second open of a migrated file is `Ok`
/// and its bytes and mtime-independent content do not move.
#[test]
fn a_current_version_library_file_opened_twice_writes_nothing() {
    for case in real_chain_cases()
        .iter()
        .filter(|c| text(c, "flavour") == "conf" && text(c, "chain") != "settings/game")
    {
        let id = text(case, "id");
        let home = FakeHome::new("gamelib-store-migrate-twice-");
        let path = home.root().join(text(case, "file"));
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::copy(
            golden_dir().join("inputs").join(format!("{id}.json")),
            &path,
        )
        .unwrap();
        let chains = Chains::baseline();
        let chain = text(case, "chain");
        let first = open_file(
            &path,
            Flavour::Store,
            StoreKind::UserState,
            chain,
            &chains,
            golden_now(),
        );
        assert!(
            matches!(first.outcome, OpenOutcome::Migrated { .. }),
            "{id}"
        );
        let migrated = fs::read(&path).unwrap();
        let files = tree(home.root());
        for _ in 0..2 {
            let again = open_file(
                &path,
                Flavour::Store,
                StoreKind::UserState,
                chain,
                &chains,
                golden_now(),
            );
            assert_eq!(again.outcome, OpenOutcome::Ok, "{id}");
            assert_eq!(fs::read(&path).unwrap(), migrated, "{id}");
            assert_eq!(tree(home.root()), files, "{id}: no new file");
        }
    }
}

/// D-04: Phase 85 introduces no store version bump. Every chain's current version is the TS value; a
/// bump in Rust (or a chain that quietly gains a step) fails here and needs an explicit decision.
#[test]
fn chain_versions_are_pinned_to_ts() {
    let chains = Chains::baseline();
    let pinned = [
        ("settings/global", 2),
        ("settings/game", 2),
        ("store_cache/steam_library", 3),
        ("store_cache/gog_library", 3),
        ("gog_store/installed", 3),
        ("store_cache/legendary_library", 3),
        ("store_cache/nile_library", 3),
        ("sideload_apps/library", 3),
        ("store/download-manager", 3),
        ("engine/gamelib-engine-marker", 1),
        ("steam_bridge/shared-redists", 1),
    ];
    for (key, version) in pinned {
        assert_eq!(chains.current_version_of(key), version, "{key}");
    }
    // Every row of the store table: its chain's pin, else the baseline v1.
    for row in table::table() {
        let want = pinned
            .iter()
            .find(|(k, _)| Some(*k) == row.chain.as_deref())
            .map_or(1, |(_, v)| *v);
        assert_eq!(
            chains.current_version_of(row.chain_key()),
            want,
            "{}",
            row.key
        );
    }
}
