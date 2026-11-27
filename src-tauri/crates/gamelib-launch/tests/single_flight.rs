//! The Rust replay of `golden/single_flight` (88.3-02 recorded it from the real TypeScript): every case over
//! [`LaunchFlights`], and the launcher cases through `run_launch` with recorders, so the joiner line and the
//! absence of a second log are compared. Then the Rust-only tests of what the TS table could not be asked: a
//! leader that never answers, a panicking leader, a cancelled joiner, and two keys.
//!
//! A case is a step list (`begin`, `settle`, `reject`, `await`, `probe`, and for the launcher family `call` and
//! `finish`). The driver runs each step, then lets every task run until the tape stops changing (a flush), then
//! reports a caller's result once, in caller order, on the tape: the order the TS recorder wrote them in.
//!
//! **Documented differences** (this file's copy of what `deltas.json` of the funnel documents, plus the ones
//! only this slice meets; `golden/single_flight/deltas.json` is empty):
//! - `events-bus-emit`: the Rust funnel emits the frontend message only; `bus` events are dropped.
//! - `open-game-log`: the TS driver recorded the moment its log writer was created. The Rust funnel owns the
//!   writer and has no such call; what the event proved (a joiner opens no second log) is compared through the
//!   one `rotate: true` frame, the one `launch` and the one `Launching` line the golden holds.
//! - `onjoin-notifier-is-the-callers`: the TS table called a notifier on a join; `LaunchFlights::enter` answers
//!   `Join` and the caller notifies (the funnel writes the WR-03 line, the Steam dispatch of 88.3-11 shows its
//!   notice). A notifier that throws or rejects therefore cannot reach the table; the driver writes the recorded
//!   `onJoin` event itself and the joiner still receives the leader's value.
//! - `same-promise-identity`: the TS joiner received the owner's own promise object. A Rust joiner receives the
//!   leader's value through a watch channel; the identity has no counterpart, so `samePromiseAsOwner` is
//!   recorded as `true` for every join and the equal `received` values are what the case proves.
//! - `redundant-store-write`: a write of the value a store already holds is a no-op in the Rust store host (no
//!   change event), where the TS fake recorded every `set`; a `tsStore` event that repeats an earlier
//!   (key, value) of the same case is dropped from the golden.
//! - `recent-game-warning-text`: the TS warning printed its two arguments (`Recording recent game failed:`,
//!   `Error: <reason>`); the Rust line is one string with the fixed reason (`Recording recent game failed:
//!   <reason>`).
//!
//! A count floor lives here next to the replay, so editing the JSON alone cannot lower the bar.

mod common;

use std::collections::{BTreeSet, HashMap};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use gamelib_core::process::BoxFuture;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::Platform;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::funnel::flights::{Enter, FlightGuard, LaunchFlights};
use gamelib_launch::funnel::shell::testing::RecordingShell;
use gamelib_launch::funnel::steps::testing::RecordingSteps;
use gamelib_launch::funnel::testing::Tape;
use gamelib_launch::funnel::{run::run_launch, FunnelHost, LaunchParams, LaunchStatus};
use gamelib_launch::hooks::testing::RecordingHooks;
use gamelib_launch::hooks::{
    HookError, LaunchFacts, LaunchHookArgs, LaunchHookReply, ManagerHooks,
};
use gamelib_launch::runner::RunnerName;
use serde_json::{json, Value};
use tokio::sync::oneshot;

use common::funnel_rig::FunnelRig;
use common::{fixtures, lock, read_json};

/// The cases this file compares. The golden holds 24 (its MANIFEST count); the one the funnel cannot run yet
/// is in [`LAUNCHER_NOT_YET`]. A later edit may raise this, never lower it.
const SINGLE_FLIGHT_FLOOR: usize = 23;

/// Launcher cases the funnel does not run yet, each with the branch it needs. 88.3-05 empties this list and
/// raises the floor to the manifest's 24.
const LAUNCHER_NOT_YET: &[(&str, &str)] = &[(
    "launcher_launchSingleFlight--launcheventcallback-single-flight-wr-03-cr-41-a-rejected-recent-games-write-still-finishes-the-launch-cr-41-online-with-autosyncsaves-the-save-upload-still-runs",
    "cloud-saves",
)];

