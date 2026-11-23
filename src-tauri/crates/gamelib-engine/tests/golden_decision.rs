//! The engine decision against the TS goldens (87-13 recorded them, 87-45 ports them; D-08, D-20):
//! `golden/decision` holds one case per behaviour, each with several items, and every one replays.
//!
//! An item is replayed over its own fake profile laid out as the oracle's: CrossOver present, absent,
//! without `wine` or without the execute bit (real files, so the locator and the existence and
//! execute checks are the production ones), the pinned engines on disk (`installed` for the current pin,
//! that tree renamed for the retired one), the Wine Manager releases in the notice store file, the
//! running-games ledger for a busy bottle. The `--demo-status` probe, the `plutil` build read and the
//! wineserver stop are scripted spawns through the one seam. What is compared to the golden: the
//! decision (the selection, the pre-flight, the pin, `needsDownload`, the override and the log lines),
//! the log lines the run wrote, and the `wine --demo-status` spawn trace; the order of the probes and
//! wineserver stops is compared to the order of the TS's dependency calls. The tree is unchanged after
//! every item (reading engine state never creates or edits a file, 59-UAT G11).
//!
//! What this file does not replay, each with its reason:
//! - the offline gate and the `launch` verdict of a launch item (`gate`, `launch`): 87-46's
//!   `offline_launch_certainly_blocked` replay;
//! - the `locator` cases: 87-44's locator tests cover the resolver;
//! - items that script a rejecting resolver (`resolverRejects`): the Rust locator cannot reject;
//! - `g29-kill-throws`: the TS injected a wineserver stop that threw. Rust's stop never fails, so
//!   `a_failed_wineserver_stop_is_logged_and_the_retry_still_runs` pins that behaviour instead;
//! - a rejected probe spawn (`throws`): Rust reads it as a `nonzero-exit` with `code=null` (the
//!   divergence recorded in `crossover::demo_status`); the replay maps those strings back and says so.
//!
//! A count floor lives here beside the replay, so editing the JSON alone cannot lower the bar, and an
//! empty case list fails. POSIX only, as the TS oracle's replays are.
#![cfg(unix)]

mod common;

use std::os::unix::fs::PermissionsExt;
use std::sync::Arc;

use gamelib_core::process::SpecOutput;
use gamelib_engine::bottles::marker::MarkerSummary;
use gamelib_engine::crossover::locate::CrossoverLocator;
use gamelib_engine::ctx::EngineCtx;
use gamelib_engine::decision::creation::{decide_creation_engine, CX_CREATE_CAP_MS};
use gamelib_engine::decision::launch::{decide_launch_engine, DecideArgs};
use gamelib_engine::decision::override_options::{
    list_engine_override_options, options_value, resolve_wine_manager_staging,
};
use gamelib_engine::decision::preflight::{
    is_crossover_missing, preflight_crossover, MonitorPhase, PreflightArgs, ProbeTuning,
};
use gamelib_engine::engines::pinned_engine_paths;
use gamelib_engine::pins::{pins, EnginePin, EnginePins};
use gamelib_engine::testing::{FixedClock, RecordingLog, ScriptedSpecRunner};
use serde_json::{json, Value};

use common::{check_floor, materialise, read_json, Profile};

/// The manifest's own floor: the decision goldens at or above this count (the plan's acceptance bar).
const MANIFEST_FLOOR: usize = 80;

const BIN_REL: &str = "Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin";
const WM_VERSION: &str = "Wine-Staging-10.5";
const WM_OTHER_VERSION: &str = "Wine-Staging-9.0";
const RETIRED_PIN_ID: &str = "wine-staging-11.1";
const BUILD_TESTED: &str = "26.3.0.39832";

/// The ops this file replays.
const OPS: [&str; 6] = [
    "launch",
    "preflight",
    "creation",
    "options",
    "is-missing",
    "wm-staging",
];

fn golden_dir() -> std::path::PathBuf {
    common::fixtures().join("golden/decision")
}

fn cases() -> Vec<Value> {
    read_json(&golden_dir().join("cases.json"))
        .as_array()
        .unwrap()
        .clone()
}

