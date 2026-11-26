//! The Rust replay of the launch scripts (88.2-13, D-22): `run_script_for_game` against `golden/script`, the
//! cases 88.2-04 recorded from the TypeScript `runScriptForGame`. Per call: the spawn (program, empty argv, the
//! whole environment, cwd, no timeout, the helper class, `resolveOn: exit`), the chunks and the error line at
//! the log writer boundary with their rotate flags, the general log (empty: a script writes none) and the
//! answer.
//!
//! The spawn seam is scripted (`CaseRunner` delivers the recorded chunks and exit), so a difference here is the
//! run's, not the pipe's. The scripts' `HOME` is the fake profile's (D-22: the operator's own in the app, a
//! `FakeHome` in every test). The count floor lives here next to the replay, so editing the JSON alone cannot
//! lower the bar.
//!
//! One documented difference (`golden/script/deltas.json`, `spawn-error-text`): the OS words a spawn failure
//! its own way, so a failing call is compared on `Err` and on the shape of its error line, not its text.

mod common;

use std::sync::Arc;

use common::*;
use gamelib_engine::ctx::Platform;
use gamelib_engine::testing::RecordingLog;
use gamelib_launch::runner::call_runner::RunnerHost;
use gamelib_launch::runner::script::{run_script_for_game, ScriptRunArgs, ScriptStage};
use gamelib_launch::runner::stream::LogHandOff;
use gamelib_log::frame::FrameTarget;
use serde::Deserialize;
use serde_json::{json, Value};

/// The cases of `golden/script` this file compares. A later edit may raise this, never lower it.
const SCRIPT_FLOOR: usize = 18;
/// The tracer replays the one case it names.
const TRACER_FLOOR: usize = 1;

#[derive(Debug, Clone, Deserialize)]
struct Call {
    stage: String,
    verbose: bool,
    outcome: String,
    chunks: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    id: String,
    call_site: String,
    #[serde(default)]
    process_env: std::collections::BTreeMap<String, String>,
    calls: Vec<Call>,
}

