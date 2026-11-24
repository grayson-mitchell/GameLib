//! The tier-2 registry and dllOverrides fixes against the TS goldens (88-06 recorded them, 88-09 replays
//! them; D-15, D-22). `golden/registry` holds 57 cases, each a list of steps run on a fresh fake HOME:
//!
//! - pure steps (`validate`, `dllCompile`, `profileFixes`, `commandParts`, `regIsSet`, `prefixDir`,
//!   `timeout`): the module's functions over the step's input, compared with `result.json` and the
//!   warnings with `events.json`;
//! - `apply`: `apply_registry_fixes` over a recording [`RegistryRun`] scripted from the step's outcomes,
//!   compared with `result.json`, `events.json` and `calls.json`;
//! - `profileApply`: the profile read and the application over the same recording run (seam
//!   `scripted`), or over gamelib-wine's command core on a scripted spawn seam (seam `real`).
//!
//! Documented differences (`deltas.json`): a timed-out `reg add` is killed through its helper's group, so
//! the replay records the kill without the signal name; the events' `prefix` field (the TS log prefix) is
//! not a Rust concept. A count floor lives in this file, so editing the JSON alone cannot lower the bar,
//! and an empty case list fails (D-22: every case runs on a gamelib_testutil FakeHome).

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::RecordingLog;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_knownfix::jsvalue::JsValue;
use gamelib_knownfix::registry::{
    apply_known_fix_profile_registry_with, apply_registry_fixes, command_parts,
    dll_overrides_to_registry_fixes, prefix_dir, profile_registry_fixes_js,
    validate_registry_fixes, value_is_set, RegistryRun, RegistryRunOutcome, RunFuture, RunOptions,
    ValidRegistryFix, BRIDGE_RUN_OPTIONS, LAUNCHER_RUN_OPTIONS, REGISTRY_FIX_TIMEOUT,
};
use gamelib_knownfix::types::Runner;
use gamelib_knownfix::CancellationToken;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

/// `golden/registry` holds 57 cases; the plan asks for at least 50 to be compared. A later edit may raise
/// this, never lower it.
const REGISTRY_FLOOR: usize = 52;

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/registry")
}

fn read_text(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&read_text(path)).unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

/// The oracle's profile layout rooted in a fake HOME: the app folder is `<HOME>/.config/GameLib` and the
/// bundled fixes `<HOME>/public/fixes`.
struct Rig {
    home: FakeHome,
    log: Arc<RecordingLog>,
    ctx: KnownFixCtx,
}

impl Rig {
    fn new() -> Rig {
        let home = FakeHome::new("knownfix-registry-golden-");
        let root = home.root().to_path_buf();
        let app_folder = root.join(".config").join("GameLib");
        let log = Arc::new(RecordingLog::new());
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                tools_path: app_folder.join("tools"),
                user_data: root
                    .join("Library")
                    .join("Application Support")
                    .join("GameLib"),
                app_folder,
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_log(log.clone());
        let ctx = KnownFixCtx::new(
            Arc::new(engine),
            Some(root.join("public").join("fixes")),
            "https://relay.test",
            "0.0.0",
        );
        Rig { home, log, ctx }
    }

    fn root(&self) -> &Path {
        self.home.root()
    }

    fn expand(&self, text: &str) -> String {
        text.replace(
            "<APPFOLDER>",
            &self
                .root()
                .join(".config")
                .join("GameLib")
                .to_string_lossy(),
        )
        .replace("<HOME>", &self.root().to_string_lossy())
    }

    fn expand_deep(&self, value: &Value) -> Value {
        match value {
            Value::String(s) => Value::String(self.expand(s)),
            Value::Array(items) => {
                Value::Array(items.iter().map(|v| self.expand_deep(v)).collect())
            }
            Value::Object(map) => Value::Object(
                map.iter()
                    .map(|(k, v)| (k.clone(), self.expand_deep(v)))
                    .collect(),
            ),
            other => other.clone(),
        }
    }

