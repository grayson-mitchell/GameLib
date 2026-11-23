//! The guards in front of a Wine command for a game (Phase 87, D-08 incident port, D-25 (c), T-87-77),
//! ported from the TS incident tests as behaviour: `runWineCommandOnGameGuard.test.ts` (the Steam
//! per-game-bottle guard of Pitfall 5 and quick 261110-vi4, the native-game guard, the `{}` game info
//! of 260907-f2g), `runWineCommandForPendingInstall.test.ts` (CR-04, sideload only) and
//! `rendererPathGuard.test.ts`'s `assertCommandParts` cases.
//!
//! Every case is proven in both directions: the input the guard must refuse starts no child and logs
//! one line, and the legitimate neighbour of it does start one. The TS source-text gate
//! (`runWineCommandOnGameGuard`) inspected text, not behaviour, and is not ported; it goes with
//! `tools/` in 87-37.
//!
//! Also here: `callTool`'s two tools spawn what the TS did (the argv, the working directory, `wait`
//! false) through the same guards, and the two ops answer fixed errors.

use std::path::PathBuf;
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::process::SpecOutput;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::sinks::EngineLog;
use gamelib_engine::testing::{RecordingLog, ScriptedSpecRunner};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use gamelib_wine::dispatch;
use gamelib_wine::tools::call_tool::{call_tool, CallToolArgs};
use gamelib_wine::wine_cmd::command::{
    assert_command_parts, run_wine_command_for_game, CommandShapeError, ForGameArgs, ForGameError,
    MAX_COMMAND_PARTS, MAX_COMMAND_PART_CHARS,
};
use gamelib_wine::wine_cmd::WineHost;
use serde_json::{json, Value};

const NOTHING: &str = r#"{"stdout":"","stderr":""}"#;

/// A context over a fake HOME holding a wine, its wineserver and a complete prefix, a scripted spawn
/// seam that answers every wine and wineserver spawn, and a recording log.
struct Rig {
    home: FakeHome,
    ctx: WineCtx,
    runner: Arc<ScriptedSpecRunner>,
    log: Arc<RecordingLog>,
    wine: PathBuf,
    wineserver: PathBuf,
    prefix: PathBuf,
}

fn rig(platform: Platform) -> Rig {
    let home = FakeHome::new("for-game-");
    let root = home.root().to_path_buf();
    let bin = root.join("tools/wine/Wine-9/bin");
    std::fs::create_dir_all(&bin).unwrap();
    let wine = bin.join("wine");
    let wineserver = bin.join("wineserver");
    std::fs::write(&wine, "").unwrap();
    std::fs::write(&wineserver, "").unwrap();
    // A complete prefix: the command must not go and create one (that would spawn wineboot).
    let prefix = root.join("prefix");
    for dir in ["dosdevices", "drive_c"] {
        std::fs::create_dir_all(prefix.join(dir)).unwrap();
    }
    for file in ["system.reg", "user.reg", "userdef.reg"] {
        std::fs::write(prefix.join(file), "").unwrap();
    }
    let ok = SpecOutput {
        code: Some(0),
        stdout: "ok".to_string(),
        ..SpecOutput::default()
    };
    let runner = Arc::new(
        ScriptedSpecRunner::new(Vec::new())
            .on_program(&wine.to_string_lossy(), ok.clone())
            .on_program(&wineserver.to_string_lossy(), ok.clone())
            .on_program("C:\\setup.exe", ok.clone())
            .on_program("setup.exe", ok),
    );
    let log = Arc::new(RecordingLog::new());
    let engine = EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        platform,
        EnginePaths {
            app_folder: root.clone(),
            user_data: root.clone(),
            tools_path: root.join("tools"),
            user_home: root.join("home"),
            temp: root.join("temp"),
        },
        Shutdown::new(),
    )
    .with_proc(runner.clone())
    .with_log(log.clone() as Arc<dyn EngineLog>);
    Rig {
        ctx: WineCtx::new(Arc::new(engine), root.join("runtime")),
        home,
        runner,
        log,
        wine,
        wineserver,
        prefix,
    }
}

