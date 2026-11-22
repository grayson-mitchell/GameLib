//! IsThereAnyDeal store search against the TS goldens (86-07, SC1, D-10, D-18): every case in
//! `tests/fixtures/golden/storeSearch/cases.json` runs through the crate's own dispatcher over a
//! `Replay` of the recorded exchanges, which pins each request to the one the TS made (path, the
//! decoded query pairs in order, `User-Agent`, `Content-Type` and the body), on a pinned clock and over
//! a copy of the case's starting cache files.
//!
//! What each op returned, the requests made (with the `key` value written as `REDACTED`), which key
//! source each request carried (the oracle's `keyPerRequest`), how often the user key was marked
//! rejected, how long the 429 gate stays closed and the bytes of every cache file left behind must
//! equal the TS oracle's golden, and the replay must finish clean: no unmatched request, no recorded
//! exchange left over.
//!
//! The keys are placeholder strings in an in-memory source and in the context's env/baked fields,
//! never a real one. Each source gets a different value so the precedence is checked, not assumed.

use std::collections::BTreeMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::clock::Clock;
use gamelib_core::shutdown::Shutdown;
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform};
use gamelib_info::http::{Http, HttpError, HttpFuture, Replay, Request, Response};
use gamelib_info::secrets::{MemorySecretSource, Slot};
use gamelib_info::{dispatch, dispatch_sync, OPS};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

/// The floor this test carries; the committed MANIFEST must be at or above it, so editing the JSON
/// alone cannot lower the bar.
const FLOOR: usize = 19;

/// Every case op this file replays; a case holding an op not listed is not replayed (and counts
/// against the replayed floor below).
const REPLAYED: &[&str] = &["search", "deals", "gids"];

/// The cases the oracle recorded that this file must replay, so a stale `REPLAYED` list cannot
/// quietly skip the golden.
const REPLAYED_FLOOR: usize = 37;

/// The instant every case runs at (the oracle's `ORACLE_NOW`): 2026-11-22T12:00:00Z.
const ORACLE_NOW: u64 = 1_795_348_800_000;

const KEY_USER: &str = "TEST-PLACEHOLDER-USER";
const KEY_ENV: &str = "TEST-PLACEHOLDER-ENV";
const KEY_BAKED: &str = "TEST-PLACEHOLDER-BAKED";

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/storeSearch")
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
fn the_itad_ops_are_in_the_sorted_op_table() {
    for op in ["info_itad_deals", "info_itad_gids", "info_itad_search"] {
        assert!(OPS.contains(&op), "{op}");
    }
    let mut sorted = OPS.to_vec();
    sorted.sort_unstable();
    assert_eq!(OPS, sorted.as_slice());
}

/// A clock that only moves when a test says so.
struct TestClock(AtomicU64);

impl TestClock {
    fn at(ms: u64) -> Arc<TestClock> {
        Arc::new(TestClock(AtomicU64::new(ms)))
    }

    fn advance(&self, ms: u64) {
        self.0.fetch_add(ms, Ordering::SeqCst);
    }
}

impl Clock for TestClock {
    fn now_ms(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }
}

