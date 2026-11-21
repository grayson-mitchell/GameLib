//! Rust == TS golden for the version engine (D-12) and the deliberate D-18 divergence. Every
//! `engine` case in `cases.json` is opened through `engine::open_file` on a FakeHome profile, its
//! ops are replayed, and (for oracle cases) the files, backups, reads and refused ops must equal
//! what the TS store stack recorded. The four `tsOnly` corrupt cases are held to the D-18 contract
//! instead: the bytes are kept, copied aside, and the store opens read-only or empty.

mod common;

use std::fs;

use common::*;
use gamelib_store::engine::{open_file, Flavour, OpenOutcome, ReadOnlyReason, StoreKind};
use gamelib_store::json::{Json, Obj};
use gamelib_store::migrate::{Chains, Step};
use gamelib_testutil::FakeHome;

fn kind_of(decl: &Decl) -> StoreKind {
    match decl.kind.as_str() {
        "cache" => StoreKind::Cache,
        "user-state" => StoreKind::UserState,
        other => panic!("unknown store kind {other}"),
    }
}

/// `{ id, to, identity?, setTop?, deleteTop?, throws? }` steps, as the oracle built them: set the
/// top-level keys, then delete the listed ones.
fn steps_of(list: &Json) -> Vec<Step> {
    list.as_array()
        .expect("steps is an array")
        .iter()
        .map(|s| {
            let id = text(s, "id").to_string();
            let to = u32::try_from(as_u64(s.get("to").expect("to"))).expect("version");
            if s.get("identity").and_then(Json::as_bool) == Some(true) {
                return Step::identity(id, to);
            }
            let throws = s.get("throws").and_then(Json::as_bool) == Some(true);
            let set: Obj = match s.get("setTop") {
                Some(Json::Obj(o)) => o.clone(),
                _ => Obj::new(),
            };
            let delete: Vec<String> = s
                .get("deleteTop")
                .and_then(Json::as_array)
                .unwrap_or(&[])
                .iter()
                .map(|k| k.as_str().expect("key").to_string())
                .collect();
            Step::new(id.clone(), to, move |doc| {
                if throws {
                    return Err(format!("oracle step {id} fails"));
                }
                if let Json::Obj(o) = doc {
                    for (k, v) in set.iter() {
                        o.insert_js(k.clone(), v.clone());
                    }
                    for k in &delete {
                        o.remove(k);
                    }
                }
                Ok(())
            })
        })
        .collect()
}

fn chains_for(case: &Json, key: &str) -> Chains {
    match case.get("steps") {
        Some(list) => Chains::baseline().with_override(key, steps_of(list)),
        None => Chains::baseline(),
    }
}

fn path_matches(expect: &str, outcome: &OpenOutcome, kind: StoreKind) -> bool {
    match (expect, outcome) {
        ("identity", OpenOutcome::Adopted) => true,
        ("current", OpenOutcome::Ok) => true,
        (
            "newer",
            OpenOutcome::ReadOnly {
                reason: ReadOnlyReason::Newer,
                ..
            },
        ) => true,
        ("migrates", OpenOutcome::Migrated { .. }) => true,
        (
            "failed",
            OpenOutcome::ReadOnly {
                reason: ReadOnlyReason::Failed,
                ..
            },
        ) => true,
        ("cacheChainDeletes", OpenOutcome::CacheDiscarded) => true,
        // D-18: a corrupt file is kept; a cache then starts empty, everything else is read-only.
        ("corrupt", OpenOutcome::StartEmpty { .. }) => kind == StoreKind::Cache,
        (
            "corrupt",
            OpenOutcome::ReadOnly {
                reason: ReadOnlyReason::Failed,
                ..
            },
        ) => kind != StoreKind::Cache,
        _ => false,
    }
}