fn step_output(step: &Value) -> SpecOutput {
    let text = |key: &str| {
        step.get(key)
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    };
    if let Some(message) = step.get("throws").and_then(Value::as_str) {
        return SpecOutput {
            code: None,
            stderr: message.to_string(),
            ..SpecOutput::default()
        };
    }
    SpecOutput {
        code: step.get("code").and_then(Value::as_i64).map(|c| c as i32),
        stdout: text("stdout"),
        stderr: text("stderr"),
        timed_out: step
            .get("timedOut")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        truncated: step
            .get("truncated")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        ..SpecOutput::default()
    }
}

fn cx_spec(name: &str) -> Value {
    let probe = match name {
        "healthy" => json!([{"code": 0, "stdout": "Standard version\n"}]),
        "missing" => json!([]),
        "expired" => json!([{"code": 0, "stdout": "Demo version (expired 3 days ago)\n"}]),
        "broken" => {
            json!([{"code": 1, "stdout": "", "stderr": "cxwine: bottle wrapper failed"}])
        }
        "inconclusive" => json!([{"code": null, "timedOut": true}]),
        other => panic!("unknown cx preset {other}"),
    };
    json!({
        "bin": if name == "missing" { "absent" } else { "present" },
        "build": BUILD_TESTED,
        "probe": probe,
    })
}

/// The item over the case's base, as the oracle's `resolveScenario` merged them.
fn scenario(base: &Value, item: &Value) -> Value {
    let mut merged = json!({
        "cx": "healthy",
        "offline": false,
        "bottle": "idle",
        "monitor": null,
        "pins": "current",
        "marker": "none",
        "releases": "installed",
        "wmFiles": "present",
        "bottleName": "GameLib-gog-1207658924",
        "key": "gog:1207658924",
        "killThrows": false,
        "resolverRejects": false,
        "markerReader": "present",
    });
    for source in [base, item] {
        if let Some(map) = source.as_object() {
            for (k, v) in map {
                merged[k] = v.clone();
            }
        }
    }
    let mut merged = materialise(&merged);
    if let Some(name) = merged["cx"].as_str().map(str::to_string) {
        merged["cx"] = cx_spec(&name);
    }
    merged
}

fn base_env(profile: &Profile) -> Vec<(String, String)> {
    profile
        .home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect()
}

fn write_file(path: &std::path::Path, mode: u32) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, "").unwrap();
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode)).unwrap();
}

fn retired_pin(current: &EnginePin) -> EnginePin {
    let mut pin = current.clone();
    pin.id = RETIRED_PIN_ID.to_string();
    pin.label = "Wine-Staging 11.1 + DXVK-macOS 1.10.3 (built-in)".to_string();
    pin.wine.version = "11.1".to_string();
    pin.wine.archive_name = "wine-staging-11.1-osx64.tar.xz".to_string();
    pin
}

struct Built {
    ctx: EngineCtx,
    runner: Arc<ScriptedSpecRunner>,
    log: Arc<RecordingLog>,
    table: EnginePins,
    scenario: Value,
}

