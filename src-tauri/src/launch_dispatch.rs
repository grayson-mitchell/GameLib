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
//!
//! 88.1-14 (D-28): the context carries a dialog source, [`ShellDialogs`], the same native message box
//! `dialog_message` shows, so `checkWineBeforeLaunch` asks its question from Rust. A dismissal is `None`, never
//! index 0 (CR-04).

use super::*;

use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::prepare::deps::WineManagerFacts;
use gamelib_launch::prepare::dialogs::LaunchDialogs;

/// The one context, set once by [`install`].
static LAUNCH_CTX: OnceLock<Arc<LaunchCtx>> = OnceLock::new();

/// The installed context, or `None` before [`install`] (and in a unit test that built its own).
pub(crate) fn launch_ctx() -> Option<&'static Arc<LaunchCtx>> {
    LAUNCH_CTX.get()
}

/// The prepare steps' modal over the shell's native message box: the same box `dialog_message` builds
/// ([`dialogs::rpc_dialog_message`]: two labels are an `OkCancelCustom`, built and shown on the main thread and
/// awaited on a spawned one). The call blocks the worker thread that runs the op until the user answers, as the
/// `dialog_message` arm blocks its own. A dismissal, a failure to show it and any answer that is not a button index
/// are all `None` (CR-04, T-88.1-34): a failed dialog is never read as "Yes".
struct ShellDialogs {
    app: AppHandle,
}

impl LaunchDialogs for ShellDialogs {
    fn ask(&self, title: &str, message: &str, buttons: &[String]) -> Option<usize> {
        let answer = dialogs::rpc_dialog_message(
            &[serde_json::json!({ "title": title, "message": message, "buttons": buttons })],
            &self.app,
        )
        .ok()?;
        // A dismissal is `null`; a click is the button's index, which must be one of the labels shown.
        answer
            .as_u64()
            .map(|index| index as usize)
            .filter(|index| *index < buttons.len())
    }
}

/// The wine manager's shell facts for the prepare steps (88.1-14): the discovery host `getAlternativeWine` runs over
/// ([`wine_dispatch::discovery_host`], with the custom paths scanned), the install settings the global config holds now
/// and the cancel registry the renderer's `abort(version)` reaches, so a default-wine download started by a launch
/// can be cancelled like one the renderer started.
struct ShellWineManager {
    wine: Arc<gamelib_wine::ctx::WineCtx>,
}

impl WineManagerFacts for ShellWineManager {
    fn discovery_host(&self, path: Option<String>) -> Value {
        wine_dispatch::discovery_host(&self.wine, path, Some(true))
    }

    fn install_settings(&self) -> gamelib_wine::manager::install::InstallSettings {
        wine_dispatch::read_install_settings(&self.wine)
    }

    fn register_install(&self, id: &str) -> (gamelib_launch::CancellationToken, Box<dyn Send>) {
        let (cancel, guard) = wine_dispatch::register_install(id);
        (cancel, Box::new(guard))
    }
}

/// Builds the launch context from the engine, known-fix, wine and information contexts and stores it, with the
/// dialog source over the app's native message box. A no-op when any of the four was not installed (no home
/// directory), so every launch channel answers not ready. A second call is ignored (the first context stays).
pub(crate) fn install(app: &AppHandle) {
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
    )
    .with_dialogs(Arc::new(ShellDialogs { app: app.clone() }))
    .with_manager(Arc::new(ShellWineManager {
        wine: Arc::clone(wine),
    }));
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

/// The body of the `launch_prepare_wine_finish` arm over a given context and host: the generated decode (one object
/// of the facts only the TS has), an object check on the two settings and an arity check first, so a bad call is
/// rejected the same fixed `<op>:bad-args` literal before and after the install and never echoes the sidecar's
/// value, then the crate over `[args, host]` (which decodes strictly again). `host` is the shell's own tool facts
/// (T-88.1-14), taken only once the context is there.
fn prepare_wine_finish_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchPrepareWineFinishArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_prepare_wine_finish:bad-args".to_string());
    }
    settings_object(decoded.settings, "launch_prepare_wine_finish")?;
    settings_object(decoded.stored_settings, "launch_prepare_wine_finish")?;
    let ctx = ctx.ok_or_else(|| "launch_prepare_wine_finish:not-ready".to_string())?;
    rpc_launch_op(
        Some(ctx),
        "launch_prepare_wine_finish",
        &[args[0].clone(), host()],
    )
}

