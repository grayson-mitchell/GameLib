//! The shell's side of the launch services (Phase 88.1, SVC-03): the one [`LaunchCtx`], and the
//! `launch_*` `rustInvoke` arms over the Tauri-free `gamelib-launch` crate.
//!
//! D-20: one `Arc<LaunchCtx>` is built by [`install`] in `run_setup` right after
//! [`knownfix_dispatch::install`], from the engine, known-fix, wine and information contexts already installed
//! (the information context is the one `info_dispatch` owns, so the native system-information channel and the
//! launch log share one single-flight cache, 88.1-11). Nothing
//! here spawns a process or waits: the builder ops are pure computations or a disk read, so each
//! `rustInvoke` arm runs the crate's `dispatch_sync` on the dispatcher's worker thread and the sidecar keeps
//! them inside the 60 s `RUST_INVOKE_TIMEOUT_MS`. Until [`install`] has run, every arm answers
//! `<op>:not-ready`.
//!
//! D-19: each channel is reached from the managers through a shim in `launchrust/builders.ts`; there is no
//! sidecar fallback.
//!
//! T-88.1-13: the arguments are decoded by the generated type (a wrong shape is rejected the same fixed
//! `<op>:bad-args` literal before and after the install) and an arity check, and a rejection never echoes the
//! sidecar's value. The crate then decodes strictly again.
//!
//! T-88.1-14: the host facts the env builders read (the process environment, the Darwin release) are
//! [`wine_dispatch::wine_run_host`], appended here; the sidecar sends neither.

use super::*;

use gamelib_launch::ctx::LaunchCtx;

/// The one context, set once by [`install`].
static LAUNCH_CTX: OnceLock<Arc<LaunchCtx>> = OnceLock::new();

/// The installed context, or `None` before [`install`] (and in a unit test that built its own).
pub(crate) fn launch_ctx() -> Option<&'static Arc<LaunchCtx>> {
    LAUNCH_CTX.get()
}

/// Builds the launch context from the engine, known-fix, wine and information contexts and stores it. A no-op
/// when any of the four was not installed (no home directory), so every launch channel answers not ready. A
/// second call is ignored (the first context stays).
pub(crate) fn install() {
    let (Some(engine), Some(knownfix), Some(wine), Some(info)) = (
        engine_dispatch::engine_ctx(),
        knownfix_dispatch::knownfix_ctx(),
        wine_dispatch::wine_ctx(),
        info_dispatch::info_ctx(),
    ) else {
        return;
    };
    let ctx = LaunchCtx::new(
        Arc::clone(engine),
        Arc::clone(knownfix),
        Arc::clone(wine),
        Arc::clone(info),
    );
    let _ = LAUNCH_CTX.set(Arc::new(ctx));
}

/// Runs `op` over `args` for a `rustInvoke` arm. These arms run on the dispatcher's worker thread, never
/// inside a runtime, so the crate's own `dispatch_sync` drives the op there. `ctx` is the installed context,
/// passed in so a test drives this over its own; before [`install`] the answer is `<op>:not-ready`.
fn rpc_launch_op(
    ctx: Option<&Arc<LaunchCtx>>,
    op: &'static str,
    args: &[Value],
) -> Result<Value, String> {
    let ctx = ctx.ok_or_else(|| format!("{op}:not-ready"))?;
    gamelib_launch::dispatch_sync(op, args, ctx)
}

/// The body of the `launch_setup_wrapper_env_vars` arm over a given context: the generated decode (one
/// object, `{appName, appRunner}`, the runner one of the five names) and an arity check first, so a bad
/// call is rejected the same fixed `<op>:bad-args` literal before and after the install and never echoes the
/// sidecar's value, then the crate, which decodes the object strictly again.
fn setup_wrapper_env_vars_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
) -> Result<Value, String> {
    LaunchSetupWrapperEnvVarsArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_setup_wrapper_env_vars:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_setup_wrapper_env_vars", args)
}

/// The `launch_setup_wrapper_env_vars` `rustInvoke` arm (the managers' `setupWrapperEnvVars` shim,
/// 88.1-07): `{appName, appRunner}` to the `HEROIC_APP_NAME`, `HEROIC_APP_RUNNER`, `GAMEID` and per-store
/// variables. A pure computation, so the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_setup_wrapper_env_vars(args: &[Value]) -> Result<Value, String> {
    setup_wrapper_env_vars_over(launch_ctx(), args)
}

/// A decoded optional text: the string, or `null`. A trailing argument the sidecar left out decodes the same
/// as an explicit `null`, so the crate always sees every position.
fn text_or_null(text: Option<String>) -> Value {
    text.map_or(Value::Null, Value::String)
}