/// One item's world: the profile's files, the scripted spawns and the context over them.
fn build(profile: &Profile, scenario: Value) -> Built {
    let sc = &scenario;
    let cx = &sc["cx"];
    let bin_dir = profile.root().join(BIN_REL);
    let bin = cx["bin"].as_str().unwrap();
    if bin != "absent" {
        write_file(&bin_dir.join("cxbottle"), 0o644);
        match bin {
            "present" => write_file(&bin_dir.join("wine"), 0o755),
            "not-executable" => write_file(&bin_dir.join("wine"), 0o644),
            _ => {}
        }
    }

    let current = pins().unwrap().current.clone();
    let retired = retired_pin(&current);
    match sc["pins"].as_str().unwrap() {
        "current" => profile.build_engines("installed"),
        "retired" => {
            profile.build_engines("installed");
            let root = profile.tools.join("steam-engines");
            std::fs::rename(root.join(&current.id), root.join(&retired.id)).unwrap();
        }
        _ => {}
    }
    let table = EnginePins {
        current: current.clone(),
        previous: (sc["pins"] == "retired").then(|| retired.clone()),
    };

    // The Wine Manager releases live in the notice store file the engine reads them from.
    let wine_root = profile.tools.join("wine");
    let releases = match sc["releases"].as_str().unwrap() {
        "none" => json!([]),
        state => json!([
            {
                "version": WM_VERSION, "type": "Wine-Staging-macOS",
                "isInstalled": state == "installed",
                "installDir": wine_root.join(WM_VERSION).to_string_lossy(),
            },
            {
                "version": WM_OTHER_VERSION, "type": "Wine-Staging-macOS",
                "isInstalled": false,
                "installDir": wine_root.join(WM_OTHER_VERSION).to_string_lossy(),
            },
        ]),
    };
    let store = profile.user_data.join("store/wine-downloader-info.json");
    std::fs::create_dir_all(store.parent().unwrap()).unwrap();
    std::fs::write(&store, json!({ "wine-releases": releases }).to_string()).unwrap();
    if sc["releases"] == "installed" && sc["wmFiles"] == "present" {
        let wm_bin = wine_root
            .join(WM_VERSION)
            .join("Contents/Resources/wine/bin");
        write_file(&wm_bin.join("wine"), 0o755);
        write_file(&wm_bin.join("wineserver"), 0o755);
    }

    // The probe answers one step per attempt, the last repeating; the build read is `plutil`.
    let wine = bin_dir.join("wine").to_string_lossy().into_owned();
    let mut runner = ScriptedSpecRunner::new(base_env(profile));
    for step in cx["probe"].as_array().unwrap() {
        runner = runner.on_program(&wine, step_output(step));
    }
    runner = runner.on_program(
        &bin_dir.join("wineserver").to_string_lossy(),
        SpecOutput {
            code: Some(0),
            ..SpecOutput::default()
        },
    );
    let plutil = match &cx["build"] {
        Value::String(s) if s == "throws" => SpecOutput {
            code: None,
            stderr: "plutil failed".to_string(),
            ..SpecOutput::default()
        },
        Value::String(build) => SpecOutput {
            code: Some(0),
            stdout: format!("{build}\n"),
            ..SpecOutput::default()
        },
        _ => SpecOutput {
            code: Some(1),
            ..SpecOutput::default()
        },
    };
    let runner = Arc::new(runner.on_program("/usr/bin/plutil", plutil));

    let log = Arc::new(RecordingLog::new());
    let mut ctx = profile.ctx_with(log.clone(), Some(runner.clone()));
    // The machine's own /Applications must not answer.
    ctx.clock = Arc::new(FixedClock::new(1));
    ctx.crossover_locator = CrossoverLocator::with_system_applications(
        profile
            .root()
            .join("no-system-applications")
            .to_string_lossy()
            .into_owned(),
    );
    std::fs::create_dir_all(profile.root().join("tmp")).unwrap();
    if sc["bottle"] == "busy" {
        let name = sc["bottleName"].as_str().unwrap();
        ctx.ledger.mark_game_running(None, name, "gog:9999");
    }

    // The marker's read-only view (WR-01), as the TS scripted it; a retired pin's files exist for its
    // `retired-pinned` marker.
    let marker = sc["marker"].as_str().unwrap();
    if marker == "retired-pinned" {
        let retired_paths = pinned_engine_paths(&ctx, &retired);
        write_file(std::path::Path::new(&retired_paths.wineserver_bin), 0o755);
        write_file(std::path::Path::new(&retired_paths.wine_bin), 0o755);
    }
    Built {
        ctx,
        runner,
        log,
        table,
        scenario,
    }
}

fn marker_view(built: &Built) -> Option<MarkerSummary> {
    let sc = &built.scenario;
    if sc["markerReader"] == "absent" {
        return None;
    }
    let current = &built.table.current;
    let retired = retired_pin(current);
    let wineserver = |pin: &EnginePin| Some(pinned_engine_paths(&built.ctx, pin).wineserver_bin);
    let summary = |crossover, pin_id: Option<&str>, wm: Option<&str>, server: Option<String>| {
        Some(MarkerSummary {
            crossover,
            pin_id: pin_id.map(str::to_string),
            wine_manager_version: wm.map(str::to_string),
            pin_wineserver_bin: server,
        })
    };
    match sc["marker"].as_str().unwrap() {
        "none" => None,
        "crossover" => summary(true, None, None, None),
        "pinned" => summary(false, Some(&current.id), None, wineserver(current)),
        "wine-manager" => summary(false, None, Some(WM_VERSION), None),
        "null-pin-id" => summary(false, None, None, None),
        "retired-pinned" | "retired-pinned-absent" => {
            summary(false, Some(RETIRED_PIN_ID), None, wineserver(&retired))
        }
        other => panic!("unknown marker {other}"),
    }
}

