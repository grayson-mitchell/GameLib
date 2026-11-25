//! RF1 of the 87-69 live gate, at the desk (87-72 Task 1): the two CrossOver branches of the engine step,
//! side by side, from `engine_launch_select` to the `launchSettings` the TS launch spawns with.
//!
//! RF1: CrossOver launches started by GameLib exit within one to two seconds on the plain `cx-healthy` branch
//! while the single launch right after a pinned-to-crossover restore ran normally. The two branches reach
//! `engine_launch_select` with the same stored settings and differ only in what the bottle's marker says, so
//! this file builds the re-run 1 settings shape (stored `wineVersion` a `wine` named `Default Wine - Not
//! Found`, `wineCrossoverBottle` the per-game bottle, `winePrefix` the shared default prefix, the engine on
//! Automatic) over a healthy CrossOver and asserts what a CrossOver launch needs from the reply, for each
//! branch, and that the two branches' spawn-relevant fields are equal.
//!
//! H1 of the debug record (the plain branch's overlay differs from the restore branch's in a field the spawn
//! needs) is what these cases settle. Both branches build `launchSettings` through the same function
//! (`build_crossover_game_settings` over `get_launch_settings`), so every invariant here holds at HEAD and
//! none is committed in its expected-to-fail form. The restore branch's switch is scripted (`prepare` is the
//! engine switch's own golden, 87-38); what is asserted of it is the settings it is handed, because only a
//! switch to CrossOver reads them and they must be the launch's.
//!
//! The cause 87-72 named is state, not settings: the plain branch's own `--demo-status` probe boots the bottle's
//! wineserver and nothing stops it, so the launch meets a warm server (the restore branch's switch kills it
//! first). The last cases pin the 87-77 fix: the plain branch stops that server before it hands the launch
//! over, unless a game is running in the bottle.
//!
//! POSIX only, like the other engine goldens: the fake profile lays CrossOver and the bottles out as real
//! files.
#![cfg(unix)]

mod common;

use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::sync::{Arc, Mutex};

use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::process::{SpecOutput, SpecRunner};
use gamelib_engine::bottles::per_game::{EnsureArgs, EnsureOutcome};
use gamelib_engine::bottles::switch::{PrepareArgs, PrepareOutcome, PrepareResult};
use gamelib_engine::config::EffectiveEngine;
use gamelib_engine::crossover::locate::CrossoverLocator;
use gamelib_engine::ctx::EngineCtx;
use gamelib_engine::decision::launch::{DecideArgs, LaunchDecision};
use gamelib_engine::decision::preflight::ProbeTuning;
use gamelib_engine::dispatch;
use gamelib_engine::fallback::ensure::PinnedEngineResult;
use gamelib_engine::game_engine::per_game_bottle_name;
use gamelib_engine::launch::step::{
    select_engine_for_launch, CtxStepDeps, Fut, GameRef, Purpose, SelectArgs, SelectKind, StepDeps,
};
use gamelib_engine::pins::EnginePin;
use gamelib_engine::testing::{RecordingLog, ScriptedSpecRunner};
use serde_json::{json, Value};

use common::Profile;

const RUNNER: &str = "legendary";
/// Trash Goblin's Epic app name (the re-run 1 game).
const APP: &str = "54f7949350c949c6a2c47f12e7b15636";
const TITLE: &str = "Trash Goblin";
const BIN_REL: &str = "Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin";
const BUILD: &str = "26.3.0.39832";

/// An emitter nobody listens to: the status pushes of a switch are not what these cases read.
struct Silent;

impl FrontendEmitter for Silent {
    fn emit(&self, _channel: &str, _args: Vec<Value>) {}
}

fn write_file(path: &Path, mode: u32) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, "").unwrap();
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode)).unwrap();
}

fn ok(stdout: &str) -> SpecOutput {
    SpecOutput {
        code: Some(0),
        stdout: stdout.to_string(),
        ..SpecOutput::default()
    }
}

/// The settings `launcher.ts` sends for the re-run 1 game: the stored ones, as the step's request carries them.
fn stored_settings(profile: &Profile, bottle: &str) -> Value {
    json!({
        "wineVersion": {"type": "wine", "name": "Default Wine - Not Found", "bin": ""},
        "wineCrossoverBottle": bottle,
        "winePrefix": profile.root().join("Games/GameLib/Prefixes/shared").to_string_lossy(),
        "engineOverride": "automatic",
    })
}

