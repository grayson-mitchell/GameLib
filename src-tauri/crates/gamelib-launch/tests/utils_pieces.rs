//! The Rust replay of the Epic status goldens 88.1-02 recorded from the TypeScript (`golden/epic_status`, 70
//! cases): `isEpicServiceOffline` over the recorded exchanges, its pure decision `checkEpicServiceOffline` and
//! `isNetworkLevelFailure`.
//!
//! Every request is served by gamelib-engine's `Replay` over `recorded/epic_status/<case>/exchanges.json`, so
//! no case opens a socket; a request the TS did not make, or a recorded one the Rust did not make, fails the
//! case. The online flag is `EngineCtx.online`, the notification goes through a recording `EngineUi` with the
//! real English catalogue, and the log is a recording `EngineLog`.
//!
//! The one documented difference is `epic-status-log-fixed-text` in `deltas.json` (prohibition 1): the TS logged
//! the error object, so its two log lines end with a JavaScript error text or an error code. Rust's lines are
//! fixed text with a category (`status(503)`, `unexpected-response`) and never the status URL. Level, line prefix
//! and count are compared; the suffix is replaced by the rule below.
//!
//! A count floor lives in this file, so editing the JSON alone cannot lower the bar, and an empty case list
//! fails.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::fetch::{
    DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Progress, Replay,
};
use gamelib_engine::testing::{RecordingLog, RecordingUi, UiEvent};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::prepare::epic::{
    check_epic_service_offline, epic_service_offline, Callback, EpicService, StatusFailure,
};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use serde_json::{json, Value};

/// `golden/epic_status` holds 70 cases, the MANIFEST floor; a later edit may raise this, never lower it.
const EPIC_STATUS_FLOOR: usize = 70;

/// The `call.op` kinds this file replays. The test fails when `cases.json` holds a kind that is not listed, so
/// a new kind cannot be counted without being compared.
const HANDLED_OPS: [&str; 3] = ["isOffline", "networkLevel", "check"];

/// The version the oracle's requests carried in their `User-Agent` (`GameLib/oracle (+...)`).
const ORACLE_VERSION: &str = "oracle";

/// The delta this slice records: the log lines carry fixed text, not the JavaScript error.
const FIXED_TEXT_DELTA: &str = "epic-status-log-fixed-text";

/// The codes `EPIC_NETWORK_ERROR_CODES` of `epicServiceStatus.ts` lists, which make a plain errno-style object a
/// network-level failure.
const LISTED_CODES: [&str; 11] = [
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNABORTED",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "ENETDOWN",
    "EHOSTDOWN",
    "ERR_NETWORK",
];

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn golden_dir() -> PathBuf {
    fixtures().join("golden/epic_status")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// A case list is usable only at or above its floor: an empty or shrunken list is an error, so the replay
/// cannot pass by iterating nothing.
fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

fn locales_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../public/locales")
}

/// The replay with one translation: a recorded transport failure whose code is `ERR_CANCELED` is the seam's
/// `Aborted` (a cancelled request), where every other recorded code is `Network`. The replay itself carries no
/// code, and the check treats a cancelled request as not unreachable.
struct CodeMappedReplay {
    inner: Arc<Replay>,
    cancelled: bool,
}

