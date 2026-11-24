//! F1 of the 87-59 live gate, reproduced at the dispatch layer (87-63): with the app offline, the pinned
//! engine absent, CrossOver missing and the engine on Automatic, a non-Steam launch of a game with its own
//! bottle must be refused before the decision with the download-failed dialog whose reason is `offline`, and
//! must not start a fetch.
//!
//! Every case drives op `engine_launch_select` through `gamelib_engine::dispatch` with the JSON `launcher.ts`
//! builds for the 87-59 game (Trash Goblin, Epic): the stored `wineVersion` is a `wine` named `Default Wine -
//! Not Found`, `wineCrossoverBottle` is the game's per-game bottle, `winePrefix` the shared default prefix and
//! the engine override `automatic`. The effective engine is read from the stored game config on disk (that is
//! where the real step reads it), the bottle is a real fixture bottle under a fake HOME, CrossOver is absent
//! from every place the locator reads, every spawn goes through a scripted runner and the network is a
//! scripted [`Fetch`] that counts its requests.
//!
//! The main case plus one case per hypothesis of the plan (H2 to H5), each named for it so that whichever is
//! red at HEAD discriminates the cause:
//! - H2 the gate's `is_crossover_missing` and the decision's pre-flight disagree about a CrossOver-shaped
//!   wine outside `/Applications` (a re-signed clone found by discovery);
//! - H3 `current_pin_installed` reads true while the current pin is not installed;
//! - H4 the effective engine id at the gate is neither `automatic` nor `crossover` for the game's settings;
//! - H5 a path reaches the first-need download without passing the gate (the first-need bottle, a `setup`
//!   call, a second select for the same Play).
//!
//! H1 (the request's `offline` arrives false) is the TS test's (`launcher.engineStep.test.ts`); here
//! `offline: true` in the JSON must reach `SelectArgs.offline`. POSIX only, like the other engine goldens: the
//! fake profile lays CrossOver, bottles and engines out as real files and the golden fixtures are mode-exact.
#![cfg(unix)]

mod common;

use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::process::BoxFuture;
use gamelib_engine::crossover::locate::{CrossoverDiscovery, CrossoverLocator};
use gamelib_engine::ctx::EngineCtx;
use gamelib_engine::dispatch;
use gamelib_engine::fetch::{
    DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Progress,
};
use gamelib_engine::game_engine::per_game_bottle_name;
use gamelib_engine::testing::{RecordingLog, RecordingUi, ScriptedSpecRunner, UiEvent};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use common::Profile;

const RUNNER: &str = "legendary";
/// Trash Goblin's Epic app name (the 87-59 game).
const APP: &str = "54f7949350c949c6a2c47f12e7b15636";
const TITLE: &str = "Trash Goblin";
const OFFLINE_WARNING: &str = "launch blocked before pre-flight while offline (crossover-missing)";

/// A network that is never reached: every request is counted and answers as a dead connection (the HEAD of
/// a download is `failed-to-get-headers`, the live dialog's text).
#[derive(Default)]
struct CountingFetch {
    requests: AtomicUsize,
}

impl CountingFetch {
    fn count(&self) -> usize {
        self.requests.load(Ordering::SeqCst)
    }
}

impl Fetch for CountingFetch {
    fn get(&self, _req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        self.requests.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Err(FetchError::Network) })
    }

    fn download<'a>(
        &'a self,
        _req: FetchRequest,
        _dest: &'a Path,
        _progress: &'a (dyn Fn(Progress) + Send + Sync),
        _cancel: CancellationToken,
    ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
        self.requests.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Err(FetchError::FailedToGetHeaders) })
    }
}

/// A CrossOver search that answers the wine binaries it was given (a re-signed clone Spotlight reports).
struct Found(Vec<String>);

impl CrossoverDiscovery for Found {
    fn discover(&self) -> BoxFuture<Vec<String>> {
        let bins = self.0.clone();
        Box::pin(async move { bins })
    }
}

/// What the world around the step looks like in a case.
struct World {
    /// The game's own bottle exists (a fixture bottle with a crossover marker).
    bottle: bool,
    /// The stored game config's `engineOverride` (`None`: the key is absent).
    engine_override: Option<&'static str>,
    /// What the monitor's last word to Rust was (`engine_set_online`).
    ctx_online: bool,
    /// Wine binaries the CrossOver discovery reports.
    discovered: Vec<String>,
}