struct Rig {
    profile: Profile,
    ctx: EngineCtx,
    runner: Arc<ScriptedSpecRunner>,
    bottle: String,
}

/// A fake profile with a healthy CrossOver (real files, a scripted `--demo-status` and build read), the
/// game's own bottle laid down from `marker_fixture`, and the stored game config on disk.
fn rig(marker_fixture: &str) -> Rig {
    let profile = Profile::new();
    let bottle = per_game_bottle_name(RUNNER, APP).expect("a clean per-game bottle name");
    profile.build_bottle_as(marker_fixture, &bottle);

    let bin_dir = profile.root().join(BIN_REL);
    write_file(&bin_dir.join("cxbottle"), 0o644);
    write_file(&bin_dir.join("wine"), 0o755);
    write_file(&bin_dir.join("wineserver"), 0o755);

    let config = profile.app_folder.join("GamesConfig");
    std::fs::create_dir_all(&config).unwrap();
    std::fs::write(
        config.join(format!("{APP}.json")),
        serde_json::to_vec(&json!({ APP: stored_settings(&profile, &bottle) })).unwrap(),
    )
    .unwrap();
    std::fs::create_dir_all(profile.tools.join("steam-engines")).unwrap();
    std::fs::create_dir_all(profile.root().join("tmp")).unwrap();

    let base_env: Vec<(String, String)> = profile
        .home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect();
    let wine = bin_dir.join("wine").to_string_lossy().into_owned();
    let runner = Arc::new(
        ScriptedSpecRunner::new(base_env)
            .on(&wine, &["--demo-status"], ok("Standard version\n"))
            .on_program("/usr/bin/plutil", ok(&format!("{BUILD}\n")))
            .on_program(&bin_dir.join("wineserver").to_string_lossy(), ok("")),
    );
    let log = Arc::new(RecordingLog::new());
    let proc: Arc<dyn SpecRunner> = runner.clone();
    let mut ctx = profile.ctx_with(log, Some(proc));
    ctx.emitter = Arc::new(Silent);
    ctx.crossover_locator = CrossoverLocator::with_system_applications(
        profile
            .root()
            .join("no-system-applications")
            .to_string_lossy()
            .into_owned(),
    );
    ctx.set_online(true);
    Rig {
        profile,
        ctx,
        runner,
        bottle,
    }
}

/// The request `launcher.ts` sends: the stored settings, online.
fn request(rig: &Rig) -> Value {
    json!({
        "runner": RUNNER,
        "appName": APP,
        "title": TITLE,
        "installPath": rig.profile.root().join("Games/Trash Goblin").to_string_lossy(),
        "platform": "Windows",
        "isNative": false,
        "settings": stored_settings(&rig.profile, &rig.bottle),
        "offline": false,
    })
}

fn select_args(rig: &Rig) -> SelectArgs {
    SelectArgs {
        runner: RUNNER.to_string(),
        app_name: APP.to_string(),
        title: TITLE.to_string(),
        install_path: Some(
            rig.profile
                .root()
                .join("Games/Trash Goblin")
                .to_string_lossy()
                .into_owned(),
        ),
        platform: Some("Windows".to_string()),
        is_native: false,
        settings: stored_settings(&rig.profile, &rig.bottle),
        offline: false,
        purpose: Purpose::Launch,
    }
}

/// The step's collaborators with the engine switch scripted: everything else is the real function. It records
/// the settings the switch is handed (`crossover_settings`) and answers a switch that worked.
struct ScriptedSwitch {
    real: CtxStepDeps,
    handed: Mutex<Vec<Value>>,
}

impl StepDeps for ScriptedSwitch {
    fn read_effective(&self, ctx: &EngineCtx, game: &GameRef<'_>) -> EffectiveEngine {
        self.real.read_effective(ctx, game)
    }

    fn is_provisioned(&self, ctx: &EngineCtx, bottle_name: &str) -> bool {
        self.real.is_provisioned(ctx, bottle_name)
    }

