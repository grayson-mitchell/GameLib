//! The Wine tools of a non-Steam game that runs in its own CrossOver bottle (87-64, 87-59 finding F3,
//! user decision 4, owed live check 56a-1).
//!
//! In 87-59 item 4(c) a Winetricks verb for Trash Goblin (Epic, stored `wineVersion` "Default Wine - Not
//! Found", `wineCrossoverBottle` its per-game bottle, `winePrefix` the shared default, `engineOverride`
//! `automatic`) ran with `WINEPREFIX=<home>/Games/GameLib/Prefixes/shared`, a directory that did not exist,
//! and failed without a word. The fixture here is that game, driven through the real chain: the engine op
//! `engine_resolve_tool_settings` (the sidecar's `resolveToolTarget` asks it with `ensureBottle` true), then
//! the wine ops with the settings it answered, on a scripted spawn runner that records argv and env.
//!
//! Unix only: the fixture lays out a CrossOver bin directory and a bottle with the permission and path
//! conventions of macOS, where the resolver answers (it keeps the stored settings on every other host),
//! and the wine crate's other macOS goldens are gated the same way.
#![cfg(unix)]

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::process::SpecOutput;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::bottles::registry::EngineSelection;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::game_engine::per_game_bottle_name;
use gamelib_engine::launch::settings::OverlayContext;
use gamelib_engine::sinks::EngineLog;
use gamelib_engine::testing::{RecordedSpawn, RecordingLog, ScriptedSpecRunner};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use serde_json::{json, Value};

/// Trash Goblin's Epic app name (87-59).
const APP: &str = "54f7949350c949c6a2c47f12e7b15636";
const RUNNER: &str = "legendary";
const VERB: &str = "fontsmooth=bgr";

/// The fake HOME with CrossOver present, the game's per-game bottle provisioned as a CrossOver bottle, the
/// game's stored settings written the way the settings documents are, and a scripted spawn runner.
struct Rig {
    home: FakeHome,
    ctx: WineCtx,
    runner: Arc<ScriptedSpecRunner>,
    log: Arc<RecordingLog>,
    cx_bin: PathBuf,
    bottle: String,
}

fn ok_output(stdout: &str) -> SpecOutput {
    SpecOutput {
        code: Some(0),
        stdout: stdout.to_string(),
        ..SpecOutput::default()
    }
}

impl Rig {
    /// `winetricks_output` is what the scripted `winetricks` answers.
    fn new(winetricks: SpecOutput) -> Rig {
        let home = FakeHome::new("tool-bottle-");
        let root = home.root().to_path_buf();
        let user_home = root.join("home");

        // CrossOver: the three binaries the resolver and the tools name.
        let cx_bin = root.join("cx").join("bin");
        std::fs::create_dir_all(&cx_bin).unwrap();
        for name in ["wine", "wineserver", "cxbottle"] {
            std::fs::write(cx_bin.join(name), b"").unwrap();
        }

        // The per-game bottle: provisioned (its `cxbottle.conf`) and marked as set up by CrossOver.
        let bottle = per_game_bottle_name(RUNNER, APP).expect("a per-game bottle name");
        let bottle_dir = user_home
            .join("Library/Application Support/CrossOver/Bottles")
            .join(&bottle);
        std::fs::create_dir_all(&bottle_dir).unwrap();
        std::fs::write(bottle_dir.join("cxbottle.conf"), b"[Bottle]\n").unwrap();
        std::fs::write(
            bottle_dir.join(".gamelib-engine.json"),
            format!(
                r#"{{"kind":"crossover","id":"crossover","wineserverBin":"{}","version":1}}"#,
                cx_bin.join("wineserver").display()
            ),
        )
        .unwrap();

        // The game's stored settings, the shape of the real document: the appName key, `explicit`, `version`.
        let stored = stored_settings(&user_home);
        let games = root.join("GamesConfig");
        std::fs::create_dir_all(&games).unwrap();
        let doc = json!({ APP: stored, "version": "v2", "explicit": true });
        std::fs::write(
            games.join(format!("{APP}.json")),
            serde_json::to_vec_pretty(&doc).unwrap(),
        )
        .unwrap();

        // The winetricks script is on disk (the run downloads it only when it is missing).
        let tools = root.join("tools");
        std::fs::create_dir_all(&tools).unwrap();
        std::fs::write(tools.join("winetricks"), b"#!/bin/sh\n").unwrap();

        let runner = Arc::new(
            ScriptedSpecRunner::new(Vec::new())
                .on_program(&tools.join("winetricks").to_string_lossy(), winetricks)
                .on_program("which", ok_output(""))
                .on_program(&cx_bin.join("wine").to_string_lossy(), ok_output(""))
                .on_program(&cx_bin.join("wineserver").to_string_lossy(), ok_output("")),
        );
        let log = Arc::new(RecordingLog::new());
        let bin_dir = cx_bin.to_string_lossy().into_owned();
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: tools,
                user_home,
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
        .with_proc(runner.clone())
        .with_log(log.clone() as Arc<dyn EngineLog>)
        .with_crossover_bin_dir(Arc::new(move || {
            let bin_dir = bin_dir.clone();
            Box::pin(async move { Some(bin_dir) })
        }));
        Rig {
            ctx: WineCtx::new(Arc::new(engine), root.join("runtime")),
            home,
            runner,
            log,
            cx_bin,
            bottle,
        }
    }

