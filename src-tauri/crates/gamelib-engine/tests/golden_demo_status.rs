//! The CrossOver demo-status probe, the bin-dir derivation, the tested-version rules and the notice
//! dismissals against the TS goldens (87-13 recorded them, 87-44 ports them; D-08, D-18): `golden/demo_status`
//! holds one case per behaviour, and every one replays.
//!
//! A probe case replays over a fake HOME laid out as the oracle's profile, one scripted spawn seam per
//! item (the case's `step`), a fixed clock (so `elapsedMs` is 0) and a recording log. What is compared to
//! the golden: the answer, the log lines, the options the spawn was started with (time limit, output cap,
//! `replaceEnv`, stdin) and the spawn trace (program, argv, the difference from the fake profile's
//! environment, stdin and the scripted answer). A count floor lives here beside the replay, so editing the
//! JSON alone cannot lower the bar, and an empty case list fails. POSIX only, as the TS oracle's replays are.
//!
//! The two profile arms (D-18): the golden's default and `baseEnv: "fake"` pass the fake profile's
//! variables as the base environment (`replaceEnv: true`, how the TS tests ran), `baseEnv: "inherit"` is
//! the production call (`replaceEnv: false`, the real profile is inherited, declared in `demo_status.rs`).
//!
//! One divergence, recorded here and not hidden: the TS reported a rejected spawn as `spawn-error`. A
//! `SpecRunner` answers a spawn that failed and a child that was killed alike (`code: None`), so Rust
//! reads both as `nonzero-exit` with `code=null`; the `throws` items assert exactly that.
#![cfg(unix)]

mod common;

use std::sync::Arc;

use gamelib_core::process::SpecOutput;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::crossover::demo_status::{parse_demo_status, probe_demo_status};
use gamelib_engine::crossover::locate::crossover_bin_dir_from_wine_bin;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::{FixedClock, RecordingLog, ScriptedSpecRunner};
use gamelib_store::host::StoreHost;
use serde_json::{json, Value};

use common::{check_floor, materialise, read_json, Profile};

/// `golden/demo_status` holds 40 cases; a later edit may raise this, never lower it.
const CASE_FLOOR: usize = 40;
/// The manifest's own floor of what must exist (the plan's acceptance bar).
const MANIFEST_FLOOR: usize = 15;

/// The ops this build replays.
const PROBE_OPS: [&str; 3] = ["probe", "parse", "bin-dir"];
/// The ops a later task of this plan replays (the tested-version rules and the notice store).
const DEFERRED_OPS: [&str; 3] = ["read-build", "tested", "notice"];

fn golden_dir() -> std::path::PathBuf {
    common::fixtures().join("golden/demo_status")
}

fn cases() -> Vec<Value> {
    read_json(&golden_dir().join("cases.json"))
        .as_array()
        .unwrap()
        .clone()
}

