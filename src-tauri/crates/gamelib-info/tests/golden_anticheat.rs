//! Anti-cheat against the TS goldens (86-04, SC1, D-10 and D-28): every case in
//! `tests/fixtures/golden/anticheat/cases.json` runs over a copy of its before-state in a FakeHome.
//! What each lookup returned and the bytes of the data file the case left must equal the TS
//! oracle's golden.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform};
use gamelib_info::http::{Http, HttpError, HttpFuture, Request};
use gamelib_info::{dispatch_sync, OPS};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 11;

/// Every case op the TS oracle drives that this file replays; a case with an op not listed here is
/// skipped (and counted against the floor).
const REPLAYED: &[&str] = &["lookup"];

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/anticheat")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// An `Http` for a case that must make no request: any call fails the case.
struct NoNetwork;

impl Http for NoNetwork {
    fn send(&self, _request: Request) -> HttpFuture<'_> {
        Box::pin(async { Err(HttpError::Network("this case makes no request".to_string())) })
    }
}

struct Profile {
    _home: FakeHome,
    user_data: PathBuf,
    ctx: InfoCtx,
}

/// A FakeHome whose `userData` (also the app folder) starts as a copy of `before`, running as
/// `platform` over `http`.
fn profile(before: &Path, platform: Platform, http: Arc<dyn Http>) -> Profile {
    let home = FakeHome::new("info-anticheat-");
    let user_data = home.root().join("userData");
    std::fs::create_dir_all(&user_data).unwrap();
    if before.is_dir() {
        for entry in std::fs::read_dir(before).unwrap() {
            let entry = entry.unwrap();
            std::fs::copy(entry.path(), user_data.join(entry.file_name())).unwrap();
        }
    }
    let ctx = InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        platform,
        InfoPaths {
            app_folder: user_data.clone(),
            user_data: user_data.clone(),
            temp: home.root().join("temp"),
            public_dir: None,
        },
        // The version the recorded TS requests carry in their User-Agent.
        "0.11.0".to_string(),
        Shutdown::new(),
        http,
    );
    Profile {
        _home: home,
        user_data,
        ctx,
    }
}

fn platform_of(case: &Value) -> Platform {
    match case["platform"].as_str().expect("case platform") {
        "mac" => Platform::Mac,
        "linux" => Platform::Linux,
        "windows" => Platform::Windows,
        other => panic!("unknown platform {other}"),
    }
}

/// Every file under `root`, name to bytes (the app folder is flat).
fn files(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut out = BTreeMap::new();
    let Ok(read) = std::fs::read_dir(root) else {
        return out;
    };
    for entry in read {
        let entry = entry.unwrap();
        out.insert(
            entry.file_name().to_string_lossy().into_owned(),
            std::fs::read(entry.path()).unwrap(),
        );
    }
    out
}

/// The TS oracle recorded a function that returned `undefined` as `{"undefined": true}`. Rust answers
/// `null` where TS answered `undefined` (D-03), so the marker is asserted as `null`.
fn golden_value(recorded: &Value) -> Value {
    if recorded == &json!({ "undefined": true }) {
        Value::Null
    } else {
        recorded.clone()
    }
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

fn replayed(case: &Value) -> bool {
    case["ops"]
        .as_array()
        .unwrap()
        .iter()
        .all(|op| REPLAYED.contains(&op["op"].as_str().unwrap_or_default()))
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
fn the_anticheat_ops_are_in_the_sorted_op_table() {
    assert!(OPS.contains(&"info_anticheat_info"));
    let mut sorted = OPS.to_vec();
    sorted.sort_unstable();
    assert_eq!(OPS, sorted.as_slice());
}

/// One lookup op of a case, through the crate's own dispatcher.
fn run_lookup(ctx: &InfoCtx, op: &Value) -> Value {
    let args = match op.get("namespace") {
        Some(namespace) => json!({ "appNamespace": namespace }),
        None => json!({}),
    };
    dispatch_sync("info_anticheat_info", &[args], ctx).expect("info_anticheat_info")
}

#[test]
fn every_lookup_case_matches_the_ts_results_and_leaves_the_file_alone() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let lookups: Vec<&Value> = cases
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| replayed(c))
        .collect();
    assert!(
        lookups.len() >= 8,
        "the oracle recorded 8 lookup cases, replayed {}",
        lookups.len()
    );
    for case in lookups {
        let id = case["id"].as_str().unwrap();
        let before = fixtures().join("state/anticheat").join(id);
        let p = profile(&before, platform_of(case), Arc::new(NoNetwork));
        let got: Vec<Value> = case["ops"]
            .as_array()
            .unwrap()
            .iter()
            .map(|op| run_lookup(&p.ctx, op))
            .collect();

        let expected = golden_dir().join("expected").join(id);
        let result = read_json(&expected.join("result.json"));
        let want: Vec<Value> = result["ops"]
            .as_array()
            .unwrap()
            .iter()
            .map(golden_value)
            .collect();
        assert_eq!(got, want, "{id}: results");
        assert_eq!(
            files(&p.user_data),
            files(&expected.join("after")),
            "{id}: the files the case left"
        );
    }
}

