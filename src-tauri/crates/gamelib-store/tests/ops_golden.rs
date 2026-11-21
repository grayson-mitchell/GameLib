//! Rust == TS golden for the store's write shape (D-05). Every `ops` case in `cases.json` is replayed
//! through `ops::apply` and the envelope stamp on a FakeHome profile; the file it leaves behind and
//! every read it makes must equal what the TS store stack recorded (`expected/<id>/`, `outcomes.json`).
//! Every `settingsDoc` case's expected file is the settings flavour of its `data`.

mod common;

use std::fs;

use common::*;
use gamelib_store::engine::{open_file, Flavour, OpenOutcome, StoreKind};
use gamelib_store::envelope::{store_version, strip_envelope};
use gamelib_store::json::{parse, to_settings_bytes, Json};
use gamelib_store::migrate::Chains;
use gamelib_testutil::FakeHome;

/// Every `ops` case, replayed with the store at the baseline version 1 (no `ops` case declares
/// steps, so the TS chain was the implicit baseline).
#[test]
fn every_ops_case_writes_the_bytes_ts_wrote() {
    let outcomes = load_outcomes();
    let mut replayed = 0;
    for case in load_cases().iter().filter(|c| text(c, "kind") == "ops") {
        let id = text(case, "id");
        let decl = decl_of(case);
        let outcome = outcomes
            .get(id)
            .unwrap_or_else(|| panic!("{id}: no outcome"));
        let home = FakeHome::new("gamelib-store-ops-");
        let user_data = home.root().to_path_buf();
        let path = decl.path(&user_data);

        let doc = match opt_text(case, "initial") {
            Some(initial) => {
                fs::create_dir_all(path.parent().unwrap()).unwrap();
                fs::write(&path, initial).unwrap();
                parse(initial.as_bytes()).unwrap_or_else(|e| panic!("{id}: initial: {e}"))
            }
            None => empty_obj(),
        };
        let mut replay = Replay {
            path,
            doc,
            version: 1,
            read_only: false,
            dot_paths: decl.dot_paths,
            reads: Vec::new(),
            threw: Vec::new(),
        };
        let ops = case.get("ops").and_then(Json::as_array).expect("ops");
        replay.run(ops);

        assert_eq!(replay.reads, expected_reads(outcome), "{id}: reads differ");
        assert_eq!(
            replay.threw,
            expected_threw(outcome),
            "{id}: refused ops differ"
        );
        assert_files(id, &user_data, outcome, true);
        // Reads never expose the envelope: whatever a dump shows, its stripped view has none.
        assert!(
            strip_envelope(&replay.doc).get("__internal__").is_none(),
            "{id}: strip_envelope left the envelope"
        );
        replayed += 1;
    }
    let in_cases = load_cases()
        .iter()
        .filter(|c| text(c, "kind") == "ops")
        .count();
    println!("ops_golden: replayed {replayed} ops cases (cases.json has {in_cases})");
    assert_eq!(replayed, in_cases);
    assert!(replayed >= 16, "the ops cases shrank to {replayed}");
}

/// Every `settingsDoc` case: the document `writeSettingsFile` printed is the settings flavour of
/// `data`. A newer file (`ensure`) is refused, so its bytes stay as they were.
#[test]
fn every_settings_doc_case_writes_the_bytes_ts_wrote() {
    let outcomes = load_outcomes();
    let mut replayed = 0;
    for case in load_cases()
        .iter()
        .filter(|c| text(c, "kind") == "settingsDoc")
    {
        let id = text(case, "id");
        let outcome = outcomes
            .get(id)
            .unwrap_or_else(|| panic!("{id}: no outcome"));
        let is_game = text(case, "doc") == "game";
        let rel = if is_game {
            format!("GamesConfig/{}.json", text(case, "appName"))
        } else {
            "config.json".to_string()
        };
        let home = FakeHome::new("gamelib-store-settings-");
        let user_data = home.root().to_path_buf();
        let path = user_data.join(&rel);
        if let Some(initial) = opt_text(case, "initial") {
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, initial).unwrap();
        }

        // `ensureSettingsMigrated` opens the file through the engine, and `writeSettingsFile` then
        // refuses to write a read-only (here: newer) document.
        let refused = case.get("ensure").and_then(Json::as_bool) == Some(true) && {
            let chain = if is_game {
                "settings/game"
            } else {
                "settings/global"
            };
            let opened = open_file(
                &path,
                Flavour::Settings,
                StoreKind::Settings,
                chain,
                &Chains::baseline(),
                golden_now(),
            );
            matches!(opened.outcome, OpenOutcome::ReadOnly { .. })
        };
        if !refused {
            let data = case.get("data").expect("settingsDoc has data");
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            gamelib_store::atomic::write_atomic(
                &path,
                &to_settings_bytes(data),
                gamelib_store::atomic::Durability::Synced,
            )
            .unwrap();
        }

        // `ensure` runs the real settings chain in TS, which this plan has not ported (85-08 does),
        // so only the settings file itself is compared here, not the backups that chain leaves.
        let want = fs::read(golden_dir().join("expected").join(id).join(&rel)).unwrap();
        assert_eq!(
            String::from_utf8_lossy(&fs::read(&path).unwrap()),
            String::from_utf8_lossy(&want),
            "{id}: {rel} differs"
        );
        assert!(outcome.get("files").is_some());
        replayed += 1;
    }
    let in_cases = load_cases()
        .iter()
        .filter(|c| text(c, "kind") == "settingsDoc")
        .count();
    println!("ops_golden: replayed {replayed} settingsDoc cases (cases.json has {in_cases})");
    assert_eq!(replayed, in_cases);
    assert!(replayed >= 7);
}

#[test]
fn the_store_version_of_every_ops_initial_file_is_a_baseline_one_or_unstamped() {
    for case in load_cases().iter().filter(|c| text(c, "kind") == "ops") {
        if let Some(initial) = opt_text(case, "initial") {
            let v = store_version(&parse(initial.as_bytes()).unwrap());
            assert!(v <= 1, "{}: initial file is v{v}", text(case, "id"));
        }
    }
}
