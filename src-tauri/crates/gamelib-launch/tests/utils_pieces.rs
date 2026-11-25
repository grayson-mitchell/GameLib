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
//!
//! The second half of the file replays `golden/check_wine` (88.1-04, 49 cases): `checkWineBeforeLaunch` and
//! `downloadDefaultWine` over [`ScriptedPrepareDeps`] (each wine's validity, the stored release list, the install
//! answer and each discovery are scripted from the case's `input.json`) and a scripted dialog source. Per case it
//! compares the answer, the wine the caller ends up with, the settings writes (which Rust returns as data, never
//! writes), the dialogs with their answers, the per-game log lines, and the in-process calls, the dialogs and the
//! backend log lines in the one order the TS made them (each golden entry carries a `seq` from one counter, so the
//! three are merged by it and compared as one timeline). Replay-level differences, each required to be used by a
//! case or the test fails: `discovery-rejection-fixed-reason` (the TS let the discovery's rejection escape with its
//! text; Rust answers the fixed reason `failed`). The backend log lines are compared by level and text; the line
//! prefix (`Backend`) is the shell log's, not the crate's.

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
use gamelib_engine::sinks::EngineLog;
use gamelib_engine::testing::{RecordingLog, RecordingUi, UiEvent};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_knownfix::types::Runner;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::prepare::check_wine::{
    check_wine_before_launch, download_default_wine, CheckWineArgs,
};
use gamelib_launch::prepare::deps::testing::{Call, ScriptedPrepareDeps};
use gamelib_launch::prepare::dialogs::testing::ScriptedDialogs;
use gamelib_launch::prepare::dialogs::LaunchDialogs;
use gamelib_launch::prepare::epic::{
    check_epic_service_offline, epic_service_offline, Callback, EpicService, StatusFailure,
};
use gamelib_launch::prepare::launch::RunnerArg;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use gamelib_wine::wine_cmd::{WineHost, WineInstallation};
use serde_json::{json, Value};

/// `golden/epic_status` holds 70 cases, the MANIFEST floor; a later edit may raise this, never lower it.
const EPIC_STATUS_FLOOR: usize = 70;

/// `golden/check_wine` holds 49 cases, the MANIFEST floor; a later edit may raise this, never lower it.
const CHECK_WINE_FLOOR: usize = 49;

/// The `call` kinds of `golden/check_wine` this file replays. The test fails when `cases.json` holds a kind that
/// is not listed, so a new kind cannot be counted without being compared.
const CHECK_WINE_CALLS: [&str; 2] = ["check", "download"];

/// The replay difference `golden/check_wine` documents at test level (`deltas.json` stays empty): the TS let a
/// rejected alternative-wine discovery escape `checkWineBeforeLaunch` with the rejection's text; Rust answers the
/// fixed reason `failed` and never the text.
const REJECTION_DELTA: &str = "discovery-rejection-fixed-reason";

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

// ---------------------------------------------------------------------------------------------
// golden/check_wine
// ---------------------------------------------------------------------------------------------

fn check_wine_dir() -> PathBuf {
    fixtures().join("golden/check_wine")
}

/// The one ordered record of what a case did that the golden also orders: each in-process call, each dialog
/// and each backend log line, as text.
type Timeline = Arc<std::sync::Mutex<Vec<String>>>;

fn push(timeline: &Timeline, entry: String) {
    timeline
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .push(entry);
}

/// The backend log, recorded into the timeline as `log:<level>:<text>`.
struct TimelineLog(Timeline);

impl EngineLog for TimelineLog {
    fn info(&self, line: &str) {
        push(&self.0, format!("log:info:{line}"));
    }
    fn warn(&self, line: &str) {
        push(&self.0, format!("log:warn:{line}"));
    }
    fn error(&self, line: &str) {
        push(&self.0, format!("log:error:{line}"));
    }
}