impl Rig {
    fn settings(&self) -> Value {
        json!({
            "winePrefix": self.prefix,
            "wineVersion": {
                "type": "wine",
                "name": "Wine-9",
                "bin": self.wine,
                "wineserver": self.wineserver,
            },
        })
    }

    /// A gog game with an install path, run in the rig's bottle; `extra` overrides or adds keys.
    fn args(&self, extra: Value) -> ForGameArgs {
        let mut args = json!({
            "runner": "gog",
            "appName": "1207658930",
            "settings": self.settings(),
            "folderName": "Game Folder",
            "installPath": self.home.root().join("games/g"),
            "commandParts": ["winecfg"],
        });
        for (key, value) in extra.as_object().unwrap() {
            args[key] = value.clone();
        }
        serde_json::from_value(args).unwrap()
    }

    fn spawned(&self) -> usize {
        self.runner.spawns().len()
    }

    fn errors(&self) -> Vec<String> {
        self.log
            .lines()
            .into_iter()
            .filter(|(level, _)| *level == "error")
            .map(|(_, text)| text)
            .collect()
    }
}

/// Whether any line logged is one of the guards' refusals (a run may log other errors, such as the
/// fake wine having no library folders).
fn refused_by_a_guard(rig: &Rig) -> bool {
    rig.errors().iter().any(|line| {
        line.contains("Pitfall 5")
            || line.contains("native game")
            || line.contains("no resolved install path")
            || line.contains("no usable Wine environment")
            || line.contains("sideload only")
    })
}

async fn run(rig: &Rig, args: ForGameArgs) -> Result<Value, ForGameError> {
    run_wine_command_for_game(&rig.ctx, args, &WineHost::default())
        .await
        .map(|result| result.to_json())
}

fn nothing() -> Value {
    serde_json::from_str(NOTHING).unwrap()
}

// ---- the Steam per-game-bottle guard (Pitfall 5, 261110-vi4) ----

#[tokio::test]
async fn an_ineligible_steam_title_is_refused_with_the_pitfall_5_log_and_never_spawns() {
    let rig = rig(Platform::Linux);
    let args = rig.args(json!({ "runner": "steam", "appName": "620", "steamEligible": false }));
    assert_eq!(run(&rig, args).await.unwrap(), nothing());
    assert_eq!(rig.spawned(), 0);
    let errors = rig.errors();
    assert_eq!(errors.len(), 1, "{errors:?}");
    assert!(errors[0].contains("Pitfall 5"), "{errors:?}");
}

#[tokio::test]
async fn the_steam_guard_is_not_something_the_default_wins_over() {
    // No `steamEligible` key at all is "not eligible": the guard fails closed.
    let rig = rig(Platform::Linux);
    let args = rig.args(json!({ "runner": "steam", "appName": "620" }));
    assert_eq!(run(&rig, args).await.unwrap(), nothing());
    assert_eq!(rig.spawned(), 0);
}

#[tokio::test]
async fn an_eligible_steam_title_runs_in_exactly_the_settings_it_was_given() {
    let rig = rig(Platform::Linux);
    let args = rig.args(json!({ "runner": "steam", "appName": "620", "steamEligible": true }));
    let result = run(&rig, args).await.unwrap();
    assert_eq!(result["stdout"], "ok");
    let spawns = rig.runner.spawns();
    assert_eq!(spawns.len(), 1);
    assert_eq!(spawns[0].program, rig.wine.to_string_lossy());
    assert_eq!(spawns[0].argv, ["winecfg"]);
    assert_eq!(spawns[0].label, "wine-command");
    assert!(!refused_by_a_guard(&rig));
}

#[tokio::test]
async fn an_eligible_steam_title_with_no_usable_wine_does_not_spawn() {
    let rig = rig(Platform::Linux);
    let args = rig.args(json!({
        "runner": "steam", "appName": "620", "steamEligible": true,
        "settings": null, "unavailable": "no-engine",
    }));
    assert_eq!(run(&rig, args).await.unwrap(), nothing());
    assert_eq!(rig.spawned(), 0);
    let errors = rig.errors();
    assert_eq!(errors.len(), 1);
    assert!(errors[0].contains("no-engine"), "{errors:?}");
}

