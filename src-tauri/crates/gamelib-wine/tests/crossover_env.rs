//! RF1 of the 87-69 live gate, held in Rust (88.2-23, D-15): what a CrossOver game is spawned with, fed the
//! `launchSettings` that `engine_launch_select` returns on each of its two CrossOver branches.
//!
//! RF1: CrossOver launches started by GameLib exited within one to two seconds on the plain `cx-healthy` branch,
//! while the single launch right after a pinned-to-crossover restore ran normally. The engine crate's
//! `crossover_launch_shape.rs` records that both branches return the same spawn-relevant fields;
//! `RECORDED_SPAWN_SHAPE` below is that literal, with the fake profile's root in place of `/test/home`. What is
//! asserted here is H2 of the debug record, over gamelib-wine's own env builders, which are what a launch runs
//! with (88.1-03 ported them):
//!
//! 1. the env for a `crossover` wine sets `CX_BOTTLE` to the per-game bottle;
//! 2. no `WINEPREFIX`, `WINESERVER` or `WINELOADER` points outside that bottle's directory (none is set at all);
//! 3. the wine binary the command runs is CrossOver's, under the CrossOver bin dir (`prepare_wine_command`, the
//!    step `run_wine_command` and the launch variant share, decides it).
//!
//! The TS test this replaces (`launcher.crossoverEnv.test.ts`) also held that a Proton or toolkit variable is not
//! carried, that the settings it is handed are not rewritten, and that the two branches build the same env and the
//! same store `--wine` flag. The first and the branch equality port below. The second cannot happen here: the
//! builders take `&GameSettingsView`. The store `--wine` flag is built by `compatibility_layers.ts`
//! (`getWineFlags`), which stays TS until the managers move in Phase 92 and keeps its own tests; invariant 3 reads
//! the binary the Rust command spawns instead.
//!
//! The env builder's inputs are injected (platform, process environment, `exists`), so nothing is spawned and no
//! environment variable is read. The profile root is a `FakeHome`.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::ScriptedSpecRunner;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use gamelib_wine::wine_cmd::command::{prepare_wine_command, WineCommandArgs};
use gamelib_wine::wine_cmd::env::{
    build_wine_env_vars, setup_env_vars, EnvSnapshot, GameSettingsView, WineEnvPaths,
};
use gamelib_wine::wine_cmd::WineHost;
use serde_json::{json, Value};

const BOTTLE: &str = "GameLib-legendary-54f7949350c949c6a2c47f12e7b15636";

/// The CrossOver bin dir under the fake profile (`Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin`).
fn cx_bin(home: &FakeHome) -> PathBuf {
    home.root()
        .join("Applications")
        .join("CrossOver.app")
        .join("Contents")
        .join("SharedSupport")
        .join("CrossOver")
        .join("bin")
}

/// The bottle's own directory (`<home>/Library/Application Support/CrossOver/Bottles/<bottle>`).
fn bottle_dir(home: &FakeHome) -> PathBuf {
    home.root()
        .join("Library")
        .join("Application Support")
        .join("CrossOver")
        .join("Bottles")
        .join(BOTTLE)
}

/// `RECORDED_SPAWN_SHAPE` of `gamelib-engine/tests/crossover_launch_shape.rs`: the settings both branches hand
/// the launch, over the re-run 1 stored settings (the shared default prefix stays, the engine is on Automatic),
/// with the two fields the TS test added so the builders see a complete settings object.
fn recorded_spawn_shape(home: &FakeHome) -> Value {
    let bin = cx_bin(home);
    json!({
        "wineVersion": {
            "type": "crossover",
            "bin": bin.join("wine").to_string_lossy(),
            "name": "CrossOver 26.3.0.39832",
            "wineserver": bin.join("wineserver").to_string_lossy()
        },
        "wineCrossoverBottle": BOTTLE,
        "winePrefix": home.root().join("Games").join("GameLib").join("Prefixes").join("shared").to_string_lossy(),
        "engineOverride": "automatic",
        "enviromentOptions": [],
        "preferSystemLibs": false
    })
}

/// The two branches' `launchSettings`, as the crate test records them: equal, one fixture each.
fn branches(home: &FakeHome) -> [(&'static str, GameSettingsView); 2] {
    ["plain", "restore"].map(|name| {
        let settings: GameSettingsView = serde_json::from_value(recorded_spawn_shape(home))
            .expect("the recorded shape decodes as the settings the builders read");
        (name, settings)
    })
}

fn paths(home: &FakeHome) -> WineEnvPaths {
    WineEnvPaths {
        flatpak_home: home.root().to_path_buf(),
        runtime_path: home.root().join("runtime"),
    }
}

/// `setupWineEnvVars` for a CrossOver wine on macOS, with the process environment empty.
fn wine_env(home: &FakeHome, settings: &GameSettingsView) -> BTreeMap<String, String> {
    build_wine_env_vars(
        settings,
        None,
        Platform::Mac,
        &EnvSnapshot::default(),
        &paths(home),
        &|_: &Path| false,
    )
    .vars
}

/// `setupEnvVars`, the platform-independent half the command merges beside it.
fn base_env(settings: &GameSettingsView) -> BTreeMap<String, String> {
    setup_env_vars(settings, None, Platform::Mac, &EnvSnapshot::default())
}

fn inside(path: &str, dir: &Path) -> bool {
    Path::new(path).starts_with(dir)
}

fn wine_ctx(home: &FakeHome) -> WineCtx {
    let root = home.root().to_path_buf();
    let engine = EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Mac,
        EnginePaths {
            app_folder: root.join("app"),
            user_data: root.join("userdata"),
            tools_path: root.join("tools"),
            user_home: root.clone(),
            temp: root.join("temp"),
        },
        Shutdown::new(),
    )
    .with_proc(Arc::new(ScriptedSpecRunner::new(Vec::new())));
    WineCtx::new(Arc::new(engine), root.join("runtime"))
}

