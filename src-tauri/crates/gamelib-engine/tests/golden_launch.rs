//! The launch-time engine step against the TS goldens (87-15 recorded them, 87-50 ports the selection;
//! D-01, D-02, D-20): `golden/launch` holds one case per behaviour of `selectEngineForLaunch`, the
//! launch-settings overlay, the dialog and notice rules, and (for 87-51) the launch deadline.
//!
//! Every case replays over a fake HOME laid out as the oracle's profile, on a clock pinned to the
//! oracle's start. The TS scripted four things as functions and the replay scripts the same four as
//! [`StepDeps`]: the game's effective engine, the bottle's existence, the per-game bottle creation, the
//! pinned-engine download (it seeds the installed engine files on success) and the engine switch (its
//! own goldens are 87-38's). Everything else is real: the eligibility, the prefix rule, the decision
//! over a CrossOver laid out as real files with its `--demo-status` probe, build read and wineserver
//! stop as scripted spawns through the one seam, the registry, the overlay, the ledger, the offline
//! gate over the bottle marker on disk, and the engine state's `engineStateChanged`.
//!
//! What is compared to the golden, per step: the step's result (kind, key, selection, prefix), the
//! trace of the scripted collaborators and of the host surfaces (`isProvisioned`, `ensureGameBottle`,
//! `ensurePinned`, `prepare`, `sendStatus`, notification, window raise, dialog) in order, the lines for
//! the game's launch log, and the registry, overlay and ledger afterwards. Per case: the
//! `engineStateChanged` pushes, the lines the engine wrote to its log, and the profile tree.
//!
//! What the replay does differently, each with its reason:
//! - **the deadline cases** (`arm`, `advance`, `end`, `registry-clear` and `quit` steps, 87-51) run on a
//!   paused tokio clock that the replay moves 100 ms at a time, with `FixedClock` moved the same, over a
//!   scripted `ps` listing through the one spawn seam. The TS oracle's own timer trace (`timer-set`,
//!   `timer-fire`, `timer-clear`, `timer-unref` and the `listing` poll count) is its fake clock's and is not
//!   compared: what is compared is what the launch sees, which is the notification, the watch's request, the
//!   log, the `engineStateChanged` pushes, the registry, overlay, ledger and the number of armed deadlines;
//! - **a quit** with a deadline armed ends its task and its entry in Rust (the token ends it, no notice
//!   fires and the registrant is released); the TS left the entry and three timers pending. The replay
//!   compares the cases up to the quit, and `a_quit_with_a_deadline_armed_...` asserts the Rust side;
//! - **the dialog** is one `show_dialog` call in Rust where the TS made a window raise, an
//!   acknowledgement tracking and a frame; the replay expands one into the other, and the acknowledgement
//!   id is `engine:<n>` where the TS had `ack-<n>`;
//! - **the oracle's scripted probe** failures are the engine's own text for a real spawn: `exit 3` is
//!   `code=3 stderr= stdout=`, and an `invalid-bottle` probe (a name the engine layer never produces for
//!   a launch) is the inconclusive timeout of a starting title;
//! - **the oracle's `other` switch refusal** is `invalid-bottle` (the closed reason has no `other`);
//! - **`sameObject`** is value equality (Rust has no object identity).
//!
//! A count floor lives here beside the replay, so editing the JSON alone cannot lower the bar, and an
//! empty case list fails. POSIX only, as the TS oracle's replays are.
#![cfg(unix)]

mod common;

use std::collections::BTreeMap;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::clock::Clock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_engine::bottles::per_game::{EnsureArgs, EnsureEngine, EnsureOutcome};
use gamelib_engine::bottles::registry::EngineSelection;
use gamelib_engine::bottles::switch::{PrepareArgs, PrepareOutcome, PrepareReason, PrepareResult};
use gamelib_engine::config::{EffectiveEngine, EngineSource};
use gamelib_engine::crossover::locate::CrossoverLocator;
use gamelib_engine::ctx::EngineCtx;
use gamelib_engine::decision::launch::{DecideArgs, LaunchDecision};
use gamelib_engine::decision::preflight::{MonitorPhase, ProbeTuning};
use gamelib_engine::engines::pin_engine;
use gamelib_engine::fallback::ensure::{EnsureReason, PinnedEngineResult};
use gamelib_engine::game_engine::per_game_bottle_name;
use gamelib_engine::launch::settings::OverlayContext;
use gamelib_engine::launch::step::{
    arm_engine_launch_deadline, end_engine_launch, select_engine_for_launch, ArmOptions,
    ArmOutcome, CtxStepDeps, DeadlineGame, Fut, GameRef, Purpose, SelectArgs, StepDeps,
};
use gamelib_engine::pins::{pins, EnginePin};
use gamelib_engine::sinks::EngineUi;
use gamelib_engine::testing::{FixedClock, RecordingLog};
use serde_json::{json, Map, Value};

use common::{check_floor, first_difference, read_json, Profile};

/// The case count the plan committed as a floor; a later edit may raise it, never lower it.
const CASE_FLOOR: usize = 25;
/// How many cases have no deadline step (87-50's). A floor too: the list may grow, not shrink.
const REPLAYED_FLOOR: usize = 53;
/// How many cases have a deadline step (87-51's).
const DEADLINE_FLOOR: usize = 24;

/// 2026-11-23 12:00:00 UTC, the oracle's start.
const START: u64 = 1_795_435_200_000;
const BIN_REL: &str = "Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin";
const BUILD: &str = "26.3.0.39832";

/// The steps 87-51 owns: the launch deadline, its process watch and the end of a launch.
const DEADLINE_OPS: [&str; 5] = ["arm", "advance", "end", "quit", "registry-clear"];

/// How far the paused clock moves at a time while a deadline case advances: every time the oracle's cases
/// ask for (1.5 s polls, a 180 s deadline, a 10 s cap, 4.6 s) is a whole number of these.
const TICK_MS: u64 = 100;

/// Lets the tasks the clock just woke run: the watch's poll, the deadline's fire.
async fn settle() {
    for _ in 0..6 {
        tokio::task::yield_now().await;
    }
}

/// Whether the replay compares the host surfaces (notification, window raise, dialog).
const COMPARE_UI: bool = true;