/// The settings object of a decoded call: the generated decode takes any JSON value (`x-rust-value`), so the
/// object check is here, before the context is looked at, and answers the same fixed `<op>:bad-args`.
fn settings_object(settings: Value, op: &str) -> Result<Value, String> {
    match settings {
        Value::Object(_) => Ok(settings),
        _ => Err(format!("{op}:bad-args")),
    }
}

/// The body of the `launch_setup_env_vars` arm over a given context and host: the generated decode
/// (`[gameSettings, installPath | null]`), an object check and an arity check first, so a bad call is rejected
/// the same fixed `<op>:bad-args` literal before and after the install and never echoes the sidecar's value,
/// then the crate over `[settings, installPath, host]`. `host` is the shell's own facts (T-88.1-14), taken only
/// once the context is there.
fn setup_env_vars_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchSetupEnvVarsArgs::from_args(args)?;
    if args.len() > 2 {
        return Err("launch_setup_env_vars:bad-args".to_string());
    }
    let settings = settings_object(decoded.game_settings, "launch_setup_env_vars")?;
    let ctx = ctx.ok_or_else(|| "launch_setup_env_vars:not-ready".to_string())?;
    rpc_launch_op(
        Some(ctx),
        "launch_setup_env_vars",
        &[settings, text_or_null(decoded.install_path), host()],
    )
}

/// The `launch_setup_env_vars` `rustInvoke` arm (the managers' `setupEnvVars` shim, 88.1-07): the game's GPU
/// offload, HUD, install path and own variables as a string map. The shell appends [`wine_dispatch::wine_run_host`].
/// A pure computation, so the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_setup_env_vars(args: &[Value]) -> Result<Value, String> {
    setup_env_vars_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

/// The body of the `launch_setup_wine_env_vars` arm over a given context and host: the same decode, object and
/// arity checks as [`setup_env_vars_over`] over `[gameSettings, gameId | null]`, then the crate over
/// `[settings, gameId, host]`.
fn setup_wine_env_vars_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchSetupWineEnvVarsArgs::from_args(args)?;
    if args.len() > 2 {
        return Err("launch_setup_wine_env_vars:bad-args".to_string());
    }
    let settings = settings_object(decoded.game_settings, "launch_setup_wine_env_vars")?;
    let ctx = ctx.ok_or_else(|| "launch_setup_wine_env_vars:not-ready".to_string())?;
    rpc_launch_op(
        Some(ctx),
        "launch_setup_wine_env_vars",
        &[settings, text_or_null(decoded.game_id), host()],
    )
}

/// The `launch_setup_wine_env_vars` `rustInvoke` arm (the wine env shim, wired with its callers in 88.1-08): the
/// wine environment of a game as a string map, the library folders read from disk. The shell appends
/// [`wine_dispatch::wine_run_host`]; the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_setup_wine_env_vars(args: &[Value]) -> Result<Value, String> {
    setup_wine_env_vars_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

/// The words of a decoded optional list: the array of strings, or `null`.
fn words_or_null(words: Option<Vec<String>>) -> Value {
    words.map_or(Value::Null, |words| {
        Value::Array(words.into_iter().map(Value::String).collect())
    })
}

/// The body of the `launch_setup_wrappers` arm over a given context: the generated decode
/// (`[gameSettings, mangoHudCommand | null, gameModeBin | null, gameScopeCommand | null]`), an object check and an
/// arity check first, then the crate over all four positions (an absent trailing one is `null`; an empty list
/// stays an empty list, which the gamescope rule tells from `null`). An unterminated quote in a wrapper option is
/// the crate's `<op>:<message>`, a fixed literal.
fn setup_wrappers_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    let decoded = LaunchSetupWrappersArgs::from_args(args)?;
    if args.len() > 4 {
        return Err("launch_setup_wrappers:bad-args".to_string());
    }
    let settings = settings_object(decoded.game_settings, "launch_setup_wrappers")?;
    rpc_launch_op(
        ctx,
        "launch_setup_wrappers",
        &[
            settings,
            words_or_null(decoded.mango_hud_command),
            text_or_null(decoded.game_mode_bin),
            words_or_null(decoded.game_scope_command),
        ],
    )
}

/// The `launch_setup_wrappers` `rustInvoke` arm (the managers' `setupWrappers` shim, 88.1-07): the wrapper words
/// in order, gamescope first. A pure computation, so the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_setup_wrappers(args: &[Value]) -> Result<Value, String> {
    setup_wrappers_over(launch_ctx(), args)
}

/// The body of the `launch_known_fix_env` arm over a given context: the generated decode (`[appName, runner]`, the
/// runner one of the five names) and an arity check first, then the crate, which bounds the app name (1 to 256
/// UTF-16 units) and decodes the runner again.
fn known_fix_env_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchKnownFixEnvArgs::from_args(args)?;
    if args.len() != 2 {
        return Err("launch_known_fix_env:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_known_fix_env", args)
}