fn golden_dir() -> std::path::PathBuf {
    fixtures().join("golden/single_flight")
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

fn expected(id: &str, file: &str) -> Value {
    read_json(&golden_dir().join("expected").join(id).join(file))
}

fn runtime() -> tokio::runtime::Runtime {
    common::runtime()
}

// ---------------------------------------------------------------------------------------------
// The managers of the launcher cases
// ---------------------------------------------------------------------------------------------

/// Manager hooks whose `launch` waits for the test to say how the game ended, one gate per launch in the order
/// the launches began.
struct GateHooks {
    settings: Value,
    gates: Mutex<Vec<Option<oneshot::Sender<bool>>>>,
    launches: AtomicUsize,
    tape: Option<Tape>,
    /// The launch hook panics when its game ends: a leader that dies mid-launch.
    panics: bool,
}

impl GateHooks {
    fn new(settings: Value, tape: Option<Tape>) -> GateHooks {
        GateHooks {
            settings,
            gates: Mutex::new(Vec::new()),
            launches: AtomicUsize::new(0),
            tape,
            panics: false,
        }
    }

    /// `finish { launch: n, value }`: the nth launch's game ends, launched or not.
    fn finish(&self, launch: usize, launched: bool) {
        let sender = lock(&self.gates)
            .get_mut(launch)
            .and_then(Option::take)
            .unwrap_or_else(|| panic!("launch {launch} has not started or already finished"));
        let _ = sender.send(launched);
    }
}

impl ManagerHooks for GateHooks {
    fn game_title(
        &self,
        _runner: RunnerName,
        app_name: &str,
    ) -> BoxFuture<Result<String, HookError>> {
        let title = app_name.to_string();
        Box::pin(async move { Ok(title) })
    }

    fn force_uninstall(
        &self,
        _runner: RunnerName,
        _app_name: &str,
    ) -> BoxFuture<Result<(), HookError>> {
        Box::pin(async { Ok(()) })
    }

    fn launch_facts(
        &self,
        _runner: RunnerName,
        app_name: &str,
    ) -> BoxFuture<Result<LaunchFacts, HookError>> {
        let facts: LaunchFacts = serde_json::from_value(json!({
            "gameInfo": { "title": app_name, "install": {} },
            "settings": self.settings,
            "isNative": true,
            "verboseLogs": self.settings["verboseLogs"],
        }))
        .expect("scenario settings read as launch facts");
        Box::pin(async move { Ok(facts) })
    }

    fn launch(
        &self,
        _runner: RunnerName,
        app_name: &str,
        args: LaunchHookArgs,
    ) -> BoxFuture<Result<LaunchHookReply, HookError>> {
        let (tx, rx) = oneshot::channel();
        lock(&self.gates).push(Some(tx));
        self.launches.fetch_add(1, Ordering::SeqCst);
        if let Some(tape) = &self.tape {
            tape(json!({
                "event": "launch",
                "app": app_name,
                "args": [
                    args.launch_arguments.clone().unwrap_or(Value::Null),
                    args.args.clone().map_or(Value::Null, |a| json!(a)),
                    args.skip_version_check.map_or(Value::Null, |b| json!(b)),
                ],
            }));
        }
        let panics = self.panics;
        Box::pin(async move {
            let ended = rx.await;
            assert!(!panics, "the leader dies in the launch hook");
            match ended {
                Ok(launched) => Ok(LaunchHookReply {
                    launched,
                    rotated: false,
                }),
                Err(_) => Err(HookError("gone")),
            }
        })
    }
}

// ---------------------------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------------------------

struct Caller {
    name: String,
    state: Arc<Mutex<Option<Value>>>,
    reported: bool,
}

struct LauncherSide {
    ctx: LaunchCtx,
    hooks: Arc<GateHooks>,
}

struct Driver<'a> {
    rig: &'a FunnelRig,
    shutdown: Shutdown,
    tables: HashMap<String, LaunchFlights>,
    callers: Vec<Caller>,
    leaders: HashMap<String, FlightGuard>,
    launcher: Option<LauncherSide>,
}

fn event(kind: &str, fields: Value) -> Value {
    let mut out = fields;
    out["event"] = json!(kind);
    out
}