/// Wraps an [`Http`] and records, per request, `<METHOD> <url with the key value as REDACTED>` and the
/// word naming which configured key the request carried (`null` for a request with no `key`).
struct Tap {
    inner: Arc<dyn Http>,
    labels: Vec<(&'static str, String)>,
    seen: Mutex<Vec<(String, Value)>>,
}

impl Tap {
    fn new(inner: Arc<dyn Http>, labels: Vec<(&'static str, String)>) -> Arc<Tap> {
        Arc::new(Tap {
            inner,
            labels,
            seen: Mutex::new(Vec::new()),
        })
    }

    fn requests(&self) -> Vec<Value> {
        self.seen
            .lock()
            .unwrap()
            .iter()
            .map(|(r, _)| json!(r))
            .collect()
    }

    fn key_per_request(&self) -> Vec<Value> {
        self.seen
            .lock()
            .unwrap()
            .iter()
            .map(|(_, k)| k.clone())
            .collect()
    }
}

impl Http for Tap {
    fn send(&self, request: Request) -> HttpFuture<'_> {
        let (shown, label) = match request.url.rsplit_once("key=") {
            Some((head, key)) => (
                format!("{head}key=REDACTED"),
                self.labels
                    .iter()
                    .find(|(_, value)| value == key)
                    .map_or(json!("unknown"), |(word, _)| json!(word)),
            ),
            None => (request.url.clone(), Value::Null),
        };
        self.seen
            .lock()
            .unwrap()
            .push((format!("{} {shown}", request.method.as_str()), label));
        self.inner.send(request)
    }
}

/// What a case is run with.
struct Run {
    _home: FakeHome,
    user_data: PathBuf,
    ctx: InfoCtx,
    tap: Arc<Tap>,
    replay: Arc<Replay>,
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

/// A context over `http` with the case's keys: the user key in the in-memory source, the env and
/// baked keys in the fields the shell fills. `before` is a cache starting state to copy in.
fn context(
    http: Arc<dyn Http>,
    clock: Arc<TestClock>,
    keys: &Value,
    before: Option<&Path>,
) -> (FakeHome, PathBuf, InfoCtx) {
    let home = FakeHome::new("info-itad-");
    let user_data = home.root().join("userData");
    std::fs::create_dir_all(&user_data).unwrap();
    if let Some(before) = before.filter(|p| p.is_dir()) {
        copy_tree(before, &user_data);
    }
    let mut ctx = InfoCtx::new(
        Arc::new(StoreHost::new()),
        clock,
        Platform::Linux,
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
    ctx.secrets = Some(Arc::new(if keys["user"] == json!(true) {
        MemorySecretSource::with(Slot::Itad, KEY_USER)
    } else {
        MemorySecretSource::new()
    }));
    if keys["env"] == json!(true) {
        ctx.itad_env_key = Some(KEY_ENV.to_string());
    }
    if keys["baked"] == json!(true) {
        ctx.itad_baked_key = Some(KEY_BAKED.to_string());
    }
    (home, user_data, ctx)
}

fn case_run(case: &Value) -> Run {
    let id = case["id"].as_str().unwrap();
    let replay = Arc::new(
        Replay::from_case(&fixtures().join("recorded/storeSearch").join(id))
            .unwrap_or_else(|e| panic!("{id}: {e}")),
    );
    let tap = Tap::new(
        Arc::clone(&replay) as Arc<dyn Http>,
        vec![
            ("user", KEY_USER.to_string()),
            ("env", KEY_ENV.to_string()),
            ("baked", KEY_BAKED.to_string()),
        ],
    );
    let state = fixtures().join("state/storeSearch").join(id);
    let (home, user_data, ctx) = context(
        Arc::clone(&tap) as Arc<dyn Http>,
        TestClock::at(ORACLE_NOW),
        &case["keys"],
        Some(&state),
    );
    if case["rejected"] == json!(true) {
        ctx.itad_key.mark_rejected();
    }
    Run {
        _home: home,
        user_data,
        ctx,
        tap,
        replay,
    }
}

/// The marker's code word (`provider`, `rateLimited`, `notConfigured`), for the oracle's
/// `{ error: { name, code, message } }` shape.
fn code_of(message: &str) -> Option<&str> {
    message
        .strip_prefix("[storeSearch:")
        .and_then(|rest| rest.split_once(']'))
        .map(|(code, _)| code)
}

/// One case op through the dispatcher, as the TS oracle's `{ ok }` / `{ error }` record.
fn run_op(ctx: &InfoCtx, op: &Value) -> Value {
    let result = match op["op"].as_str().unwrap() {
        "search" => {
            let mut args = json!({ "query": op["query"] });
            if let Some(country) = op.get("country") {
                args["country"] = country.clone();
            }
            dispatch_sync("info_itad_search", &[args], ctx)
        }
        "deals" => {
            let mut args = json!({ "gameId": op["gameId"] });
            if let Some(country) = op.get("country") {
                args["country"] = country.clone();
            }
            dispatch_sync("info_itad_deals", &[args], ctx)
        }
        "gids" => {
            let app_ids: Vec<String> = match op.get("appIds") {
                Some(list) => list
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_str().unwrap().to_string())
                    .collect(),
                None => {
                    let range = &op["appIdRange"];
                    let (from, count) = (
                        range["from"].as_u64().unwrap(),
                        range["count"].as_u64().unwrap(),
                    );
                    (from..from + count).map(|n| n.to_string()).collect()
                }
            };
            dispatch_sync("info_itad_gids", &[json!({ "appIds": app_ids })], ctx)
        }
        other => panic!("unknown op {other}"),
    };
    match result {
        Ok(value) => json!({ "ok": value }),
        Err(message) => {
            let code = code_of(&message).unwrap_or_else(|| panic!("not a marker: {message}"));
            json!({ "error": { "name": "StoreSearchError", "code": code, "message": message } })
        }
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
fn every_case_matches_the_ts_results_requests_key_sources_gate_and_cache_bytes() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let cases: Vec<&Value> = cases
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| replayed(c))
        .collect();
    assert!(
        cases.len() >= REPLAYED_FLOOR,
        "{} replayed cases, below the floor of {REPLAYED_FLOOR}",
        cases.len()
    );
    for case in cases {
        let id = case["id"].as_str().unwrap();
        let run = case_run(case);
        let was_rejected = run.ctx.itad_key.is_rejected();
        let got: Vec<Value> = case["ops"]
            .as_array()
            .unwrap()
            .iter()
            .map(|op| run_op(&run.ctx, op))
            .collect();
        let expected = golden_dir().join("expected").join(id);
        let want = read_json(&expected.join("result.json"));

        assert_eq!(json!(got), want["ops"], "{id}: ops");
        assert_eq!(
            json!(run.tap.requests()),
            want["requests"],
            "{id}: requests"
        );
        assert_eq!(
            json!(run.tap.key_per_request()),
            want["keyPerRequest"],
            "{id}: key source per request"
        );
        // The oracle counted calls to `markRejected`; the flag is idempotent, so the count is
        // compared as "it was marked during the case".
        let marked = !was_rejected && run.ctx.itad_key.is_rejected();
        assert_eq!(
            marked,
            want["userKeyMarkedRejected"].as_u64().unwrap() > 0,
            "{id}: user key marked rejected"
        );
        let until = run.ctx.itad_gate.blocked_until();
        let blocked_for = if until == 0 {
            Value::Null
        } else {
            json!(until - ORACLE_NOW)
        };
        assert_eq!(blocked_for, want["gateBlockedForMs"], "{id}: gate");
        run.replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));

