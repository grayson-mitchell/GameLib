//! The shell's side of the known-fix services (Phase 88, SVC-03): the one [`KnownFixCtx`], and the
//! `knownfix` native channels, over the Tauri-free `gamelib-knownfix` crate.
//!
//! D-20: one `Arc<KnownFixCtx>` is built in `run_setup` right after [`wine_dispatch::install`], from the
//! engine context, the bundled `<public>/fixes` directory, the relay URL (`GAMELIB_FIX_RELAY_URL`, read
//! once here, else the crate's deployed default) and the app version. Nothing here spawns a process or
//! waits without a bound: every op runs inside the crate's `guarded` wrapper (a shutdown registrant raced
//! against the token) on the blocking pool, because a fix read is file I/O. Until [`install`] has run, a
//! channel answers `<channel>: not ready`.
//!
//! D-19, D-23: `getKnownFixes` and `getGamelibFixStatus` keep their names and result shapes, so the
//! renderer is untouched; the sidecar no longer registers either, so each has one owner.
//!
//! T-88-17: `appName` and `runner` are the renderer's. They are decoded before the context is looked at
//! (a bad call is rejected the same way before and after the install), the runner against the closed set
//! of five, and a rejection is a fixed literal that never echoes the input. The crate then refuses an
//! `appName` that resolves outside a layer directory before it opens anything (WR-06).

use super::*;

use gamelib_knownfix::ctx::{KnownFixCtx, DEFAULT_RELAY_URL};

/// The one context, set once by [`install`].
static KNOWNFIX_CTX: OnceLock<Arc<KnownFixCtx>> = OnceLock::new();

/// The installed context, or `None` before [`install`] (and in a unit test that built its own).
pub(crate) fn knownfix_ctx() -> Option<&'static Arc<KnownFixCtx>> {
    KNOWNFIX_CTX.get()
}

/// The relay URL the context carries: the environment's override when it is set and non-empty (the
/// TS `process.env.GAMELIB_FIX_RELAY_URL || default`), else the crate's deployed default.
fn relay_url_from(env_value: Option<String>) -> String {
    env_value
        .filter(|url| !url.is_empty())
        .unwrap_or_else(|| DEFAULT_RELAY_URL.to_string())
}

/// Builds the known-fix context from the engine context and stores it, with the bundled `public`
/// directory its `fixes` layer is read from. A no-op when the engine context was not installed (no home
/// directory), so every known-fix channel answers not ready. A second call is ignored (the first
/// context stays).
pub(crate) fn install(public_dir: Option<std::path::PathBuf>) {
    let Some(engine) = engine_dispatch::engine_ctx() else {
        return;
    };
    let ctx = build_ctx(
        Arc::clone(engine),
        public_dir,
        wine_dispatch::wine_ctx().cloned(),
    );
    let _ = KNOWNFIX_CTX.set(Arc::new(ctx));
}

/// The known-fix context over `engine`: the bundled `<public>/fixes` layer, the relay URL, the app version
/// and, when the wine context is installed, the wine command core the registry fixes spawn their `reg add`
/// through (D-21: a `gamelib-proc` helper, through the engine's spawn seam) with the host facts the shell
/// took (the process environment, the Darwin release). Without a wine context the two registry ops answer
/// `<op>:not-ready`.
fn build_ctx(
    engine: Arc<gamelib_engine::ctx::EngineCtx>,
    public_dir: Option<std::path::PathBuf>,
    wine: Option<Arc<gamelib_wine::ctx::WineCtx>>,
) -> KnownFixCtx {
    let ctx = KnownFixCtx::new(
        engine,
        public_dir.map(|dir| dir.join("fixes")),
        relay_url_from(std::env::var("GAMELIB_FIX_RELAY_URL").ok()),
        native_handlers::app_version(),
    );
    match wine {
        Some(wine) => {
            let host = serde_json::from_value::<gamelib_wine::wine_cmd::WineHost>(
                wine_dispatch::wine_run_host(),
            )
            .unwrap_or_default();
            ctx.with_wine(wine, host)
        }
        None => ctx,
    }
}

/// What a rejected argument looks like: the JSON path and the zod-vocabulary code. Fixed literals
/// only, never the renderer's value (T-88-17).
type Rejection = (&'static str, &'static str);

/// The longest `appName` the renderer may send, in UTF-16 units (`nonEmptyString(256)`).
const APP_NAME_MAX_UTF16: usize = 256;

