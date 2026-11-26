//! The launch services (Phase 88, SVC-03): the launch builders, the runner spawn, the funnel and
//! re-adoption, ported from the TypeScript sidecar by 88.1 to 88.3. This crate owns the dispatch
//! contract and the op list; [`builders`] holds the pure launch builders (88.1-06), which 91 and 92
//! also call in process, and [`prepare`] the prepare steps (88.1-11 onward).
//!
//! Tauri-free, no environment reads, no `keyring`, and a child process only ever through
//! `gamelib-proc` (`SpawnClass::Game` for what must outlive GameLib). Every log line goes through
//! `EngineCtx.log` as fixed text. Every op goes through [`dispatch`], which answers `unknown op: <op>`
//! for a name not in [`OPS`].
//!
//! This crate may depend on `gamelib-engine`, `gamelib-wine`, `gamelib-knownfix` and `gamelib-info`; none of
//! them ever depends on it (87 D-04, the one-way rule).

pub mod builders;
pub mod ctx;
pub mod game;
pub mod hooks;
pub mod prepare;
pub mod runner;

/// The cancel token a long op takes, re-exported so the shell, which owns the renderer's cancel, needs
/// no `tokio-util` of its own.
pub use tokio_util::sync::CancellationToken;

use builders::{env, known_fix_env, wrappers};
use ctx::LaunchCtx;
use gamelib_knownfix::types::Runner;
use gamelib_wine::tools::ToolsHost;
use gamelib_wine::wine_cmd::env::{GameSettingsView, SetupEnvView};
use gamelib_wine::wine_cmd::WineHost;
use prepare::check_wine::CheckWineArgs;
use prepare::deps::CtxPrepareDeps;
use prepare::epic;
use prepare::launch::{PrepareHost, PrepareLaunchArgs};
use prepare::wine_begin::PrepareWineBeginArgs;
use prepare::wine_finish::PrepareWineFinishArgs;
use runner::call_runner::{abort_run, call_runner, RunnerCallArgs, RunnerHost};
use runner::stream::{NullSink, OutputSink, UiOutputSink};
use serde::Deserialize;
use serde_json::Value;
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::{Arc, OnceLock};
use std::task::{Context, Poll};
use tokio::runtime::{Builder, Handle, Runtime};

/// Ops reachable from the shell and the CLI. Keep sorted; each plan adds its own.
pub const OPS: &[&str] = &[
    "launch_ask_force_uninstall",
    "launch_check_wine_before_launch",
    "launch_epic_service_offline",
    "launch_games_running",
    "launch_known_fix_env",
    "launch_prepare",
    "launch_prepare_wine_begin",
    "launch_prepare_wine_finish",
    "launch_runner_abort",
    "launch_runner_call",
    "launch_runner_kill",
    "launch_setup_env_vars",
    "launch_setup_wine_env_vars",
    "launch_setup_wrapper_env_vars",
    "launch_setup_wrappers",
    "launch_tracked_kill",
    "launch_tracked_kill_all",
    "launch_verify_wine_prefix",
];

/// The ops that end a run. They are not cut short by the app shutdown: a quit-kill runs while the shutdown
/// token may already be cancelled, and holds its own registrant and bound (`ExitBudget::DEFAULT.child_grace`).
const KILL_OPS: &[&str] = &[
    "launch_runner_abort",
    "launch_runner_kill",
    "launch_tracked_kill",
    "launch_tracked_kill_all",
];

/// Runs `op` over `args`. `Err` is only an unknown op, bad arguments, a shutdown, a wrong thread or a
/// panic (`<op>:panic`).
pub async fn dispatch(op: &str, args: &[Value], ctx: &LaunchCtx) -> Result<Value, String> {
    let Some(name) = OPS.iter().copied().find(|o| *o == op) else {
        return Err(format!("unknown op: {op}"));
    };
    if KILL_OPS.contains(&name) {
        return unguarded(name, route(name, args, ctx)).await;
    }
    guarded(name, ctx, route(name, args, ctx)).await
}

/// [`guarded`] without the shutdown cut-off and the "launch" registrant: a panic is still `<op>:panic`.
async fn unguarded<F>(op: &str, work: F) -> Result<Value, String>
where
    F: Future<Output = Result<Value, String>>,
{
    let work = std::pin::pin!(work);
    match (CatchUnwind(work)).await {
        Ok(result) => result,
        Err(()) => Err(format!("{op}:panic")),
    }
}