        // No error string carries any key value (T-86-35).
        let text = json!(got).to_string();
        for key in [KEY_USER, KEY_ENV, KEY_BAKED] {
            assert!(!text.contains(key), "{id}: a key leaked into a result");
        }

        // The bytes of every cache file the case left, whole-file.
        let want_files = tree(&expected.join("after"));
        let got_files = tree(&run.user_data);
        assert_eq!(
            got_files.keys().collect::<Vec<_>>(),
            want_files.keys().collect::<Vec<_>>(),
            "{id}: files left behind"
        );
        for (rel, bytes) in &want_files {
            assert!(
                got_files[rel] == *bytes,
                "{id}: {rel} differs from the TS golden\n--- want\n{}\n--- got\n{}",
                String::from_utf8_lossy(bytes),
                String::from_utf8_lossy(&got_files[rel])
            );
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Beyond the goldens
// ---------------------------------------------------------------------------------------------

/// Writes a case directory of exchanges (and bodies) and replays it.
fn synthetic_replay(exchanges: Value, bodies: &[(&str, &str)]) -> (tempfile::TempDir, Arc<Replay>) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("exchanges.json"),
        serde_json::to_vec_pretty(&exchanges).unwrap(),
    )
    .unwrap();
    for (name, body) in bodies {
        std::fs::write(dir.path().join(name), body).unwrap();
    }
    let replay = Arc::new(Replay::from_case(dir.path()).unwrap());
    (dir, replay)
}

const SEARCH_URL: &str =
    "https://api.isthereanydeal.com/games/search/v1?title=portal&results=20&key=REDACTED";
const PRICES_URL: &str = "https://api.isthereanydeal.com/games/prices/v3?country=US&key=REDACTED";
const PORTAL: &str = "018d937f-1749-73f8-bf5a-8e0aa3cdd9ff";

fn search_exchange(id: &str, status: u16, headers: Value, body: Option<&str>) -> Value {
    let mut response = json!({ "status": status, "headers": headers });
    if let Some(file) = body {
        response["bodyFile"] = json!(file);
    }
    json!({
        "id": id,
        "request": {
            "method": "GET",
            "url": SEARCH_URL,
            "headers": { "user-agent": "GameLib/0.11.0" }
        },
        "response": response
    })
}

fn prices_exchange(id: &str, body: &str) -> Value {
    json!({
        "id": id,
        "request": {
            "method": "POST",
            "url": PRICES_URL,
            "headers": { "user-agent": "GameLib/0.11.0", "content-type": "application/json" },
            "body": format!("[\"{PORTAL}\"]")
        },
        "response": { "status": 200, "headers": {}, "bodyFile": body }
    })
}

const SEARCH_BODY: &str = r#"[{"id":"018d937f-1749-73f8-bf5a-8e0aa3cdd9ff","title":"Portal"}]"#;
const PRICES_BODY: &str = r#"[{"id":"018d937f-1749-73f8-bf5a-8e0aa3cdd9ff","deals":[{"shop":{"id":61,"name":"Steam"},"price":{"amount":9.99,"amountInt":999,"currency":"USD"},"regular":{"amount":9.99,"amountInt":999,"currency":"USD"},"url":"https://itad.link/portal"}]}]"#;

/// An [`Http`] that waits a moment before it answers, so a second caller arrives while the first
/// request is still in flight.
struct Slow(Arc<dyn Http>);

impl Http for Slow {
    fn send(&self, request: Request) -> HttpFuture<'_> {
        let inner = Arc::clone(&self.0);
        Box::pin(async move {
            tokio::time::sleep(Duration::from_millis(40)).await;
            inner.send(request).await
        })
    }
}

