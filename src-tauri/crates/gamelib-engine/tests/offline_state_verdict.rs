//! 87-76 (RF5): the engine state the game page reads carries `offlineLaunchRefused`, a read-time verdict that
//! says whether an offline launch of the game would be refused by the launch step's offline gate right now.
//! The step and the state take the gate's inputs from the one function, so this file pins that they cannot
//! drift: over the gate's matrix, `engine_state_get`'s field is true exactly when `engine_launch_select` with
//! `offline: true` refuses with the gate's own warning.
//!
//! Each case builds two identical fake profiles (the state read and the select must not see each other's
//! caches): the 87-59 game (Trash Goblin, Epic) with its stored `wineCrossoverBottle`, a fixture bottle with
//! the case's marker, CrossOver missing or healthy (a clone bundle the discovery reports), and the pinned
//! engine installed or absent. POSIX only, like the other engine goldens.
#![cfg(unix)]

mod common;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use gamelib_core::process::BoxFuture;
use gamelib_engine::crossover::locate::{CrossoverDiscovery, CrossoverLocator};
use gamelib_engine::ctx::EngineCtx;
use gamelib_engine::dispatch;
use gamelib_engine::fetch::{
    DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Progress,
};
use gamelib_engine::game_engine::per_game_bottle_name;
use gamelib_engine::testing::{RecordingEmitter, RecordingLog, RecordingUi, ScriptedSpecRunner};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use common::Profile;

const RUNNER: &str = "legendary";
const APP: &str = "54f7949350c949c6a2c47f12e7b15636";
const TITLE: &str = "Trash Goblin";
const REFUSAL_WARNING: &str = "launch blocked before pre-flight while offline (";

/// A network that is never reached: every request is counted and answers as a dead connection.
#[derive(Default)]
struct DeadFetch {
    requests: AtomicUsize,
}

impl Fetch for DeadFetch {
    fn get(&self, _req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        self.requests.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Err(FetchError::Network) })
    }

    fn download<'a>(
        &'a self,
        _req: FetchRequest,
        _dest: &'a std::path::Path,
        _progress: &'a (dyn Fn(Progress) + Send + Sync),
        _cancel: CancellationToken,
    ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
        self.requests.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Err(FetchError::FailedToGetHeaders) })
    }
}

struct Found(Vec<String>);

impl CrossoverDiscovery for Found {
    fn discover(&self) -> BoxFuture<Vec<String>> {
        let bins = self.0.clone();
        Box::pin(async move { bins })
    }
}

/// One point of the gate's matrix.
#[derive(Clone)]
struct World {
    /// CrossOver is installed (a clone bundle with `cxbottle` and `wine`).
    crossover_healthy: bool,
    /// The current pin is installed under the tools path.
    pin_installed: bool,
    /// The fixture bottle laid down as the game's own bottle (`None`: no bottle on disk).
    bottle_fixture: Option<&'static str>,
    /// The stored `engineOverride`.
    engine_override: &'static str,
    /// The game's stored settings name its per-game bottle (false: a plain shared prefix).
    on_bottle: bool,
}

impl World {
    /// The 87-63 case: offline, no pin, no CrossOver, Automatic, on the game's bottle (crossover marker).
    fn missing_no_pin() -> World {
        World {
            crossover_healthy: false,
            pin_installed: false,
            bottle_fixture: Some("fx-crossover-marker"),
            engine_override: "automatic",
            on_bottle: true,
        }
    }
}

struct Rig {
    profile: Profile,
    ctx: EngineCtx,
    log: Arc<RecordingLog>,
    emitter: Arc<RecordingEmitter>,
}