/// The `launch_prepare_wine_finish` `rustInvoke` arm (88.1-13, D-19, D-26, D-30): the second half of
/// `prepareWineLaunch`, from the store-setup point to the returned env. It installs the known fix's winetricks
/// verbs and programs when this launch added the game to its prefix, applies the tier-2 registry, resolves the
/// overlay env, puts the GOG dummy service and the DXVK family in the prefix, downloads the EAC and BattlEye
/// runtimes, builds the wine env and arms the launch deadline, and answers `{ success, envVars, knownFixEnv, log }`.
/// The shell appends [`wine_dispatch::tools_host_value`] (the wine host facts, the bundled `public` directory and the
/// online monitor's answer). A winetricks verb, a DXVK download, a runtime or an overlay can outlast the sidecar's
/// 60 s `RUST_INVOKE_TIMEOUT_MS`, so the shim that calls it (88.1-15) lists the channel as unbounded; the wine
/// core's Helper spawns and the shutdown token end it at exit (T-88.1-30).
pub(crate) fn rpc_launch_prepare_wine_finish(args: &[Value]) -> Result<Value, String> {
    prepare_wine_finish_over(launch_ctx(), args, wine_dispatch::tools_host_value)
}

/// The body of the `launch_check_wine_before_launch` arm over a given context and host: the generated decode (one
/// object of the facts only the TS has), an object check on the game's wine and an arity check first, so a bad call
/// is rejected the same fixed `<op>:bad-args` literal before and after the install and never echoes the sidecar's
/// value, then the crate over `[args, host]` (which decodes strictly again). `host` is the shell's own facts
/// (T-88.1-14), taken only once the context is there.
fn check_wine_before_launch_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchCheckWineBeforeLaunchArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_check_wine_before_launch:bad-args".to_string());
    }
    settings_object(decoded.wine_version, "launch_check_wine_before_launch")?;
    let ctx = ctx.ok_or_else(|| "launch_check_wine_before_launch:not-ready".to_string())?;
    rpc_launch_op(
        Some(ctx),
        "launch_check_wine_before_launch",
        &[args[0].clone(), host()],
    )
}

/// The `launch_check_wine_before_launch` `rustInvoke` arm (88.1-14, D-28, D-19, D-30): `checkWineBeforeLaunch`, the
/// wine self-heal before a launch. It checks the game's wine, then the default wine (asking the user through
/// [`ShellDialogs`] whether to continue with it), then the wines installed here, and downloads the default wine for the
/// OS when none works. It answers `{ ok, wineVersion?, persistGameWine, globalWineVersion?, log }`: the writes are data
/// for the TS adapter to apply, Rust writes no config (Pitfall 7). The shell appends
/// [`wine_dispatch::wine_run_host`]. A question waits for the user and a download can take minutes, both past the
/// sidecar's 60 s `RUST_INVOKE_TIMEOUT_MS`, so the shim that calls it (88.1-16) lists the channel as unbounded; the
/// crate's `guarded` registrant and the shutdown token end it at exit.
pub(crate) fn rpc_launch_check_wine_before_launch(args: &[Value]) -> Result<Value, String> {
    check_wine_before_launch_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

/// What the shell knows of its own process that a runner call needs and the sidecar must not send (T-88.1-14): the
/// environment the child inherits as a map (a variable that is not UTF-8 is left out, as the crate's snapshot holds
/// text) and the `PATH` the PowerShell probe searches (empty when it is unset or not UTF-8). The sidecar is this
/// shell's child, so its environment is this one's. `vars` and `path` are what this process reads, so a test can
/// drive both.
fn runner_host_over(
    vars: impl Iterator<Item = (std::ffi::OsString, std::ffi::OsString)>,
    path: Option<std::ffi::OsString>,
) -> Value {
    let env: serde_json::Map<String, Value> = vars
        .filter_map(|(key, value)| {
            Some((
                key.into_string().ok()?,
                Value::String(value.into_string().ok()?),
            ))
        })
        .collect();
    serde_json::json!({
        "env": env,
        "path": path.and_then(|path| path.into_string().ok()).unwrap_or_default(),
    })
}

/// [`runner_host_over`] over this process: its environment and its `PATH` (`var_os` finds `Path` on Windows).
fn runner_host() -> Value {
    runner_host_over(std::env::vars_os(), std::env::var_os("PATH"))
}

/// The body of the `launch_runner_call` arm over a given context and host: the generated decode (one object, the
/// runner one of the five names) and an arity check first, so a bad call is rejected the same fixed `<op>:bad-args`
/// literal before and after the install and never echoes the sidecar's value, then the crate over `[call, host]`,
/// which decodes the object strictly again. `host` is the shell's own facts (T-88.1-14), taken only once the context
/// is there.
fn runner_call_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    LaunchRunnerCallArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_runner_call:bad-args".to_string());
    }
    let ctx = ctx.ok_or_else(|| "launch_runner_call:not-ready".to_string())?;
    rpc_launch_op(Some(ctx), "launch_runner_call", &[args[0].clone(), host()])
}