/// The `launch_known_fix_env` `rustInvoke` arm (the managers' `getKnownFixesEnvVariables` shim, 88.1-07): the
/// game's tier-1 `envVariables` as the file holds them, `{}` when there is none. A disk read, so the sidecar keeps
/// it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_known_fix_env(args: &[Value]) -> Result<Value, String> {
    known_fix_env_over(launch_ctx(), args)
}

/// The body of the `launch_verify_wine_prefix` arm over a given context and host: the generated decode
/// (`[gameSettings]`), an object check and an arity check first, so a bad call is rejected the same fixed
/// `<op>:bad-args` literal before and after the install and never echoes the sidecar's value, then the crate over
/// `[settings, host]`. `host` is the shell's own facts (T-88.1-14), taken only once the context is there.
fn verify_wine_prefix_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchVerifyWinePrefixArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_verify_wine_prefix:bad-args".to_string());
    }
    let settings = settings_object(decoded.game_settings, "launch_verify_wine_prefix")?;
    let ctx = ctx.ok_or_else(|| "launch_verify_wine_prefix:not-ready".to_string())?;
    rpc_launch_op(Some(ctx), "launch_verify_wine_prefix", &[settings, host()])
}

/// The `launch_verify_wine_prefix` `rustInvoke` arm (the managers' and the save sync's `verifyWinePrefix` shim,
/// 88.1-08): creates a game's wine prefix when it is missing, as a `wineboot --init` or umu's `createprefix` run
/// through the wine command core (a Helper spawn), and answers `{ res: { stdout, stderr } }`. The shell appends
/// [`wine_dispatch::wine_run_host`]. It waits on the wineboot of a cold prefix, so the sidecar lists the channel as
/// unbounded (`UNBOUNDED_RUST_CHANNELS`); the crate's `guarded` registrant and the shutdown token end it at exit.
pub(crate) fn rpc_launch_verify_wine_prefix(args: &[Value]) -> Result<Value, String> {
    verify_wine_prefix_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

/// The body of the `launch_epic_service_offline` arm over a given context: the generated decode (`[service?]`, one
/// of the three service names) and an arity check first, so a bad call is rejected the same fixed `<op>:bad-args`
/// literal before and after the install and never echoes the sidecar's value, then the crate over exactly one
/// argument (an absent service is `null`, the default `Epic Games Store`).
fn epic_service_offline_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
) -> Result<Value, String> {
    let decoded = LaunchEpicServiceOfflineArgs::from_args(args)?;
    if args.len() > 1 {
        return Err("launch_epic_service_offline:bad-args".to_string());
    }
    let service = match decoded.service {
        None => Value::Null,
        Some(LaunchEpicServiceOfflineArgsService::EpicGamesStore) => {
            Value::String("Epic Games Store".to_string())
        }
        Some(LaunchEpicServiceOfflineArgsService::Fortnite) => {
            Value::String("Fortnite".to_string())
        }
        Some(LaunchEpicServiceOfflineArgsService::RocketLeague) => {
            Value::String("Rocket League".to_string())
        }
    };
    rpc_launch_op(ctx, "launch_epic_service_offline", &[service])
}

/// The `launch_epic_service_offline` `rustInvoke` arm (88.1-11, D-19): whether the Epic status page says a service
/// is down (`isEpicServiceOffline`). One JSON GET through the engine fetch seam, nothing when the app is not online
/// (which answers `true`); the offline notification and the log lines are Rust's. A single bounded request, so the
/// sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_epic_service_offline(args: &[Value]) -> Result<Value, String> {
    epic_service_offline_over(launch_ctx(), args)
}

/// The process facts the prepare step reads that are not the wine host's: `isSteamDeckGameMode`, `isSteamDeck`,
/// `isFlatpak` and `flatpakRuntimeVersion` of `constants/environment.ts`. `env` reads one variable and `manifest`
/// the Flatpak manifest (`/app/manifest.json`), so a test can drive both; `wine` is [`wine_dispatch::wine_run_host`].
fn prepare_host_over(
    env: &dyn Fn(&str) -> Option<String>,
    manifest: &dyn Fn() -> Option<String>,
    wine: Value,
) -> Value {
    let has = |key: &str, test: &dyn Fn(&str) -> bool| env(key).is_some_and(|value| test(&value));
    let game_mode = has("XDG_CURRENT_DESKTOP", &|v| v == "gamescope");
    let desktop = has("SESSION_MANAGER", &|v| v.contains("unix/steamdeck"))
        && has("HOME", &|v| v == "/home/deck")
        && has("DESKTOP_SESSION", &|v| v.contains("steamos"));
    let flatpak = has("FLATPAK_ID", &|v| !v.is_empty());
    // The runtime version the Flatpak manifest names, `unknown` when it cannot be read, and empty off Flatpak.
    let runtime = if flatpak {
        manifest()
            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
            .and_then(|manifest| manifest["runtime-version"].as_str().map(str::to_string))
            .unwrap_or_else(|| "unknown".to_string())
    } else {
        String::new()
    };
    serde_json::json!({
        "wine": wine,
        "steamDeckGameMode": game_mode,
        "steamDeck": game_mode || desktop,
        "flatpak": flatpak,
        "flatpakRuntimeVersion": runtime,
    })
}