fn env_only_keys() -> Value {
    json!({ "env": true })
}

#[tokio::test]
async fn two_concurrent_identical_searches_make_one_request_pair_and_get_the_same_answer() {
    // Exactly one search and one price exchange are recorded: a second flight would find no twin
    // and the replay would fail.
    let (_dir, replay) = synthetic_replay(
        json!([
            search_exchange("s", 200, json!({}), Some("search.json")),
            prices_exchange("p", "prices.json")
        ]),
        &[("search.json", SEARCH_BODY), ("prices.json", PRICES_BODY)],
    );
    let tap = Tap::new(
        Arc::new(Slow(Arc::clone(&replay) as Arc<dyn Http>)),
        vec![("env", KEY_ENV.to_string())],
    );
    let (_home, _user_data, ctx) = context(
        Arc::clone(&tap) as Arc<dyn Http>,
        TestClock::at(ORACLE_NOW),
        &env_only_keys(),
        None,
    );
    let args = [json!({ "query": "portal", "country": "US" })];
    let (a, b, c) = tokio::join!(
        dispatch("info_itad_search", &args, &ctx),
        dispatch("info_itad_search", &args, &ctx),
        dispatch("info_itad_search", &args, &ctx),
    );
    let (a, b, c) = (a.unwrap(), b.unwrap(), c.unwrap());
    assert_eq!(a, b);
    assert_eq!(b, c);
    assert_eq!(a["results"][0]["gameId"], PORTAL);
    assert_eq!(tap.requests().len(), 2, "{:?}", tap.requests());
    replay.finish().unwrap();
}

#[tokio::test]
async fn a_shared_failure_reaches_every_caller_and_the_gate_closes_once() {
    let (_dir, replay) = synthetic_replay(
        json!([search_exchange(
            "s",
            429,
            json!({ "retry-after": "30" }),
            Some("none.json")
        )]),
        &[("none.json", "{}")],
    );
    let tap = Tap::new(
        Arc::new(Slow(Arc::clone(&replay) as Arc<dyn Http>)),
        vec![("env", KEY_ENV.to_string())],
    );
    let (_home, _user_data, ctx) = context(
        Arc::clone(&tap) as Arc<dyn Http>,
        TestClock::at(ORACLE_NOW),
        &env_only_keys(),
        None,
    );
    let args = [json!({ "query": "portal" })];
    let (a, b) = tokio::join!(
        dispatch("info_itad_search", &args, &ctx),
        dispatch("info_itad_search", &args, &ctx),
    );
    let message = "[storeSearch:rateLimited] search 429".to_string();
    assert_eq!(a, Err(message.clone()));
    assert_eq!(b, Err(message));
    assert_eq!(tap.requests().len(), 1);
    assert_eq!(ctx.itad_gate.blocked_until(), ORACLE_NOW + 30_000);
    replay.finish().unwrap();
}

