//! The Rust replay of spawnAsync (88.2-14, D-30): `spawn_async` against `golden/spawn_async`, the cases
//! 88.2-05 recorded from the TypeScript `createSpawnAsync`. Per case: the spawn (program, argv, cwd, the whole
//! env or none, replace-env, the time limit, windowsHide, the helper class), the chunks the caller watching
//! the stream sees, and the answer (`{ code, stdout, stderr, timedOut, aborted }`, or the error the adapter
//! rejects with).
//!
//! The spawn seam is scripted (`CaseRunner` delivers the recorded chunks and exit), so a difference here is
//! the op's, not the pipe's. A `hold` step is a child still running: the replay kills it through the stream
//! id (`launch_runner_kill`'s registry call), which is how an abort reaches a Rust run. The recorded
//! `before-run` abort and the mid-run one are the same thing here: the TS shim sees an already-aborted signal
//! and sends the kill as soon as the run is registered. The count floor lives here next to the replay, so
//! editing the JSON alone cannot lower the bar.
//!
//! `tsOnly` cases (the adapter's own unsupported-option TypeError) stay with the TS adapter and are not
//! replayed. One documented difference (`golden/spawn_async/deltas.json`, `spawn-error-text`): a spawn failure
//! is worded by the OS, so a failing call is compared on being an error, not on its text.

mod common;

use std::sync::{Arc, Mutex};

use common::*;
use gamelib_core::process::Pipe;
use gamelib_engine::ctx::Platform;
use gamelib_engine::testing::RecordingLog;
use gamelib_launch::runner::spawn_async::{spawn_async, timeout_of, SpawnAsyncArgs};
use gamelib_launch::runner::stream::{NullSink, OutputSink};
use serde::Deserialize;
use serde_json::{json, Value};

/// The non-`tsOnly` cases of `golden/spawn_async` this file compares. A later edit may raise this, never
/// lower it.
const SPAWN_ASYNC_FLOOR: usize = 33;
/// The tracer replays the one case it names.
const TRACER_FLOOR: usize = 1;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Options {
    cwd: Option<String>,
    env: Option<std::collections::BTreeMap<String, String>>,
    /// A number, or the strings `NaN` and `Infinity` JSON cannot carry.
    timeout: Option<Value>,
    windows_hide: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    id: String,
    command: String,
    args: Vec<String>,
    #[serde(default)]
    options: Option<Options>,
    #[serde(default)]
    observe: bool,
    #[serde(default)]
    ts_only: bool,
    #[serde(default)]
    script: Vec<Step>,
}