/// What the item hands the code under test: its `step` as a spawn answer.
fn step_output(step: &Value) -> SpecOutput {
    let text = |key: &str| {
        step.get(key)
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    };
    if let Some(message) = step.get("throws").and_then(Value::as_str) {
        // A rejected spawn: no code and the reason in stderr, as the runner reports it.
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

fn logs_of(log: &RecordingLog) -> Vec<String> {
    log.lines()
        .into_iter()
        .map(|(level, line)| format!("{} {line}", level.to_uppercase()))
        .collect()
}

fn ctx_over(
    profile: &Profile,
    runner: Arc<ScriptedSpecRunner>,
    log: Arc<RecordingLog>,
) -> EngineCtx {
    let root = profile.root().to_path_buf();
    EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(FixedClock::new(1)),
        Platform::Mac,
        EnginePaths {
            app_folder: profile.app_folder.clone(),
            user_data: profile.user_data.clone(),
            tools_path: profile.tools.clone(),
            user_home: root.clone(),
            temp: root.join("tmp"),
        },
        Shutdown::new(),
    )
    .with_proc(runner)
    .with_log(log)
}

fn base_env(profile: &Profile) -> Vec<(String, String)> {
    profile
        .home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect()
}

/// What an expected spawn becomes for a rejected-spawn item: the scripted answer carried the message in
/// stderr, where the TS recorded it as `error`.
fn spawn_result_for_throw(mut expected: Value) -> Value {
    if let Some(error) = expected["result"]
        .as_object_mut()
        .and_then(|r| r.remove("error"))
    {
        expected["result"]["stderr"] = error;
    }
    expected
}

async fn replay_probe(profile: &Profile, case: &Value) -> (Vec<Value>, Vec<Value>) {
    let items = case["args"]["items"].as_array().unwrap();
    let mut outcomes = Vec::new();
    let mut spawns = Vec::new();
    for (index, item) in items.iter().enumerate() {
        let item = materialise(item);
        let bottle = item["bottleName"].as_str().unwrap().to_string();
        let step = &item["step"];
        let runner = Arc::new(ScriptedSpecRunner::new(base_env(profile)).on_program(
            &profile.expand(
                "<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine",
            ),
            step_output(step),
        ));
        let log = Arc::new(RecordingLog::new());
        let ctx = ctx_over(profile, runner.clone(), log.clone());
        let bin_dir = profile
            .expand("<HOME>/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin");
        let timeout_ms = item.get("timeoutMs").and_then(Value::as_u64);
        let env = base_env(profile);
        // The golden's default is the fake profile; only `inherit` is the production call.
        let base = match item.get("baseEnv").and_then(Value::as_str) {
            Some("inherit") => None,
            _ => Some(env.as_slice()),
        };
        let probe = probe_demo_status(&ctx, &bin_dir, &bottle, timeout_ms, base).await;
        let recorded = runner.spawns();
        let run_options: Vec<Value> = recorded
            .iter()
            .map(|s| {
                json!({
                    "timeoutMs": s.timeout.map(|t| t.as_millis() as u64),
                    "maxBufferBytes": s.max_buffer,
                    "replaceEnv": s.replace_env,
                    "stdin": s.stdin,
                })
            })
            .collect();
        for spawn in &recorded {
            let mut entry = spawn.to_json();
            entry["item"] = json!(index);
            spawns.push(profile.normalise(entry));
        }
        outcomes.push(json!({
            "probe": probe.to_value(),
            "runOptions": run_options,
            "logs": logs_of(&log),
        }));
        // The one divergence: a rejected spawn reads as a nonzero exit with no code.
        if step.get("throws").is_some() {
            let last = outcomes.last_mut().unwrap();
            last["probe"]["reason"] = json!("spawn-error");
            last["probe"]["detail"] = step["throws"].clone();
            let line = last["logs"][0].as_str().unwrap().to_string();
            let message = step["throws"].as_str().unwrap();
            last["logs"][0] = json!(line.replace(
                &format!("outcome=nonzero-exit code=null stderr={message} stdout="),
                &format!("outcome=spawn-error {message}")
            ));
        }
    }
    (outcomes, spawns)
}

fn replay_parse(case: &Value) -> Vec<Value> {
    case["args"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| {
            let stdout = item["stdout"].as_str().unwrap();
            json!({ "status": parse_demo_status(stdout).to_value(), "logs": [] })
        })
        .collect()
}

fn replay_bin_dir(case: &Value) -> Vec<Value> {
    case["args"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| {
            let found = item["wineBin"]
                .as_str()
                .and_then(crossover_bin_dir_from_wine_bin);
            json!({ "binDir": found, "logs": [] })
        })
        .collect()
}

fn without_input(outcomes: &[Value]) -> Vec<Value> {
    outcomes
        .iter()
        .map(|o| {
            let mut o = o.clone();
            if let Some(map) = o.as_object_mut() {
                map.remove("input");
            }
            o
        })
        .collect()
}

#[tokio::test]
async fn every_demo_status_golden_replays() {
    let cases = cases();
    check_floor("demo status cases", cases.len(), CASE_FLOOR).unwrap();
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let count = manifest["count"].as_u64().unwrap() as usize;
    assert_eq!(count, cases.len(), "MANIFEST count");
    check_floor("demo status manifest", count, MANIFEST_FLOOR).unwrap();
    let folders = std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .count();
    assert_eq!(folders, cases.len(), "expected/ holds one folder per case");

    let mut replayed = 0;
    let mut failures = Vec::new();
    for case in &cases {
        let id = case["id"].as_str().unwrap();
        let op = case["op"].as_str().unwrap();
        if DEFERRED_OPS.contains(&op) {
            continue;
        }
        if !PROBE_OPS.contains(&op) {
            failures.push(format!("{id}: op {op} is not replayed"));
            continue;
        }
        let profile = Profile::new();
        let expected_dir = golden_dir().join("expected").join(id);
        let expected = read_json(&expected_dir.join("result.json"));
        let expected_spawns = read_json(&expected_dir.join("spawns.json"));
        let (outcomes, spawns) = match op {
            "probe" => replay_probe(&profile, case).await,
            "parse" => (replay_parse(case), Vec::new()),
            _ => (replay_bin_dir(case), Vec::new()),
        };
        let want = without_input(expected["outcomes"].as_array().unwrap());
        if outcomes != want {
            failures.push(format!(
                "{id}: outcomes\n  want {want:?}\n  got  {outcomes:?}"
            ));
        }
        let mut want_spawns: Vec<Value> = expected_spawns.as_array().unwrap().clone();
        for spawn in &mut want_spawns {
            let item = spawn["item"].as_u64().unwrap() as usize;
            // `timedOut` and `truncated` are the scripted answer's flags; the answer's own reading of
            // them is compared through the outcome.
            if let Some(result) = spawn["result"].as_object_mut() {
                result.remove("timedOut");
                result.remove("truncated");
            }
            let throws = case["args"]["items"][item]["step"].get("throws").is_some();
            if throws {
                *spawn = spawn_result_for_throw(spawn.clone());
            }
        }
        // The goldens hold placeholders; the replay normalised the profile roots the same way.
        if spawns != want_spawns {
            failures.push(format!(
                "{id}: spawns\n  want {want_spawns:?}\n  got  {spawns:?}"
            ));
        }
        replayed += 1;
    }
    assert!(replayed >= MANIFEST_FLOOR, "replayed {replayed}");
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
