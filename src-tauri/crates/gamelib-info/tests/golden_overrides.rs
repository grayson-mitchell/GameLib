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

/// Every case op the TS oracle drives; a case with an op not listed here fails the replay.
const REPLAYED: &[&str] = &["get", "getAll", "set", "attach"];

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
        "set" => dispatch_sync(
            "info_overrides_set",
            &[json!({ "appName": op["appName"], "overrideData": op["override"] })],
            ctx,
        ),
        "attach" => dispatch_sync(
            "info_overrides_attach",
            &[json!({ "gameInfo": op["game"] })],
            ctx,
        ),
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

/// Cases where the TS oracle rewrote the file although the map did not change. The oracle's store
/// sink applies every frame as a write, so it stamps `__internal__.gamelib.schemaVersion` onto an
/// unstamped before-file; the StoreHost never writes a `set` of the value a key already holds, so
/// Rust leaves the before-file as it was. The result, the image listing and the map are identical;
/// only the stamp differs (see `assert_no_op_rewrite`).
const NO_OP_REWRITES: &[&str] = &["set-empty-for-absent-entry-still-removes-images"];

/// The Rust file is the before-file byte for byte, and the TS golden is that file plus nothing but
/// the `__internal__` stamp.
fn assert_no_op_rewrite(
    id: &str,
    rel: &str,
    golden: &[u8],
    before: &BTreeMap<String, Vec<u8>>,
    got: &[u8],
) {
    assert!(
        before[rel] == got,
        "{id}: the StoreHost rewrote {rel} for a set that changed nothing"
    );
    let mut golden: Value = serde_json::from_slice(golden).unwrap();
    golden.as_object_mut().unwrap().remove("__internal__");
    let unstamped: Value = serde_json::from_slice(&before[rel]).unwrap();
    assert_eq!(
        golden, unstamped,
        "{id}: the TS golden differs by more than the stamp"
    );
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
    for op in [
        "info_overrides_attach",
        "info_overrides_get",
        "info_overrides_get_all",
        "info_overrides_set",
    ] {
        assert!(OPS.contains(&op), "{op}");
    }
    let mut sorted = OPS.to_vec();
    sorted.sort_unstable();
    assert_eq!(OPS, sorted.as_slice());
}