#[test]
fn every_engine_case_decides_the_way_ts_did() {
    let outcomes = load_outcomes();
    let (mut oracle, mut ts_only) = (0, 0);
    for case in load_cases().iter().filter(|c| text(c, "kind") == "engine") {
        let id = text(case, "id");
        let decl = decl_of(case);
        let kind = kind_of(&decl);
        let outcome = outcomes
            .get(id)
            .unwrap_or_else(|| panic!("{id}: no outcome"));
        let home = FakeHome::new("gamelib-store-engine-golden-");
        let user_data = home.root().to_path_buf();
        let path = decl.path(&user_data);
        let initial = opt_text(case, "initial").expect("engine cases start from a file");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, initial).unwrap();

        let chains = chains_for(case, &decl.chain_key());
        let opened = open_file(
            &path,
            Flavour::Store,
            kind,
            &decl.chain_key(),
            &chains,
            golden_now(),
        );
        let expect = text(case, "expectPath");
        assert!(
            path_matches(expect, &opened.outcome, kind),
            "{id}: expected path {expect}, engine said {:?}",
            opened.outcome
        );

        let read_only = matches!(opened.outcome, OpenOutcome::ReadOnly { .. });
        let view = if decl.failed_view_empty && read_only {
            empty_obj()
        } else {
            opened.view.clone()
        };
        let mut replay = Replay {
            path: path.clone(),
            doc: view,
            version: opened.version,
            read_only,
            dot_paths: decl.dot_paths,
            reads: Vec::new(),
            threw: Vec::new(),
        };
        replay.run(case.get("ops").and_then(Json::as_array).expect("ops"));

        if opt_text(case, "oracle") == Some("tsOnly") {
            ts_only += 1;
            assert!(
                case.get("divergenceNote").is_some(),
                "{id}: tsOnly needs its note"
            );
            // D-18: the copy holds the original bytes whatever the store did afterwards.
            let copies: Vec<_> = tree(&user_data)
                .into_iter()
                .filter(|f| f.contains(".corrupt."))
                .collect();
            assert_eq!(
                copies.len(),
                1,
                "{id}: exactly one corrupt copy, got {copies:?}"
            );
            assert_eq!(
                fs::read(user_data.join(&copies[0])).unwrap(),
                initial.as_bytes(),
                "{id}: the copy is byte-equal to the corrupt file"
            );
            if kind == StoreKind::Cache {
                // The cache continued empty and the first write replaced the file, copy intact.
                assert_ne!(fs::read(&path).unwrap(), initial.as_bytes(), "{id}");
            } else {
                assert_eq!(
                    fs::read(&path).unwrap(),
                    initial.as_bytes(),
                    "{id}: original kept"
                );
            }
            continue;
        }

        oracle += 1;
        assert_eq!(replay.reads, expected_reads(outcome), "{id}: reads differ");
        assert_eq!(
            replay.threw,
            expected_threw(outcome),
            "{id}: refused ops differ"
        );
        assert_files(id, &user_data, outcome, true);
        let backups_on_disk: Vec<_> = tree(&user_data)
            .into_iter()
            .filter(|f| f.contains(".bak.json"))
            .collect();
        let backups_expected: Vec<String> = outcome
            .get("backups")
            .and_then(Json::as_array)
            .unwrap_or(&[])
            .iter()
            .map(|b| b.as_str().unwrap().to_string())
            .collect();
        assert_eq!(backups_on_disk, backups_expected, "{id}: backups differ");
    }
    println!("engine_golden: {oracle} oracle cases and {ts_only} tsOnly cases replayed");
    assert_eq!(ts_only, 4, "the four D-18 corrupt cases");
    assert_eq!(oracle + ts_only, 14, "cases.json has 14 engine cases");
}

/// The migrate case that is not a data migration: five boots, each with a longer chain, the last
/// one reseeded with the newest backup's own bytes (the newest-equal skip). Backups rotate to 3.
#[test]
fn backup_rotation_keeps_three_and_skips_an_equal_newest() {
    let outcomes = load_outcomes();
    let case = load_cases()
        .into_iter()
        .find(|c| text(c, "id") == "migrate-sequence-backups-max3-newest-equal")
        .expect("the rotation case is in cases.json");
    let id = text(&case, "id");
    let outcome = outcomes.get(id).unwrap();
    let decl = decl_of(&case);
    let home = FakeHome::new("gamelib-store-rotation-");
    let user_data = home.root().to_path_buf();
    let path = decl.path(&user_data);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, opt_text(&case, "initial").unwrap()).unwrap();

    let rounds = case.get("rounds").and_then(Json::as_array).expect("rounds");
    let want_rounds = outcome
        .get("rounds")
        .and_then(Json::as_array)
        .expect("outcome rounds");
    assert_eq!(rounds.len(), want_rounds.len());
    for (n, round) in rounds.iter().enumerate() {
        if opt_text(round, "reseed") == Some("newestBackup") {
            let newest = tree(&user_data)
                .into_iter()
                .filter(|f| f.contains(".bak.json"))
                .max()
                .expect("a backup to reseed from");
            let bytes = fs::read(user_data.join(newest)).unwrap();
            fs::write(&path, bytes).unwrap();
        }
        let chains = Chains::baseline().with_override(
            &decl.chain_key(),
            steps_of(round.get("steps").expect("round steps")),
        );
        let now = parse_iso(text(round, "at"));
        let opened = open_file(
            &path,
            Flavour::Store,
            StoreKind::UserState,
            &decl.chain_key(),
            &chains,
            now,
        );
        assert!(
            matches!(opened.outcome, OpenOutcome::Migrated { .. }),
            "round {n}: {:?}",
            opened.outcome
        );
        let on_disk: Vec<String> = tree(&user_data)
            .into_iter()
            .filter(|f| f.contains(".bak.json"))
            .collect();
        let want: Vec<String> = want_rounds[n]
            .get("backups")
            .and_then(Json::as_array)
            .unwrap()
            .iter()
            .map(|b| b.as_str().unwrap().to_string())
            .collect();
        assert_eq!(on_disk, want, "round {n}: backups differ");
    }
    assert_files(id, &user_data, outcome, true);
}