// ---- the native-game guard ----

#[tokio::test]
async fn a_native_game_is_refused_and_never_spawns() {
    let rig = rig(Platform::Linux);
    let refused = rig.args(json!({ "isNative": true }));
    assert_eq!(run(&rig, refused).await.unwrap(), nothing());
    assert_eq!(rig.spawned(), 0);
    assert_eq!(rig.errors(), ["runWineCommand called on native game!"]);

    // The neighbour: the same game, not native, runs.
    let allowed = rig.args(json!({ "isNative": false }));
    assert_eq!(run(&rig, allowed).await.unwrap()["stdout"], "ok");
    assert_eq!(rig.spawned(), 1);
}

#[tokio::test]
async fn the_steam_guard_runs_before_the_native_guard() {
    // A native, ineligible Steam title is refused as Pitfall 5, whatever the platform says.
    let rig = rig(Platform::Linux);
    let args = rig.args(json!({ "runner": "steam", "isNative": true }));
    assert_eq!(run(&rig, args).await.unwrap(), nothing());
    assert!(rig.errors()[0].contains("Pitfall 5"));
}

// ---- the `{}` game info (260907-f2g) ----

#[tokio::test]
async fn a_game_whose_info_carries_no_install_path_is_a_handled_no_op() {
    let rig = rig(Platform::Linux);
    for no_path in [json!(null), json!("")] {
        let args = rig.args(json!({ "installPath": no_path }));
        assert_eq!(run(&rig, args).await.unwrap(), nothing());
    }
    assert_eq!(rig.spawned(), 0);
    let errors = rig.errors();
    assert_eq!(errors.len(), 2);
    // Runner and appName, never a path (there is none to leak, and the message carries none of the
    // game's own).
    for line in &errors {
        assert!(
            line.contains("gog") && line.contains("1207658930"),
            "{line}"
        );
        assert!(!line.contains("games/g"), "{line}");
    }
}

#[tokio::test]
async fn a_game_with_an_install_path_reaches_wine_with_its_folder_and_start_folder() {
    let rig = rig(Platform::Linux);
    let start = rig.home.root().join("games/g/bin");
    let args = rig.args(json!({
        "commandParts": ["setup.exe", "/silent"],
        "startFolder": start,
    }));
    assert_eq!(run(&rig, args).await.unwrap()["stdout"], "ok");
    let spawns = rig.runner.spawns();
    assert_eq!(spawns.len(), 1, "wait is false: no wineserver wait");
    assert_eq!(spawns[0].argv, ["setup.exe", "/silent"]);
    assert_eq!(spawns[0].cwd.as_deref(), Some(start.as_path()));
    assert!(!refused_by_a_guard(&rig));
}

#[tokio::test]
async fn wait_true_also_waits_on_the_wineserver() {
    let rig = rig(Platform::Linux);
    let args = rig.args(json!({ "wait": true }));
    run(&rig, args).await.unwrap();
    let spawns = rig.runner.spawns();
    assert_eq!(spawns.len(), 2);
    assert_eq!(spawns[1].program, rig.wineserver.to_string_lossy());
    assert_eq!(spawns[1].argv, ["--wait"]);
}

#[tokio::test]
async fn no_usable_wine_runs_nothing_and_logs_the_reason_without_the_command() {
    let rig = rig(Platform::Linux);
    let args = rig.args(json!({
        "settings": null, "unavailable": "bottle-not-created",
        "commandParts": ["/secret/setup.exe"],
    }));
    assert_eq!(run(&rig, args).await.unwrap(), nothing());
    assert_eq!(rig.spawned(), 0);
    let logged = rig.errors().join("\n");
    assert!(logged.contains("bottle-not-created"), "{logged}");
    assert!(!logged.contains("/secret/setup.exe"), "{logged}");
}

#[tokio::test]
async fn naming_both_or_neither_of_settings_and_a_reason_is_ambiguous() {
    let rig = rig(Platform::Linux);
    let both = rig.args(json!({ "unavailable": "x" }));
    assert_eq!(run(&rig, both).await, Err(ForGameError::Ambiguous));
    let neither = rig.args(json!({ "settings": null }));
    assert_eq!(run(&rig, neither).await, Err(ForGameError::Ambiguous));
    assert_eq!(rig.spawned(), 0);
}