impl World {
    fn offline_no_pin_no_crossover() -> World {
        World {
            bottle: true,
            engine_override: Some("automatic"),
            ctx_online: false,
            discovered: Vec::new(),
        }
    }
}

struct Rig {
    profile: Profile,
    ctx: EngineCtx,
    log: Arc<RecordingLog>,
    ui: Arc<RecordingUi>,
    fetch: Arc<CountingFetch>,
    runner: Arc<ScriptedSpecRunner>,
}

/// An emitter nobody listens to: the status pushes of a download are not what these cases read.
struct Silent;

impl FrontendEmitter for Silent {
    fn emit(&self, _channel: &str, _args: Vec<Value>) {}
}

fn rig(world: &World) -> Rig {
    let profile = Profile::new();
    let bottle = per_game_bottle_name(RUNNER, APP).expect("a clean per-game bottle name");
    if world.bottle {
        profile.build_bottle_as("fx-crossover-marker", &bottle);
    }
    // The game's stored config: where the real step reads the engine override from.
    let mut stored = json!({
        "wineVersion": {"type": "wine", "name": "Default Wine - Not Found", "bin": ""},
        "wineCrossoverBottle": bottle,
        "winePrefix": profile.root().join("Games/GameLib/Prefixes/shared").to_string_lossy(),
    });
    if let Some(id) = world.engine_override {
        stored["engineOverride"] = json!(id);
    }
    let config = profile.app_folder.join("GamesConfig");
    std::fs::create_dir_all(&config).unwrap();
    std::fs::write(
        config.join(format!("{APP}.json")),
        serde_json::to_vec(&json!({ APP: stored })).unwrap(),
    )
    .unwrap();
    // The pinned-engine directory exists and is empty: the pin was moved aside.
    std::fs::create_dir_all(profile.tools.join("steam-engines")).unwrap();
    std::fs::create_dir_all(profile.root().join("tmp")).unwrap();

    let base_env: Vec<(String, String)> = profile
        .home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect();
    let runner = Arc::new(ScriptedSpecRunner::new(base_env));
    let log = Arc::new(RecordingLog::new());
    let ui = Arc::new(RecordingUi::new());
    let fetch = Arc::new(CountingFetch::default());

    let mut ctx = profile.ctx_with(log.clone(), Some(runner.clone()));
    ctx.fetch = fetch.clone();
    ctx.ui = Some(ui.clone());
    ctx.emitter = Arc::new(Silent);
    ctx.crossover_locator = CrossoverLocator::with_system_applications(
        profile
            .root()
            .join("no-system-applications")
            .to_string_lossy()
            .into_owned(),
    );
    ctx.crossover_discovery = Arc::new(Found(world.discovered.clone()));
    ctx.set_online(world.ctx_online);
    Rig {
        profile,
        ctx,
        log,
        ui,
        fetch,
        runner,
    }
}

/// The request `launcher.ts` sends for the 87-59 game's settings (the settings are the stored ones).
fn request(rig: &Rig, offline: bool, purpose: Option<&str>) -> Value {
    let bottle = per_game_bottle_name(RUNNER, APP).unwrap();
    let mut request = json!({
        "runner": RUNNER,
        "appName": APP,
        "title": TITLE,
        "installPath": rig.profile.root().join("Games/Trash Goblin").to_string_lossy(),
        "platform": "Windows",
        "isNative": false,
        "settings": {
            "wineVersion": {"type": "wine", "name": "Default Wine - Not Found", "bin": ""},
            "wineCrossoverBottle": bottle,
            "winePrefix": rig.profile.root().join("Games/GameLib/Prefixes/shared").to_string_lossy(),
            "engineOverride": "automatic",
        },
        "offline": offline,
    });
    if let Some(purpose) = purpose {
        request["purpose"] = json!(purpose);
    }
    request
}

async fn select(rig: &Rig, request: Value) -> Value {
    dispatch("engine_launch_select", &[request], &rig.ctx)
        .await
        .expect("the step answers")
}

fn dialogs(rig: &Rig) -> Vec<String> {
    rig.ui
        .events()
        .into_iter()
        .filter_map(|event| match event {
            UiEvent::ShowDialog { body, .. } => Some(body),
            _ => None,
        })
        .collect()
}

fn warnings(rig: &Rig) -> Vec<String> {
    rig.log
        .lines()
        .into_iter()
        .filter(|(level, _)| *level == "warn")
        .map(|(_, line)| line)
        .collect()
}