#[test]
fn every_golden_case_matches_the_ts_results_images_and_bytes() {
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
        let before = tree(&before_dir);
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
            if NO_OP_REWRITES.contains(&id) && rel.ends_with("game-overrides.json") {
                assert_no_op_rewrite(id, rel, bytes, &before, &got[rel]);
                continue;
            }
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

fn set(ctx: &InfoCtx, app_name: &str, override_data: Value) -> Result<Value, String> {
    dispatch_sync(
        "info_overrides_set",
        &[json!({ "appName": app_name, "overrideData": override_data })],
        ctx,
    )
}

fn stored_map(user_data: &Path) -> Value {
    let bytes = std::fs::read(user_data.join("store/game-overrides.json")).unwrap();
    serde_json::from_slice::<Value>(&bytes).unwrap()["overrides"].clone()
}

/// SVC-01 idempotency edge: setting the same override twice leaves the same bytes.
#[test]
fn setting_the_same_override_twice_leaves_identical_bytes() {
    let p = profile(None);
    let data = json!({ "title": "Renamed", "art_cover": "/img/a-1.png" });
    assert_eq!(set(&p.ctx, "a", data.clone()), Ok(json!(true)));
    let once = tree(&p.user_data);
    assert_eq!(set(&p.ctx, "a", data), Ok(json!(true)));
    assert_eq!(tree(&p.user_data), once, "the second set changed the file");
}

/// SVC-01 concurrency edge: two sets for different games, on separate threads against one host, are
/// each a read-modify-write of the whole map. Without the crate's Mutex one is lost to the other's
/// stale read.
#[test]
fn two_concurrent_sets_for_different_games_both_persist() {
    for round in 0..100 {
        let p = Arc::new(profile(None));
        let barrier = Arc::new(std::sync::Barrier::new(2));
        let threads: Vec<_> = ["alpha", "beta"]
            .into_iter()
            .map(|game| {
                let (p, barrier) = (Arc::clone(&p), Arc::clone(&barrier));
                std::thread::spawn(move || {
                    barrier.wait();
                    set(&p.ctx, game, json!({ "title": game }))
                })
            })
            .collect();
        for t in threads {
            assert_eq!(t.join().unwrap(), Ok(json!(true)), "round {round}");
        }
        let map = stored_map(&p.user_data);
        assert_eq!(
            map["alpha"]["title"], "alpha",
            "round {round}: a set was lost"
        );
        assert_eq!(
            map["beta"]["title"], "beta",
            "round {round}: a set was lost"
        );
    }
}

#[test]
fn many_concurrent_sets_all_land() {
    let p = Arc::new(profile(None));
    let threads: Vec<_> = (0..16)
        .map(|i| {
            let p = Arc::clone(&p);
            std::thread::spawn(move || {
                set(
                    &p.ctx,
                    &format!("g{i}"),
                    json!({ "title": format!("T{i}") }),
                )
                .unwrap();
            })
        })
        .collect();
    for t in threads {
        t.join().unwrap();
    }
    assert_eq!(stored_map(&p.user_data).as_object().unwrap().len(), 16);
}

/// T-86-19: clearing an override reaches nothing but `<appName>-*` entries of the images folder: a
/// sibling name, an unrelated file, a file named exactly like the game, and (on unix) a symlink out
/// of the folder, whose target survives.
#[test]
fn clearing_an_override_removes_only_its_own_images() {
    let before = fixtures().join("state/overrides/set-empty-removes-entry-and-images");
    let p = profile(Some(&before));
    let images = p.user_data.join("game_overrides_images");
    std::fs::write(images.join("app1"), b"exact").unwrap();
    std::fs::write(images.join("app1.png"), b"dot").unwrap();
    let outside = p.user_data.join("outside");
    std::fs::create_dir(&outside).unwrap();
    std::fs::write(outside.join("precious.txt"), b"keep").unwrap();
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&outside, images.join("app1-dirlink")).unwrap();
        std::os::unix::fs::symlink(outside.join("precious.txt"), images.join("app1-filelink"))
            .unwrap();
    }
    assert_eq!(set(&p.ctx, "app1", json!({})), Ok(json!(true)));
    assert_eq!(
        images_listing(&p.user_data),
        ["app1", "app1.png", "app1x-1.png", "other-1.png"]
    );
    assert_eq!(
        std::fs::read(outside.join("precious.txt")).unwrap(),
        b"keep"
    );
    assert!(stored_map(&p.user_data).get("app1").is_none());
}

fn images_listing(user_data: &Path) -> Vec<String> {
    images(user_data)
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n.as_str().unwrap().to_string())
        .collect()
}

/// An appName is only ever compared with directory entry names: a path-shaped one reaches nothing
/// outside the folder, and one with a glob or a separator matches only a name that really starts
/// with it.
#[test]
fn a_path_shaped_app_name_cannot_reach_beyond_the_images_folder() {
    let p = profile(None);
    let images = p.user_data.join("game_overrides_images");
    std::fs::create_dir_all(&images).unwrap();
    std::fs::write(images.join("a-1.png"), b"x").unwrap();
    let victim = p.user_data.join("victim.txt");
    std::fs::write(&victim, b"keep").unwrap();
    for name in ["../victim.txt", "..", "../", "*", "a/../..", "/"] {
        assert_eq!(set(&p.ctx, name, json!({})), Ok(json!(true)), "{name}");
    }
    assert_eq!(std::fs::read(&victim).unwrap(), b"keep");
    assert_eq!(images_listing(&p.user_data), ["a-1.png"]);
}