/// The `launch_runner_call` `rustInvoke` arm (88.2-15, D-02, D-19): a runner command, helper class, run to its end and
/// answered as the TS `ExecResult`. The call runs here, on the dispatcher's worker thread for this one request (every
/// `rustInvoke` runs on its own spawned thread, so a long run never holds the reader or another call), and a call
/// that observes the stream writes its `runnerOutput` and `runnerSpawned` frames to the sidecar's stdin from that
/// thread before this arm returns, so they reach the sidecar ahead of the reply on the one ordered pipe. The shell
/// appends [`runner_host`]. A runner command runs as long as an install or a game, so the sidecar lists the channel as
/// unbounded (`UNBOUNDED_RUST_CHANNELS`); the abort id, `launch_runner_kill`, the crate's `guarded` registrant and the
/// shutdown token end it.
pub(crate) fn rpc_launch_runner_call(args: &[Value]) -> Result<Value, String> {
    runner_call_over(launch_ctx(), args, runner_host)
}

/// The body of the `launch_runner_kill` arm over a given context: the generated decode (`[streamId]`) and an arity
/// check first, then the crate, which bounds the id (a name with no path separator or control character) and ends the
/// run of the call that watches that stream. The crate answers how many runs it ended; the sidecar is told whether one
/// answered, so the answer is a boolean (`false` for an id no run holds, a run that has already ended included).
fn runner_kill_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchRunnerKillArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_runner_kill:bad-args".to_string());
    }
    let ended = rpc_launch_op(ctx, "launch_runner_kill", args)?;
    Ok(Value::Bool(ended.as_u64().is_some_and(|count| count > 0)))
}

/// The `launch_runner_kill` `rustInvoke` arm (88.2-15, D-02, D-19): ends the run of the call that watches the stream the
/// caller opened (the spawned handle's `kill()` and spawnAsync's abort send it). A lookup and a signal, so the sidecar
/// keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`; the crate does not cut it short at shutdown, because the quit-kill
/// runs while the shutdown token may already be cancelled. A kill never reaches another run: it ends only what answers to
/// the id the caller named.
pub(crate) fn rpc_launch_runner_kill(args: &[Value]) -> Result<Value, String> {
    runner_kill_over(launch_ctx(), args)
}

/// The body of the `launch_runner_abort` arm over a given context: the generated decode (`[abortId]`) and an arity check
/// first, then the crate, which bounds the id and answers whether a run answered to it.
fn runner_abort_over(ctx: Option<&Arc<LaunchCtx>>, args: &[Value]) -> Result<Value, String> {
    LaunchRunnerAbortArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_runner_abort:bad-args".to_string());
    }
    rpc_launch_op(ctx, "launch_runner_abort", args)
}

/// The `launch_runner_abort` `rustInvoke` arm (88.2-15, D-02, D-19): `abortController.abort()` for a run of either class,
/// by the abort id the call was given (the download manager's cancel sends it). The run then answers its call `{ abort:
/// true }`. A lookup and a signal, so the sidecar keeps it inside the 60 s `RUST_INVOKE_TIMEOUT_MS`.
pub(crate) fn rpc_launch_runner_abort(args: &[Value]) -> Result<Value, String> {
    runner_abort_over(launch_ctx(), args)
}

/// The body of the `launch_wine_command` arm over a given context and host: the generated decode (one object; a
/// `gameSettings` that is present must be an object) and an arity check first, so a bad call is rejected the same fixed
/// `<op>:bad-args` literal before and after the install and never echoes the sidecar's value, then the crate over
/// `[call, host]`, which decodes the object strictly again. `host` is the shell's own wine facts (T-88.1-14), taken only
/// once the context is there.
fn wine_command_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchWineCommandArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_wine_command:bad-args".to_string());
    }
    if let Some(settings) = decoded.game_settings {
        settings_object(settings, "launch_wine_command")?;
    }
    let ctx = ctx.ok_or_else(|| "launch_wine_command:not-ready".to_string())?;
    rpc_launch_op(Some(ctx), "launch_wine_command", &[args[0].clone(), host()])
}

/// The `launch_wine_command` `rustInvoke` arm (88.2-17, D-02, D-19): `runWineCommand`, one wine command for a game or an
/// installer, answered `{ stdout, stderr, code? }`. It runs on the dispatcher's worker thread for this one request (every
/// `rustInvoke` runs on its own spawned thread, so a run that lasts as long as a game holds neither the reader nor another
/// call), and a call that observes the stream writes its `runnerOutput` and `runnerSpawned` frames from that thread before
/// the arm returns, so they precede the reply on the one ordered stdin pipe. The shell appends
/// [`wine_dispatch::wine_run_host`]. A wine command runs as long as the game or installer it hosts, so the sidecar lists the
/// channel as unbounded (`UNBOUNDED_RUST_CHANNELS`); a tracked kill, the crate's `guarded` registrant and the shutdown token
/// end it.
pub(crate) fn rpc_launch_wine_command(args: &[Value]) -> Result<Value, String> {
    wine_command_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

/// The body of the `launch_wine_path` arm over a given context and host: the generated decode (`{ path, gameSettings,
/// variant? }`, the settings an object) and an arity check first, then the crate over `[call, host]`.
fn wine_path_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    let decoded = LaunchWinePathArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_wine_path:bad-args".to_string());
    }
    settings_object(decoded.game_settings, "launch_wine_path")?;
    let ctx = ctx.ok_or_else(|| "launch_wine_path:not-ready".to_string())?;
    rpc_launch_op(Some(ctx), "launch_wine_path", &[args[0].clone(), host()])
}