/// The trace entries that are compared: the scripted collaborators and the host surfaces. The oracle's
/// other entries (`resolveCrossoverBinDir`, `probe`, `killWineserver`, timers) are the decision's own
/// reads, which the real decision makes through real files and spawns.
const SCRIPTED_OPS: [&str; 6] = [
    "isProvisioned",
    "ensureGameBottle",
    "ensurePinned",
    "prepare",
    "sendStatus",
    "watch",
];
const UI_OPS: [&str; 6] = [
    "notify",
    "raiseMainWindow",
    "trackAck",
    "raiseMainWindowForInAppDialog",
    "sendFrontendMessage",
    "game.stop",
];

fn golden_dir() -> PathBuf {
    common::fixtures().join("golden/launch")
}

fn cases() -> Vec<Value> {
    read_json(&golden_dir().join("cases.json"))
        .as_array()
        .unwrap()
        .clone()
}

fn id_of(case: &Value) -> &str {
    case["id"].as_str().unwrap()
}

fn is_deadline_case(case: &Value) -> bool {
    case["steps"].as_array().unwrap().iter().any(|step| {
        DEADLINE_OPS
            .iter()
            .any(|op| step["op"].as_str() == Some(op))
    })
}

/// The world of a case, merged step by step as the oracle's.
#[derive(Debug, Clone, Default)]
struct World {
    cx: Option<String>,
    effective: Option<Value>,
    is_mac: Option<bool>,
    provisioned: Option<bool>,
    ensure_bottle: Option<String>,
    ensure: Option<String>,
    prepare: Option<String>,
    prepare_switching: bool,
}

impl World {
    fn merge(&mut self, spec: &Value) {
        if let Some(cx) = spec.get("cx").and_then(Value::as_str) {
            self.cx = Some(cx.to_string());
        }
        if let Some(effective) = spec.get("effective") {
            self.effective = Some(effective.clone());
        }
        if let Some(is_mac) = spec.get("isMac").and_then(Value::as_bool) {
            self.is_mac = Some(is_mac);
        }
        if let Some(provisioned) = spec.get("provisioned").and_then(Value::as_bool) {
            self.provisioned = Some(provisioned);
        }
        for (key, slot) in [
            ("ensureBottle", &mut self.ensure_bottle),
            ("ensure", &mut self.ensure),
            ("prepare", &mut self.prepare),
        ] {
            if let Some(word) = spec.get(key).and_then(Value::as_str) {
                *slot = Some(word.to_string());
            }
        }
        if let Some(switching) = spec.get("prepareSwitching").and_then(Value::as_bool) {
            self.prepare_switching = switching;
        }
    }

    fn cx(&self) -> &str {
        self.cx.as_deref().unwrap_or("healthy")
    }
}

type Shared<T> = Arc<Mutex<T>>;

fn lock<T>(shared: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    shared.lock().unwrap_or_else(|e| e.into_inner())
}

/// What the oracle's `--demo-status` probe said for a CrossOver, as the spawn's output.
fn probe_output(cx: &str) -> SpecOutput {
    let say = |code: i32, stdout: &str| SpecOutput {
        code: Some(code),
        stdout: stdout.to_string(),
        ..SpecOutput::default()
    };
    match cx {
        "trial" => say(0, "Demo version (5 days remaining)\n"),
        "expired" => say(0, "Demo version (expired 9 days ago)\n"),
        "broken" => say(3, ""),
        "unrecognised" => say(0, "something else entirely\n"),
        // The oracle's `invalid-bottle`: no evidence either way. The engine layer never refuses a launch's
        // own bottle name, so the replay reaches the same inconclusive answer through a timed-out probe of
        // a title that is starting (the G29 no-kill arm).
        "invalid-bottle" => SpecOutput {
            code: None,
            timed_out: true,
            ..SpecOutput::default()
        },
        _ => say(0, "Standard version\n"),
    }
}

/// The spawn seam of the replay: CrossOver's probe, the build read and the wineserver stop, answered from
/// the world as it is when the spawn happens. Anything else is recorded as stray and answers nothing.
struct WorldRunner {
    world: Shared<World>,
    stray: Mutex<Vec<String>>,
    /// The `ps` listing script of the armed launch: poll `n` answers item `min(n, len - 1)`.
    listing: Mutex<Listing>,
}

/// The oracle's `listing`: `None` is the item `"throw"` (the listing fails).
#[derive(Default)]
struct Listing {
    items: Vec<Option<String>>,
    polls: usize,
}

impl Listing {
    fn next(&mut self) -> Option<Option<String>> {
        if self.items.is_empty() {
            return None;
        }
        let item = self.items[self.polls.min(self.items.len() - 1)].clone();
        self.polls += 1;
        Some(item)
    }
}

impl SpecRunner for WorldRunner {
    fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        let cx = lock(&self.world).cx().to_string();
        let output = if spec.program.ends_with("/wine") && spec.argv == ["--demo-status"] {
            probe_output(&cx)
        } else if spec.program == "/usr/bin/plutil" {
            SpecOutput {
                code: Some(0),
                stdout: format!("{BUILD}\n"),
                ..SpecOutput::default()
            }
        } else if spec.program.ends_with("/wineserver") {
            SpecOutput {
                code: Some(0),
                ..SpecOutput::default()
            }
        } else if spec.program == "ps" && spec.argv == ["-axo", "pid=,command="] {
            // The scripted listing; a failing item is a `ps` that could not run.
            match lock(&self.listing).next() {
                Some(Some(stdout)) => SpecOutput {
                    code: Some(0),
                    stdout,
                    ..SpecOutput::default()
                },
                Some(None) => SpecOutput::default(),
                None => {
                    lock(&self.stray).push("ps without a listing".to_string());
                    SpecOutput::default()
                }
            }
        } else if spec.program == "pgrep" {
            // The stand-in when `ps` cannot run: the oracle's listing failure fails it as well.
            SpecOutput::default()
        } else {
            lock(&self.stray).push(format!("{} {}", spec.program, spec.argv.join(" ")));
            SpecOutput::default()
        };
        Box::pin(async move { output })
    }
}

/// The oracle's one ordered record of the scripted collaborators and the host surfaces.
type Trace = Shared<Vec<Value>>;

/// The host surfaces as the oracle's trace entries: one `show_dialog` is the window raise for the
/// in-app dialog, the acknowledgement tracking and the frame the TS made separately.
struct TraceUi {
    trace: Trace,
}