#[test]
fn the_gate_refuses_new_requests_until_retry_after_passes() {
    let (_dir, replay) = synthetic_replay(
        json!([
            search_exchange(
                "limited",
                429,
                json!({ "retry-after": "30" }),
                Some("none.json")
            ),
            search_exchange("again", 200, json!({}), Some("empty.json")),
        ]),
        &[("none.json", "{}"), ("empty.json", "[]")],
    );
    let tap = Tap::new(
        Arc::clone(&replay) as Arc<dyn Http>,
        vec![("env", KEY_ENV.to_string())],
    );
    let clock = TestClock::at(ORACLE_NOW);
    let (_home, _user_data, ctx) = context(
        Arc::clone(&tap) as Arc<dyn Http>,
        Arc::clone(&clock),
        &env_only_keys(),
        None,
    );
    let args = [json!({ "query": "portal" })];
    let limited = "[storeSearch:rateLimited] search 429".to_string();
    // The first request is answered 429: the error, and the gate closes for 30 s.
    assert_eq!(
        dispatch_sync("info_itad_search", &args, &ctx),
        Err(limited.clone())
    );
    assert_eq!(tap.requests().len(), 1);
    // Inside the window nothing is requested.
    clock.advance(29_999);
    assert_eq!(
        dispatch_sync("info_itad_search", &args, &ctx),
        Err(limited.clone())
    );
    assert_eq!(tap.requests().len(), 1);
    // Once it passes the request goes out again.
    clock.advance(1);
    let answer = dispatch_sync("info_itad_search", &args, &ctx).unwrap();
    assert_eq!(answer, json!({ "results": [], "pricedCountry": "US" }));
    assert_eq!(tap.requests().len(), 2);
    replay.finish().unwrap();
}

/// An [`Http`] whose every request fails with a message that holds the URL, key and all, the way a
/// careless transport would.
struct LeakyFailure;

impl Http for LeakyFailure {
    fn send(&self, request: Request) -> HttpFuture<'_> {
        let url = request.url.clone();
        Box::pin(async move {
            Err::<Response, _>(HttpError::Network(format!("connect to {url} failed")))
        })
    }
}

#[test]
fn a_transport_failure_never_carries_the_key_or_the_url_into_the_error() {
    let (_home, _user_data, ctx) = context(
        Arc::new(LeakyFailure),
        TestClock::at(ORACLE_NOW),
        &json!({ "user": true, "env": true, "baked": true }),
        None,
    );
    let error =
        dispatch_sync("info_itad_search", &[json!({ "query": "portal" })], &ctx).unwrap_err();
    assert_eq!(error, "[storeSearch:provider] search none");
    for secret in [KEY_USER, KEY_ENV, KEY_BAKED, "isthereanydeal", "key="] {
        assert!(!error.contains(secret), "{error}");
    }
}

#[test]
fn a_fresh_cache_hit_makes_no_request_and_needs_no_key() {
    // The cached entry answers before any key is looked up, as in TS.
    let state =
        fixtures().join("state/storeSearch/synthetic-cache-hit-search-fresh-normalised-query");
    let (_home, _user_data, ctx) = context(
        Arc::new(LeakyFailure),
        TestClock::at(ORACLE_NOW),
        &json!({}),
        Some(&state),
    );
    let answer = dispatch_sync(
        "info_itad_search",
        &[json!({ "query": "  PORTAL  ", "country": "US" })],
        &ctx,
    )
    .unwrap();
    assert_eq!(answer["pricedCountry"], "US");
    assert!(answer["results"].as_array().is_some_and(|r| !r.is_empty()));
    assert!(answer["results"][0].get("cachedAt").is_none());
}