fn rig(world: &World) -> Rig {
    let profile = Profile::new();
    let bottle = per_game_bottle_name(RUNNER, APP).expect("a clean per-game bottle name");
    if let Some(fixture) = world.bottle_fixture {
        profile.build_bottle_as(fixture, &bottle);
    }
    let shared = profile
        .root()
        .join("Games/GameLib/Prefixes/shared")
        .to_string_lossy()
        .into_owned();
    let mut stored = json!({
        "wineVersion": {"type": "wine", "name": "Default Wine - Not Found", "bin": ""},
        "winePrefix": shared,
        "engineOverride": world.engine_override,
    });
    if world.on_bottle {
        stored["wineCrossoverBottle"] = json!(bottle);
    }
    let config = profile.app_folder.join("GamesConfig");
    std::fs::create_dir_all(&config).unwrap();
    std::fs::write(
        config.join(format!("{APP}.json")),
        serde_json::to_vec(&json!({ APP: stored })).unwrap(),
    )
    .unwrap();
    if world.pin_installed {
        profile.build_engines("installed");
    } else {
        std::fs::create_dir_all(profile.tools.join("steam-engines")).unwrap();
    }
    std::fs::create_dir_all(profile.root().join("tmp")).unwrap();

    let mut discovered = Vec::new();
    if world.crossover_healthy {
        let bin = profile
            .root()
            .join("Library/Clone.app/Contents/SharedSupport/CrossOver/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("cxbottle"), b"").unwrap();
        std::fs::write(bin.join("wine"), b"#!/bin/sh\n").unwrap();
        discovered.push(format!("{}/wine", bin.to_string_lossy()));
    }

    let base_env: Vec<(String, String)> = profile
        .home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect();
    let runner = Arc::new(ScriptedSpecRunner::new(base_env));
    let log = Arc::new(RecordingLog::new());
    let emitter = Arc::new(RecordingEmitter::new());
    let mut ctx = profile.ctx_with(log.clone(), Some(runner));
    ctx.fetch = Arc::new(DeadFetch::default());
    ctx.ui = Some(Arc::new(RecordingUi::new()));
    ctx.emitter = emitter.clone();
    ctx.crossover_locator = CrossoverLocator::with_system_applications(
        profile
            .root()
            .join("no-system-applications")
            .to_string_lossy()
            .into_owned(),
    );
    ctx.crossover_discovery = Arc::new(Found(discovered));
    ctx.set_online(false);
    Rig {
        profile,
        ctx,
        log,
        emitter,
    }
}

/// The request `launcher.ts` sends, built from the stored settings the rig wrote.
fn select_request(rig: &Rig, world: &World) -> Value {
    let bottle = per_game_bottle_name(RUNNER, APP).unwrap();
    let mut settings = json!({
        "wineVersion": {"type": "wine", "name": "Default Wine - Not Found", "bin": ""},
        "winePrefix": rig.profile.root().join("Games/GameLib/Prefixes/shared").to_string_lossy(),
        "engineOverride": world.engine_override,
    });
    if world.on_bottle {
        settings["wineCrossoverBottle"] = json!(bottle);
    }
    json!({
        "runner": RUNNER,
        "appName": APP,
        "title": TITLE,
        "installPath": rig.profile.root().join("Games/Trash Goblin").to_string_lossy(),
        "platform": "Windows",
        "isNative": false,
        "settings": settings,
        "offline": true,
    })
}

/// What `engine_state_get` answers for the game: the whole state.
async fn read_state(rig: &Rig) -> Value {
    dispatch(
        "engine_state_get",
        &[json!({ "identity": { "runner": RUNNER, "appName": APP } })],
        &rig.ctx,
    )
    .await
    .expect("the state read answers")
}

/// Whether `engine_launch_select` with `offline: true` refused with the offline gate's own warning.
async fn step_refuses_offline(rig: &Rig, world: &World) -> bool {
    let reply = dispatch(
        "engine_launch_select",
        &[select_request(rig, world)],
        &rig.ctx,
    )
    .await
    .expect("the step answers");
    let refused = reply["kind"] == "refused";
    let gate_warning = rig
        .log
        .lines()
        .into_iter()
        .any(|(level, line)| level == "warn" && line.contains(REFUSAL_WARNING));
    refused && gate_warning
}

fn verdict_of(state: &Value) -> bool {
    state["offlineLaunchRefused"] == json!(true)
}

#[tokio::test]
async fn the_state_verdict_equals_the_steps_offline_refusal_over_the_gate_matrix() {
    let mut cases = 0;
    let mut refusals = 0;
    for crossover_healthy in [false, true] {
        for pin_installed in [false, true] {
            for bottle_fixture in [
                // marker crossover
                Some("fx-crossover-marker"),
                // marker pinned (a non-crossover bottle that restores from the pin)
                Some("fx-pinned-current"),
                // no marker at all
                Some("fx-nomarker-nodxvk-nots"),
            ] {
                for engine_override in ["automatic", "crossover", "pinned:wine-staging-11.20"] {
                    let world = World {
                        crossover_healthy,
                        pin_installed,
                        bottle_fixture,
                        engine_override,
                        on_bottle: true,
                    };
                    let name = format!(
                        "crossover_healthy={crossover_healthy} pin_installed={pin_installed} bottle={bottle_fixture:?} override={engine_override}"
                    );
                    let state = read_state(&rig(&world)).await;
                    assert!(state.is_object(), "{name}: a state is read: {state}");
                    let step_rig = rig(&world);
                    let refused = step_refuses_offline(&step_rig, &world).await;
                    assert_eq!(verdict_of(&state), refused, "{name}: state {state}");
                    cases += 1;
                    refusals += usize::from(refused);
                }
            }
        }
    }
    // Off the bottle (a plain prefix, which only a non-Automatic, non-CrossOver engine keeps) the gate does
    // not apply, whatever else is true.
    let world = World {
        on_bottle: false,
        engine_override: "pinned:wine-staging-11.20",
        ..World::missing_no_pin()
    };
    let state = read_state(&rig(&world)).await;
    assert_eq!(state["prefixKind"], "plain", "the case is off the bottle");
    let step_rig = rig(&world);
    assert!(!step_refuses_offline(&step_rig, &world).await);
    assert!(!verdict_of(&state), "{state}");
    assert_eq!(state["offlineLaunchRefused"], json!(false));
    cases += 1;
    // A matrix that never refuses proves nothing, and one that always refuses neither.
    assert_eq!(cases, 37);
    assert!(
        refusals > 0 && refusals < cases,
        "refusals {refusals} of {cases}"
    );
}

#[tokio::test]
async fn crossover_missing_pin_absent_automatic_on_the_bottle_is_refused() {
    let state = read_state(&rig(&World::missing_no_pin())).await;
    assert_eq!(state["offlineLaunchRefused"], json!(true), "{state}");
}

#[tokio::test]
async fn an_installed_pin_lets_the_offline_launch_through() {
    let state = read_state(&rig(&World {
        pin_installed: true,
        ..World::missing_no_pin()
    }))
    .await;
    assert_eq!(state["offlineLaunchRefused"], json!(false), "{state}");
}

#[tokio::test]
async fn a_healthy_crossover_with_a_crossover_marker_lets_the_offline_launch_through() {
    let state = read_state(&rig(&World {
        crossover_healthy: true,
        ..World::missing_no_pin()
    }))
    .await;
    assert_eq!(state["offlineLaunchRefused"], json!(false), "{state}");
}

#[tokio::test]
async fn a_state_published_by_a_recorded_launch_has_no_verdict() {
    let rig = rig(&World::missing_no_pin());
    let bottle = per_game_bottle_name(RUNNER, APP).unwrap();
    let recorded = dispatch(
        "engine_state_record_decision",
        &[json!({
            "runner": RUNNER, "appName": APP, "bottleName": bottle,
            "override": "automatic",
            "selection": {
                "kind": "crossover", "reason": "cx-healthy",
                "crossoverBuild": "26.3.0.39832", "binDir": "/cx/bin"
            },
            "preflight": { "kind": "healthy", "binDir": "/cx/bin", "build": "26.3.0.39832", "trialDaysRemaining": 5 },
            "facts": {
                "bottle": bottle,
                "overrideEligible": true,
                "overlayEligible": false,
                "wineToolsEligible": false
            }
        })],
        &rig.ctx,
    )
    .await
    .unwrap();
    assert_eq!(recorded, json!(true));
    let pushed = rig.emitter.pushed();
    assert_eq!(pushed.len(), 1);
    assert_eq!(pushed[0].0, "engineStateChanged");
    assert!(
        pushed[0].1[0].get("offlineLaunchRefused").is_none(),
        "a published state never carries the read-time verdict: {}",
        pushed[0].1[0]
    );
}

#[tokio::test]
async fn a_read_does_not_publish_or_cache_the_verdict_into_the_published_state() {
    let rig = rig(&World::missing_no_pin());
    let state = read_state(&rig).await;
    assert_eq!(state["offlineLaunchRefused"], json!(true));
    assert!(
        rig.emitter.pushed().is_empty(),
        "a read publishes nothing: {:?}",
        rig.emitter.pushed()
    );
}