fn tuning(profile: &Profile, sc: &Value) -> ProbeTuning {
    ProbeTuning {
        base_env: Some(base_env(profile)),
        timeout_ms: sc.get("probeTimeoutMs").and_then(Value::as_u64),
        retry_settle_ms: Some(0),
    }
}

fn monitor_of(sc: &Value) -> Option<MonitorPhase> {
    match sc["monitor"].as_str() {
        Some("running") => Some(MonitorPhase::Running),
        Some("starting") => Some(MonitorPhase::Starting),
        _ => None,
    }
}

fn logs_of(log: &RecordingLog) -> Vec<String> {
    log.lines()
        .into_iter()
        .map(|(level, line)| {
            // The TS level names; the TS logger says WARNING where the engine log says warn.
            let level = match level {
                "warn" => "WARNING".to_string(),
                other => other.to_uppercase(),
            };
            format!("{level} {line}")
        })
        .collect()
}

/// What the TS recorded for a rejected probe spawn, from what Rust says for a spawn that failed: the
/// divergence recorded in `crossover::demo_status`. Applied only to an item that scripts a `throws`.
fn as_ts_spawn_error(text: &str, message: &str) -> String {
    text.replace(
        &format!("outcome=nonzero-exit code=null stderr={message} stdout="),
        &format!("outcome=spawn-error {message}"),
    )
    .replace(
        &format!("nonzero-exit on 2 consecutive attempts: code=null stderr={message} stdout="),
        &format!("spawn-error on 2 consecutive attempts: {message}"),
    )
    .replace(
        "--demo-status nonzero-exit for bottle",
        "--demo-status spawn-error for bottle",
    )
}

fn map_strings(value: Value, message: &str) -> Value {
    match value {
        Value::String(s) => Value::String(as_ts_spawn_error(&s, message)),
        Value::Array(items) => {
            Value::Array(items.into_iter().map(|v| map_strings(v, message)).collect())
        }
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(k, v)| (k, map_strings(v, message)))
                .collect(),
        ),
        other => other,
    }
}

/// The message of a scripted `throws` step, if the item has one.
fn throws_message(sc: &Value) -> Option<String> {
    sc["cx"]["probe"]
        .as_array()?
        .iter()
        .find_map(|step| step["throws"].as_str().map(str::to_string))
}

/// The order of the `wine` probes and the wineserver stops, as the TS's dependency calls had it. A probe
/// of a name the engine layer refuses is a call that spawns nothing, so only as many probes count as
/// the golden recorded spawns.
fn expected_order(calls: &str, mut spawned_probes: usize) -> Vec<&'static str> {
    calls
        .split(" > ")
        .filter_map(|call| {
            if call.starts_with("probe ") {
                if spawned_probes == 0 {
                    return None;
                }
                spawned_probes -= 1;
                Some("wine")
            } else if call.starts_with("killCrossoverWineserver ") {
                Some("wineserver")
            } else {
                None
            }
        })
        .collect()
}

/// One item: the outcome in the golden's vocabulary, the spawns of the probe and the order of the
/// probes and stops.
struct Replayed {
    outcome: Value,
    wine_spawns: Vec<Value>,
    order: Vec<&'static str>,
}

