//! The opt-in known-fix report client against the TS goldens (88-07 recorded them, 88-11 replays them;
//! D-03, D-15, T-88-29). `golden/report` holds 48 cases, each a list of steps run on one fresh fake HOME:
//!
//! - `run` / `detect`: `run_known_fix_report` (or the fire-and-forget entry point) for one detected fix,
//!   with the winning layer read from files seeded under `<APPFOLDER>/fixes` and `<HOME>/public/fixes`, and
//!   the sent records in the real `steam_known_fix_reports` store through `StoreHost`;
//! - `reset`, `setSent`, `setSettings`, `holds`, `abortAll`, `settle`, `turn`: the oracle's own controls;
//! - `filter`, `drift`, `parse`, `relayUrl`, `constants`: the schema and the pinned values.
//!
//! Every POST goes to gamelib-engine's `Replay` over `recorded/report/<case>/exchanges.json`, which pins
//! the method, URL, the two headers and the JSON body byte for byte, so no case opens a socket. A tap in
//! front of the replay keeps each request the client built (the 8 s timeout and the no-redirect switch are
//! the Rust equivalents of the axios options the oracle recorded) and can hold a request open, as the TS
//! case whose post never answers did. `result.json`, `events.json`, `requests.json` and `store.json` are
//! compared whole, and the `constants` case is compared with the Rust constants and with the shared schema
//! source `src/common/knownFixReport.ts`.
//!
//! Documented differences (`deltas.json`, and here): zod's wording of a refusal (the two messages the schema
//! writes itself are compared exactly, any other must be non-empty), a transport failure says what the seam
//! says, `reportDetectedFix` is a spawned task so it makes no post synchronously, the axios-only request
//! fields (`validateStatusAccepts`, `hasSignal`, `signalAbortedAtCall`) are not Rust concepts, and the sent
//! records are a file under `store_cache` where the oracle used an in-memory store, so the tree is not
//! compared. A count floor lives in this file, so editing the JSON alone cannot lower the bar, and an
//! empty case list fails.

use std::collections::BTreeMap;
use std::future::pending;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::fetch::{
    DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Method, Progress,
    Replay,
};
use gamelib_engine::testing::{FixedClock, RecordingLog};
use gamelib_knownfix::ctx::{KnownFixCtx, DEFAULT_RELAY_URL};
use gamelib_knownfix::jsvalue::JsValue;
use gamelib_knownfix::reader::filter_tier1_known_fixes;
use gamelib_knownfix::remote::{GAMELIB_KNOWN_FIXES_BASE, HEROIC_KNOWN_FIXES_BASE};
use gamelib_knownfix::report::{
    parse_known_fix_report, relay_url, report_detected_fix_with, report_sent_key,
    run_known_fix_report_with, CtxReportEnv, DetectedFix, Detector, ReportEnv, ReportKey, ReportOp,
    ReportOutcome, KNOWN_FIX_REPORT_MAX_BYTES, KNOWN_FIX_REPORT_PAIRS, KNOWN_FIX_REPORT_VERSION,
    RELAY_RESPONSE_STATUSES, RELAY_TIMEOUT, RELAY_URL_PENDING_SENTINEL, SENT_STORE_NAME,
};
use gamelib_knownfix::types::{LayeredFix, TIER1_KNOWN_FIX_KEYS, TIER1_ROUTING_KEYS};
use gamelib_store::host::{Store, StoreHost};
use gamelib_store::json::Json;
use gamelib_testutil::FakeHome;
use serde_json::{json, Map, Value};
use tokio_util::sync::CancellationToken;

/// `golden/report` holds 48 cases: the 29 titles of the three TS test files, the `constants` case and 18
/// rule cases. The plan asks for at least 30. A later edit may raise this, never lower it.
const REPORT_FLOOR: usize = 48;

const DEFAULT_VERSION: &str = "0.8.0";
const DEFAULT_RELAY: &str = "http://relay.test/v1/reports";
/// What a refusal's text is compared as when the wording is zod's (`deltas.json`).
const REFUSED: &str = "<refused>";

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/report")
}

fn recorded_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/recorded/report")
}