#[test]
fn the_undefined_marker_is_asserted_as_null() {
    assert_eq!(golden_value(&json!({ "undefined": true })), Value::Null);
    assert_eq!(golden_value(&json!(null)), Value::Null);
    assert_eq!(golden_value(&json!({ "a": 1 })), json!({ "a": 1 }));
}

/// Runs one lookup over a data file written for the test.
fn lookup_over(data: &str, namespace: &str) -> Value {
    let home = FakeHome::new("info-anticheat-shape-");
    let dir = home.root().join("userData");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("areweanticheatyet.json"), data).unwrap();
    let before = dir.clone();
    let p = profile(&before, Platform::Linux, Arc::new(NoNetwork));
    dispatch_sync(
        "info_anticheat_info",
        &[json!({ "appNamespace": namespace })],
        &p.ctx,
    )
    .unwrap()
}

#[test]
fn a_malformed_entry_in_front_of_the_match_answers_null_as_the_ts_throw_did() {
    let hit = r#"{"storeIds":{"epic":{"namespace":"abc"}}}"#;
    // Control: the same file with only well-formed entries finds the match.
    assert_eq!(
        lookup_over(&format!("[{hit}]"), "abc")["storeIds"]["epic"]["namespace"],
        "abc"
    );
    for bad in [
        "null",
        "5",
        "\"x\"",
        "[]",
        "{}",
        r#"{"storeIds":null}"#,
        r#"{"storeIds":{"epic":{"namespace":true}}}"#,
        r#"{"storeIds":{"epic":{"namespace":7}}}"#,
        r#"{"storeIds":{"epic":{"namespace":{}}}}"#,
    ] {
        assert_eq!(
            lookup_over(&format!("[{bad},{hit}]"), "abc"),
            Value::Null,
            "{bad}"
        );
    }
    // Entries the TS skipped without throwing do not stop the search.
    for skipped in [
        r#"{"storeIds":{}}"#,
        r#"{"storeIds":"x"}"#,
        r#"{"storeIds":[]}"#,
        r#"{"storeIds":{"epic":null}}"#,
        r#"{"storeIds":{"epic":"x"}}"#,
        r#"{"storeIds":{"epic":{}}}"#,
        r#"{"storeIds":{"epic":{"namespace":""}}}"#,
        r#"{"storeIds":{"epic":{"namespace":0}}}"#,
        r#"{"storeIds":{"epic":{"namespace":false}}}"#,
        r#"{"storeIds":{"epic":{"namespace":null}}}"#,
    ] {
        assert_eq!(
            lookup_over(&format!("[{skipped},{hit}]"), "abc")["storeIds"]["epic"]["namespace"],
            "abc",
            "{skipped}"
        );
    }
}

#[test]
fn a_data_file_that_is_not_an_array_answers_null() {
    for data in ["{}", "null", "5", "\"x\"", r#"{"find":1}"#] {
        assert_eq!(lookup_over(data, "abc"), Value::Null, "{data}");
    }
}

#[test]
fn the_first_matching_entry_wins_and_an_empty_argument_matches_the_first_namespace() {
    let data = r#"[
        {"id":"first","storeIds":{"epic":{"namespace":"AAA-One"}}},
        {"id":"second","storeIds":{"epic":{"namespace":"aaa-two"}}}
    ]"#;
    assert_eq!(lookup_over(data, "aaa")["id"], "first");
    assert_eq!(lookup_over(data, "two")["id"], "second");
    assert_eq!(lookup_over(data, "")["id"], "first");
}

#[test]
fn bad_lookup_args_are_rejected_with_a_fixed_literal() {
    let home = FakeHome::new("info-anticheat-args-");
    let p = profile(
        &home.root().join("none"),
        Platform::Linux,
        Arc::new(NoNetwork),
    );
    for args in [
        vec![],
        vec![json!("abc")],
        vec![json!({ "appNamespace": 1 })],
        vec![json!({ "appNamespace": "a", "extra": 1 })],
        vec![json!({}), json!({})],
    ] {
        assert_eq!(
            dispatch_sync("info_anticheat_info", &args, &p.ctx).unwrap_err(),
            "info_anticheat_info:bad-args",
            "{args:?}"
        );
    }
    let too_long = "a".repeat(1025);
    assert_eq!(
        dispatch_sync(
            "info_anticheat_info",
            &[json!({ "appNamespace": too_long })],
            &p.ctx
        )
        .unwrap_err(),
        "info_anticheat_info:bad-args"
    );
    // 1024 is the limit, not 1023.
    let at_limit = "a".repeat(1024);
    assert_eq!(
        dispatch_sync(
            "info_anticheat_info",
            &[json!({ "appNamespace": at_limit })],
            &p.ctx
        )
        .unwrap(),
        Value::Null
    );
}