/// Each plan adds its arms here, in step with `OPS`. Every arm is a thin wrapper over a function of
/// [`builders`]; a bad argument is the fixed `<op>:bad-args` and never echoes what was sent.
async fn route(op: &str, args: &[Value], ctx: &LaunchCtx) -> Result<Value, String> {
    let bad = || format!("{op}:bad-args");
    let result_of =
        |value: Result<Value, serde_json::Error>| value.map_err(|_| format!("{op}:bad-result"));
    match op {
        // `isEpicServiceOffline`. Arguments `[service | null]`: one of the three service names, or `null` for
        // the default (`Epic Games Store`). Answers a boolean. One JSON GET inside the sidecar's 60 s bound.
        "launch_epic_service_offline" => {
            let [service] = args else {
                return Err(bad());
            };
            let service = epic::service_arg(service).ok_or_else(bad)?;
            Ok(epic::offline_reply(
                epic::epic_service_offline(ctx, service).await,
            ))
        }
        // `prepareLaunch`. Arguments `[args, host]`: the game and the TS-only facts (`PrepareLaunchArgs`) and
        // the process facts the shell read (`PrepareHost`). Answers the TS reply plus its per-game `log`
        // lines. May fetch the umu runtime, which can outlast the sidecar's 60 s bound, so its shim lists the
        // channel as unbounded (the shutdown token still ends it).
        "launch_prepare" => {
            let [prepare @ Value::Object(_), host @ Value::Object(_)] = args else {
                return Err(bad());
            };
            let prepare: PrepareLaunchArgs =
                serde_json::from_value(prepare.clone()).map_err(|_| bad())?;
            if !prepare.settings.is_object() {
                return Err(bad());
            }
            let host: PrepareHost = serde_json::from_value(host.clone()).map_err(|_| bad())?;
            let deps = CtxPrepareDeps::new(ctx, &host.wine);
            let reply = prepare::launch::prepare_launch(ctx, &deps, prepare, &host)
                .await
                .map_err(|e| format!("{op}:{e}"))?;
            result_of(serde_json::to_value(reply))
        }
        // `prepareWineLaunch` up to the store-setup point (88.1-12). Arguments `[args, host]`: the game and the
        // settings (`PrepareWineBeginArgs`) and the wine host facts the shell read. Answers the reply, the
        // launch settings the finish step is handed and the launch log lines. May create a wine prefix
        // (`wineboot`), which can outlast the sidecar's 60 s bound, so its shim lists the channel as unbounded.
        "launch_prepare_wine_begin" => {
            let [begin @ Value::Object(_), host] = args else {
                return Err(bad());
            };
            let begin: PrepareWineBeginArgs =
                serde_json::from_value(begin.clone()).map_err(|_| bad())?;
            let host = host_arg(host).ok_or_else(bad)?;
            let deps = CtxPrepareDeps::new(ctx, &host);
            let reply = prepare::wine_begin::prepare_wine_begin(ctx, &deps, begin, &host)
                .await
                .map_err(|reason| format!("{op}:{reason}"))?;
            result_of(serde_json::to_value(reply))
        }
        // `prepareWineLaunch` from the store-setup point on (88.1-13). Arguments `[args, host]`: the game, the
        // settings the begin step returned and the begin step's `prefixUpdated` (`PrepareWineFinishArgs`), and
        // the tool facts the shell built (the wine host, the bundled `public` directory, the online answer).
        // Answers `{ success, envVars, knownFixEnv, log }`. It may install a winetricks verb, a DXVK tool, a
        // runtime or an overlay, which can outlast the sidecar's 60 s bound, so its shim lists the channel as
        // unbounded.
        "launch_prepare_wine_finish" => {
            let [finish @ Value::Object(_), host] = args else {
                return Err(bad());
            };
            let finish: PrepareWineFinishArgs =
                serde_json::from_value(finish.clone()).map_err(|_| bad())?;
            let host = tools_host_arg(host).ok_or_else(bad)?;
            let deps = CtxPrepareDeps::new(ctx, &host.wine).with_tools(&host);
            let reply = prepare::wine_finish::prepare_wine_finish(ctx, &deps, finish, &host)
                .await
                .map_err(|reason| format!("{op}:{reason}"))?;
            result_of(serde_json::to_value(reply))
        }
        // `checkWineBeforeLaunch` (88.1-14). Arguments `[args, host]`: the game's wine, its log flags and the runner
        // and app (`CheckWineArgs`), and the wine host facts the shell read (the Darwin release the macOS release
        // choice reads). Answers `{ ok, wineVersion?, persistGameWine, globalWineVersion?, log }`: the writes are
        // data the TS adapter applies, Rust writes no config. It may ask the user a question and may download a
        // wine, which can outlast the sidecar's 60 s bound, so its shim lists the channel as unbounded.
        "launch_check_wine_before_launch" => {
            let [check @ Value::Object(_), host] = args else {
                return Err(bad());
            };
            let check: CheckWineArgs = serde_json::from_value(check.clone()).map_err(|_| bad())?;
            let host = host_arg(host).ok_or_else(bad)?;
            let deps = CtxPrepareDeps::new(ctx, &host);
            let reply = prepare::check_wine::check_wine_before_launch(ctx, &deps, check, &host)
                .await
                .map_err(|reason| format!("{op}:{reason}"))?;
            result_of(serde_json::to_value(reply))
        }
        // `askForceUninstall` (88.2-09). Arguments `[{ runner, appName }]`. Asks whether to remove a game whose
        // folder is gone from the installed list and, on "Yes", removes it through the manager hook. Answers the
        // index of the clicked button, or `null` for a dismissal (answered like "No": nothing is removed). It
        // waits on the user, so its shim lists the channel as unbounded.
        "launch_ask_force_uninstall" => {
            let [ask @ Value::Object(_)] = args else {
                return Err(bad());
            };
            let ask: AskForceUninstallArgs =
                serde_json::from_value(ask.clone()).map_err(|_| bad())?;
            if !bounded_name(&ask.app_name) {
                return Err(bad());
            }
            let answer =
                runner::error_handler::ask_force_uninstall(ctx, ask.runner, &ask.app_name).await;
            result_of(serde_json::to_value(answer))
        }
        // `callRunner`, helper class (88.2-07). Arguments `[args, host]`: the call (`RunnerCallArgs`) and the
        // process facts the shell read (`RunnerHost`: the environment the child inherits and the `PATH`).
        // Answers the `ExecResult`; a spawn failure, a signal or a non-zero exit is its `error`, a cancel its
        // `abort`. A run has no timeout, so its shim lists the channel as unbounded (the abort id and the app
        // shutdown still end it). A caller that watches the stream gets `runnerOutput` frames.
        "launch_runner_call" => {
            let [call @ Value::Object(_), host] = args else {
                return Err(bad());
            };
            let call: RunnerCallArgs = serde_json::from_value(call.clone()).map_err(|_| bad())?;
            let host: RunnerHost = match host {
                Value::Null => RunnerHost::default(),
                Value::Object(_) => serde_json::from_value(host.clone()).map_err(|_| bad())?,
                _ => return Err(bad()),
            };
            let sink: Arc<dyn OutputSink> = match (&ctx.engine.ui, call.observe) {
                (Some(ui), true) => Arc::new(UiOutputSink::new(ui.clone(), call.stream_id.clone())),
                _ => Arc::new(NullSink),
            };
            let result = call_runner(ctx, call, &host, sink).await;
            result_of(serde_json::to_value(result))
        }
        // Whether a game run is registered (D-07): the answer the quit check reads. Arguments `[]`.
        "launch_games_running" => {
            let [] = args else {
                return Err(bad());
            };
            Ok(Value::Bool(ctx.registry.games_running()))
        }
        // `killAllTracked`: ends every registered run, games through their own handles and helpers through their
        // tokens. Arguments `[]`. Answers how many it ended. Bounded by the exit budget's child grace.
        "launch_tracked_kill_all" => {
            let [] = args else {
                return Err(bad());
            };
            Ok(Value::from(
                ctx.registry.kill_all(&ctx.engine.shutdown).await,
            ))
        }
        // `killTracked` with the TS filter. Arguments `[{ runner?, key? }]`: no field ends every run, `runner`
        // alone every run of it, both one run. Answers how many it ended.
        "launch_tracked_kill" => {
            let [filter @ Value::Object(_)] = args else {
                return Err(bad());
            };
            let filter: TrackedKillArgs =
                serde_json::from_value(filter.clone()).map_err(|_| bad())?;
            if !filter.valid() {
                return Err(bad());
            }
            Ok(Value::from(
                ctx.registry
                    .kill_tracked(
                        &ctx.engine.shutdown,
                        filter.runner.as_deref(),
                        filter.key.as_deref(),
                    )
                    .await,
            ))
        }
        // Ends the run of the call that watches this stream. Arguments `[streamId]`. Answers how many it ended.
        "launch_runner_kill" => {
            let [Value::String(stream_id)] = args else {
                return Err(bad());
            };
            if !run_id(stream_id) {
                return Err(bad());
            }
            Ok(Value::from(
                ctx.registry
                    .kill_stream(&ctx.engine.shutdown, stream_id)
                    .await,
            ))
        }
        // `abortController.abort()` for a run of either class. Arguments `[abortId]`. Answers whether a run
        // answered to the id; the run then answers `{ abort: true }`.
        "launch_runner_abort" => {
            let [Value::String(abort_id)] = args else {
                return Err(bad());
            };
            if !run_id(abort_id) {
                return Err(bad());
            }
            Ok(Value::Bool(abort_run(ctx, abort_id).await))
        }
        // The tier-1 `envVariables` of a game, raw (`{}` when none). Arguments `[appName, runner]`.
        "launch_known_fix_env" => {
            let [Value::String(app_name), Value::String(runner)] = args else {
                return Err(bad());
            };
            if !bounded_name(app_name) {
                return Err(bad());
            }
            let runner = Runner::parse(runner).ok_or_else(bad)?;
            Ok(known_fix_env::known_fix_env(ctx, app_name, runner))
        }
        // `setupEnvVars`. Arguments `[settings, installPath | null, host]`.
        "launch_setup_env_vars" => {
            let (settings, install_path, host) = settings_arg::<SetupEnvView>(op, args)?;
            result_of(serde_json::to_value(env::setup_env_vars(
                ctx,
                &settings,
                install_path.as_deref(),
                &host,
            )))
        }
        // `setupWineEnvVars`. Arguments `[settings, gameId | null, host]`.
        "launch_setup_wine_env_vars" => {
            let (settings, game_id, host) = settings_arg::<GameSettingsView>(op, args)?;
            result_of(serde_json::to_value(env::setup_wine_env_vars(
                ctx,
                &settings,
                game_id.as_deref(),
                &host,
            )))
        }
        // `setupWrapperEnvVars`. The one object argument is `{ appName, appRunner }`.
        "launch_setup_wrapper_env_vars" => {
            let [arg @ Value::Object(_)] = args else {
                return Err(bad());
            };
            let arg: WrapperEnvArgs = serde_json::from_value(arg.clone()).map_err(|_| bad())?;
            let runner = Runner::parse(&arg.app_runner).ok_or_else(bad)?;
            result_of(serde_json::to_value(wrappers::setup_wrapper_env_vars(
                &arg.app_name,
                runner,
            )))
        }
        // `setupWrappers`. Arguments `[settings, mangoHudCommand | null, gameModeBin | null,
        // gameScopeCommand | null]`; `settings` is read for its `wrapperOptions` only.
        "launch_setup_wrappers" => {
            let [settings @ Value::Object(_), mango, game_mode, game_scope] = args else {
                return Err(bad());
            };
            let settings: WrapperSettings =
                serde_json::from_value(settings.clone()).map_err(|_| bad())?;
            let mango = optional_words(mango).ok_or_else(bad)?;
            let game_scope = optional_words(game_scope).ok_or_else(bad)?;
            let game_mode = match game_mode {
                Value::Null => None,
                Value::String(bin) => Some(bin.as_str()),
                _ => return Err(bad()),
            };
            let words = wrappers::setup_wrappers(
                settings.wrapper_options.as_deref(),
                mango.as_deref(),
                game_mode,
                game_scope.as_deref(),
            )
            .map_err(|e| format!("{op}:{}", e.message()))?;
            result_of(serde_json::to_value(words))
        }
        // `verifyWinePrefix`. Arguments `[settings, host]`. May run a wineboot as a Helper, which waits on a
        // fresh prefix, so the shell lists the channel as unbounded (the app shutdown still ends it).
        "launch_verify_wine_prefix" => {
            let [settings @ Value::Object(_), host] = args else {
                return Err(bad());
            };
            let settings = serde_json::from_value(settings.clone()).map_err(|_| bad())?;
            let host = host_arg(host).ok_or_else(bad)?;
            env::verify_wine_prefix(ctx, &settings, &host).await
        }
        _ => Err(format!("unknown op: {op}")),
    }
}