/// Decodes `[appName, runner]`: exactly two arguments, an app name of 1 to 256 UTF-16 units and one of
/// the five runner names. Returns the two strings.
fn parse_game_args(args: &[Value]) -> Result<(&str, &str), Rejection> {
    let [app_name, runner] = args else {
        return Err(("(args)", "invalid_type"));
    };
    let Value::String(app_name) = app_name else {
        return Err(("0", "invalid_type"));
    };
    if app_name.is_empty() {
        return Err(("0", "too_small"));
    }
    if app_name.encode_utf16().count() > APP_NAME_MAX_UTF16 {
        return Err(("0", "too_big"));
    }
    let Value::String(runner) = runner else {
        return Err(("1", "invalid_type"));
    };
    if gamelib_knownfix::types::Runner::parse(runner).is_none() {
        return Err(("1", "invalid_value"));
    }
    Ok((app_name, runner))
}

/// Runs `op` over `args` on the blocking pool. The crate's own async `dispatch` is driven with
/// `block_on` there (never `dispatch_sync`, which refuses a thread inside a runtime), so a file read
/// stays off the async workers and the op still holds its shutdown registrant.
async fn run_knownfix_op(
    ctx: Arc<KnownFixCtx>,
    op: &'static str,
    args: Vec<Value>,
    failed: &'static str,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        tauri::async_runtime::block_on(gamelib_knownfix::dispatch(op, &args, &ctx))
    })
    .await
    .map_err(|_| failed.to_string())?
}

/// The shared body of the two reader channels: decode first, then run `op` over the two decoded strings.
/// `ctx` is the installed context, passed in so a test drives this over its own.
async fn game_channel(
    ctx: Option<Arc<KnownFixCtx>>,
    channel: &'static str,
    op: &'static str,
    failed: &'static str,
    args: Vec<Value>,
) -> Result<Value, String> {
    let (app_name, runner) =
        parse_game_args(&args).map_err(|(path, code)| invalid_args(channel, &[path], &[code]))?;
    let (app_name, runner) = (app_name.to_string(), runner.to_string());
    let ctx = ctx.ok_or_else(|| format!("{channel}: not ready"))?;
    run_knownfix_op(
        ctx,
        op,
        vec![Value::String(app_name), Value::String(runner)],
        failed,
    )
    .await
}

/// The native `getKnownFixes` handler (slice `knownfix`, D-19): the tier-1 fix for one game, local >
/// bundled > remote, allow-listed, or `null`, answered by `knownfix_read`.
pub(crate) fn get_known_fixes(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(game_channel(
        knownfix_ctx().cloned(),
        "getKnownFixes",
        "knownfix_read",
        "getKnownFixes: the lookup did not finish",
        args,
    ))
}

/// The native `getGamelibFixStatus` handler (slice `knownfix`, D-19): what the game page's GameLib row
/// shows, `{ origin, launchNotice? }` or `null`, answered by `knownfix_status` (local and bundled layers
/// only, tier 1 then tier 2; the remote layer never counts).
pub(crate) fn get_gamelib_fix_status(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(game_channel(
        knownfix_ctx().cloned(),
        "getGamelibFixStatus",
        "knownfix_status",
        "getGamelibFixStatus: the lookup did not finish",
        args,
    ))
}

/// Runs `op` over `args` for a `rustInvoke` arm. These arms run on the dispatcher's worker thread, never
/// inside a runtime, so the crate's own `dispatch_sync` drives the op there. `ctx` is the installed context,
/// passed in so a test drives this over its own; before [`install`] the answer is `<op>:not-ready`.
fn rpc_knownfix_op(
    ctx: Option<&Arc<KnownFixCtx>>,
    op: &'static str,
    args: &[Value],
) -> Result<Value, String> {
    let ctx = ctx.ok_or_else(|| format!("{op}:not-ready"))?;
    gamelib_knownfix::dispatch_sync(op, args, ctx)
}

/// The body of the `knownfix_launch_overrides` arm over a given context: the generated decode (one object,
/// `{appName, runner, installPath}`, the runner one of the five names) and an arity check first, so a bad
/// call is rejected the same fixed `<op>:bad-args` literal before and after the install and never echoes the
/// sidecar's value, then the crate, which decodes the object strictly again and refuses an `exeOverride` that
/// resolves outside the install folder (T-88-31).
fn launch_overrides_over(ctx: Option<&Arc<KnownFixCtx>>, args: &[Value]) -> Result<Value, String> {
    KnownfixLaunchOverridesArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("knownfix_launch_overrides:bad-args".to_string());
    }
    rpc_knownfix_op(ctx, "knownfix_launch_overrides", args)
}