#[test]
fn bad_arguments_are_rejected_with_a_fixed_literal_and_make_no_request() {
    let (_home, _user_data, ctx) = context(
        Arc::new(LeakyFailure),
        TestClock::at(ORACLE_NOW),
        &env_only_keys(),
        None,
    );
    let run = |args: Value| dispatch_sync("info_itad_search", &[args], &ctx);
    let bad = "info_itad_search:bad-args".to_string();
    assert_eq!(run(json!({ "query": "x".repeat(257) })), Err(bad.clone()));
    assert_eq!(
        run(json!({ "query": "x", "country": "C".repeat(17) })),
        Err(bad.clone())
    );
    assert_eq!(run(json!({ "query": "x", "extra": 1 })), Err(bad.clone()));
    assert_eq!(run(json!({ "country": "US" })), Err(bad.clone()));
    assert_eq!(run(json!({ "query": 5 })), Err(bad.clone()));
    assert_eq!(
        dispatch_sync("info_itad_search", &[], &ctx),
        Err(bad.clone())
    );
    // The bound is in UTF-16 units: 128 astral characters are 256 units and pass the bound (then
    // fail at the transport), 129 are 258 and do not.
    let astral = |n: usize| json!({ "query": "\u{1F3AE}".repeat(n) });
    assert_eq!(run(astral(129)), Err(bad));
    assert_eq!(
        run(astral(128)),
        Err("[storeSearch:provider] search none".to_string())
    );
}

#[test]
fn a_pending_search_is_cancelled_by_shutdown_with_a_fixed_literal() {
    struct Forever;
    impl Http for Forever {
        fn send(&self, _request: Request) -> HttpFuture<'_> {
            Box::pin(std::future::pending::<Result<Response, HttpError>>())
                as Pin<Box<dyn Future<Output = Result<Response, HttpError>> + Send>>
        }
    }
    let (_home, _user_data, ctx) = context(
        Arc::new(Forever),
        TestClock::at(ORACLE_NOW),
        &env_only_keys(),
        None,
    );
    let shutdown = ctx.shutdown.clone();
    let canceller = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(100));
        shutdown.token().cancel();
    });
    let error =
        dispatch_sync("info_itad_search", &[json!({ "query": "portal" })], &ctx).unwrap_err();
    canceller.join().unwrap();
    assert_eq!(error, "info_itad_search:shutdown");
}

// ---------------------------------------------------------------------------------------------
// Deals and Steam gids beyond the goldens
// ---------------------------------------------------------------------------------------------

const DEALS_URL: &str = "https://api.isthereanydeal.com/games/prices/v3?country=US&key=REDACTED";
const LOOKUP_URL: &str = "https://api.isthereanydeal.com/lookup/id/shop/61/v1";

fn deals_exchange(id: &str, status: u16, body: Option<&str>) -> Value {
    let mut response = json!({ "status": status, "headers": {} });
    if let Some(file) = body {
        response["bodyFile"] = json!(file);
    }
    json!({
        "id": id,
        "request": {
            "method": "POST",
            "url": DEALS_URL,
            "headers": { "user-agent": "GameLib/0.11.0", "content-type": "application/json" },
            "body": format!("[\"{PORTAL}\"]")
        },
        "response": response
    })
}

fn lookup_exchange(id: &str, ids: std::ops::Range<u32>, body_file: &str) -> Value {
    let body: Vec<String> = ids.map(|n| format!("app/{n}")).collect();
    json!({
        "id": id,
        "request": {
            "method": "POST",
            "url": LOOKUP_URL,
            "headers": { "user-agent": "GameLib/0.11.0", "content-type": "application/json" },
            "body": serde_json::to_string(&body).unwrap()
        },
        "response": { "status": 200, "headers": {}, "bodyFile": body_file }
    })
}