/// The `launch_wine_path` `rustInvoke` arm (88.2-17, D-02, D-19): `getWinePath`, a path translated by `winepath` inside the
/// game's prefix through the wine command core, answered as text (`""` when `winepath` printed nothing). The shell appends
/// [`wine_dispatch::wine_run_host`]. It runs a wine command, which can outlast the sidecar's 60 s `RUST_INVOKE_TIMEOUT_MS`
/// on a cold prefix, so the channel is unbounded.
pub(crate) fn rpc_launch_wine_path(args: &[Value]) -> Result<Value, String> {
    wine_path_over(launch_ctx(), args, wine_dispatch::wine_run_host)
}

/// The body of the `launch_script_run` arm over a given context and host: the generated decode (one object) and an arity
/// check first, then the crate over `[call, host]`, which decodes the object strictly again. `host` is the shell's own
/// facts ([`runner_host`]), taken only once the context is there. A script that could not be started is the crate's `Err`
/// text, which passes through as the dispatch error.
fn script_run_over(
    ctx: Option<&Arc<LaunchCtx>>,
    args: &[Value],
    host: impl FnOnce() -> Value,
) -> Result<Value, String> {
    LaunchScriptRunArgs::from_args(args)?;
    if args.len() != 1 {
        return Err("launch_script_run:bad-args".to_string());
    }
    let ctx = ctx.ok_or_else(|| "launch_script_run:not-ready".to_string())?;
    rpc_launch_op(Some(ctx), "launch_script_run", &[args[0].clone(), host()])
}

