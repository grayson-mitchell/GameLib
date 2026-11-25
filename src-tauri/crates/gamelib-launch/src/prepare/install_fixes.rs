//! `installFixes` (`launcher.ts`): the tier-1 known fix's winetricks verbs and programs, run in the game's
//! prefix when this launch added the game to it.
//!
//! The fix is read through `gamelib-knownfix` (the one owner of the fix data; no fix, nothing to do). A fix
//! with `winetricks` pushes `gameStatusUpdate` `{ status: "winetricks" }` and installs the verbs one after
//! another; a fix with `runInPrefix` pushes `{ status: "redist", context: "FIXES" }` and runs each program,
//! `<install path>/<file>`, through one wine command on the game (`wait`, the `run` verb). The pushes go
//! through the engine context's emitter: the TS also emitted each on an in-process bus, but nothing listens
//! there (D-23: `git grep "events.on('gameStatusUpdate'"` finds only a test), so the renderer push is the
//! whole effect.
//!
//! D-21: the verbs and the programs run through `gamelib-wine` as Helper spawns; nothing here spawns.

use gamelib_engine::jsutil::{js_truthy, path_join};
use gamelib_knownfix::reader::read_known_fixes;
use gamelib_knownfix::types::Runner;
use serde_json::{json, Value};

use super::deps::{ForGameRequest, PrepareDeps};
use crate::ctx::LaunchCtx;

/// The strings of a fix's list; anything that is not a list of strings holds none (the file's own shape is
/// the reader's to check, and a value no verb or program can come from runs nothing).
fn strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

/// The `gameStatusUpdate` push a fix step sends (`sendGameStatusUpdate`).
fn push_status(
    ctx: &LaunchCtx,
    app_name: &str,
    runner: Runner,
    status: &str,
    context: Option<&str>,
) {
    let mut payload = json!({
        "appName": app_name,
        "runner": runner.as_str(),
        "status": status,
    });
    if let Some(context) = context {
        payload["context"] = json!(context);
    }
    ctx.engine.emitter.emit("gameStatusUpdate", vec![payload]);
}

/// The game a fix is installed for.
#[derive(Debug, Clone, Copy)]
pub struct FixGame<'a> {
    pub app_name: &'a str,
    pub runner: Runner,
    /// `gameInfo.folder_name`.
    pub folder_name: Option<&'a str>,
    /// `gameInfo.install?.install_path`.
    pub install_path: Option<&'a str>,
}