async fn replay_item(profile: &Profile, op: &str, sc: Value) -> Replayed {
    let built = build(profile, sc);
    let before = profile.snapshot();
    let sc = &built.scenario;
    let ctx = &built.ctx;
    let key = sc["key"].as_str().unwrap().to_string();
    let bottle = sc["bottleName"].as_str().unwrap().to_string();
    let table = built.table.clone();

    let mut outcome = match op {
        "launch" => {
            let decision = decide_launch_engine(
                ctx,
                &DecideArgs {
                    key,
                    bottle_name: bottle,
                    override_value: sc.get("setting").cloned().unwrap_or(Value::Null),
                    monitor_phase: monitor_of(sc),
                    hint_wine_bins: Vec::new(),
                    pins: Some(table),
                    marker_view: marker_view(&built),
                    tuning: tuning(profile, sc),
                },
            )
            .await
            .unwrap();
            json!({ "decision": decision.to_value() })
        }
        "preflight" => {
            let preflight = preflight_crossover(
                ctx,
                &PreflightArgs {
                    bottle_name: bottle,
                    key: (sc["withKey"] != json!(false)).then_some(key),
                    kill_on_timeout: sc["killOnTimeout"].as_bool(),
                    monitor_phase: monitor_of(sc),
                    hint_wine_bins: Vec::new(),
                    tuning: tuning(profile, sc),
                },
            )
            .await;
            json!({ "preflight": preflight.to_value() })
        }
        "creation" => {
            let decision = decide_creation_engine(ctx, &key, Some(&table))
                .await
                .unwrap();
            json!({ "decision": decision.to_value(), "createCapMs": CX_CREATE_CAP_MS })
        }
        "options" => {
            json!({ "options": options_value(&list_engine_override_options(ctx, Some(&table)).await) })
        }
        "is-missing" => json!({ "missing": is_crossover_missing(ctx, &[]).await }),
        "wm-staging" => {
            let engine = resolve_wine_manager_staging(ctx, sc["version"].as_str().unwrap());
            json!({ "engine": engine })
        }
        other => panic!("op {other}"),
    };
    outcome["logs"] = json!(logs_of(&built.log));
    assert_eq!(
        profile.snapshot(),
        before,
        "reading engine state left something behind"
    );

    let spawns = built.runner.spawns();
    let wine_spawns: Vec<Value> = spawns
        .iter()
        .filter(|s| s.program.ends_with("/wine"))
        .map(|s| profile.normalise(s.to_json()))
        .collect();
    let order = spawns
        .iter()
        .filter_map(|s| {
            if s.program.ends_with("/wine") {
                Some("wine")
            } else if s.program.ends_with("/wineserver") {
                Some("wineserver")
            } else {
                None
            }
        })
        .collect();
    let outcome = profile.normalise(outcome);
    // `plutil` is Rust's own spawn (the TS scripted the build read): never more than one per item.
    assert!(
        spawns
            .iter()
            .filter(|s| s.program == "/usr/bin/plutil")
            .count()
            <= 1
    );
    assert!(
        built.runner.unscripted().is_empty(),
        "{:?}",
        built.runner.unscripted()
    );
    Replayed {
        outcome,
        wine_spawns,
        order,
    }
}

/// `result` and `calls` of one expected outcome, reduced to what Rust replays.
fn expected_outcome(op: &str, want: &Value) -> Value {
    let mut out = serde_json::Map::new();
    let keys: &[&str] = match op {
        "launch" | "creation" => &["decision"],
        "preflight" => &["preflight"],
        "options" => &["options"],
        "is-missing" => &["missing"],
        _ => &["engine"],
    };
    for key in keys {
        out.insert((*key).to_string(), want[*key].clone());
    }
    if op == "creation" {
        out.insert("createCapMs".to_string(), want["createCapMs"].clone());
    }
    out.insert("logs".to_string(), want["logs"].clone());
    Value::Object(out)
}

#[tokio::test]
async fn every_decision_golden_replays() {
    let cases = cases();
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let count = manifest["count"].as_u64().unwrap() as usize;
    assert_eq!(count, cases.len(), "the manifest counts the case list");
    check_floor("decision goldens", cases.len(), MANIFEST_FLOOR).unwrap();
    check_floor(
        "decision manifest",
        count,
        manifest["floor"].as_u64().unwrap() as usize,
    )
    .unwrap();
    let folders = std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .count();
    assert_eq!(folders, cases.len(), "expected/ holds one folder per case");

    let mut items = 0;
    let mut failures = Vec::new();
    for case in &cases {
        let id = case["id"].as_str().unwrap();
        let op = case["op"].as_str().unwrap();
        if !OPS.contains(&op) || id == "g29-kill-throws" {
            continue;
        }
        let expected_dir = golden_dir().join("expected").join(id);
        let expected = read_json(&expected_dir.join("result.json"));
        let expected_spawns = read_json(&expected_dir.join("spawns.json"));
        let base = case["args"].get("base").cloned().unwrap_or(json!({}));
        for (index, item) in case["args"]["items"].as_array().unwrap().iter().enumerate() {
            let sc = scenario(&base, item);
            if sc["resolverRejects"] == json!(true) {
                continue;
            }
            let profile = Profile::new();
            let message = throws_message(&sc);
            let replayed = replay_item(&profile, op, sc).await;
            let mut got = replayed.outcome.clone();
            if let Some(message) = &message {
                got = map_strings(got, message);
            }
            let want_outcome = &expected["outcomes"][index];
            let want = expected_outcome(op, want_outcome);
            if got != want {
                failures.push(format!(
                    "{id}[{index}]: outcome\n  input {item}\n  want {want}\n  got  {got}"
                ));
            }
            let want_spawns: Vec<Value> = expected_spawns
                .as_array()
                .unwrap()
                .iter()
                .filter(|s| s["item"].as_u64() == Some(index as u64))
                .map(|s| {
                    let mut s = s.clone();
                    s.as_object_mut().unwrap().remove("item");
                    if let Some(result) = s["result"].as_object_mut() {
                        result.remove("timedOut");
                        result.remove("truncated");
                    }
                    if message.is_some() && s["result"].get("error").is_some() {
                        let error = s["result"]["error"].clone();
                        s["result"].as_object_mut().unwrap().remove("error");
                        s["result"]["stderr"] = error;
                    }
                    s
                })
                .collect();
            if replayed.wine_spawns != want_spawns {
                failures.push(format!(
                    "{id}[{index}]: spawns\n  want {want_spawns:?}\n  got  {:?}",
                    replayed.wine_spawns
                ));
            }
            if let Some(calls) = want_outcome["calls"].as_str() {
                let want_order = expected_order(calls, want_spawns.len());
                if replayed.order != want_order {
                    failures.push(format!(
                        "{id}[{index}]: probe and stop order\n  want {want_order:?}\n  got  {:?}",
                        replayed.order
                    ));
                }
            }
            items += 1;
        }
    }
    assert!(items >= MANIFEST_FLOOR, "replayed {items} items");
    assert!(
        failures.is_empty(),
        "{} failures, first:\n{}",
        failures.len(),
        failures[..failures.len().min(3)].join("\n")
    );
}