fn repo_file(relative: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join(relative)
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

/// Keeps each request the client built, then lets the replay serve it; while a hold is pending, the
/// answer never arrives (the oracle's `answer: "hang"`), so only the shutdown token ends the wait.
struct Tap {
    inner: Replay,
    seen: Mutex<Vec<FetchRequest>>,
    /// How many of the next posts are held open.
    holds: Mutex<usize>,
}

impl Tap {
    fn count(&self) -> usize {
        self.seen.lock().unwrap().len()
    }

    fn take_hold(&self) -> bool {
        let mut holds = self.holds.lock().unwrap();
        let held = *holds > 0;
        *holds = holds.saturating_sub(1);
        held
    }
}

impl Fetch for Tap {
    fn get(&self, req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        self.seen.lock().unwrap().push(req.clone());
        // The replay still matches the request and consumes its recorded exchange; only then is it held.
        let served = self.inner.get(req);
        let hold = self.take_hold();
        Box::pin(async move {
            let answer = served.await;
            if hold {
                pending::<()>().await;
            }
            answer
        })
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

/// The real environment, except where a case makes the platform probe or the layer read throw.
struct CaseEnv {
    real: CtxReportEnv,
    mac_error: Option<&'static str>,
    winning_error: Option<&'static str>,
}

impl ReportEnv for CaseEnv {
    fn is_mac(&self) -> Result<bool, String> {
        match self.mac_error {
            Some(message) => Err(message.to_string()),
            None => self.real.is_mac(),
        }
    }

    fn winning(&self, app_id: &str) -> Result<Option<LayeredFix>, String> {
        match self.winning_error {
            Some(message) => Err(message.to_string()),
            None => self.real.winning(app_id),
        }
    }

    fn sent(&self, key: &str) -> Result<Option<Json>, String> {
        self.real.sent(key)
    }

    fn record_sent(&self, key: &str, at: u64, status: u16) -> Result<(), String> {
        self.real.record_sent(key, at, status)
    }
}

struct Rig {
    home: FakeHome,
    log: Arc<RecordingLog>,
    tap: Arc<Tap>,
    ctx: KnownFixCtx,
    store: Arc<Store>,
    version: String,
    platform: String,
    settings: Value,
    /// The background runs started and not yet settled: the fix and the task.
    background: Vec<(Value, tokio::task::JoinHandle<ReportOutcome>)>,
}

fn platform_of(name: &str) -> Platform {
    match name {
        "linux" => Platform::Linux,
        "windows" => Platform::Windows,
        _ => Platform::Mac,
    }
}

impl Rig {
    fn new(id: &str, case: &Value) -> Rig {
        let home = FakeHome::new("knownfix-report-golden-");
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        let log = Arc::new(RecordingLog::new());
        let replay = Replay::from_case(&recorded_dir().join(id)).unwrap();
        let tap = Arc::new(Tap {
            inner: replay,
            seen: Mutex::new(Vec::new()),
            holds: Mutex::new(0),
        });
        let platform = case["platform"].as_str().unwrap_or("mac").to_string();
        let version = case["version"]
            .as_str()
            .unwrap_or(DEFAULT_VERSION)
            .to_string();
        // `relayEnv: null` is the variable unset (the context is handed none, so the deployed relay is
        // used); no key at all is the oracle's default test relay.
        let relay = match case.get("relayEnv") {
            Some(Value::String(url)) => url.as_str(),
            Some(_) => "",
            None => DEFAULT_RELAY,
        };
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(FixedClock::new(1234)),
            platform_of(&platform),
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
        .with_fetch(tap.clone())
        .with_app_version(version.clone());
        let bundled = root.join("public").join("fixes");
        let ctx = KnownFixCtx::new(Arc::new(engine), Some(bundled), relay, version.clone());
        let store = ctx
            .engine
            .host
            .open_cache(
                &ctx.engine.paths.user_data.join("store_cache"),
                SENT_STORE_NAME,
            )
            .unwrap();
        Rig {
            home,
            log,
            tap,
            ctx,
            store,
            version,
            platform,
            settings: case
                .get("settings")
                .cloned()
                .unwrap_or_else(|| json!({"shareDetectedFixes": true})),
            background: Vec::new(),
        }
    }

    fn enabled(&self) -> bool {
        self.settings["shareDetectedFixes"] == json!(true)
    }

    /// `<APPFOLDER>/...` and `<HOME>/...` as real paths.
    fn real(&self, golden_path: &str) -> PathBuf {
        if let Some(rest) = golden_path.strip_prefix("<APPFOLDER>") {
            return self
                .home
                .root()
                .join(".config")
                .join("GameLib")
                .join(rest.trim_start_matches('/'));
        }
        if let Some(rest) = golden_path.strip_prefix("<HOME>") {
            return self.home.root().join(rest.trim_start_matches('/'));
        }
        panic!("a seed path outside <APPFOLDER> and <HOME>: {golden_path}");
    }

    fn seed(&self, seeds: &Value) {
        for seed in seeds.as_array().into_iter().flatten() {
            let path = self.real(seed["path"].as_str().unwrap());
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, seed["text"].as_str().unwrap()).unwrap();
        }
    }

    fn env(&self, step: &Value) -> CaseEnv {
        CaseEnv {
            real: CtxReportEnv::new(&self.ctx),
            mac_error: step["isMacThrows"].as_bool().and(Some("sync boom")),
            winning_error: step["readWinningThrows"].as_bool().and(Some("boom")),
        }
    }

    /// The store as the oracle's `store.json` `final` shows it.
    fn store_view(&self) -> BTreeMap<String, Value> {
        self.store
            .snapshot()
            .into_iter()
            .map(|(key, value)| (key, value.to_value()))
            .collect()
    }

    fn sent_key_of(fix: &Value) -> String {
        report_sent_key(
            fix["appId"].as_str().unwrap(),
            ReportKey::parse(fix["key"].as_str().unwrap()).unwrap(),
            ReportOp::parse(fix["op"].as_str().unwrap()).unwrap(),
        )
    }

    fn holds(&self, fix: &Value) -> bool {
        self.ctx.report_in_flight.holds(&Rig::sent_key_of(fix))
    }

    fn prepare_answer(&self, step: &Value) {
        if step["answer"] == json!("hang") {
            *self.tap.holds.lock().unwrap() += 1;
        }
    }
}

fn detected(fix: &Value) -> DetectedFix {
    DetectedFix {
        app_id: fix["appId"].as_str().unwrap().to_string(),
        key: ReportKey::parse(fix["key"].as_str().unwrap()).unwrap(),
        op: ReportOp::parse(fix["op"].as_str().unwrap()).unwrap(),
        detector: Detector::parse(fix["detector"].as_str().unwrap()).unwrap(),
    }
}

/// Lets every task that can make progress do so (a spawned report, a cancelled post).
async fn turn() {
    for _ in 0..64 {
        tokio::task::yield_now().await;
    }
}

/// What a log line must be: the whole text, or a start and an end around something non-empty (the seam's
/// or the schema's own wording).
enum Want {
    Exact(String),
    Wrapped(String, String),
}

impl Want {
    fn accepts(&self, line: &str) -> bool {
        match self {
            Want::Exact(text) => line == text,
            Want::Wrapped(start, end) => {
                line.starts_with(start.as_str())
                    && line.ends_with(end.as_str())
                    && line.len() > start.len() + end.len()
            }
        }
    }
}

/// The two messages the schema writes itself; the rest of a refusal is zod's wording.
fn is_schema_message(text: &str) -> bool {
    matches!(
        text,
        "pair not allowed"
            | "only macArch can be removed"
            | "pair not allowed; only macArch can be removed"
    )
}

/// The Rust log level in the golden's words: the oracle's `warning` is the context's `warn`; `info` and
/// `error` are the same on both sides, so an info line that came out as an error (or the reverse) differs.
fn golden_level(level: &str) -> &str {
    if level == "warn" {
        "warning"
    } else {
        level
    }
}

fn want_line(golden: &str) -> Want {
    const SEND_FAILED: &str = "Known-fix report: send failed for appId ";
    const INVALID: &str = "Known-fix report: invalid report not sent (";
    if let Some(rest) = golden.strip_prefix(SEND_FAILED) {
        let open = rest.rfind(" (").expect("a reason in brackets");
        let reason = &rest[open + 2..rest.len() - 1];
        if reason != "aborted" {
            return Want::Wrapped(format!("{SEND_FAILED}{} (", &rest[..open]), ")".to_string());
        }
    }
    if let Some(rest) = golden.strip_prefix(INVALID) {
        let message = &rest[..rest.len() - 1];
        if !is_schema_message(message) {
            return Want::Wrapped(INVALID.to_string(), ")".to_string());
        }
    }
    Want::Exact(golden.to_string())
}

/// A refusal's text as it is compared: the schema's own messages as they are, zod's wording as one word.
fn norm_error(text: &str) -> String {
    if is_schema_message(text) {
        text.to_string()
    } else {
        REFUSED.to_string()
    }
}

/// `typeof` the number the oracle records for a body's byte length etc. is plain data: the request as
/// `requests.json` records it, minus the axios-only fields.
fn request_entry(step: usize, request: &FetchRequest) -> Value {
    let body = String::from_utf8(request.body.clone().expect("a POST has a body")).unwrap();
    let headers: Map<String, Value> = request
        .headers
        .iter()
        .map(|(k, v)| (k.to_ascii_lowercase(), json!(v)))
        .collect();
    let keys: Vec<String> = match JsValue::parse(&body).unwrap() {
        JsValue::Object(entries) => entries.into_iter().map(|(k, _)| k).collect(),
        other => panic!("the body is not an object: {}", other.stringify()),
    };
    json!({
        "step": step,
        "method": request.method.as_str(),
        "url": request.url,
        "headers": headers,
        "body": serde_json::from_str::<Value>(&body).unwrap(),
        "bodyKeys": keys,
        "bodyBytes": body.len(),
        "bodyWithinMaxBytes": body.len() <= KNOWN_FIX_REPORT_MAX_BYTES,
        "bodyParses": true,
        "timeoutMs": request.timeout.map(|t| t.as_millis() as u64),
        "maxRedirects": if request.follow_redirects { 5 } else { 0 },
    })
}

/// The oracle's `constants` step, from the Rust constants.
fn constants_step() -> Value {
    let pairs: Map<String, Value> = KNOWN_FIX_REPORT_PAIRS
        .iter()
        .map(|(k, v)| ((*k).to_string(), json!(v)))
        .collect();
    json!({
        "op": "constants",
        "pairs": pairs,
        "version": KNOWN_FIX_REPORT_VERSION,
        "maxBytes": KNOWN_FIX_REPORT_MAX_BYTES,
        "tier1RoutingKeys": TIER1_ROUTING_KEYS,
        "tier1AllowList": TIER1_KNOWN_FIX_KEYS,
        "relayUrl": DEFAULT_RELAY_URL,
        "relayUrlContainsThePendingSentinel": DEFAULT_RELAY_URL.contains(RELAY_URL_PENDING_SENTINEL),
        "relayUrlIsAWorkersDevEndpoint": DEFAULT_RELAY_URL.contains(".workers.dev/"),
        "pendingSentinel": RELAY_URL_PENDING_SENTINEL,
        "relayResponseStatuses": RELAY_RESPONSE_STATUSES,
        "relayTimeoutMs": RELAY_TIMEOUT.as_millis() as u64,
        "gamelibFeedBase": GAMELIB_KNOWN_FIXES_BASE,
        "heroicFeedBase": HEROIC_KNOWN_FIXES_BASE,
    })
}

/// One `parse` step: every input through the schema.
fn parse_step(step: &Value) -> Value {
    let parsed: Vec<Value> = step["inputs"]
        .as_array()
        .unwrap()
        .iter()
        .map(|input| {
            let result = match parse_known_fix_report(input) {
                Ok(report) => json!({"ok": true, "report": serde_json::from_str::<Value>(&report.body()).unwrap()}),
                Err(error) => {
                    assert!(!error.is_empty(), "a refusal with no message");
                    json!({"ok": false, "error": norm_error(&error)})
                }
            };
            json!({"input": input, "result": result})
        })
        .collect();
    json!({
        "op": "parse",
        "parsed": parsed,
        "sentKey": report_sent_key("220", ReportKey::MacArch, ReportOp::Add),
    })
}

/// A golden `result.json` as the Rust side is specified to answer it (`deltas.json`).
fn expected_result(golden: &Value) -> Value {
    let mut want = golden.clone();
    for step in want["steps"].as_array_mut().unwrap() {
        match step["op"].as_str().unwrap() {
            // A spawned task makes no post before it returns.
            "detect" => step["postsMadeSynchronously"] = json!(0),
            "parse" => {
                for item in step["parsed"].as_array_mut().unwrap() {
                    if item["result"]["ok"] == json!(false) {
                        let error = item["result"]["error"].as_str().unwrap().to_string();
                        item["result"]["error"] = json!(norm_error(&error));
                    }
                }
            }
            _ => {}
        }
    }
    want
}

/// The golden request entry without the fields only axios has.
fn expected_request(golden: &Value) -> Value {
    let mut want = golden.clone();
    let entry = want.as_object_mut().unwrap();
    for axios_only in ["validateStatusAccepts", "hasSignal", "signalAbortedAtCall"] {
        entry.remove(axios_only);
    }
    // The oracle records `maxRedirects: 0`; the Rust request says it with the no-redirect switch.
    want
}

struct Played {
    result: Value,
    events: Vec<(u64, String, String)>,
    requests: Vec<Value>,
    store: Value,
}

async fn run_case(id: &str, case: &Value) -> Played {
    let mut rig = Rig::new(id, case);
    let mut steps: Vec<Value> = Vec::new();
    let mut events: Vec<(u64, String, String)> = Vec::new();
    let mut writes: Vec<Value> = Vec::new();
    let mut baseline = rig.store_view();

    for (index, step) in case["steps"].as_array().unwrap().iter().enumerate() {
        rig.seed(&step["seed"]);
        let before_log = rig.log.lines().len();
        let before_posts = rig.tap.count();
        let mut counts_as_write = true;
        let answer = step["answer"].clone();
        let shown = match step["op"].as_str().unwrap() {
            "run" if step["background"] == json!(true) => {
                rig.prepare_answer(step);
                let fix = detected(&step["fix"]);
                let (ctx, enabled) = (rig.ctx.clone(), rig.enabled());
                let env = rig.env(step);
                let handle = tokio::spawn(async move {
                    run_known_fix_report_with(&ctx, &fix, enabled, &env).await
                });
                // The post is made as the task first runs.
                for _ in 0..1000 {
                    if rig.tap.count() > before_posts || handle.is_finished() {
                        break;
                    }
                    tokio::task::yield_now().await;
                }
                rig.background.push((step["fix"].clone(), handle));
                json!({"op": "run", "fix": step["fix"], "answer": answer, "background": true,
                       "postsMade": rig.tap.count() - before_posts})
            }
            "run" => {
                rig.prepare_answer(step);
                let fix = detected(&step["fix"]);
                let env = rig.env(step);
                let outcome = run_known_fix_report_with(&rig.ctx, &fix, rig.enabled(), &env).await;
                let key = Rig::sent_key_of(&step["fix"]);
                let view = rig.store_view();
                json!({"op": "run", "fix": step["fix"], "answer": answer,
                       "outcome": outcome.as_str(),
                       "postsMade": rig.tap.count() - before_posts,
                       "sentRecord": view.get(&key).cloned().unwrap_or(Value::Null),
                       "sentStoreSize": view.len(),
                       "registryHoldsIt": rig.holds(&step["fix"])})
            }
            "detect" => {
                let env = Arc::new(rig.env(step));
                report_detected_fix_with(&rig.ctx, detected(&step["fix"]), rig.enabled(), env);
                turn().await;
                json!({"op": "detect", "fix": step["fix"], "returnedUndefined": true,
                       "threw": false, "postsMadeSynchronously": 0,
                       "postsMade": rig.tap.count() - before_posts})
            }
            "reset" => {
                counts_as_write = false;
                for (key, _) in rig.store.snapshot() {
                    rig.store.remove(&key).unwrap();
                }
                json!({"op": "reset"})
            }
            "setSent" => {
                counts_as_write = false;
                let key = step["key"].as_str().unwrap();
                rig.store
                    .set(key, Json::from(step["value"].clone()))
                    .unwrap();
                json!({"op": "setSent", "key": step["key"], "value": step["value"]})
            }
            "setSettings" => {
                rig.settings = step["settings"].clone();
                json!({"op": "setSettings", "settings": step["settings"]})
            }
            "turn" => {
                turn().await;
                json!({"op": "turn"})
            }
            "holds" => {
                let held: Vec<Value> = step["fixes"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|fix| json!({"fix": fix, "held": rig.holds(fix)}))
                    .collect();
                json!({"op": "holds", "held": held})
            }
            "abortAll" => {
                // The registry's abort-all is the shutdown token; the cancelled posts log as they stop.
                rig.ctx.engine.shutdown.token().cancel();
                turn().await;
                json!({"op": "abortAll"})
            }
            "settle" => {
                let mut settled = Vec::new();
                for (fix, handle) in std::mem::take(&mut rig.background) {
                    let outcome = handle.await.unwrap();
                    settled.push(json!({"fix": fix, "outcome": outcome.as_str()}));
                }
                json!({"op": "settle", "settled": settled})
            }
            "filter" => {
                counts_as_write = false;
                let (key, value) = (step["key"].as_str().unwrap(), step["value"].clone());
                let parsed = JsValue::from_value(&json!({ key: value.clone() }));
                let kept = filter_tier1_known_fixes(&rig.ctx, "x", "test", &parsed).unwrap();
                let filtered = serde_json::to_value(&kept).unwrap();
                let candidate = json!({"v": 1, "store": "steam", "appId": "220", "key": key,
                                       "value": value, "op": "add", "gamelibVersion": "0.8.0"});
                json!({"op": "filter", "key": key, "value": value,
                       "kept": kept.get(key).is_some(),
                       "filtered": filtered,
                       "schemaAccepts": parse_known_fix_report(&candidate).is_ok()})
            }
            "drift" => {
                let mut pair_keys: Vec<&str> = KNOWN_FIX_REPORT_PAIRS.iter().map(|p| p.0).collect();
                pair_keys.sort_unstable();
                let mut routing: Vec<&str> = TIER1_ROUTING_KEYS.to_vec();
                routing.sort_unstable();
                json!({"op": "drift", "pairKeys": pair_keys, "routingKeys": routing})
            }
            "parse" => parse_step(step),
            "constants" => constants_step(),
            "relayUrl" => {
                // The shell resolves the override once and hands the context the answer; an empty value is
                // "unset", which falls back to the deployed relay.
                let handed = step["env"].as_str().unwrap_or_default();
                let ctx =
                    KnownFixCtx::new(rig.ctx.engine.clone(), None, handed, rig.version.clone());
                json!({"op": "relayUrl", "env": step["env"], "url": relay_url(&ctx)})
            }
            other => panic!("{id}: an unknown step op {other}"),
        };
        steps.push(shown);

        for (level, line) in rig.log.lines().into_iter().skip(before_log) {
            // Prohibition 1: a line carries ids, keys and status words, never a URL or a path.
            assert!(
                !line.contains("://") && !line.contains(&*rig.home.root().to_string_lossy()),
                "{id}: a log line carries a URL or a path: {line}"
            );
            events.push((index as u64, level.to_string(), line));
        }
        let after = rig.store_view();
        if counts_as_write {
            for (key, value) in &after {
                if baseline.get(key) != Some(value) {
                    writes.push(json!({"step": index, "key": key, "value": value}));
                }
            }
        }
        baseline = after;
    }

    // A request the TS did not make, or one it made that Rust did not, fails the case.
    rig.tap
        .inner
        .finish()
        .unwrap_or_else(|e| panic!("{id}: {e}"));
    assert!(
        rig.background.is_empty(),
        "{id}: a background run was never settled"
    );
    assert!(
        rig.ctx.report_in_flight.is_empty(),
        "{id}: a report was left in flight"
    );

    let mut requests = Vec::new();
    let mut seen_before = 0usize;
    // The step each request was made in is the step whose `postsMade` counted it.
    for (index, shown) in steps.iter().enumerate() {
        let made = shown["postsMade"].as_u64().unwrap_or(0) as usize;
        let seen = rig.tap.seen.lock().unwrap().clone();
        for request in seen.iter().skip(seen_before).take(made) {
            requests.push(request_entry(index, request));
        }
        seen_before += made;
    }
    let seen = rig.tap.seen.lock().unwrap().clone();
    assert_eq!(
        seen_before,
        seen.len(),
        "{id}: a request in no step's count"
    );
    for request in &seen {
        // The Rust equivalents of the options axios recorded.
        assert_eq!(request.method, Method::Post, "{id}");
        assert_eq!(request.timeout, Some(RELAY_TIMEOUT), "{id}");
        assert!(!request.follow_redirects, "{id}: redirects must be off");
        let mut names: Vec<String> = request
            .headers
            .iter()
            .map(|(k, _)| k.to_ascii_lowercase())
            .collect();
        names.sort();
        assert_eq!(names, ["content-type", "user-agent"], "{id}");
    }

    Played {
        result: json!({
            "platform": rig.platform,
            "settings": rig.settings_at_start(case),
            "version": rig.version,
            "steps": steps,
        }),
        events,
        requests,
        store: json!({"writes": writes, "final": rig.store_view()}),
    }
}

impl Rig {
    /// The settings the case started with (a step may change them since).
    fn settings_at_start(&self, case: &Value) -> Value {
        case.get("settings")
            .cloned()
            .unwrap_or_else(|| json!({"shareDetectedFixes": true}))
    }
}

#[tokio::test]
async fn every_report_golden_replays() {
    let cases = load_cases();
    let mut compared = 0usize;
    let mut failures = Vec::new();
    for case in &cases {
        let id = case["id"].as_str().unwrap();
        let dir = golden_dir().join("expected").join(id);
        let played = run_case(id, case).await;

        let want_result = expected_result(&read_json(&dir.join("result.json")));
        if played.result != want_result {
            failures.push(format!(
                "{id}: result\n  want {want_result}\n  got  {}",
                played.result
            ));
        }
        let want_requests: Vec<Value> = read_json(&dir.join("requests.json"))
            .as_array()
            .unwrap()
            .iter()
            .map(expected_request)
            .collect();
        if played.requests != want_requests {
            failures.push(format!(
                "{id}: requests\n  want {}\n  got  {}",
                Value::Array(want_requests.clone()),
                Value::Array(played.requests.clone())
            ));
        }
        let want_store = read_json(&dir.join("store.json"));
        if played.store != want_store {
            failures.push(format!(
                "{id}: store\n  want {want_store}\n  got  {}",
                played.store
            ));
        }
        let want_events = read_json(&dir.join("events.json"));
        let want_events = want_events.as_array().unwrap();
        let matches = want_events.len() == played.events.len()
            && want_events.iter().zip(&played.events).all(|(want, got)| {
                want["step"].as_u64() == Some(got.0)
                    && want["level"].as_str() == Some(golden_level(&got.1))
                    && want_line(want["text"].as_str().unwrap()).accepts(&got.2)
            });
        if !matches {
            failures.push(format!(
                "{id}: events\n  want {}\n  got  {:?}",
                Value::Array(want_events.clone()),
                played.events
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
    check_floor("golden/report cases compared", compared, REPORT_FLOOR).unwrap();
    println!("compared {compared} report cases");
}

#[test]
fn the_floor_matches_the_manifest_and_an_empty_list_fails() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    assert_eq!(manifest["floor"].as_u64().unwrap() as usize, REPORT_FLOOR);
    assert_eq!(manifest["count"].as_u64().unwrap() as usize, REPORT_FLOOR);
    assert_eq!(load_cases().len(), REPORT_FLOOR);
    assert!(check_floor("an empty list", 0, REPORT_FLOOR).is_err());
    assert!(check_floor("a short list", REPORT_FLOOR - 1, REPORT_FLOOR).is_err());
    assert!(check_floor("the full list", REPORT_FLOOR, REPORT_FLOOR).is_ok());
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

/// The `constants` case, recorded from `src/common/knownFixReport.ts` and the TS report client (deleted in 88-16) by
/// the oracle, is what the Rust constants must equal.
#[test]
fn the_constants_case_equals_the_rust_constants() {
    let recorded = read_json(&golden_dir().join("expected/constants/result.json"));
    assert_eq!(recorded["steps"][0], constants_step());
    assert_eq!(recorded["steps"].as_array().unwrap().len(), 1);
}

/// The same pins read straight from the shared schema source, so a change on the TS side that the golden
/// has not been re-recorded for still fails here (the relay worker bundles that file). The TS report client
/// (`src/backend/knownFixReport.ts`) is gone, so the client's own constants (the relay URL, its pending sentinel,
/// the 8 s timeout) are pinned by the recorded `constants` case above and by the asserts on the Rust values below.
#[test]
fn the_constants_equal_the_shared_schema_source() {
    let shared = std::fs::read_to_string(repo_file("src/common/knownFixReport.ts")).unwrap();
    assert!(shared.contains("{ macArch: '32', drm: 'ceg' } as const"));
    assert_eq!(KNOWN_FIX_REPORT_PAIRS, [("macArch", "32"), ("drm", "ceg")]);
    assert!(shared.contains(&format!(
        "KNOWN_FIX_REPORT_VERSION = {KNOWN_FIX_REPORT_VERSION}\n"
    )));
    assert!(shared.contains(&format!(
        "KNOWN_FIX_REPORT_MAX_BYTES = {KNOWN_FIX_REPORT_MAX_BYTES}\n"
    )));
    for status in RELAY_RESPONSE_STATUSES {
        assert!(shared.contains(&format!("'{status}'")), "{status}");
    }
    let listed = shared
        .split("RELAY_RESPONSE_STATUSES = [")
        .nth(1)
        .unwrap()
        .split(']')
        .next()
        .unwrap()
        .matches('\'')
        .count();
    assert_eq!(listed, RELAY_RESPONSE_STATUSES.len() * 2);
    assert!(shared.contains("appId: z.string().regex(/^[1-9][0-9]{0,9}$/)"));
    assert!(shared.contains("gamelibVersion: z.string().regex(/^[0-9A-Za-z.+-]{1,40}$/)"));
    assert_eq!(RELAY_TIMEOUT, Duration::from_millis(8000));
}

/// A Mac context over a fresh fake HOME whose network is `fetch`.
fn bare_ctx(home: &FakeHome, fetch: Arc<dyn Fetch>) -> (KnownFixCtx, Arc<RecordingLog>) {
    let root = home.root().to_path_buf();
    let log = Arc::new(RecordingLog::new());
    let engine = EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(FixedClock::new(1234)),
        Platform::Mac,
        EnginePaths {
            tools_path: root.join("tools"),
            user_data: root.join("userData"),
            app_folder: root.clone(),
            user_home: root.clone(),
            temp: root.join("tmp"),
        },
        Shutdown::new(),
    )
    .with_log(log.clone())
    .with_fetch(fetch);
    (
        KnownFixCtx::new(Arc::new(engine), None, DEFAULT_RELAY, DEFAULT_VERSION),
        log,
    )
}

/// A network that never answers.
struct Silent;

impl Fetch for Silent {
    fn get(&self, _req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        Box::pin(pending())
    }

    fn download<'a>(
        &'a self,
        _req: FetchRequest,
        _dest: &'a Path,
        _progress: &'a (dyn Fn(Progress) + Send + Sync),
        _cancel: CancellationToken,
    ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
        Box::pin(pending())
    }
}

fn macho_fix() -> DetectedFix {
    DetectedFix {
        app_id: "220".to_string(),
        key: ReportKey::MacArch,
        op: ReportOp::Add,
        detector: Detector::Macho,
    }
}

/// The relay's 8 s bound holds even for a network that ignores the request's own timeout, and the report
/// is then `retryable`, not recorded and no longer in flight. The clock is paused, so nothing waits.
#[tokio::test(start_paused = true)]
async fn an_unanswered_post_is_given_up_after_8_seconds_and_is_retryable() {
    let home = FakeHome::new("knownfix-report-timeout-");
    let (ctx, log) = bare_ctx(&home, Arc::new(Silent));
    let env = CtxReportEnv::new(&ctx);
    let started = tokio::time::Instant::now();
    let outcome = run_known_fix_report_with(&ctx, &macho_fix(), true, &env).await;
    assert_eq!(outcome, ReportOutcome::Retryable);
    assert_eq!(started.elapsed(), RELAY_TIMEOUT);
    assert!(ctx.report_in_flight.is_empty());
    assert_eq!(env.sent("220:macArch:add").unwrap(), None);
    let lines: Vec<String> = log.lines().into_iter().map(|(_, l)| l).collect();
    assert_eq!(
        lines.last().unwrap(),
        "Known-fix report: send failed for appId 220 macArch add (timeout)"
    );
}

/// Shutdown mid-post: the op answers `<op>:shutdown`, the in-flight place is freed by dropping the work,
/// and the `knownfix` registrant is released so the exit drain is not held.
#[tokio::test]
async fn a_shutdown_during_the_post_frees_the_place_and_the_registrant() {
    let home = FakeHome::new("knownfix-report-shutdown-");
    let (ctx, _log) = bare_ctx(&home, Arc::new(Silent));
    let args = json!({"appId": "220", "key": "macArch", "op": "add", "detector": "macho",
                      "enabled": true});
    let token = ctx.engine.shutdown.token();
    let canceller = {
        let ctx = ctx.clone();
        tokio::spawn(async move {
            while !ctx.report_in_flight.holds("220:macArch:add") {
                tokio::task::yield_now().await;
            }
            token.cancel();
        })
    };
    let err = gamelib_knownfix::dispatch("knownfix_report_detected", &[args], &ctx)
        .await
        .unwrap_err();
    canceller.await.unwrap();
    assert_eq!(err, "knownfix_report_detected:shutdown");
    assert!(ctx.report_in_flight.is_empty());
    assert!(ctx
        .engine
        .shutdown
        .drain(Duration::from_millis(50))
        .is_empty());
}

/// The op takes one strict object, never echoes what it was given, and the disabled and non-Mac gates
/// answer without touching the network (`Silent` would hang).
#[tokio::test]
async fn the_report_op_decodes_one_strict_object_and_answers_the_outcome_word() {
    let home = FakeHome::new("knownfix-report-op-");
    let (ctx, _log) = bare_ctx(&home, Arc::new(Silent));
    let op = "knownfix_report_detected";
    let good = json!({"appId": "220", "key": "macArch", "op": "add", "detector": "macho",
                      "enabled": false});
    let secret = "SECRET-VALUE-".repeat(30);
    for bad in [
        vec![],
        vec![good.clone(), good.clone()],
        vec![json!([["220", "macArch", "add", "macho", false]])],
        vec![json!({"appId": "220", "key": "macArch", "op": "add", "detector": "macho"})],
        vec![
            json!({"appId": "220", "key": "macArch", "op": "add", "detector": "macho",
                    "enabled": "yes"}),
        ],
        vec![
            json!({"appId": "220", "key": "title", "op": "add", "detector": "macho",
                    "enabled": true}),
        ],
        vec![
            json!({"appId": "220", "key": "macArch", "op": "delete", "detector": "macho",
                    "enabled": true}),
        ],
        vec![
            json!({"appId": "220", "key": "macArch", "op": "add", "detector": secret,
                    "enabled": true}),
        ],
        vec![
            json!({"appId": secret, "key": "macArch", "op": "add", "detector": "macho",
                    "enabled": true}),
        ],
        vec![
            json!({"appId": "220", "key": "macArch", "op": "add", "detector": "macho",
                    "enabled": true, "extra": secret}),
        ],
    ] {
        let err = gamelib_knownfix::dispatch(op, &bad, &ctx)
            .await
            .unwrap_err();
        assert_eq!(err, format!("{op}:bad-args"), "{bad:?}");
        assert!(!err.contains("SECRET"), "{err}");
    }
    assert_eq!(
        gamelib_knownfix::dispatch(op, &[good], &ctx).await,
        Ok(json!("disabled"))
    );
    let linux = {
        let root = home.root().to_path_buf();
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(FixedClock::new(1)),
            Platform::Linux,
            EnginePaths {
                tools_path: root.join("tools"),
                user_data: root.join("userData"),
                app_folder: root.clone(),
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_fetch(Arc::new(Silent));
        KnownFixCtx::new(Arc::new(engine), None, DEFAULT_RELAY, DEFAULT_VERSION)
    };
    let enabled = json!({"appId": "220", "key": "drm", "op": "add", "detector": "ceg",
                         "enabled": true});
    assert_eq!(
        gamelib_knownfix::dispatch(op, &[enabled], &linux).await,
        Ok(json!("not-mac"))
    );
}

/// The remote-fetch op takes one strict object too, and a refused name or a sideload game asks nothing.
#[tokio::test]
async fn the_fetch_remote_op_decodes_one_strict_object_and_asks_nothing_for_a_refused_name() {
    let home = FakeHome::new("knownfix-fetch-op-");
    let (ctx, log) = bare_ctx(&home, Arc::new(Silent));
    let op = "knownfix_fetch_remote";
    let secret = "SECRET-APP-".repeat(40);
    for bad in [
        vec![],
        vec![json!(["1", "gog"])],
        vec![json!({"appName": "1"})],
        vec![json!({"appName": "1", "runner": "epic"})],
        vec![json!({"appName": "", "runner": "gog"})],
        vec![json!({"appName": secret, "runner": "gog"})],
        vec![json!({"appName": "1", "runner": "gog", "extra": 1})],
    ] {
        let err = gamelib_knownfix::dispatch(op, &bad, &ctx)
            .await
            .unwrap_err();
        assert_eq!(err, format!("{op}:bad-args"), "{bad:?}");
        assert!(!err.contains("SECRET"), "{err}");
    }
    // `Silent` would hang a request: both of these answer without making one.
    for args in [
        json!({"appName": "../escape", "runner": "gog"}),
        json!({"appName": "1", "runner": "sideload"}),
    ] {
        assert_eq!(
            gamelib_knownfix::dispatch(op, &[args], &ctx).await,
            Ok(Value::Null)
        );
    }
    let lines: Vec<String> = log.lines().into_iter().map(|(_, l)| l).collect();
    assert_eq!(
        lines,
        ["Refusing known-fixes fetch for an unsafe app name"],
        "the refused name is not echoed"
    );
}
