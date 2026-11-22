//! SteamGridDB against the TS goldens (86-07, SC1, D-10): every case in
//! `tests/fixtures/golden/steamgrid/cases.json` runs through the crate's own dispatcher over a
//! `Replay` of the recorded exchanges, which pins each request to the one the TS made (path, the
//! decoded query pairs in order, `User-Agent`, and the `Authorization` header, which the recorder
//! stores as `REDACTED`). What each op returned must equal the TS oracle's golden, and the replay
//! must finish clean: no unmatched request, no recorded exchange left over.
//!
//! The key is the string `REDACTED` in an in-memory source, never a real one.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform};
use gamelib_info::http::{Http, Replay};
use gamelib_info::secrets::{MemorySecretSource, Slot};
use gamelib_info::{dispatch_sync, OPS};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 6;

/// Every case op this file replays; a case holding an op not listed is not replayed (and counts
/// against the replayed floor below).
const REPLAYED: &[&str] = &["search"];

/// The cases the oracle recorded: at least this many must be replayed, so a stale `REPLAYED` list
/// cannot quietly skip the golden.
const REPLAYED_FLOOR: usize = 5;

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/steamgrid")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// The manifest rules every oracle suite carries: the count equals the cases, it is at or above the
/// floor, and `expected/` holds one folder per case. `Err` names the failure.
fn check_manifest(
    cases: &[Value],
    manifest: &Value,
    floor: usize,
    expected: &[String],
) -> Result<(), String> {
    if cases.len() < floor {
        return Err(format!(
            "scanned {}, below the floor of {floor}",
            cases.len()
        ));
    }
    let count = manifest["count"].as_u64().unwrap_or(0) as usize;
    if count != cases.len() {
        return Err(format!("MANIFEST count {count} != {} cases", cases.len()));
    }
    if manifest["floor"].as_u64().unwrap_or(0) < floor as u64 {
        return Err(format!("MANIFEST floor is below {floor}"));
    }
    let mut ids: Vec<String> = cases
        .iter()
        .map(|c| c["id"].as_str().unwrap_or_default().to_string())
        .collect();
    ids.sort();
    let mut have = expected.to_vec();
    have.sort();
    if ids != have {
        return Err(format!("expected/ folders {have:?} != case ids {ids:?}"));
    }
    Ok(())
}

fn expected_folders() -> Vec<String> {
    std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect()
}

#[test]
fn manifest_holds_the_floor_and_one_expected_folder_per_case() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    check_manifest(
        cases.as_array().unwrap(),
        &manifest,
        FLOOR,
        &expected_folders(),
    )
    .unwrap();
}

#[test]
fn an_empty_case_list_fails_the_manifest_guard() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let err = check_manifest(&[], &manifest, FLOOR, &[]).unwrap_err();
    assert!(err.contains("below the floor"), "{err}");
}

#[test]
fn the_steamgrid_ops_are_in_the_sorted_op_table() {
    assert!(OPS.contains(&"info_steamgrid_search"));
    let mut sorted = OPS.to_vec();
    sorted.sort_unstable();
    assert_eq!(OPS, sorted.as_slice());
}

/// A context on a FakeHome over `http`, with the in-memory key source (`REDACTED` when `with_key`,
/// the empty source otherwise).
fn ctx_over(home: &FakeHome, http: Arc<dyn Http>, with_key: bool) -> InfoCtx {
    let user_data = home.root().join("userData");
    std::fs::create_dir_all(&user_data).unwrap();
    let mut ctx = InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Linux,
        InfoPaths {
            app_folder: user_data.clone(),
            user_data,
            temp: home.root().join("temp"),
            public_dir: None,
        },
        // The version the recorded TS requests carry in their User-Agent.
        "0.11.0".to_string(),
        Shutdown::new(),
        http,
    );
    ctx.secrets = Some(Arc::new(if with_key {
        MemorySecretSource::with(Slot::SteamGridDb, "REDACTED")
    } else {
        MemorySecretSource::new()
    }));
    ctx
}

/// One case op through the dispatcher, as the TS oracle's `{ ok }` / `{ error }` record.
fn run_op(ctx: &InfoCtx, op: &Value, first_search_id: &mut Option<u64>) -> Value {
    let result = match op["op"].as_str().unwrap() {
        "search" => {
            let found = dispatch_sync(
                "info_steamgrid_search",
                &[json!({ "query": op["query"] })],
                ctx,
            );
            if let Ok(list) = &found {
                *first_search_id = list.get(0).and_then(|g| g["id"].as_u64());
            }
            found
        }
        kind @ ("grids" | "heroes") => {
            let game_id = if op["gameIdFromSearch"] == json!(true) {
                json!(first_search_id)
            } else {
                op["gameId"].clone()
            };
            let mut args = json!({ "gameId": game_id });
            for field in ["styles", "dimensions"] {
                if let Some(list) = op.get(field) {
                    args[field] = list.clone();
                }
            }
            dispatch_sync(&format!("info_steamgrid_{kind}"), &[args], ctx)
        }
        other => panic!("unknown op {other}"),
    };
    match result {
        Ok(value) => json!({ "ok": value }),
        Err(message) => json!({ "error": message }),
    }
}

fn replayed(case: &Value) -> bool {
    case["ops"]
        .as_array()
        .unwrap()
        .iter()
        .all(|op| REPLAYED.contains(&op["op"].as_str().unwrap_or_default()))
}

#[test]
fn every_case_matches_the_ts_results_and_makes_exactly_the_recorded_requests() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let cases: Vec<&Value> = cases
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| replayed(c))
        .collect();
    assert!(
        cases.len() >= REPLAYED_FLOOR,
        "replayed {} cases, below {REPLAYED_FLOOR}",
        cases.len()
    );
    for case in cases {
        let id = case["id"].as_str().unwrap();
        let replay = Arc::new(
            Replay::from_case(&fixtures().join("recorded/steamgrid").join(id))
                .unwrap_or_else(|e| panic!("{id}: {e}")),
        );
        let home = FakeHome::new("info-steamgrid-");
        let ctx = ctx_over(&home, replay.clone(), case["key"] == json!("set"));
        let mut first = None;
        let got: Vec<Value> = case["ops"]
            .as_array()
            .unwrap()
            .iter()
            .map(|op| run_op(&ctx, op, &mut first))
            .collect();
        let want = read_json(&golden_dir().join("expected").join(id).join("result.json"));
        assert_eq!(
            Value::Array(got),
            want["ops"],
            "{id}: results differ from the TS golden"
        );
        replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));
    }
}

#[test]
fn a_changed_request_is_caught_by_the_replay_pin() {
    // The 401 case recorded `Authorization` and the Heroic-style User-Agent. A different version
    // changes the User-Agent, which the replay pins: the op fails and the replay finishes unclean.
    let id = "synthetic-search-401-rethrows";
    let replay =
        Arc::new(Replay::from_case(&fixtures().join("recorded/steamgrid").join(id)).unwrap());
    let home = FakeHome::new("info-steamgrid-pin-");
    let mut ctx = ctx_over(&home, replay.clone(), true);
    ctx.app_version = "9.9.9".to_string();
    let result = dispatch_sync(
        "info_steamgrid_search",
        &[json!({ "query": "Celeste" })],
        &ctx,
    );
    assert!(result.is_err());
    let report = replay.finish().unwrap_err();
    assert!(report.to_lowercase().contains("user-agent"), "{report}");
    assert!(!report.contains("Bearer"), "{report}");
}
