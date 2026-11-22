//! Per-game overrides against the TS goldens (86-04, SC2 and D-18): every case in
//! `tests/fixtures/golden/overrides/cases.json` runs over a copy of its before-state in a FakeHome.
//! What each op returned, the image folder listing, and the bytes of every file the case left must
//! equal the TS oracle's golden.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform};
use gamelib_info::http::ReqwestHttp;
use gamelib_info::{dispatch_sync, OPS};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 9;

/// The case ops this build replays. `set` and `attach` join in the plan's second task.
const REPLAYED: &[&str] = &["get", "getAll"];

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

struct Profile {
    _home: FakeHome,
    user_data: PathBuf,
    ctx: InfoCtx,
}

/// A FakeHome whose `userData` starts as a copy of `before` (or empty when there is no such folder).
fn profile(before: Option<&Path>) -> Profile {
    let home = FakeHome::new("info-overrides-");
    let user_data = home.root().join("userData");
    std::fs::create_dir_all(&user_data).unwrap();
    if let Some(before) = before.filter(|p| p.is_dir()) {
        copy_tree(before, &user_data);
    }
    let ctx = InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Linux,
        InfoPaths {
            app_folder: user_data.clone(),
            user_data: user_data.clone(),
            temp: home.root().join("temp"),
            public_dir: None,
        },
        "0.0.0-test".to_string(),
        Shutdown::new(),
        Arc::new(ReqwestHttp::new()),
    );
    Profile {
        _home: home,
        user_data,
        ctx,
    }
}

fn copy_tree(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), target).unwrap();
        }
    }
}

/// Every file under `root`, as relative path (with `/`) to bytes.
fn tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(dir: &Path, root: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        let Ok(read) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in read {
            let entry = entry.unwrap();
            let path = entry.path();
            if entry.file_type().unwrap().is_dir() {
                walk(&path, root, out);
            } else {
                let rel = path
                    .strip_prefix(root)
                    .unwrap()
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join("/");
                out.insert(rel, std::fs::read(&path).unwrap());
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, root, &mut out);
    out
}

/// The sorted listing of `<userData>/game_overrides_images`, `None` when there is no such folder
/// (the TS oracle's `images`).
fn images(user_data: &Path) -> Value {
    let dir = user_data.join("game_overrides_images");
    let Ok(read) = std::fs::read_dir(&dir) else {
        return Value::Null;
    };
    let mut names: Vec<String> = read
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    json!(names)
}

/// Runs one op of a case through the crate's own dispatcher (the entry the shell uses) and returns
/// what the TS function returned.
fn run_op(ctx: &InfoCtx, op: &Value) -> Result<Value, String> {
    match op["op"].as_str().expect("case op") {
        "get" => dispatch_sync(
            "info_overrides_get",
            &[json!({ "appName": op["appName"] })],
            ctx,
        ),
        "getAll" => dispatch_sync("info_overrides_get_all", &[], ctx),
        other => panic!("unknown case op {other}"),
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

fn golden_dir() -> PathBuf {
    fixtures().join("golden/overrides")
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
fn the_override_ops_are_in_the_sorted_op_table() {
    assert!(OPS.contains(&"info_overrides_get"));
    assert!(OPS.contains(&"info_overrides_get_all"));
    let mut sorted = OPS.to_vec();
    sorted.sort_unstable();
    assert_eq!(OPS, sorted.as_slice());
}

#[test]
fn every_replayed_golden_case_matches_the_ts_results_images_and_bytes() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let cases: Vec<&Value> = cases
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| replayed(c))
        .collect();
    assert!(!cases.is_empty(), "no cases replayed");
    for case in cases {
        let id = case["id"].as_str().unwrap();
        let before_dir = fixtures().join("state/overrides").join(id);
        let p = profile(Some(&before_dir));
        let got_results: Vec<Value> = case["ops"]
            .as_array()
            .unwrap()
            .iter()
            .map(|op| run_op(&p.ctx, op).unwrap_or_else(|e| panic!("{id}: {e}")))
            .collect();
        let expected = golden_dir().join("expected").join(id);

        let result = read_json(&expected.join("result.json"));
        assert_eq!(json!(got_results), result["ops"], "{id}: results");
        assert_eq!(images(&p.user_data), result["images"], "{id}: images");

        // The bytes of every file the case left, whole-file.
        let want = tree(&expected.join("after"));
        let got = tree(&p.user_data);
        assert_eq!(
            got.keys().collect::<Vec<_>>(),
            want.keys().collect::<Vec<_>>(),
            "{id}: files left behind"
        );
        for (rel, bytes) in &want {
            assert!(
                got[rel] == *bytes,
                "{id}: {rel} differs from the TS golden\n--- want\n{}\n--- got\n{}",
                String::from_utf8_lossy(bytes),
                String::from_utf8_lossy(&got[rel])
            );
        }
    }
}

#[test]
fn a_read_never_writes_the_store() {
    let before = fixtures().join("state/overrides/get-present");
    let p = profile(Some(&before));
    let bytes = tree(&p.user_data);
    dispatch_sync("info_overrides_get_all", &[], &p.ctx).unwrap();
    dispatch_sync(
        "info_overrides_get",
        &[json!({ "appName": "app2" })],
        &p.ctx,
    )
    .unwrap();
    assert_eq!(tree(&p.user_data), bytes);
}

#[test]
fn bad_read_args_are_rejected_with_a_fixed_literal() {
    let p = profile(None);
    for bad in [
        json!({}),
        json!({ "appName": 1 }),
        json!({ "appName": "a", "x": 1 }),
        json!("a"),
    ] {
        assert_eq!(
            dispatch_sync("info_overrides_get", &[bad], &p.ctx).unwrap_err(),
            "info_overrides_get:bad-args"
        );
    }
    assert_eq!(
        dispatch_sync("info_overrides_get", &[], &p.ctx).unwrap_err(),
        "info_overrides_get:bad-args"
    );
    assert_eq!(
        dispatch_sync("info_overrides_get_all", &[json!({})], &p.ctx).unwrap_err(),
        "info_overrides_get_all:bad-args"
    );
    assert!(tree(&p.user_data).is_empty(), "a rejected op wrote a file");
}
