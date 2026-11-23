//! The engine switch against the TS goldens (87-16 recorded them, 87-40 ports the tracer path, 87-41
//! the rest; D-07, D-08): `golden/switch` holds one case per branch of `prepareBottleForEngine`.
//!
//! A case replays over a fake HOME laid out as the oracle's profile: the case's pinned-engine variant
//! and each named fixture bottle are copied in, the case's ledger entries are marked, and its calls
//! run one after another through `prepare_bottle_for_engine_with` over a scripted spawn seam (the
//! wineserver stops) and a scripted DXVK installer. Compared to the golden: every call's result (or
//! the panic that stood for the TS throw), the ordered effects (the switching callback, each
//! wineserver stop and each installer call, in the order the TS recorded them), the marker bytes of
//! every bottle before and after, the difference between the trees, the log lines, the spawn trace and
//! the time limit and cancel wiring of each spawn, the installer's requests and the tree after. The
//! gate asks, the marker renames and the `crossover-settings` and `ensure-pin` events of the TS
//! timeline belong to its channel and callbacks, which a Rust op has no counterpart of; the marker
//! bytes and the trees are what the writes are judged by.
//!
//! A count floor lives here beside the replay, so editing the JSON alone cannot lower the bar, and an
//! empty case list fails. A case this build does not replay is named in [`LATER`] (the concurrent
//! WR-02 interleaves and every switch that restores CrossOver's graphics stack, 87-41) and is checked
//! both ways: it must be in the list and it must still be the case that this build cannot replay it.
//! POSIX only, as the TS oracle's replays are.
#![cfg(unix)]

mod common;

use std::collections::BTreeMap;
use std::panic::AssertUnwindSafe;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use futures_util::FutureExt;
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_engine::bottles::marker;
use gamelib_engine::bottles::registry::EngineSelection;
use gamelib_engine::bottles::switch::{
    prepare_bottle_for_engine_with, MonitorPhase, OwnBottle, PrepareArgs, PrepareOutcome,
    PrepareReason, PrepareResult,
};
use gamelib_engine::dxvk::{DxvkAction, DxvkInstaller, DxvkRequest};
use gamelib_engine::engines::{DxvkBuild, NonCrossoverEngine};
use gamelib_engine::testing::{RecordingLog, ScriptedSpecRunner};
use gamelib_store::version_gate::GateState;
use serde_json::{json, Map, Value};

use common::{check_floor, first_difference, read_json, sha256_hex, Profile, BOTTLES_REL};

/// `golden/switch` holds 73 cases; a later edit may raise this, never lower it.
const CASE_FLOOR: usize = 73;

/// The cases this build replays, at least (the tracer and the non-restore branches).
const REPLAYED_FLOOR: usize = 50;

/// The cases 87-41 replays: the concurrent interleaves (the per-bottle serialisation) and the
/// switches that restore CrossOver's graphics stack.
const LATER: [&str; 23] = [
    "concurrent-different-bottles-independent-wr02",
    "concurrent-first-rejects-wr02",
    "concurrent-opposite-targets-wr02",
    "concurrent-same-target-wr02",
    "concurrent-second-refused-busy-wr02",
    "concurrent-three-same-target-wr02",
    "crossover-contradicted-to-crossover",
    "dxvk-failed-to-crossover-restores",
    "marker-legacy-noversion-to-crossover",
    "nomarker-dxvk-pin-absent-to-crossover",
    "nomarker-dxvk-pin-installed-to-crossover",
    "pin-to-crossover-healthy-no-crossover-found",
    "pin-to-crossover-healthy-restore-fails",
    "pin-to-crossover-healthy-restore-from-marker-copy-pin-absent",
    "pin-to-crossover-healthy-restore-leaves-dxvk-file",
    "pin-to-crossover-healthy-restore-throws",
    "pin-to-crossover-healthy-restored",
    "pin-to-crossover-restore-source-unavailable",
    "pin-to-crossover-retired-pin-restores-from-current",
    "pin-to-crossover-unhealthy-built-in-restore",
    "pin-to-crossover-unhealthy-restore-fails",
    "pin-to-crossover-unhealthy-source-fetched",
    "sequential-round-trip-pin-crossover-pin",
];