fn ts_ack(ack_id: &str) -> String {
    match ack_id.strip_prefix("engine:") {
        Some(n) => format!("ack-{n}"),
        None => ack_id.to_string(),
    }
}

impl EngineUi for TraceUi {
    fn notify(&self, title: &str, body: &str) {
        lock(&self.trace).push(json!({"op": "notify", "title": title, "body": body}));
    }

    fn show_dialog(&self, title: &str, body: &str, kind: &str, ack_id: &str) -> bool {
        let ack = ts_ack(ack_id);
        let mut trace = lock(&self.trace);
        trace.push(json!({"op": "trackAck", "ackId": ack}));
        trace.push(json!({"op": "raiseMainWindowForInAppDialog"}));
        trace.push(json!({
            "op": "sendFrontendMessage", "channel": "showDialog",
            "args": [title, body, kind, null, ack],
        }));
        true
    }

    fn raise_main_window(&self) {
        lock(&self.trace).push(json!({"op": "raiseMainWindow"}));
    }

    fn send_to_sidecar(&self, channel: &str, args: Vec<Value>) {
        lock(&self.trace).push(json!({"op": "sendToSidecar", "channel": channel, "args": args}));
    }
}

/// `engineStateChanged` is the case's events; `gameStatusUpdate` is the oracle's `sendStatus`.
struct TraceEmitter {
    trace: Trace,
    events: Shared<Vec<Value>>,
}

impl FrontendEmitter for TraceEmitter {
    fn emit(&self, channel: &str, args: Vec<Value>) {
        match channel {
            "engineStateChanged" => {
                lock(&self.events).push(json!({"channel": channel, "args": args}));
            }
            "gameStatusUpdate" => {
                let update = args.into_iter().next().unwrap_or(Value::Null);
                lock(&self.trace).push(json!({"op": "sendStatus", "update": update}));
            }
            other => panic!("an unexpected push on {other}"),
        }
    }
}

/// The scripted collaborators of the step: what the TS oracle's `overrides()` replaced.
struct Scripted {
    world: Shared<World>,
    trace: Trace,
    profile: Arc<Profile>,
    tuning: ProbeTuning,
    real: CtxStepDeps,
}

impl Scripted {
    fn record(&self, entry: Value) {
        lock(&self.trace).push(entry);
    }
}

impl StepDeps for Scripted {
    fn read_effective(&self, _ctx: &EngineCtx, _game: &GameRef<'_>) -> EffectiveEngine {
        effective_for(lock(&self.world).effective.as_ref())
    }

    fn is_provisioned(&self, _ctx: &EngineCtx, bottle_name: &str) -> bool {
        self.record(json!({"op": "isProvisioned", "bottle": bottle_name}));
        lock(&self.world).provisioned.unwrap_or(true)
    }

    fn ensure_game_bottle<'a>(
        &'a self,
        _ctx: &'a EngineCtx,
        args: &'a EnsureArgs,
    ) -> Fut<'a, EnsureOutcome> {
        self.record(json!({"op": "ensureGameBottle", "bottle": args.bottle_name, "key": args.key}));
        let failed = lock(&self.world).ensure_bottle.as_deref() == Some("error");
        Box::pin(async move {
            if failed {
                EnsureOutcome::Failed {
                    error_code: None,
                    error: "cxbottle create failed".to_string(),
                }
            } else {
                EnsureOutcome::Done {
                    created_here: true,
                    engine: EnsureEngine::Crossover,
                }
            }
        })
    }

    fn ensure_pinned<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        pin: &'a EnginePin,
        game: &'a GameRef<'a>,
    ) -> Fut<'a, PinnedEngineResult> {
        self.record(json!({
            "op": "ensurePinned", "pin": pin.id, "appName": game.app_name, "runner": game.runner,
        }));
        let mode = lock(&self.world)
            .ensure
            .clone()
            .unwrap_or_else(|| "ok".to_string());
        if mode == "ok" {
            self.profile.build_engines("installed");
        }
        Box::pin(async move {
            match mode.as_str() {
                "ok" | "ok-no-files" => PinnedEngineResult::Ready(pin_engine(ctx, pin)),
                other => PinnedEngineResult::Failed {
                    aborted: other == "aborted",
                    reason: EnsureReason::DownloadFailed,
                    error: if other == "aborted" {
                        "aborted".to_string()
                    } else {
                        "connection reset".to_string()
                    },
                },
            }
        })
    }

    fn prepare<'a>(
        &'a self,
        _ctx: &'a EngineCtx,
        args: PrepareArgs,
        _game: &'a GameRef<'a>,
    ) -> Fut<'a, PrepareResult> {
        self.record(json!({
            "op": "prepare",
            "key": args.key,
            "bottleName": args.bottle_name,
            "next": args.next.log_label(),
            "nextKind": match args.next {
                EngineSelection::Crossover { .. } => "crossover",
                EngineSelection::Pinned { .. } => "pinned",
                EngineSelection::WineManager { .. } => "wine-manager",
            },
            "crossoverHealthy": args.crossover_healthy,
            "crossoverSettings": self.profile.normalise(args.crossover_settings.clone()),
        }));
        let (mode, switching) = {
            let world = lock(&self.world);
            (
                world.prepare.clone().unwrap_or_else(|| "ok".to_string()),
                world.prepare_switching,
            )
        };
        if switching {
            if let Some(on_switching) = &args.on_switching {
                on_switching();
            }
        }
        Box::pin(async move {
            let refused = |reason: PrepareReason, mode: &str| PrepareResult {
                outcome: PrepareOutcome::Refused {
                    reason,
                    detail: format!("scripted {mode}"),
                },
                switched: false,
                selection: None,
            };
            match mode.as_str() {
                "ok" | "ok-changed" => PrepareResult {
                    outcome: PrepareOutcome::Prepared,
                    switched: mode == "ok-changed",
                    selection: Some(args.next.clone()),
                },
                "dxvk-failed" => refused(PrepareReason::DxvkFailed, &mode),
                "bottle-busy" => refused(PrepareReason::BottleBusy, &mode),
                "game-running" => refused(PrepareReason::GameRunning, &mode),
                "shared-bottle" => refused(PrepareReason::SharedBottle, &mode),
                // The oracle's `other`: any reason the step has no dialog for.
                _ => refused(PrepareReason::InvalidBottle, &mode),
            }
        })
    }

    fn decide<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        mut args: DecideArgs,
    ) -> Fut<'a, Result<LaunchDecision, &'static str>> {
        if lock(&self.world).cx() == "invalid-bottle" {
            args.monitor_phase = Some(MonitorPhase::Starting);
        }
        self.real.decide(ctx, args)
    }

    fn probe_tuning(&self) -> ProbeTuning {
        self.tuning.clone()
    }
}