/// The scripted dialog source, recording each question into the timeline as `dialog`.
struct TimelineDialogs {
    inner: Arc<ScriptedDialogs>,
    timeline: Timeline,
}

impl LaunchDialogs for TimelineDialogs {
    fn ask(&self, title: &str, message: &str, buttons: &[String]) -> Option<usize> {
        push(&self.timeline, "dialog".to_string());
        self.inner.ask(title, message, buttons)
    }
}

/// A context over a fake HOME on one platform, with the recording sinks, the English catalogue and a scripted
/// dialog source. Nothing here opens a socket or spawns a process.
struct CheckRig {
    _home: FakeHome,
    ctx: LaunchCtx,
    ui: Arc<RecordingUi>,
    dialogs: Arc<ScriptedDialogs>,
    timeline: Timeline,
}

impl CheckRig {
    fn new(platform: Platform, answers: Vec<Option<usize>>) -> CheckRig {
        let home = FakeHome::new("launch-check-wine-");
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        let timeline: Timeline = Arc::default();
        let ui = Arc::new(RecordingUi::new());
        let engine = Arc::new(
            EngineCtx::new(
                Arc::new(StoreHost::new()),
                Arc::new(SystemClock),
                platform,
                EnginePaths {
                    tools_path: app_folder.join("tools"),
                    user_data: app_folder.clone(),
                    app_folder: app_folder.clone(),
                    user_home: root.clone(),
                    temp: root.join("tmp"),
                },
                Shutdown::new(),
            )
            .with_ui(ui.clone())
            .with_log(Arc::new(TimelineLog(timeline.clone())))
            .with_i18n(Arc::new(gamelib_i18n::Catalog::load(&locales_dir(), "en")))
            .with_app_version(ORACLE_VERSION),
        );
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
            InfoPlatform::Linux,
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
        let dialogs = Arc::new(ScriptedDialogs::new(answers));
        let ctx =
            LaunchCtx::new(engine, knownfix, wine, info).with_dialogs(Arc::new(TimelineDialogs {
                inner: dialogs.clone(),
                timeline: timeline.clone(),
            }));
        CheckRig {
            _home: home,
            ctx,
            ui,
            dialogs,
            timeline,
        }
    }
}

fn wine_of(value: &Value) -> WineInstallation {
    serde_json::from_value(value.clone()).unwrap_or_else(|e| panic!("{value}: {e}"))
}

fn platform_named(name: &str) -> Platform {
    match name {
        "linux" => Platform::Linux,
        "mac" => Platform::Mac,
        "windows" => Platform::Windows,
        other => panic!("unknown platform {other}"),
    }
}

/// What the case scripted for the dialog: `none` (nothing was asked in the TS), `null` (a dismissal) or the index
/// of the button clicked.
fn scripted_answers(input: &Value) -> Vec<Option<usize>> {
    match &input["scripted"]["dialog"] {
        Value::String(none) if none == "none" => Vec::new(),
        Value::Null => vec![None],
        index => vec![Some(index.as_u64().expect("a button index") as usize)],
    }
}

/// The golden's trace entries that are ordered against each other, as the timeline's text, sorted by `seq`.
fn golden_timeline(dir: &Path) -> Vec<String> {
    let mut entries: Vec<(u64, String)> = Vec::new();
    for request in read_json(&dir.join("requests.json")).as_array().unwrap() {
        entries.push((
            request["seq"].as_u64().unwrap(),
            format!(
                "call:{}:{}",
                request["channel"].as_str().unwrap(),
                request["args"]
            ),
        ));
    }
    for dialog in read_json(&dir.join("dialogs.json")).as_array().unwrap() {
        entries.push((dialog["seq"].as_u64().unwrap(), "dialog".to_string()));
    }
    for event in read_json(&dir.join("events.json")).as_array().unwrap() {
        let level = match event["level"].as_str().unwrap() {
            "warning" => "warn",
            other => other,
        };
        entries.push((
            event["seq"].as_u64().unwrap(),
            format!("log:{level}:{}", event["text"].as_str().unwrap()),
        ));
    }
    entries.sort_by_key(|(seq, _)| *seq);
    entries.into_iter().map(|(_, text)| text).collect()
}

