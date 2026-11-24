//! The remote known-fixes fetcher against the TS goldens (88-07 recorded them, 88-11 replays them; D-03,
//! D-15, T-88-27, T-88-28). `golden/fetcher` holds 38 cases, each a list of steps run on one fresh fake
//! HOME: a step seeds files under `<APPFOLDER>`, runs `fetch_remote_known_fixes` for one game and is
//! compared on the URLs asked, the `<APPFOLDER>` tree afterwards and the log lines.
//!
//! Every request is served by gamelib-engine's `Replay` over `recorded/fetcher/<case>/exchanges.json`
//! (the exchanges of all steps of a case, in order), so no case opens a socket, and a request the TS did
//! not make, or a recorded one the Rust did not make, fails the case. A tap in front of the replay keeps
//! each request the Rust client built, for the equivalents of the options axios recorded (a 10 000 ms
//! timeout, a plain GET) and for the one header it sends.
//!
//! Documented differences (`deltas.json`, and here): the Rust client sends the GameLib `User-Agent` where
//! axios sent its own default one, which the oracle's spy could not see, so the replay is handed the
//! recorded exchanges with that one header added; a log line names the file (`<id>-<store>.json`), never
//! a URL or a path (prohibition 1), and a transport or io failure says what the seam or the OS says. A
//! count floor lives in this file, so editing the JSON alone cannot lower the bar, and an empty case
//! list fails.

#![cfg_attr(not(unix), allow(dead_code, unused_imports))]

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::fetch::{
    user_agent, DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse,
    Method, Progress, Replay,
};
use gamelib_engine::testing::RecordingLog;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_knownfix::remote::{
    fetch_remote_known_fixes, FEED_REQUEST_TIMEOUT, GAMELIB_KNOWN_FIXES_BASE,
    HEROIC_KNOWN_FIXES_BASE,
};
use gamelib_knownfix::types::Runner;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

/// `golden/fetcher` holds 38 cases: the tracer, the 14 titles of `knownFixesFetcher.test.ts` and 23 rule
/// cases. The plan asks for at least 20. A later edit may raise this, never lower it.
const FETCHER_FLOOR: usize = 38;

/// The version the context reports; the replay's `User-Agent` is derived from it.
const VERSION: &str = "0.8.0";

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/fetcher")
}

fn recorded_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/recorded/fetcher")
}

