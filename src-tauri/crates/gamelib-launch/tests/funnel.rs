//! The Rust replay of `golden/funnel` (88.3-01 recorded it from the real TypeScript funnel): `run_launch` over
//! each case, with recording managers, shell and steps, a recording log sink and a recording frontend emitter,
//! every one writing to one shared tape, so the order across them is part of what is compared.
//!
//! **What 88.3-04 replays:** the tracer, `funnel--native-legendary-plain`. Every other case is in [`NOT_YET`],
//! which 88.3-05 empties as it ports the branches; the list must name only cases that exist, must not name the
//! tracer, and together with the replayed cases must cover `cases.json` exactly, so a case cannot be forgotten.
//!
//! **Documented differences** (`deltas.json`, each used by the tracer or the replay fails):
//! - `events-bus-emit`: the TS emitted every `gameStatusUpdate` on the backend bus too, which nothing listens to;
//!   the Rust funnel emits the frontend message only, so the `bus` events are dropped from the golden.
//! - `reads-folded-into-launch-facts`: the TS recorder listed the play marker and each read of `getSettings`,
//!   `config.getSettings` and `gameConfigs.get(app).getSettings`; the Rust funnel makes one `launch_facts` call
//!   for all of them, which is not an event of the golden, so those kinds are dropped from it.
//!
//! The play-time writes (`tsStore`) are compared in order with the rest: the store host's change listener writes
//! them to the tape, and every other recorder waits for the host's queue to drain before it writes its own event.
//!
//! A count floor lives here next to the replay, so editing the JSON alone cannot lower the bar.

mod common;

use std::collections::BTreeSet;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use gamelib_engine::ctx::Platform;
use gamelib_engine::launch::step::{SelectKind, SelectReply};
use gamelib_launch::funnel::shell::testing::RecordingShell;
use gamelib_launch::funnel::steps::testing::RecordingSteps;
use gamelib_launch::funnel::{run::run_launch, FunnelHost, LaunchParams};
use gamelib_launch::hooks::testing::RecordingHooks;
use gamelib_launch::hooks::{LaunchFacts, LaunchHookReply};
use gamelib_launch::runner::RunnerName;
use serde_json::{json, Value};

use common::funnel_rig::{settle_store, FunnelRig};
use common::{fixtures, read_json};

/// The cases this file replays. A later edit may raise this, never lower it.
const FUNNEL_FLOOR: usize = 1;

/// The tracer.
const TRACER: &str = "funnel--native-legendary-plain";