#[tokio::test]
async fn two_concurrent_identical_deals_requests_make_one_http_request_and_both_resolve() {
    // One price exchange is recorded: a second flight would find no twin and the replay would fail.
    let (_dir, replay) = synthetic_replay(
        json!([deals_exchange("d", 200, Some("prices.json"))]),
        &[("prices.json", PRICES_BODY)],
    );
    let tap = Tap::new(
        Arc::new(Slow(Arc::clone(&replay) as Arc<dyn Http>)),
        vec![("env", KEY_ENV.to_string())],
    );
    let (_home, _user_data, ctx) = context(
        Arc::clone(&tap) as Arc<dyn Http>,
        TestClock::at(ORACLE_NOW),
        &env_only_keys(),
        None,
    );
    let args = [json!({ "gameId": PORTAL, "country": "US" })];
    let (a, b) = tokio::join!(
        dispatch("info_itad_deals", &args, &ctx),
        dispatch("info_itad_deals", &args, &ctx),
    );
    let (a, b) = (a.unwrap(), b.unwrap());
    assert_eq!(a, b);
    assert_eq!(a[0]["storeName"], "Steam");
    assert_eq!(a[0]["runner"], "steam");
    assert_eq!(tap.requests().len(), 1, "{:?}", tap.requests());
    replay.finish().unwrap();
}

#[test]
fn deals_are_cached_so_a_second_call_makes_no_request() {
    let (_dir, replay) = synthetic_replay(
        json!([deals_exchange("d", 200, Some("prices.json"))]),
        &[("prices.json", PRICES_BODY)],
    );
    let tap = Tap::new(
        Arc::clone(&replay) as Arc<dyn Http>,
        vec![("env", KEY_ENV.to_string())],
    );
    let (_home, _user_data, ctx) = context(
        Arc::clone(&tap) as Arc<dyn Http>,
        TestClock::at(ORACLE_NOW),
        &env_only_keys(),
        None,
    );
    let args = [json!({ "gameId": PORTAL })];
    let first = dispatch_sync("info_itad_deals", &args, &ctx).unwrap();
    let second = dispatch_sync("info_itad_deals", &args, &ctx).unwrap();
    assert_eq!(first, second);
    assert_eq!(tap.requests().len(), 1);
    replay.finish().unwrap();
}

#[test]
fn a_game_id_that_is_not_a_uuid_is_the_provider_error_without_a_request() {
    let (_home, _user_data, ctx) = context(
        Arc::new(LeakyFailure),
        TestClock::at(ORACLE_NOW),
        &env_only_keys(),
        None,
    );
    for bad in [
        "../not-a-uuid",
        "",
        "018d937f",
        "018d937f-1749-73f8-bf5a-8e0aa3cdd9fg",
    ] {
        assert_eq!(
            dispatch_sync("info_itad_deals", &[json!({ "gameId": bad })], &ctx),
            Err("[storeSearch:provider] deals none".to_string()),
            "{bad:?}"
        );
    }
    let bad = "info_itad_deals:bad-args".to_string();
    assert_eq!(
        dispatch_sync(
            "info_itad_deals",
            &[json!({ "gameId": "a".repeat(65) })],
            &ctx
        ),
        Err(bad.clone())
    );
    assert_eq!(
        dispatch_sync(
            "info_itad_deals",
            &[json!({ "gameId": PORTAL, "country": "C".repeat(17) })],
            &ctx
        ),
        Err(bad.clone())
    );
    assert_eq!(
        dispatch_sync(
            "info_itad_deals",
            &[json!({ "gameId": PORTAL, "x": 1 })],
            &ctx
        ),
        Err(bad.clone())
    );
    assert_eq!(dispatch_sync("info_itad_deals", &[], &ctx), Err(bad));
}

