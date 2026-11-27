//! Recent games against the TS goldens (86-04, SC3 and D-18): every case in
//! `tests/fixtures/golden/recent/cases.json` runs over a copy of its before-state in a FakeHome,
//! and the bytes of every file it left must equal the TS oracle's `after/` tree, and the sink must
//! have seen exactly the payloads the TS `recentGamesChanged` push carried. Three cases are not TS
//! recordings and are hand-derived instead: `sixty-entry-list` (the 50-entry cap, quick 261123-bax,
//! operator ruling 2026-11-23, because the TS original never trimmed), and
//! `add-over-empty-appname-entry` and `remove-keeps-empty-appname-entry` (the keep rule, quick
//! 261127-wem: the TS filter dropped an entry with an empty appName). The TS oracle was deleted in
//! 86-24; their notes in cases.json say so.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform};
use gamelib_info::http::ReqwestHttp;
use gamelib_info::recent::{self, RecentSink};
use gamelib_info::{dispatch_sync, OPS};
use gamelib_store::host::StoreHost;
use gamelib_store::json::Json;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 9;

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// Records every list the sink is told about.
#[derive(Default)]
struct Recording(Mutex<Vec<Value>>);

impl RecentSink for Recording {
    fn changed(&self, list: &Json) {
        self.0.lock().unwrap().push(list.to_value());
    }
}

struct Profile {
    _home: FakeHome,
    user_data: PathBuf,
    ctx: InfoCtx,
    sink: Arc<Recording>,
}