#[test]
fn an_unreadable_images_folder_fails_the_set_and_keeps_the_entry() {
    // A file where the folder should be: `read_dir` fails, TS's `readdirSync` threw into its catch.
    let before = fixtures().join("state/overrides/get-present");
    let p = profile(Some(&before));
    std::fs::write(p.user_data.join("game_overrides_images"), b"not a folder").unwrap();
    let bytes = tree(&p.user_data);
    assert_eq!(set(&p.ctx, "app1", json!({})), Ok(json!(false)));
    assert_eq!(tree(&p.user_data), bytes, "a failed set wrote something");
}

#[test]
fn a_corrupt_overrides_value_is_never_written_over() {
    let p = profile(None);
    std::fs::create_dir_all(p.user_data.join("store")).unwrap();
    std::fs::write(
        p.user_data.join("store/game-overrides.json"),
        br#"{"overrides":["not","a","map"]}"#,
    )
    .unwrap();
    let bytes = tree(&p.user_data);
    assert_eq!(set(&p.ctx, "a", json!({ "title": "T" })), Ok(json!(false)));
    assert_eq!(tree(&p.user_data), bytes);
    // The reads answer what the TS reads did: the stored value, and null for an entry.
    assert_eq!(
        dispatch_sync("info_overrides_get_all", &[], &p.ctx),
        Ok(json!(["not", "a", "map"]))
    );
    assert_eq!(
        dispatch_sync("info_overrides_get", &[json!({ "appName": "a" })], &p.ctx),
        Ok(Value::Null)
    );
}

#[test]
fn an_empty_string_field_is_stored_when_another_field_is_set() {
    let p = profile(None);
    assert_eq!(
        set(&p.ctx, "a", json!({ "title": "", "art_cover": "/c.png" })),
        Ok(json!(true))
    );
    assert_eq!(
        stored_map(&p.user_data)["a"],
        json!({ "title": "", "art_cover": "/c.png" })
    );
}

#[test]
fn bad_set_and_attach_args_are_rejected_with_a_fixed_literal_and_write_nothing() {
    let p = profile(None);
    for bad in [
        json!({ "appName": "a" }),
        json!({ "appName": "", "overrideData": {} }),
        json!({ "appName": "x".repeat(1025), "overrideData": {} }),
        json!({ "appName": "a", "overrideData": { "title": 1 } }),
        json!({ "appName": "a", "overrideData": { "other": "x" } }),
        json!({ "appName": "a", "overrideData": {}, "extra": 1 }),
        json!({ "appName": "a", "override": {} }),
        json!("a"),
    ] {
        assert_eq!(
            dispatch_sync("info_overrides_set", std::slice::from_ref(&bad), &p.ctx).unwrap_err(),
            "info_overrides_set:bad-args",
            "{bad}"
        );
    }
    for bad in [json!({}), json!({ "gameInfo": {}, "extra": 1 }), json!("a")] {
        assert_eq!(
            dispatch_sync("info_overrides_attach", std::slice::from_ref(&bad), &p.ctx).unwrap_err(),
            "info_overrides_attach:bad-args",
            "{bad}"
        );
    }
    assert_eq!(
        dispatch_sync("info_overrides_set", &[], &p.ctx).unwrap_err(),
        "info_overrides_set:bad-args"
    );
    assert!(tree(&p.user_data).is_empty(), "a rejected op wrote a file");
}

#[test]
fn attach_hands_back_anything_it_cannot_decorate_unchanged() {
    let before = fixtures().join("state/overrides/get-present");
    let p = profile(Some(&before));
    let attach = |game: Value| {
        dispatch_sync(
            "info_overrides_attach",
            &[json!({ "gameInfo": game })],
            &p.ctx,
        )
        .unwrap()
    };
    // No `app_name`, a non-string one, and a value that is not an object at all.
    for game in [
        json!({ "title": "T" }),
        json!({ "app_name": 7 }),
        json!([1]),
        json!(null),
    ] {
        assert_eq!(attach(game.clone()), game);
    }
    // A stored `overrides` key on the game is replaced, as the object spread does.
    let got = attach(json!({ "app_name": "app1", "overrides": { "stale": true } }));
    assert_eq!(got["overrides"], json!({ "title": "My Title" }));
}
