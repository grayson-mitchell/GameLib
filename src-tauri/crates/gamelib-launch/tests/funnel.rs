//! The Rust replay of `golden/funnel` (88.3-01 recorded it from the real TypeScript funnel): `run_launch` over
//! each case, with recording managers, shell and steps, a recording log sink and a recording frontend emitter,
//! every one writing to one shared tape, so the order across them is part of what is compared.
//!
//! **Every case replays** (88.3-04 replayed the tracer, 88.3-05 the other 58): a case's scenario is the INPUT of
//! the TS recorder (what each collaborator answered), and here it scripts the Rust doubles the same way; the
//! golden is whatever the TS did with it, and the Rust funnel has to do the same in the same order.
//!
//! **Documented differences** (`deltas.json`, each used by at least one case or the replay fails, and every
//! difference the replay applies is documented there):
//! - `events-bus-emit`: the TS emitted every `gameStatusUpdate` on the backend bus too, which nothing listens to;
//!   the Rust funnel emits the frontend message only, so the `bus` events are dropped from the golden.
//! - `reads-folded-into-launch-facts`: the TS recorder listed the play marker and each read of `getSettings`,
//!   `config.getSettings` and `gameConfigs.get(app).getSettings`; the Rust funnel makes one `launch_facts` call
//!   for all of them, which is not an event of the golden, so those kinds are dropped from it.
//! - `rejection-text-is-a-fixed-word`: a launch the TS rejected with the collaborator's message answers
//!   `launch:<what>:<word>` in Rust (T-88.2-14, T-88.3-09), so a rejected Play compares as "rejected".
//! - `recent-game-warning-text`: the TS warning printed its two arguments (`Recording recent game failed:`,
//!   `Error: <reason>`); the Rust line is one string with the fixed reason.
//! - `warning-prefix-is-an-options-object`: the TS passed the playtime-skip warning's prefix as an options
//!   object (`{ prefix: 'Backend' }`), which the logger reads as the prefix; the recorder kept the argument.
//! - `hook-error-lines-are-the-managers`: the TS funnel wrote the error lines around a rejected `syncSaves` and
//!   `game.launch` itself, with the error text; in Rust the TS handler behind the hook writes them (no error text
//!   crosses into Rust), so the replay's recording hooks write them to the tape.
//! - `release-warning-is-a-fixed-word`: the TS warning for an engine release that failed printed
//!   `String(error)`; the Rust line carries the fixed word of the step (`rejected`).
//!
//! The play-time writes (`tsStore`) and the runs-for-me write are compared in order with the rest: the store
//! host's change listener writes them to the tape, and every other recorder waits for the host's queue to drain
//! before it writes its own event.
//!
//! A count floor lives here next to the replay, so editing the JSON alone cannot lower the bar.

mod common;

use std::collections::BTreeSet;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use gamelib_engine::ctx::Platform;
use gamelib_launch::funnel::shell::testing::RecordingShell;
use gamelib_launch::funnel::steps::testing::RecordingSteps;
use gamelib_launch::funnel::{run::run_launch, FunnelHost, LaunchParams};
use gamelib_launch::hooks::testing::RecordingHooks;
use gamelib_launch::hooks::{LaunchFacts, LaunchHookReply};
use gamelib_launch::runner::RunnerName;
use serde_json::{json, Value};

use common::funnel_rig::{settle_store, FunnelRig};
use common::{fixtures, lock, read_json};

/// The cases this file replays: every case of `golden/funnel`. A later edit may raise this, never lower it.
const FUNNEL_FLOOR: usize = 59;

/// The tracer.
const TRACER: &str = "funnel--native-legendary-plain";

fn golden_dir() -> std::path::PathBuf {
    fixtures().join("golden/funnel")
}

fn cases() -> Vec<Value> {
    match read_json(&golden_dir().join("cases.json")) {
        Value::Array(cases) => cases,
        other => panic!("cases.json is not a list: {other}"),
    }
}