    fn ensure_game_bottle<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        args: &'a EnsureArgs,
    ) -> Fut<'a, EnsureOutcome> {
        self.real.ensure_game_bottle(ctx, args)
    }

    fn ensure_pinned<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        pin: &'a EnginePin,
        game: &'a GameRef<'a>,
    ) -> Fut<'a, PinnedEngineResult> {
        self.real.ensure_pinned(ctx, pin, game)
    }

    fn prepare<'a>(
        &'a self,
        _ctx: &'a EngineCtx,
        args: PrepareArgs,
        _game: &'a GameRef<'a>,
    ) -> Fut<'a, PrepareResult> {
        self.handed
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(args.crossover_settings.clone());
        Box::pin(async move {
            PrepareResult {
                outcome: PrepareOutcome::Prepared,
                switched: true,
                selection: Some(args.next.clone()),
            }
        })
    }

    fn decide<'a>(
        &'a self,
        ctx: &'a EngineCtx,
        args: DecideArgs,
    ) -> Fut<'a, Result<LaunchDecision, &'static str>> {
        self.real.decide(ctx, args)
    }

    fn probe_tuning(&self) -> ProbeTuning {
        ProbeTuning {
            retry_settle_ms: Some(0),
            ..self.real.probe_tuning()
        }
    }
}

/// What both branches hand the launch, with the fake profile's root as `/test/home`. `launcher.crossoverEnv.test.ts`
/// copies this literal as its fixture, so a change here that the TS test does not follow turns this file red.
const RECORDED_SPAWN_SHAPE: &str = r#"{
  "wineVersion": {
    "type": "crossover",
    "bin": "/test/home/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine",
    "name": "CrossOver 26.3.0.39832",
    "wineserver": "/test/home/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wineserver"
  },
  "wineCrossoverBottle": "GameLib-legendary-54f7949350c949c6a2c47f12e7b15636",
  "winePrefix": "/test/home/Games/GameLib/Prefixes/shared",
  "engineOverride": "automatic"
}"#;

/// The spawn-relevant fields of a reply's `launchSettings`: what the TS launch builds its wine binary, its
/// bottle and its prefix from. The fake root is `/test/home`, so the two branches (two profiles) compare.
fn spawn_shape(rig: &Rig, settings: &Value) -> Value {
    let text = serde_json::to_string(&json!({
        "wineVersion": settings["wineVersion"],
        "wineCrossoverBottle": settings["wineCrossoverBottle"],
        "winePrefix": settings["winePrefix"],
        "engineOverride": settings["engineOverride"],
    }))
    .unwrap();
    let root = rig.profile.root().to_string_lossy().into_owned();
    serde_json::from_str(&text.replace(&root, "/test/home")).unwrap()
}

/// The invariants a CrossOver launch needs from the reply (H1): kind `use`, a CrossOver wine under the
/// CrossOver install's bin dir, the per-game bottle.
fn assert_crossover_launch_shape(rig: &Rig, reply: &Value, branch: &str) {
    assert_eq!(reply["kind"], "use", "{branch}: reply: {reply}");
    assert_eq!(
        reply["selection"]["kind"], "crossover",
        "{branch}: selection: {}",
        reply["selection"]
    );
    assert_eq!(
        reply["selection"]["reason"], "cx-healthy",
        "{branch}: selection: {}",
        reply["selection"]
    );
    let settings = &reply["launchSettings"];
    assert_eq!(
        settings["wineVersion"]["type"], "crossover",
        "{branch}: launchSettings.wineVersion.type: {settings}"
    );
    let bin_dir = rig.profile.root().join(BIN_REL);
    let want_bin = bin_dir.join("wine").to_string_lossy().into_owned();
    assert_eq!(
        settings["wineVersion"]["bin"], want_bin,
        "{branch}: launchSettings.wineVersion.bin is not CrossOver's wine"
    );
    assert_eq!(
        settings["wineVersion"]["wineserver"],
        bin_dir.join("wineserver").to_string_lossy().as_ref(),
        "{branch}: launchSettings.wineVersion.wineserver is not CrossOver's wineserver"
    );
    assert_eq!(
        settings["wineCrossoverBottle"], rig.bottle,
        "{branch}: launchSettings.wineCrossoverBottle is not the per-game bottle"
    );
}

/// The plain branch: the bottle's marker already says CrossOver, so nothing switches.
async fn plain_branch() -> (Rig, Value) {
    let rig = rig("fx-crossover-marker");
    let reply = dispatch("engine_launch_select", &[request(&rig)], &rig.ctx)
        .await
        .expect("the step answers");
    (rig, reply)
}