// ---- the pending install (CR-04) ----

#[tokio::test]
async fn a_pending_install_runs_in_the_resolved_bottle_as_runinprefix_with_the_callers_wait() {
    let rig = rig(Platform::Linux);
    // No install path, no folder: a sideload installer has no library entry yet.
    let args = rig.args(json!({
        "runner": "sideload", "appName": "abc", "pendingInstall": true, "wait": true,
        "installPath": null, "folderName": null,
        "commandParts": ["/x/setup.exe"],
    }));
    assert_eq!(run(&rig, args).await.unwrap()["stdout"], "ok");
    let spawns = rig.runner.spawns();
    assert_eq!(
        spawns.len(),
        2,
        "wait true: the command, then the wineserver"
    );
    assert_eq!(spawns[0].argv, ["/x/setup.exe"]);
    assert_eq!(
        spawns[0].env_set.get("PROTON_VERB").map(String::as_str),
        Some("runinprefix")
    );
}

#[tokio::test]
async fn a_pending_install_refuses_a_runner_other_than_sideload() {
    let rig = rig(Platform::Linux);
    let args = rig.args(json!({
        "runner": "legendary", "appName": "abc", "pendingInstall": true,
        "commandParts": ["/x/setup.exe"],
    }));
    assert_eq!(run(&rig, args).await.unwrap(), nothing());
    assert_eq!(rig.spawned(), 0);
    let errors = rig.errors();
    assert_eq!(errors.len(), 1);
    assert!(errors[0].contains("sideload only"), "{errors:?}");
}

#[tokio::test]
async fn an_unavailable_pending_install_logs_the_reason_without_the_exe_path() {
    let rig = rig(Platform::Linux);
    let args = rig.args(json!({
        "runner": "sideload", "appName": "abc", "pendingInstall": true,
        "settings": null, "unavailable": "bottle-not-created",
        "commandParts": ["/secret/setup.exe"],
    }));
    assert_eq!(run(&rig, args).await.unwrap(), nothing());
    assert_eq!(rig.spawned(), 0);
    let logged = rig.errors().join("\n");
    assert!(logged.contains("bottle-not-created"), "{logged}");
    assert!(!logged.contains("/secret/setup.exe"), "{logged}");
}

// ---- the commandParts shape guard (T-87-77) ----

fn shape_error(parts: Value) -> String {
    assert_command_parts(&parts).unwrap_err().0
}

#[test]
fn a_command_parts_that_is_not_a_non_empty_array_of_strings_is_rejected() {
    assert!(shape_error(json!("wine notepad.exe")).contains("must be an array, got string"));
    assert!(shape_error(json!(null)).contains("must be an array, got object"));
    assert!(shape_error(json!(42)).contains("got number"));
    assert!(shape_error(json!({ "0": "x" })).contains("must be an array"));
    assert!(shape_error(json!([])).contains("must not be empty"));
    // A non-string element would otherwise reach a child as "[object Object]".
    assert!(shape_error(json!(["notepad.exe", { "evil": true }])).contains("array of strings"));
    assert!(shape_error(json!(["notepad.exe", 1])).contains("array of strings"));
    assert!(shape_error(json!([null])).contains("array of strings"));
}

#[test]
fn the_size_bounds_are_256_entries_of_4096_characters_and_the_edge_passes() {
    assert_eq!((MAX_COMMAND_PARTS, MAX_COMMAND_PART_CHARS), (256, 4096));
    let part = "a".repeat(MAX_COMMAND_PART_CHARS);
    // The edge: 256 entries, each 4096 characters long.
    let edge = json!(vec![part.clone(); MAX_COMMAND_PARTS]);
    assert_eq!(
        assert_command_parts(&edge).unwrap().len(),
        MAX_COMMAND_PARTS
    );
    // One more entry, or one more character in an entry, is refused.
    let too_many = json!(vec![part.clone(); MAX_COMMAND_PARTS + 1]);
    assert!(shape_error(too_many).contains("must not exceed 256 entries, got 257"));
    let too_long = json!(["a".repeat(MAX_COMMAND_PART_CHARS + 1)]);
    assert!(shape_error(too_long).contains("must not exceed 4096 characters"));
    // The bound counts characters, not bytes: 4096 two-byte characters pass.
    let wide = json!(["é".repeat(MAX_COMMAND_PART_CHARS)]);
    assert!(assert_command_parts(&wide).is_ok());
}