fn case_id(case: &Value) -> String {
    case["id"].as_str().expect("a case has an id").to_string()
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

/// The deltas a replay applied, by name: the test that every documented delta is used reads this.
type Used = Arc<Mutex<BTreeSet<&'static str>>>;

/// A scripted collaborator answer as the TS recorder read it: `{ resolves }` or `{ rejects }`.
fn answer_of(scripted: &Value) -> Result<Value, String> {
    match scripted.get("rejects").and_then(Value::as_str) {
        Some(message) => Err(message.to_string()),
        None => Ok(scripted["resolves"].clone()),
    }
}

/// A Rust channel's scripted answers: one for every call, or a sequence whose nth entry answers the nth call. A
/// channel the scenario does not list rejects by name, as the TS recorder's did.
fn answers_of(rust: &Value, channel: &str) -> Vec<Result<Value, String>> {
    match rust.get(channel) {
        None => vec![Err(format!(
            "funnel trace: unscripted rust channel \"{channel}\""
        ))],
        Some(scripted) => match scripted.get("sequence").and_then(Value::as_array) {
            Some(sequence) => sequence.iter().map(answer_of).collect(),
            None => vec![answer_of(scripted)],
        },
    }
}

/// The result of one replayed case: what the Plays answered and what the recorders saw, in order.
struct Replay {
    plays: Vec<Value>,
    events: Vec<Value>,
}

fn replay(case: &Value, used: &Used) -> Replay {
    let s = &case["scenario"];
    let runner = runner_of(s["runner"].as_str().unwrap());
    let app_name = s["appName"].as_str().unwrap().to_string();
    let title = s["title"].as_str().unwrap().to_string();
    let platform = match s["platform"].as_str().unwrap() {
        "mac" => Platform::Mac,
        "windows" => Platform::Windows,
        _ => Platform::Linux,
    };

    let rig = FunnelRig::new();
    if s["tsStore"]["hasApp"].as_bool().unwrap() {
        rig.seed_total_played(&app_name, &s["tsStore"]["totalPlayed"]);
    }
    rig.listen_to_play_time();

    // `game.getGameInfo()`: the install folder is named in the fake HOME, present or absent as the scenario says.
    let mut install = serde_json::Map::new();
    match s["installPath"].as_str().unwrap() {
        "none" => {}
        which => {
            let folder = rig.home.root().join("Games").join(&app_name);
            if which == "present" {
                std::fs::create_dir_all(&folder).unwrap();
            }
            install.insert("install_path".into(), json!(folder.to_string_lossy()));
        }
    }
    if let Some(platform) = s.get("installPlatform") {
        install.insert("platform".into(), platform.clone());
    }
    // What the managers answer: the TS `getGameInfo`, `getSettings`, `isNative`, the game config's
    // `verboseLogs`, the global settings.
    let facts: LaunchFacts = serde_json::from_value(json!({
        "gameInfo": {
            "app_name": app_name,
            "runner": runner.as_str(),
            "title": title,
            "install": install,
        },
        "settings": s["gameSettings"],
        "isNative": s["native"],
        "verboseLogs": s["gameConfigSettings"]["verboseLogs"],
        "global": s["globalSettings"],
        "cliNoGui": s["isCLINoGui"],
    }))
    .expect("the scenario reads as launch facts");

    // `game.launch` takes `sessionMs` of wall time, and answers `true`, `false` or rejects.
    let session_ms = s["sessionMs"].as_u64().unwrap();
    let mut hooks = RecordingHooks::new()
        .with_launch_facts(Ok(facts))
        .with_line_title(&title)
        .with_presence(s["hooks"]["presence"].as_bool().unwrap())
        .with_persist_bottle_wine_version(s["hooks"]["persistBottleWineVersion"].as_bool().unwrap())
        .with_on_launch({
            let clock = Arc::clone(&rig.clock);
            Arc::new(move || {
                clock.0.fetch_add(session_ms, Ordering::SeqCst);
            })
        })
        .with_tape(rig.tape.clone());
    match answer_of(&s["hooks"]["launch"]) {
        Ok(launched) => {
            hooks = hooks.with_launch(Ok(LaunchHookReply {
                launched: launched.as_bool().unwrap(),
                rotated: false,
            }));
        }
        Err(message) => {
            used.lock()
                .unwrap()
                .insert("hook-error-lines-are-the-managers");
            hooks = hooks.with_launch_rejection(&message);
        }
    }
    if let Err(message) = answer_of(&s["hooks"]["syncSaves"]) {
        used.lock()
            .unwrap()
            .insert("hook-error-lines-are-the-managers");
        hooks = hooks.with_sync_saves(Err(message));
    }
    if let Err(message) = answer_of(&s["hooks"]["updateGOGPlaytime"]) {
        hooks = hooks.with_update_gog_playtime(Err(message));
    }

    // What the Rust channels answer: an unlisted channel rejects by name in the TS, so it does here.
    let rust = &s["rust"];
    let unit = |channel: &str| {
        answers_of(rust, channel)
            .into_iter()
            .next()
            .expect("a channel has an answer")
            .map(|_| ())
    };
    let mut steps = RecordingSteps::new().with_tape(rig.tape.clone());
    steps = steps
        .with_select_script(answers_of(rust, "engine_launch_select"))
        .with_check_wine_script(answers_of(rust, "launch_check_wine_before_launch"))
        .with_recent_add(unit("info_recent_add"))
        .with_end_engine(unit("engine_launch_end"));
    if rust.get("launch_ask_force_uninstall").is_some() {
        let answer = answers_of(rust, "launch_ask_force_uninstall").remove(0);
        steps = steps.with_ask(answer.ok().and_then(|v| v.as_u64()).map(|v| v as usize));
    }
    steps = steps.with_scripts(
        answer_of(&s["scripts"]["before"]).map(|v| v.as_bool().unwrap()),
        answer_of(&s["scripts"]["after"]).map(|v| v.as_bool().unwrap()),
    );
    let shell = RecordingShell::new().with_tape(rig.tape.clone());

    let online_first = s["online"].as_bool().unwrap();
    let ctx = rig.ctx(
        platform,
        online_first,
        Arc::new(RecordingHooks::new()),
        Arc::new(steps),
        Arc::new(shell),
    );
    // The monitor goes offline while `game.getSettings()` is read: the facts read flips it.
    if s["goesOfflineDuringGetSettings"].as_bool() == Some(true) {
        let engine = Arc::clone(&ctx.engine);
        hooks = hooks.with_on_facts(Arc::new(move || {
            engine.online.store(false, Ordering::SeqCst);
        }));
    }
    let ctx = ctx.with_hooks(Arc::new(hooks));

    let params = LaunchParams {
        app_name: app_name.clone(),
        runner,
        launch_arguments: s["params"].get("launchArguments").cloned(),
        skip_version_check: s["params"]["skipVersionCheck"].as_bool(),
        args: s["params"].get("args").map(|args| {
            args.as_array()
                .unwrap()
                .iter()
                .map(|a| a.as_str().unwrap().to_string())
                .collect()
        }),
    };
    let rt = common::runtime();
    let mut plays = Vec::new();
    let play_count = if s.get("playAgain").is_some() { 2 } else { 1 };
    for n in 1..=play_count {
        if n == 2 {
            // A second Play on the same launcher, after the monitor is set: the flag is never latched. The TS
            // recorder's `tsStore.get` answered the scenario's total again.
            ctx.engine.online.store(
                s["playAgain"]["online"].as_bool().unwrap(),
                Ordering::SeqCst,
            );
            rig.forget_runs_for_me();
            if s["tsStore"]["hasApp"].as_bool().unwrap() {
                rig.reseed_total_played(&app_name, &s["tsStore"]["totalPlayed"]);
            }
        }
        let outcome = rt.block_on(run_launch(&ctx, params.clone(), &FunnelHost::default()));
        settle_store(&rig.host);
        plays.push(match outcome {
            Ok(status) => status.to_value(),
            Err(text) => {
                assert!(
                    text.starts_with("launch:"),
                    "{}: a rejected Play answers a fixed launch word, not {text}",
                    case_id(case)
                );
                json!({ "rejected": text })
            }
        });
    }
    Replay {
        plays,
        events: rig.events(),
    }
}

/// The golden's events with what the deltas drop or reshape taken out; each delta applied is noted in `used`.
fn expected_events(id: &str, used: &Used) -> Vec<Value> {
    let note = |delta: &'static str| {
        used.lock().unwrap().insert(delta);
    };
    let events = read_json(&golden_dir().join("expected").join(id).join("events.json"));
    events
        .as_array()
        .expect("events.json is a list")
        .iter()
        .filter_map(|event| {
            let kind = event["kind"].as_str().unwrap_or_default();
            let member = event["member"].as_str().unwrap_or_default();
            if kind == "bus" {
                note("events-bus-emit");
                return None;
            }
            if matches!(kind, "play" | "config" | "gameConfig") && member != "setSetting"
                || (kind == "hook" && event["hook"] == "getSettings")
            {
                note("reads-folded-into-launch-facts");
                return None;
            }
            let mut event = event.clone();
            if kind == "log" {
                if let Some(parts) = event["text"].as_array() {
                    note("recent-game-warning-text");
                    let joined: Vec<&str> = parts.iter().filter_map(Value::as_str).collect();
                    event["text"] = json!(joined.join(" ").replace("Error: ", ""));
                }
                if let Some(text) = event["text"].as_str() {
                    if let Some((head, _)) = text.split_once(" could not release its launch: ") {
                        note("release-warning-is-a-fixed-word");
                        event["text"] =
                            json!(format!("{head} could not release its launch: rejected"));
                    }
                }
                if let Some(prefix) = event["prefix"].get("prefix").cloned() {
                    note("warning-prefix-is-an-options-object");
                    event["prefix"] = prefix;
                }
            }
            Some(event)
        })
        .collect()
}