fn cases() -> Vec<Case> {
    let path = fixtures().join("golden/script/cases.json");
    serde_json::from_slice(&std::fs::read(&path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// What the scripted seam does for one recorded outcome (the TS oracle's `scriptStep`).
fn step_of(call: &Call) -> Step {
    let chunks = if call.chunks {
        vec![
            ScriptChunk {
                stream: "stdout".into(),
                text: "script says hi: ünï\n".into(),
            },
            ScriptChunk {
                stream: "stderr".into(),
                text: "script warns\n".into(),
            },
        ]
    } else {
        Vec::new()
    };
    match call.outcome.as_str() {
        "throw" => Step {
            throws: Some("ENOENT".into()),
            ..Step::default()
        },
        "exit-2" => Step {
            chunks,
            code: Some(Some(2)),
            ..Step::default()
        },
        "exit-0" | "exit-0-drain" => Step {
            chunks,
            code: Some(Some(0)),
            ..Step::default()
        },
        other => panic!("unknown script outcome {other}"),
    }
}

fn replay(case: &Case) -> Result<(), String> {
    let id = &case.id;
    let expected = fixtures().join("golden/script/expected").join(id);
    let rig = Rig::new();
    let class = class_of(&case.call_site);
    let runner = Arc::new(CaseRunner::new(case.calls.iter().map(step_of).collect()));
    let sink = Arc::new(RecordingLogSink::default());
    let engine_log = Arc::new(RecordingLog::new());
    let ctx = rig
        .launch_ctx(Platform::Linux, runner.clone(), engine_log)
        .with_log_sink(sink.clone());

    let mut env = rig.pinned_env();
    env.extend(case.process_env.clone());
    let host = RunnerHost {
        env,
        path: String::new(),
    };

    let want_spawns = read_json(&expected.join("spawns.json"));
    let want_spawns = want_spawns.as_array().cloned().unwrap_or_default();
    if want_spawns.len() != case.calls.len() {
        return Err(format!(
            "{id}: the golden holds {} spawns",
            want_spawns.len()
        ));
    }

    let mut answers: Vec<Result<bool, String>> = Vec::new();
    let rt = runtime();
    for (call, want) in case.calls.iter().zip(&want_spawns) {
        // The two JSON texts are what the sidecar's `JSON.stringify` wrote: handed over verbatim, so the
        // replay takes them from the golden's own environment (placeholders made real).
        let text = |key: &str| rig.expand(want["env"][key].as_str().unwrap_or_default());
        let args = ScriptRunArgs {
            script_path: rig.expand(&format!("<HOME>/scripts/{}.sh", call.stage)),
            stage: match call.stage.as_str() {
                "before" => ScriptStage::Before,
                _ => ScriptStage::After,
            },
            app_name: "script-app".into(),
            executable: Some("bin/game.exe".into()),
            prefix: Some(rig.expand("<HOME>/Games/prefix")),
            runner: "gog".into(),
            title: "Café Ünïcode — ゲーム \"quoted\"".into(),
            install_path: Some(rig.expand("<HOME>/Games/script app")),
            settings_json: text("HEROIC_GAME_SETTINGS"),
            info_json: text("HEROIC_GAME_INFO"),
            verbose: call.verbose,
            // Each call is a fresh `LogWriter`, so its first entry owes the rotation.
            log_target: Some(LogHandOff {
                target: FrameTarget {
                    kind: "game".into(),
                    app_name: Some("script-app".into()),
                    runner: Some("gog".into()),
                    log_type: Some("launch".into()),
                },
                disabled: false,
                rotate: true,
            }),
        };
        answers.push(rt.block_on(run_script_for_game(&ctx, args, &host)));
    }
    drop(rt);
    if runner.unused() > 0 {
        return Err(format!("{id}: a scripted spawn never happened"));
    }

    // result.json
    let want_result = read_json(&expected.join("result.json"));
    let want_calls = want_result["calls"].as_array().cloned().unwrap_or_default();
    if want_calls.len() != answers.len() {
        return Err(format!(
            "{id}: {} answers, want {}",
            answers.len(),
            want_calls.len()
        ));
    }
    for (index, (got, want)) in answers.iter().zip(&want_calls).enumerate() {
        match (got, want.get("thrown")) {
            (Ok(true), None) if want["value"] == json!(true) => {}
            // `spawn-error-text`: compared on `Err` only.
            (Err(message), Some(_)) if !message.is_empty() => {}
            _ => return Err(format!("{id}: call {index} answered {got:?}, want {want}")),
        }
    }

    // spawns.json
    let specs = lock(&runner.specs).clone();
    for (index, (spec, want)) in specs.iter().zip(&want_spawns).enumerate() {
        let env: std::collections::BTreeMap<String, String> = spec.env.iter().cloned().collect();
        let got = rig.normalise(json!({
            "program": spec.program,
            "argv": spec.argv,
            "env": env,
            "cwd": spec.cwd.as_ref().map(|c| c.to_string_lossy().into_owned()),
            "replaceEnv": spec.replace_env,
            "timeoutMs": spec.timeout.map(|t| t.as_millis() as u64),
            "windowsHide": spec.hide_window,
            "class": class,
        }));
        let wanted = json!({
            "program": want["program"],
            "argv": want["argv"],
            "env": want["env"],
            "cwd": want["cwd"],
            "replaceEnv": want["replaceEnv"],
            "timeoutMs": want["timeoutMs"],
            "windowsHide": want["windowsHide"],
            "class": want["class"],
        });
        if got != wanted {
            return Err(format!("{id}: spawn {index} is {got}, want {wanted}"));
        }
        // `resolveOn: exit` is the exit-plus-grace post-exit mode of the spawn seam.
        let post = format!("{:?}", spec.post_exit);
        if want["resolveOn"] != "exit" || post != "Grace(250ms)" {
            return Err(format!(
                "{id}: spawn {index} resolves with {post}, want Grace(250ms) (resolveOn {})",
                want["resolveOn"]
            ));
        }
        if spec.argv != Vec::<String>::new() {
            return Err(format!("{id}: spawn {index} has an argv"));
        }
    }

    // logFrames.json: the chunks and the error line at the writer boundary.
    let want_frames = read_json(&expected.join("logFrames.json"));
    let want_frames = want_frames.as_array().cloned().unwrap_or_default();
    let frames: Vec<Value> = lock(&sink.frames)
        .iter()
        .cloned()
        .map(|f| rig.normalise(f))
        .collect();
    if frames.len() != want_frames.len() {
        return Err(format!(
            "{id}: {} log frames, want {}: {frames:?}",
            frames.len(),
            want_frames.len()
        ));
    }
    for (index, (got, want)) in frames.iter().zip(&want_frames).enumerate() {
        if let Some(want_line) = want.get("line") {
            // `spawn-error-text`: the target, the rotate flag, the level and the prefix are the golden's; the
            // message is the OS's own words behind the TS's `Error: ` lead.
            let line = &got["line"];
            let message = line["message"].as_str().unwrap_or_default();
            if got["target"] != want["target"]
                || got["rotate"] != want["rotate"]
                || line["level"] != want_line["level"]
                || line["prefix"] != want_line["prefix"]
                || !message.starts_with("Error: ")
            {
                return Err(format!("{id}: frame {index} is {got}, want {want}"));
            }
        } else if got != want {
            return Err(format!("{id}: frame {index} is {got}, want {want}"));
        }
    }

    // events.json: a script writes no general log line.
    let want_events = read_json(&expected.join("events.json"));
    if want_events.as_array().is_some_and(|e| !e.is_empty()) || !lock(&sink.general).is_empty() {
        return Err(format!("{id}: the general log is not empty"));
    }
    Ok(())
}

fn compared(cases: &[Case], floor: usize) -> Result<usize, String> {
    let mut count = 0;
    let mut failures = Vec::new();
    for case in cases {
        match replay(case) {
            Ok(()) => count += 1,
            Err(e) => failures.push(e),
        }
    }
    if !failures.is_empty() {
        return Err(failures.join("\n"));
    }
    check_floor("golden_script", count, floor)?;
    Ok(count)
}

/// The tracer: one recorded pre-launch script case (stage `before`, verbose logs, exit 0).
#[test]
fn the_tracer_script_replays_with_its_spawn_its_chunks_and_its_answer() {
    let all = cases();
    let tracer: Vec<Case> = all
        .into_iter()
        .filter(|c| c.id == "script-before-verbose-exit-0")
        .collect();
    let n = compared(&tracer, TRACER_FLOOR).unwrap_or_else(|e| panic!("{e}"));
    println!("golden_script tracer compared {n} floor {TRACER_FLOOR}");
}

/// Every recorded case: before and after, verbose and quiet, exit 0, exit 2 and a spawn failure, the
/// inherited-env case, the grandchild-holds-the-pipes case and a before-then-after session.
#[test]
fn every_script_golden_replays_through_the_op() {
    let all = cases();
    let manifest = read_json(&fixtures().join("golden/script/MANIFEST.json"));
    assert_eq!(manifest["count"], json!(all.len()));
    let n = compared(&all, SCRIPT_FLOOR).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(n, all.len());
    assert_eq!(all.len(), manifest["floor"].as_u64().unwrap() as usize);
    println!("golden_script compared {n} floor {SCRIPT_FLOOR}");
}

/// A changed environment or a changed chunk fails the replay: the guard that the comparison compares.
#[test]
fn a_replay_with_a_changed_call_fails() {
    let mut case = cases()
        .into_iter()
        .find(|c| c.id == "script-before-verbose-exit-0")
        .expect("case");
    case.process_env
        .insert("EXTRA_FLAG".to_string(), "on".to_string());
    assert!(replay(&case).is_err(), "an extra inherited variable");
    let mut case = cases()
        .into_iter()
        .find(|c| c.id == "script-before-verbose-exit-0")
        .expect("case");
    case.calls[0].chunks = false;
    assert!(replay(&case).is_err(), "a script that printed nothing");
}

/// `spawn-error-text` is named with a reason.
#[test]
fn the_deltas_file_names_the_spawn_error_text_delta() {
    let deltas = read_json(&fixtures().join("golden/script/deltas.json"));
    assert!(deltas["spawn-error-text"]
        .as_str()
        .is_some_and(|t| t.len() > 40));
}