const CX_BIN_DIR: &str = "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin";
const PIN_ID: &str = "wine-staging-11.20";
const PIN_WINE_VERSION: &str = "11.20";
const PIN_DXVK_VERSION: &str = "v1.10.3-20230507-repack";
const PIN_LABEL: &str = "Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)";
const WINE_BIN: &str = "<TOOLS>/steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wine";
const WINESERVER_BIN: &str =
    "<TOOLS>/steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wineserver";
const DXVK_DIR: &str = "<TOOLS>/steam-engines/dxvk-macOS-v1.10.3-20230507-repack";
const WM_VERSION: &str = "Wine-Staging-10.5";
const WM_WINE: &str = "<TOOLS>/wine/Wine-Staging-10.5/bin/wine";
const WM_WINESERVER: &str = "<TOOLS>/wine/Wine-Staging-10.5/bin/wineserver";
const MARKER_FILE: &str = ".gamelib-engine.json";

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/switch")
}

fn cases() -> Vec<Value> {
    read_json(&golden_dir().join("cases.json"))
        .as_array()
        .unwrap()
        .clone()
}

fn expected_folders() -> Vec<String> {
    std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect()
}

/// The count equals the cases, it is at or above the floor, and `expected/` holds one folder per case.
fn check_manifest(
    cases: &[Value],
    manifest: &Value,
    floor: usize,
    folders: &[String],
) -> Result<(), String> {
    check_floor("switch cases", cases.len(), floor)?;
    let count = manifest["count"].as_u64().unwrap_or(0) as usize;
    if count != cases.len() {
        return Err(format!("MANIFEST count {count} != {} cases", cases.len()));
    }
    let mut ids: Vec<String> = cases
        .iter()
        .map(|c| c["id"].as_str().unwrap_or_default().to_string())
        .collect();
    ids.sort();
    let mut have = folders.to_vec();
    have.sort();
    if ids != have {
        return Err(format!("expected/ folders {have:?} != case ids {ids:?}"));
    }
    Ok(())
}

#[test]
fn the_manifest_holds_the_floor_and_one_expected_folder_per_case() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    check_manifest(&cases(), &manifest, CASE_FLOOR, &expected_folders()).unwrap();
}

#[test]
fn an_empty_case_list_fails_the_manifest_guard() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    assert!(check_manifest(&[], &manifest, CASE_FLOOR, &[]).is_err());
    assert!(check_floor("switch cases", CASE_FLOOR - 1, CASE_FLOOR).is_err());
}

// ---------------------------------------------------------------------------------------------
// The scripted seams
// ---------------------------------------------------------------------------------------------

type Events = Arc<Mutex<Vec<Value>>>;

fn push(events: &Events, event: Value) {
    events.lock().unwrap().push(event);
}

/// A scripted spawn seam that records, in the shared timeline, each wineserver stop as the TS
/// recorded it (`kill` with the extra env and the limit, then `kill-returned`), and the time limit and
/// cancel wiring of every spawn (`spawnLimits`).
struct TracedRunner {
    inner: ScriptedSpecRunner,
    events: Events,
    call: Arc<AtomicUsize>,
    limits: Mutex<Vec<Value>>,
}

impl SpecRunner for TracedRunner {
    fn run(&self, spec: ProcSpec, on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        self.limits.lock().unwrap().push(json!({
            "program": spec.program,
            "argv": spec.argv,
            "timeoutMs": spec.timeout.map(|d| d.as_millis() as u64),
            "unbounded": spec.timeout.is_none(),
            "signal": spec.cancel.is_some(),
        }));
        let call = self.call.load(Ordering::SeqCst);
        let prefix = spec
            .env
            .iter()
            .find(|(k, _)| k == "WINEPREFIX")
            .map(|(_, v)| v.clone())
            .unwrap_or_default();
        let bottle = prefix.rsplit('/').next().unwrap_or_default().to_string();
        let extra: Map<String, Value> = spec
            .env
            .iter()
            .filter(|(k, _)| k != "WINEPREFIX")
            .map(|(k, v)| (k.clone(), json!(v)))
            .collect();
        push(
            &self.events,
            json!({
                "ev": "kill", "call": call, "bottle": bottle, "wineserver": spec.program,
                "env": extra, "timeoutMs": spec.timeout.map(|d| d.as_millis() as u64),
            }),
        );
        let run = self.inner.run(spec, on_line);
        let events = self.events.clone();
        Box::pin(async move {
            let out = run.await;
            push(
                &events,
                json!({"ev": "kill-returned", "call": call, "returned": out.code.is_some()}),
            );
            out
        })
    }
}

