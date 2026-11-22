//! The CrossOver compatibility index against the TS goldens (86-06 recorded them, 86-19 ports them; SC1,
//! D-10, D-18): every case in `tests/fixtures/golden/crossover/cases.json` runs over a `Replay` of the
//! recorded exchanges, which pins each request to the one the TS made, on a clock that only moves when
//! a case says `advance`, and over a copy of the case's starting profile (`state/crossover/<case>`: the
//! `store_cache/crossover_index.json` file and, for the fallback cases, `public/crossover-index.json.gz`).
//!
//! What each op returned, the requests made, how many each op made, and the bytes of every cache file the
//! case left behind (`expected/<case>/after`, the bundled snapshot under `public/` left out) must equal
//! the TS oracle's golden, and the replay must finish clean: no unmatched request, no recorded exchange
//! left over.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::Clock;
use gamelib_core::shutdown::Shutdown;
use gamelib_info::crossover::{self, GameRef};
use gamelib_info::ctx::{InfoCtx, InfoLog, InfoPaths, Platform};
use gamelib_info::dispatch;
use gamelib_info::http::{Http, HttpFuture, Replay, Request};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 12;

/// The instant every case starts at (the oracle's `ORACLE_NOW`): 2026-11-22T12:00:00Z.
const ORACLE_NOW: u64 = 1_795_348_800_000;

/// The cases this file replays. Every case in `cases.json` must be listed, so a new case cannot be
/// quietly skipped (see `every_recorded_case_is_replayed`).
const REPLAYED_CASES: &[&str] = &[
    "live-fresh-fetch-mac",
    "cache-fresh-no-request",
    "rating-map-linux-empty",
    "rating-map-windows-empty",
];

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/crossover")
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
fn the_rating_map_is_in_the_sorted_op_table() {
    assert!(gamelib_info::OPS.contains(&"info_crossover_rating_map"));
    let mut sorted = gamelib_info::OPS.to_vec();
    sorted.sort_unstable();
    assert_eq!(gamelib_info::OPS, sorted.as_slice());
}

/// A clock that only moves when a case says so.
struct TestClock(AtomicU64);

impl Clock for TestClock {
    fn now_ms(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }
}

/// Wraps an [`Http`] and records `<METHOD> <url>` per request. Nothing in this slice puts a key in a URL.
struct Tap {
    inner: Arc<dyn Http>,
    seen: Mutex<Vec<String>>,
}

impl Http for Tap {
    fn send(&self, request: Request) -> HttpFuture<'_> {
        self.seen
            .lock()
            .unwrap()
            .push(format!("{} {}", request.method.as_str(), request.url));
        self.inner.send(request)
    }
}

/// Keeps every diagnostic line the crate wrote.
#[derive(Default)]
struct Lines(Mutex<Vec<String>>);

impl InfoLog for Lines {
    fn line(&self, text: &str) {
        self.0.lock().unwrap().push(text.to_string());
    }
}

impl Tap {
    fn count(&self) -> usize {
        self.seen.lock().unwrap().len()
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

/// What a case is run with.
struct Run {
    _home: FakeHome,
    user_data: PathBuf,
    ctx: InfoCtx,
    clock: Arc<TestClock>,
    tap: Arc<Tap>,
    replay: Arc<Replay>,
    lines: Arc<Lines>,
}

fn platform_of(word: &str) -> Platform {
    match word {
        "mac" => Platform::Mac,
        "linux" => Platform::Linux,
        "windows" => Platform::Windows,
        other => panic!("unknown platform {other}"),
    }
}

fn case_run(case: &Value) -> Run {
    let id = case["id"].as_str().unwrap();
    let replay = Arc::new(
        Replay::from_case(&fixtures().join("recorded/crossover").join(id))
            .unwrap_or_else(|e| panic!("{id}: {e}")),
    );
    let tap = Arc::new(Tap {
        inner: Arc::clone(&replay) as Arc<dyn Http>,
        seen: Mutex::new(Vec::new()),
    });
    let clock = Arc::new(TestClock(AtomicU64::new(ORACLE_NOW)));
    let home = FakeHome::new("info-crossover-");
    let user_data = home.root().join("userData");
    std::fs::create_dir_all(&user_data).unwrap();
    let state = fixtures().join("state/crossover").join(id);
    if state.is_dir() {
        copy_tree(&state, &user_data);
    }
    let lines = Arc::new(Lines::default());
    let mut ctx = InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::clone(&clock) as Arc<dyn Clock>,
        platform_of(case["platform"].as_str().unwrap()),
        InfoPaths {
            app_folder: user_data.clone(),
            user_data: user_data.clone(),
            temp: home.root().join("temp"),
            // The oracle's publicDir: `public` inside the profile.
            public_dir: Some(user_data.join("public")),
        },
        // The version the recorded TS requests carry in their User-Agent.
        "0.11.0".to_string(),
        Shutdown::new(),
        Arc::clone(&tap) as Arc<dyn Http>,
    );
    ctx.log = Some(Arc::clone(&lines) as Arc<dyn InfoLog>);
    Run {
        _home: home,
        user_data,
        ctx,
        clock,
        tap,
        replay,
        lines,
    }
}

/// `JSON.stringify` of `value` with the keys sorted at every level (the oracle's `canonical`).
fn canonical(value: &Value) -> String {
    match value {
        Value::Array(items) => format!(
            "[{}]",
            items.iter().map(canonical).collect::<Vec<_>>().join(",")
        ),
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let parts: Vec<String> = keys
                .iter()
                .map(|k| format!("{}:{}", Value::String((*k).clone()), canonical(&map[*k])))
                .collect();
            format!("{{{}}}", parts.join(","))
        }
        other => other.to_string(),
    }
}

