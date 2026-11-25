//! The launch services (Phase 88, SVC-03): the launch builders, the runner spawn, the funnel and
//! re-adoption, ported from the TypeScript sidecar by 88.1 to 88.3. This crate owns the dispatch
//! contract and the op list; [`builders`] holds the pure launch builders (88.1-06), which 91 and 92
//! also call in process.
//!
//! Tauri-free, no environment reads, no `keyring`, and a child process only ever through
//! `gamelib-proc` (`SpawnClass::Game` for what must outlive GameLib). Every log line goes through
//! `EngineCtx.log` as fixed text. Every op goes through [`dispatch`], which answers `unknown op: <op>`
//! for a name not in [`OPS`].
//!
//! This crate may depend on `gamelib-engine`, `gamelib-wine` and `gamelib-knownfix`; none of them ever
//! depends on it (87 D-04, the one-way rule).

pub mod builders;
pub mod ctx;

/// The cancel token a long op takes, re-exported so the shell, which owns the renderer's cancel, needs
/// no `tokio-util` of its own.
pub use tokio_util::sync::CancellationToken;

use builders::{env, known_fix_env, wrappers};
use ctx::LaunchCtx;
use gamelib_knownfix::types::Runner;
use gamelib_wine::wine_cmd::env::GameSettingsView;
use gamelib_wine::wine_cmd::WineHost;
use serde::Deserialize;
use serde_json::Value;
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};
use tokio::runtime::{Builder, Handle, Runtime};

/// Ops reachable from the shell and the CLI. Keep sorted; each plan adds its own.
pub const OPS: &[&str] = &[
    "launch_known_fix_env",
    "launch_setup_env_vars",
    "launch_setup_wine_env_vars",
    "launch_setup_wrapper_env_vars",
    "launch_setup_wrappers",
    "launch_verify_wine_prefix",
];

/// Runs `op` over `args`. `Err` is only an unknown op, bad arguments, a shutdown, a wrong thread or a
/// panic (`<op>:panic`).
pub async fn dispatch(op: &str, args: &[Value], ctx: &LaunchCtx) -> Result<Value, String> {
    let Some(name) = OPS.iter().copied().find(|o| *o == op) else {
        return Err(format!("unknown op: {op}"));
    };
    guarded(name, ctx, route(name, args, ctx)).await
}

/// Each plan adds its arms here, in step with `OPS`. Every arm is a thin wrapper over a function of
/// [`builders`]; a bad argument is the fixed `<op>:bad-args` and never echoes what was sent.
async fn route(op: &str, args: &[Value], ctx: &LaunchCtx) -> Result<Value, String> {
    let bad = || format!("{op}:bad-args");
    let result_of =
        |value: Result<Value, serde_json::Error>| value.map_err(|_| format!("{op}:bad-result"));
    match op {
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
            let (settings, install_path, host) = settings_arg(op, args)?;
            result_of(serde_json::to_value(env::setup_env_vars(
                ctx,
                &settings,
                install_path.as_deref(),
                &host,
            )))
        }
        // `setupWineEnvVars`. Arguments `[settings, gameId | null, host]`.
        "launch_setup_wine_env_vars" => {
            let (settings, game_id, host) = settings_arg(op, args)?;
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

/// An app name, app id or label: 1 to 256 UTF-16 units (the bound the known-fix ops hold names to).
fn bounded_name(name: &str) -> bool {
    !name.is_empty() && name.encode_utf16().count() <= 256
}

/// The object argument of `launch_setup_wrapper_env_vars`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WrapperEnvArgs {
    app_name: String,
    app_runner: String,
}

/// The one field of `GameSettings` `launch_setup_wrappers` reads. The rest of the settings object is
/// ignored (the same leniency as [`GameSettingsView`]): the caller passes the whole object.
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

/// The `[settings, text | null, host]` shape of the two env ops. `host` is the process facts the shell
/// read (`env`, `darwinRelease`); `null` is none.
fn settings_arg(
    op: &str,
    args: &[Value],
) -> Result<(GameSettingsView, Option<String>, WineHost), String> {
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
        LaunchCtx::new(engine, knownfix, wine)
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
    fn the_six_launch_ops_are_in_the_table() {
        assert_eq!(OPS.len(), 6);
        assert!(OPS.iter().all(|op| op.starts_with("launch_")));
    }

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