/// The host facts argument: `null` is none, an object is the facts, anything else (or an unknown fact) is `None`.
fn host_arg(host: &Value) -> Option<WineHost> {
    match host {
        Value::Null => Some(WineHost::default()),
        Value::Object(_) => serde_json::from_value(host.clone()).ok(),
        _ => None,
    }
}

/// The tool facts argument of the finish step: `null` is none, an object is the facts (the wine host, the
/// `public` directory, the online answer), anything else (or an unknown fact) is `None`.
fn tools_host_arg(host: &Value) -> Option<ToolsHost> {
    match host {
        Value::Null => Some(ToolsHost::default()),
        Value::Object(_) => serde_json::from_value(host.clone()).ok(),
        _ => None,
    }
}

/// An app name, app id or label: 1 to 256 UTF-16 units (the bound the known-fix ops hold names to).
fn bounded_name(name: &str) -> bool {
    !name.is_empty() && name.encode_utf16().count() <= 256
}

/// An abort id or stream id: a bounded name with no path separator or control character (an id is an app
/// name or a generated token, never a path).
fn run_id(id: &str) -> bool {
    bounded_name(id) && !id.chars().any(|c| c == '/' || c == '\\' || c.is_control())
}

/// The object argument of `launch_tracked_kill`.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TrackedKillArgs {
    runner: Option<String>,
    key: Option<String>,
}