#[test]
fn an_empty_or_shrunken_case_list_fails() {
    assert!(check_floor("decision goldens", 0, MANIFEST_FLOOR).is_err());
    assert!(check_floor("decision goldens", MANIFEST_FLOOR - 1, MANIFEST_FLOOR).is_err());
    assert!(check_floor("decision goldens", MANIFEST_FLOOR, MANIFEST_FLOOR).is_ok());
}

#[tokio::test]
async fn a_failed_wineserver_stop_is_logged_and_the_retry_still_runs() {
    // `g29-kill-throws` in the TS: the injected stop threw. Rust's stop never fails: a stop that could not
    // run is logged by the stop itself and the second probe still happens.
    let profile = Profile::new();
    let sc = scenario(
        &json!({"setting": "automatic"}),
        &json!({"cx": {"bin": "present", "build": BUILD_TESTED, "probe": [
            {"code": 1, "stdout": "", "stderr": "cxwine: bottle wrapper failed"},
            {"code": 0, "stdout": "Standard version\n"}
        ]}}),
    );
    let mut built = build(&profile, sc);
    // A wineserver the runner answers with no exit code: the stop did not run.
    let runner = Arc::new(
        ScriptedSpecRunner::new(base_env(&profile))
            .on_program(
                &profile.root().join(BIN_REL).join("wine").to_string_lossy(),
                step_output(&json!({"code": 1, "stderr": "cxwine: bottle wrapper failed"})),
            )
            .on_program(
                &profile.root().join(BIN_REL).join("wine").to_string_lossy(),
                step_output(&json!({"code": 0, "stdout": "Standard version\n"})),
            )
            .on_program(
                &profile
                    .root()
                    .join(BIN_REL)
                    .join("wineserver")
                    .to_string_lossy(),
                SpecOutput {
                    code: None,
                    stderr: "kill failed".to_string(),
                    ..SpecOutput::default()
                },
            ),
    );
    built.ctx.proc = runner.clone();
    let decision = decide_launch_engine(
        &built.ctx,
        &DecideArgs {
            key: "gog:1207658924".to_string(),
            bottle_name: "GameLib-gog-1207658924".to_string(),
            override_value: json!("automatic"),
            pins: Some(built.table.clone()),
            tuning: tuning(&profile, &built.scenario),
            ..DecideArgs::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(decision.reason(), Some("cx-healthy"));
    let programs: Vec<String> = runner
        .spawns()
        .iter()
        .map(|s| s.program.rsplit('/').next().unwrap().to_string())
        .filter(|p| p == "wine" || p == "wineserver")
        .collect();
    assert_eq!(programs, ["wine", "wineserver", "wine"]);
    assert!(logs_of(&built.log)
        .iter()
        .any(|l| l.contains("killBottleWineServerWith: wineserver -k for bottle")));
}