/// The restore branch: the marker says a pinned engine, so the switch back to CrossOver runs (scripted), and
/// the settings it is handed are recorded.
async fn restore_branch() -> (Rig, Value, Vec<Value>) {
    let rig = rig("fx-pinned-current");
    let deps = ScriptedSwitch {
        real: CtxStepDeps,
        handed: Mutex::new(Vec::new()),
    };
    let reply = select_engine_for_launch(&rig.ctx, &deps, &select_args(&rig)).await;
    assert_eq!(reply.kind, SelectKind::Use, "restore branch: {reply:?}");
    let handed = deps
        .handed
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    (rig, reply.to_value(), handed)
}

#[tokio::test]
async fn the_plain_cx_healthy_branch_hands_the_launch_a_crossover_wine_and_the_game_bottle() {
    let (rig, reply) = plain_branch().await;
    assert_crossover_launch_shape(&rig, &reply, "plain");
    assert!(
        rig.runner.unscripted().is_empty(),
        "no spawn the case did not script: {:?}",
        rig.runner.unscripted()
    );
}

#[tokio::test]
async fn the_restore_branch_hands_the_launch_a_crossover_wine_and_the_game_bottle() {
    let (rig, reply, handed) = restore_branch().await;
    assert_crossover_launch_shape(&rig, &reply, "restore");
    assert_eq!(handed.len(), 1, "the switch ran once: {handed:?}");
}

#[tokio::test]
async fn the_two_branches_hand_the_launch_the_same_spawn_relevant_fields() {
    // H1: if the two branches differed in wine binary, bottle, prefix or wine type, the plain launch would
    // spawn something the restore launch does not. They are equal, field for field.
    let (plain_rig, plain) = plain_branch().await;
    let (restore_rig, restore, _) = restore_branch().await;
    assert_eq!(
        spawn_shape(&plain_rig, &plain["launchSettings"]),
        spawn_shape(&restore_rig, &restore["launchSettings"]),
        "the plain and restore branches disagree on a spawn-relevant field"
    );
}

#[tokio::test]
async fn both_branches_hand_the_launch_the_shape_the_ts_fixtures_copy() {
    let want: Value = serde_json::from_str(RECORDED_SPAWN_SHAPE).unwrap();
    let (plain_rig, plain) = plain_branch().await;
    assert_eq!(
        spawn_shape(&plain_rig, &plain["launchSettings"]),
        want,
        "plain branch"
    );
    let (restore_rig, restore, _) = restore_branch().await;
    assert_eq!(
        spawn_shape(&restore_rig, &restore["launchSettings"]),
        want,
        "restore branch"
    );
}

#[tokio::test]
async fn the_restore_switch_is_handed_the_settings_the_launch_runs_with() {
    // Only a switch to CrossOver reads `crossover_settings`; a restore that runs with other settings than the
    // launch would reset the bottle to something the launch then does not use.
    let (_rig, reply, handed) = restore_branch().await;
    assert_eq!(handed.len(), 1, "the switch ran once: {handed:?}");
    assert_eq!(handed[0], reply["launchSettings"]);
}

#[tokio::test]
async fn both_branches_keep_the_stored_shared_prefix_and_never_write_it_to_the_game_config() {
    // Recorded, not demanded: the overlay leaves `winePrefix` the shared default prefix on both branches. The
    // TS CrossOver env reads `wineCrossoverBottle` and never `winePrefix` (see launcher.crossoverEnv.test.ts);
    // the nile launch passes `--wine-prefix <winePrefix>` all the same (H2, the debug record).
    let (plain_rig, plain) = plain_branch().await;
    let (restore_rig, restore, _) = restore_branch().await;
    for (rig, reply, branch) in [
        (&plain_rig, &plain, "plain"),
        (&restore_rig, &restore, "restore"),
    ] {
        let shared = rig
            .profile
            .root()
            .join("Games/GameLib/Prefixes/shared")
            .to_string_lossy()
            .into_owned();
        assert_eq!(
            reply["launchSettings"]["winePrefix"], shared,
            "{branch}: winePrefix"
        );
        let stored: Value = common::read_json(
            &rig.profile
                .app_folder
                .join("GamesConfig")
                .join(format!("{APP}.json")),
        );
        assert_eq!(
            stored[APP]["wineVersion"]["type"], "wine",
            "{branch}: the overlay must never be written to the game's config"
        );
    }
}

