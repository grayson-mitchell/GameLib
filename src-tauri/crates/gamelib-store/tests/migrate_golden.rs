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
fn settings_global_cases_replay_byte_identical() {
    let cases: Vec<Json> = real_chain_cases()
        .into_iter()
        .filter(|c| text(c, "chain") == "settings/global")
        .collect();
    assert_eq!(cases.len(), 4, "cases.json has four settings/global cases");
    for case in &cases {
        replay(case);
    }
    println!(
        "migrate_golden: {} settings/global cases replayed",
        cases.len()
    );
}
