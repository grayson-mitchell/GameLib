//! The Rust replay of the Wine window raiser (88.3-13, D-11/D-25): `raise_wine_window` against `golden/window_raise`,
//! the cases 88.3-02 recorded from the TypeScript `createWineWindowRaiser`. Per case it compares the spawn list
//! (the argv, element by element, and the delay since the raise began), the log lines (level, prefix, text) and
//! when each raise settled. The spawn seam is scripted (`CaseRunner` plays the recorded `osascript` answers) and
//! the clock is tokio's paused one, advanced a millisecond at a time, so the recorded 1500 ms and 2500 ms waits are
//! exact and nothing sleeps. The script text is not repeated in a case: an argv whose element 1 is the recorded
//! `<script>` marker is compared against [`RAISE_SCRIPT`], and any other element 1 is compared as it is.
//!
//! Not compared: the TS timer events (`timer`, `clear`, `construct`), which are the TS clock's own bookkeeping; a
//! Rust raise waits on `tokio::time`. The documented differences (`golden/window_raise/deltas.json`):
//!
//! - `stop-is-the-shutdown-token`: the TS `stop()` cleared the pending timer and the raise never settled. Rust has
//!   no stop: the app's shutdown token ends the wait and the raise returns. A replayed `stop` cancels the context's
//!   shutdown token, so the expected events gain a `settled` for each raise still pending at the stop, and a raise
//!   started after it runs on a fresh context (a new app run), which is the TS "a new raise runs its own schedule".
//! - `spawn-failure-text`: the TS logged the rejection's text beside the fixed line; Rust logs the fixed line only
//!   (an OS error can carry a path), so a recorded two-part warning is compared on its first part.
//! - `construct-has-no-rust-object`: there is no raiser object to construct, so the `construct` case replays as
//!   "a stop with nothing in flight spawns nothing".
//!
//! The count floor lives here, next to the replay, so editing the JSON alone cannot lower the bar.

mod common;