/// The cases `golden/funnel` holds that the funnel does not replay yet. 88.3-05 empties this list as it ports
/// each branch; every name must be a case of `cases.json`.
const NOT_YET: &[&str] = &[
    "funnel--pairwise-01",
    "funnel--pairwise-02",
    "funnel--pairwise-03",
    "funnel--pairwise-04",
    "funnel--pairwise-05",
    "funnel--pairwise-06",
    "funnel--pairwise-07",
    "funnel--pairwise-08",
    "funnel--pairwise-09",
    "funnel--pairwise-10",
    "funnel--pairwise-11",
    "funnel--pairwise-12",
    "funnel--pairwise-13",
    "funnel--pairwise-14",
    "funnel--pairwise-15",
    "funnel--pairwise-16",
    "funnel--pairwise-17",
    "funnel--pairwise-18",
    "funnel--pairwise-19",
    "funnel--pairwise-20",
    "funnel--pairwise-21",
    "funnel--pairwise-22",
    "funnel--pairwise-23",
    "funnel--pairwise-24",
    "launcher.engineStep--launcher-engine-step-61-14-87-52-runs-the-step-once-after-the-log-writer-and-before-the-wine-check-sending-the-launch-facts",
    "launcher.engineStep--launcher-engine-step-61-14-87-52-use-skips-the-wine-check-runs-on-the-reply-s-settings-writes-its-log-lines-and-releases-after-the-launch",
    "launcher.engineStep--launcher-engine-step-61-14-87-52-use-releases-the-selection-when-the-launch-throws",
    "launcher.engineStep--launcher-engine-step-61-14-87-52-s-the-wine-check-runs-as-today-no-overlay-no-release",
    "launcher.engineStep--launcher-engine-step-61-14-87-52-refused-reports-done-closes-the-log-aborts-and-never-launches",
    "launcher.engineStep--launcher-engine-step-61-14-87-52-a-reply-the-crate-never-produces-fails-the-launch-instead-of-guessing-an-engine",
    "launcher.engineStep--the-end-of-a-launch-releases-the-display-sleep-blocker-87-73-rf2-refused-stops-the-blocker-it-started-once-logs-it-once-sends-done-once",
    "launcher.engineStep--the-end-of-a-launch-releases-the-display-sleep-blocker-87-73-rf2-after-a-refused-launch-the-next-launch-starts-a-fresh-blocker-the-id-was-cleared",
    "launcher.engineStep--the-end-of-a-launch-releases-the-display-sleep-blocker-87-73-rf2-a-rejected-engine-step-sends-done-stops-and-clears-the-blocker-and-rejects-with-the-original-error",
    "launcher.engineStep--the-end-of-a-launch-releases-the-display-sleep-blocker-87-73-rf2-a-failed-wine-check-stops-and-clears-the-blocker-and-sends-done-once",
    "launcher.engineStep--the-end-of-a-launch-releases-the-display-sleep-blocker-87-73-rf2-a-normal-launch-stops-the-blocker-once-at-its-end-and-clears-the-id",
    "launcher.engineStep--launcher-engine-step-request-the-offline-flag-87-63-f1-with-the-monitor-in-s-the-request-says-offline-s",
    "launcher.engineStep--launcher-engine-step-request-the-offline-flag-87-63-f1-reads-the-monitor-when-the-request-is-built-not-when-play-was-pressed-the-epic-offline-prompt-path",
    "launcher.engineStep--launcher-engine-step-request-the-offline-flag-87-63-f1-a-second-play-after-the-network-comes-back-says-online-again-the-flag-is-never-latched",
    "funnel--folder-missing-asks-and-aborts",
    "funnel--engine-refused-releases-the-blocker",
    "funnel--engine-throws-releases-the-blocker-and-rethrows",
    "funnel--wine-check-fails-releases-the-blocker",
    "funnel--recent-game-rejects-still-done",
    "funnel--launch-rejects-writes-the-exception",
    "funnel--cli-no-gui-exits",
    "funnel--gog-playtime-posted",
    "funnel--gog-playtime-sync-disabled",
    "funnel--gog-playtime-post-rejects",
    "funnel--saves-download-rejects-logs-and-goes-on",
    "funnel--persist-bottle-wine-version-hook",
    "funnel--wine-check-heals-and-persists",
    "funnel--before-script-rejects-releases-engine",
    "funnel--after-script-rejects",
    "funnel--launch-arguments-win-over-last-used",
    "funnel--engine-skip-wine-check-runs",
    "funnel--long-session-sets-runs-for-me-on-mac",
    "funnel--short-session-leaves-runs-for-me-alone",
    "funnel--steam-playtime-tracked-externally",
];

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

/// The result of one replayed case: what the Plays answered and what the recorders saw, in order.
struct Replay {
    plays: Vec<Value>,
    events: Vec<Value>,
}

fn replay(case: &Value) -> Replay {
    let s = &case["scenario"];
    let runner = runner_of(s["runner"].as_str().unwrap());
    let app_name = s["appName"].as_str().unwrap().to_string();
    assert_eq!(
        s["installPath"],
        "none",
        "{}: a game folder is not part of the tracer's replay",
        case_id(case)
    );
    assert!(
        s.get("playAgain").is_none(),
        "{}: a second Play is not part of the tracer's replay",
        case_id(case)
    );
    let platform = match s["platform"].as_str().unwrap() {
        "darwin" => Platform::Mac,
        "win32" => Platform::Windows,
        _ => Platform::Linux,
    };

    let rig = FunnelRig::new();
    if s["tsStore"]["hasApp"].as_bool().unwrap() {
        rig.seed_total_played(&app_name, &s["tsStore"]["totalPlayed"]);
    }
    rig.listen_to_play_time();

    // What the managers answer: the TS `getGameInfo`, `getSettings`, `isNative`, the game config's
    // `verboseLogs`, the global settings, and `game.launch` taking `sessionMs` of wall time.
    let facts: LaunchFacts = serde_json::from_value(json!({
        "gameInfo": { "title": s["title"], "install": {} },
        "settings": s["gameSettings"],
        "isNative": s["native"],
        "verboseLogs": s["gameConfigSettings"]["verboseLogs"],
        "global": s["globalSettings"],
        "cliNoGui": s["isCLINoGui"],
    }))
    .expect("the scenario reads as launch facts");
    assert_eq!(
        s["hooks"]["launch"],
        json!({ "resolves": true }),
        "{}: only a launch that resolves is part of the tracer's replay",
        case_id(case)
    );
    let session_ms = s["sessionMs"].as_u64().unwrap();
    let hooks = RecordingHooks::new()
        .with_launch_facts(Ok(facts))
        .with_launch(Ok(LaunchHookReply {
            launched: true,
            rotated: false,
        }))
        .with_on_launch({
            let clock = Arc::clone(&rig.clock);
            Arc::new(move || {
                clock.0.fetch_add(session_ms, Ordering::SeqCst);
            })
        })
        .with_tape(rig.tape.clone());
    assert_eq!(
        s["rust"]["engine_launch_select"]["resolves"],
        json!({ "kind": "skip" }),
        "{}: only a skipping engine step is part of the tracer's replay",
        case_id(case)
    );
    let steps = RecordingSteps::new()
        .with_select(SelectReply {
            kind: SelectKind::Skip,
            key: None,
            selection: None,
            prefix: None,
            log_lines: Vec::new(),
            launch_settings: None,
        })
        .with_tape(rig.tape.clone());
    let shell = RecordingShell::new().with_tape(rig.tape.clone());

    let ctx = rig.ctx(
        platform,
        s["online"].as_bool().unwrap(),
        Arc::new(hooks),
        Arc::new(steps),
        Arc::new(shell),
    );
    let params = LaunchParams {
        app_name,
        runner,
        launch_arguments: None,
        skip_version_check: s["params"]["skipVersionCheck"].as_bool(),
        args: None,
    };
    let rt = common::runtime();
    let status = rt
        .block_on(run_launch(&ctx, params, &FunnelHost::default()))
        .expect("the tracer's launch answers a status");
    settle_store(&rig.host);
    Replay {
        plays: vec![status.to_value()],
        events: rig.events(),
    }
}