/// The DXVK installer double of the oracle: one outcome per action, writing or removing
/// `current_dxvk-macOS` the way the real tool does. A TS throw is a panic here, which the replay
/// catches around the call.
struct ScriptedInstaller {
    backup: String,
    restore: String,
    backup_throws: AtomicUsize,
    events: Events,
    call: Arc<AtomicUsize>,
    requests: Mutex<Vec<Value>>,
}

impl DxvkInstaller for ScriptedInstaller {
    fn install_remove(&self, req: DxvkRequest) -> BoxFuture<bool> {
        let call = self.call.load(Ordering::SeqCst);
        self.requests.lock().unwrap().push(json!({
            "call": call,
            "tool": req.tool.as_str(),
            "action": req.action.as_str(),
            "source": req.source.as_ref().map(|s| json!({"dir": s.dir, "version": s.version})),
            "settings": req.settings,
        }));
        push(
            &self.events,
            json!({"ev": "installer", "call": call, "tool": req.tool.as_str(), "action": req.action.as_str()}),
        );
        let prefix = req.settings["winePrefix"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        let file = Path::new(&prefix).join("current_dxvk-macOS");
        let answer = match req.action {
            DxvkAction::Backup => {
                let how = self.backup.as_str();
                if how == "throws" {
                    panic!("DXVK installer blew up");
                }
                if how == "throws-once" && self.backup_throws.fetch_add(1, Ordering::SeqCst) == 0 {
                    panic!("DXVK installer blew up");
                }
                if how == "fails" {
                    false
                } else {
                    if how == "ok" || how == "throws-once" {
                        std::fs::write(&file, format!("{PIN_DXVK_VERSION}\n")).unwrap();
                    }
                    true
                }
            }
            DxvkAction::Restore => {
                let how = self.restore.as_str();
                if how == "throws" {
                    panic!("DXVK restore blew up");
                }
                if how == "fails" {
                    false
                } else {
                    if how == "ok" {
                        let _ = std::fs::remove_file(&file);
                    }
                    true
                }
            }
        };
        Box::pin(async move { answer })
    }
}

fn scripted_kill(how: &str) -> SpecOutput {
    match how {
        "throws" => SpecOutput {
            code: None,
            stderr: "Error: spawn wineserver ENOENT".to_string(),
            ..SpecOutput::default()
        },
        "timeout" => SpecOutput {
            code: None,
            timed_out: true,
            ..SpecOutput::default()
        },
        _ => SpecOutput {
            code: Some(0),
            ..SpecOutput::default()
        },
    }
}

// ---------------------------------------------------------------------------------------------
// The case
// ---------------------------------------------------------------------------------------------

type BoxedGate = Box<dyn Fn(&Path) -> Option<GateState> + Send + Sync>;

fn gate_of(case: &Value) -> BoxedGate {
    let gate = &case["gate"];
    if gate["reject"].as_bool() == Some(true) {
        return Box::new(|_| None);
    }
    match gate["answer"].as_str() {
        Some("newer") => Box::new(|_| Some(GateState::Newer)),
        Some("ok") => Box::new(|_| Some(GateState::Ok)),
        Some("absent") => Box::new(|_| Some(GateState::Absent)),
        Some("unreadable") => Box::new(|_| Some(GateState::Unreadable)),
        _ => Box::new(marker::process_gate),
    }
}

fn dxvk_build(profile: &Profile) -> DxvkBuild {
    DxvkBuild {
        dir: profile.expand(DXVK_DIR),
        version: PIN_DXVK_VERSION.to_string(),
    }
}

/// `selectionFor`: the engine selection a call asks for, with its paths expanded into the profile.
fn selection_for(profile: &Profile, call: &Value) -> EngineSelection {
    match call["next"].as_str().unwrap() {
        "crossover" => EngineSelection::Crossover {
            reason: "cx-healthy".to_string(),
            crossover_build: Some("26.0.0".to_string()),
            bin_dir: CX_BIN_DIR.to_string(),
        },
        "pinned" => EngineSelection::Pinned {
            pin_id: PIN_ID.to_string(),
            reason: "cx-missing".to_string(),
            engine: NonCrossoverEngine {
                wine_bin: profile.expand(WINE_BIN),
                wineserver_bin: profile.expand(WINESERVER_BIN),
                label: PIN_LABEL.to_string(),
                version: PIN_WINE_VERSION.to_string(),
                dxvk: (call["nextDxvk"] != "none").then(|| dxvk_build(profile)),
            },
        },
        _ => EngineSelection::WineManager {
            manager_version: WM_VERSION.to_string(),
            reason: "override".to_string(),
            engine: NonCrossoverEngine {
                wine_bin: profile.expand(WM_WINE),
                wineserver_bin: profile.expand(WM_WINESERVER),
                label: "Wine Manager".to_string(),
                version: "10.5".to_string(),
                dxvk: (call["nextDxvk"] == "with").then(|| dxvk_build(profile)),
            },
        },
    }
}

/// The global settings the oracle built its fallback settings from.
fn global_game_settings() -> Value {
    json!({
        "enviromentOptions": [
            {"key": "FOO", "value": "bar"},
            {"key": "user", "value": "someone"},
            {"key": "WINEDEBUG", "value": "+all"}
        ],
        "autoInstallDxvk": true,
        "launcherArgs": "-skip"
    })
}

/// What the TS `PrepareResult` looked like on the wire (`{ok, changed}` or `{ok, reason, detail}`).
fn ts_result(result: &PrepareResult) -> Value {
    let mut value = result.to_value();
    if let Some(map) = value.as_object_mut() {
        map.remove("selection");
    }
    value
}

/// What one case did, in the golden's vocabulary.
struct Replayed {
    before: Value,
    outcomes: Value,
    timeline: Value,
    markers_before: Value,
    markers: Value,
    tree_diff: Value,
    logs: Vec<String>,
    spawn_limits: Value,
    installer: Value,
    spawns: Value,
    after: Value,
    /// Whether any call was refused because it needs the CrossOver restore (87-41).
    hit_restore: bool,
}

/// `treeDiff`: what changed between two snapshots, and whether only a marker did.
fn tree_diff(before: &Value, after: &Value) -> Value {
    let index = |tree: &Value| -> BTreeMap<String, String> {
        tree.as_array()
            .unwrap()
            .iter()
            .map(|e| (e["path"].as_str().unwrap().to_string(), e.to_string()))
            .collect()
    };
    let (b, a) = (index(before), index(after));
    let added: Vec<&String> = a.keys().filter(|p| !b.contains_key(*p)).collect();
    let removed: Vec<&String> = b.keys().filter(|p| !a.contains_key(*p)).collect();
    let changed: Vec<&String> = a
        .keys()
        .filter(|p| b.get(*p).is_some_and(|old| old != &a[*p]))
        .collect();
    let only_markers = added
        .iter()
        .chain(&removed)
        .chain(&changed)
        .all(|p| p.rsplit('/').next() == Some(MARKER_FILE));
    json!({"added": added, "removed": removed, "changed": changed, "onlyMarkersDiffer": only_markers})
}

fn run_case(case: &Value) -> Replayed {
    let profile = Arc::new(Profile::new());
    if let Some(variant) = case["engines"].as_str() {
        if variant != "none" {
            profile.build_engines(variant);
        }
    }
    for name in case["bottles"].as_array().into_iter().flatten() {
        profile.build_bottle(name.as_str().unwrap());
    }
    profile.seed(&case["seed"]);
    let args = &case["args"];
    let events: Events = Arc::new(Mutex::new(Vec::new()));
    let current_call = Arc::new(AtomicUsize::new(0));
    let kill_how = args["kill"].as_str().unwrap_or("ok");
    let base: Vec<(String, String)> = profile
        .home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect();
    let mut scripted = ScriptedSpecRunner::new(base);
    for program in [
        format!("{CX_BIN_DIR}/wineserver"),
        profile.expand(WINESERVER_BIN),
        profile.expand(WM_WINESERVER),
        profile.expand(WINE_BIN),
    ] {
        scripted = scripted.on(&program, &["-k"], scripted_kill(kill_how));
    }
    let runner = Arc::new(TracedRunner {
        inner: scripted,
        events: events.clone(),
        call: current_call.clone(),
        limits: Mutex::new(Vec::new()),
    });
    let installer = Arc::new(ScriptedInstaller {
        backup: args["installer"]["backup"]
            .as_str()
            .unwrap_or("ok")
            .to_string(),
        restore: args["installer"]["restore"]
            .as_str()
            .unwrap_or("ok")
            .to_string(),
        backup_throws: AtomicUsize::new(0),
        events: events.clone(),
        call: current_call.clone(),
        requests: Mutex::new(Vec::new()),
    });
    let log = Arc::new(RecordingLog::new());
    let bin_dir_absent = args["binDir"] == "absent";
    let ctx = profile
        .ctx_with(log.clone(), Some(runner.clone()))
        .with_dxvk(installer.clone())
        .with_crossover_bin_dir(Arc::new(move || {
            Box::pin(async move { (!bin_dir_absent).then(|| CX_BIN_DIR.to_string()) })
        }));
    for running in args["ledger"].as_array().into_iter().flatten() {
        ctx.ledger.mark_game_running(
            ctx.log.as_deref(),
            running["bottle"].as_str().unwrap(),
            running["key"].as_str().unwrap(),
        );
    }
    let before = profile.snapshot();
    let markers_before = profile.marker_bytes();
    let gate = gate_of(case);
    let mut outcomes = Vec::new();
    let mut hit_restore = false;
    for (index, call) in args["calls"].as_array().unwrap().iter().enumerate() {
        current_call.store(index, Ordering::SeqCst);
        let bottle = call["bottle"].as_str().unwrap();
        push(
            &events,
            json!({"ev": "start", "call": index, "bottle": bottle, "next": call["next"]}),
        );
        let mut prepare = PrepareArgs::new(
            call["key"].as_str().unwrap_or("gog:1207658924"),
            bottle,
            selection_for(&profile, call),
        );
        prepare.monitor_phase = match args["monitor"].as_str() {
            Some("starting") => Some(MonitorPhase::Starting),
            Some("running") => Some(MonitorPhase::Running),
            _ => None,
        };
        prepare.own_bottle_name = match args["ownBottle"].as_str() {
            None => OwnBottle::NoNotion,
            Some("self") => OwnBottle::Named(bottle.to_string()),
            Some(other) => OwnBottle::Named(other.to_string()),
        };
        prepare.crossover_healthy = call["crossoverHealthy"] != false;
        prepare.fallback_settings = global_game_settings();
        let switching = events.clone();
        prepare.on_switching = Some(Arc::new(move || {
            push(&switching, json!({"ev": "switching", "call": index}));
        }));
        let run = prepare_bottle_for_engine_with(&ctx, &*gate, &prepare);
        let outcome = block_on(AssertUnwindSafe(run).catch_unwind());
        match outcome {
            Ok(result) => {
                if matches!(
                    result.outcome,
                    PrepareOutcome::Refused {
                        reason: PrepareReason::RestorePending,
                        ..
                    }
                ) {
                    hit_restore = true;
                }
                let value = ts_result(&result);
                push(
                    &events,
                    json!({"ev": "result", "call": index, "result": value}),
                );
                outcomes.push(json!({"call": index, "result": value}));
            }
            Err(payload) => {
                let message = payload
                    .downcast_ref::<&str>()
                    .map(|s| s.to_string())
                    .or_else(|| payload.downcast_ref::<String>().cloned())
                    .unwrap_or_default();
                push(
                    &events,
                    json!({"ev": "threw", "call": index, "message": message}),
                );
                outcomes.push(json!({"call": index, "threw": message}));
            }
        }
    }
    let after = profile.snapshot();
    let spawns = Value::Array(
        runner
            .inner
            .spawns()
            .iter()
            .map(|spawn| {
                let mut entry = spawn.to_json();
                // The scripted answer is an input, not an observation.
                entry["result"] = Value::Null;
                entry
            })
            .collect(),
    );
    let logs = log
        .lines()
        .into_iter()
        .map(|(level, line)| {
            let level = match level {
                "warn" => "WARNING",
                "error" => "ERROR",
                _ => "INFO",
            };
            format!("{level}: {}", profile.normalise_text(&line))
        })
        .collect();
    let timeline = events.lock().unwrap().clone();
    let requests = installer.requests.lock().unwrap().clone();
    let limits = runner.limits.lock().unwrap().clone();
    Replayed {
        tree_diff: tree_diff(&before, &after),
        before,
        outcomes: Value::Array(outcomes),
        timeline: profile.normalise(Value::Array(timeline)),
        markers_before,
        markers: profile.marker_bytes(),
        logs,
        spawn_limits: profile.normalise(Value::Array(limits)),
        installer: profile.normalise(Value::Array(requests)),
        spawns: profile.normalise(spawns),
        after,
        hit_restore,
    }
}

/// Runs one future to its end on a small runtime of its own (the scripted seams never block).
fn block_on<F: std::future::Future>(future: F) -> F::Output {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(future)
}

/// The golden's timeline reduced to the events a Rust call has a counterpart of.
fn golden_timeline(golden: &Value) -> Value {
    let kept = [
        "start",
        "switching",
        "kill",
        "kill-returned",
        "installer",
        "result",
        "threw",
    ];
    Value::Array(
        golden["timeline"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| kept.contains(&e["ev"].as_str().unwrap()))
            .cloned()
            .collect(),
    )
}

/// The golden's log lines as `<LEVEL>: <message>`, without the TS channel's gate warning (the gate is
/// in process and cannot fail, `deltas.json` of `golden/bottles`).
fn expected_logs(golden: &Value) -> Vec<String> {
    golden["logs"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|l| {
            !l["message"]
                .as_str()
                .unwrap()
                .starts_with("bottle version gate: Rust could not be asked")
        })
        .map(|l| {
            format!(
                "{}: {}",
                l["level"].as_str().unwrap(),
                l["message"].as_str().unwrap()
            )
        })
        .collect()
}

/// The problems of one replayed case against its golden; empty when it matches.
fn compare(case: &Value, actual: &Replayed) -> Vec<String> {
    let id = case["id"].as_str().unwrap();
    let dir = golden_dir().join("expected").join(id);
    let golden = read_json(&dir.join("result.json"));
    let mut problems = Vec::new();
    let text = |v: &Value| serde_json::to_string(v).unwrap();
    let mut check = |what: &str, ok: bool, expected: String, got: String| {
        if !ok {
            problems.push(format!(
                "{what}:\n    expected {expected}\n    actual   {got}"
            ));
        }
    };
    check(
        "outcomes",
        actual.outcomes == golden["outcomes"],
        text(&golden["outcomes"]),
        text(&actual.outcomes),
    );
    let want_timeline = golden_timeline(&golden);
    check(
        "timeline",
        actual.timeline == want_timeline,
        text(&want_timeline),
        text(&actual.timeline),
    );
    check(
        "markers before",
        actual.markers_before == golden["markersBefore"],
        text(&golden["markersBefore"]),
        text(&actual.markers_before),
    );
    check(
        "marker bytes",
        actual.markers == golden["markers"],
        text(&golden["markers"]),
        text(&actual.markers),
    );
    check(
        "tree diff",
        actual.tree_diff == golden["treeDiff"],
        text(&golden["treeDiff"]),
        text(&actual.tree_diff),
    );
    let want_logs = expected_logs(&golden);
    check(
        "logs",
        actual.logs == want_logs,
        format!("{want_logs:?}"),
        format!("{:?}", actual.logs),
    );
    check(
        "spawn limits",
        actual.spawn_limits == golden["spawnLimits"],
        text(&golden["spawnLimits"]),
        text(&actual.spawn_limits),
    );
    check(
        "installer requests",
        actual.installer == golden["installRemove"],
        text(&golden["installRemove"]),
        text(&actual.installer),
    );
    check(
        "tree before",
        actual.before == golden["before"],
        "the golden's before tree".into(),
        first_difference(&golden["before"], &actual.before),
    );
    let want_spawns: Vec<Value> = read_json(&dir.join("spawns.json"))
        .as_array()
        .unwrap()
        .iter()
        .map(|spawn| {
            let mut spawn = spawn.clone();
            spawn["result"] = Value::Null;
            spawn
        })
        .collect();
    check(
        "spawn trace",
        actual.spawns == Value::Array(want_spawns.clone()),
        text(&Value::Array(want_spawns)),
        text(&actual.spawns),
    );
    let want_after = read_json(&dir.join("tree.json"));
    check(
        "tree after",
        actual.after == want_after,
        "the golden's after tree".into(),
        first_difference(&want_after, &actual.after),
    );
    // The bytes of the bottles the case says must not change are the same after as before.
    for name in case["markerUnchanged"].as_array().into_iter().flatten() {
        let name = name.as_str().unwrap();
        check(
            "marker unchanged",
            actual.markers[name].is_string() && actual.markers[name] == actual.markers_before[name],
            text(&actual.markers_before[name]),
            text(&actual.markers[name]),
        );
    }
    problems
}

fn is_later(case: &Value) -> bool {
    LATER.contains(&case["id"].as_str().unwrap())
}

#[test]
fn the_crossover_to_pin_tracer_replays() {
    let all = cases();
    let case = all
        .iter()
        .find(|c| c["id"] == "crossover-to-pin-switched")
        .expect("the tracer case is in the list");
    let actual = run_case(case);
    let problems = compare(case, &actual);
    assert!(problems.is_empty(), "{}", problems.join("\n"));
    // The behaviours the tracer exists to pin, stated apart from the golden: the CrossOver wineserver
    // is stopped before DXVK is installed, and the marker then names the pin and its DXVK copy.
    let order: Vec<&str> = actual
        .timeline
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["ev"].as_str().unwrap())
        .collect();
    assert_eq!(
        order,
        [
            "start",
            "switching",
            "kill",
            "kill-returned",
            "installer",
            "result"
        ]
    );
    assert_eq!(
        actual.outcomes,
        json!([{"call": 0, "result": {"ok": true, "changed": true}}])
    );
    let marker = actual.markers["fx-crossover-marker"].as_str().unwrap();
    assert!(marker.starts_with(r#"{"kind":"pinned","id":"wine-staging-11.20","#));
    assert!(marker.contains(&format!(
        r#""dxvk":{{"dir":"<TOOLS>/steam-engines/dxvk-macOS-{PIN_DXVK_VERSION}","version":"{PIN_DXVK_VERSION}"}}"#
    )));
}

#[test]
fn every_switch_golden_this_build_ports_replays() {
    let mut replayed = 0;
    let mut failures = Vec::new();
    for case in cases().iter().filter(|c| !is_later(c)) {
        let actual = run_case(case);
        let id = case["id"].as_str().unwrap();
        if actual.hit_restore {
            failures.push(format!(
                "{id}: needs the CrossOver restore, which is not in LATER"
            ));
            continue;
        }
        let problems = compare(case, &actual);
        if !problems.is_empty() {
            failures.push(format!("{id}:\n  {}", problems.join("\n  ")));
        }
        replayed += 1;
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
    check_floor("replayed switch cases", replayed, REPLAYED_FLOOR).unwrap();
}

/// A case in `LATER` is one this build cannot replay: a concurrent interleave, or a switch that needs
/// the restore. When 87-41 ports one the case moves out of the list; until then the list is exact.
#[test]
fn the_later_list_names_exactly_the_cases_this_build_cannot_replay() {
    let all = cases();
    for id in LATER {
        assert!(all.iter().any(|c| c["id"] == id), "{id} is not a case");
    }
    let mut stale = Vec::new();
    for case in all.iter().filter(|c| is_later(c)) {
        let id = case["id"].as_str().unwrap();
        if case["args"]["mode"] == "concurrent" {
            continue;
        }
        if !run_case(case).hit_restore {
            stale.push(id);
        }
    }
    assert!(
        stale.is_empty(),
        "no longer need the restore, so take them out of LATER and replay them: {stale:?}"
    );
    let sequential_later = all
        .iter()
        .filter(|c| is_later(c) && c["args"]["mode"] != "concurrent")
        .count();
    assert_eq!(sequential_later, LATER.len() - 6);
}

#[test]
fn the_replay_is_not_vacuous() {
    // A refusal replays with its reason, and a marker a newer build wrote is byte-identical after.
    let all = cases();
    let newer = all
        .iter()
        .find(|c| c["id"] == "newer-marker-refused-to-crossover")
        .unwrap();
    let actual = run_case(newer);
    assert_eq!(actual.outcomes[0]["result"]["ok"], json!(false));
    assert_eq!(actual.outcomes[0]["result"]["reason"], "marker-newer");
    assert_eq!(actual.markers, actual.markers_before);
    // The comparison fails a changed marker.
    let mut tampered = run_case(newer);
    tampered.markers["fx-newer-marker"] = json!("{}");
    assert!(!compare(newer, &tampered).is_empty());
    assert_eq!(sha256_hex(b"").len(), 64);
    assert_eq!(BOTTLES_REL, "Library/Application Support/CrossOver/Bottles");
}