    fn user_home(&self) -> PathBuf {
        self.home.root().join("home")
    }

    fn bottle_dir(&self) -> PathBuf {
        self.user_home()
            .join("Library/Application Support/CrossOver/Bottles")
            .join(&self.bottle)
    }

    /// The shared default prefix the stored `winePrefix` names (87-59's stray directory).
    fn shared_prefix(&self) -> PathBuf {
        self.user_home().join("Games/GameLib/Prefixes/shared")
    }

    fn stored(&self) -> Value {
        stored_settings(&self.user_home())
    }

    /// What the sidecar's `resolveToolTarget` asks the engine, `ensureBottle` true.
    async fn resolve(&self) -> Value {
        gamelib_engine::dispatch(
            "engine_resolve_tool_settings",
            &[json!({
                "runner": RUNNER,
                "appName": APP,
                "platform": "Windows",
                "stored": self.stored(),
                "ensureBottle": true,
            })],
            &self.ctx.engine,
        )
        .await
        .expect("the resolver answers")
    }

    /// A game is running (or starting) on CrossOver in its bottle: the registry and the overlay hold it.
    fn start_live_launch(&self) {
        let key = format!("{RUNNER}:{APP}");
        assert!(self.ctx.engine.registry.set_engine_selection_quiet(
            None,
            &key,
            EngineSelection::Crossover {
                reason: "cx-healthy".to_string(),
                crossover_build: Some("26.3.0.39832".to_string()),
                bin_dir: self.cx_bin.to_string_lossy().into_owned(),
            }
        ));
        self.ctx
            .engine
            .launch_settings
            .set_launch_overlay_context(&key, OverlayContext::bottle(&self.bottle, None));
    }

    fn winetricks_spawn(&self) -> RecordedSpawn {
        let script = self.home.root().join("tools").join("winetricks");
        self.runner
            .spawns()
            .into_iter()
            .find(|s| Path::new(&s.program) == script)
            .expect("winetricks was spawned")
    }

    /// Every path under the fake HOME.
    fn tree(&self) -> BTreeSet<PathBuf> {
        fn walk(dir: &Path, out: &mut BTreeSet<PathBuf>) {
            for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
                let path = entry.path();
                out.insert(path.clone());
                if path.is_dir() {
                    walk(&path, out);
                }
            }
        }
        let mut out = BTreeSet::new();
        walk(self.home.root(), &mut out);
        out
    }
}

/// The 87-59 shape (from the real `GamesConfig/<app>.json`).
fn stored_settings(user_home: &Path) -> Value {
    json!({
        "engineOverride": "automatic",
        "wineCrossoverBottle": per_game_bottle_name(RUNNER, APP).unwrap(),
        "winePrefix": user_home.join("Games/GameLib/Prefixes/shared"),
        "wineVersion": {"bin": "", "name": "Default Wine - Not Found", "type": "wine"},
        "enviromentOptions": [],
        "showFps": false,
        "enableEsync": true,
    })
}

/// The `settings` of an `engine` answer, panicking with the whole answer when it is another kind.
fn engine_settings(answer: &Value) -> Value {
    assert_eq!(
        answer["kind"], "engine",
        "the resolver must answer the game's engine settings, got {answer}"
    );
    answer["settings"].clone()
}

fn host_json() -> Value {
    json!({"env": {"PATH": "/usr/bin:/bin"}})
}

/// `wine_winetricks_install` for `settings`.
async fn winetricks_install(rig: &Rig, settings: Value) -> Value {
    gamelib_wine::dispatch(
        "wine_winetricks_install",
        &[
            json!({"runner": RUNNER, "appName": APP, "settings": settings, "verb": VERB}),
            host_json(),
        ],
        &rig.ctx,
    )
    .await
    .expect("the install op answers")
}

/// What F3 got wrong, asserted on one winetricks spawn: the bottle is the prefix and the CrossOver
/// bottle is named, the shared prefix is nowhere.
fn assert_runs_in_the_bottle(rig: &Rig, spawn: &RecordedSpawn) {
    let bottle_dir = rig.bottle_dir();
    assert_eq!(
        spawn.env_set.get("CX_BOTTLE").map(String::as_str),
        Some(rig.bottle.as_str()),
        "CX_BOTTLE names the game's bottle: {:?}",
        spawn.env_set
    );
    assert_eq!(
        spawn.env_set.get("WINEPREFIX").map(Path::new),
        Some(bottle_dir.as_path()),
        "WINEPREFIX is the bottle's directory, not the stored winePrefix: {:?}",
        spawn.env_set
    );
    let shared = rig.shared_prefix();
    assert!(
        !spawn
            .env_set
            .values()
            .any(|v| v.contains(&*shared.to_string_lossy())),
        "no variable names the shared prefix: {:?}",
        spawn.env_set
    );
}