/// The golden's result with a rejected Play's message taken out (`rejection-text-is-a-fixed-word`).
fn expected_plays(id: &str, used: &Used) -> Vec<Value> {
    let result = read_json(&golden_dir().join("expected").join(id).join("result.json"));
    result["plays"]
        .as_array()
        .expect("result.json lists the plays")
        .iter()
        .map(|play| {
            if play.get("rejected").is_some() {
                used.lock()
                    .unwrap()
                    .insert("rejection-text-is-a-fixed-word");
                json!({ "rejected": "<a launch word>" })
            } else {
                play.clone()
            }
        })
        .collect()
}

/// What the Rust Plays answered, with a rejection's fixed word taken out the same way.
fn got_plays(plays: &[Value]) -> Vec<Value> {
    plays
        .iter()
        .map(|play| {
            if play.get("rejected").is_some() {
                json!({ "rejected": "<a launch word>" })
            } else {
                play.clone()
            }
        })
        .collect()
}

fn pretty(events: &[Value]) -> String {
    events
        .iter()
        .map(|e| serde_json::to_string(e).unwrap())
        .collect::<Vec<_>>()
        .join("\n")
}

/// The first place two event lists differ, with the events either side of it (a whole transcript is too long to
/// read in a failure).
fn first_difference(got: &[Value], want: &[Value]) -> Option<String> {
    let at = (0..got.len().max(want.len())).find(|&i| got.get(i) != want.get(i))?;
    let line = |events: &[Value], i: usize| {
        events.get(i).map_or_else(
            || "<none>".to_string(),
            |e| serde_json::to_string(e).unwrap(),
        )
    };
    let before = at.saturating_sub(2);
    Some(format!(
        "event {at} differs\n  after: {}\n  got:  {}\n  want: {}",
        (before..at)
            .map(|i| line(want, i))
            .collect::<Vec<_>>()
            .join("\n         "),
        line(got, at),
        line(want, at)
    ))
}