/// The refusal the live gate expected: kind `refused`, one dialog reading `(offline)`, the gate's own
/// warning, and no request on the network.
fn assert_refused_offline_before_any_fetch(rig: &Rig, reply: &Value) {
    assert_eq!(reply["kind"], "refused", "reply: {reply}");
    let shown = dialogs(rig);
    assert_eq!(shown.len(), 1, "dialogs: {shown:?}");
    assert!(
        shown[0].contains("couldn't download its built-in engine (offline)"),
        "the dialog must give the reason `offline`: {}",
        shown[0]
    );
    assert!(
        warnings(rig).iter().any(|w| w.ends_with(OFFLINE_WARNING)),
        "the gate's warning is missing: {:?}",
        rig.log.lines()
    );
    assert_eq!(
        rig.fetch.count(),
        0,
        "an offline refusal must not start a fetch"
    );
}

/// The shape a launch must keep: no fetch was made and no engine registered for the key.
fn assert_no_fetch_and_nothing_registered(rig: &Rig) {
    assert_eq!(rig.fetch.count(), 0, "no fetch may start");
    assert!(
        rig.runner.unscripted().is_empty(),
        "no spawn the case did not script: {:?}",
        rig.runner.unscripted()
    );
}

#[tokio::test]
async fn the_live_request_offline_with_no_pin_and_no_crossover_is_refused_before_any_fetch() {
    let rig = rig(&World::offline_no_pin_no_crossover());
    let reply = select(&rig, request(&rig, true, None)).await;
    assert_refused_offline_before_any_fetch(&rig, &reply);
    assert_no_fetch_and_nothing_registered(&rig);
}

#[tokio::test]
async fn the_request_offline_flag_reaches_the_gate_even_when_the_context_says_online() {
    // The TS caller's answer and the context's flag come from one monitor, but the gate must not need the
    // flag: `offline: true` in the request alone refuses before the download that the flag would allow.
    let rig = rig(&World {
        ctx_online: true,
        ..World::offline_no_pin_no_crossover()
    });
    let reply = select(&rig, request(&rig, true, None)).await;
    assert_refused_offline_before_any_fetch(&rig, &reply);
}

#[tokio::test]
async fn a_request_that_says_online_on_a_context_that_says_offline_still_starts_no_fetch() {
    // The two signals disagree the other way: the request claims online, the context knows better. The
    // gate does not fire (the request is the TS answer) but the download itself must not reach the network.
    let rig = rig(&World::offline_no_pin_no_crossover());
    let reply = select(&rig, request(&rig, false, None)).await;
    assert_eq!(reply["kind"], "refused", "reply: {reply}");
    assert_eq!(
        rig.fetch.count(),
        0,
        "a context that is offline must not fetch"
    );
}

#[tokio::test]
async fn h2_a_crossover_clone_outside_applications_without_wine_is_missing_for_the_gate_as_for_the_decision(
) {
    // A re-signed clone Spotlight finds: `cxbottle` is there, `bin/wine` is not. The decision calls that
    // `CrossOver bin/wine is missing`; the gate must read the same verdict.
    let world = World::offline_no_pin_no_crossover();
    let rig_ = rig(&World {
        discovered: Vec::new(),
        ..world
    });
    let clone_bin = rig_
        .profile
        .root()
        .join("Library/Clone.app/Contents/SharedSupport/CrossOver/bin");
    std::fs::create_dir_all(&clone_bin).unwrap();
    std::fs::write(clone_bin.join("cxbottle"), b"").unwrap();
    let wine = format!("{}/wine", clone_bin.to_string_lossy());
    let mut rig = rig_;
    rig.ctx.crossover_discovery = Arc::new(Found(vec![wine]));
    let reply = select(&rig, request(&rig, true, None)).await;
    assert_refused_offline_before_any_fetch(&rig, &reply);
}