#[test]
fn four_hundred_and_fifty_app_ids_make_three_lookups_of_200_200_and_50() {
    let ids = |range: std::ops::Range<u32>| -> String {
        let map: serde_json::Map<String, Value> = range
            .map(|n| {
                (
                    format!("app/{n}"),
                    json!(format!("018d937f-0000-7000-8000-{n:012}")),
                )
            })
            .collect();
        serde_json::to_string(&map).unwrap()
    };
    let (b1, b2, b3) = (ids(1000..1200), ids(1200..1400), ids(1400..1450));
    let (_dir, replay) = synthetic_replay(
        json!([
            lookup_exchange("l1", 1000..1200, "b1.json"),
            lookup_exchange("l2", 1200..1400, "b2.json"),
            lookup_exchange("l3", 1400..1450, "b3.json"),
        ]),
        &[("b1.json", &b1), ("b2.json", &b2), ("b3.json", &b3)],
    );
    let tap = Tap::new(Arc::clone(&replay) as Arc<dyn Http>, vec![]);
    let (_home, user_data, ctx) = context(
        Arc::clone(&tap) as Arc<dyn Http>,
        TestClock::at(ORACLE_NOW),
        &json!({}),
        None,
    );
    let app_ids: Vec<String> = (1000..1450).map(|n| n.to_string()).collect();
    let answer = dispatch_sync("info_itad_gids", &[json!({ "appIds": app_ids })], &ctx).unwrap();
    assert_eq!(answer.as_object().unwrap().len(), 450);
    assert_eq!(answer["1000"], "018d937f-0000-7000-8000-000000001000");
    assert_eq!(answer["1449"], "018d937f-0000-7000-8000-000000001449");
    // Keyless: no request carries a key.
    assert_eq!(tap.requests().len(), 3);
    assert!(tap.key_per_request().iter().all(Value::is_null));
    replay.finish().unwrap();
    // Every id is cached, so a second call makes no request at all.
    let again = dispatch_sync(
        "info_itad_gids",
        &[json!({ "appIds": (1000..1450).map(|n: u32| n.to_string()).collect::<Vec<_>>() })],
        &ctx,
    )
    .unwrap();
    assert_eq!(again, answer);
    assert_eq!(tap.requests().len(), 3);
    assert!(user_data.join("store_cache/itad_steam_gids.json").is_file());
}

#[test]
fn gid_arguments_are_bounded_and_a_non_digit_id_is_skipped_as_ts_filtered_it() {
    let (_home, _user_data, ctx) = context(
        Arc::new(LeakyFailure),
        TestClock::at(ORACLE_NOW),
        &json!({}),
        None,
    );
    let bad = "info_itad_gids:bad-args".to_string();
    let too_many: Vec<String> = (0..5001).map(|n| n.to_string()).collect();
    assert_eq!(
        dispatch_sync("info_itad_gids", &[json!({ "appIds": too_many })], &ctx),
        Err(bad.clone())
    );
    assert_eq!(
        dispatch_sync("info_itad_gids", &[json!({ "appIds": [1] })], &ctx),
        Err(bad.clone())
    );
    assert_eq!(
        dispatch_sync("info_itad_gids", &[json!({ "appIds": [], "x": 1 })], &ctx),
        Err(bad.clone())
    );
    assert_eq!(dispatch_sync("info_itad_gids", &[], &ctx), Err(bad));
    // Exactly 5000 is fine; ids that are not 1 to 10 ASCII digits are dropped, so nothing is asked
    // and the answer is empty even though the transport would fail every request.
    let junk = [
        "abc",
        "",
        "12345678901",
        "1.5",
        "-1",
        "\u{0663}",
        " 1",
        "1\n",
    ];
    assert_eq!(
        dispatch_sync("info_itad_gids", &[json!({ "appIds": junk })], &ctx),
        Ok(json!({}))
    );
    let at_limit: Vec<&str> = vec!["abc"; 5000];
    assert_eq!(
        dispatch_sync("info_itad_gids", &[json!({ "appIds": at_limit })], &ctx),
        Ok(json!({}))
    );
}

#[test]
fn a_failed_lookup_batch_keeps_the_expired_mapping_and_never_fails() {
    // `synthetic-cache-gids-expired-refresh-fails-keeps-stale` through the golden loop covers the
    // recorded 5xx; here the transport itself is down.
    let state =
        fixtures().join("state/storeSearch/synthetic-cache-gids-expired-refresh-fails-keeps-stale");
    let (_home, _user_data, ctx) = context(
        Arc::new(LeakyFailure),
        TestClock::at(ORACLE_NOW),
        &json!({}),
        Some(&state),
    );
    let answer = dispatch_sync("info_itad_gids", &[json!({ "appIds": ["220"] })], &ctx).unwrap();
    assert!(answer["220"].is_string(), "{answer}");
}