fn effective_for(name: Option<&Value>) -> EffectiveEngine {
    let stored = |id: String| EffectiveEngine::Override {
        id,
        source: EngineSource::Stored,
    };
    match name {
        None => EffectiveEngine::Override {
            id: "automatic".to_string(),
            source: EngineSource::Derived,
        },
        Some(Value::String(name)) => match name.as_str() {
            "automatic" => effective_for(None),
            "crossover" => stored("crossover".to_string()),
            "pinned" => stored(format!("pinned:{}", pins().unwrap().current.id)),
            "wine-manager" => stored("wine-manager:11.0-1".to_string()),
            other => panic!("unknown effective engine {other}"),
        },
        Some(object) => EffectiveEngine::Legacy {
            label: object.get("legacy").cloned(),
        },
    }
}

fn write_file(path: &Path, mode: u32) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, "").unwrap();
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode)).unwrap();
}

/// The CrossOver the world says: real files under the fake HOME, so the locator, the existence check and
/// the execute check are the production ones.
fn lay_out_crossover(profile: &Profile, cx: &str) {
    let apps = profile.root().join("Applications");
    let _ = std::fs::remove_dir_all(&apps);
    if cx == "missing" {
        return;
    }
    let bin_dir = profile.root().join(BIN_REL);
    write_file(&bin_dir.join("cxbottle"), 0o644);
    match cx {
        "missing-wine" => {}
        "not-executable" => write_file(&bin_dir.join("wine"), 0o644),
        _ => write_file(&bin_dir.join("wine"), 0o755),
    }
}

fn base_env(profile: &Profile) -> Vec<(String, String)> {
    profile
        .home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect()
}

fn locales_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../public/locales")
}

/// What the oracle's engine text says where the engine's own differs (see the header).
fn as_ts_text(text: &str) -> String {
    text.replace("code=3 stderr= stdout=", "exit 3")
        .replace(
            "--demo-status timeout (not retried: game running): no result within 15000 ms",
            "--demo-status invalid-bottle (no evidence; not retried): no such bottle",
        )
        .replace("invalid-bottle: scripted other", "other: scripted other")
        // A scripted `ps` that fails is the oracle's rejected promise.
        .replace(": ps did not run", ": ps failed")
}

fn map_strings(value: Value) -> Value {
    match value {
        Value::String(text) => Value::String(as_ts_text(&text)),
        Value::Array(items) => Value::Array(items.into_iter().map(map_strings).collect()),
        Value::Object(map) => {
            Value::Object(map.into_iter().map(|(k, v)| (k, map_strings(v))).collect())
        }
        other => other,
    }
}

/// `$BIN`, `$PERGAME`, `$BOTTLE`, `$ZINSTALL` and the profile placeholders, as the oracle expanded them.
struct Expander<'a> {
    profile: &'a Profile,
    per_game: String,
    install: String,
}

impl Expander<'_> {
    fn text(&self, text: &str) -> String {
        let z_install = format!("Z:{}", self.install.replace('/', "\\"));
        let bottle = self.profile.bottles_root().join(&self.per_game);
        let replaced = text
            .replace("$BIN", &self.profile.root().join(BIN_REL).to_string_lossy())
            .replace("$PERGAME", &self.per_game)
            .replace("$BOTTLE", &bottle.to_string_lossy())
            .replace("$ZINSTALL", &z_install);
        self.profile.expand(&replaced)
    }

    fn value(&self, value: &Value) -> Value {
        match value {
            Value::String(text) => Value::String(self.text(text)),
            Value::Array(items) => Value::Array(items.iter().map(|v| self.value(v)).collect()),
            Value::Object(map) => Value::Object(
                map.iter()
                    .map(|(k, v)| (k.clone(), self.value(v)))
                    .collect(),
            ),
            other => other.clone(),
        }
    }
}

/// The entries of a trace that the replay compares.
fn comparable(trace: &[Value]) -> Vec<Value> {
    trace
        .iter()
        .filter(|entry| {
            let op = entry["op"].as_str().unwrap_or_default();
            SCRIPTED_OPS.contains(&op) || (COMPARE_UI && UI_OPS.contains(&op))
        })
        .cloned()
        .collect()
}

/// Everything one replay of a case leaves behind, in the golden's vocabulary.
struct Replay {
    steps: Vec<Value>,
    events: Vec<Value>,
    logs: Vec<Value>,
    tree: Value,
    stray_spawns: Vec<String>,
}

fn placeholder_game(case: &Value) -> Value {
    case.get("game").cloned().unwrap_or_else(|| json!({}))
}