#[tokio::test]
async fn h2_a_stale_locator_memo_does_not_make_a_missing_crossover_present() {
    // The memo kept a bin dir that has since gone away (the bundle was moved aside): both reads must go
    // back to the disk and call CrossOver missing.
    let rig_ = rig(&World::offline_no_pin_no_crossover());
    let gone = rig_
        .profile
        .root()
        .join("Library/Gone.app/Contents/SharedSupport/CrossOver/bin");
    std::fs::create_dir_all(&gone).unwrap();
    std::fs::write(gone.join("cxbottle"), b"").unwrap();
    std::fs::write(gone.join("wine"), b"#!/bin/sh\n").unwrap();
    let mut rig = rig_;
    rig.ctx.crossover_discovery = Arc::new(Found(vec![format!("{}/wine", gone.to_string_lossy())]));
    // The first resolve memoises the clone ...
    let home = rig.ctx.paths.user_home.to_string_lossy().into_owned();
    assert!(rig
        .ctx
        .crossover_locator
        .resolve_bin_dir(&rig.ctx, &[])
        .await
        .is_some());
    assert!(rig
        .ctx
        .crossover_locator
        .resolve_bin_dir_sync(&home, &[])
        .is_some());
    // ... then it is moved aside.
    std::fs::remove_dir_all(rig.profile.root().join("Library/Gone.app")).unwrap();
    rig.ctx.crossover_discovery = Arc::new(Found(Vec::new()));
    let reply = select(&rig, request(&rig, true, None)).await;
    assert_refused_offline_before_any_fetch(&rig, &reply);
}

#[tokio::test]
async fn h3_a_previous_pin_installed_does_not_stand_in_for_the_current_pin() {
    // Another pin's directory on disk is not the current pin: the gate reads the current pin only.
    let rig = rig(&World::offline_no_pin_no_crossover());
    let table = gamelib_engine::pins::pins().expect("the pin table parses");
    let root = rig.profile.tools.join("steam-engines");
    // A directory named for a retired pin (any name that is not the current pin's id).
    std::fs::create_dir_all(root.join("wine-staging-0.0-retired/Contents/Resources/wine/bin"))
        .unwrap();
    assert_ne!(table.current.id, "wine-staging-0.0-retired");
    let reply = select(&rig, request(&rig, true, None)).await;
    assert_refused_offline_before_any_fetch(&rig, &reply);
}

#[tokio::test]
async fn h3_a_half_installed_current_pin_is_not_installed() {
    // The Wine half of the current pin on disk without its DXVK half (and without the pin's marker) is not
    // an installed engine: the gate must still refuse.
    let rig = rig(&World::offline_no_pin_no_crossover());
    let table = gamelib_engine::pins::pins().expect("the pin table parses");
    let paths = gamelib_engine::engines::pinned_engine_paths(&rig.ctx, &table.current);
    let wine_bin = Path::new(&paths.wine_bin);
    std::fs::create_dir_all(wine_bin.parent().unwrap()).unwrap();
    std::fs::write(wine_bin, b"").unwrap();
    std::fs::write(&paths.wineserver_bin, b"").unwrap();
    let reply = select(&rig, request(&rig, true, None)).await;
    assert_refused_offline_before_any_fetch(&rig, &reply);
}

#[tokio::test]
async fn h4_the_effective_engine_with_no_stored_override_but_a_crossover_wine_is_automatic() {
    // No `engineOverride` stored and a `crossover` wineVersion: derived automatic, so the gate applies. The
    // stored config here is that shape; the request's settings stay the 87-59 ones.
    let rig = rig(&World {
        engine_override: None,
        ..World::offline_no_pin_no_crossover()
    });
    let config = rig
        .profile
        .app_folder
        .join("GamesConfig")
        .join(format!("{APP}.json"));
    let bottle = per_game_bottle_name(RUNNER, APP).unwrap();
    std::fs::write(
        &config,
        serde_json::to_vec(&json!({ APP: {
            "wineVersion": {"type": "crossover", "name": "CrossOver", "bin": ""},
            "wineCrossoverBottle": bottle,
        }}))
        .unwrap(),
    )
    .unwrap();
    let reply = select(&rig, request(&rig, true, None)).await;
    assert_refused_offline_before_any_fetch(&rig, &reply);
}

#[tokio::test]
async fn h4_a_forced_crossover_override_with_crossover_missing_starts_no_fetch() {
    // Override `crossover` is not the gate's arm (it needs a pin only under automatic), but nothing may
    // reach the network either: the decision answers `unavailable`.
    let rig = rig(&World {
        engine_override: Some("crossover"),
        ..World::offline_no_pin_no_crossover()
    });
    let reply = select(&rig, request(&rig, true, None)).await;
    assert_eq!(reply["kind"], "refused", "reply: {reply}");
    assert_eq!(rig.fetch.count(), 0);
}

#[tokio::test]
async fn h5_a_missing_game_bottle_offline_starts_no_fetch() {
    // The first-need bottle step runs before the gate. With no bottle, no pin and no CrossOver, creating the
    // bottle would want the pin: offline, that must refuse without a fetch.
    let rig = rig(&World {
        bottle: false,
        ..World::offline_no_pin_no_crossover()
    });
    let reply = select(&rig, request(&rig, true, None)).await;
    assert_eq!(reply["kind"], "refused", "reply: {reply}");
    assert_eq!(
        rig.fetch.count(),
        0,
        "creating the bottle must not fetch while offline"
    );
}