fn read_json(path: &Path) -> Value {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{path:?}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

fn load_cases() -> Vec<Value> {
    match read_json(&golden_dir().join("cases.json")) {
        Value::Array(cases) => cases,
        other => panic!("cases.json is not an array: {other}"),
    }
}

fn sha256(data: &[u8]) -> String {
    Sha256::digest(data)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// A case's recorded exchanges with the GameLib `User-Agent` added to every request (`deltas.json`).
fn replay_for(id: &str) -> (Replay, tempfile::TempDir) {
    let source = recorded_dir().join(id);
    let tmp = tempfile::tempdir().unwrap();
    for entry in std::fs::read_dir(&source).unwrap() {
        let entry = entry.unwrap();
        let target = tmp.path().join(entry.file_name());
        if entry.file_name() == "exchanges.json" {
            let mut exchanges = read_json(&entry.path());
            for exchange in exchanges.as_array_mut().unwrap() {
                exchange["request"]["headers"]["user-agent"] = json!(user_agent(VERSION));
            }
            std::fs::write(&target, serde_json::to_vec_pretty(&exchanges).unwrap()).unwrap();
        } else {
            std::fs::copy(entry.path(), &target).unwrap();
        }
    }
    (Replay::from_case(tmp.path()).unwrap(), tmp)
}

/// Keeps each request the client built, then lets the replay serve it.
struct Tap {
    inner: Replay,
    seen: Mutex<Vec<FetchRequest>>,
}

impl Fetch for Tap {
    fn get(&self, req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        self.seen.lock().unwrap().push(req.clone());
        self.inner.get(req)
    }

    fn download<'a>(
        &'a self,
        _req: FetchRequest,
        _dest: &'a Path,
        _progress: &'a (dyn Fn(Progress) + Send + Sync),
        _cancel: CancellationToken,
    ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
        Box::pin(async { Err(FetchError::Network) })
    }
}

struct Rig {
    home: FakeHome,
    log: Arc<RecordingLog>,
    tap: Arc<Tap>,
    ctx: KnownFixCtx,
    _recorded: tempfile::TempDir,
}

impl Rig {
    fn new(id: &str) -> Rig {
        let home = FakeHome::new("knownfix-fetcher-golden-");
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        let log = Arc::new(RecordingLog::new());
        let (replay, recorded) = replay_for(id);
        let tap = Arc::new(Tap {
            inner: replay,
            seen: Mutex::new(Vec::new()),
        });
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                tools_path: app_folder.join("tools"),
                user_data: root.join("userData"),
                app_folder,
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_log(log.clone())
        .with_fetch(tap.clone());
        let ctx = KnownFixCtx::new(Arc::new(engine), None, "https://relay.test", VERSION);
        Rig {
            home,
            log,
            tap,
            ctx,
            _recorded: recorded,
        }
    }

    fn app_folder(&self) -> PathBuf {
        self.home.root().join(".config").join("GameLib")
    }

    /// `<APPFOLDER>/...` as a real path.
    fn real(&self, golden_path: &str) -> PathBuf {
        let rest = golden_path
            .strip_prefix("<APPFOLDER>")
            .unwrap_or_else(|| panic!("a seed path outside <APPFOLDER>: {golden_path}"));
        self.app_folder().join(rest.trim_start_matches('/'))
    }

    fn seed(&self, seeds: &Value) {
        for seed in seeds.as_array().into_iter().flatten() {
            let path = self.real(seed["path"].as_str().unwrap());
            if seed["dir"] == true {
                std::fs::create_dir_all(&path).unwrap();
            } else {
                std::fs::create_dir_all(path.parent().unwrap()).unwrap();
                std::fs::write(&path, seed["text"].as_str().unwrap()).unwrap();
            }
        }
    }

    fn requests(&self) -> Vec<FetchRequest> {
        self.tap.seen.lock().unwrap().clone()
    }
}

/// `snapshotTree` of `<APPFOLDER>`: every entry under it, sorted by path, with the mode minus the group
/// and other write bits and the sha256 of a file.
#[cfg(unix)]
fn snapshot_tree(rig: &Rig) -> Value {
    use std::os::unix::fs::PermissionsExt;

    fn walk(root: &Path, rel: &str, out: &mut Vec<(String, Value)>) {
        let dir = if rel.is_empty() {
            root.to_path_buf()
        } else {
            root.join(rel)
        };
        let Ok(read) = std::fs::read_dir(&dir) else {
            return;
        };
        let mut names: Vec<String> = read
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        for name in names {
            let rel_path = if rel.is_empty() {
                name.clone()
            } else {
                format!("{rel}/{name}")
            };
            let full = root.join(&rel_path);
            let md = std::fs::symlink_metadata(&full).unwrap();
            let mode = format!("{:04o}", md.permissions().mode() & 0o7755);
            let path = format!("<APPFOLDER>/{rel_path}");
            if md.is_dir() {
                out.push((
                    rel_path.clone(),
                    json!({"path": path, "kind": "dir", "mode": mode}),
                ));
                walk(root, &rel_path, out);
            } else {
                out.push((
                    rel_path,
                    json!({"path": path, "kind": "file", "mode": mode,
                           "sha256": sha256(&std::fs::read(&full).unwrap())}),
                ));
            }
        }
    }

    let mut out = Vec::new();
    walk(&rig.app_folder(), "", &mut out);
    out.sort_by(|a, b| a.0.as_bytes().cmp(b.0.as_bytes()));
    Value::Array(out.into_iter().map(|(_, v)| v).collect())
}

/// What a log line must be: the whole text, or a start that something non-empty follows (a transport or an
/// io message, which says what the seam or the OS says).
enum Want {
    Exact(String),
    Prefix(String),
}

impl Want {
    fn accepts(&self, line: &str) -> bool {
        match self {
            Want::Exact(text) => line == text,
            Want::Prefix(start) => line.starts_with(start.as_str()) && line.len() > start.len(),
        }
    }
}

/// The golden's line as the Rust side is specified to say it (`deltas.json`): the feed URL and the
/// `<APPFOLDER>/fixes/` folder are the bare file name, the refused name is not echoed, and the text after
/// a transport, io or parser failure is the seam's own.
fn want_line(golden: &str) -> Want {
    let mut text = golden.to_string();
    for base in [GAMELIB_KNOWN_FIXES_BASE, HEROIC_KNOWN_FIXES_BASE] {
        for store in ["epic", "gog", "amazon", "steam"] {
            text = text.replace(&format!("{base}/{store}/"), "");
        }
    }
    text = text.replace("<APPFOLDER>/fixes/", "");
    if text.starts_with("Refusing known-fixes fetch for unsafe app name") {
        return Want::Exact("Refusing known-fixes fetch for an unsafe app name".to_string());
    }
    if let Some(at) = text.find(" request failed for ") {
        let end = at + text[at..].find(".json: ").expect("a file name") + ".json: ".len();
        return Want::Prefix(text[..end].to_string());
    }
    if let Some(at) = text.find(" is not valid JSON: ") {
        return Want::Exact(text[..at + " is not valid JSON".len()].to_string());
    }
    if let Some(rest) = text.strip_prefix("Known fixes fetch failed for ") {
        let end = "Known fixes fetch failed for ".len() + rest.find(": ").expect("an app name") + 2;
        return Want::Prefix(text[..end].to_string());
    }
    Want::Exact(text)
}

fn runner_of(name: &str) -> Runner {
    Runner::parse(name).unwrap_or_else(|| panic!("an unknown runner in a case: {name}"))
}

/// Runs one case; `(result, events, requests, tree)` in the golden's shapes, with the Rust-only checks made.
#[cfg(unix)]
async fn run_case(id: &str, case: &Value) -> (Value, Vec<(u64, String, String)>, Value, Value) {
    let rig = Rig::new(id);
    let mut steps = Vec::new();
    let mut events = Vec::new();
    let mut requests = Vec::new();
    for (index, step) in case["steps"].as_array().unwrap().iter().enumerate() {
        rig.rig_seed(step);
        let before_log = rig.log.lines().len();
        let before_requests = rig.requests().len();
        fetch_remote_known_fixes(
            &rig.ctx,
            step["appName"].as_str().unwrap(),
            runner_of(step["runner"].as_str().unwrap()),
        )
        .await;
        let made: Vec<FetchRequest> = rig.requests().into_iter().skip(before_requests).collect();
        for request in &made {
            // The equivalents of what axios recorded: a plain GET with the 10 000 ms deadline, and the
            // one header the client sends (the `User-Agent`).
            assert_eq!(request.method, Method::Get, "{id}: step {index}");
            assert_eq!(request.timeout, Some(FEED_REQUEST_TIMEOUT), "{id}");
            assert_eq!(FEED_REQUEST_TIMEOUT, Duration::from_millis(10_000));
            assert_eq!(request.headers.len(), 1, "{id}: only the User-Agent");
            assert_eq!(request.headers[0].0, "User-Agent", "{id}");
            assert!(request.body.is_none() && request.follow_redirects, "{id}");
            requests.push(format!("GET {}", request.url));
        }
        steps.push(json!({
            "appName": step["appName"],
            "runner": step["runner"],
            "via": step.get("via").cloned().unwrap_or(json!("injected")),
            "rejected": false,
            "returned": null,
            "requested": made.iter().map(|r| r.url.clone()).collect::<Vec<_>>(),
            "treeAfter": snapshot_tree(&rig),
        }));
        for (level, line) in rig.log.lines().into_iter().skip(before_log) {
            // Prohibition 1: a line carries a file name, a label and a category, never a URL or a path.
            assert!(
                !line.contains("://") && !line.contains(&*rig.home.root().to_string_lossy()),
                "{id}: a log line carries a URL or a path: {line}"
            );
            events.push((index as u64, level.to_string(), line));
        }
    }
    // A request the TS did not make, or one it made that Rust did not, fails the case.
    rig.tap
        .inner
        .finish()
        .unwrap_or_else(|e| panic!("{id}: {e}"));
    let tree = snapshot_tree(&rig);
    (json!({ "steps": steps }), events, json!(requests), tree)
}

impl Rig {
    fn rig_seed(&self, step: &Value) {
        self.seed(&step["seed"]);
    }
}

#[cfg(unix)]
#[tokio::test]
async fn every_fetcher_golden_replays() {
    let cases = load_cases();
    let mut compared = 0usize;
    let mut failures = Vec::new();
    for case in &cases {
        let id = case["id"].as_str().unwrap();
        let dir = golden_dir().join("expected").join(id);
        let (result, events, requests, tree) = run_case(id, case).await;

        // result.json: the golden's per-step answer without the axios option record (the replay asserted
        // its equivalents above).
        let mut want_result = read_json(&dir.join("result.json"));
        for step in want_result["steps"].as_array_mut().unwrap() {
            step.as_object_mut().unwrap().remove("axiosCalls");
        }
        if result != want_result {
            failures.push(format!(
                "{id}: result\n  want {want_result}\n  got  {result}"
            ));
        }
        let want_requests = read_json(&dir.join("requests.json"));
        if requests != want_requests {
            failures.push(format!(
                "{id}: requests\n  want {want_requests}\n  got  {requests}"
            ));
        }
        let want_tree = read_json(&dir.join("tree.json"));
        if tree != want_tree {
            failures.push(format!("{id}: tree\n  want {want_tree}\n  got  {tree}"));
        }
        let want_events = read_json(&dir.join("events.json"));
        let want_events = want_events.as_array().unwrap();
        let matches = want_events.len() == events.len()
            && want_events.iter().zip(&events).all(|(want, got)| {
                want["step"].as_u64() == Some(got.0)
                    && (want["level"] == "warning") == (got.1 == "warn")
                    && want["level"].as_str() != Some("error")
                    && want_line(want["text"].as_str().unwrap()).accepts(&got.2)
            });
        if !matches {
            failures.push(format!(
                "{id}: events\n  want {}\n  got  {events:?}",
                Value::Array(want_events.clone())
            ));
        }
        compared += 1;
    }
    assert!(
        failures.is_empty(),
        "{} differences over {compared} cases:\n{}",
        failures.len(),
        failures.join("\n")
    );
    check_floor("golden/fetcher cases compared", compared, FETCHER_FLOOR).unwrap();
    println!("compared {compared} fetcher cases");
}

#[test]
fn the_floor_matches_the_manifest_and_an_empty_list_fails() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    assert_eq!(manifest["floor"].as_u64().unwrap() as usize, FETCHER_FLOOR);
    assert_eq!(manifest["count"].as_u64().unwrap() as usize, FETCHER_FLOOR);
    assert_eq!(load_cases().len(), FETCHER_FLOOR);
    assert!(check_floor("an empty list", 0, FETCHER_FLOOR).is_err());
    assert!(check_floor("a short list", FETCHER_FLOOR - 1, FETCHER_FLOOR).is_err());
    assert!(check_floor("the full list", FETCHER_FLOOR, FETCHER_FLOOR).is_ok());
}

#[test]
fn every_case_has_recorded_exchanges_and_every_documented_delta_names_a_case() {
    let cases = load_cases();
    let ids: Vec<&str> = cases.iter().map(|c| c["id"].as_str().unwrap()).collect();
    for id in &ids {
        assert!(
            recorded_dir().join(id).join("exchanges.json").is_file(),
            "{id}: no recorded exchanges"
        );
        assert!(golden_dir().join("expected").join(id).is_dir(), "{id}");
    }
    let deltas = read_json(&golden_dir().join("deltas.json"));
    for id in deltas.as_object().unwrap().keys() {
        assert!(ids.contains(&id.as_str()), "a delta for no case: {id}");
    }
}

#[test]
fn the_feed_bases_are_the_ts_literals() {
    assert_eq!(
        GAMELIB_KNOWN_FIXES_BASE,
        "https://raw.githubusercontent.com/grayson-mitchell/known-fixes/main"
    );
    assert_eq!(
        HEROIC_KNOWN_FIXES_BASE,
        "https://raw.githubusercontent.com/Heroic-Games-Launcher/known-fixes/main"
    );
}