/// The oracle's `describeIndex`: the loaded index as its `generatedAt`, entry count and the SHA-256 of
/// its canonical JSON.
fn describe_index(loaded: Option<&crossover::fetcher::Loaded>) -> Value {
    let Some(loaded) = loaded else {
        return Value::Null;
    };
    let index = &loaded.index;
    let digest = Sha256::digest(canonical(&loaded.data.to_value()).as_bytes());
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    json!({
        "generatedAt": index.generated_at,
        "entryCount": index.entries.len(),
        "sha256": hex
    })
}

fn game_ref(game: &Value) -> GameRef<'_> {
    GameRef {
        runner: game["runner"].as_str().unwrap(),
        app_name: game["app_name"].as_str().unwrap(),
        title: game["title"].as_str().unwrap(),
    }
}

/// The op's args for the rating map: the case's library, in the order it lists them.
fn rating_map_args(library: &[Value]) -> Value {
    let games: Vec<Value> = library
        .iter()
        .map(|g| json!({ "appName": g["app_name"], "title": g["title"], "runner": g["runner"] }))
        .collect();
    json!({ "games": games })
}

/// One case op, as the oracle's `{ op, ... }` record (without `requestsMade`, which the caller adds).
async fn run_op(run: &Run, case: &Value, op: &Value) -> Value {
    let ctx = &run.ctx;
    match op["op"].as_str().expect("case op") {
        "advance" => {
            let minutes = op["minutes"].as_u64().unwrap();
            run.clock.0.fetch_add(minutes * 60_000, Ordering::SeqCst);
            json!({ "op": "advance", "minutes": minutes })
        }
        "load" => {
            let url = op["url"].as_str().unwrap_or(crossover::INDEX_URL);
            match crossover::fetcher::load_index(ctx, url).await {
                Ok(index) => json!({ "op": "load", "result": describe_index(index.as_ref()) }),
                Err(message) => json!({ "op": "load", "error": message }),
            }
        }
        "codeweavers" => {
            let game = &op["game"];
            let info = crossover::codeweavers_for(ctx, &game_ref(game)).await;
            json!({
                "op": "codeweavers",
                "game": game["app_name"],
                "result": info.map_or(Value::Null, |i| i.to_value())
            })
        }
        "has" => {
            let game = &op["game"];
            json!({
                "op": "has",
                "game": game["app_name"],
                "result": crossover::index_has(ctx, &game_ref(game))
            })
        }
        "resolver" => {
            let resolver = crossover::index_resolver(ctx).await;
            let ratings: serde_json::Map<String, Value> = op["games"]
                .as_array()
                .unwrap()
                .iter()
                .map(|g| {
                    let key = format!(
                        "{}:{}",
                        g["runner"].as_str().unwrap(),
                        g["app_name"].as_str().unwrap()
                    );
                    (
                        key,
                        resolver
                            .rating(&game_ref(g))
                            .map_or(Value::Null, |r| json!(r)),
                    )
                })
                .collect();
            json!({ "op": "resolver", "result": ratings })
        }
        "ratingMap" => {
            let library = case["library"].as_array().cloned().unwrap_or_default();
            let args = rating_map_args(&library);
            match dispatch("info_crossover_rating_map", &[args], ctx).await {
                Ok(map) => json!({ "op": "ratingMap", "result": map }),
                Err(message) => json!({ "op": "ratingMap", "error": message }),
            }
        }
        other => panic!("unknown op {other}"),
    }
}

async fn replay_case(case: &Value) {
    let id = case["id"].as_str().unwrap();
    let run = case_run(case);
    let mut got = Vec::new();
    for op in case["ops"].as_array().unwrap() {
        let before = run.tap.count();
        let mut record = run_op(&run, case, op).await;
        record["requestsMade"] = json!(run.tap.count() - before);
        got.push(record);
    }
    let expected = golden_dir().join("expected").join(id);
    let want = read_json(&expected.join("result.json"));

    let lines = run.lines.0.lock().unwrap().clone();
    assert_eq!(json!(got), want["ops"], "{id}: ops (log: {lines:?})");
    let requests = run.tap.seen.lock().unwrap().clone();
    assert_eq!(json!(requests), want["requests"], "{id}: requests");
    run.replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));

    // The bytes of every file the case left (the bundled snapshot is an input, not a result).
    let want_files = tree(&expected.join("after"));
    let mut got_files = tree(&run.user_data);
    got_files.retain(|path, _| !path.starts_with("public/"));
    assert_eq!(
        got_files.keys().collect::<Vec<_>>(),
        want_files.keys().collect::<Vec<_>>(),
        "{id}: files left behind"
    );
    for (path, bytes) in &want_files {
        assert!(
            &got_files[path] == bytes,
            "{id}: {path} differs from the TS golden ({} vs {} bytes)",
            got_files[path].len(),
            bytes.len()
        );
    }
}

#[tokio::test]
async fn every_replayed_case_matches_the_ts_results_requests_and_cache_bytes() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let cases = cases.as_array().unwrap();
    let mut replayed = 0;
    for id in REPLAYED_CASES {
        let case = cases
            .iter()
            .find(|c| c["id"] == *id)
            .unwrap_or_else(|| panic!("no case {id}"));
        replay_case(case).await;
        replayed += 1;
    }
    assert_eq!(replayed, REPLAYED_CASES.len());
}