/// The `wineserver -k` spawns a case recorded: what `kill_bottle_wineserver` runs.
fn wineserver_kills(rig: &Rig) -> Vec<gamelib_engine::testing::RecordedSpawn> {
    rig.runner
        .spawns()
        .into_iter()
        .filter(|spawn| spawn.label == "engine-wineserver-kill")
        .collect()
}

#[tokio::test]
async fn the_plain_branch_stops_the_wineserver_its_own_probe_started_before_the_launch() {
    // RF1, the named cause: the pre-flight's `--demo-status` run boots the game's bottle (a `wineserver`
    // without the launch's sync environment), the plain branch switches nothing, and legendary's wine child
    // then meets that warm server and never starts. The restore branch's switch kills the server first (87-72,
    // `## Root cause`), so the plain branch must do the same before it hands the launch over.
    let (rig, reply) = plain_branch().await;
    assert_eq!(reply["kind"], "use", "reply: {reply}");
    let kills = wineserver_kills(&rig);
    assert_eq!(
        kills.len(),
        1,
        "one wineserver kill for the game's bottle on the plain branch: {:?}",
        rig.runner.spawns()
    );
    let bin_dir = rig.profile.root().join(BIN_REL);
    assert_eq!(
        kills[0].program,
        bin_dir.join("wineserver").to_string_lossy().as_ref(),
        "the kill runs CrossOver's own wineserver"
    );
    assert_eq!(kills[0].argv, ["-k"]);
    assert_eq!(
        kills[0].env_set.get("WINEPREFIX").map(String::as_str),
        Some(
            rig.profile
                .bottles_root()
                .join(&rig.bottle)
                .to_string_lossy()
                .as_ref()
        ),
        "the kill is aimed at the game's own bottle directory"
    );
    // After the probe that started the server, never before it.
    let order: Vec<&str> = rig
        .runner
        .spawns()
        .iter()
        .map(|spawn| spawn.label)
        .collect();
    let probe_at = order.iter().position(|label| label.contains("demo-status"));
    let kill_at = order
        .iter()
        .position(|label| *label == "engine-wineserver-kill");
    assert!(
        probe_at.is_some() && probe_at < kill_at,
        "the kill comes after the demo-status probe: {order:?}"
    );
}

#[tokio::test]
async fn the_plain_branch_leaves_the_bottles_wineserver_alone_while_another_game_runs_in_it() {
    // A second game of the bottle keeps its server (59-REVIEW WR-07: never stop a server under a running game).
    let rig = rig("fx-crossover-marker");
    assert!(rig
        .ctx
        .ledger
        .mark_game_running(None, &rig.bottle, "legendary:other-game"));
    let reply = dispatch("engine_launch_select", &[request(&rig)], &rig.ctx)
        .await
        .expect("the step answers");
    assert_eq!(reply["kind"], "use", "reply: {reply}");
    assert!(
        wineserver_kills(&rig).is_empty(),
        "no kill with another game running in the bottle: {:?}",
        rig.runner.spawns()
    );
}

#[tokio::test]
async fn the_plain_branch_leaves_the_wineserver_alone_while_the_same_game_still_runs() {
    // A second Play on a game that is still marked running must not stop the server under it.
    let rig = rig("fx-crossover-marker");
    let key = format!("{RUNNER}:{APP}");
    assert!(rig.ctx.ledger.mark_game_running(None, &rig.bottle, &key));
    let reply = dispatch("engine_launch_select", &[request(&rig)], &rig.ctx)
        .await
        .expect("the step answers");
    assert_eq!(reply["kind"], "use", "reply: {reply}");
    assert!(
        wineserver_kills(&rig).is_empty(),
        "no kill while the game itself is marked running: {:?}",
        rig.runner.spawns()
    );
}

#[tokio::test]
async fn the_restore_branch_does_not_add_a_second_kill_after_its_switch() {
    // The real switch stops the previous engine's server itself (scripted here); the step adds nothing.
    let (rig, _reply, handed) = restore_branch().await;
    assert_eq!(handed.len(), 1, "the switch ran once: {handed:?}");
    assert!(
        wineserver_kills(&rig).is_empty(),
        "the step does not kill after a switch that ran: {:?}",
        rig.runner.spawns()
    );
}