/// A FakeHome whose `userData` starts as a copy of `before` (or empty when there is no such folder).
fn profile(before: Option<&Path>) -> Profile {
    let home = FakeHome::new("info-recent-");
    let user_data = home.root().join("userData");
    std::fs::create_dir_all(&user_data).unwrap();
    if let Some(before) = before.filter(|p| p.is_dir()) {
        copy_tree(before, &user_data);
    }
    let sink = Arc::new(Recording::default());
    let mut ctx = InfoCtx::new(
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
    ctx.recent_sink = Some(Arc::clone(&sink) as Arc<dyn RecentSink>);
    Profile {
        _home: home,
        user_data,
        ctx,
        sink,
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

/// Runs one op of a case through the crate's own dispatcher (the entry the shell uses).
fn run_op(ctx: &InfoCtx, op: &Value) -> Result<Value, String> {
    match op["op"].as_str().expect("case op") {
        "add" => {
            let game = &op["game"];
            dispatch_sync(
                "info_recent_add",
                &[json!({
                    "appName": game["app_name"],
                    "title": game["title"],
                    "runner": game["runner"],
                })],
                ctx,
            )
        }
        "remove" => dispatch_sync(
            "info_recent_remove",
            &[json!({ "appName": op["appName"] })],
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

/// Cases where the TS oracle rewrote the file although the list did not change. The oracle's store
/// sink applies every frame as a write, so it stamps `__internal__.gamelib.schemaVersion` onto an
/// unstamped before-file; the StoreHost (the writer in the app since Phase 85) never writes a `set`
/// of the value a key already holds. The effect on the list, the sink payloads and the write count
/// is identical; only the stamp differs, and a file that is already stamped is byte-identical
/// either way. See `assert_no_op_rewrite`.
const NO_OP_REWRITES: &[&str] = &["remove-absent-game"];

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
    fixtures().join("golden/recent")
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
fn the_recent_ops_are_in_the_sorted_op_table() {
    assert!(OPS.contains(&"info_recent_add"));
    assert!(OPS.contains(&"info_recent_remove"));
    let mut sorted = OPS.to_vec();
    sorted.sort_unstable();
    assert_eq!(OPS, sorted.as_slice());
}

#[test]
fn every_golden_case_matches_the_ts_bytes_and_payloads() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let cases = cases.as_array().unwrap();
    assert!(cases.len() >= FLOOR, "no cases scanned");
    for case in cases {
        let id = case["id"].as_str().unwrap();
        let before_dir = fixtures().join("state/recent").join(id);
        let before = tree(&before_dir);
        let p = profile(Some(&before_dir));
        for op in case["ops"].as_array().unwrap() {
            run_op(&p.ctx, op).unwrap_or_else(|e| panic!("{id}: {e}"));
        }
        let expected = golden_dir().join("expected").join(id);

        // The bytes of every file the case left, whole-file.
        let want = tree(&expected.join("after"));
        let got = tree(&p.user_data);
        assert_eq!(
            got.keys().collect::<Vec<_>>(),
            want.keys().collect::<Vec<_>>(),
            "{id}: files left behind"
        );
        for (rel, bytes) in &want {
            if NO_OP_REWRITES.contains(&id) {
                assert_no_op_rewrite(id, rel, bytes, &before, &got[rel]);
            } else {
                assert!(
                    got[rel] == *bytes,
                    "{id}: {rel} differs from the TS golden\n--- want\n{}\n--- got\n{}",
                    String::from_utf8_lossy(bytes),
                    String::from_utf8_lossy(&got[rel])
                );
            }
        }

        // The payloads the TS `recentGamesChanged` push carried.
        let events: Vec<Value> = read_json(&expected.join("events.json"))
            .as_array()
            .unwrap()
            .iter()
            .map(|e| {
                assert_eq!(e["channel"], "recentGamesChanged", "{id}");
                e["args"][0].clone()
            })
            .collect();
        let seen = p.sink.0.lock().unwrap().clone();
        assert_eq!(seen, events, "{id}: sink payloads");

        // The returned list and the number of writes.
        let result = read_json(&expected.join("result.json"));
        let recent = recent::list(&p.ctx).unwrap().to_value();
        assert_eq!(recent, result["recent"], "{id}: list");
        assert_eq!(
            seen.len() as u64,
            result["writes"].as_u64().unwrap(),
            "{id}: writes"
        );
    }
}

#[test]
fn adding_the_same_game_twice_leaves_one_entry_and_identical_bytes() {
    let p = profile(None);
    let add = json!({ "appName": "app1", "title": "Game 1", "runner": "gog" });
    dispatch_sync("info_recent_add", std::slice::from_ref(&add), &p.ctx).unwrap();
    let once = tree(&p.user_data);
    dispatch_sync("info_recent_add", &[add], &p.ctx).unwrap();
    assert_eq!(tree(&p.user_data), once, "the second add changed the file");
    let list = recent::list(&p.ctx).unwrap().to_value();
    assert_eq!(list.as_array().unwrap().len(), 1);
    assert_eq!(list[0]["appName"], "app1");
}

/// Adds `g0..g{n-1}` through the dispatcher, so the list ends newest first: `g{n-1}..g0`.
fn seed(ctx: &InfoCtx, n: usize) {
    for i in 0..n {
        let add =
            json!({ "appName": format!("g{i}"), "title": format!("Game {i}"), "runner": "gog" });
        dispatch_sync("info_recent_add", &[add], ctx).unwrap();
    }
}

/// The `appName`s of the stored list, newest first.
fn names(ctx: &InfoCtx) -> Vec<String> {
    recent::list(ctx)
        .unwrap()
        .to_value()
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["appName"].as_str().unwrap().to_string())
        .collect()
}

fn add_new(ctx: &InfoCtx) {
    let add = json!({ "appName": "new", "title": "New", "runner": "gog" });
    dispatch_sync("info_recent_add", &[add], ctx).unwrap();
}

/// Quick 261123-bax (trim on add only): 50 plus a new game keeps 50 and drops the oldest, in the
/// list, in the sink payload and on disk.
#[test]
fn a_full_list_plus_a_new_game_keeps_fifty_and_drops_the_oldest() {
    let p = profile(None);
    seed(&p.ctx, 50);
    let mut want: Vec<String> = (0..50).rev().map(|i| format!("g{i}")).collect();
    assert_eq!(names(&p.ctx), want);
    add_new(&p.ctx);
    want.pop();
    want.insert(0, "new".to_string());
    assert_eq!(want.len(), 50);
    assert_eq!(names(&p.ctx), want);
    assert!(!names(&p.ctx).contains(&"g0".to_string()));
    let last = p.sink.0.lock().unwrap().last().unwrap().clone();
    assert_eq!(last, recent::list(&p.ctx).unwrap().to_value());
    let disk = read_json(&p.user_data.join("store/config.json"));
    assert_eq!(disk["games"]["recent"].as_array().unwrap().len(), 50);
    assert_eq!(disk["games"]["recent"][0]["appName"], "new");
}

/// Quick 261123-bax (trim on add only): re-adding a game already in a full list drops no other entry.
#[test]
fn re_adding_a_game_in_a_full_list_drops_no_other_entry() {
    let p = profile(None);
    seed(&p.ctx, 50);
    let mut set_before = names(&p.ctx);
    set_before.sort();

    let readd = json!({ "appName": "g10", "title": "Game 10", "runner": "gog" });
    dispatch_sync("info_recent_add", &[readd], &p.ctx).unwrap();
    let mut want: Vec<String> = vec!["g10".to_string()];
    want.extend((11..50).rev().map(|i| format!("g{i}")));
    want.extend((0..10).rev().map(|i| format!("g{i}")));
    assert_eq!(names(&p.ctx), want);
    let mut set_after = names(&p.ctx);
    set_after.sort();
    assert_eq!(set_after, set_before);

    let readd = json!({ "appName": "g0", "title": "Game 0", "runner": "gog" });
    dispatch_sync("info_recent_add", &[readd], &p.ctx).unwrap();
    let now = names(&p.ctx);
    assert_eq!(now.len(), 50);
    assert_eq!(now[0], "g0");
    let mut set_after = now;
    set_after.sort();
    assert_eq!(set_after, set_before);
}

/// Quick 261123-bax (trim on add only): below the cap nothing is dropped.
#[test]
fn an_add_below_the_cap_drops_nothing() {
    let p = profile(None);
    seed(&p.ctx, 49);
    add_new(&p.ctx);
    let now = names(&p.ctx);
    assert_eq!(now.len(), 50);
    assert_eq!(now[0], "new");
    assert_eq!(now[49], "g0");
}

/// Quick 261123-bax (trim on add only): `list` and `remove` never trim an oversized stored list; the
/// next add does.
#[test]
fn list_and_remove_leave_an_oversized_list_untrimmed_until_the_next_add() {
    let before_dir = fixtures().join("state/recent/sixty-entry-list");
    let p = profile(Some(&before_dir));
    assert_eq!(names(&p.ctx).len(), 60);
    assert_eq!(tree(&p.user_data), tree(&before_dir), "list wrote");
    assert!(p.sink.0.lock().unwrap().is_empty(), "list told the sink");

    dispatch_sync(
        "info_recent_remove",
        &[json!({ "appName": "app130" })],
        &p.ctx,
    )
    .unwrap();
    assert_eq!(names(&p.ctx).len(), 59);
    {
        let seen = p.sink.0.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].as_array().unwrap().len(), 59);
    }

    let add = json!({ "appName": "app1", "title": "Game 1", "runner": "sideload" });
    dispatch_sync("info_recent_add", &[add], &p.ctx).unwrap();
    let now = names(&p.ctx);
    assert_eq!(now.len(), 50);
    assert_eq!(now[0], "app1");
    let seen = p.sink.0.lock().unwrap();
    assert_eq!(seen.last().unwrap().as_array().unwrap().len(), 50);
}

#[test]
fn bad_args_are_rejected_with_a_fixed_literal_and_write_nothing() {
    let p = profile(None);
    for bad in [
        json!({ "appName": "a", "title": "t" }),
        json!({ "appName": "a", "title": "t", "runner": "gog", "extra": 1 }),
        json!({ "appName": "", "title": "t", "runner": "gog" }),
        json!({ "appName": "x".repeat(1025), "title": "t", "runner": "gog" }),
        json!({ "appName": 1, "title": "t", "runner": "gog" }),
        json!("a"),
    ] {
        let err = dispatch_sync("info_recent_add", &[bad], &p.ctx).unwrap_err();
        assert_eq!(err, "info_recent_add:bad-args");
    }
    for bad in [
        json!({}),
        json!({ "appName": "" }),
        json!({ "appName": "a", "x": 1 }),
    ] {
        let err = dispatch_sync("info_recent_remove", &[bad], &p.ctx).unwrap_err();
        assert_eq!(err, "info_recent_remove:bad-args");
    }
    // No arguments, and two arguments.
    assert_eq!(
        dispatch_sync("info_recent_remove", &[], &p.ctx).unwrap_err(),
        "info_recent_remove:bad-args"
    );
    assert_eq!(
        dispatch_sync(
            "info_recent_remove",
            &[json!({"appName": "a"}), json!(1)],
            &p.ctx
        )
        .unwrap_err(),
        "info_recent_remove:bad-args"
    );
    assert!(tree(&p.user_data).is_empty(), "a rejected op wrote a file");
    assert!(p.sink.0.lock().unwrap().is_empty());
}

/// The two writers the app really has: a launch's add and a tray or renderer remove, on separate
/// threads against one host. Each is a read-modify-write of the same key, so without the crate's
/// Mutex one effect is lost to the other's stale read (research Pitfall 7).
#[test]
fn a_concurrent_add_and_remove_both_take_effect() {
    let before = fixtures().join("state/recent/add-over-empty-appname-entry");
    // [ghost (empty appName), app2]: a remove of app2 and an add of app1 must give [app1, ghost],
    // whichever runs first.
    for round in 0..100 {
        let p = Arc::new(profile(Some(&before)));
        let barrier = Arc::new(std::sync::Barrier::new(2));
        let adder = {
            let (p, barrier) = (Arc::clone(&p), Arc::clone(&barrier));
            std::thread::spawn(move || {
                barrier.wait();
                dispatch_sync(
                    "info_recent_add",
                    &[json!({ "appName": "app1", "title": "Game 1", "runner": "gog" })],
                    &p.ctx,
                )
            })
        };
        let remover = {
            let (p, barrier) = (Arc::clone(&p), Arc::clone(&barrier));
            std::thread::spawn(move || {
                barrier.wait();
                dispatch_sync(
                    "info_recent_remove",
                    &[json!({ "appName": "app2" })],
                    &p.ctx,
                )
            })
        };
        adder.join().unwrap().unwrap();
        remover.join().unwrap().unwrap();
        let list = recent::list(&p.ctx).unwrap().to_value();
        let names: Vec<&str> = list
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["appName"].as_str().unwrap())
            .collect();
        assert_eq!(names, ["app1", ""], "round {round}: an effect was lost");
        // The file agrees with the list, and every change was announced.
        assert_eq!(p.sink.0.lock().unwrap().len(), 2, "round {round}");
    }
}

#[test]
fn many_concurrent_adds_all_land() {
    let p = Arc::new(profile(None));
    let threads: Vec<_> = (0..16)
        .map(|i| {
            let p = Arc::clone(&p);
            std::thread::spawn(move || {
                dispatch_sync(
                    "info_recent_add",
                    &[json!({ "appName": format!("g{i}"), "title": "T", "runner": "gog" })],
                    &p.ctx,
                )
                .unwrap();
            })
        })
        .collect();
    for t in threads {
        t.join().unwrap();
    }
    let list = recent::list(&p.ctx).unwrap().to_value();
    let mut names: Vec<String> = list
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["appName"].as_str().unwrap().to_string())
        .collect();
    names.sort();
    let mut want: Vec<String> = (0..16).map(|i| format!("g{i}")).collect();
    want.sort();
    assert_eq!(names, want, "an add was lost");
}