    /// Every profile root in `text` replaced by its placeholder (macOS `/var` is `/private/var`, so the
    /// real name is listed too), Windows separators folded to `/`.
    fn normalise_text(&self, text: &str) -> String {
        let as_text = |p: &Path| p.to_string_lossy().into_owned();
        let app = self.root().join(".config").join("GameLib");
        let mut table = vec![
            ("<APPFOLDER>", as_text(&app)),
            ("<HOME>", as_text(self.root())),
        ];
        if !cfg!(windows) {
            if let Ok(real) = std::fs::canonicalize(self.root()) {
                if real != self.root() {
                    table.insert(
                        0,
                        (
                            "<APPFOLDER>",
                            as_text(&real.join(".config").join("GameLib")),
                        ),
                    );
                    table.push(("<HOME>", as_text(&real)));
                }
            }
        }
        let mut s = text.to_string();
        for (token, root) in table {
            s = s.replace(root.as_str(), token);
        }
        if cfg!(windows) && (s.contains("<APPFOLDER>") || s.contains("<HOME>")) {
            s = s.replace('\\', "/");
        }
        s
    }

    fn normalise(&self, value: Value) -> Value {
        match value {
            Value::String(s) => Value::String(self.normalise_text(&s)),
            Value::Array(items) => {
                Value::Array(items.into_iter().map(|v| self.normalise(v)).collect())
            }
            Value::Object(map) => Value::Object(
                map.into_iter()
                    .map(|(k, v)| (k, self.normalise(v)))
                    .collect(),
            ),
            other => other,
        }
    }

    fn seed(&self, entries: &Value) {
        for entry in entries.as_array().into_iter().flatten() {
            let target = PathBuf::from(self.expand(entry["path"].as_str().unwrap()));
            assert!(
                target.starts_with(self.root()),
                "seed {target:?} is outside the profile"
            );
            if entry["dir"].as_bool() == Some(true) {
                std::fs::create_dir_all(&target).unwrap();
            } else {
                std::fs::create_dir_all(target.parent().unwrap()).unwrap();
                std::fs::write(&target, entry["text"].as_str().unwrap()).unwrap();
            }
        }
    }
}

/// An object's value under `key` in an order-preserving parsed tree, when present.
fn member<'a>(value: &'a JsValue, key: &str) -> Option<&'a JsValue> {
    match value {
        JsValue::Object(entries) => entries.iter().find(|(k, _)| k == key).map(|(_, v)| v),
        _ => None,
    }
}

fn items(value: &JsValue) -> &[JsValue] {
    match value {
        JsValue::Array(items) => items,
        other => panic!("{} is not an array", other.stringify()),
    }
}

/// One scripted `reg add` run: how it settles (`outcomes` of a step).
#[derive(Debug, Clone)]
struct Scripted {
    code: Option<i32>,
    result: String,
    message: String,
    child: Option<(u32, bool)>,
}

impl Scripted {
    fn parse(value: &Value) -> Scripted {
        let result = value["result"].as_str().unwrap_or("code").to_string();
        Scripted {
            code: Some(value["code"].as_i64().map(|c| c as i32).unwrap_or(0)),
            result,
            message: value["message"].as_str().unwrap_or("rejected").to_string(),
            child: value
                .get("child")
                .map(|c| (c["pid"].as_u64().unwrap() as u32, c["exitCode"].is_null())),
        }
    }
}

/// What a recording run says its calls look like: a plain run records the command parts only; a
/// wine-shaped one also records what the wine command was asked with.
#[derive(Clone)]
enum Seam {
    Plain,
    Wine {
        options: RunOptions,
        wine_prefix: Option<String>,
    },
}

/// A [`RegistryRun`] that records each call and settles from a script. A run that "never" settles ends
/// when its cancel token fires, killing its scripted child when that is still running.
struct RecordingRun {
    step: usize,
    seam: Seam,
    outcomes: Mutex<VecDeque<Scripted>>,
    otherwise: Option<Scripted>,
    calls: Arc<Mutex<Vec<Value>>>,
}

impl RecordingRun {
    fn left(&self) -> usize {
        self.outcomes.lock().unwrap().len()
    }
}