async fn replay(case: &Value) -> Replay {
    let profile = Arc::new(Profile::new());
    if case.get("engines").and_then(Value::as_str) == Some("installed") {
        profile.build_engines("installed");
    }
    for name in case["bottles"].as_array().into_iter().flatten() {
        profile.build_bottle(name.as_str().unwrap());
    }

    let spec = placeholder_game(case);
    let runner = spec["runner"].as_str().unwrap_or("legendary").to_string();
    let app_name = spec["appName"].as_str().unwrap_or("Quail").to_string();
    let title = spec["title"].as_str().unwrap_or("Quail").to_string();
    let per_game = per_game_bottle_name(&runner, &app_name).unwrap_or_default();
    let install_raw = spec["installPath"]
        .as_str()
        .unwrap_or("<HOME>/Games/Quail")
        .to_string();
    let expander = Expander {
        profile: &profile,
        per_game: per_game.clone(),
        install: profile.expand(&install_raw),
    };
    // `$BOTTLE` and the other placeholders of the oracle's install path (the C: form installs under the
    // bottle's drive_c).
    let expander = Expander {
        install: expander.text(&install_raw),
        ..expander
    };
    let stored_settings = expander.value(&spec.get("settings").cloned().unwrap_or_else(|| {
        json!({
            "wineVersion": {"type": "crossover", "bin": "$BIN/wine", "name": "CrossOver"},
            "wineCrossoverBottle": "$PERGAME",
            "winePrefix": "<HOME>/old-prefix",
        })
    }));

    let trace: Trace = Arc::new(Mutex::new(Vec::new()));
    let events: Shared<Vec<Value>> = Arc::new(Mutex::new(Vec::new()));
    let log = Arc::new(RecordingLog::new());
    let mut world = World::default();
    world.merge(case.get("world").unwrap_or(&Value::Null));
    let world: Shared<World> = Arc::new(Mutex::new(world));
    let proc = Arc::new(WorldRunner {
        world: world.clone(),
        stray: Mutex::new(Vec::new()),
        listing: Mutex::new(Listing::default()),
    });
    let fixed = Arc::new(FixedClock::new(START));
    let clock: Arc<dyn Clock> = fixed.clone();

    let mut ctx = profile.ctx_with(log.clone(), Some(proc.clone()));
    ctx.clock = clock;
    ctx.emitter = Arc::new(TraceEmitter {
        trace: trace.clone(),
        events: events.clone(),
    });
    ctx.ui = Some(Arc::new(TraceUi {
        trace: trace.clone(),
    }));
    ctx.i18n = Arc::new(gamelib_i18n::Catalog::load(&locales_dir(), "en"));
    std::fs::create_dir_all(profile.root().join("tmp")).unwrap();
    let new_locator = || {
        CrossoverLocator::with_system_applications(
            profile
                .root()
                .join("no-system-applications")
                .to_string_lossy()
                .into_owned(),
        )
    };
    ctx.crossover_locator = new_locator();
    lay_out_crossover(&profile, lock(&world).cx());
    // A deadline case arms tasks that reach the context when they fire, so it is shared and nothing
    // changes in it afterwards; the one case that changes the world between steps has no deadline.
    let mut owned = Some(ctx);
    let mut shared: Option<Arc<EngineCtx>> = None;
    if case["steps"]
        .as_array()
        .unwrap()
        .iter()
        .any(|step| step["op"].as_str() == Some("arm"))
    {
        shared = owned.take().map(EngineCtx::share);
    }

    let deps = Scripted {
        world: world.clone(),
        trace: trace.clone(),
        profile: profile.clone(),
        tuning: ProbeTuning {
            base_env: Some(base_env(&profile)),
            timeout_ms: None,
            retry_settle_ms: Some(0),
        },
        real: CtxStepDeps,
    };

    let key = format!("{runner}:{app_name}");
    let ledger_bottles: Vec<String> = {
        let mut names = vec![per_game.clone()];
        if let Some(stored) = stored_settings["wineCrossoverBottle"].as_str() {
            names.push(stored.to_string());
        }
        names.sort();
        names.dedup();
        names.retain(|n| !n.is_empty());
        names
    };

    let mut steps = Vec::new();
    let mut arm_seq = 0u64;
    let mut elapsed_ms = 0u64;
    for raw in case["steps"].as_array().unwrap() {
        if let Some(step_world) = raw.get("world") {
            let before = lock(&world).cx().to_string();
            lock(&world).merge(step_world);
            let after = lock(&world).cx().to_string();
            if before != after {
                lay_out_crossover(&profile, &after);
                owned
                    .as_mut()
                    .expect("a deadline case does not change the world")
                    .crossover_locator = new_locator();
            }
        }
        if let Some(mac) = lock(&world).is_mac {
            let platform = if mac {
                gamelib_engine::ctx::Platform::Mac
            } else {
                gamelib_engine::ctx::Platform::Linux
            };
            match owned.as_mut() {
                Some(ctx) => ctx.platform = platform,
                None => assert_eq!(shared.as_ref().unwrap().platform, platform),
            }
        }
        let ctx: &EngineCtx = shared.as_deref().or(owned.as_ref()).unwrap();
        let from = lock(&trace).len();
        let mut outcome = Map::new();
        match raw["op"].as_str().unwrap() {
            "select" => {
                let args = SelectArgs {
                    runner: runner.clone(),
                    app_name: app_name.clone(),
                    title: title.clone(),
                    install_path: Some(expander.install.clone()),
                    platform: Some(spec["platform"].as_str().unwrap_or("windows").to_string()),
                    is_native: spec["native"].as_bool() == Some(true),
                    settings: stored_settings.clone(),
                    offline: raw["offline"].as_bool().unwrap_or(false),
                    purpose: match raw["purpose"].as_str() {
                        Some("setup") => Purpose::Setup,
                        _ => Purpose::Launch,
                    },
                };
                let reply = select_engine_for_launch(ctx, &deps, &args).await;
                outcome.insert("result".into(), summarise(&reply.to_value()));
                outcome.insert("launchLog".into(), json!(reply.log_lines));
            }
            "settings" => {
                let stored = expander.value(raw.get("stored").unwrap_or(&json!({})));
                let target: Option<String> = match raw.get("key") {
                    None => Some(key.clone()),
                    Some(Value::Null) => None,
                    Some(Value::String(word)) if word == "game" => Some(key.clone()),
                    Some(Value::String(other)) => Some(other.clone()),
                    Some(other) => panic!("a settings key of {other}"),
                };
                let out = ctx
                    .launch_settings
                    .get_launch_settings(ctx, target.as_deref(), &stored);
                outcome.insert("key".into(), json!(target));
                outcome.insert("sameObject".into(), json!(out == stored));
                outcome.insert("returned".into(), out);
                // The input is borrowed, so it cannot change; the TS compared its JSON before and after.
                outcome.insert("inputUnchanged".into(), json!(true));
            }
            "prime" => {
                let selection = if raw["selection"].as_str() == Some("pinned") {
                    pinned_selection(&profile)
                } else {
                    EngineSelection::Crossover {
                        reason: "cx-healthy".to_string(),
                        crossover_build: Some(BUILD.to_string()),
                        bin_dir: profile.root().join(BIN_REL).to_string_lossy().into_owned(),
                    }
                };
                let accepted =
                    ctx.registry
                        .set_engine_selection_quiet(ctx.log.as_deref(), &key, selection);
                if raw["prefix"].as_str() != Some("none") {
                    ctx.launch_settings.set_launch_overlay_context(
                        &key,
                        if raw["prefix"].as_str() == Some("plain") {
                            OverlayContext::plain()
                        } else {
                            OverlayContext::bottle(&per_game, None)
                        },
                    );
                }
                outcome.insert("accepted".into(), json!(accepted));
            }
            "overlay" => {
                match raw["action"].as_str() {
                    Some("set") => ctx.launch_settings.set_launch_overlay_context(
                        &key,
                        if raw["prefix"].as_str() == Some("plain") {
                            OverlayContext::plain()
                        } else {
                            OverlayContext::bottle(
                                &per_game,
                                raw["binDir"].as_str().map(|dir| expander.text(dir)),
                            )
                        },
                    ),
                    Some("clear") => ctx.launch_settings.clear_launch_overlay_context(&key),
                    _ => {}
                }
                outcome.insert(
                    "context".into(),
                    ctx.launch_settings
                        .get_launch_overlay_context(&key)
                        .map_or(Value::Null, |c| c.to_value()),
                );
            }
            "arm" => {
                arm_seq += 1;
                let items: Vec<Option<String>> = raw
                    .get("listing")
                    .and_then(Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .map(|item| match item {
                                Value::String(word) if word == "throw" => None,
                                Value::Array(lines) => Some(
                                    lines
                                        .iter()
                                        .map(|line| expander.text(line.as_str().unwrap()))
                                        .collect::<Vec<_>>()
                                        .join("\n"),
                                ),
                                other => panic!("a listing item of {other}"),
                            })
                            .collect()
                    })
                    .unwrap_or_else(|| vec![Some(String::new())]);
                *lock(&proc.listing) = Listing { items, polls: 0 };
                let game = DeadlineGame {
                    runner: runner.clone(),
                    app_name: app_name.clone(),
                    title: title.clone(),
                    install_path: expander.install.clone(),
                };
                let options = ArmOptions {
                    poll_ms: raw["pollMs"].as_u64(),
                    max_duration_ms: raw["maxDurationMs"].as_u64(),
                    start_watcher: raw["watcher"].as_str() != Some("none"),
                };
                let armed_key = (raw["nullKey"].as_bool() != Some(true)).then_some(key.as_str());
                let outcome_of_arm = arm_engine_launch_deadline(ctx, &game, armed_key, &options)
                    .expect("the deadline arms");
                if let ArmOutcome::Armed {
                    install_path,
                    bottle_dir,
                    ..
                } = outcome_of_arm
                {
                    // The oracle's `watch` entry: what the watch was asked to look for. `started` is the
                    // step's choice of a real watcher, not whether the path derived a form.
                    lock(&trace).push(json!({
                        "op": "watch",
                        "installPath": install_path,
                        "bottleDir": bottle_dir,
                        "started": raw["watcher"].as_str() != Some("none"),
                    }));
                }
                // The tasks start their timers when they first run.
                settle().await;
                outcome.insert("arm".into(), json!(arm_seq));
            }
            "advance" => {
                let ms = raw["ms"].as_u64().unwrap_or(0);
                let mut left = ms;
                while left > 0 {
                    let chunk = left.min(TICK_MS);
                    fixed.advance(chunk);
                    tokio::time::advance(Duration::from_millis(chunk)).await;
                    settle().await;
                    left -= chunk;
                }
                elapsed_ms += ms;
                outcome.insert("now".into(), json!(elapsed_ms));
            }
            "end" => {
                end_engine_launch(ctx, &key);
                outcome.insert("ended".into(), json!(true));
            }
            "registry-clear" => {
                ctx.registry.clear_engine_selection_quiet(&key);
                outcome.insert("cleared".into(), json!(true));
            }
            "quit" => {
                // The host quits: the token ends every task of the launch.
                ctx.shutdown.token().cancel();
                settle().await;
            }
            other => panic!("an unknown step {other}"),
        }
        let trace_now = lock(&trace).clone();
        let mut ledger = Map::new();
        for bottle in &ledger_bottles {
            let mut keys = ctx.ledger.games_running_in(bottle);
            keys.sort();
            ledger.insert(bottle.clone(), json!(keys));
        }
        let mut step = Map::new();
        step.insert("step".into(), raw.clone());
        step.extend(outcome);
        step.insert("trace".into(), Value::Array(comparable(&trace_now[from..])));
        step.insert(
            "after".into(),
            json!({
                "registry": ctx.registry.get_engine_selection(&key)
                    .map_or(Value::Null, |s| serde_json::to_value(s).unwrap()),
                "overlay": ctx.launch_settings.get_launch_overlay_context(&key)
                    .map_or(Value::Null, |c| c.to_value()),
                "ledger": ledger,
                "activeDeadlines": ctx.launch_state.active_deadlines(),
            }),
        );
        step.insert("eventsSoFar".into(), json!(lock(&events).len()));
        steps.push(map_strings(profile.normalise(Value::Object(step))));
    }

    let logs: Vec<Value> = log
        .lines()
        .into_iter()
        .filter(|(_, line)| !is_probe_noise(line))
        .map(|(level, line)| {
            json!({
                "level": match level { "warn" => "WARNING", "error" => "ERROR", _ => "INFO" },
                "prefix": "Backend",
                "message": line,
            })
        })
        .collect();
    let tree = Value::Array(
        profile
            .snapshot()
            .as_array()
            .unwrap()
            .iter()
            .filter(|entry| {
                let path = entry["path"].as_str().unwrap();
                !(path == "Applications" || path.starts_with("Applications/") || path == "tmp")
            })
            .cloned()
            .collect(),
    );
    let stray_spawns = lock(&proc.stray).clone();
    let events_now = lock(&events).clone();
    Replay {
        steps,
        events: events_now
            .into_iter()
            .map(|e| map_strings(profile.normalise(e)))
            .collect(),
        logs: logs
            .into_iter()
            .map(|e| map_strings(profile.normalise(e)))
            .collect(),
        tree,
        stray_spawns,
    }
}