/// Creates the two CrossOver binaries so `validWine` passes: the command checks that the wine exists.
fn install_crossover(home: &FakeHome) {
    let bin = cx_bin(home);
    std::fs::create_dir_all(&bin).expect("create the CrossOver bin dir");
    for name in ["wine", "wineserver"] {
        std::fs::write(bin.join(name), b"").expect("create a CrossOver binary");
    }
}

#[test]
fn rf1_selects_the_per_game_bottle_with_cx_bottle() {
    let home = FakeHome::new("crossover-env-");
    for (branch, settings) in branches(&home) {
        let env = wine_env(&home, &settings);
        assert_eq!(
            env.get("CX_BOTTLE").map(String::as_str),
            Some(BOTTLE),
            "{branch}: CX_BOTTLE is the per-game bottle"
        );
    }
}

#[test]
fn rf1_leaves_no_wineprefix_or_wineserver_outside_the_bottle_directory() {
    let home = FakeHome::new("crossover-env-");
    let bottle = bottle_dir(&home);
    for (branch, settings) in branches(&home) {
        let mut merged = base_env(&settings);
        merged.extend(wine_env(&home, &settings));
        for name in ["WINEPREFIX", "WINESERVER", "WINELOADER"] {
            if let Some(value) = merged.get(name) {
                assert!(
                    inside(value, &bottle),
                    "{branch}: {name}={value} points outside the bottle directory {}",
                    bottle.display()
                );
            }
        }
    }
}

#[test]
fn rf1_does_not_carry_a_proton_or_toolkit_variable() {
    let home = FakeHome::new("crossover-env-");
    for (branch, settings) in branches(&home) {
        let mut merged = base_env(&settings);
        merged.extend(wine_env(&home, &settings));
        for name in [
            "STEAM_COMPAT_DATA_PATH",
            "STEAM_COMPAT_CLIENT_INSTALL_PATH",
            "PROTONPATH",
        ] {
            assert!(
                !merged.contains_key(name),
                "{branch}: the CrossOver env carries {name}"
            );
        }
    }
}

#[tokio::test]
async fn rf1_runs_crossover_wine_under_the_crossover_bin_dir() {
    let home = FakeHome::new("crossover-env-");
    install_crossover(&home);
    let ctx = wine_ctx(&home);
    let host = WineHost::default();
    let bin = cx_bin(&home);
    for (branch, settings) in branches(&home) {
        let args = WineCommandArgs {
            game_settings: Some(settings),
            command_parts: vec!["start".to_string()],
            skip_prefix_check: true,
            ..WineCommandArgs::default()
        };
        let prepared = prepare_wine_command(&ctx, args, &host)
            .await
            .unwrap_or_else(|e| panic!("{branch}: the command is refused: {e:?}"));
        assert_eq!(
            Path::new(&prepared.program),
            bin.join("wine"),
            "{branch}: the spawned program is CrossOver's wine"
        );
        assert!(inside(&prepared.program, &bin), "{branch}");
        assert_eq!(
            prepared.wineserver.as_deref().map(Path::new),
            Some(bin.join("wineserver").as_path()),
            "{branch}: the wineserver that follows a waited command is CrossOver's"
        );
        // The command's whole environment, the real one the child gets, keeps the bottle and no prefix outside it.
        let env: BTreeMap<_, _> = prepared.env.iter().cloned().collect();
        assert_eq!(env.get("CX_BOTTLE").map(String::as_str), Some(BOTTLE));
        for name in ["WINEPREFIX", "WINESERVER", "WINELOADER"] {
            if let Some(value) = env.get(name) {
                assert!(
                    inside(value, &bottle_dir(&home)),
                    "{branch}: the spawn env's {name}={value} points outside the bottle"
                );
            }
        }
    }
}

#[test]
fn rf1_the_two_branches_build_the_same_env() {
    let home = FakeHome::new("crossover-env-");
    let [(_, plain), (_, restore)] = branches(&home);
    assert_eq!(wine_env(&home, &plain), wine_env(&home, &restore));
    assert_eq!(base_env(&plain), base_env(&restore));
}