fn cases() -> Vec<Case> {
    let path = fixtures().join("golden/spawn_async/cases.json");
    serde_json::from_slice(&std::fs::read(&path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// The timeout of a recorded option: what `child_process` would have made of it (`NaN` and `Infinity` are
/// not JSON, so the wire carries them as `null`).
fn timeout_ms(options: &Options) -> Option<f64> {
    match options.timeout.as_ref()? {
        Value::Number(n) => n.as_f64(),
        _ => None,
    }
}

/// Records the chunks the caller watching the stream sees.
#[derive(Default)]
struct Watcher {
    chunks: Mutex<Vec<String>>,
}

impl OutputSink for Watcher {
    fn chunk(&self, _pipe: Pipe, text: &str) {
        lock(&self.chunks).push(text.to_string());
    }
}

fn replay(case: &Case) -> Result<(), String> {
    let id = &case.id;
    let expected = fixtures().join("golden/spawn_async/expected").join(id);
    let rig = Rig::new();
    let class = class_of("runner.spawn_async");
    let runner = Arc::new(CaseRunner::new(case.script.clone()));
    let log = Arc::new(RecordingLogSink::default());
    let ctx = rig
        .launch_ctx(
            Platform::Linux,
            runner.clone(),
            Arc::new(RecordingLog::new()),
        )
        .with_log_sink(log.clone());

    let options = case.options.clone().unwrap_or(Options {
        cwd: None,
        env: None,
        timeout: None,
        windows_hide: None,
    });
    let args = SpawnAsyncArgs {
        stream_id: "stream-1".to_string(),
        command: case.command.clone(),
        args: case.args.clone(),
        cwd: options.cwd.clone(),
        env: options.env.clone(),
        timeout_ms: timeout_ms(&options),
        windows_hide: options.windows_hide.unwrap_or(false),
        observe: case.observe,
    };
    let watcher = Arc::new(Watcher::default());
    let sink: Arc<dyn OutputSink> = if case.observe {
        watcher.clone()
    } else {
        Arc::new(NullSink)
    };

    let holds = case.script.iter().any(|step| step.hold);
    let answer = runtime().block_on(async {
        if !holds {
            return spawn_async(&ctx, args, sink).await;
        }
        // A kill on the stream id, once the run has registered (the run is polled first).
        let kill = async {
            loop {
                if ctx
                    .registry
                    .kill_stream(&ctx.engine.shutdown, "stream-1")
                    .await
                    > 0
                {
                    break;
                }
                tokio::task::yield_now().await;
            }
        };
        let (answer, ()) = tokio::join!(spawn_async(&ctx, args, sink), kill);
        answer
    });
    if runner.unused() > 0 {
        return Err(format!("{id}: a scripted spawn never happened"));
    }

    // result.json
    let want = read_json(&expected.join("result.json"));
    match (&answer, want.get("rejected")) {
        // `spawn-error-text`: compared on being an error, not on the OS's words.
        (Err(message), Some(_)) if !message.is_empty() => {}
        (Ok(got), None) => {
            let got = serde_json::to_value(got).map_err(|e| format!("{id}: {e}"))?;
            if got != want {
                return Err(format!("{id}: answered {got}, want {want}"));
            }
        }
        _ => return Err(format!("{id}: answered {answer:?}, want {want}")),
    }

    // spawns.json: one spawn, as recorded.
    let want_spawns = read_json(&expected.join("spawns.json"));
    let want_spawns = want_spawns.as_array().cloned().unwrap_or_default();
    let specs = lock(&runner.specs).clone();
    if specs.len() != want_spawns.len() || specs.len() != 1 {
        return Err(format!(
            "{id}: {} spawns, want {}",
            specs.len(),
            want_spawns.len()
        ));
    }
    let (spec, want) = (&specs[0], &want_spawns[0]);
    let env = spec.replace_env.then(|| {
        spec.env
            .iter()
            .cloned()
            .collect::<std::collections::BTreeMap<String, String>>()
    });
    let got = rig.normalise(json!({
        "program": spec.program,
        "argv": spec.argv,
        "env": env,
        "cwd": spec.cwd.as_ref().map(|c| c.to_string_lossy().into_owned()),
        "replaceEnv": spec.replace_env,
        "windowsHide": spec.hide_window,
        "class": class,
    }));
    let wanted = json!({
        "program": want["program"],
        "argv": want["argv"],
        "env": want["env"],
        "cwd": want["cwd"],
        "replaceEnv": want["replaceEnv"],
        "windowsHide": want["windowsHide"],
        "class": want["class"],
    });
    if got != wanted {
        return Err(format!("{id}: spawn is {got}, want {wanted}"));
    }
    // The time limit: a golden with `timeoutMs` has that limit (a fraction kept), one with the opt-out has none.
    match (spec.timeout, want["timeoutMs"].as_f64()) {
        (None, None) => {}
        (Some(limit), Some(ms)) if (limit.as_secs_f64() * 1000.0 - ms).abs() < 1e-6 => {}
        (limit, ms) => return Err(format!("{id}: time limit {limit:?}, want {ms:?}")),
    }
    if want["timeoutMs"].is_null() && want["timeout"]["none"] != json!(true) {
        return Err(format!("{id}: a golden with no limit names no opt-out"));
    }
    if timeout_of(timeout_ms(&options)) != spec.timeout {
        return Err(format!("{id}: the limit is not the one the call asked for"));
    }
    if want["resolveOn"] != Value::Null || want["track"] != Value::Null {
        return Err(format!("{id}: the golden names a resolveOn or a track"));
    }

    // stream.json: what `onOutput` saw, in arrival order, only when the caller watches.
    let want_stream = read_json(&expected.join("stream.json"));
    let seen = lock(&watcher.chunks).clone();
    if case.observe {
        if want_stream != json!(seen) {
            return Err(format!("{id}: the stream is {seen:?}, want {want_stream}"));
        }
    } else if !want_stream.is_null() || !seen.is_empty() {
        return Err(format!("{id}: an unobserved run streamed"));
    }

    // A spawnAsync run writes no log line (it runs unbounded for hours and a command line may hold a secret).
    if !lock(&log.frames).is_empty() || !lock(&log.general).is_empty() {
        return Err(format!("{id}: the run wrote a log line"));
    }
    Ok(())
}

fn compared(cases: &[Case], floor: usize) -> Result<usize, String> {
    let mut count = 0;
    let mut failures = Vec::new();
    for case in cases.iter().filter(|c| !c.ts_only) {
        match replay(case) {
            Ok(()) => count += 1,
            Err(e) => failures.push(e),
        }
    }
    if !failures.is_empty() {
        return Err(failures.join("\n"));
    }
    if count < floor {
        return Err(format!(
            "golden_spawn_async: {count} compared, below the floor of {floor}"
        ));
    }
    Ok(count)
}

/// The tracer: the plain case through the op, spawn, chunks and answer.
#[test]
fn the_tracer_spawn_async_replays_with_its_spawn_its_chunks_and_its_answer() {
    let tracer: Vec<Case> = cases()
        .into_iter()
        .filter(|c| c.id == "spawn-async-plain")
        .collect();
    let n = compared(&tracer, TRACER_FLOOR).unwrap_or_else(|e| panic!("{e}"));
    println!("golden_spawn_async tracer compared {n} floor {TRACER_FLOOR}");
}

/// Every non-`tsOnly` recorded case: the options, the timeout vectors, the abort, the 50-chunk windows and the
/// spawn errors.
#[test]
fn every_spawn_async_golden_replays_through_the_op() {
    let all = cases();
    let manifest = read_json(&fixtures().join("golden/spawn_async/MANIFEST.json"));
    assert_eq!(manifest["count"], json!(all.len()));
    assert_eq!(all.len(), manifest["floor"].as_u64().unwrap() as usize);
    let replayable = all.iter().filter(|c| !c.ts_only).count();
    let n = compared(&all, SPAWN_ASYNC_FLOOR).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(n, replayable);
    assert_eq!(n, SPAWN_ASYNC_FLOOR, "raise the floor with the golden");
    println!("golden_spawn_async compared {n} floor {SPAWN_ASYNC_FLOOR}");
}

/// A changed option or a changed chunk fails the replay: the guard that the comparison compares.
#[test]
fn a_replay_with_a_changed_call_fails() {
    let mut case = cases()
        .into_iter()
        .find(|c| c.id == "spawn-async-plain")
        .expect("case");
    case.args.push("--extra".to_string());
    assert!(replay(&case).is_err(), "an extra argument");
    let mut case = cases()
        .into_iter()
        .find(|c| c.id == "spawn-async-plain")
        .expect("case");
    case.script[0].chunks.pop();
    assert!(replay(&case).is_err(), "a chunk fewer");
    let mut case = cases()
        .into_iter()
        .find(|c| c.id == "spawn-async-timeout-elapsed")
        .expect("case");
    case.script[0].timed_out = false;
    case.script[0].code = Some(Some(0));
    assert!(replay(&case).is_err(), "a run that did not time out");
}

/// `spawn-error-text` is named with a reason.
#[test]
fn the_deltas_file_names_the_spawn_error_text_delta() {
    let deltas = read_json(&fixtures().join("golden/spawn_async/deltas.json"));
    assert!(deltas["spawn-error-text"]
        .as_str()
        .is_some_and(|t| t.len() > 40));
}