/// The `launch_script_run` `rustInvoke` arm (88.2-17, D-02, D-19): `runScriptForGame`, a game's before or after launch
/// script, run as a Helper and answered `true` once it has exited (whatever its code). The shell appends [`runner_host`]:
/// the environment the script inherits, laid over the `HEROIC_GAME_*` block. A script runs as long as the user wrote it
/// to, so the sidecar lists the channel as unbounded; the crate's `guarded` registrant and the shutdown token end it.
pub(crate) fn rpc_launch_script_run(args: &[Value]) -> Result<Value, String> {
    script_run_over(launch_ctx(), args, runner_host)
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

    /// The settings fields the env builders need: the game's wine installation (the wine ops require it;
    /// `setupEnvVars` reads none, and Windows settings carry none), `extra` adds the rest.
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
    fn the_game_env_arm_answers_settings_with_no_wine() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        // The sidecar's exact argument shape on Windows: the settings alone, no wine in them (CR-01).
        let bare = setup_env_vars_over(Some(&ctx), &[json!({})], host).unwrap();
        assert_eq!(bare, json!({"LD_PRELOAD": ""}));
        let got = setup_env_vars_over(
            Some(&ctx),
            &[
                json!({"nvidiaPrime": true, "wineVersion": {}}),
                json!("C:\\Games\\G"),
            ],
            host,
        )
        .unwrap();
        assert_eq!(got["DRI_PRIME"], json!("1"));
        assert_eq!(got["LD_PRELOAD"], json!(""));
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
            verify_wine_prefix_over(None, std::slice::from_ref(&crossover), host),
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

    fn wine_finish_args(settings: Value) -> Value {
        json!({
            "runner": "gog",
            "appName": "1234",
            "title": "A Game",
            "settings": settings,
            "storedSettings": settings,
            "prefixUpdated": false,
            "mergesTier1Env": true,
            "isGog": false,
        })
    }

    #[test]
    fn the_wine_finish_arm_is_not_ready_before_the_install_and_answers_the_reply_after() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let settings = json!({
            "winePrefix": "/nonexistent/prefix",
            "wineVersion": {"bin": "/nonexistent/wine", "name": "W", "type": "proton"},
        });
        let args = vec![wine_finish_args(settings)];
        assert_eq!(
            prepare_wine_finish_over(None, &args, host),
            Err("launch_prepare_wine_finish:not-ready".to_string())
        );
        // A proton game with nothing to fix: the env is the wine env, the overlay env is empty and the
        // deadline arms nothing (no engine selection), so the reply is a success with an empty log.
        let got = prepare_wine_finish_over(Some(&ctx), &args, || json!({})).unwrap();
        assert_eq!(got["success"], json!(true));
        assert_eq!(got["knownFixEnv"], json!({}));
        assert_eq!(got["log"], json!([]));
        assert!(got["envVars"].is_object());
    }

    #[test]
    fn the_wine_finish_arm_rejects_a_wrong_call_with_its_fixed_bad_args_before_and_after_the_install(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        let wrong: Vec<Vec<Value>> = vec![
            vec![wine_finish_args(json!(secret))],
            vec![wine_finish_args(json!({})), json!({})],
            // Stored settings that are not an object.
            vec![{
                let mut args = wine_finish_args(json!({}));
                args["storedSettings"] = json!(secret);
                args
            }],
            vec![json!({
                "runner": "epic", "appName": "1", "title": secret, "settings": {},
                "storedSettings": {}, "prefixUpdated": false, "mergesTier1Env": true, "isGog": false,
            })],
            vec![json!({
                "runner": "gog", "appName": 1, "title": "t", "settings": {},
                "storedSettings": {}, "prefixUpdated": false, "mergesTier1Env": true, "isGog": false,
            })],
        ];
        for args in &wrong {
            for ctx in [None, Some(&ctx)] {
                let err = prepare_wine_finish_over(ctx, args, host).unwrap_err();
                assert_eq!(err, "launch_prepare_wine_finish:bad-args", "{args:?}");
                assert!(!err.contains(secret));
            }
        }
        // An unknown key passes the generated decode and is the crate's to refuse; so is a settings object that is
        // not game settings.
        let mut extra = wine_finish_args(json!({}));
        extra["extra"] = json!(secret);
        let err = prepare_wine_finish_over(Some(&ctx), &[extra], || json!({})).unwrap_err();
        assert_eq!(err, "launch_prepare_wine_finish:bad-args");
        assert!(!err.contains(secret));
        let err =
            prepare_wine_finish_over(Some(&ctx), &[wine_finish_args(json!({}))], || json!({}))
                .unwrap_err();
        assert_eq!(err, "launch_prepare_wine_finish:bad-args");
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
        let arms: [(&str, Arm); 8] = [
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
            ("launch_prepare_wine_finish", |c, a| {
                prepare_wine_finish_over(c, a, host)
            }),
            ("launch_check_wine_before_launch", |c, a| {
                check_wine_before_launch_over(c, a, host)
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

    fn check_wine_args(wine: Value) -> Value {
        json!({
            "appName": "1234",
            "runner": "gog",
            "wineVersion": wine,
            "verboseLogs": false,
            "disableLogs": false,
        })
    }

    #[test]
    fn the_check_wine_arm_is_not_ready_before_the_install_and_rejects_a_wrong_call_after() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        let wine = json!({"bin": "/nonexistent/wine", "name": "W", "type": "wine"});
        assert_eq!(
            check_wine_before_launch_over(None, &[check_wine_args(wine.clone())], host),
            Err("launch_check_wine_before_launch:not-ready".to_string())
        );
        // A game wine that is not an object is refused before and after the install, without echoing it.
        for ctx in [None, Some(&ctx)] {
            let err = check_wine_before_launch_over(ctx, &[check_wine_args(json!(secret))], host)
                .unwrap_err();
            assert_eq!(err, "launch_check_wine_before_launch:bad-args");
            assert!(!err.contains(secret));
        }
        // An unknown key and a runner outside the five are refused by the generated decode.
        let mut extra = check_wine_args(wine.clone());
        extra["extra"] = json!(secret);
        let mut epic = check_wine_args(wine);
        epic["runner"] = json!("epic");
        for args in [extra, epic] {
            let err = check_wine_before_launch_over(Some(&ctx), &[args], host).unwrap_err();
            assert_eq!(err, "launch_check_wine_before_launch:bad-args");
            assert!(!err.contains(secret));
        }
    }

    #[test]
    fn a_context_with_no_dialog_source_answers_every_question_as_a_dismissal() {
        // The context the CLI builds (and `ctx_over` here) has no dialog source: the question is never shown and the
        // answer is a dismissal, which `checkWineBeforeLaunch` reads as "No" (T-88.1-34).
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        assert!(ctx.dialogs.is_none());
        let buttons = ["YES".to_string(), "NO".to_string()];
        assert_eq!(
            gamelib_launch::prepare::dialogs::ask(&ctx, "title", "message", &buttons),
            None
        );
    }

    /// A runner call as the sidecar sends it: a `/bin/sh` that prints and exits.
    fn runner_call_args(script: &str) -> Value {
        json!({
            "commandParts": ["-c", script],
            "runner": {"name": "sideload", "bin": "/bin/sh", "logPrefix": "Sideload"},
            "env": [["ZED", "1"], ["ALPHA", "2"]]
        })
    }

    #[test]
    fn the_runner_host_is_the_shells_environment_as_a_map_and_its_path() {
        use std::ffi::OsString;
        let vars = vec![
            (OsString::from("A"), OsString::from("1")),
            (OsString::from("PATH"), OsString::from("/bin:/usr/bin")),
        ];
        assert_eq!(
            runner_host_over(vars.into_iter(), Some(OsString::from("/bin:/usr/bin"))),
            json!({"env": {"A": "1", "PATH": "/bin:/usr/bin"}, "path": "/bin:/usr/bin"})
        );
        // No PATH is the empty text, and a variable that is not UTF-8 is left out.
        assert_eq!(
            runner_host_over(std::iter::empty(), None),
            json!({"env": {}, "path": ""})
        );
        #[cfg(unix)]
        {
            use std::os::unix::ffi::OsStringExt;
            let bad = OsString::from_vec(vec![0x66, 0xff]);
            let vars = vec![(OsString::from("BAD"), bad.clone())];
            assert_eq!(
                runner_host_over(vars.into_iter(), Some(bad)),
                json!({"env": {}, "path": ""})
            );
        }
        // This process's own host carries what the process holds.
        let host = runner_host();
        assert!(host["env"].is_object());
        assert!(host["path"].is_string());
    }

    #[test]
    fn the_runner_call_arm_is_not_ready_before_the_install_and_rejects_a_wrong_call_the_same_way_after(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        assert_eq!(
            runner_call_over(None, &[runner_call_args("true")], host),
            Err("launch_runner_call:not-ready".to_string())
        );
        let mut stray_runner = runner_call_args("true");
        stray_runner["runner"]["name"] = json!("epic");
        let mut bad_target = runner_call_args("true");
        bad_target["logTargets"] = json!([{"target": {"kind": secret}}]);
        let wrong: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!({"commandParts": secret})],
            vec![runner_call_args("true"), json!(secret)],
            vec![stray_runner],
            vec![bad_target],
        ];
        for args in wrong {
            for ctx in [None, Some(&ctx)] {
                let err = runner_call_over(ctx, &args, host).unwrap_err();
                assert_eq!(err, "launch_runner_call:bad-args", "{args:?}");
                assert!(!err.contains(secret), "{args:?}");
            }
        }
        // An unknown key and a pair that is not two items pass the generated decode and are the crate's to refuse, which
        // needs the context: the same fixed literal, never echoing what was sent.
        let mut extra = runner_call_args("true");
        extra["extra"] = json!(secret);
        let mut short_pair = runner_call_args("true");
        short_pair["env"] = json!([["ONLY-KEY"]]);
        for args in [extra, short_pair] {
            let err = runner_call_over(Some(&ctx), &[args], host).unwrap_err();
            assert_eq!(err, "launch_runner_call:bad-args");
            assert!(!err.contains(secret));
        }
    }

    #[cfg(unix)]
    #[test]
    fn the_runner_call_arm_runs_the_call_over_the_shells_host_and_answers_the_exec_result() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        // The child sees the shell's variables (the host) and the caller's own, which win.
        let got = runner_call_over(
            Some(&ctx),
            &[runner_call_args("printf '%s-%s' \"$HOST_ONLY\" \"$ZED\"")],
            || json!({"env": {"HOST_ONLY": "h", "ZED": "host", "PATH": "/usr/bin:/bin"}, "path": "/usr/bin:/bin"}),
        )
        .unwrap();
        assert_eq!(got["stdout"], json!("h-1"), "{got}");
        assert!(got.get("error").is_none(), "{got}");
        // A non-zero exit is the answer's `error`, not an `Err`.
        let failed = runner_call_over(Some(&ctx), &[runner_call_args("exit 3")], host).unwrap();
        assert!(failed["error"].is_string(), "{failed}");
    }

    #[test]
    fn the_kill_and_abort_arms_are_not_ready_before_the_install_and_reject_a_wrong_call_the_same_way_after(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        assert_eq!(
            runner_kill_over(None, &[json!("stream-1")]),
            Err("launch_runner_kill:not-ready".to_string())
        );
        assert_eq!(
            runner_abort_over(None, &[json!("abort-1")]),
            Err("launch_runner_abort:not-ready".to_string())
        );
        // Not a string, no argument, a second argument and an id with a path separator are the fixed literal.
        let wrong: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(1)],
            vec![json!({"x": secret})],
            vec![json!("a"), json!(secret)],
        ];
        for args in &wrong {
            for ctx in [None, Some(&ctx)] {
                let err = runner_kill_over(ctx, args).unwrap_err();
                assert_eq!(err, "launch_runner_kill:bad-args", "{args:?}");
                assert!(!err.contains(secret));
                let err = runner_abort_over(ctx, args).unwrap_err();
                assert_eq!(err, "launch_runner_abort:bad-args", "{args:?}");
                assert!(!err.contains(secret));
            }
        }
        for bad in [secret, "", "a\\b", "line\nbreak"] {
            let err = runner_kill_over(Some(&ctx), &[json!(bad)]).unwrap_err();
            assert_eq!(err, "launch_runner_kill:bad-args", "{bad:?}");
            assert!(!err.contains(secret));
            let err = runner_abort_over(Some(&ctx), &[json!(bad)]).unwrap_err();
            assert_eq!(err, "launch_runner_abort:bad-args", "{bad:?}");
            assert!(!err.contains(secret));
        }
    }

    #[test]
    fn a_kill_or_abort_for_an_id_no_run_holds_answers_false_and_reaches_nothing() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        assert_eq!(
            runner_kill_over(Some(&ctx), &[json!("unknown-stream")]),
            Ok(json!(false))
        );
        assert_eq!(
            runner_abort_over(Some(&ctx), &[json!("unknown-abort")]),
            Ok(json!(false))
        );
    }

    /// Calls a runner that sleeps on a thread, waits until the arm under test answers `true` for `id` and answers
    /// what the call answered. A run is registered only once its child is spawned, so the arm is retried.
    #[cfg(unix)]
    fn end_a_sleeping_run(
        ctx: &Arc<LaunchCtx>,
        call: Value,
        end: impl Fn(&Arc<LaunchCtx>) -> Result<Value, String>,
    ) -> Value {
        let runner_ctx = Arc::clone(ctx);
        let runner = std::thread::spawn(move || runner_call_over(Some(&runner_ctx), &[call], host));
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        loop {
            if end(ctx) == Ok(json!(true)) {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "the run never answered to its id"
            );
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        runner.join().unwrap().unwrap()
    }

    #[cfg(unix)]
    #[test]
    fn a_kill_by_stream_id_ends_that_run_only_and_the_call_answers_ended() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let mut other = runner_call_args("sleep 30");
        other["streamId"] = json!("stream-other");
        other["observe"] = json!(true);
        let other_ctx = Arc::clone(&ctx);
        let other_run =
            std::thread::spawn(move || runner_call_over(Some(&other_ctx), &[other], host));
        let mut mine = runner_call_args("sleep 30");
        mine["streamId"] = json!("stream-mine");
        mine["observe"] = json!(true);
        let answered = end_a_sleeping_run(&ctx, mine, |ctx| {
            runner_kill_over(Some(ctx), &[json!("stream-mine")])
        });
        assert!(
            answered.get("abort") == Some(&json!(true)) || answered["error"].is_string(),
            "{answered}"
        );
        // The other run is still going: it answers to its own id, and then ends.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while runner_kill_over(Some(&ctx), &[json!("stream-other")]) != Ok(json!(true)) {
            assert!(
                std::time::Instant::now() < deadline,
                "the other run was gone"
            );
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        other_run.join().unwrap().unwrap();
        // Both are gone now.
        assert_eq!(
            runner_kill_over(Some(&ctx), &[json!("stream-mine")]),
            Ok(json!(false))
        );
    }

    #[cfg(unix)]
    #[test]
    fn an_abort_by_abort_id_ends_the_run_and_the_call_answers_abort() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let mut call = runner_call_args("sleep 30");
        call["abortId"] = json!("abort-mine");
        let answered = end_a_sleeping_run(&ctx, call, |ctx| {
            runner_abort_over(Some(ctx), &[json!("abort-mine")])
        });
        assert_eq!(answered["abort"], json!(true), "{answered}");
        assert_eq!(
            runner_abort_over(Some(&ctx), &[json!("abort-mine")]),
            Ok(json!(false))
        );
    }
    /// A game's settings whose wine is not installed here: the wine command core answers `Invalid wine` for it without
    /// spawning anything, so the arms run end to end on every OS.
    fn missing_wine_settings(prefix: &std::path::Path) -> Value {
        json!({
            "winePrefix": prefix.to_string_lossy(),
            "wineVersion": {"bin": "/nonexistent/wine-bin", "name": "Nothing", "type": "wine"}
        })
    }

    fn wine_command_args(prefix: &std::path::Path) -> Value {
        json!({
            "gameSettings": missing_wine_settings(prefix),
            "commandParts": ["cmd", "/c", "echo", "x"],
            "skipPrefixCheckIKnowWhatImDoing": true,
            "options": {"env": {"ZED": "1"}, "wrappers": ["wrap"], "trackKey": "key-1"},
            "logTargets": [{"target": {"kind": "general"}}],
            "observe": false
        })
    }

    fn script_run_args(script: &str) -> Value {
        json!({
            "scriptPath": script,
            "stage": "before",
            "appName": "app-1",
            "runner": "gog",
            "title": "Title",
            "settingsJson": "{\"a\":1}",
            "infoJson": "{\"b\":2}"
        })
    }

    #[test]
    fn the_wine_command_path_and_script_arms_are_not_ready_before_the_install_and_reject_a_wrong_call_the_same_way_after(
    ) {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let secret = "/Users/someone/secret-profile-path";
        let prefix = home.root().join("prefix");
        assert_eq!(
            wine_command_over(None, &[wine_command_args(&prefix)], host),
            Err("launch_wine_command:not-ready".to_string())
        );
        assert_eq!(
            wine_path_over(
                None,
                &[json!({"path": "C:\\x", "gameSettings": missing_wine_settings(&prefix)})],
                host
            ),
            Err("launch_wine_path:not-ready".to_string())
        );
        assert_eq!(
            script_run_over(None, &[script_run_args("/bin/true")], host),
            Err("launch_script_run:not-ready".to_string())
        );

        let mut command_settings_text = wine_command_args(&prefix);
        command_settings_text["gameSettings"] = json!(secret);
        let mut command_stray_target = wine_command_args(&prefix);
        command_stray_target["logTargets"] = json!([{"target": {"kind": secret}}]);
        let wrong_command: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!({"commandParts": secret})],
            vec![wine_command_args(&prefix), json!(secret)],
            vec![command_settings_text],
            vec![command_stray_target],
        ];
        for args in &wrong_command {
            for ctx in [None, Some(&ctx)] {
                let err = wine_command_over(ctx, args, host).unwrap_err();
                assert_eq!(err, "launch_wine_command:bad-args", "{args:?}");
                assert!(!err.contains(secret), "{args:?}");
            }
        }
        let wrong_path: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!({"path": secret})],
            vec![json!({"path": "p", "gameSettings": secret})],
            vec![json!({"path": "p", "gameSettings": {}, "variant": secret})],
            vec![json!({"path": "p", "gameSettings": {}}), json!(secret)],
        ];
        for args in &wrong_path {
            for ctx in [None, Some(&ctx)] {
                let err = wine_path_over(ctx, args, host).unwrap_err();
                assert_eq!(err, "launch_wine_path:bad-args", "{args:?}");
                assert!(!err.contains(secret), "{args:?}");
            }
        }
        let mut script_stage = script_run_args("/bin/true");
        script_stage["stage"] = json!(secret);
        let wrong_script: Vec<Vec<Value>> = vec![
            vec![],
            vec![json!(secret)],
            vec![json!({"scriptPath": secret})],
            vec![script_run_args("/bin/true"), json!(secret)],
            vec![script_stage],
        ];
        for args in &wrong_script {
            for ctx in [None, Some(&ctx)] {
                let err = script_run_over(ctx, args, host).unwrap_err();
                assert_eq!(err, "launch_script_run:bad-args", "{args:?}");
                assert!(!err.contains(secret), "{args:?}");
            }
        }
        // An unknown key passes the generated decode and is the crate's to refuse, which needs the context: the same literal.
        let mut extra = wine_command_args(&prefix);
        extra["extra"] = json!(secret);
        let err = wine_command_over(Some(&ctx), &[extra], host).unwrap_err();
        assert_eq!(err, "launch_wine_command:bad-args");
        let mut extra = script_run_args("/bin/true");
        extra["extra"] = json!(secret);
        let err = script_run_over(Some(&ctx), &[extra], host).unwrap_err();
        assert_eq!(err, "launch_script_run:bad-args");
        assert!(!err.contains(secret));
    }

    #[test]
    fn the_wine_command_arm_runs_the_call_over_the_shells_wine_host_and_answers_stdout_and_stderr()
    {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let prefix = home.root().join("prefix");
        let got = wine_command_over(Some(&ctx), &[wine_command_args(&prefix)], host).unwrap();
        // A wine that is not installed is refused without a spawn: an empty stdout, `Invalid wine` and no code.
        assert_eq!(got, json!({"stdout": "", "stderr": "Invalid wine"}));
        // The shell's own host carries its wine facts: the process environment.
        let own = wine_dispatch::wine_run_host();
        assert!(own["env"].is_object());
    }

    #[test]
    fn the_wine_path_arm_answers_an_empty_path_for_a_wine_that_is_not_installed() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let prefix = home.root().join("prefix");
        let got = wine_path_over(
            Some(&ctx),
            &[json!({
                "path": "C:\\Windows",
                "gameSettings": missing_wine_settings(&prefix),
                "variant": "unix"
            })],
            host,
        )
        .unwrap();
        assert_eq!(got, json!(""));
    }

    #[cfg(unix)]
    #[test]
    fn the_script_arm_runs_the_script_over_the_shells_host_and_answers_true_whatever_its_code() {
        use std::os::unix::fs::PermissionsExt;
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let dir = home.root().join("scripts");
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("out.txt");
        let script = dir.join("before.sh");
        std::fs::write(
            &script,
            format!(
                "#!/bin/sh\nprintf '%s|%s|%s' \"$HOST_ONLY\" \"$HEROIC_GAME_SETTINGS\" \"$HEROIC_GAME_INFO\" > '{}'\nexit 7\n",
                out.display()
            ),
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let got = script_run_over(
            Some(&ctx),
            &[script_run_args(&script.to_string_lossy())],
            || json!({"env": {"HOST_ONLY": "h", "PATH": "/usr/bin:/bin"}, "path": "/usr/bin:/bin"}),
        )
        .unwrap();
        assert_eq!(got, json!(true));
        // The settings and info text arrive exactly as the sidecar stringified them.
        assert_eq!(
            std::fs::read_to_string(&out).unwrap(),
            "h|{\"a\":1}|{\"b\":2}"
        );
    }

    #[test]
    fn a_script_that_cannot_start_is_the_dispatch_error_with_the_crates_text() {
        let home = FakeHome::new("launch-shell-");
        let ctx = ctx_over(&home);
        let missing = home.root().join("no-such-script");
        let err = script_run_over(
            Some(&ctx),
            &[script_run_args(&missing.to_string_lossy())],
            host,
        )
        .unwrap_err();
        assert!(!err.is_empty());
        assert!(
            !err.ends_with(":bad-args") && !err.ends_with(":not-ready"),
            "{err}"
        );
    }
}