impl RegistryRun for RecordingRun {
    fn run(&self, parts: Vec<String>, cancel: CancellationToken) -> RunFuture<'_> {
        let step = self.step;
        let call = match &self.seam {
            Seam::Plain => json!({"step": step, "kind": "run", "commandParts": parts}),
            Seam::Wine {
                options,
                wine_prefix,
            } => json!({
                "step": step,
                "kind": "runWineCommand",
                "commandParts": parts,
                "wait": false,
                "protonVerb": options.proton_verb,
                "skipPrefixCheckIKnowWhatImDoing": if options.skip_prefix_check { json!(true) } else { Value::Null },
                "winePrefix": wine_prefix,
            }),
        };
        self.calls.lock().unwrap().push(call);
        let scripted = self
            .outcomes
            .lock()
            .unwrap()
            .pop_front()
            .or_else(|| self.otherwise.clone())
            .unwrap_or_else(|| Scripted::parse(&json!({})));
        let calls = Arc::clone(&self.calls);
        Box::pin(async move {
            match scripted.result.as_str() {
                "undefined" => RegistryRunOutcome::Code(None),
                "reject" => RegistryRunOutcome::Failed(scripted.message),
                "never" => {
                    cancel.cancelled().await;
                    match scripted.child {
                        Some((pid, true)) => {
                            calls
                                .lock()
                                .unwrap()
                                .push(json!({"step": step, "kind": "kill", "pid": pid}));
                            RegistryRunOutcome::Killed(Some(pid))
                        }
                        _ => RegistryRunOutcome::Cancelled,
                    }
                }
                _ => RegistryRunOutcome::Code(scripted.code),
            }
        })
    }
}

fn options_of(seam: &str) -> Seam {
    match seam {
        "plain" => Seam::Plain,
        other => panic!("unknown seam {other}"),
    }
}

/// The three results every step of a case produces.
struct Step {
    result: Value,
}

fn fix_of(value: &Value) -> ValidRegistryFix {
    serde_json::from_value(value.clone()).unwrap_or_else(|e| panic!("{value}: {e}"))
}

fn views_of(value: &Value) -> u8 {
    value.as_u64().unwrap() as u8
}

fn validated_json(fixes: &[ValidRegistryFix]) -> Value {
    serde_json::to_value(fixes).unwrap()
}