/// The `knownfix_launch_overrides` `rustInvoke` arm (the managers' `readKnownFixLaunchOverrides` shim,
/// 88-12): what a non-Steam launch applies from the game's known fix, `{launchArgs, exeOverride?}`. A disk
/// read, so the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_knownfix_launch_overrides(args: &[Value]) -> Result<Value, String> {
    launch_overrides_over(knownfix_ctx(), args)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use serde_json::json;

    /// A host that does nothing: the known-fix handlers never reach the native host.
    struct NoHost;
    impl crate::native_router::NativeHost for NoHost {
        fn open_url(&self, _url: String) {}
        fn reveal_path(&self, _path: String) {}
    }

    /// A context over a fake HOME: the app folder is `<home>/app`, the bundled layer `<home>/public/fixes`.
    fn ctx_over(home: &FakeHome) -> Arc<KnownFixCtx> {
        let root = home.root().to_path_buf();
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Linux,
            EnginePaths {
                app_folder: root.join("app"),
                user_data: root.join("app"),
                tools_path: root.join("app").join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        );
        Arc::new(KnownFixCtx::new(
            Arc::new(engine),
            Some(root.join("public").join("fixes")),
            relay_url_from(None),
            "1.2.3",
        ))
    }

    #[test]
    fn knownfix_registry_ops_are_not_ready_without_a_wine_context_and_answer_null_with_one() {
        let home = FakeHome::new("knownfix-shell-");
        let without = ctx_over(&home);
        assert!(without.wine.is_none());
        let args = vec![json!({"appName": "1234", "runner": "gog", "gameSettings": {}})];
        let ask = |ctx: &Arc<KnownFixCtx>| {
            tauri::async_runtime::block_on(run_knownfix_op(
                Arc::clone(ctx),
                "knownfix_apply_profile_registry",
                args.clone(),
                "the registry step did not finish",
            ))
        };
        assert_eq!(
            ask(&without),
            Err("knownfix_apply_profile_registry:not-ready".to_string())
        );
        // The shell's builder installs the wine context and the host facts with it.
        let engine = Arc::clone(&without.engine);
        let wine = Arc::new(gamelib_wine::ctx::WineCtx::new(
            Arc::clone(&engine),
            home.root().join("runtime"),
        ));
        let with = Arc::new(build_ctx(engine, None, Some(wine)));
        assert!(with.wine.is_some());
        assert!(
            with.wine_host.env.get("PATH").is_some() || std::env::var_os("PATH").is_none(),
            "the host carries the process environment the shell took"
        );
        assert_eq!(ask(&with), Ok(Value::Null));
        // The bridge op, from the same context: a game with no Steam profile is a no-op.
        let bridge = tauri::async_runtime::block_on(run_knownfix_op(
            with,
            "knownfix_apply_registry",
            vec![json!({"appId": "1", "label": "Steam 1", "gameSettings": {}, "bottleDir": null})],
            "the registry step did not finish",
        ));
        assert_eq!(bridge, Ok(Value::Null));
    }

    #[test]
    fn the_relay_url_is_the_override_when_set_and_the_default_otherwise() {
        assert_eq!(relay_url_from(None), DEFAULT_RELAY_URL);
        assert_eq!(relay_url_from(Some(String::new())), DEFAULT_RELAY_URL);
        assert_eq!(
            relay_url_from(Some("http://127.0.0.1:8787/v1/reports".to_string())),
            "http://127.0.0.1:8787/v1/reports"
        );
    }

    #[test]
    fn game_args_are_one_app_name_and_one_runner() {
        assert_eq!(
            parse_game_args(&[json!("1234"), json!("gog")]),
            Ok(("1234", "gog"))
        );
        // The bound is inclusive: 256 UTF-16 units.
        assert!(parse_game_args(&[json!("x".repeat(256)), json!("steam")]).is_ok());
        for (args, want) in [
            (vec![], ("(args)", "invalid_type")),
            (vec![json!("a")], ("(args)", "invalid_type")),
            (
                vec![json!("a"), json!("gog"), json!("gog")],
                ("(args)", "invalid_type"),
            ),
            (vec![json!(1), json!("gog")], ("0", "invalid_type")),
            (vec![json!(""), json!("gog")], ("0", "too_small")),
            (vec![json!("x".repeat(257)), json!("gog")], ("0", "too_big")),
            (vec![json!("a"), json!(1)], ("1", "invalid_type")),
            (vec![json!("a"), json!("epic")], ("1", "invalid_value")),
            (vec![json!("a"), json!("GOG")], ("1", "invalid_value")),
            (vec![json!("a"), json!("")], ("1", "invalid_value")),
        ] {
            assert_eq!(parse_game_args(&args), Err(want), "{args:?}");
        }
    }

    #[test]
    fn the_handler_answers_not_ready_before_install_and_validates_first() {
        assert!(knownfix_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        let not_ready = tauri::async_runtime::block_on(get_known_fixes(
            Arc::clone(&router_ctx),
            vec![json!("1234"), json!("gog")],
        ));
        assert_eq!(not_ready, Err("getKnownFixes: not ready".to_string()));
        let not_ready = tauri::async_runtime::block_on(get_gamelib_fix_status(
            Arc::clone(&router_ctx),
            vec![json!("1234"), json!("gog")],
        ));
        assert_eq!(not_ready, Err("getGamelibFixStatus: not ready".to_string()));
        let secret = "SECRET-RUNNER-".repeat(40);
        for bad in [
            tauri::async_runtime::block_on(get_known_fixes(
                Arc::clone(&router_ctx),
                vec![json!("1234"), json!(secret)],
            )),
            tauri::async_runtime::block_on(get_known_fixes(Arc::clone(&router_ctx), vec![])),
            tauri::async_runtime::block_on(get_gamelib_fix_status(
                Arc::clone(&router_ctx),
                vec![json!("1234"), json!(secret)],
            )),
            tauri::async_runtime::block_on(get_gamelib_fix_status(
                Arc::clone(&router_ctx),
                vec![json!(5), json!("gog")],
            )),
        ] {
            let error = bad.unwrap_err();
            assert!(
                error.starts_with(crate::ipc_contract::IPC_INVALID_ARGS_MARKER),
                "{error}"
            );
            assert!(!error.contains("SECRET"), "{error}");
        }
    }

    #[test]
    fn get_known_fixes_answers_null_for_an_unknown_game_and_the_fix_for_a_seeded_one() {
        let home = FakeHome::new("knownfix-shell-");
        let ctx = ctx_over(&home);
        let (op, channel, failed) = (
            "knownfix_read",
            "getKnownFixes",
            "getKnownFixes: the lookup did not finish",
        );
        let ask = |app: &str, runner: &str| {
            tauri::async_runtime::block_on(game_channel(
                Some(Arc::clone(&ctx)),
                channel,
                op,
                failed,
                vec![json!(app), json!(runner)],
            ))
        };
        assert_eq!(ask("1234", "gog"), Ok(Value::Null));
        let bundled = ctx.paths.bundled.clone().unwrap();
        std::fs::create_dir_all(&bundled).unwrap();
        std::fs::write(
            bundled.join("1234-gog.json"),
            r#"{"title":"Seeded","winetricks":["vcrun2019"],"registry":[]}"#,
        )
        .unwrap();
        assert_eq!(
            ask("1234", "gog"),
            Ok(json!({"title": "Seeded", "winetricks": ["vcrun2019"]}))
        );
        // A traversing name is answered null, never a read of the file the traversal would land on.
        std::fs::create_dir_all(&ctx.paths.fixes).unwrap();
        std::fs::write(ctx.paths.fixes.join("x-gog.json"), r#"{"title":"escaped"}"#).unwrap();
        assert_eq!(ask("../x", "gog"), Ok(Value::Null));
        // The same file is not reachable by a name that stays inside the layer either.
        assert_eq!(ask("x", "gog"), Ok(json!({"title": "escaped"})));
    }

    #[test]
    fn get_gamelib_fix_status_answers_null_the_local_origin_and_never_counts_the_remote_layer() {
        let home = FakeHome::new("knownfix-shell-");
        let ctx = ctx_over(&home);
        let ask = |app: &str, runner: &str| {
            tauri::async_runtime::block_on(game_channel(
                Some(Arc::clone(&ctx)),
                "getGamelibFixStatus",
                "knownfix_status",
                "getGamelibFixStatus: the lookup did not finish",
                vec![json!(app), json!(runner)],
            ))
        };
        assert_eq!(ask("1234", "gog"), Ok(Value::Null));
        // A fix that exists only in the remote layer is not a GameLib fix.
        std::fs::create_dir_all(&ctx.paths.fixes).unwrap();
        std::fs::write(
            ctx.paths.fixes.join("1234-gog.json"),
            r#"{"title":"remote"}"#,
        )
        .unwrap();
        assert_eq!(ask("1234", "gog"), Ok(Value::Null));
        std::fs::create_dir_all(&ctx.paths.local).unwrap();
        std::fs::write(
            ctx.paths.local.join("1234-gog.json"),
            r#"{"title":"local","launchNotice":"  Needs a restart.  "}"#,
        )
        .unwrap();
        assert_eq!(
            ask("1234", "gog"),
            Ok(json!({"origin": "local", "launchNotice": "Needs a restart."}))
        );
        // Sideload has no store word, so the probe answers null for it.
        assert_eq!(ask("1234", "sideload"), Ok(Value::Null));
    }

    #[test]
    fn launch_overrides_answers_not_ready_before_install_and_rejects_a_bad_call_with_a_fixed_literal(
    ) {
        let good = json!({"appName": "1234", "runner": "gog", "installPath": null});
        // No context yet: a well-formed call is not ready.
        assert_eq!(
            launch_overrides_over(None, std::slice::from_ref(&good)),
            Err("knownfix_launch_overrides:not-ready".to_string())
        );
        // A bad call is the same fixed literal with or without a context, and never echoes the input.
        let secret = "SECRET-RUNNER-".repeat(10);
        let home = FakeHome::new("knownfix-shell-");
        let ctx = ctx_over(&home);
        for ctx in [None, Some(&ctx)] {
            for bad in [
                vec![],
                vec![good.clone(), good.clone()],
                vec![json!("1234"), json!("gog")],
                vec![json!({"runner": "gog", "installPath": null})],
                vec![json!({"appName": "1234", "runner": secret, "installPath": null})],
                vec![json!({"appName": 1, "runner": "gog", "installPath": null})],
            ] {
                let error = launch_overrides_over(ctx, &bad).unwrap_err();
                assert_eq!(error, "knownfix_launch_overrides:bad-args", "{bad:?}");
                assert!(!error.contains("SECRET"), "{error}");
            }
        }
    }

    #[test]
    fn launch_overrides_answers_the_launch_args_and_a_checked_exe_override_over_a_context() {
        let home = FakeHome::new("knownfix-shell-");
        let ctx = ctx_over(&home);
        let ask = |install: Value| {
            launch_overrides_over(
                Some(&ctx),
                &[json!({"appName": "1234", "runner": "gog", "installPath": install})],
            )
        };
        // No fix: nothing to apply.
        assert_eq!(
            ask(Value::Null),
            Ok(json!({"launchArgs": [], "exeOverride": null}))
        );
        let bundled = ctx.paths.bundled.clone().unwrap();
        std::fs::create_dir_all(&bundled).unwrap();
        std::fs::write(
            bundled.join("1234-gog.json"),
            r#"{"launchArgs":["-windowed"],"exeOverride":"bin/game.exe"}"#,
        )
        .unwrap();
        // The install folder is unknown: the args stay, the exe override is ignored.
        assert_eq!(
            ask(Value::Null),
            Ok(json!({"launchArgs": ["-windowed"], "exeOverride": null}))
        );
        // An absent `installPath` is the same as `null`.
        assert_eq!(
            launch_overrides_over(Some(&ctx), &[json!({"appName": "1234", "runner": "gog"})]),
            Ok(json!({"launchArgs": ["-windowed"], "exeOverride": null}))
        );
        // A real file inside the install folder is answered as the lexical path; one outside is dropped.
        let install = home.root().join("games").join("g1234");
        std::fs::create_dir_all(install.join("bin")).unwrap();
        std::fs::write(install.join("bin").join("game.exe"), b"MZ").unwrap();
        let install_text = install.to_string_lossy().into_owned();
        let got = ask(json!(install_text)).unwrap();
        assert_eq!(got["launchArgs"], json!(["-windowed"]));
        assert_eq!(
            got["exeOverride"],
            json!(install.join("bin/game.exe").to_string_lossy())
        );
    }
}