#[test]
fn the_guard_is_a_shape_check_never_a_content_check() {
    let parts = json!([
        "notepad.exe",
        "C:\\Program Files\\Sid Meier's Civilization V\\save.txt",
        "--flag=\"quoted value\"; echo $HOME `id`",
    ]);
    assert_eq!(assert_command_parts(&parts).unwrap().len(), 3);
    assert_eq!(
        assert_command_parts(&json!(["winecfg"])).unwrap(),
        ["winecfg"]
    );
    // And the message never carries an argument's text.
    let message = shape_error(json!(["secret-argument", 7]));
    assert!(!message.contains("secret-argument"), "{message}");
}

#[tokio::test]
async fn a_bad_shape_is_an_error_before_any_other_guard_and_before_any_spawn() {
    let rig = rig(Platform::Linux);
    for bad in [
        json!([]),
        json!("wine x"),
        json!(["x", {}]),
        json!(vec!["a"; 257]),
    ] {
        // Even for a native game and an ineligible Steam title: the shape guard is first.
        let args = rig.args(json!({ "commandParts": bad, "isNative": true, "runner": "steam" }));
        let error = run(&rig, args).await.unwrap_err();
        assert!(matches!(
            error,
            ForGameError::CommandShape(CommandShapeError(_))
        ));
    }
    assert_eq!(rig.spawned(), 0);
    assert!(
        rig.errors().is_empty(),
        "a shape error is not a logged refusal"
    );
}

// ---- Windows: the program itself, as an argv array ----

#[tokio::test]
async fn on_windows_the_command_is_the_program_and_its_arguments_never_a_shell() {
    let rig = rig(Platform::Windows);
    let args = rig.args(json!({ "commandParts": ["C:\\setup.exe", "/S", "a b"] }));
    assert_eq!(run(&rig, args).await.unwrap()["stdout"], "ok");
    let spawns = rig.runner.spawns();
    assert_eq!(spawns.len(), 1);
    assert_eq!(spawns[0].program, "C:\\setup.exe");
    assert_eq!(spawns[0].argv, ["/S", "a b"]);
    assert!(!spawns[0].replace_env);
    // The shape guard still comes first.
    let bad = rig.args(json!({ "commandParts": [] }));
    assert!(run(&rig, bad).await.is_err());
    assert_eq!(rig.spawned(), 1);
}

// ---- callTool ----

fn tool(rig: &Rig, extra: Value) -> CallToolArgs {
    let mut args = json!({
        "tool": "winecfg",
        "runner": "gog",
        "appName": "1207658930",
        "settings": rig.settings(),
        "folderName": "Game Folder",
        "installPath": rig.home.root().join("games/g"),
    });
    for (key, value) in extra.as_object().unwrap() {
        args[key] = value.clone();
    }
    serde_json::from_value(args).unwrap()
}

async fn call(rig: &Rig, args: CallToolArgs) -> Result<Value, ForGameError> {
    call_tool(&rig.ctx, args, &WineHost::default()).await
}

#[tokio::test]
async fn winecfg_spawns_wine_with_winecfg_and_does_not_wait() {
    let rig = rig(Platform::Linux);
    assert_eq!(
        call(&rig, tool(&rig, json!({}))).await.unwrap(),
        Value::Null
    );
    let spawns = rig.runner.spawns();
    assert_eq!(spawns.len(), 1, "wait is false");
    assert_eq!(spawns[0].program, rig.wine.to_string_lossy());
    assert_eq!(spawns[0].argv, ["winecfg"]);
    assert_eq!(spawns[0].cwd, None);
}