/// Runs one step; returns its `result.json` entry. Calls and events are filed by the caller.
async fn run_step(
    rig: &Rig,
    index: usize,
    step: &Value,
    ordered: &JsValue,
    calls: &Arc<Mutex<Vec<Value>>>,
) -> Step {
    let op = step["op"].as_str().unwrap();
    let raw = member(ordered, "raw");
    let label = "gog 123";
    let result = match op {
        "validate" => {
            let got = validate_registry_fixes(&rig.ctx, raw, label);
            json!({"op": op, "raw": step["raw"], "result": validated_json(&got)})
        }
        "dllCompile" => {
            let compiled = dll_overrides_to_registry_fixes(&rig.ctx, raw, label);
            let compiled_json: Vec<Value> = compiled.iter().map(JsValue::to_value).collect();
            let mut out = json!({
                "op": op,
                "raw": step.get("raw").cloned().unwrap_or(Value::Null),
                "compiled": compiled_json,
            });
            if step["thenValidate"].as_bool() == Some(true) {
                let tree = JsValue::Array(compiled);
                let got = validate_registry_fixes(&rig.ctx, Some(&tree), label);
                out["validated"] = validated_json(&got);
            }
            out
        }
        "profileFixes" => {
            let profile = member(ordered, "profile").unwrap();
            let got = profile_registry_fixes_js(
                &rig.ctx,
                member(profile, "registry"),
                member(profile, "dllOverrides"),
                label,
            );
            json!({
                "op": op,
                "profile": step["profile"],
                "result": got.as_ref().map(JsValue::to_value).unwrap_or(Value::Null),
                "isUndefined": got.is_none(),
                "isTheProfileRegistry": member(profile, "dllOverrides").is_none(),
            })
        }
        "commandParts" => {
            let fix = fix_of(&step["fix"]);
            let parts = command_parts(&fix, views_of(&step["view"]));
            json!({"op": op, "fix": step["fix"], "view": step["view"], "parts": parts})
        }
        "regIsSet" => {
            let fix = fix_of(&step["fix"]);
            let set = value_is_set(
                step["regText"].as_str().unwrap(),
                &fix,
                views_of(&step["view"]),
            );
            json!({"op": op, "fix": step["fix"], "view": step["view"], "isSet": set})
        }
        "prefixDir" => {
            let settings = rig.expand_deep(&step["settings"]);
            let dir = prefix_dir(rig.root(), &settings)
                .map(|p| Value::String(p.to_string_lossy().into_owned()))
                .unwrap_or(Value::Null);
            json!({"op": op, "settings": step["settings"], "dir": dir})
        }
        "timeout" => json!({"op": op, "ms": REGISTRY_FIX_TIMEOUT.as_millis() as u64}),
        "apply" => {
            let prefix = step["prefix"].as_str().map(|p| rig.expand(p));
            if let Some(entries) = step.get("seed") {
                rig.seed(entries);
            }
            let seam = match step["seam"].as_str().unwrap() {
                "bridge" => Seam::Wine {
                    options: BRIDGE_RUN_OPTIONS,
                    wine_prefix: prefix.clone(),
                },
                other => options_of(other),
            };
            let run = RecordingRun {
                step: index,
                seam,
                outcomes: Mutex::new(
                    step["outcomes"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(Scripted::parse)
                        .collect(),
                ),
                otherwise: None,
                calls: Arc::clone(calls),
            };
            apply_registry_fixes(
                &rig.ctx,
                raw,
                step["label"].as_str().unwrap(),
                &run,
                prefix.as_deref().map(Path::new),
            )
            .await;
            json!({
                "op": op,
                "raw": step["raw"],
                "label": step["label"],
                "logPrefix": step["logPrefix"],
                "seam": step["seam"],
                "prefix": step["prefix"].as_str().map(Value::from).unwrap_or(Value::Null),
                "settled": true,
                "outcomesLeft": run.left(),
            })
        }
        "profileApply" => {
            rig.seed(&step["seed"]);
            let settings = rig.expand_deep(&step["settings"]);
            let runner = Runner::parse(step["runner"].as_str().unwrap()).unwrap();
            let run = RecordingRun {
                step: index,
                seam: Seam::Wine {
                    options: LAUNCHER_RUN_OPTIONS,
                    wine_prefix: settings["winePrefix"].as_str().map(str::to_string),
                },
                outcomes: Mutex::new(
                    step["outcomes"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .map(Scripted::parse)
                        .collect(),
                ),
                otherwise: step.get("otherwise").map(Scripted::parse),
                calls: Arc::clone(calls),
            };
            apply_known_fix_profile_registry_with(
                &rig.ctx,
                step["appName"].as_str().unwrap(),
                runner,
                &settings,
                &run,
            )
            .await;
            json!({
                "op": op,
                "appName": step["appName"],
                "runner": step["runner"],
                "seam": step["seam"],
                "settled": true,
            })
        }
        other => panic!("unknown step op {other}"),
    };
    Step { result }
}

fn is_real_seam(case: &Value) -> bool {
    case["steps"]
        .as_array()
        .unwrap()
        .iter()
        .any(|s| s["seam"] == "real")
}

/// Runs one case on a fresh fake HOME; returns `(result, events, calls)` normalised like the golden.
async fn run_case(case: &Value, ordered: &JsValue) -> (Value, Value, Value) {
    let rig = Rig::new();
    let calls = Arc::new(Mutex::new(Vec::new()));
    let mut results = Vec::new();
    let mut events = Vec::new();
    let ordered_steps = member(ordered, "steps").unwrap();
    for (index, step) in case["steps"].as_array().unwrap().iter().enumerate() {
        let before = rig.log.lines().len();
        let done = run_step(&rig, index, step, &items(ordered_steps)[index], &calls).await;
        results.push(done.result);
        for (level, line) in rig.log.lines().into_iter().skip(before) {
            events.push(json!({
                "step": index,
                "level": if level == "warn" { "warning" } else { level },
                "text": line,
            }));
        }
    }
    let calls = calls.lock().unwrap().clone();
    (
        rig.normalise(json!({ "steps": results })),
        rig.normalise(Value::Array(events)),
        rig.normalise(Value::Array(calls)),
    )
}

/// The golden's events without the TS log prefix, which has no Rust counterpart.
fn golden_events(dir: &Path) -> Value {
    let mut events = read_json(&dir.join("events.json"));
    for event in events.as_array_mut().unwrap() {
        event.as_object_mut().unwrap().remove("prefix");
    }
    events
}

/// The golden's calls as the replay can state them: the wine runner's own `runner.run` lines belong to
/// the spawn-level comparison, the TS-only `hasOnSpawn` and `gameSettingsIsTheCallers` flags are true by
/// construction in Rust (the seam takes the settings and a cancel), and a kill is recorded without the
/// signal name because the helper's whole group is killed (`deltas.json`).
fn golden_calls(dir: &Path) -> Value {
    let calls = read_json(&dir.join("calls.json"));
    let mut out = Vec::new();
    for mut call in calls.as_array().unwrap().iter().cloned() {
        let object = call.as_object_mut().unwrap();
        match object["kind"].as_str().unwrap() {
            "runner.run" => continue,
            "kill" => {
                object.remove("signal");
            }
            "runWineCommand" => {
                assert_eq!(object.remove("hasOnSpawn"), Some(json!(true)));
                assert_eq!(object.remove("gameSettingsIsTheCallers"), Some(json!(true)));
            }
            _ => {}
        }
        out.push(call);
    }
    Value::Array(out)
}

fn load_cases() -> (Vec<Value>, Vec<JsValue>) {
    let path = golden_dir().join("cases.json");
    let ordered = JsValue::parse(&read_text(&path)).unwrap_or_else(|e| panic!("{path:?}: {e}"));
    let cases = match ordered.to_value() {
        Value::Array(cases) => cases,
        other => panic!("cases.json is not an array: {other}"),
    };
    (cases, items(&ordered).to_vec())
}

/// One paused-clock replay of every case the seam-free (and scripted-seam) replay can run. The clock is
/// paused so a `reg add` that never settles hits its 15 s bound without waiting for it.
#[tokio::test(start_paused = true)]
async fn every_registry_golden_replays() {
    let (cases, ordered) = load_cases();
    let started = std::time::Instant::now();
    let mut compared = 0usize;
    let mut failures = Vec::new();
    for (case, ordered) in cases.iter().zip(&ordered) {
        if is_real_seam(case) {
            continue;
        }
        let id = case["id"].as_str().unwrap();
        let dir = golden_dir().join("expected").join(id);
        let (result, events, calls) = run_case(case, ordered).await;
        let checks = [
            ("result", result, read_json(&dir.join("result.json"))),
            ("events", events, golden_events(&dir)),
            ("calls", calls, golden_calls(&dir)),
        ];
        for (what, got, want) in checks {
            if got != want {
                failures.push(format!("{id}: {what}\n  want {want}\n  got  {got}"));
            }
        }
        compared += 1;
    }
    assert!(
        failures.is_empty(),
        "{} differences over {compared} cases:\n{}",
        failures.len(),
        failures.join("\n")
    );
    check_floor("golden/registry cases compared", compared, REGISTRY_FLOOR).unwrap();
    // Four cases wait out 15 s of virtual time each; none of that was real.
    assert!(
        started.elapsed() < std::time::Duration::from_secs(10),
        "the replay waited on the wall clock"
    );
}

#[test]
fn the_floor_matches_the_manifest_and_an_empty_list_fails() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let (cases, _) = load_cases();
    assert_eq!(manifest["count"].as_u64(), Some(cases.len() as u64));
    assert!(REGISTRY_FLOOR <= cases.len());
    assert!(
        cases.len() >= 57,
        "{} cases, below the 57 recorded",
        cases.len()
    );
    let ids: std::collections::BTreeSet<&str> =
        cases.iter().map(|c| c["id"].as_str().unwrap()).collect();
    assert_eq!(ids.len(), cases.len(), "case ids repeat");
    let folders = std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .count();
    assert_eq!(folders, cases.len(), "one expected folder per case");
    let err = check_floor("golden/registry cases", 0, REGISTRY_FLOOR).unwrap_err();
    assert!(err.contains("below the floor"), "{err}");
}

/// A fix as a test names it.
fn dword(key: &str, name: &str, value: u32) -> Value {
    json!({"key": key, "name": name, "type": "REG_DWORD", "value": value})
}

fn plain_run(outcomes: &[Value]) -> (RecordingRun, Arc<Mutex<Vec<Value>>>) {
    let calls = Arc::new(Mutex::new(Vec::new()));
    (
        RecordingRun {
            step: 0,
            seam: Seam::Plain,
            outcomes: Mutex::new(outcomes.iter().map(Scripted::parse).collect()),
            otherwise: None,
            calls: Arc::clone(&calls),
        },
        calls,
    )
}

#[tokio::test(start_paused = true)]
async fn a_run_that_never_settles_is_cancelled_at_15_s_and_the_next_fix_still_runs() {
    let rig = Rig::new();
    let raw = JsValue::from_value(&json!([
        dword("HKCU\\Software\\Foo", "A", 1),
        dword("HKCU\\Software\\Foo", "B", 1),
    ]));
    // The first fix's first view never settles (its child is alive); everything after settles.
    let mut script = vec![json!({"result": "never", "child": {"pid": 4242, "exitCode": null}})];
    script.extend(std::iter::repeat(json!({})).take(3));
    let (run, calls) = plain_run(&script);
    let begun = tokio::time::Instant::now();
    apply_registry_fixes(&rig.ctx, Some(&raw), "gog 123", &run, None).await;
    assert_eq!(begun.elapsed(), REGISTRY_FIX_TIMEOUT, "virtual time spent");
    let lines = rig.log.lines();
    assert_eq!(lines.len(), 1, "{lines:?}");
    assert_eq!(
        lines[0].1,
        "gog 123: registry fix HKCU\\Software\\Foo A (/reg:32) timed out after 15000 ms; killed reg add (pid 4242)"
    );
    // Four runs in all: the timed-out one did not stop the rest.
    let runs = calls
        .lock()
        .unwrap()
        .iter()
        .filter(|c| c["kind"] == "run")
        .count();
    assert_eq!(runs, 4);
    assert_eq!(run.left(), 0);
}

#[tokio::test(start_paused = true)]
async fn a_run_that_ignores_the_cancel_is_abandoned_after_the_grace_with_the_no_child_warning() {
    struct Stuck;
    impl RegistryRun for Stuck {
        fn run(&self, _parts: Vec<String>, _cancel: CancellationToken) -> RunFuture<'_> {
            Box::pin(std::future::pending())
        }
    }
    let rig = Rig::new();
    let raw = JsValue::from_value(&json!([dword("HKCU\\Software\\Foo", "A", 1)]));
    let begun = tokio::time::Instant::now();
    apply_registry_fixes(&rig.ctx, Some(&raw), "gog 123", &Stuck, None).await;
    // Two views, each bounded: never an unbounded wait.
    assert!(begun.elapsed() < 2 * (REGISTRY_FIX_TIMEOUT + std::time::Duration::from_secs(10)));
    let lines = rig.log.lines();
    assert_eq!(lines.len(), 2, "{lines:?}");
    assert!(lines[0].1.ends_with("timed out (no running child to kill)"));
}

#[tokio::test(start_paused = true)]
async fn an_application_after_shutdown_began_runs_nothing() {
    let rig = Rig::new();
    rig.ctx.engine.shutdown.token().cancel();
    let raw = JsValue::from_value(&json!([dword("HKCU\\Software\\Foo", "A", 1)]));
    let (run, calls) = plain_run(&[]);
    apply_registry_fixes(&rig.ctx, Some(&raw), "gog 123", &run, None).await;
    assert!(calls.lock().unwrap().is_empty());
    assert!(rig.log.lines().is_empty());
}