/// `installFixes`. `settings` are the launch settings the step holds and `stored` the game's own stored settings
/// (what the tool-settings resolver starts from); `Err` is the fixed `failed` reason: a `runInPrefix` program of a
/// game that has no install path (the TS threw), or a command the wine core refused to shape.
pub async fn install_fixes(
    ctx: &LaunchCtx,
    deps: &dyn PrepareDeps,
    game: FixGame<'_>,
    settings: &Value,
    stored: &Value,
) -> Result<(), &'static str> {
    const FAILED: &str = "failed";
    let FixGame {
        app_name,
        runner,
        folder_name,
        install_path,
    } = game;

    let Some(fix) = read_known_fixes(&ctx.knownfix, app_name, runner) else {
        return Ok(());
    };

    if fix.winetricks.as_ref().is_some_and(js_truthy) {
        push_status(ctx, app_name, runner, "winetricks", None);
        // The verbs install one after another in Rust; the outcome of each is its own (a failed verb does not
        // stop the rest, and the TS did not look at the words).
        let verbs = fix.winetricks.as_ref().map(strings).unwrap_or_default();
        deps.winetricks_install(settings.clone(), runner, app_name.to_string(), verbs)
            .await;
    }

    if fix.run_in_prefix.as_ref().is_some_and(js_truthy) {
        push_status(ctx, app_name, runner, "redist", Some("FIXES"));
        for file in fix.run_in_prefix.as_ref().map(strings).unwrap_or_default() {
            let install_path = install_path.ok_or(FAILED)?;
            let full_path = path_join(&[install_path, &file]);
            let resolved = deps
                .resolve_tool_settings(runner, app_name.to_string(), stored.clone())
                .await;
            deps.run_wine_command_for_game(ForGameRequest {
                runner,
                app_name: app_name.to_string(),
                resolved,
                // A store whose games always have a wine prefix is eligible by construction; only a Steam
                // title has to prove it has its own bottle, and a Steam launch never reaches this step.
                steam_eligible: runner != Runner::Steam,
                folder_name: folder_name.map(str::to_string),
                install_path: Some(install_path.to_string()),
                command_parts: vec![full_path],
                wait: true,
                proton_verb: "run".to_string(),
            })
            .await
            .map_err(|_| FAILED)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    use gamelib_core::clock::SystemClock;
    use gamelib_core::emitter::FrontendEmitter;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
    use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
    use gamelib_info::http::ReqwestHttp;
    use gamelib_knownfix::ctx::KnownFixCtx;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use gamelib_wine::ctx::WineCtx;
    use gamelib_wine::wine_cmd::WineHost;

    use super::super::deps::testing::{Call, ScriptedPrepareDeps};

    /// An emitter that writes its pushes into the same list the scripted deps write their calls into.
    struct OrderedEmitter(Arc<Mutex<Vec<String>>>);

    impl FrontendEmitter for OrderedEmitter {
        fn emit(&self, channel: &str, args: Vec<Value>) {
            self.0.lock().unwrap().push(format!(
                "push {channel} {}",
                args[0]["status"].as_str().unwrap()
            ));
        }
    }

    fn ctx_over(home: &FakeHome, order: Arc<Mutex<Vec<String>>>) -> LaunchCtx {
        let root = home.root().to_path_buf();
        let engine = Arc::new(
            EngineCtx::new(
                Arc::new(StoreHost::new()),
                Arc::new(SystemClock),
                Platform::Linux,
                EnginePaths {
                    tools_path: root.join("tools"),
                    user_data: root.join("data"),
                    app_folder: root.join("app"),
                    user_home: root.clone(),
                    temp: root.join("tmp"),
                },
                Shutdown::new(),
            )
            .with_emitter(Arc::new(OrderedEmitter(order))),
        );
        let knownfix = Arc::new(KnownFixCtx::new(
            engine.clone(),
            None,
            "https://relay.test",
            "t",
        ));
        let wine = Arc::new(WineCtx::new(engine.clone(), root.join("runtimes")));
        let info = Arc::new(InfoCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            InfoPlatform::Linux,
            InfoPaths {
                app_folder: root.join("app"),
                user_data: root.join("app"),
                temp: root.join("tmp"),
                public_dir: None,
            },
            "t".to_string(),
            Shutdown::new(),
            Arc::new(ReqwestHttp::new()),
        ));
        LaunchCtx::new(engine, knownfix, wine, info)
    }

    fn run(fix: Option<&str>) -> Vec<String> {
        let home = FakeHome::new("install-fixes-");
        let order = Arc::new(Mutex::new(Vec::new()));
        let ctx = ctx_over(&home, order.clone());
        if let Some(text) = fix {
            let local = home.root().join("app/fixes/local");
            std::fs::create_dir_all(&local).unwrap();
            std::fs::write(local.join("app1-gog.json"), text).unwrap();
        }
        let host = WineHost::default();
        let mut deps = ScriptedPrepareDeps::new(&ctx, &host);
        let seen = order.clone();
        deps.observer = Some(Box::new(move |call: &Call| {
            let name = match call {
                Call::WinetricksInstall(..) => "call winetricks_install",
                Call::ResolveToolSettings(..) => "call resolve_tool_settings",
                Call::RunWineCommandForGame(..) => "call run_wine_command_for_game",
                _ => return,
            };
            seen.lock().unwrap().push(name.to_string());
        }));
        let settings = serde_json::json!({"winePrefix": "/p"});
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(install_fixes(
                &ctx,
                &deps,
                FixGame {
                    app_name: "app1",
                    runner: Runner::Gog,
                    folder_name: Some("Folder"),
                    install_path: Some("/games/app1"),
                },
                &settings,
                &settings,
            ))
            .unwrap();
        let order = order.lock().unwrap().clone();
        order
    }

    #[test]
    fn a_game_with_no_fix_pushes_and_runs_nothing() {
        assert!(run(None).is_empty());
        assert!(run(Some(r#"{"title": "only a title"}"#)).is_empty());
    }

    #[test]
    fn the_winetricks_status_is_pushed_before_the_verbs_install_and_the_redist_status_before_each_program(
    ) {
        assert_eq!(
            run(Some(
                r#"{"winetricks": ["corefonts"], "runInPrefix": ["a.exe", "sub/b.exe"]}"#
            )),
            vec![
                "push gameStatusUpdate winetricks",
                "call winetricks_install",
                "push gameStatusUpdate redist",
                "call resolve_tool_settings",
                "call run_wine_command_for_game",
                "call resolve_tool_settings",
                "call run_wine_command_for_game",
            ]
        );
    }
}