/// Replays one case and compares it, events and results.
fn compare(case: &Value, used: &Used) {
    let id = case_id(case);
    let got = replay(case, used);
    let want = expected_events(&id, used);
    if let Some(difference) = first_difference(&got.events, &want) {
        panic!("{id}: {difference}");
    }
    assert_eq!(
        got_plays(&got.plays),
        expected_plays(&id, used),
        "{id}: plays"
    );
}

fn deltas() -> serde_json::Map<String, Value> {
    read_json(&golden_dir().join("deltas.json"))
        .as_object()
        .cloned()
        .expect("deltas.json is an object")
}

#[test]
fn the_tracer_replays_in_the_ts_order() {
    let all = cases();
    let tracer = all
        .iter()
        .find(|c| case_id(c) == TRACER)
        .expect("the tracer is a case of cases.json");
    let used: Used = Arc::default();
    let got = replay(tracer, &used);
    let want = expected_events(TRACER, &used);
    assert_eq!(
        got.events,
        want,
        "{TRACER}\n--- got\n{}\n--- want\n{}",
        pretty(&got.events),
        pretty(&want)
    );
    let result = read_json(
        &golden_dir()
            .join("expected")
            .join(TRACER)
            .join("result.json"),
    );
    assert_eq!(json!({ "plays": got.plays }), result);

    // The one per-game log entry of the tracer claims the rotation, as the golden's does.
    let game_logs: Vec<&Value> = got
        .events
        .iter()
        .filter(|e| e["kind"] == "gameLog")
        .collect();
    assert_eq!(game_logs.len(), 1);
    assert_eq!(game_logs[0]["rotate"], json!(true));
}

