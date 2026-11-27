//! The Rust replay of `golden/runs_for_me` (88.3-02 recorded it from the real TypeScript): every vector of the
//! runs-for-me state machine (`nextRunsForMeAfterSession`, `nextRunsForMeAfterUserToggle`, `isRunsForMeOn`,
//! `runsForMeKey`), of `getRunsForMeMap` and of `recordPlaySession`, over `funnel::playtime`.
//!
//! The TS module stays (the Steam bottle monitor and the renderer use it), so `runsForMe.vectors.test.ts` stays
//! live and this file is the other half of the pin: both answer the same 58 vectors.
//!
//! A `record-session` vector scripts a recording store (`RunsForMeIo`) and a recording log, and compares what the
//! record read, wrote, pushed and logged, in the TS vector's own vocabulary.
//!
//! **Documented difference** `runs-for-me-warning-is-a-fixed-word`: the TS warning printed `String(error)` of
//! the store failure (`Error: store unreadable`); Rust never carries a store's error text into `gamelib.log`
//! (a path, an OS message: T-88.3-09), so the warning ends with the fixed word of the failed step (`store-read`,
//! `store-write`, `push`). The replay reads the golden's text up to the colon and compares the rest as that word,
//! and a test below proves the difference was applied by at least one vector.
//!
//! A count floor lives here next to the replay, so editing the JSON alone cannot lower the bar.

mod common;

use std::sync::{Arc, Mutex};

use gamelib_launch::funnel::playtime::{
    is_runs_for_me_on, next_runs_for_me_after_session, next_runs_for_me_after_user_toggle,
    record_play_session_with, runs_for_me_key, runs_for_me_map, RunsForMeIo, RunsForMeState,
};
use gamelib_launch::runner::stream::LaunchLogSink;
use gamelib_launch::runner::RunnerName;
use gamelib_log::{Level, Prefix, TargetBatch};
use serde_json::{json, Map, Value};

use common::{fixtures, lock, read_json};

/// The vectors this file replays: every vector of `golden/runs_for_me`. A later edit may raise this, never lower it.
const RUNS_FOR_ME_FLOOR: usize = 58;

fn vectors() -> Vec<Value> {
    match read_json(&fixtures().join("golden/runs_for_me/vectors.json")) {
        Value::Array(vectors) => vectors,
        other => panic!("vectors.json is not a list: {other}"),
    }
}

fn state_of(value: &Value) -> Option<RunsForMeState> {
    value.as_str().map(|word| {
        RunsForMeState::parse(word).unwrap_or_else(|| panic!("{word} is not a runs-for-me state"))
    })
}

fn state_value(state: Option<RunsForMeState>) -> Value {
    state.map_or(Value::Null, |state| json!(state.as_str()))
}

fn runner_of(name: &str) -> RunnerName {
    match name {
        "legendary" => RunnerName::Legendary,
        "gog" => RunnerName::Gog,
        "nile" => RunnerName::Nile,
        "sideload" => RunnerName::Sideload,
        "steam" => RunnerName::Steam,
        other => panic!("unknown runner {other}"),
    }
}

/// What a recorded `record-session` vector saw, in the vector's own words.
#[derive(Default)]
struct Seen {
    reads: Vec<Value>,
    writes: Vec<Value>,
    frontend: Vec<Value>,
    logs: Vec<Value>,
}

/// The vector's store: it holds `games`, and fails a read, a write or a push when the vector says so.
struct VectorIo {
    games: Value,
    get_throws: bool,
    set_throws: bool,
    push_throws: bool,
    seen: Arc<Mutex<Seen>>,
}

impl RunsForMeIo for VectorIo {
    fn read_games(&self) -> Result<Value, &'static str> {
        lock(&self.seen)
            .reads
            .push(json!({ "key": "games", "fallback": {} }));
        if self.get_throws {
            return Err("store-read");
        }
        Ok(self.games.clone())
    }

    fn write_games(&self, games: &Value) -> Result<(), &'static str> {
        if self.set_throws {
            return Err("store-write");
        }
        lock(&self.seen)
            .writes
            .push(json!({ "key": "games", "value": games }));
        Ok(())
    }

    fn push(&self, games: &Value) -> Result<(), &'static str> {
        lock(&self.seen).frontend.push(json!({
            "channel": "runsForMeChanged",
            "args": [games],
        }));
        if self.push_throws {
            return Err("push");
        }
        Ok(())
    }
}

/// The log of a vector: each general line as the vector's `{ level, prefix, text }`.
struct VectorLog {
    seen: Arc<Mutex<Seen>>,
}

impl LaunchLogSink for VectorLog {
    fn stamp(&self) -> (u64, i32) {
        (0, 0)
    }

    fn submit(&self, _batches: Vec<TargetBatch>) {}

    fn general(&self, prefix: Prefix, level: Level, msg: &str) {
        lock(&self.seen).logs.push(json!({
            "level": level.as_str().to_lowercase(),
            "prefix": prefix.as_str(),
            "text": msg,
        }));
    }
}