impl<'a> Driver<'a> {
    fn new(rig: &'a FunnelRig, launcher: Option<LauncherSide>) -> Driver<'a> {
        Driver {
            rig,
            shutdown: Shutdown::new(),
            tables: HashMap::new(),
            callers: Vec::new(),
            leaders: HashMap::new(),
            launcher,
        }
    }

    fn push(&self, value: Value) {
        (self.rig.tape)(value);
    }

    fn new_caller(&mut self, name: &str) -> Arc<Mutex<Option<Value>>> {
        let state = Arc::new(Mutex::new(None));
        self.callers.push(Caller {
            name: name.to_string(),
            state: Arc::clone(&state),
            reported: false,
        });
        state
    }

    fn caller_state(&self, name: &str) -> Arc<Mutex<Option<Value>>> {
        let caller = self
            .callers
            .iter()
            .find(|c| c.name == name)
            .unwrap_or_else(|| panic!("no caller {name}"));
        Arc::clone(&caller.state)
    }

    /// Lets every task run until nothing on the tape or in a caller's result changes for a while.
    async fn flush(&self) {
        let mut quiet = 0;
        let mut last = (0, 0);
        while quiet < 40 {
            tokio::task::yield_now().await;
            let done = self
                .callers
                .iter()
                .filter(|c| lock(&c.state).is_some())
                .count();
            let now = (self.rig.events().len(), done);
            if now == last {
                quiet += 1;
            } else {
                quiet = 0;
                last = now;
            }
        }
    }

    /// Reports each caller whose result arrived, once, in caller order.
    fn report_received(&mut self) {
        let mut reports = Vec::new();
        for caller in &mut self.callers {
            if caller.reported {
                continue;
            }
            if let Some(payload) = lock(&caller.state).clone() {
                caller.reported = true;
                let mut report = payload;
                report["caller"] = json!(caller.name);
                reports.push(report);
            }
        }
        for report in reports {
            self.push(event("received", report));
        }
    }

    fn table(&mut self, name: Option<&str>) -> LaunchFlights {
        self.tables
            .entry(name.unwrap_or("main").to_string())
            .or_default()
            .clone()
    }

    fn settle_leader(&mut self, caller: &str, payload: Value) {
        let guard = self
            .leaders
            .remove(caller)
            .unwrap_or_else(|| panic!("{caller} is not leading a flight"));
        guard.settle(payload.clone());
        *lock(&self.caller_state(caller)) = Some(payload);
    }

    /// One step of a case, then a flush, then the results that arrived.
    async fn step(&mut self, step: &Value) {
        let op = step["op"].as_str().expect("a step has an op");
        self.push(event("step", step.clone()));
        match op {
            "begin" => self.begin(step),
            "settle" => {
                let caller = step["caller"].as_str().unwrap();
                self.settle_leader(caller, json!({ "value": step["value"] }));
            }
            "reject" => {
                let caller = step["caller"].as_str().unwrap();
                self.settle_leader(caller, json!({ "rejected": step["word"] }));
            }
            "await" => {}
            "probe" => self.probe(step),
            "call" => self.call(step),
            "finish" => {
                let launcher = self.launcher.as_ref().expect("a launcher case");
                launcher.hooks.finish(
                    step["launch"].as_u64().unwrap() as usize,
                    step["value"].as_bool().unwrap(),
                );
            }
            other => panic!("unknown step op {other}"),
        }
        self.flush().await;
        self.report_received();
    }

    fn begin(&mut self, step: &Value) {
        let caller = step["caller"].as_str().unwrap();
        let (runner, app) = (
            step["runner"].as_str().unwrap(),
            step["app"].as_str().unwrap(),
        );
        let key = LaunchFlights::key_of(runner, app);
        let table = self.table(step["table"].as_str());
        let state = self.new_caller(caller);
        match table.enter(runner, app) {
            Enter::Lead(guard) => {
                self.push(event("run", json!({ "caller": caller, "key": key })));
                match step.get("body") {
                    // The body runs at once and the flight ends with it.
                    Some(body) => {
                        let payload = match body.get("rejects") {
                            Some(word) => json!({ "rejected": word }),
                            None => json!({ "value": body["resolves"] }),
                        };
                        guard.settle(payload.clone());
                        *lock(&state) = Some(payload);
                    }
                    None => {
                        self.leaders.insert(caller.to_string(), guard);
                    }
                }
            }
            Enter::Join(join) => {
                self.push(event(
                    "joined",
                    json!({ "caller": caller, "key": key, "samePromiseAsOwner": true }),
                ));
                let mut on_join = json!({ "caller": caller, "key": key });
                match step["onJoin"].as_str() {
                    Some("rejects") => on_join["does"] = json!("rejects"),
                    Some("throws") => on_join["does"] = json!("throws"),
                    Some("notify-steam") => on_join["notice"] = json!("already starting"),
                    _ => {}
                }
                self.push(event("onJoin", on_join));
                let shutdown = self.shutdown.clone();
                tokio::spawn(async move {
                    let answer = join.wait(&shutdown).await;
                    *lock(&state) = Some(answer.unwrap_or_else(|word| json!({ "rejected": word })));
                });
            }
        }
    }

    fn probe(&mut self, step: &Value) {
        let caller = step["caller"].as_str().unwrap();
        let (runner, app) = (
            step["runner"].as_str().unwrap(),
            step["app"].as_str().unwrap(),
        );
        let key = LaunchFlights::key_of(runner, app);
        let table = self.table(None);
        let state = self.new_caller(caller);
        match table.enter(runner, app) {
            Enter::Lead(guard) => {
                self.push(event("released", json!({ "key": key })));
                let payload = json!({ "value": "probe" });
                guard.settle(payload.clone());
                *lock(&state) = Some(payload);
            }
            Enter::Join(join) => {
                self.push(event("still-held", json!({ "key": key })));
                let shutdown = self.shutdown.clone();
                tokio::spawn(async move {
                    let answer = join.wait(&shutdown).await;
                    *lock(&state) = Some(answer.unwrap_or_else(|word| json!({ "rejected": word })));
                });
            }
        }
    }

    fn call(&mut self, step: &Value) {
        let caller = step["caller"].as_str().unwrap();
        let app = step["app"].as_str().unwrap().to_string();
        let state = self.new_caller(caller);
        let ctx = self.launcher.as_ref().expect("a launcher case").ctx.clone();
        tokio::spawn(async move {
            let params = LaunchParams {
                app_name: app,
                runner: RunnerName::Legendary,
                launch_arguments: None,
                skip_version_check: None,
                args: None,
            };
            let answer = match run_launch(&ctx, params, &FunnelHost::default()).await {
                Ok(status) => status.to_value(),
                Err(text) => json!({ "rejected": text }),
            };
            *lock(&state) = Some(answer);
        });
    }

    /// `{ received, pending }`: each caller's result, and the callers still waiting, in caller order.
    fn result(&self) -> Value {
        let mut received = serde_json::Map::new();
        let mut pending = Vec::new();
        for caller in &self.callers {
            match lock(&caller.state).clone() {
                Some(payload) => {
                    received.insert(caller.name.clone(), payload);
                }
                None => pending.push(json!(caller.name)),
            }
        }
        json!({ "received": received, "pending": pending })
    }
}

/// A launcher case's context and managers, from its scenario.
fn launcher_side(rig: &FunnelRig, scenario: &Value) -> LauncherSide {
    let hooks = Arc::new(GateHooks::new(
        scenario["gameSettings"].clone(),
        Some(rig.tape.clone()),
    ));
    let mut steps = RecordingSteps::new().with_tape(rig.tape.clone());
    if let Some(reason) = scenario["recentAddRejects"].as_str() {
        steps = steps.with_recent_add(Err(reason.to_string()));
    }
    let ctx = rig.ctx(
        Platform::Linux,
        scenario["online"].as_bool().unwrap(),
        hooks.clone(),
        Arc::new(steps),
        Arc::new(RecordingShell::new().with_tape(rig.tape.clone())),
    );
    LauncherSide { ctx, hooks }
}

/// The tape of a launcher case in the golden's vocabulary: the funnel's `kind` events renamed `event`, with the
/// fields the golden's driver left out taken out.
fn to_driver_vocabulary(events: Vec<Value>) -> Vec<Value> {
    events
        .into_iter()
        .map(|mut e| {
            let Some(kind) = e.get("kind").and_then(Value::as_str).map(str::to_string) else {
                return e;
            };
            let object = e.as_object_mut().unwrap();
            object.remove("kind");
            object.insert("event".into(), json!(kind));
            match kind.as_str() {
                "appState" => {
                    object.remove("args");
                }
                "tsStore" => {
                    object.remove("op");
                }
                _ => {}
            }
            e
        })
        .collect()
}

/// The golden's events with what the documented differences drop or reshape.
fn expected_events(id: &str) -> Vec<Value> {
    let mut seen: BTreeSet<String> = BTreeSet::new();
    expected(id, "events.json")
        .as_array()
        .expect("events.json is a list")
        .iter()
        .filter_map(|event| {
            let kind = event["event"].as_str().unwrap_or_default();
            match kind {
                // `events-bus-emit`, `open-game-log`.
                "bus" | "openGameLog" => None,
                // `redundant-store-write`.
                "tsStore" => {
                    let identity = format!("{}={}", event["key"], event["value"]);
                    seen.insert(identity).then(|| event.clone())
                }
                // `recent-game-warning-text`.
                "log" if event["text"].is_array() => {
                    let parts: Vec<&str> = event["text"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .filter_map(Value::as_str)
                        .collect();
                    let mut joined = event.clone();
                    joined["text"] = json!(parts.join(" ").replace("Error: ", ""));
                    Some(joined)
                }
                _ => Some(event.clone()),
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

/// Replays one case; `(events, result)`.
fn replay(case: &Value) -> (Vec<Value>, Value) {
    let id = case_id(case);
    let rig = FunnelRig::new();
    let launcher = (case["kind"] == "launcher").then(|| {
        // The TS driver's store already held the game, so no `firstPlayed` is written.
        for step in case["steps"].as_array().unwrap() {
            if let Some(app) = step["app"].as_str() {
                rig.seed_first_played(app);
            }
        }
        rig.listen_to_play_time();
        launcher_side(&rig, &case["scenario"])
    });
    let rt = runtime();
    let result = rt.block_on(async {
        let mut driver = Driver::new(&rig, launcher);
        for step in case["steps"].as_array().unwrap() {
            driver.step(step).await;
        }
        let result = driver.result();
        // A leader the case left open is dropped here, unsettled; its joiners were reported above.
        drop(driver);
        result
    });
    let mut events = rig.events();
    if case["kind"] == "launcher" {
        events = to_driver_vocabulary(events);
    }
    let _ = id;
    (events, result)
}

#[test]
fn golden_single_flight_compared_at_its_floor() {
    let all = cases();
    let not_yet: BTreeSet<&str> = LAUNCHER_NOT_YET.iter().map(|(id, _)| *id).collect();
    let mut compared = 0;
    for case in &all {
        let id = case_id(case);
        if not_yet.contains(id.as_str()) {
            continue;
        }
        let (events, result) = replay(case);
        let want = expected_events(&id);
        assert_eq!(
            events,
            want,
            "{id}\n--- got\n{}\n--- want\n{}",
            pretty(&events),
            pretty(&want)
        );
        assert_eq!(result, expected(&id, "result.json"), "{id}: result");
        compared += 1;
    }
    println!("golden single_flight: compared {compared} floor {SINGLE_FLIGHT_FLOOR}");
    assert!(
        compared >= SINGLE_FLIGHT_FLOOR,
        "golden single_flight: compared {compared}, below the floor of {SINGLE_FLIGHT_FLOOR}"
    );
    assert_eq!(
        compared + LAUNCHER_NOT_YET.len(),
        read_json(&golden_dir().join("MANIFEST.json"))["count"]
            .as_u64()
            .unwrap() as usize,
        "every case is compared or listed as not yet"
    );
}

#[test]
fn launcher_not_yet_names_existing_cases_and_the_branch_ends_before_it_does_anything() {
    let ids: BTreeSet<String> = cases().iter().map(case_id).collect();
    for (id, branch) in LAUNCHER_NOT_YET {
        assert!(ids.contains(*id), "LAUNCHER_NOT_YET names {id}, not a case");
        let case = cases().into_iter().find(|c| case_id(c) == *id).unwrap();
        let rig = FunnelRig::new();
        rig.listen_to_play_time();
        let side = launcher_side(&rig, &case["scenario"]);
        let rt = runtime();
        let answer = rt.block_on(run_launch(
            &side.ctx,
            LaunchParams {
                app_name: "Quail".to_string(),
                runner: RunnerName::Legendary,
                launch_arguments: None,
                skip_version_check: None,
                args: None,
            },
            &FunnelHost::default(),
        ));
        assert_eq!(answer, Err(format!("launch:unported:{branch}")));
        assert!(
            rig.events().is_empty(),
            "a branch the funnel cannot run ends before it has done anything"
        );
        assert!(side.ctx.flights.is_empty(), "and gives its flight back");
    }
}

// ---------------------------------------------------------------------------------------------
// Pitfall 8: no leader or joiner can hang
// ---------------------------------------------------------------------------------------------

fn facts_json() -> Value {
    json!({ "verboseLogs": true })
}

fn params(runner: RunnerName, app: &str) -> LaunchParams {
    LaunchParams {
        app_name: app.to_string(),
        runner,
        launch_arguments: None,
        skip_version_check: None,
        args: None,
    }
}

fn ctx_over(rig: &FunnelRig, hooks: Arc<dyn ManagerHooks>) -> LaunchCtx {
    rig.ctx(
        Platform::Linux,
        true,
        hooks,
        Arc::new(RecordingSteps::new()),
        Arc::new(RecordingShell::new()),
    )
}

async fn settle_tasks() {
    for _ in 0..40 {
        tokio::task::yield_now().await;
    }
}

#[test]
fn a_leader_whose_launch_hook_never_answers_releases_on_shutdown() {
    let rig = FunnelRig::new();
    let hooks = RecordingHooks::new()
        .with_launch_facts(Ok(serde_json::from_value(json!({
            "gameInfo": { "title": "Alpha", "install": {} },
            "settings": facts_json(),
            "isNative": true,
            "verboseLogs": true,
        }))
        .unwrap()))
        .with_launch_pending();
    let ctx = ctx_over(&rig, Arc::new(hooks));
    runtime().block_on(async {
        let leader = tokio::spawn({
            let ctx = ctx.clone();
            async move {
                run_launch(
                    &ctx,
                    params(RunnerName::Legendary, "alpha"),
                    &FunnelHost::default(),
                )
                .await
            }
        });
        let joiner = tokio::spawn({
            let ctx = ctx.clone();
            async move {
                run_launch(
                    &ctx,
                    params(RunnerName::Legendary, "alpha"),
                    &FunnelHost::default(),
                )
                .await
            }
        });
        settle_tasks().await;
        assert_eq!(
            ctx.flights.len(),
            1,
            "the leader holds the key and the joiner shares it"
        );
        assert!(!leader.is_finished() && !joiner.is_finished());

        ctx.engine.shutdown.token().cancel();
        assert_eq!(
            leader.await.unwrap(),
            Err("launch:shutdown".to_string()),
            "the leader ends when the app shuts down"
        );
        assert_eq!(
            joiner.await.unwrap(),
            Err("launch:shutdown".to_string()),
            "and so does its joiner"
        );
        assert!(ctx.flights.is_empty(), "the key is given back");
    });
}

#[test]
fn a_panicking_leader_releases_and_its_joiner_answers_abandoned() {
    let rig = FunnelRig::new();
    let mut hooks = GateHooks::new(facts_json(), None);
    hooks.panics = true;
    let hooks = Arc::new(hooks);
    let ctx = ctx_over(&rig, hooks.clone());
    runtime().block_on(async {
        let play = |ctx: LaunchCtx| {
            tokio::spawn(async move {
                run_launch(
                    &ctx,
                    params(RunnerName::Legendary, "alpha"),
                    &FunnelHost::default(),
                )
                .await
            })
        };
        let leader = play(ctx.clone());
        settle_tasks().await;
        let joiner = play(ctx.clone());
        settle_tasks().await;
        assert_eq!(ctx.flights.len(), 1, "the leader holds the key");

        // The game ends and the launch hook panics: the guard is dropped by the unwind.
        hooks.finish(0, true);
        assert_eq!(joiner.await.unwrap(), Err("launch:abandoned".to_string()));
        assert_eq!(leader.await.unwrap(), Err("launch:panic".to_string()));
        assert!(
            ctx.flights.is_empty(),
            "the key is given back after a panic"
        );
        // A later Play is a new launch, not a join of a dead one.
        assert!(matches!(
            ctx.flights.enter("legendary", "alpha"),
            Enter::Lead(_)
        ));
    });
}

#[test]
fn a_cancelled_joiner_leaves_the_leader_running() {
    let rig = FunnelRig::new();
    let hooks = Arc::new(GateHooks::new(facts_json(), None));
    let ctx = ctx_over(&rig, hooks.clone());
    runtime().block_on(async {
        let leader = tokio::spawn({
            let ctx = ctx.clone();
            async move {
                run_launch(
                    &ctx,
                    params(RunnerName::Legendary, "alpha"),
                    &FunnelHost::default(),
                )
                .await
            }
        });
        settle_tasks().await;
        let joiner = tokio::spawn({
            let ctx = ctx.clone();
            async move {
                run_launch(
                    &ctx,
                    params(RunnerName::Legendary, "alpha"),
                    &FunnelHost::default(),
                )
                .await
            }
        });
        settle_tasks().await;
        joiner.abort();
        assert!(joiner.await.unwrap_err().is_cancelled());
        settle_tasks().await;
        assert!(!leader.is_finished(), "the leader is still in its game");
        assert_eq!(ctx.flights.len(), 1);

        hooks.finish(0, true);
        assert_eq!(leader.await.unwrap(), Ok(LaunchStatus::Done));
        assert!(ctx.flights.is_empty());
    });
}

#[test]
fn a_caller_that_drops_its_future_neither_stops_the_launch_nor_strands_a_joiner() {
    let rig = FunnelRig::new();
    let hooks = Arc::new(GateHooks::new(facts_json(), None));
    let ctx = ctx_over(&rig, hooks.clone());
    runtime().block_on(async {
        let leader_caller = tokio::spawn({
            let ctx = ctx.clone();
            async move {
                run_launch(
                    &ctx,
                    params(RunnerName::Legendary, "alpha"),
                    &FunnelHost::default(),
                )
                .await
            }
        });
        settle_tasks().await;
        let joiner = tokio::spawn({
            let ctx = ctx.clone();
            async move {
                run_launch(
                    &ctx,
                    params(RunnerName::Legendary, "alpha"),
                    &FunnelHost::default(),
                )
                .await
            }
        });
        settle_tasks().await;
        // The caller that led goes away; the launch is its own task.
        leader_caller.abort();
        let _ = leader_caller.await;
        settle_tasks().await;
        assert_eq!(ctx.flights.len(), 1, "the launch is still in flight");
        hooks.finish(0, true);
        assert_eq!(joiner.await.unwrap(), Ok(LaunchStatus::Done));
        assert!(ctx.flights.is_empty());
    });
}

#[test]
fn two_keys_never_join() {
    let rig = FunnelRig::new();
    let hooks = Arc::new(GateHooks::new(facts_json(), None));
    let ctx = ctx_over(&rig, hooks.clone());
    runtime().block_on(async {
        // The same app name under two runners, and two app names under one runner: three keys, three launches.
        let launches: Vec<_> = [
            (RunnerName::Legendary, "alpha"),
            (RunnerName::Gog, "alpha"),
            (RunnerName::Legendary, "beta"),
        ]
        .into_iter()
        .map(|(runner, app)| {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                run_launch(&ctx, params(runner, app), &FunnelHost::default()).await
            })
        })
        .collect();
        settle_tasks().await;
        // gog is not ported yet: it ends at once, never joining the legendary launch of the same name.
        assert_eq!(
            ctx.flights.len(),
            2,
            "legendary:alpha and legendary:beta are in flight"
        );
        assert_eq!(hooks.launches.load(Ordering::SeqCst), 2);
        for launch in 0..2 {
            hooks.finish(launch, true);
        }
        let mut answers = Vec::new();
        for launch in launches {
            answers.push(launch.await.unwrap());
        }
        assert_eq!(answers[0], Ok(LaunchStatus::Done));
        assert_eq!(answers[1], Err("launch:unported:gog".to_string()));
        assert_eq!(answers[2], Ok(LaunchStatus::Done));
        assert!(ctx.flights.is_empty());
    });
}