impl TrackedKillArgs {
    fn valid(&self) -> bool {
        self.runner.as_deref().map_or(true, bounded_name)
            && self.key.as_deref().map_or(true, bounded_name)
    }
}

/// The object argument of `launch_ask_force_uninstall`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AskForceUninstallArgs {
    runner: runner::RunnerName,
    app_name: String,
}

/// The object argument of `launch_setup_wrapper_env_vars`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WrapperEnvArgs {
    app_name: String,
    app_runner: String,
}

/// The one field of `GameSettings` `launch_setup_wrappers` reads. The rest of the settings object is
/// ignored (the same leniency as [`GameSettingsView`] and [`SetupEnvView`]): the caller passes the whole
/// object.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WrapperSettings {
    #[serde(default)]
    wrapper_options: Option<Vec<wrappers::WrapperVariable>>,
}

/// `null` is no list; an array of strings is that list; anything else is `None`.
fn optional_words(value: &Value) -> Option<Option<Vec<String>>> {
    match value {
        Value::Null => Some(None),
        Value::Array(items) => items
            .iter()
            .map(|item| item.as_str().map(str::to_string))
            .collect::<Option<Vec<_>>>()
            .map(Some),
        _ => None,
    }
}

/// The `[settings, text | null, host]` shape of the two env ops, the settings decoded as the view `T` the
/// op reads: [`SetupEnvView`] for `launch_setup_env_vars` (no wine), [`GameSettingsView`] for
/// `launch_setup_wine_env_vars` (the game's wine is required). `host` is the process facts the shell
/// read (`env`, `darwinRelease`); `null` is none.
fn settings_arg<T: serde::de::DeserializeOwned>(
    op: &str,
    args: &[Value],
) -> Result<(T, Option<String>, WineHost), String> {
    let bad = || format!("{op}:bad-args");
    let [settings @ Value::Object(_), text, host] = args else {
        return Err(bad());
    };
    let settings = serde_json::from_value(settings.clone()).map_err(|_| bad())?;
    let text = match text {
        Value::Null => None,
        Value::String(text) => Some(text.clone()),
        _ => return Err(bad()),
    };
    let host = host_arg(host).ok_or_else(bad)?;
    Ok((settings, text, host))
}

/// The op wrapper: `work` runs holding a `Shutdown` registrant for exactly its lifetime and is
/// raced against the shutdown token, answering `<op>:shutdown` when cancelled and `<op>:panic` when
/// it panics. Once shutdown has begun, `work` is not started at all.
pub async fn guarded<F>(op: &str, ctx: &LaunchCtx, work: F) -> Result<Value, String>
where
    F: Future<Output = Result<Value, String>>,
{
    let _registrant = ctx.engine.shutdown.register("launch");
    let token = ctx.engine.shutdown.token();
    let work = std::pin::pin!(work);
    let mut work = CatchUnwind(work);
    tokio::select! {
        biased;
        _ = token.cancelled() => Err(format!("{op}:shutdown")),
        done = &mut work => match done {
            Ok(result) => result,
            Err(()) => Err(format!("{op}:panic")),
        },
    }
}

/// `futures::FutureExt::catch_unwind` for one future, without the crate: a panic in `poll` is an
/// `Err(())` and the future is never polled again.
struct CatchUnwind<'a, F>(Pin<&'a mut F>);

impl<F: Future> Future for CatchUnwind<'_, F> {
    type Output = Result<F::Output, ()>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.get_mut();
        match catch_unwind(AssertUnwindSafe(|| this.0.as_mut().poll(cx))) {
            Ok(Poll::Ready(value)) => Poll::Ready(Ok(value)),
            Ok(Poll::Pending) => Poll::Pending,
            Err(_) => Poll::Ready(Err(())),
        }
    }
}