/// The golden's output with the documented difference applied; `true` when it was.
fn expected_record(vector: &Value) -> (Value, bool) {
    let input = &vector["input"];
    let mut output = vector["output"].clone();
    let word = if input.get("getThrows").is_some() {
        "store-read"
    } else if input.get("setThrows").is_some() {
        "store-write"
    } else if input.get("pushThrows").is_some() {
        "push"
    } else {
        return (output, false);
    };
    let app = input["appName"].as_str().unwrap();
    let head = format!("Runs for me: could not record play session for {app}: ");
    let mut applied = false;
    for line in output["logs"].as_array_mut().unwrap() {
        let text = line["text"].as_str().unwrap();
        assert!(text.starts_with(&head), "{text}");
        line["text"] = json!(format!("{head}{word}"));
        applied = true;
    }
    (output, applied)
}

/// Replays one vector; `true` when the documented difference was applied to its expected output.
fn replay(vector: &Value) -> bool {
    let name = vector["name"].as_str().unwrap();
    let input = &vector["input"];
    match vector["kind"].as_str().unwrap() {
        "after-session" => {
            let got = next_runs_for_me_after_session(
                state_of(&input["current"]),
                input["elapsedMs"].as_i64().unwrap(),
            );
            assert_eq!(
                json!({ "state": state_value(got) }),
                vector["output"],
                "{name}"
            );
            false
        }
        "after-toggle" => {
            let got = next_runs_for_me_after_user_toggle(input["on"].as_bool().unwrap());
            assert_eq!(json!({ "state": got.as_str() }), vector["output"], "{name}");
            false
        }
        "is-on" => {
            let got = is_runs_for_me_on(state_of(&input["state"]));
            assert_eq!(json!({ "on": got }), vector["output"], "{name}");
            false
        }
        "key" => {
            let got = runs_for_me_key(
                input["appName"].as_str().unwrap(),
                runner_of(input["runner"].as_str().unwrap()),
            );
            assert_eq!(json!({ "key": got }), vector["output"], "{name}");
            false
        }
        "map" => {
            let mut map = Map::new();
            for (key, state) in runs_for_me_map(&input["games"]) {
                map.insert(key, json!(state.as_str()));
            }
            assert_eq!(json!({ "map": map }), vector["output"], "{name}");
            false
        }
        "record-session" => {
            let seen = Arc::new(Mutex::new(Seen::default()));
            let io = VectorIo {
                games: input["games"].clone(),
                get_throws: input.get("getThrows").is_some(),
                set_throws: input.get("setThrows").is_some(),
                push_throws: input.get("pushThrows").is_some(),
                seen: Arc::clone(&seen),
            };
            let log = VectorLog {
                seen: Arc::clone(&seen),
            };
            record_play_session_with(
                &io,
                &log,
                input["appName"].as_str().unwrap(),
                runner_of(input["runner"].as_str().unwrap()),
                input["elapsedMs"].as_i64().unwrap(),
                input["platform"].as_str().unwrap(),
            );
            let seen = lock(&seen);
            let got = json!({
                "threw": null,
                "reads": seen.reads,
                "writes": seen.writes,
                "frontend": seen.frontend,
                "logs": seen.logs,
            });
            let (want, applied) = expected_record(vector);
            assert_eq!(got, want, "{name}");
            applied
        }
        other => panic!("{name}: unknown vector kind {other}"),
    }
}

#[test]
fn golden_runs_for_me_compared_at_its_floor() {
    let all = vectors();
    let mut compared = 0;
    let mut applied = 0;
    for vector in &all {
        if replay(vector) {
            applied += 1;
        }
        compared += 1;
    }
    println!("golden runs_for_me: compared {compared} floor {RUNS_FOR_ME_FLOOR}");
    assert!(
        compared >= RUNS_FOR_ME_FLOOR,
        "golden runs_for_me: compared {compared}, below the floor of {RUNS_FOR_ME_FLOOR}"
    );
    assert_eq!(
        compared,
        read_json(&fixtures().join("golden/runs_for_me/MANIFEST.json"))["count"]
            .as_u64()
            .unwrap() as usize,
        "every vector of the manifest is replayed"
    );
    assert!(
        applied >= 1,
        "runs-for-me-warning-is-a-fixed-word was applied by no vector"
    );
}

#[test]
fn every_kind_of_vector_is_replayed_and_names_are_unique() {
    let all = vectors();
    let kinds: std::collections::BTreeSet<&str> =
        all.iter().filter_map(|v| v["kind"].as_str()).collect();
    assert_eq!(
        kinds.into_iter().collect::<Vec<_>>(),
        [
            "after-session",
            "after-toggle",
            "is-on",
            "key",
            "map",
            "record-session"
        ]
    );
    let names: std::collections::BTreeSet<&str> =
        all.iter().filter_map(|v| v["name"].as_str()).collect();
    assert_eq!(names.len(), all.len(), "a vector name is listed twice");
}