/// [`prepare_host_over`] over this process: its environment and the Flatpak manifest, built by the shell and never
/// taken from the sidecar (T-88.1-26).
fn prepare_host() -> Value {
    prepare_host_over(
        &|key| std::env::var(key).ok(),
        &|| std::fs::read_to_string("/app/manifest.json").ok(),
        wine_dispatch::wine_run_host(),
    )
}

/// The body of the `launch_prepare` arm over a given context and host: the generated decode (one object of the
/// facts only the TS has), an object check on the settings and an arity check first, so a bad call is rejected the
/// same fixed `<op>:bad-args` literal before and after the install and never echoes the sidecar's value, then the
/// crate over `[args, host]` (which decodes strictly again). `host` is the shell's own facts (T-88.1-26), taken only
/// once the context is there.
fn prepare_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchPrepareArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_prepare:bad-args".to_string());
    }
    settings_object(decoded.settings, "launch_prepare")?;
    let ctx = ctx.ok_or_else(|| "launch_prepare:not-ready".to_string())?;
    rpc_launch_op(Some(ctx), "launch_prepare", &[args[0].clone(), host()])
}

/// The `launch_prepare` `rustInvoke` arm (88.1-11, D-19, D-30): the prepare step of a launch (`prepareLaunch`).
/// It decides offline mode, finds the Linux wrappers, may fetch the umu runtime, and answers the TS reply plus
/// `log`, the per-game log lines the TS `LogWriter` writes (the only writer until 88.3). The shell appends the
/// process facts ([`prepare_host`]). The umu download can outlast the sidecar's 60 s `RUST_INVOKE_TIMEOUT_MS`, so
/// the shim that calls it (88.1-15) lists the channel as unbounded; the crate's `guarded` registrant and the
/// shutdown token end it at exit.
pub(crate) fn rpc_launch_prepare(args: &[Value]) -> Result<Value, String> {
    prepare_over(launch_ctx(), args, prepare_host)
}

/// The body of the `launch_prepare_wine_begin` arm over a given context and host: the generated decode (one object
/// of the facts only the TS has), an object check on the stored settings and an arity check first, so a bad call is
/// rejected the same fixed `<op>:bad-args` literal before and after the install and never echoes the sidecar's
/// value, then the crate over `[args, host]` (which decodes strictly again). `host` is the shell's own facts
/// (T-88.1-14), taken only once the context is there.
fn prepare_wine_begin_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchPrepareWineBeginArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_prepare_wine_begin:bad-args".to_string());
    }
    settings_object(decoded.stored_settings, "launch_prepare_wine_begin")?;
    let ctx = ctx.ok_or_else(|| "launch_prepare_wine_begin:not-ready".to_string())?;
    rpc_launch_op(
        Some(ctx),
        "launch_prepare_wine_begin",
        &[args[0].clone(), host()],
    )
}