/// The crate-owned runtime the synchronous entry point blocks on. Two workers, like
/// `gamelib-wine`'s: the shell's `rustInvoke` workers may call in concurrently.
fn runtime() -> Result<&'static Runtime, String> {
    static RUNTIME: OnceLock<Result<Runtime, String>> = OnceLock::new();
    RUNTIME
        .get_or_init(|| {
            Builder::new_multi_thread()
                .worker_threads(2)
                .thread_name("launch")
                .enable_all()
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// [`dispatch`] for a plain thread: blocks on the crate's own runtime. Called from inside a tokio
/// runtime it answers `<op>:wrong-thread` instead of panicking in `block_on`.
pub fn dispatch_sync(op: &str, args: &[Value], ctx: &LaunchCtx) -> Result<Value, String> {
    if Handle::try_current().is_ok() {
        return Err(format!("{op}:wrong-thread"));
    }
    runtime()
        .map_err(|e| format!("{op}:no-runtime ({e})"))?
        .block_on(dispatch(op, args, ctx))
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
    use std::sync::Arc;

    fn ctx(home: &FakeHome) -> LaunchCtx {
        let root = home.root().to_path_buf();
        let engine = Arc::new(EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Linux,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        ));
        let knownfix = Arc::new(KnownFixCtx::new(
            engine.clone(),
            None,
            "https://relay.test",
            "1.2.3",
        ));
        let wine = Arc::new(WineCtx::new(engine.clone(), root.join("runtimes")));
        let info = Arc::new(InfoCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            InfoPlatform::Linux,
            InfoPaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                temp: root.join("temp"),
                public_dir: None,
            },
            "0.0.0".to_string(),
            Shutdown::new(),
            Arc::new(ReqwestHttp::new()),
        ));
        LaunchCtx::new(engine, knownfix, wine, info)
    }

    /// A future that panics when polled: the shape of an op that hits a bug.
    fn panicking() -> impl Future<Output = Result<Value, String>> {
        std::future::poll_fn(|_| -> Poll<Result<Value, String>> { panic!("test-only op panic") })
    }

    #[test]
    fn the_op_table_is_sorted_and_unique() {
        let mut sorted = OPS.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted, OPS);
    }

    #[tokio::test]
    async fn a_name_outside_the_op_table_is_an_unknown_op() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        for op in ["nope", "launch_probe", "", "knownfix_overlay_catalogue"] {
            assert_eq!(
                dispatch(op, &[json!(1)], &ctx).await.unwrap_err(),
                format!("unknown op: {op}")
            );
        }
    }

    #[test]
    fn the_context_shares_one_engine_with_the_known_fix_context() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        assert!(Arc::ptr_eq(&ctx.engine, &ctx.knownfix.engine));
        assert_eq!(ctx.knownfix.paths.overlays, home.root().join("overlays"));
    }

    #[tokio::test]
    async fn dispatch_sync_inside_a_runtime_is_wrong_thread() {
        let home = FakeHome::new("launch-lib-");
        let err = dispatch_sync("launch_probe", &[], &ctx(&home)).unwrap_err();
        assert_eq!(err, "launch_probe:wrong-thread");
    }

    #[test]
    fn dispatch_sync_on_a_plain_thread_answers_unknown_op() {
        let home = FakeHome::new("launch-lib-");
        let err = dispatch_sync("nope", &[], &ctx(&home)).unwrap_err();
        assert_eq!(err, "unknown op: nope");
    }

    #[tokio::test]
    async fn a_panicking_op_answers_panic() {
        let home = FakeHome::new("launch-lib-");
        let err = guarded("launch_probe", &ctx(&home), panicking())
            .await
            .unwrap_err();
        assert_eq!(err, "launch_probe:panic");
    }

    #[tokio::test]
    async fn a_cancelled_shutdown_answers_shutdown_and_releases_its_registrant() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        ctx.engine.shutdown.token().cancel();
        let work = async { Ok(Value::Null) };
        let err = guarded("launch_probe", &ctx, work).await.unwrap_err();
        assert_eq!(err, "launch_probe:shutdown");
        assert!(ctx
            .engine
            .shutdown
            .drain(std::time::Duration::from_millis(50))
            .is_empty());
    }

    fn wine_settings() -> Value {
        json!({"wineVersion": {"type": "wine", "bin": "/w/wine", "name": "Wine-9", "wineserver": "/w/wineserver"},
               "winePrefix": "/p"})
    }

    #[test]
    fn the_global_default_wine_keeps_a_wine_with_a_legacy_key() {
        use crate::prepare::deps::PrepareDeps;
        let home = FakeHome::new("launch-lib-");
        std::fs::write(
            home.root().join("config.json"),
            r#"{"version":"v0","defaultSettings":{"wineVersion":{"type":"wine","name":"W","bin":"/x","legacy":1}}}"#,
        )
        .unwrap();
        let ctx = ctx(&home);
        let host = WineHost::default();
        let wine = CtxPrepareDeps::new(&ctx, &host)
            .global_default_wine()
            .expect("a stored wine with a legacy key is still the global default");
        assert_eq!(wine.bin, "/x");
    }

    #[test]
    fn the_eighteen_launch_ops_are_in_the_table() {
        assert_eq!(OPS.len(), 18);
        assert!(OPS.iter().all(|op| op.starts_with("launch_")));
    }

    #[tokio::test]
    async fn the_ask_force_uninstall_op_answers_the_index_and_removes_only_on_yes() {
        use crate::hooks::testing::{HookCall, RecordingHooks};
        use crate::prepare::dialogs::testing::ScriptedDialogs;
        use crate::runner::RunnerName;
        let home = FakeHome::new("launch-lib-");
        let hooks = Arc::new(RecordingHooks::new().with_title(Ok("Alpha".to_string())));
        let dialogs = Arc::new(ScriptedDialogs::new(vec![Some(1), Some(0), None]));
        let ctx = ctx(&home)
            .with_dialogs(dialogs.clone())
            .with_hooks(hooks.clone());
        let args = [json!({"runner": "gog", "appName": "AppA"})];
        let answers = [
            dispatch("launch_ask_force_uninstall", &args, &ctx).await,
            dispatch("launch_ask_force_uninstall", &args, &ctx).await,
            dispatch("launch_ask_force_uninstall", &args, &ctx).await,
        ];
        assert_eq!(answers, [Ok(json!(1)), Ok(json!(0)), Ok(Value::Null)]);
        let removed: Vec<HookCall> = hooks
            .calls()
            .into_iter()
            .filter(|c| matches!(c, HookCall::ForceUninstall { .. }))
            .collect();
        assert_eq!(
            removed,
            [HookCall::ForceUninstall {
                runner: RunnerName::Gog,
                app_name: "AppA".to_string()
            }],
            "only the Yes answer removes the game"
        );
        assert!(dialogs.asked().iter().all(|a| a.title == "Alpha"));
        for bad in [
            json!({"runner": "nope", "appName": "AppA"}),
            json!({"runner": "gog", "appName": ""}),
            json!({"runner": "gog", "appName": "AppA", "extra": 1}),
            json!({"runner": "gog"}),
        ] {
            assert_eq!(
                dispatch("launch_ask_force_uninstall", &[bad], &ctx)
                    .await
                    .unwrap_err(),
                "launch_ask_force_uninstall:bad-args"
            );
        }
    }

    #[tokio::test]
    async fn a_headless_context_answers_the_ask_as_a_dismissal_and_removes_nothing() {
        use crate::hooks::testing::RecordingHooks;
        let home = FakeHome::new("launch-lib-");
        let hooks = Arc::new(RecordingHooks::new());
        let ctx = ctx(&home).with_hooks(hooks.clone());
        let answer = dispatch(
            "launch_ask_force_uninstall",
            &[json!({"runner": "legendary", "appName": "AppA"})],
            &ctx,
        )
        .await;
        assert_eq!(answer, Ok(Value::Null));
        assert!(hooks
            .calls()
            .iter()
            .all(|c| !matches!(c, crate::hooks::testing::HookCall::ForceUninstall { .. })));
    }

    const ZERO_ARG_OPS: &[&str] = &["launch_games_running", "launch_tracked_kill_all"];

    #[tokio::test]
    async fn every_op_answers_a_fixed_bad_args_and_never_echoes_what_it_was_sent() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        let secret = "/Users/someone/secret-profile-path";
        for op in OPS {
            for args in [
                vec![],
                vec![json!(secret)],
                vec![json!(secret), json!(secret), json!(secret), json!(secret)],
                vec![json!({"appName": secret, "bogus": secret})],
                vec![json!(1), json!(2), json!(3)],
            ] {
                // The two ops with no argument answer to `[]`; anything else is refused like the rest.
                if args.is_empty() && ZERO_ARG_OPS.contains(op) {
                    continue;
                }
                let err = dispatch(op, &args, &ctx).await.unwrap_err();
                assert_eq!(err, format!("{op}:bad-args"), "{op} {args:?}");
                assert!(!err.contains(secret));
            }
        }
    }

    #[tokio::test]
    async fn the_wrapper_env_op_decodes_strictly_and_answers_the_map() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        let got = dispatch(
            "launch_setup_wrapper_env_vars",
            &[json!({"appName": "a", "appRunner": "legendary"})],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(got["STORE"], "egs");
        for bad in [
            json!({"appName": "a", "appRunner": "nope"}),
            json!({"appName": "a", "appRunner": "gog", "extra": 1}),
            json!({"appName": 1, "appRunner": "gog"}),
        ] {
            assert_eq!(
                dispatch("launch_setup_wrapper_env_vars", &[bad], &ctx)
                    .await
                    .unwrap_err(),
                "launch_setup_wrapper_env_vars:bad-args"
            );
        }
    }

    #[tokio::test]
    async fn the_wrappers_op_answers_the_list_and_the_recorded_quote_error() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        let got = dispatch(
            "launch_setup_wrappers",
            &[
                json!({"wrapperOptions": [{"exe": "nice", "args": "-n 5"}], "other": true}),
                Value::Null,
                json!("/usr/bin/gamemoderun"),
                json!(["gs", "--"]),
            ],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(
            got,
            json!(["gs", "--", "nice", "-n", "5", "/usr/bin/gamemoderun"])
        );
        let err = dispatch(
            "launch_setup_wrappers",
            &[
                json!({"wrapperOptions": [{"exe": "env", "args": "A=\"b"}]}),
                Value::Null,
                Value::Null,
                Value::Null,
            ],
            &ctx,
        )
        .await
        .unwrap_err();
        assert_eq!(
            err,
            "launch_setup_wrappers:Got EOF while in a quoted string"
        );
    }

    #[tokio::test]
    async fn the_env_ops_take_the_host_facts_as_an_argument() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        let mut settings = wine_settings();
        settings["nvidiaPrime"] = json!(true);
        settings["enviromentOptions"] = json!([{"key": "FOO", "value": "\"bar baz\""}]);
        let env = dispatch(
            "launch_setup_env_vars",
            &[
                settings.clone(),
                json!("/games/x"),
                json!({"env": {"LD_PRELOAD": "x.so"}}),
            ],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(env["DRI_PRIME"], "1");
        assert_eq!(env["FOO"], "bar baz");
        assert_eq!(env["STEAM_COMPAT_INSTALL_PATH"], "/games/x");
        // The host's own LD_PRELOAD means no empty one is added.
        assert!(env.get("LD_PRELOAD").is_none());
        let bare = dispatch(
            "launch_setup_env_vars",
            &[settings, Value::Null, Value::Null],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(bare["LD_PRELOAD"], "");
        let wine = dispatch(
            "launch_setup_wine_env_vars",
            &[
                wine_settings(),
                Value::Null,
                json!({"env": {}, "darwinRelease": "24.1.0"}),
            ],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(wine["WINEPREFIX"], "/p");
        assert_eq!(
            dispatch(
                "launch_setup_wine_env_vars",
                &[wine_settings(), Value::Null, json!({"unknownFact": 1})],
                &ctx
            )
            .await
            .unwrap_err(),
            "launch_setup_wine_env_vars:bad-args"
        );
    }

    #[tokio::test]
    async fn the_verify_prefix_op_answers_an_empty_res_without_spawning_for_a_crossover_wine() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        let prefix = home.root().join("never-made");
        let settings = json!({
            "wineVersion": {"type": "crossover", "bin": "/cx/wine", "name": "CrossOver"},
            "winePrefix": prefix.to_string_lossy(),
        });
        let got = dispatch(
            "launch_verify_wine_prefix",
            &[settings.clone(), Value::Null],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(got, json!({"res": {"stdout": "", "stderr": ""}}));
        // Nothing ran, so nothing created the prefix either.
        assert!(!prefix.exists());
        let host = json!({"env": {}, "darwinRelease": "24.1.0"});
        assert_eq!(
            dispatch("launch_verify_wine_prefix", &[settings, host], &ctx)
                .await
                .unwrap(),
            json!({"res": {"stdout": "", "stderr": ""}})
        );
    }

    #[tokio::test]
    async fn the_verify_prefix_op_refuses_a_malformed_call_with_its_fixed_bad_args() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        let secret = "/Users/someone/secret-profile-path";
        for args in [
            vec![wine_settings()],
            vec![Value::Null, Value::Null],
            vec![wine_settings(), json!(secret)],
            vec![wine_settings(), json!({"unknownFact": secret})],
            vec![wine_settings(), Value::Null, Value::Null],
        ] {
            let err = dispatch("launch_verify_wine_prefix", &args, &ctx)
                .await
                .unwrap_err();
            assert_eq!(err, "launch_verify_wine_prefix:bad-args", "{args:?}");
            assert!(!err.contains(secret));
        }
    }

    #[tokio::test]
    async fn the_epic_op_answers_offline_with_no_request_when_the_app_is_not_online() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        // The context starts not online (the monitor's first reading), so no request is made.
        assert!(!ctx.engine.is_online());
        for args in [
            vec![Value::Null],
            vec![json!("Epic Games Store")],
            vec![json!("Fortnite")],
            vec![json!("Rocket League")],
        ] {
            assert_eq!(
                dispatch("launch_epic_service_offline", &args, &ctx)
                    .await
                    .unwrap(),
                json!(true),
                "{args:?}"
            );
        }
        for args in [
            vec![],
            vec![json!("fortnite")],
            vec![json!(1)],
            vec![Value::Null, Value::Null],
        ] {
            assert_eq!(
                dispatch("launch_epic_service_offline", &args, &ctx)
                    .await
                    .unwrap_err(),
                "launch_epic_service_offline:bad-args",
                "{args:?}"
            );
        }
    }

    fn prepare_args(extra: Value) -> Value {
        let mut args = json!({
            "settings": {"offlineMode": false},
            "runner": "gog",
            "appName": "app1",
            "title": "A Game",
            "canRunOffline": true,
            "isNative": true,
            "storeExpired": false,
            "installPath": "/games/a",
        });
        if let (Some(base), Value::Object(extra)) = (args.as_object_mut(), extra) {
            base.extend(extra);
        }
        args
    }

    #[tokio::test]
    async fn the_prepare_op_answers_the_reply_with_its_log_over_a_context_with_no_tools() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        // The context is not online, so the game goes offline; the information context's runner starts
        // nothing, so the system-information line says it could not be read; nothing is on the PATH.
        let got = dispatch(
            "launch_prepare",
            &[prepare_args(json!({})), json!({})],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(got["success"], json!(true));
        assert_eq!(got["offlineMode"], json!(true));
        assert_eq!(got["mangoHudCommand"], json!([]));
        assert_eq!(got["gameScopeCommand"], json!([]));
        assert!(got.get("gameModeBin").is_none());
        let log = got["log"].as_array().unwrap();
        assert_eq!(log[0]["level"], json!("info"));
        assert_eq!(log[0]["parts"], json!([["Launching", "\"A Game\" (gog)"]]));
        let text = got["log"].to_string();
        assert!(
            text.contains("System information could not be read."),
            "{text}"
        );
        // The path is the host's own, and the log is JSON text, where a Windows backslash is doubled.
        assert!(
            text.replace("\\\\", "/").contains("GamesConfig/app1.json"),
            "{text}"
        );

        // A missing GameMode binary is a refusal with its reason, after the log lines were written.
        let refused = dispatch(
            "launch_prepare",
            &[
                prepare_args(json!({"settings": {"useGameMode": true}})),
                json!({"wine": {"env": {"PATH": "/nonexistent"}}}),
            ],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(refused["success"], json!(false));
        assert_eq!(
            refused["failureReason"],
            json!("GameMode is enabled, but `gamemoderun` executable could not be found on $PATH")
        );
        assert!(refused.get("offlineMode").is_none());
        assert!(!refused["log"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn the_prepare_op_decodes_strictly_and_never_echoes_what_it_was_sent() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        let secret = "/Users/someone/secret-profile-path";
        for args in [
            vec![prepare_args(json!({})), json!(secret)],
            vec![prepare_args(json!({})), Value::Null],
            vec![prepare_args(json!({})), json!({"unknownFact": secret})],
            vec![prepare_args(json!({"runner": "epic"})), json!({})],
            vec![prepare_args(json!({"extra": secret})), json!({})],
            vec![prepare_args(json!({"settings": secret})), json!({})],
            vec![prepare_args(json!({})), json!({}), json!({})],
            vec![prepare_args(json!({}))],
        ] {
            let err = dispatch("launch_prepare", &args, &ctx).await.unwrap_err();
            assert_eq!(err, "launch_prepare:bad-args", "{args:?}");
            assert!(!err.contains(secret));
        }
    }

    fn wine_begin_args(extra: Value) -> Value {
        let mut args = json!({
            "runner": "gog",
            "appName": "app1",
            "title": "A Game",
            "canRunOffline": true,
            "storedSettings": {"winePrefix": "/nonexistent/prefix"},
        });
        if let (Some(base), Value::Object(extra)) = (args.as_object_mut(), extra) {
            base.extend(extra);
        }
        args
    }

    #[tokio::test]
    async fn the_wine_begin_op_stops_when_neither_wine_is_valid_and_never_echoes_what_it_was_sent()
    {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        let settings = json!({
            "winePrefix": "/nonexistent/prefix",
            "wineVersion": {"bin": "/nonexistent/wine", "name": "W", "type": "proton"},
        });
        // No wine exists and the profile holds no default: the step stops with `{ success: false }` and
        // nothing is created.
        let got = dispatch(
            "launch_prepare_wine_begin",
            &[
                wine_begin_args(json!({"storedSettings": settings})),
                json!({}),
            ],
            &ctx,
        )
        .await
        .unwrap();
        assert_eq!(got["success"], json!(false));
        assert_eq!(got["prefixUpdated"], json!(false));
        assert_eq!(got["log"], json!([]));
        assert!(got.get("settings").is_none());
        assert!(!std::path::Path::new("/nonexistent/prefix").exists());

        let secret = "/Users/someone/secret-profile-path";
        for args in [
            vec![],
            vec![wine_begin_args(json!({}))],
            vec![wine_begin_args(json!({})), json!(secret)],
            vec![wine_begin_args(json!({})), json!({"unknownFact": secret})],
            vec![wine_begin_args(json!({})), json!({}), json!({})],
            vec![wine_begin_args(json!({"runner": "epic"})), json!({})],
            vec![wine_begin_args(json!({"extra": secret})), json!({})],
            vec![
                wine_begin_args(json!({"storedSettings": secret})),
                json!({}),
            ],
            // Settings that are an object but not game settings (no wine).
            vec![wine_begin_args(json!({"storedSettings": {}})), json!({})],
        ] {
            let err = dispatch("launch_prepare_wine_begin", &args, &ctx)
                .await
                .unwrap_err();
            assert_eq!(err, "launch_prepare_wine_begin:bad-args", "{args:?}");
            assert!(!err.contains(secret));
        }
    }

    fn wine_finish_args(extra: Value) -> Value {
        let mut args = json!({
            "runner": "gog",
            "appName": "app1",
            "title": "A Game",
            "settings": {"winePrefix": "/nonexistent/prefix"},
            "storedSettings": {"winePrefix": "/nonexistent/prefix"},
            "prefixUpdated": false,
            "mergesTier1Env": true,
            "isGog": false,
        });
        if let (Some(base), Value::Object(extra)) = (args.as_object_mut(), extra) {
            base.extend(extra);
        }
        args
    }

    #[tokio::test]
    async fn the_wine_finish_op_decodes_strictly_and_never_echoes_what_it_was_sent() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        let secret = "/Users/someone/secret-profile-path";
        for args in [
            vec![],
            vec![wine_finish_args(json!({}))],
            vec![wine_finish_args(json!({})), json!(secret)],
            vec![wine_finish_args(json!({})), json!({"unknownFact": secret})],
            vec![wine_finish_args(json!({})), json!({}), json!({})],
            vec![wine_finish_args(json!({"runner": "epic"})), json!({})],
            vec![wine_finish_args(json!({"extra": secret})), json!({})],
            vec![
                wine_finish_args(json!({"prefixUpdated": secret})),
                json!({}),
            ],
            // Settings that are not an object, and an object that is not game settings (no wine).
            vec![wine_finish_args(json!({"settings": secret})), json!({})],
            vec![wine_finish_args(json!({"settings": {}})), json!({})],
            vec![
                wine_finish_args(json!({"storedSettings": secret})),
                json!({}),
            ],
        ] {
            let err = dispatch("launch_prepare_wine_finish", &args, &ctx)
                .await
                .unwrap_err();
            assert_eq!(err, "launch_prepare_wine_finish:bad-args", "{args:?}");
            assert!(!err.contains(secret));
        }
    }

    fn check_wine_args(extra: Value) -> Value {
        let mut args = json!({
            "appName": "app1",
            "runner": "gog",
            "wineVersion": {"type": "wine", "bin": "/nonexistent/wine", "name": "Wine-9"},
        });
        if let (Some(base), Value::Object(extra)) = (args.as_object_mut(), extra) {
            base.extend(extra);
        }
        args
    }

    #[tokio::test]
    async fn the_check_wine_op_decodes_strictly_and_never_echoes_what_it_was_sent() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        let secret = "/Users/someone/secret-profile-path";
        for args in [
            vec![],
            vec![check_wine_args(json!({}))],
            vec![check_wine_args(json!({})), json!(secret)],
            vec![check_wine_args(json!({})), json!({"unknownFact": secret})],
            vec![check_wine_args(json!({})), json!({}), json!({})],
            vec![check_wine_args(json!({"runner": "epic"})), json!({})],
            vec![check_wine_args(json!({"extra": secret})), json!({})],
            vec![check_wine_args(json!({"verboseLogs": secret})), json!({})],
            // A game wine that is not an object.
            vec![check_wine_args(json!({"wineVersion": secret})), json!({})],
        ] {
            let err = dispatch("launch_check_wine_before_launch", &args, &ctx)
                .await
                .unwrap_err();
            assert_eq!(err, "launch_check_wine_before_launch:bad-args", "{args:?}");
            assert!(!err.contains(secret));
        }
    }

    #[tokio::test]
    async fn the_known_fix_env_op_answers_an_empty_map_when_no_fix_exists() {
        let home = FakeHome::new("launch-lib-");
        let ctx = ctx(&home);
        let got = dispatch("launch_known_fix_env", &[json!("app1"), json!("gog")], &ctx)
            .await
            .unwrap();
        assert_eq!(got, json!({}));
        for args in [
            vec![json!(""), json!("gog")],
            vec![json!("app1"), json!("epic")],
            vec![json!("x".repeat(257)), json!("gog")],
        ] {
            assert_eq!(
                dispatch("launch_known_fix_env", &args, &ctx)
                    .await
                    .unwrap_err(),
                "launch_known_fix_env:bad-args"
            );
        }
    }
}