/// The timeline entry of one scripted call, in the golden's vocabulary (`call:<channel>:<args>`).
fn call_entry(call: &Call) -> String {
    let request = call.to_request();
    format!(
        "call:{}:{}",
        request["channel"].as_str().unwrap(),
        request["args"]
    )
}

/// The golden's writes without the TS-only keys (`seq`, and the `store` marker of the global write).
fn golden_writes(dir: &Path) -> Vec<Value> {
    read_json(&dir.join("writes.json"))
        .as_array()
        .unwrap()
        .iter()
        .map(|write| {
            let mut write = write.clone();
            let object = write.as_object_mut().unwrap();
            object.remove("seq");
            object.remove("store");
            write
        })
        .collect()
}

fn replay_check_wine(case: &Value, used: &mut BTreeSet<&'static str>) -> Result<(), String> {
    let id = case["id"].as_str().unwrap();
    let dir = check_wine_dir().join("expected").join(id);
    let input = read_json(&dir.join("input.json"));
    let scripted = &input["scripted"];
    let rig = CheckRig::new(
        platform_named(input["platform"].as_str().unwrap()),
        scripted_answers(&input),
    );
    let host = WineHost {
        darwin_release: input["osRelease"].as_str().map(str::to_string),
        ..WineHost::default()
    };
    let game_wine_value = input["storedSettings"]["wineVersion"].clone();
    let game_wine = wine_of(&game_wine_value);
    let default_wine = wine_of(&input["globalSettings"]["wineVersion"]);
    let app_name = input["gameInfo"]["app_name"].as_str().unwrap().to_string();

    let mut deps = ScriptedPrepareDeps::new(&rig.ctx, &host);
    deps.unlisted_wines_valid = false;
    let valid: Vec<&str> = scripted["validWines"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(Value::as_str)
        .collect();
    let mut alternatives: Vec<Result<Vec<WineInstallation>, String>> = Vec::new();
    for reply in scripted["alternatives"].as_array().into_iter().flatten() {
        alternatives.push(match reply.get("reject") {
            Some(message) => Err(message.as_str().unwrap().to_string()),
            None => Ok(reply["list"]
                .as_array()
                .unwrap()
                .iter()
                .map(wine_of)
                .collect()),
        });
    }
    let listed: Vec<&WineInstallation> = alternatives
        .iter()
        .flatten()
        .flatten()
        .chain([&game_wine, &default_wine])
        .collect();
    for wine in listed {
        deps.wine_validity
            .insert(wine.name.clone(), valid.contains(&wine.name.as_str()));
    }
    deps.alternatives_replies = alternatives;
    deps.releases_reply = scripted["releases"].clone();
    if let Some(answer) = scripted["install"].as_str() {
        deps.install_reply = answer.to_string();
    }
    deps.default_wine = Some(default_wine);
    let timeline = rig.timeline.clone();
    deps.observer = Some(Box::new(move |call| push(&timeline, call_entry(call))));

    let want_result = read_json(&dir.join("result.json"));
    let mut got_writes: Vec<Value> = Vec::new();
    let mut got_log = json!([]);
    let got_result = if input["call"] == "download" {
        // `downloadDefaultWine` called directly: the value, and the global write when there is one.
        let value = runtime().block_on(download_default_wine(&rig.ctx, &deps, &host));
        if let Some(wine) = &value {
            got_writes.push(json!({"target": "global", "key": "wineVersion", "value": wine}));
        }
        json!({"value": value})
    } else {
        let args = CheckWineArgs {
            app_name: app_name.clone(),
            runner: RunnerArg(
                Runner::parse(input["gameInfo"]["runner"].as_str().unwrap()).expect("a runner"),
            ),
            wine_version: game_wine_value.clone(),
            verbose_logs: input["storedSettings"]["verboseLogs"] == true,
            disable_logs: input["globalSettings"]["disableLogs"] == true,
        };
        match runtime().block_on(check_wine_before_launch(&rig.ctx, &deps, args, &host)) {
            Ok(reply) => {
                let wine_after = reply
                    .wine_version
                    .as_ref()
                    .map_or(game_wine_value.clone(), |wine| json!(wine));
                if let Some(wine) = &reply.global_wine_version {
                    got_writes
                        .push(json!({"target": "global", "key": "wineVersion", "value": wine}));
                }
                if reply.persist_game_wine {
                    got_writes.push(json!({
                        "target": "game", "appName": app_name, "key": "wineVersion", "value": reply.wine_version
                    }));
                }
                got_log = serde_json::to_value(&reply.log).unwrap();
                json!({"ok": reply.ok, "wineVersionAfter": wine_after})
            }
            Err(_) => {
                // The TS let the rejection escape with its text; Rust answers a fixed reason.
                if want_result["error"].is_string() {
                    used.insert(REJECTION_DELTA);
                    json!({"error": want_result["error"], "wineVersionAfter": game_wine_value})
                } else {
                    json!({"error": "failed"})
                }
            }
        }
    };
    if got_result != want_result {
        return Err(format!("{id}: result want {want_result} got {got_result}"));
    }
    if got_writes != golden_writes(&dir) {
        return Err(format!(
            "{id}: writes want {:?} got {got_writes:?}",
            golden_writes(&dir)
        ));
    }
    if got_log
        != read_json(&dir.join("log.json"))
            .as_array()
            .map_or(json!([]), |entries| {
                Value::Array(
                    entries
                        .iter()
                        .map(|e| json!({"level": e["level"], "parts": e["parts"]}))
                        .collect(),
                )
            })
    {
        return Err(format!("{id}: the per-game log differs: got {got_log}"));
    }

    // The dialogs: the question, its answer and that the window was raised before it.
    let want_dialogs = read_json(&dir.join("dialogs.json"));
    let want_dialogs = want_dialogs.as_array().unwrap();
    let asked = rig.dialogs.asked();
    if asked.len() != want_dialogs.len() {
        return Err(format!(
            "{id}: {} dialog(s) recorded, {} asked",
            want_dialogs.len(),
            asked.len()
        ));
    }
    let answers = scripted_answers(&input);
    for (want, got) in want_dialogs.iter().zip(&asked) {
        let same = want["title"] == json!(got.title)
            && want["message"] == json!(got.message)
            && want["buttons"] == json!(got.buttons);
        if !same {
            return Err(format!("{id}: dialog want {want} got {got:?}"));
        }
        let answer = answers.first().copied().flatten();
        let scripted_answer = answer.map_or(Value::Null, |index| json!(index));
        // A dismissal is mapped to the last button, "No" (index 1), exactly as the TS dialog layer mapped it.
        if want["scriptedAnswer"] != scripted_answer
            || want["response"] != json!(answer.unwrap_or(1))
        {
            return Err(format!("{id}: dialog answer want {want}"));
        }
        if want["raisedMainWindow"] != true {
            return Err(format!(
                "{id}: a dialog the TS asked without raising the window"
            ));
        }
    }
    let raised = rig
        .ui
        .events()
        .iter()
        .filter(|event| matches!(event, UiEvent::RaiseMainWindow))
        .count();
    if raised != want_dialogs.len() {
        return Err(format!(
            "{id}: the main window was raised {raised} time(s) for {} dialog(s)",
            want_dialogs.len()
        ));
    }

    // The calls, the dialogs and the backend log lines in the one order the TS made them.
    let want_timeline = golden_timeline(&dir);
    let got_timeline = rig
        .timeline
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    if want_timeline != got_timeline {
        return Err(format!(
            "{id}: timeline\n  want {want_timeline:#?}\n  got  {got_timeline:#?}"
        ));
    }
    Ok(())
}

#[test]
fn every_golden_check_wine_case_replays() {
    let cases = read_json(&check_wine_dir().join("cases.json"));
    let cases = cases.as_array().expect("cases.json is an array");
    check_floor("golden check_wine", cases.len(), CHECK_WINE_FLOOR).unwrap();
    let manifest = read_json(&check_wine_dir().join("MANIFEST.json"));
    assert_eq!(
        manifest["count"].as_u64().unwrap() as usize,
        cases.len(),
        "MANIFEST count"
    );
    assert!(
        manifest["floor"].as_u64().unwrap() as usize <= CHECK_WINE_FLOOR,
        "the MANIFEST floor is above the one this file holds"
    );

    let mut failures = Vec::new();
    let mut used = BTreeSet::new();
    let mut compared = 0usize;
    for case in cases {
        let call = case["call"].as_str().unwrap();
        assert!(
            CHECK_WINE_CALLS.contains(&call),
            "{}: a call kind this replay does not handle: {call}",
            case["id"]
        );
        compared += 1;
        if let Err(problem) = replay_check_wine(case, &mut used) {
            failures.push(problem);
        }
    }
    println!("golden check_wine: compared {compared} floor {CHECK_WINE_FLOOR}");
    assert!(
        failures.is_empty(),
        "{} case(s) differ:\n{}",
        failures.len(),
        failures.join("\n")
    );
    assert_eq!(compared, cases.len());
    // A difference no case uses is itself an error.
    assert_eq!(used, BTreeSet::from([REJECTION_DELTA]));
}

#[test]
fn an_empty_check_wine_case_list_is_below_the_floor() {
    assert!(check_floor("golden check_wine", 0, CHECK_WINE_FLOOR).is_err());
    assert!(check_floor("golden check_wine", CHECK_WINE_FLOOR, CHECK_WINE_FLOOR).is_ok());
}

#[test]
fn a_context_with_no_dialog_source_answers_every_question_as_a_dismissal() {
    // The CLI has no window: the question is never shown, and the launch is not continued with another wine.
    let rig = CheckRig::new(Platform::Linux, vec![Some(0)]);
    let ctx = LaunchCtx::new(
        rig.ctx.engine.clone(),
        rig.ctx.knownfix.clone(),
        rig.ctx.wine.clone(),
        rig.ctx.info.clone(),
    );
    assert!(ctx.dialogs.is_none());
    let buttons = ["Yes".to_string(), "No".to_string()];
    assert_eq!(
        gamelib_launch::prepare::dialogs::ask(&ctx, "t", "m", &buttons),
        None
    );
    // And no window was raised for a question nobody saw.
    assert!(rig.ui.events().is_empty());

    let host = WineHost::default();
    let mut deps = ScriptedPrepareDeps::new(&ctx, &host);
    deps.unlisted_wines_valid = false;
    deps.default_wine = Some(wine_of(
        &json!({"name": "Wine-Default-9.0", "type": "wine", "bin": "/d/wine", "wineserver": "/d/wineserver"}),
    ));
    deps.wine_validity
        .insert("Wine-Default-9.0".to_string(), true);
    let args = CheckWineArgs {
        app_name: "app".to_string(),
        runner: RunnerArg(Runner::Gog),
        wine_version: json!({"name": "Wine-Game-8.0", "type": "wine", "bin": "/g/wine"}),
        verbose_logs: false,
        disable_logs: false,
    };
    let reply = runtime()
        .block_on(check_wine_before_launch(&ctx, &deps, args, &host))
        .unwrap();
    assert!(!reply.ok);
    assert!(reply.wine_version.is_none() && !reply.persist_game_wine);
}