impl Fetch for CodeMappedReplay {
    fn get(&self, req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        Box::pin(async move {
            match self.inner.get(req).await {
                Err(FetchError::Network) if self.cancelled => Err(FetchError::Aborted),
                other => other,
            }
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

/// Whether the case's recorded exchange is a transport failure with the code `ERR_CANCELED`.
fn recorded_cancel(exchanges: &Path) -> bool {
    read_json(&exchanges.join("exchanges.json"))
        .as_array()
        .is_some_and(|list| {
            list.iter()
                .any(|e| e["networkError"] == true && e["errorCode"] == "ERR_CANCELED")
        })
}

/// A context over a fake HOME whose fetch is the replay, with the recording sinks.
struct Rig {
    _home: FakeHome,
    _exchanges: tempfile::TempDir,
    ctx: LaunchCtx,
    ui: Arc<RecordingUi>,
    log: Arc<RecordingLog>,
    replay: Arc<Replay>,
}

impl Rig {
    fn new(case: &str, online: bool) -> Rig {
        let home = FakeHome::new("launch-epic-");
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        // A case that recorded no request (the monitor is down) replays an empty list, so any request fails it.
        let exchanges = tempfile::tempdir().unwrap();
        let source = fixtures().join("recorded/epic_status").join(case);
        if source.is_dir() {
            for entry in std::fs::read_dir(&source).unwrap() {
                let entry = entry.unwrap();
                std::fs::copy(entry.path(), exchanges.path().join(entry.file_name())).unwrap();
            }
        } else {
            std::fs::write(exchanges.path().join("exchanges.json"), "[]").unwrap();
        }
        let replay = Arc::new(Replay::from_case(exchanges.path()).unwrap());
        let fetch = Arc::new(CodeMappedReplay {
            inner: replay.clone(),
            cancelled: recorded_cancel(exchanges.path()),
        });
        let ui = Arc::new(RecordingUi::new());
        let log = Arc::new(RecordingLog::new());
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                tools_path: app_folder.join("tools"),
                user_data: app_folder.clone(),
                app_folder: app_folder.clone(),
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_fetch(fetch)
        .with_ui(ui.clone())
        .with_log(log.clone())
        .with_i18n(Arc::new(gamelib_i18n::Catalog::load(&locales_dir(), "en")))
        .with_app_version(ORACLE_VERSION)
        .with_online(online);
        let engine = Arc::new(engine);
        let knownfix = Arc::new(KnownFixCtx::new(
            engine.clone(),
            None,
            "https://relay.test",
            ORACLE_VERSION,
        ));
        let wine = Arc::new(WineCtx::new(engine.clone(), app_folder.join("tools")));
        let info = Arc::new(InfoCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            InfoPlatform::Mac,
            InfoPaths {
                app_folder: app_folder.clone(),
                user_data: app_folder,
                temp: root.join("tmp"),
                public_dir: None,
            },
            ORACLE_VERSION.to_string(),
            Shutdown::new(),
            Arc::new(ReqwestHttp::new()),
        ));
        Rig {
            ctx: LaunchCtx::new(engine, knownfix, wine, info),
            _home: home,
            _exchanges: exchanges,
            ui,
            log,
            replay,
        }
    }
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

fn service_of(name: &str) -> EpicService {
    EpicService::parse(name).unwrap_or_else(|| panic!("unknown service {name}"))
}

// ---------------------------------------------------------------------------------------------
// isOffline
// ---------------------------------------------------------------------------------------------

/// What the golden says the case's TS logged, as `(level, text)`.
fn golden_log_lines(events: &Value) -> Vec<(String, String)> {
    events
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["kind"] == "backend-log")
        .map(|e| {
            (
                e["level"].as_str().unwrap().to_string(),
                e["text"].as_str().unwrap().to_string(),
            )
        })
        .collect()
}

/// The notifications the golden recorded, as `(title, body)`.
fn golden_notifications(events: &Value) -> Vec<(String, String)> {
    events
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["kind"] == "notification")
        .map(|e| {
            (
                e["title"].as_str().unwrap().to_string(),
                e["body"].as_str().unwrap().to_string(),
            )
        })
        .collect()
}

/// Whether Rust's `got` line is the fixed-text twin of the TS `want` line (`epic-status-log-fixed-text`):
/// the same level, and:
/// - the unreachable warning: the TS named the code (`page ( ENOTFOUND ), treating`), Rust leaves it out;
/// - the error line: the TS appended the JavaScript error, Rust appends a category, and no URL.
fn same_fixed_line(want: &(String, String), got: &(&str, String)) -> bool {
    let level = if want.0 == "warning" { "warn" } else { &want.0 };
    if got.0 != level {
        return false;
    }
    const UNREACHABLE: &str = "Could not reach the Epic status page";
    const ERROR: &str = "Failed to get epic service status with ";
    if want.1.starts_with(UNREACHABLE) {
        let (Some(open), Some(close)) = (want.1.find(" ( "), want.1.find(" ),")) else {
            return false;
        };
        return got.1 == format!("{}{}", &want.1[..open], &want.1[close + 2..]);
    }
    if want.1.starts_with(ERROR) {
        let category = got.1.strip_prefix(ERROR);
        return category.is_some_and(|c| !c.is_empty())
            && !got.1.contains("epicgames")
            && !got.1.contains("://");
    }
    false
}

fn replay_is_offline(case: &Value, deltas_used: &mut BTreeSet<&'static str>) -> Result<(), String> {
    let id = case["id"].as_str().unwrap();
    let call = &case["call"];
    let dir = golden_dir().join("expected").join(id);
    let online = call["online"].as_bool().unwrap();
    let rig = Rig::new(id, online);
    let got = runtime().block_on(epic_service_offline(
        &rig.ctx,
        service_of(call["type"].as_str().unwrap()),
    ));

    let want = read_json(&dir.join("result.json"));
    if want != json!(got) {
        return Err(format!("{id}: result want {want} got {got}"));
    }

    let events = read_json(&dir.join("events.json"));
    let shown: Vec<(String, String)> = rig
        .ui
        .events()
        .into_iter()
        .map(|event| match event {
            UiEvent::Notify { title, body } => (title, body),
            other => panic!("{id}: an unexpected UI call {other:?}"),
        })
        .collect();
    if golden_notifications(&events) != shown {
        return Err(format!(
            "{id}: notifications want {:?} got {shown:?}",
            golden_notifications(&events)
        ));
    }

    let want_lines = golden_log_lines(&events);
    let got_lines = rig.log.lines();
    if want_lines.len() != got_lines.len() {
        return Err(format!(
            "{id}: log lines want {want_lines:?} got {got_lines:?}"
        ));
    }
    for (want, got) in want_lines.iter().zip(got_lines.iter()) {
        let got = (got.0, got.1.clone());
        if !same_fixed_line(want, &got) {
            return Err(format!("{id}: log line want {want:?} got {got:?}"));
        }
        deltas_used.insert(FIXED_TEXT_DELTA);
    }

    // The request: the golden's `requests.json` is the one GET (or none), and the replay fails on any request
    // the recording does not hold and on any recorded one that was not made.
    rig.replay
        .finish()
        .map_err(|problem| format!("{id}: {problem}"))?;
    let requests = read_json(&dir.join("requests.json"));
    let want_requests = requests.as_array().map_or(0, Vec::len);
    let recorded = if online && want_requests > 0 { 1 } else { 0 };
    if want_requests != recorded {
        return Err(format!(
            "{id}: the golden recorded {want_requests} request(s), this replay served {recorded}"
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// networkLevel and check
// ---------------------------------------------------------------------------------------------

/// A TS error value (`{k, code?, status?}`) as the failure Rust's fetch seam would have produced.
fn failure_of(input: &Value) -> Option<StatusFailure> {
    let code = input["code"].as_str().unwrap_or_default();
    match input["k"].as_str().unwrap() {
        // An axios error with a request and no response: a transport failure, unless it was cancelled.
        "axios-network" if code == "ERR_CANCELED" => Some(StatusFailure::Cancelled),
        "axios-network" => Some(StatusFailure::NoResponse),
        "axios-http" => Some(StatusFailure::Http(input["status"].as_u64().unwrap() as u16)),
        // Raised before sending: it has no request.
        "axios-config" => Some(StatusFailure::Other("config")),
        // A plain errno-style object counts only with one of the listed codes.
        "errno-object" | "errno-error" if LISTED_CODES.contains(&code) => {
            Some(StatusFailure::NoResponse)
        }
        "errno-object" | "errno-error" | "type-error" | "undefined" | "null" | "string" => {
            Some(StatusFailure::Other("other"))
        }
        other => panic!("unknown error input kind {other}"),
    }
}

fn replay_network_level(case: &Value) -> Result<(), String> {
    let id = case["id"].as_str().unwrap();
    let got: Vec<Value> = case["call"]["inputs"]
        .as_array()
        .unwrap()
        .iter()
        .map(|input| json!(failure_of(input).unwrap().is_network_level()))
        .collect();
    let want = read_json(&golden_dir().join("expected").join(id).join("result.json"));
    if want != Value::Array(got.clone()) {
        return Err(format!("{id}: want {want} got {got:?}"));
    }
    Ok(())
}

fn callback_name(callback: &Callback) -> &'static str {
    match callback {
        Callback::Notify => "notify",
        Callback::Unreachable => "onUnreachable",
        Callback::Error(_) => "onError",
    }
}

fn replay_check(case: &Value) -> Result<(), String> {
    let id = case["id"].as_str().unwrap();
    let mut results = Vec::new();
    let mut events = Vec::new();
    for (run, entry) in case["call"]["runs"].as_array().unwrap().iter().enumerate() {
        let service = entry["type"]
            .as_str()
            .map_or(EpicService::default(), service_of);
        let check = if let Some(data) = entry["fetch"].get("resolve") {
            check_epic_service_offline(Ok(data), service)
        } else {
            let failure = failure_of(&entry["fetch"]["reject"]).unwrap();
            check_epic_service_offline(Err(&failure), service)
        };
        results.push(json!(check.offline));
        events.push(json!({ "kind": "run", "run": run }));
        if let Some(callback) = &check.callback {
            events.push(json!({ "kind": "callback", "name": callback_name(callback) }));
        }
    }
    let dir = golden_dir().join("expected").join(id);
    let want = read_json(&dir.join("result.json"));
    if want != Value::Array(results.clone()) {
        return Err(format!("{id}: result want {want} got {results:?}"));
    }
    // The golden's callback events also carry the JavaScript error object; only the name and order compare.
    let want_events: Vec<Value> = read_json(&dir.join("events.json"))
        .as_array()
        .unwrap()
        .iter()
        .map(|e| match e["kind"].as_str().unwrap() {
            "callback" => json!({ "kind": "callback", "name": e["name"] }),
            _ => e.clone(),
        })
        .collect();
    if want_events != events {
        return Err(format!("{id}: events want {want_events:?} got {events:?}"));
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// The replay
// ---------------------------------------------------------------------------------------------

#[test]
fn every_golden_epic_status_case_replays() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let cases = cases.as_array().expect("cases.json is an array");
    check_floor("golden epic_status", cases.len(), EPIC_STATUS_FLOOR).unwrap();
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    assert_eq!(
        manifest["count"].as_u64().unwrap() as usize,
        cases.len(),
        "MANIFEST count"
    );
    assert!(
        manifest["floor"].as_u64().unwrap() as usize <= EPIC_STATUS_FLOOR,
        "the MANIFEST floor is above the one this file holds"
    );

    let mut failures = Vec::new();
    let mut deltas_used = BTreeSet::new();
    let mut compared = 0usize;
    for case in cases {
        let op = case["call"]["op"].as_str().unwrap();
        assert!(
            HANDLED_OPS.contains(&op),
            "{}: an op this replay does not handle: {op}",
            case["id"]
        );
        let outcome = match op {
            "isOffline" => replay_is_offline(case, &mut deltas_used),
            "networkLevel" => replay_network_level(case),
            _ => replay_check(case),
        };
        compared += 1;
        if let Err(problem) = outcome {
            failures.push(problem);
        }
    }
    println!("golden epic_status: compared {compared} floor {EPIC_STATUS_FLOOR}");
    assert!(
        failures.is_empty(),
        "{} case(s) differ:\n{}",
        failures.len(),
        failures.join("\n")
    );
    assert_eq!(compared, cases.len());

    // The delta is documented in the slice, and a delta that no case uses is itself an error.
    let deltas = read_json(&golden_dir().join("deltas.json"));
    let documented: BTreeSet<&str> = deltas
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(
        documented,
        BTreeSet::from([FIXED_TEXT_DELTA]),
        "deltas.json documents exactly the fixed-text delta"
    );
    assert!(
        deltas[FIXED_TEXT_DELTA].as_str().unwrap().len() > 40,
        "a delta without a reason of its own is not documented"
    );
    assert_eq!(deltas_used, BTreeSet::from([FIXED_TEXT_DELTA]));
}

#[test]
fn an_empty_case_list_is_below_the_floor() {
    assert!(check_floor("golden epic_status", 0, EPIC_STATUS_FLOOR).is_err());
    assert!(check_floor("golden epic_status", EPIC_STATUS_FLOOR, EPIC_STATUS_FLOOR).is_ok());
}

#[test]
fn the_status_request_is_one_json_get_and_the_offline_app_makes_none() {
    // Not online: no request, offline, no notification.
    let rig = Rig::new("monitor-offline-nothing-recorded", false);
    assert!(runtime().block_on(epic_service_offline(&rig.ctx, EpicService::default())));
    assert!(rig.ui.events().is_empty());
    rig.replay.finish().unwrap();

    // Online with nothing recorded: the one GET is an unmatched request, which the replay fails and the fetch
    // seam answers as a network failure, so the check is offline (unreachable) with one fixed warning.
    let rig = Rig::new("nothing-recorded", true);
    assert!(runtime().block_on(epic_service_offline(&rig.ctx, EpicService::default())));
    assert!(rig.replay.finish().is_err());
    let lines = rig.log.lines();
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].0, "warn");
    assert!(!lines[0].1.contains("epicgames"));
}