use std::io::Write;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use common::*;
use gamelib_core::process::{BoxFuture, ChunkSink, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_engine::ctx::Platform;
use gamelib_engine::testing::RecordingLog;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::raise::{
    raise_wine_window, windows_exe_name_from_command, RaiseArgs, RAISE_SCRIPT,
};
use gamelib_launch::runner::stream::LaunchLogSink;
use gamelib_log::{Level, Prefix, TargetBatch};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::time::Instant;

/// The cases of `golden/window_raise` this file compares. A later edit may raise this, never lower it.
const WINDOW_RAISE_FLOOR: usize = 25;
/// The tracer replays the one case it names.
const TRACER_FLOOR: usize = 1;
/// The tracer's case: eleven misses 1500 ms apart, a hit on the twelfth attempt, then the settle re-raise.
const TRACER_CASE: &str = "window_raise--a-hit-on-attempt-12-then-the-settle-re-raise";

fn golden_dir() -> std::path::PathBuf {
    fixtures().join("golden/window_raise")
}

#[derive(Debug, Clone, Deserialize)]
struct Answer {
    stdout: Option<String>,
    rejects: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Action {
    op: String,
    #[serde(rename = "as")]
    name: Option<String>,
    input: Option<Value>,
    ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
struct Case {
    id: String,
    kind: String,
    #[serde(default)]
    mac: Option<bool>,
    #[serde(default)]
    answers: Vec<Answer>,
    #[serde(default)]
    actions: Vec<Action>,
    #[serde(default)]
    inputs: Vec<String>,
}

fn cases() -> Vec<Case> {
    serde_json::from_value(read_json(&golden_dir().join("cases.json"))).expect("cases.json")
}

fn expected(id: &str, file: &str) -> Value {
    read_json(&golden_dir().join("expected").join(id).join(file))
}

/// The event list a replay produces, shared by the scripted runner, the log sink and the driver.
type Events = Arc<Mutex<Vec<Value>>>;

fn push(events: &Events, event: Value) {
    lock(events).push(event);
}

fn elapsed_ms(since: Instant) -> u64 {
    Instant::now().duration_since(since).as_millis() as u64
}

/// The scripted spawn seam plus the delay of each spawn since the replay began.
struct TimedRunner {
    inner: CaseRunner,
    events: Events,
    started: Instant,
}

impl SpecRunner for TimedRunner {
    fn run(&self, spec: ProcSpec, on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        let mut argv = spec.argv.clone();
        if argv.get(1).map(String::as_str) == Some(RAISE_SCRIPT) {
            argv[1] = "<script>".to_string();
        }
        push(
            &self.events,
            json!({
                "event": "spawn",
                "at": elapsed_ms(self.started),
                "program": spec.program,
                "argv": argv,
            }),
        );
        self.inner.run(spec, on_line)
    }

    fn run_streamed(&self, spec: ProcSpec, on_chunk: ChunkSink) -> BoxFuture<SpecOutput> {
        self.inner.run_streamed(spec, on_chunk)
    }
}

struct EventLogSink {
    events: Events,
}

impl LaunchLogSink for EventLogSink {
    fn stamp(&self) -> (u64, i32) {
        (0, 0)
    }

    fn submit(&self, _batches: Vec<TargetBatch>) {}

    fn general(&self, prefix: Prefix, level: Level, msg: &str) {
        push(
            &self.events,
            json!({
                "event": "log",
                "level": level.as_str().to_lowercase(),
                "prefix": prefix.as_str(),
                "text": msg,
            }),
        );
    }
}

fn step_of(answer: &Answer) -> Step {
    match (&answer.stdout, &answer.rejects) {
        (Some(text), _) => Step {
            chunks: vec![ScriptChunk {
                stream: "stdout".to_string(),
                text: text.clone(),
            }],
            ..Step::default()
        },
        (None, Some(reason)) => Step {
            throws: Some(reason.clone()),
            ..Step::default()
        },
        (None, None) => panic!("an answer with neither stdout nor rejects"),
    }
}

struct Replayed {
    events: Vec<Value>,
    spawns: usize,
}

/// Runs one `raise` case on a paused clock and answers what happened, in the order it happened.
fn replay(case: &Case) -> Replayed {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .start_paused(true)
        .build()
        .expect("runtime");
    rt.block_on(async {
        let rig = Rig::new();
        let events: Events = Arc::new(Mutex::new(Vec::new()));
        let started = Instant::now();
        let runner = Arc::new(TimedRunner {
            inner: CaseRunner::new(case.answers.iter().map(step_of).collect()),
            events: Arc::clone(&events),
            started,
        });
        let platform = if case.mac == Some(false) {
            Platform::Linux
        } else {
            Platform::Mac
        };
        let make_ctx = || -> LaunchCtx {
            rig.launch_ctx(platform, runner.clone(), Arc::new(RecordingLog::new()))
                .with_log_sink(Arc::new(EventLogSink {
                    events: Arc::clone(&events),
                }))
        };
        let mut ctx = make_ctx();
        // `stop-is-the-shutdown-token`: a stop is final for its context, a raise after it gets a new one.
        let mut stopped = false;
        let mut raises: Vec<(String, tokio::task::JoinHandle<()>, bool)> = Vec::new();

        // Lets every task that can run at this instant run to its next wait, then records the raises that ended.
        async fn quiesce(
            raises: &mut [(String, tokio::task::JoinHandle<()>, bool)],
            events: &Events,
            started: Instant,
        ) {
            for _ in 0..6 {
                tokio::task::yield_now().await;
            }
            for (name, handle, noted) in raises.iter_mut() {
                if !*noted && handle.is_finished() {
                    *noted = true;
                    push(
                        events,
                        json!({ "event": "settled", "raise": name, "at": elapsed_ms(started) }),
                    );
                }
            }
        }

        for action in &case.actions {
            match action.op.as_str() {
                "raise" => {
                    if stopped {
                        ctx = make_ctx();
                        stopped = false;
                    }
                    let args: RaiseArgs = serde_json::from_value(action.input.clone().unwrap())
                        .expect("the recorded input is a RaiseArgs");
                    let run_ctx = ctx.clone();
                    let handle =
                        tokio::spawn(async move { raise_wine_window(&run_ctx, args).await });
                    raises.push((action.name.clone().unwrap(), handle, false));
                    quiesce(&mut raises, &events, started).await;
                }
                "advance" => {
                    for _ in 0..action.ms.unwrap() {
                        tokio::time::advance(Duration::from_millis(1)).await;
                        quiesce(&mut raises, &events, started).await;
                    }
                }
                "stop" => {
                    ctx.engine.shutdown.token().cancel();
                    stopped = true;
                    quiesce(&mut raises, &events, started).await;
                }
                other => panic!("unknown action {other}"),
            }
        }
        let events = lock(&events).clone();
        let spawns = events.iter().filter(|e| e["event"] == "spawn").count();
        Replayed { events, spawns }
    })
}

/// The recorded events a Rust replay can be compared with: the spawns, the logs and the settles, with the
/// `stop-is-the-shutdown-token` and `spawn-failure-text` deltas applied. The recorded `at` of a settle is
/// the virtual time of the last advance, which is what the replay reads.
fn expected_events(case: &Case) -> Vec<Value> {
    let recorded: Vec<Value> =
        serde_json::from_value(expected(&case.id, "events.json")).expect("events");
    let mut out = Vec::new();
    let mut pending: Vec<String> = Vec::new();
    let mut now = 0u64;
    for event in recorded {
        match event["event"].as_str().unwrap() {
            "spawn" | "log" | "settled" => {
                let mut event = event;
                match event["event"].as_str().unwrap() {
                    "settled" => {
                        let name = event["raise"].as_str().unwrap().to_string();
                        pending.retain(|p| *p != name);
                    }
                    "log" => {
                        // `spawn-failure-text`: the first part of a recorded two-part warning.
                        if let Some(parts) = event["text"].as_array().cloned() {
                            event["text"] = parts[0].clone();
                        }
                    }
                    _ => {}
                }
                if let Some(at) = event.get("at").and_then(Value::as_u64) {
                    now = now.max(at);
                }
                out.push(event);
            }
            "action" => match event["op"].as_str().unwrap() {
                "raise" => {
                    // A raise that settled at once is settled before the next action; it stays pending until
                    // its `settled` event is read.
                    pending.push(event["as"].as_str().unwrap().to_string());
                }
                "advance" => {
                    now += event["ms"].as_u64().unwrap();
                }
                "stop" => {
                    for name in pending.drain(..) {
                        out.push(json!({ "event": "settled", "raise": name, "at": now }));
                    }
                }
                _ => {}
            },
            _ => {}
        }
    }
    out
}

fn pretty(events: &[Value]) -> String {
    events
        .iter()
        .map(|e| e.to_string())
        .collect::<Vec<_>>()
        .join("\n")
}

/// Compares one `raise` case: the events, then the spawn count the TS result recorded (a stopped TS raise spawns
/// fewer attempts than its recording had answers, which `spawns` already accounts for).
fn compare_raise(case: &Case) {
    let got = replay(case);
    let want = expected_events(case);
    assert_eq!(
        got.events,
        want,
        "{}\n--- got\n{}\n--- want\n{}",
        case.id,
        pretty(&got.events),
        pretty(&want)
    );
    assert_eq!(
        got.spawns as u64,
        expected(&case.id, "result.json")["spawns"]
            .as_u64()
            .unwrap(),
        "{}: spawn count",
        case.id
    );
}

fn compare_exe_names(case: &Case) {
    let rows = expected(&case.id, "result.json")["rows"].clone();
    let rows = rows.as_array().expect("rows");
    assert_eq!(
        rows.len(),
        case.inputs.len(),
        "{}: one row per input",
        case.id
    );
    for (input, row) in case.inputs.iter().zip(rows) {
        assert_eq!(row["input"].as_str(), Some(input.as_str()));
        let want = row["output"].as_str().map(str::to_string);
        assert_eq!(
            windows_exe_name_from_command(input),
            want,
            "{}: {input:?}",
            case.id
        );
    }
}

/// `construct-has-no-rust-object`: a stop with nothing in flight arms nothing and a second context starts clean.
fn compare_construct(case: &Case) {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .start_paused(true)
        .build()
        .expect("runtime");
    rt.block_on(async {
        let rig = Rig::new();
        let runner = Arc::new(CaseRunner::new(Vec::new()));
        let ctx = rig.launch_ctx(Platform::Mac, runner.clone(), Arc::new(RecordingLog::new()));
        ctx.engine.shutdown.token().cancel();
        tokio::time::advance(Duration::from_secs(60)).await;
        assert!(
            lock(&runner.specs).is_empty(),
            "{}: nothing spawned",
            case.id
        );
        assert_eq!(
            ctx.engine.shutdown.drain(Duration::from_millis(10)),
            Vec::<&str>::new()
        );
    });
}

fn compare(case: &Case) {
    match case.kind.as_str() {
        "raise" => compare_raise(case),
        "exe-names" => compare_exe_names(case),
        "construct" => compare_construct(case),
        other => panic!("{}: unknown case kind {other}", case.id),
    }
}

/// Prints straight to the process's stdout, so the line shows without `--nocapture`.
fn report(line: &str) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{line}");
}

fn full_id(case: &Case) -> String {
    // The census names a case by its folder; both stems (`wineWindowRaise--`, `window_raise--`) are in `id`.
    case.id.clone()
}

/// The tracer: one recorded case, the hit on the twelfth attempt, through the real `raise_wine_window`.
#[test]
fn tracer_one_case_replays() {
    let all = cases();
    let picked: Vec<&Case> = all.iter().filter(|c| full_id(c) == TRACER_CASE).collect();
    assert_eq!(
        picked.len(),
        TRACER_FLOOR,
        "the tracer's case is in cases.json"
    );
    for case in &picked {
        compare(case);
    }
    report(&format!(
        "golden window_raise tracer: compared {} floor {TRACER_FLOOR}",
        picked.len()
    ));
}

/// Every recorded case replays.
#[test]
fn every_case_replays() {
    let all = cases();
    check_floor("golden window_raise", all.len(), WINDOW_RAISE_FLOOR).unwrap();
    let mut compared = 0usize;
    for case in &all {
        compare(case);
        compared += 1;
    }
    report(&format!(
        "golden window_raise: compared {compared} floor {WINDOW_RAISE_FLOOR}"
    ));
    assert!(
        compared >= WINDOW_RAISE_FLOOR,
        "golden window_raise: compared {compared}, below the floor of {WINDOW_RAISE_FLOOR}"
    );
    assert_eq!(
        compared as u64,
        read_json(&golden_dir().join("MANIFEST.json"))["count"]
            .as_u64()
            .unwrap(),
        "every recorded case is compared"
    );
}

/// An empty case list is a failure, not a pass (the floor guards the loop above).
#[test]
fn an_empty_case_list_fails_the_floor() {
    assert!(check_floor("golden window_raise", 0, WINDOW_RAISE_FLOOR).is_err());
}

/// The script the TS recorded is the script the Rust raise runs: every spawn of the tracer carries it whole.
#[test]
fn the_recorded_script_is_the_rust_script() {
    let recorded = expected(TRACER_CASE, "result.json")["script"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(recorded, RAISE_SCRIPT);
}

/// A replay that differs is a failure: one pid more, and the spawn differs.
#[test]
fn a_replay_that_differs_is_a_failure() {
    let mut case = cases()
        .into_iter()
        .find(|c| full_id(c) == TRACER_CASE)
        .expect("case");
    let input = case.actions[0].input.as_mut().unwrap();
    input["pids"] = json!(["9", "10"]);
    let got = replay(&case);
    assert_ne!(got.events, expected_events(&case));
}

/// Each delta is named with a reason.
#[test]
fn the_deltas_file_names_the_documented_differences() {
    let deltas = read_json(&golden_dir().join("deltas.json"));
    for key in [
        "stop-is-the-shutdown-token",
        "spawn-failure-text",
        "construct-has-no-rust-object",
    ] {
        assert!(
            deltas[key].as_str().is_some_and(|t| t.len() > 40),
            "delta {key}"
        );
    }
}