#[tokio::test]
async fn the_resolver_answers_the_games_crossover_bottle() {
    let rig = Rig::new(ok_output(""));
    let answer = rig.resolve().await;
    let settings = engine_settings(&answer);
    assert_eq!(settings["wineCrossoverBottle"], json!(rig.bottle));
    assert_eq!(settings["wineVersion"]["type"], "crossover");
    assert_eq!(
        settings["wineVersion"]["bin"],
        json!(rig.cx_bin.join("wine").to_string_lossy())
    );
}

#[tokio::test]
async fn winetricks_for_a_bottle_backed_game_runs_in_its_bottle_when_it_is_not_running() {
    let rig = Rig::new(ok_output("Executing w_do_call fontsmooth=bgr\n"));
    let before = rig.tree();
    let settings = engine_settings(&rig.resolve().await);
    let outcome = winetricks_install(&rig, settings).await;
    assert_eq!(outcome, json!("installed"));
    assert_runs_in_the_bottle(&rig, &rig.winetricks_spawn());

    // Nothing is created outside the game's own bottle (T-87-112): not the shared prefix, not anything else.
    assert!(
        !rig.shared_prefix().exists(),
        "the shared prefix was created"
    );
    let created: Vec<PathBuf> = rig
        .tree()
        .difference(&before)
        .filter(|p| !p.starts_with(rig.bottle_dir()))
        .cloned()
        .collect();
    assert!(
        created.is_empty(),
        "created outside the bottle: {created:?}"
    );
}

#[tokio::test]
async fn winetricks_for_a_bottle_backed_game_runs_in_its_bottle_during_a_live_crossover_launch() {
    let rig = Rig::new(ok_output("Executing w_do_call fontsmooth=bgr\n"));
    rig.start_live_launch();
    let answer = rig.resolve().await;
    let settings = engine_settings(&answer);
    assert_eq!(answer["key"], json!(format!("{RUNNER}:{APP}")));
    let outcome = winetricks_install(&rig, settings).await;
    assert_eq!(outcome, json!("installed"));
    assert_runs_in_the_bottle(&rig, &rig.winetricks_spawn());
    assert!(
        !rig.shared_prefix().exists(),
        "the shared prefix was created"
    );
}

/// The neighbour that must not move: a game on a plain prefix keeps `WINEPREFIX` from its settings.
#[tokio::test]
async fn winetricks_for_a_plain_prefix_game_keeps_its_stored_prefix() {
    let rig = Rig::new(ok_output(""));
    let wine = rig.home.root().join("wine/bin");
    std::fs::create_dir_all(&wine).unwrap();
    std::fs::write(wine.join("wine"), b"").unwrap();
    std::fs::write(wine.join("wineserver"), b"").unwrap();
    let prefix = rig.home.root().join("plain-prefix");
    let settings = json!({
        "winePrefix": prefix,
        "wineCrossoverBottle": "",
        "wineVersion": {
            "type": "wine", "name": "Wine-9",
            "bin": wine.join("wine"), "wineserver": wine.join("wineserver"),
        },
    });
    assert_eq!(winetricks_install(&rig, settings).await, json!("installed"));
    let spawn = rig.winetricks_spawn();
    assert_eq!(
        spawn.env_set.get("WINEPREFIX").map(Path::new),
        Some(prefix.as_path())
    );
    assert!(!spawn.env_set.contains_key("CX_BOTTLE"));
}

/// T-87-112: a bottle name that is not one safe segment is never turned into a path; the tool is
/// unavailable and nothing is spawned.
#[tokio::test]
async fn a_bottle_name_that_is_not_one_safe_segment_runs_nothing() {
    for name in ["../escape", "a/b", "", ".", ".."] {
        let rig = Rig::new(ok_output(""));
        let settings = json!({
            "winePrefix": rig.shared_prefix(),
            "wineCrossoverBottle": name,
            "wineVersion": {
                "type": "crossover", "name": "CrossOver",
                "bin": rig.cx_bin.join("wine"), "wineserver": rig.cx_bin.join("wineserver"),
            },
        });
        let before = rig.tree();
        assert_eq!(
            winetricks_install(&rig, settings).await,
            json!("failed"),
            "{name:?}"
        );
        assert!(
            rig.runner
                .spawns()
                .iter()
                .all(|s| !s.program.ends_with("winetricks")),
            "{name:?}: winetricks was spawned"
        );
        assert_eq!(rig.tree(), before, "{name:?}: the tree changed");
        assert!(!rig.shared_prefix().exists());
        assert!(
            rig.log
                .lines()
                .iter()
                .any(|(level, text)| *level == "error" && text.contains("Winetricks not run")),
            "{name:?}: the refusal is logged"
        );
    }
}