/// The line the engine's own probe writes per spawn, which the oracle's scripted probe never produced.
fn is_probe_noise(line: &str) -> bool {
    line.starts_with("Engine: demo-status probe")
}

/// A reply as the oracle's `summarise`: kind, key, selection and prefix.
fn summarise(reply: &Value) -> Value {
    let mut out = Map::new();
    for key in ["kind", "key", "selection", "prefix"] {
        if let Some(value) = reply.get(key) {
            out.insert(key.to_string(), value.clone());
        }
    }
    Value::Object(out)
}

fn pinned_selection(profile: &Profile) -> EngineSelection {
    let pin = &pins().unwrap().current;
    let engines = profile.tools.join("steam-engines");
    let bin = engines.join(&pin.id).join("Contents/Resources/wine/bin");
    EngineSelection::Pinned {
        pin_id: pin.id.clone(),
        reason: "cx-missing".to_string(),
        engine: gamelib_engine::engines::NonCrossoverEngine {
            wine_bin: bin.join("wine").to_string_lossy().into_owned(),
            wineserver_bin: bin.join("wineserver").to_string_lossy().into_owned(),
            label: pin.label.clone(),
            version: pin.wine.version.clone(),
            dxvk: Some(gamelib_engine::engines::DxvkBuild {
                dir: engines
                    .join(format!("dxvk-macOS-{}", pin.dxvk.version))
                    .to_string_lossy()
                    .into_owned(),
                version: pin.dxvk.version.clone(),
            }),
        },
    }
}