#[tokio::test]
async fn h5_a_setup_call_offline_is_refused_before_any_fetch() {
    let rig = rig(&World::offline_no_pin_no_crossover());
    let reply = select(&rig, request(&rig, true, Some("setup"))).await;
    assert_refused_offline_before_any_fetch(&rig, &reply);
}

#[tokio::test]
async fn h5_a_second_select_for_the_same_play_is_refused_the_same_way() {
    let rig = rig(&World::offline_no_pin_no_crossover());
    let first = select(&rig, request(&rig, true, None)).await;
    assert_eq!(first["kind"], "refused", "first: {first}");
    let second = select(&rig, request(&rig, true, None)).await;
    assert_eq!(second["kind"], "refused", "second: {second}");
    assert_eq!(rig.fetch.count(), 0);
    assert_eq!(
        dialogs(&rig).len(),
        2,
        "every refused press shows its dialog"
    );
}

/// The lines the step wrote about the gate's inputs (87-63): words and booleans only, never a path.
fn gate_lines(rig: &Rig) -> Vec<String> {
    rig.log
        .lines()
        .into_iter()
        .map(|(_, line)| line)
        .filter(|line| line.contains("offline gate:"))
        .collect()
}

#[tokio::test]
async fn the_gate_writes_its_inputs_and_verdict_when_it_refuses() {
    // The 87-59 gate could not say why the step did not refuse: the gate wrote a line only when it fired, so a
    // launch it let through left nothing to read. Its inputs and verdict are now one line either way.
    let rig = rig(&World::offline_no_pin_no_crossover());
    let reply = select(&rig, request(&rig, true, None)).await;
    assert_eq!(reply["kind"], "refused", "reply: {reply}");
    let lines = gate_lines(&rig);
    assert_eq!(lines.len(), 1, "gate lines: {lines:?}");
    assert!(
        lines[0].ends_with(
            "offline gate: request-offline=true context-online=false on-bottle=true override=automatic crossover-missing=true current-pin-installed=false marker=crossover restore-needs-pin=false verdict=blocked:crossover-missing"
        ),
        "{}",
        lines[0]
    );
}

#[tokio::test]
async fn the_gate_says_so_when_it_is_not_applicable_to_an_offline_request() {
    // An override the gate does not cover (a pinned engine) is let through: the line names why.
    let rig = rig(&World {
        engine_override: Some("pinned:wine-staging-11.20"),
        ..World::offline_no_pin_no_crossover()
    });
    let _ = select(&rig, request(&rig, true, None)).await;
    let lines = gate_lines(&rig);
    assert_eq!(lines.len(), 1, "gate lines: {lines:?}");
    assert!(
        lines[0].ends_with(
            "offline gate: request-offline=true context-online=false on-bottle=true override=pinned:wine-staging-11.20 verdict=not-applicable"
        ),
        "{}",
        lines[0]
    );
}

#[tokio::test]
async fn the_gate_names_a_disagreement_between_the_request_and_the_context() {
    // The request says online while the context knows the app is offline: the gate does not fire, and the
    // line is what shows the two signals apart.
    let rig = rig(&World::offline_no_pin_no_crossover());
    let _ = select(&rig, request(&rig, false, None)).await;
    let lines = gate_lines(&rig);
    assert_eq!(lines.len(), 1, "gate lines: {lines:?}");
    assert!(
        lines[0].contains("request-offline=false context-online=false")
            && lines[0].ends_with("verdict=not-applicable"),
        "{}",
        lines[0]
    );
}

#[tokio::test]
async fn an_online_launch_writes_no_gate_line() {
    let rig = rig(&World {
        ctx_online: true,
        ..World::offline_no_pin_no_crossover()
    });
    let _ = select(&rig, request(&rig, false, None)).await;
    assert!(gate_lines(&rig).is_empty(), "{:?}", gate_lines(&rig));
}

#[tokio::test]
async fn the_gate_line_carries_no_path_from_the_profile() {
    let rig = rig(&World::offline_no_pin_no_crossover());
    let _ = select(&rig, request(&rig, true, None)).await;
    let home = rig.profile.root().to_string_lossy().into_owned();
    for line in gate_lines(&rig) {
        assert!(!line.contains(&home), "{line}");
    }
}