#[tokio::test]
async fn run_exe_spawns_the_exe_in_its_own_directory() {
    let rig = rig(Platform::Linux);
    let exe = rig.home.root().join("installers/setup.exe");
    let args = tool(&rig, json!({ "tool": "runExe", "exe": exe }));
    assert_eq!(call(&rig, args).await.unwrap(), Value::Null);
    let spawns = rig.runner.spawns();
    assert_eq!(spawns.len(), 1);
    assert_eq!(spawns[0].argv, [exe.to_string_lossy().into_owned()]);
    assert_eq!(
        spawns[0].cwd.as_deref(),
        Some(rig.home.root().join("installers").as_path())
    );
}

#[tokio::test]
async fn run_exe_without_an_exe_runs_nothing() {
    let rig = rig(Platform::Linux);
    for exe in [json!(null), json!("")] {
        let args = tool(&rig, json!({ "tool": "runExe", "exe": exe }));
        assert_eq!(call(&rig, args).await.unwrap(), Value::Null);
    }
    assert_eq!(rig.spawned(), 0);
}

#[tokio::test]
async fn a_tool_goes_through_the_same_guards() {
    let rig = rig(Platform::Linux);
    let steam = tool(&rig, json!({ "runner": "steam", "appName": "620" }));
    assert_eq!(call(&rig, steam).await.unwrap(), Value::Null);
    let native = tool(&rig, json!({ "isNative": true }));
    assert_eq!(call(&rig, native).await.unwrap(), Value::Null);
    assert_eq!(rig.spawned(), 0);
    assert_eq!(rig.errors().len(), 2);
}

#[test]
fn a_tool_argument_is_strict() {
    let mut ok = json!({ "tool": "winecfg", "runner": "gog", "appName": "1" });
    assert!(serde_json::from_value::<CallToolArgs>(ok.clone()).is_ok());
    ok["nope"] = json!(1);
    assert!(serde_json::from_value::<CallToolArgs>(ok).is_err());
    let unknown = json!({ "tool": "regedit", "runner": "gog", "appName": "1" });
    assert!(serde_json::from_value::<CallToolArgs>(unknown).is_err());
}

// ---- the two ops ----

#[tokio::test]
async fn the_ops_answer_the_result_a_null_and_fixed_errors() {
    let rig = rig(Platform::Linux);
    let args = json!({
        "runner": "gog", "appName": "1", "settings": rig.settings(),
        "installPath": rig.home.root().join("games/g"), "commandParts": ["winecfg"],
    });
    let result = dispatch(
        "wine_run_command_for_game",
        std::slice::from_ref(&args),
        &rig.ctx,
    )
    .await
    .unwrap();
    assert_eq!(result["stdout"], "ok");

    let mut bad_shape = args.clone();
    bad_shape["commandParts"] = json!([]);
    assert_eq!(
        dispatch("wine_run_command_for_game", &[bad_shape], &rig.ctx).await,
        Err("wine_run_command_for_game:bad-command-parts".to_string())
    );
    let mut both = args.clone();
    both["unavailable"] = json!("x");
    assert_eq!(
        dispatch("wine_run_command_for_game", &[both], &rig.ctx).await,
        Err("wine_run_command_for_game:bad-args".to_string())
    );
    let mut unknown_key = args;
    unknown_key["extra"] = json!(1);
    assert_eq!(
        dispatch("wine_run_command_for_game", &[unknown_key], &rig.ctx).await,
        Err("wine_run_command_for_game:bad-args".to_string())
    );
    assert_eq!(
        dispatch("wine_run_command_for_game", &[], &rig.ctx).await,
        Err("wine_run_command_for_game:bad-args".to_string())
    );

    let tool_call = json!({
        "tool": "winecfg", "runner": "gog", "appName": "1", "settings": rig.settings(),
        "installPath": rig.home.root().join("games/g"),
    });
    assert_eq!(
        dispatch("wine_tool_call", &[tool_call], &rig.ctx).await,
        Ok(Value::Null)
    );
    assert_eq!(
        dispatch("wine_tool_call", &[json!({ "tool": "x" })], &rig.ctx).await,
        Err("wine_tool_call:bad-args".to_string())
    );
    assert_eq!(rig.spawned(), 2);
}