/// The golden step with the fields the replay compares.
fn golden_step(step: &Value) -> Value {
    let quit = step["step"]["op"] == "quit";
    let mut out = Map::new();
    for (key, value) in step.as_object().unwrap() {
        match key.as_str() {
            // The TS left the entry and three timers pending after a quit; Rust ends the task and the
            // entry (the header; `a_quit_with_a_deadline_armed_...` asserts that).
            "activeDeadlines" | "pendingTimers" | "keepAliveReasons" if quit => {}
            "after" if quit => {
                let mut after = value.clone();
                after["activeDeadlines"] = json!(0);
                out.insert(key.clone(), after);
            }
            "trace" => {
                out.insert(
                    key.clone(),
                    Value::Array(comparable(value.as_array().unwrap())),
                );
            }
            "launchLog" if step["step"]["op"] != "select" => {}
            _ => {
                out.insert(key.clone(), value.clone());
            }
        }
    }
    Value::Object(out)
}

fn golden_logs(logs: &Value) -> Vec<Value> {
    logs.as_array()
        .unwrap()
        .iter()
        .filter(|entry| {
            let message = entry["message"].as_str().unwrap();
            COMPARE_UI || !message.starts_with("[engine-notice]")
        })
        .cloned()
        .collect()
}

/// Replays every case that has (or has not) a deadline step against its golden and answers how many it
/// replayed. A difference fails the test with every case's first difference named.
async fn replay_against_goldens(deadline: bool) -> usize {
    let all = cases();
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    assert_eq!(
        all.len() as u64,
        manifest["count"].as_u64().unwrap(),
        "the manifest counts the cases"
    );
    check_floor("launch goldens", all.len(), CASE_FLOOR).unwrap();

    let mut replayed = 0;
    let mut failures = Vec::new();
    for case in &all {
        if is_deadline_case(case) != deadline {
            continue;
        }
        let id = id_of(case);
        let expected_dir = golden_dir().join("expected").join(id);
        let golden = read_json(&expected_dir.join("result.json"));
        let outcome = replay(case).await;
        replayed += 1;

        let want_steps: Vec<Value> = golden["steps"]
            .as_array()
            .unwrap()
            .iter()
            .map(golden_step)
            .collect();
        for (index, (want, got)) in want_steps.iter().zip(&outcome.steps).enumerate() {
            if want != got {
                failures.push(format!(
                    "{id}: step {index} differs\n  golden: {want}\n  replay: {got}"
                ));
            }
        }
        if want_steps.len() != outcome.steps.len() {
            failures.push(format!("{id}: the step count differs"));
        }
        let want_logs = golden_logs(&golden["logs"]);
        let got_logs: Vec<Value> = outcome
            .logs
            .iter()
            .filter(|entry| {
                COMPARE_UI
                    || !entry["message"]
                        .as_str()
                        .unwrap()
                        .starts_with("[engine-notice]")
            })
            .cloned()
            .collect();
        if want_logs != got_logs {
            failures.push(format!(
                "{id}: the engine log differs\n  golden: {}\n  replay: {}",
                Value::Array(want_logs),
                Value::Array(got_logs)
            ));
        }
        let want_events = read_json(&expected_dir.join("events.json"));
        if want_events != Value::Array(outcome.events.clone()) {
            failures.push(format!(
                "{id}: the engineStateChanged pushes differ\n  golden: {want_events}\n  replay: {}",
                Value::Array(outcome.events.clone())
            ));
        }
        let want_tree = read_json(&expected_dir.join("tree.json"));
        if want_tree != outcome.tree {
            failures.push(format!(
                "{id}: the profile tree differs: {}",
                first_difference(&want_tree, &outcome.tree)
            ));
        }
        if !outcome.stray_spawns.is_empty() {
            failures.push(format!("{id}: stray spawns {:?}", outcome.stray_spawns));
        }
    }
    assert!(
        failures.is_empty(),
        "{} of {replayed} launch goldens differ:\n{}",
        failures.len(),
        failures.join("\n")
    );
    replayed
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn every_launch_golden_without_a_deadline_replays() {
    let replayed = replay_against_goldens(false).await;
    check_floor("replayed launch goldens", replayed, REPLAYED_FLOOR).unwrap();
}

/// The deadline cases run on a paused clock (the 180 s deadline and the 1.5 s polls are driven, not slept).
#[tokio::test(start_paused = true)]
async fn every_deadline_golden_replays() {
    let replayed = replay_against_goldens(true).await;
    check_floor("replayed deadline goldens", replayed, DEADLINE_FLOOR).unwrap();
}

#[test]
fn every_case_of_the_manifest_has_a_replay() {
    let all = cases();
    let deadline = all.iter().filter(|case| is_deadline_case(case)).count();
    // Both lists have a floor, and together they are the manifest: no case is left to a later plan.
    check_floor("deadline cases", deadline, DEADLINE_FLOOR).unwrap();
    check_floor(
        "cases without a deadline",
        all.len() - deadline,
        REPLAYED_FLOOR,
    )
    .unwrap();
    assert!(all.iter().all(
        |case| !["use-crossover-healthy", "skip-native", "legacy-override"].contains(&id_of(case))
            || !is_deadline_case(case)
    ));
    let ops: BTreeMap<&str, usize> = all
        .iter()
        .flat_map(|case| case["steps"].as_array().unwrap())
        .fold(BTreeMap::new(), |mut acc, step| {
            *acc.entry(step["op"].as_str().unwrap()).or_default() += 1;
            acc
        });
    for op in [
        "select",
        "settings",
        "overlay",
        "prime",
        "arm",
        "advance",
        "end",
        "quit",
        "registry-clear",
    ] {
        assert!(ops.contains_key(op), "{op}");
    }
    // Every step the cases use is one the replay knows.
    for op in ops.keys() {
        assert!(
            [
                "select",
                "settings",
                "overlay",
                "prime",
                "arm",
                "advance",
                "end",
                "quit",
                "registry-clear"
            ]
            .contains(op),
            "{op}"
        );
    }
}

#[test]
fn an_empty_case_list_fails_the_floor() {
    assert!(check_floor("launch goldens", 0, CASE_FLOOR).is_err());
    assert!(check_floor("launch goldens", CASE_FLOOR - 1, CASE_FLOOR).is_err());
}

/// The ops of every compared trace entry of a case's steps, in order.
async fn ops_of(id: &str) -> Vec<String> {
    let all = cases();
    let case = all.iter().find(|c| id_of(c) == id).unwrap();
    replay(case)
        .await
        .steps
        .iter()
        .flat_map(|step| step["trace"].as_array().unwrap().clone())
        .map(|entry| entry["op"].as_str().unwrap().to_string())
        .collect()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_fallback_toast_is_a_notification_and_never_raises_the_window() {
    for id in [
        "fallback-cx-missing-pin-installed",
        "fallback-cx-expired-pin-installed",
        "fallback-cx-broken-pin-installed",
    ] {
        let ops = ops_of(id).await;
        assert_eq!(ops.iter().filter(|op| *op == "notify").count(), 1, "{id}");
        for raise in [
            "raiseMainWindow",
            "raiseMainWindowForInAppDialog",
            "sendFrontendMessage",
        ] {
            assert!(!ops.iter().any(|op| op == raise), "{id}: {raise}");
        }
    }
    // A setup run and an inconclusive probe say nothing at all.
    for id in [
        "fallback-setup-purpose-no-toast",
        "inconclusive-keeps-pinned-marker",
    ] {
        assert!(!ops_of(id).await.iter().any(|op| op == "notify"), "{id}");
    }
}

/// A deadline that passes with no process seen shows its notice and nothing else: one notification, no
/// window raise, no in-app dialog (the acknowledgement tracking and the dialog frame are the dialog's).
#[tokio::test(start_paused = true)]
async fn a_deadline_that_fires_notifies_once_and_never_raises_the_window() {
    for id in [
        "deadline-fires-no-match-no-raise",
        "deadline-basename-only-fires",
        "deadline-sibling-dir-fires",
    ] {
        let ops = ops_of(id).await;
        assert_eq!(ops.iter().filter(|op| *op == "notify").count(), 1, "{id}");
        for raise in [
            "raiseMainWindow",
            "raiseMainWindowForInAppDialog",
            "trackAck",
            "sendFrontendMessage",
        ] {
            assert!(!ops.iter().any(|op| op == raise), "{id}: {raise}");
        }
    }
    // A deadline that was cancelled, stood down or never armed says nothing at all.
    for id in [
        "deadline-cancel-first-match-unix",
        "deadline-cancel-by-end-launch",
        "deadline-cancel-by-giveup-listing-failures",
        "deadline-stands-down-without-watcher",
        "deadline-quit-with-deadline-armed",
        "deadline-plain-prefix-not-armed",
    ] {
        assert!(!ops_of(id).await.iter().any(|op| op == "notify"), "{id}");
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_refused_attempt_raises_the_window_and_shows_a_dialog_every_time() {
    let ops = ops_of("refused-twice-two-dialogs").await;
    for (op, want) in [
        ("notify", 2),
        ("raiseMainWindow", 2),
        ("trackAck", 2),
        ("sendFrontendMessage", 2),
    ] {
        assert_eq!(ops.iter().filter(|o| *o == op).count(), want, "{op}");
    }
}

/// The production switch dep (`CtxStepDeps::prepare`): a restore to CrossOver whose DXVK source is the pinned
/// engine, which is not installed, answers `dxvk-failed` before it stops or writes anything. The dep asks for
/// the pin and asks the switch once more (the TS `prepareBottle`'s second half); with the context offline
/// the download is refused, so the second answer is the same refusal and the bottle is untouched.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_restore_without_a_dxvk_source_asks_for_the_pin_and_asks_the_switch_again() {
    let profile = Profile::new();
    profile.build_bottle("fx-pinned-current");
    let log = Arc::new(RecordingLog::new());
    let emitter = Arc::new(gamelib_engine::testing::RecordingEmitter::new());
    let mut ctx = profile.ctx(log.clone());
    ctx.emitter = emitter.clone();
    let bin_dir = profile.root().join(BIN_REL).to_string_lossy().into_owned();
    let next = EngineSelection::Crossover {
        reason: "cx-healthy".to_string(),
        crossover_build: Some(BUILD.to_string()),
        bin_dir,
    };
    let marker_before = profile.marker_bytes();
    let args = PrepareArgs::new("legendary:Quail", "fx-pinned-current", next);
    let game = GameRef {
        runner: "legendary",
        app_name: "Quail",
    };
    let result = CtxStepDeps.prepare(&ctx, args, &game).await;
    match &result.outcome {
        PrepareOutcome::Refused { reason, detail } => {
            assert_eq!(*reason, PrepareReason::DxvkFailed);
            assert!(detail.starts_with("no DXVK source to restore"), "{detail}");
        }
        other => panic!("expected a refusal, got {other:?}"),
    }
    assert_eq!(profile.marker_bytes(), marker_before, "nothing was written");
    // The refused download of the pin closes its status once (`done`); that push is the proof the dep asked.
    let pushes = emitter.pushed();
    assert_eq!(pushes.len(), 1, "{pushes:?}");
    assert_eq!(pushes[0].0, "gameStatusUpdate");
    assert_eq!(pushes[0].1[0]["status"], "done");
    assert_eq!(pushes[0].1[0]["appName"], "Quail");
}