/// The `launch_prepare_wine_begin` `rustInvoke` arm (88.1-12, D-19, D-26, D-30): the first half of
/// `prepareWineLaunch`, up to the store-setup point. It checks the wines, the CrossOver bottle, creates the wine
/// prefix when it is missing and records the game in its `installed_games`, and answers the reply, the launch
/// settings the finish step is handed and the per-game log lines the TS `LogWriter` writes. The TS store-setup hook
/// stays TS and runs between this arm and the finish arm (88.1-13) in the launcher adapter (88.1-15). The shell
/// appends [`wine_dispatch::wine_run_host`]. A `wineboot` can outlast the sidecar's 60 s `RUST_INVOKE_TIMEOUT_MS`,
/// so the shim that calls it (88.1-15) lists the channel as unbounded; the wine core's Helper spawn and the shutdown
/// token end it at exit (T-88.1-30).
pub(crate) fn rpc_launch_prepare_wine_begin(args: &[Value]) -> Result<Value, String> {
    prepare_wine_begin_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
    use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
    use gamelib_info::http::ReqwestHttp;
    use gamelib_knownfix::ctx::KnownFixCtx;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use gamelib_wine::ctx::WineCtx;
    use serde_json::json;

    /// A launch context over a fake HOME, built the way [`install`] builds the real one.
    fn ctx_over(home: &FakeHome) -> Arc<LaunchCtx> {
        let root = home.root().to_path_buf();
        let engine = Arc::new(EngineCtx::new(
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
        ));
        let knownfix = Arc::new(KnownFixCtx::new(
            Arc::clone(&engine),
            None,
            "https://relay.test",
            "1.2.3",
        ));
        let wine = Arc::new(WineCtx::new(Arc::clone(&engine), root.join("runtimes")));
        let info = Arc::new(InfoCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            InfoPlatform::Linux,
            InfoPaths {
                app_folder: root.join("app"),
                user_data: root.join("app"),
                temp: root.join("temp"),
                public_dir: None,
            },
            "1.2.3".to_string(),
            Shutdown::new(),
            Arc::new(ReqwestHttp::new()),
        ));
        Arc::new(LaunchCtx::new(engine, knownfix, wine, info))
    }

    #[test]
    fn before_install_the_wrapper_env_arm_answers_not_ready() {
        let args = vec![json!({"appName": "1234", "appRunner": "gog"})];
        assert_eq!(
            setup_wrapper_env_vars_over(None, &args),
            Err("launch_setup_wrapper_env_vars:not-ready".to_string())
        );
    }

    #[test]
    fn the_wrapper_env_arm_answers_the_map_over_an_installed_context() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let got = setup_wrapper_env_vars_over(
            Some(&ctx),
            &[json!({"appName": "1234", "appRunner": "gog"})],
        )
        .unwrap();
        assert_eq!(got["HEROIC_APP_NAME"], json!("1234"));
        assert_eq!(got["HEROIC_APP_RUNNER"], json!("gog"));
        assert_eq!(got["GAMEID"], json!("umu-0"));
        assert_eq!(got["STORE"], json!("gog"));
    }

    #[test]
    fn a_wrong_call_is_the_same_fixed_bad_args_before_and_after_the_install() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        let wrong: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!({"appName": secret, "appRunner": "epic"})],
            vec![json!({"appName": "1", "appRunner": "gog"}), json!(secret)],
        ];
        for args in wrong {
            for ctx in [None, Some(&ctx)] {
                let err = setup_wrapper_env_vars_over(ctx, &args).unwrap_err();
                assert_eq!(err, "launch_setup_wrapper_env_vars:bad-args", "{args:?}");
                assert!(!err.contains(secret));
            }
        }
        // An unknown key passes the generated decode and is the crate's to refuse (it needs the context).
        let err = setup_wrapper_env_vars_over(
            Some(&ctx),
            &[json!({"appName": "1", "appRunner": "gog", "extra": secret})],
        )
        .unwrap_err();
        assert_eq!(err, "launch_setup_wrapper_env_vars:bad-args");
        assert!(!err.contains(secret));
    }

    /// The settings fields the env builders need: the game's wine installation is the one required field
    /// (the sidecar always sends the merged `GameSettings`, which holds it), `extra` adds the rest.
    fn settings(extra: Value) -> Value {
        let mut base = json!({
            "wineVersion": {"type": "wine", "bin": "/w/wine", "name": "Wine-9", "wineserver": "/w/wineserver"},
            "winePrefix": "/p"
        });
        if let (Some(base), Value::Object(extra)) = (base.as_object_mut(), extra) {
            base.extend(extra);
        }
        base
    }

    /// The shell's host facts, fixed: no variable set, so `LD_PRELOAD` is the empty default.
    fn host() -> Value {
        json!({"env": {}})
    }

    #[test]
    fn the_game_env_arm_builds_the_map_over_the_shells_host_and_is_not_ready_before_the_install() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let args = vec![settings(json!({"nvidiaPrime": true})), json!("/games/g1")];
        assert_eq!(
            setup_env_vars_over(None, &args, host),
            Err("launch_setup_env_vars:not-ready".to_string())
        );
        let got = setup_env_vars_over(Some(&ctx), &args, host).unwrap();
        assert_eq!(got["DRI_PRIME"], json!("1"));
        assert_eq!(got["STEAM_COMPAT_INSTALL_PATH"], json!("/games/g1"));
        assert_eq!(got["LD_PRELOAD"], json!(""));
        // A trailing install path left out is the same as null.
        let bare = setup_env_vars_over(Some(&ctx), &[settings(json!({}))], host).unwrap();
        assert!(bare.get("STEAM_COMPAT_INSTALL_PATH").is_none());
        // The host is the shell's: a process that already preloads something is left alone.
        let preloaded = setup_env_vars_over(
            Some(&ctx),
            &[settings(json!({})), Value::Null],
            || json!({"env": {"LD_PRELOAD": "x.so"}}),
        )
        .unwrap();
        assert!(preloaded.get("LD_PRELOAD").is_none());
    }

    #[test]
    fn the_wine_env_arm_builds_the_map_and_is_not_ready_before_the_install() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let settings = json!({
            "wineVersion": {"type": "wine", "bin": "/w/wine", "name": "Wine-9", "wineserver": "/w/wineserver"},
            "winePrefix": "/p"
        });
        assert_eq!(
            setup_wine_env_vars_over(None, &[settings.clone(), Value::Null], host),
            Err("launch_setup_wine_env_vars:not-ready".to_string())
        );
        let got = setup_wine_env_vars_over(Some(&ctx), &[settings, json!("g1")], host).unwrap();
        assert!(got.is_object());
        assert_eq!(got["WINEPREFIX"], json!("/p"));
    }

    #[test]
    fn the_verify_prefix_arm_answers_not_ready_before_the_install_and_an_empty_res_for_a_crossover_wine(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let crossover = json!({
            "wineVersion": {"type": "crossover", "bin": "/cx/wine", "name": "CrossOver"},
            "winePrefix": home.root().join("never-made").to_string_lossy(),
        });
        assert_eq!(
            verify_wine_prefix_over(None, &[crossover.clone()], host),
            Err("launch_verify_wine_prefix:not-ready".to_string())
        );
        // A crossover bottle has no prefix of its own: nothing spawns and nothing is created.
        assert_eq!(
            verify_wine_prefix_over(Some(&ctx), &[crossover], host),
            Ok(json!({"res": {"stdout": "", "stderr": ""}}))
        );
        assert!(!home.root().join("never-made").exists());
    }

    #[test]
    fn the_wrappers_arm_joins_the_words_in_order_and_tells_an_empty_gamescope_from_none() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        assert_eq!(
            setup_wrappers_over(None, &[json!({}), Value::Null, Value::Null, Value::Null]),
            Err("launch_setup_wrappers:not-ready".to_string())
        );
        let settings = json!({"wrapperOptions": [{"exe": "a", "args": "b 'c d'"}]});
        let got = setup_wrappers_over(
            Some(&ctx),
            &[
                settings.clone(),
                json!(["mangohud"]),
                json!("gamemoderun"),
                json!(["gamescope", "--"]),
            ],
        )
        .unwrap();
        assert_eq!(
            got,
            json!(["gamescope", "--", "a", "b", "c d", "gamemoderun"])
        );
        // mangohud joins only behind an empty gamescope list, never when there is none.
        let with_empty = setup_wrappers_over(
            Some(&ctx),
            &[json!({}), json!(["mangohud"]), Value::Null, json!([])],
        )
        .unwrap();
        assert_eq!(with_empty, json!(["mangohud"]));
        let with_none = setup_wrappers_over(Some(&ctx), &[json!({}), json!(["mangohud"])]).unwrap();
        assert_eq!(with_none, json!([]));
        // An unterminated quote is the crate's fixed `<op>:<message>`, never the option's text.
        let err = setup_wrappers_over(
            Some(&ctx),
            &[json!({"wrapperOptions": [{"exe": "a", "args": "'secret"}]})],
        )
        .unwrap_err();
        assert!(err.starts_with("launch_setup_wrappers:"), "{err}");
        assert!(!err.contains("secret"));
    }

    #[test]
    fn the_known_fix_env_arm_answers_an_empty_map_for_a_game_with_no_fix() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let args = vec![json!("1234"), json!("gog")];
        assert_eq!(
            known_fix_env_over(None, &args),
            Err("launch_known_fix_env:not-ready".to_string())
        );
        assert_eq!(known_fix_env_over(Some(&ctx), &args), Ok(json!({})));
    }

    #[test]
    fn the_epic_arm_answers_not_ready_before_the_install_and_offline_for_an_app_that_is_not_online()
    {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        assert_eq!(
            epic_service_offline_over(None, &[]),
            Err("launch_epic_service_offline:not-ready".to_string())
        );
        // The context starts not online, so no request is made and the answer is offline.
        for args in [
            vec![],
            vec![Value::Null],
            vec![json!("Epic Games Store")],
            vec![json!("Fortnite")],
            vec![json!("Rocket League")],
        ] {
            assert_eq!(
                epic_service_offline_over(Some(&ctx), &args),
                Ok(json!(true)),
                "{args:?}"
            );
        }
        // Its one argument is optional, so an empty call is valid; anything else is the fixed literal, never
        // echoing what was sent, before and after the install.
        let secret = "/Users/someone/secret-profile-path";
        for args in [
            vec![json!(secret)],
            vec![json!("fortnite")],
            vec![json!(1)],
            vec![json!({"x": secret})],
            vec![Value::Null, Value::Null],
            vec![json!("Fortnite"), json!("Fortnite")],
        ] {
            for ctx in [None, Some(&ctx)] {
                let err = epic_service_offline_over(ctx, &args).unwrap_err();
                assert_eq!(err, "launch_epic_service_offline:bad-args", "{args:?}");
                assert!(!err.contains(secret));
            }
        }
    }

    fn prepare_args(settings: Value) -> Value {
        json!({
            "settings": settings,
            "runner": "gog",
            "appName": "1234",
            "title": "A Game",
            "canRunOffline": false,
            "isNative": true,
            "storeExpired": false,
            "installPath": "/games/a",
        })
    }

    #[test]
    fn the_prepare_arm_is_not_ready_before_the_install_and_answers_the_reply_with_its_log_after() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let args = vec![prepare_args(json!({}))];
        assert_eq!(
            prepare_over(None, &args, host),
            Err("launch_prepare:not-ready".to_string())
        );
        // A Linux context that is not online: offline mode, no wrappers (none were asked for), a log.
        let got = prepare_over(Some(&ctx), &args, || json!({"wine": {"env": {}}})).unwrap();
        assert_eq!(got["success"], json!(true));
        assert_eq!(got["offlineMode"], json!(true));
        assert_eq!(got["mangoHudCommand"], json!([]));
        assert_eq!(got["log"][0]["level"], json!("warning"));
        assert!(got["log"].as_array().unwrap().len() >= 6);
    }

    #[test]
    fn the_prepare_arm_rejects_a_wrong_call_with_its_fixed_bad_args_before_and_after_the_install() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        let wrong: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![prepare_args(json!(secret))],
            vec![prepare_args(json!({})), json!({})],
            vec![
                json!({"settings": {}, "runner": "epic", "appName": "1", "title": secret,
                        "canRunOffline": false, "isNative": true, "storeExpired": false}),
            ],
            vec![
                json!({"settings": {}, "runner": "gog", "appName": 1, "title": "t",
                        "canRunOffline": false, "isNative": true, "storeExpired": false}),
            ],
        ];
        for args in &wrong {
            for ctx in [None, Some(&ctx)] {
                let err = prepare_over(ctx, args, host).unwrap_err();
                assert_eq!(err, "launch_prepare:bad-args", "{args:?}");
                assert!(!err.contains(secret));
            }
        }
        // An unknown key passes the generated decode and is the crate's to refuse.
        let mut extra = prepare_args(json!({}));
        extra["extra"] = json!(secret);
        let err = prepare_over(Some(&ctx), &[extra], || json!({})).unwrap_err();
        assert_eq!(err, "launch_prepare:bad-args");
        assert!(!err.contains(secret));
    }

    fn wine_begin_args(settings: Value) -> Value {
        json!({
            "runner": "gog",
            "appName": "1234",
            "title": "A Game",
            "canRunOffline": false,
            "storedSettings": settings,
        })
    }

    #[test]
    fn the_wine_begin_arm_is_not_ready_before_the_install_and_answers_the_reply_after() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let settings = json!({
            "winePrefix": "/nonexistent/prefix",
            "wineVersion": {"bin": "/nonexistent/wine", "name": "W", "type": "wine"},
        });
        let args = vec![wine_begin_args(settings)];
        assert_eq!(
            prepare_wine_begin_over(None, &args, host),
            Err("launch_prepare_wine_begin:not-ready".to_string())
        );
        // No wine exists and the profile holds no default: the step stops and creates nothing.
        let got = prepare_wine_begin_over(Some(&ctx), &args, || json!({})).unwrap();
        assert_eq!(got["success"], json!(false));
        assert_eq!(got["prefixUpdated"], json!(false));
        assert_eq!(got["log"], json!([]));
    }

    #[test]
    fn the_wine_begin_arm_rejects_a_wrong_call_with_its_fixed_bad_args_before_and_after_the_install(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        let wrong: Vec<Vec<Value>> = vec![
            vec![wine_begin_args(json!(secret))],
            vec![wine_begin_args(json!({})), json!({})],
            vec![json!({
                "runner": "epic", "appName": "1", "title": secret, "canRunOffline": false,
                "storedSettings": {},
            })],
            vec![json!({
                "runner": "gog", "appName": 1, "title": "t", "canRunOffline": false,
                "storedSettings": {},
            })],
        ];
        for args in &wrong {
            for ctx in [None, Some(&ctx)] {
                let err = prepare_wine_begin_over(ctx, args, host).unwrap_err();
                assert_eq!(err, "launch_prepare_wine_begin:bad-args", "{args:?}");
                assert!(!err.contains(secret));
            }
        }
        // An unknown key passes the generated decode and is the crate's to refuse.
        let mut extra = wine_begin_args(json!({}));
        extra["extra"] = json!(secret);
        let err = prepare_wine_begin_over(Some(&ctx), &[extra], || json!({})).unwrap_err();
        assert_eq!(err, "launch_prepare_wine_begin:bad-args");
        assert!(!err.contains(secret));
    }

    #[test]
    fn the_prepare_host_reads_the_deck_and_flatpak_facts_the_way_the_ts_constants_do() {
        let env_of = |pairs: &'static [(&'static str, &'static str)]| {
            move |key: &str| {
                pairs
                    .iter()
                    .find(|(k, _)| *k == key)
                    .map(|(_, v)| (*v).to_string())
            }
        };
        let none = || None;
        let wine = json!({"env": {}});
        let plain = prepare_host_over(&env_of(&[]), &none, wine.clone());
        assert_eq!(
            plain,
            json!({"wine": {"env": {}}, "steamDeckGameMode": false, "steamDeck": false,
                   "flatpak": false, "flatpakRuntimeVersion": ""})
        );
        let game_mode = prepare_host_over(
            &env_of(&[("XDG_CURRENT_DESKTOP", "gamescope")]),
            &none,
            wine.clone(),
        );
        assert_eq!(game_mode["steamDeckGameMode"], json!(true));
        assert_eq!(game_mode["steamDeck"], json!(true));
        // Desktop mode needs all three of its variables.
        let desktop = prepare_host_over(
            &env_of(&[
                ("SESSION_MANAGER", "local/x,unix/steamdeck:/tmp/ICE"),
                ("HOME", "/home/deck"),
                ("DESKTOP_SESSION", "plasma-steamos-wayland"),
            ]),
            &none,
            wine.clone(),
        );
        assert_eq!(desktop["steamDeckGameMode"], json!(false));
        assert_eq!(desktop["steamDeck"], json!(true));
        let partial = prepare_host_over(
            &env_of(&[
                ("SESSION_MANAGER", "unix/steamdeck"),
                ("HOME", "/home/deck"),
            ]),
            &none,
            wine.clone(),
        );
        assert_eq!(partial["steamDeck"], json!(false));
        // Flatpak: the version the manifest names, `unknown` when it cannot be read, nothing off Flatpak.
        let manifest = || Some(r#"{"runtime-version": "24.08"}"#.to_string());
        let flatpak = prepare_host_over(
            &env_of(&[("FLATPAK_ID", "io.x.App")]),
            &manifest,
            wine.clone(),
        );
        assert_eq!(flatpak["flatpak"], json!(true));
        assert_eq!(flatpak["flatpakRuntimeVersion"], json!("24.08"));
        let unreadable =
            prepare_host_over(&env_of(&[("FLATPAK_ID", "io.x.App")]), &none, wine.clone());
        assert_eq!(unreadable["flatpakRuntimeVersion"], json!("unknown"));
        let off = prepare_host_over(&env_of(&[]), &manifest, wine);
        assert_eq!(off["flatpakRuntimeVersion"], json!(""));
    }

    #[test]
    fn every_new_arm_rejects_a_wrong_call_with_its_fixed_bad_args_before_and_after_the_install() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        type Arm = fn(Option<&Arc<LaunchCtx>>, &[Value]) -> Result<Value, String>;
        let arms: [(&str, Arm); 6] = [
            ("launch_setup_env_vars", |c, a| {
                setup_env_vars_over(c, a, host)
            }),
            ("launch_setup_wine_env_vars", |c, a| {
                setup_wine_env_vars_over(c, a, host)
            }),
            ("launch_setup_wrappers", setup_wrappers_over),
            ("launch_known_fix_env", known_fix_env_over),
            ("launch_verify_wine_prefix", |c, a| {
                verify_wine_prefix_over(c, a, host)
            }),
            ("launch_prepare_wine_begin", |c, a| {
                prepare_wine_begin_over(c, a, host)
            }),
        ];
        let wrong: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!(secret), json!(secret)],
            vec![
                json!(secret),
                json!(secret),
                json!(secret),
                json!(secret),
                json!(secret),
            ],
            vec![json!({}), json!(1), json!(1), json!(1)],
            vec![json!({}), json!({"x": secret})],
        ];
        for (op, arm) in arms {
            for args in &wrong {
                for ctx in [None, Some(&ctx)] {
                    let err = arm(ctx, args).unwrap_err();
                    assert_eq!(err, format!("{op}:bad-args"), "{op} {args:?}");
                    assert!(!err.contains(secret));
                }
            }
        }
        // A runner outside the five is refused by the generated decode.
        assert_eq!(
            known_fix_env_over(Some(&ctx), &[json!("1"), json!("epic")]),
            Err("launch_known_fix_env:bad-args".to_string())
        );
    }
}