/// The golden's events with what the deltas drop taken out.
fn expected_events(id: &str) -> Vec<Value> {
    let events = read_json(&golden_dir().join("expected").join(id).join("events.json"));
    events
        .as_array()
        .expect("events.json is a list")
        .iter()
        .filter(|event| {
            let kind = event["kind"].as_str().unwrap_or_default();
            // `events-bus-emit`, and `reads-folded-into-launch-facts`.
            !matches!(kind, "bus" | "play" | "config" | "gameConfig")
                && !(kind == "hook" && event["hook"] == "getSettings")
        })
        .cloned()
        .collect()
}

fn pretty(events: &[Value]) -> String {
    events
        .iter()
        .map(|e| serde_json::to_string(e).unwrap())
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn the_deltas_the_replay_relies_on_are_documented() {
    let deltas = read_json(&golden_dir().join("deltas.json"));
    for key in ["events-bus-emit", "reads-folded-into-launch-facts"] {
        assert!(
            deltas
                .get(key)
                .and_then(Value::as_str)
                .is_some_and(|reason| reason.len() > 20),
            "deltas.json documents {key}"
        );
    }
}

#[test]
fn the_tracer_replays_in_the_ts_order() {
    let all = cases();
    let tracer = all
        .iter()
        .find(|c| case_id(c) == TRACER)
        .expect("the tracer is a case of cases.json");
    let got = replay(tracer);
    let want = expected_events(TRACER);
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
fn golden_funnel_compared_at_its_floor() {
    let all = cases();
    let mut compared = 0;
    for case in &all {
        let id = case_id(case);
        if NOT_YET.contains(&id.as_str()) {
            continue;
        }
        let got = replay(case);
        assert_eq!(got.events, expected_events(&id), "{id}");
        compared += 1;
    }
    println!("golden funnel: compared {compared} floor {FUNNEL_FLOOR}");
    assert!(
        compared >= FUNNEL_FLOOR,
        "golden funnel: compared {compared}, below the floor of {FUNNEL_FLOOR}"
    );
}

#[test]
fn not_yet_names_only_existing_cases_and_never_the_tracer() {
    let ids: BTreeSet<String> = cases().iter().map(case_id).collect();
    for name in NOT_YET {
        assert!(
            ids.contains(*name),
            "NOT_YET names {name}, which is not a case"
        );
    }
    assert!(!NOT_YET.contains(&TRACER), "the tracer is replayed");
    let unique: BTreeSet<&str> = NOT_YET.iter().copied().collect();
    assert_eq!(unique.len(), NOT_YET.len(), "NOT_YET lists a case twice");
    // Replayed plus not yet is every case: a case cannot be left out of both.
    assert_eq!(ids.len(), NOT_YET.len() + FUNNEL_FLOOR);
    assert_eq!(
        ids.len(),
        read_json(&golden_dir().join("MANIFEST.json"))["count"]
            .as_u64()
            .unwrap() as usize
    );
}