#[test]
fn the_cross_branch_case_runs_the_after_script_before_the_engine_release() {
    // A Windows game under an engine overlay with both scripts and saves on: the scripts, the overlay, the
    // release and the saves sync all in the TS order.
    let all = cases();
    let case = all
        .iter()
        .find(|c| case_id(c) == "funnel--pairwise-17")
        .expect("pairwise-17 is a case of cases.json");
    let used: Used = Arc::default();
    let got = replay(case, &used).events;
    let at = |kind: &str, key: &str, value: &str| {
        got.iter()
            .position(|e| e["kind"] == kind && e[key] == value)
            .unwrap_or_else(|| panic!("no {kind} event with {key} = {value}"))
    };
    let after_script = at("script", "when", "after");
    let engine_release = at("rust", "channel", "engine_launch_end");
    assert!(
        after_script < engine_release,
        "the after script comes before the engine release"
    );
    assert!(at("script", "when", "before") < at("hook", "hook", "launch"));
}

#[test]
fn golden_funnel_compared_at_its_floor() {
    let all = cases();
    let used: Used = Arc::default();
    let mut compared = 0;
    for case in &all {
        compare(case, &used);
        compared += 1;
    }
    println!("golden funnel: compared {compared} floor {FUNNEL_FLOOR}");
    assert_eq!(
        compared, FUNNEL_FLOOR,
        "golden funnel: the replay compared {compared} cases, the floor is {FUNNEL_FLOOR}"
    );
    assert_eq!(
        compared,
        read_json(&golden_dir().join("MANIFEST.json"))["count"]
            .as_u64()
            .unwrap() as usize,
        "every case of the manifest is replayed"
    );

    // Every delta the replay applied is documented, and every documented delta was used by a case.
    let documented: BTreeSet<String> = deltas().keys().cloned().collect();
    let applied: BTreeSet<String> = lock(&used).iter().map(|d| d.to_string()).collect();
    assert_eq!(applied, documented, "applied deltas against deltas.json");
}

#[test]
fn the_cases_are_exactly_the_manifest() {
    let ids: BTreeSet<String> = cases().iter().map(case_id).collect();
    assert_eq!(ids.len(), cases().len(), "a case id is listed twice");
    assert_eq!(ids.len(), FUNNEL_FLOOR);
    assert!(ids.contains(TRACER));
    for id in &ids {
        assert!(
            golden_dir().join("expected").join(id).is_dir(),
            "{id} has no expected folder"
        );
    }
}

#[test]
fn every_delta_has_a_reason_of_its_own() {
    for (name, reason) in deltas() {
        assert!(
            reason.as_str().is_some_and(|reason| reason.len() > 20),
            "deltas.json documents {name}"
        );
    }
}
