//! The wine, bottle and runtime services (Phase 87, SVC-02): the wine-manager, bottles, winetricks
//! and the Wine runtime, ported from the TypeScript sidecar. Each plan adds its modules and ops here.
//!
//! Tauri-free, no environment reads, no `keyring`, and a child process only ever through
//! `gamelib-proc`. Everything an op needs arrives in [`ctx::WineCtx`]. Every op goes through
//! [`dispatch`], which answers `unknown op: <op>` for a name not in [`OPS`].
//!
//! This crate may depend on `gamelib-engine`; `gamelib-engine` never depends on this one (D-04).

pub mod ctx;
pub mod discovery;
pub mod extract;
pub mod manager;
pub mod runtimes;
pub mod tools;
pub mod wine_cmd;

/// The cancel token an install takes (`manager::install::install`), re-exported so the shell, which
/// owns the renderer's cancel, needs no `tokio-util` of its own.
pub use tokio_util::sync::CancellationToken;

/// The engine's DXVK seam implemented over this crate's tools (87-29, D-25 (a)); the shell resolves it
/// at call time so `gamelib-engine` never names this crate.
pub use tools::installer::WineDxvkInstaller;

use ctx::WineCtx;
use serde_json::Value;
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};
use tokio::runtime::{Builder, Handle, Runtime};

/// Ops reachable from the shell and the CLI. Keep sorted; each plan adds its own.
pub const OPS: &[&str] = &[
    "wine_default_wine",
    "wine_discover_alternatives",
    "wine_discover_crossover",
    "wine_dxmt_releases_info",
    "wine_dxvk_install_remove",
    "wine_manager_install",
    "wine_manager_list",
    "wine_manager_refresh",
    "wine_manager_remove",
    "wine_releases_info_ready",
    "wine_run_command",
    "wine_runtime_download",
    "wine_runtime_is_installed",
    "wine_valid",
];

/// Runs `op` over `args`. `Err` is only an unknown op, bad arguments, a missing collaborator, a
/// shutdown, a wrong thread or a panic (`<op>:panic`).
pub async fn dispatch(op: &str, args: &[Value], ctx: &WineCtx) -> Result<Value, String> {
    let Some(name) = OPS.iter().copied().find(|o| *o == op) else {
        return Err(format!("unknown op: {op}"));
    };
    guarded(name, ctx, route(name, args, ctx)).await
}

/// Each plan adds its arms here, in step with `OPS`.
async fn route(op: &str, args: &[Value], ctx: &WineCtx) -> Result<Value, String> {
    match op {
        "wine_default_wine" => {
            let path = default_wine_path_arg(op, args)?;
            let wine = discovery::default_wine::default_wine_from_path(
                path,
                &discovery::default_wine::is_executable_file,
                &|p| p.exists(),
            );
            serde_json::to_value(wine).map_err(|_| format!("{op}:bad-result"))
        }
        "wine_discover_alternatives" => {
            let host = discovery_host_arg(op, args)?;
            let found = discovery::discover_alternatives(ctx, &host).await;
            serde_json::to_value(found).map_err(|_| format!("{op}:bad-result"))
        }
        "wine_discover_crossover" => {
            if !args.is_empty() {
                return Err(format!("{op}:bad-args"));
            }
            let found = discovery::discover_crossover(ctx).await;
            serde_json::to_value(found).map_err(|_| format!("{op}:bad-result"))
        }
        "wine_dxvk_install_remove" => {
            let (request, host) = dxvk_args(op, args)?;
            let runner = tools::HostWineRunner { host: &host.wine };
            match tools::dxvk::install_remove(ctx, &host, &runner, request).await {
                Ok(done) => Ok(Value::Bool(done)),
                // A category word: the TS rejected with Node's error text, which names paths.
                Err(error) => Err(format!("{op}:{error}")),
            }
        }
        "wine_manager_install" => {
            let (release, settings) = install_args(op, args)?;
            // Nothing cancels this token: through the op an install ends on its own or on the app
            // shutdown. A caller that owns a cancel calls `manager::install::install` with it.
            let cancel = tokio_util::sync::CancellationToken::new();
            match manager::install::install(ctx, release, &settings, &cancel).await {
                Ok(outcome) => Ok(Value::String(outcome.as_str().to_string())),
                Err(_) => Err(format!("{op}:bad-args")),
            }
        }
        "wine_manager_remove" => {
            let version = remove_version_arg(op, args)?;
            Ok(Value::Bool(manager::remove::remove(ctx, version).await))
        }
        "wine_manager_list" => {
            if !args.is_empty() {
                return Err(format!("{op}:bad-args"));
            }
            manager::releases::list(ctx).map_err(|kind| format!("{op}:store {kind:?}"))
        }
        "wine_manager_refresh" => {
            let fetch = refresh_fetch_arg(op, args)?;
            // The TS handler swallowed every error and answered undefined: a failed refresh is
            // logged and the renderer keeps what it had.
            if let Err(error) = manager::releases::update_wine_version_infos(
                ctx,
                fetch,
                None,
                manager::releases::DEFAULT_COUNT,
            )
            .await
            {
                manager::log_error(ctx, &format!("wine versions refresh failed: {error}"));
            }
            Ok(Value::Null)
        }
        // The `releasesInfoReady` listener of DXMT (87-31): updates the DXMT inside existing `-DXMT` copies
        // when the feed names a newer one. The TS listener's rejection was handled by nothing, so an error
        // is logged by DXMT's own category word and the op still answers `null`. The shell calls this for
        // every `releasesInfoReady` after the first of a run; the first is the boot task
        // (`tools::dxmt::spawn_dxmt_boot_update`), bounded.
        "wine_dxmt_releases_info" => {
            let info: tools::dxmt::DxmtReleasesInfo = decode_lenient(op, args)?;
            if let Err(error) = tools::dxmt::on_releases_info(ctx, &info).await {
                if let Some(log) = &ctx.engine.log {
                    log.warn(&format!("DXMT releases update: {error}"));
                }
            }
            Ok(Value::Null)
        }
        "wine_releases_info_ready" => {
            let info: manager::releases::ReleasesInfo = decode_lenient(op, args)?;
            manager::releases::update_lists_if_outdated(ctx, &info).await;
            Ok(Value::Null)
        }
        "wine_run_command" => {
            let (command, host) = wine_run_command_args(op, args)?;
            Ok(wine_cmd::command::run_wine_command(ctx, command, &host)
                .await
                .to_json())
        }
        "wine_valid" => {
            let (wine, host) = wine_valid_args(op, args)?;
            Ok(Value::Bool(wine_cmd::valid::valid_wine(
                wine.as_ref(),
                ctx.engine.platform,
                host.darwin_release.as_deref(),
                &|path| path.exists(),
            )))
        }
        "wine_runtime_download" => {
            let name = runtime_name_arg(op, args)?;
            Ok(Value::Bool(runtimes::download(ctx, name).await))
        }
        "wine_runtime_is_installed" => {
            let name = runtime_name_arg(op, args)?;
            Ok(Value::Bool(runtimes::is_installed(ctx, name).await))
        }
        _ => Err(format!("unknown op: {op}")),
    }
}

/// `wine_default_wine`'s argument: the process `PATH` the shell read, as a string, or nothing / `null`
/// when it is unset. Anything else is a fixed `<op>:bad-args`.
fn default_wine_path_arg<'a>(op: &str, args: &'a [Value]) -> Result<Option<&'a str>, String> {
    match args {
        [] | [Value::Null] => Ok(None),
        [Value::String(path)] => Ok(Some(path)),
        _ => Err(format!("{op}:bad-args")),
    }
}

/// `wine_discover_alternatives`'s one argument: the [`discovery::DiscoveryHost`] the shell built (its
/// roots, `PATH`, the two settings, the Steam libraries it read). A bad shape is a fixed
/// `<op>:bad-args`: a path or a value the renderer sent never reaches the error.
fn discovery_host_arg(op: &str, args: &[Value]) -> Result<discovery::DiscoveryHost, String> {
    let [host @ Value::Object(_)] = args else {
        return Err(format!("{op}:bad-args"));
    };
    serde_json::from_value(host.clone()).map_err(|_| format!("{op}:bad-args"))
}

/// `wine_dxvk_install_remove`'s arguments: the request (`{settings, tool, action, source?}`, the TS
/// `installRemove` arguments) and, optionally, the [`tools::ToolsHost`] facts the shell read (the public
/// directory holding the Vulkan helper, whether the app is online, the wine host facts). A bad shape
/// is a fixed `<op>:bad-args`.
fn dxvk_args(
    op: &str,
    args: &[Value],
) -> Result<(gamelib_engine::dxvk::DxvkRequest, tools::ToolsHost), String> {
    let bad = || format!("{op}:bad-args");
    let (request, host) = match args {
        [request] => (request, None),
        [request, host] => (request, Some(host)),
        _ => return Err(bad()),
    };
    let request = tools::decode_request(request).ok_or_else(bad)?;
    let host = match host {
        None | Some(Value::Null) => tools::ToolsHost::default(),
        Some(host) => serde_json::from_value(host.clone()).map_err(|_| bad())?,
    };
    Ok((request, host))
}

/// `wine_valid`'s arguments: the `WineInstallation` to check (or `null`, no wine selected) and,
/// optionally, the [`wine_cmd::WineHost`] facts the shell read (the Darwin release). A bad shape is
/// a fixed `<op>:bad-args`.
fn wine_valid_args(
    op: &str,
    args: &[Value],
) -> Result<(Option<wine_cmd::WineInstallation>, wine_cmd::WineHost), String> {
    let bad = || format!("{op}:bad-args");
    let (wine, host) = match args {
        [wine] => (wine, None),
        [wine, host] => (wine, Some(host)),
        _ => return Err(bad()),
    };
    let wine = match wine {
        Value::Null => None,
        other => Some(serde_json::from_value(other.clone()).map_err(|_| bad())?),
    };
    let host = match host {
        None | Some(Value::Null) => wine_cmd::WineHost::default(),
        Some(host) => serde_json::from_value(host.clone()).map_err(|_| bad())?,
    };
    Ok((wine, host))
}

/// `wine_run_command`'s arguments: the [`wine_cmd::command::WineCommandArgs`] object and,
/// optionally, the [`wine_cmd::WineHost`] facts the shell read (the process environment, the default
/// settings). A bad shape is a fixed `<op>:bad-args`.
fn wine_run_command_args(
    op: &str,
    args: &[Value],
) -> Result<(wine_cmd::command::WineCommandArgs, wine_cmd::WineHost), String> {
    let bad = || format!("{op}:bad-args");
    let (command, host) = match args {
        [command @ Value::Object(_)] => (command, None),
        [command @ Value::Object(_), host] => (command, Some(host)),
        _ => return Err(bad()),
    };
    let command = serde_json::from_value(command.clone()).map_err(|_| bad())?;
    let host = match host {
        None | Some(Value::Null) => wine_cmd::WineHost::default(),
        Some(host) => serde_json::from_value(host.clone()).map_err(|_| bad())?,
    };
    Ok((command, host))
}

/// The one string argument of a runtime op: exactly one string that is a [`runtimes::valid_name`].
/// The error is a fixed `<op>:bad-args`; the string never reaches it.
fn runtime_name_arg<'a>(op: &str, args: &'a [Value]) -> Result<&'a str, String> {
    match args {
        [Value::String(name)] if runtimes::valid_name(name) => Ok(name),
        _ => Err(format!("{op}:bad-args")),
    }
}

/// The `fetch` flag of `wine_manager_refresh`: nothing, `null`, a bare boolean (the renderer's
/// `refreshWineVersionInfo(fetch?)`) or `{ fetch: boolean }`. `fetch` absent is `false`.
fn refresh_fetch_arg(op: &str, args: &[Value]) -> Result<bool, String> {
    match args {
        [] | [Value::Null] => Ok(false),
        [Value::Bool(fetch)] => Ok(*fetch),
        [Value::Object(map)] => {
            let known = map.keys().all(|k| k == "fetch");
            match map.get("fetch") {
                None if known => Ok(false),
                Some(Value::Bool(fetch)) if known => Ok(*fetch),
                Some(Value::Null) if known => Ok(false),
                _ => Err(format!("{op}:bad-args")),
            }
        }
        _ => Err(format!("{op}:bad-args")),
    }
}

/// The Settings an install reads, as a second argument: both keys optional, no others.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InstallSettingsArg {
    #[serde(default)]
    download_proton_to_steam: Option<bool>,
    #[serde(default)]
    default_steam_path: Option<String>,
}

/// `wine_manager_install`'s arguments: the `WineVersionInfo` object the renderer sent, and optionally
/// the settings object (`downloadProtonToSteam`, `defaultSteamPath`) the shell resolved.
fn install_args<'a>(
    op: &str,
    args: &'a [Value],
) -> Result<(&'a Value, manager::install::InstallSettings), String> {
    let bad = || format!("{op}:bad-args");
    match args {
        [release @ Value::Object(_)] => Ok((release, manager::install::InstallSettings::default())),
        [release @ Value::Object(_), settings @ Value::Object(_)] => {
            let parsed: InstallSettingsArg =
                serde_json::from_value(settings.clone()).map_err(|_| bad())?;
            Ok((
                release,
                manager::install::InstallSettings {
                    download_proton_to_steam: parsed.download_proton_to_steam.unwrap_or(false),
                    default_steam_path: parsed.default_steam_path.unwrap_or_default(),
                },
            ))
        }
        _ => Err(bad()),
    }
}

/// `wine_manager_remove`'s one argument: the version to remove, bare or as the `version` of the
/// `WineVersionInfo` object the renderer sent. Nothing else of that object is read: the directory
/// removed is the stored one.
fn remove_version_arg<'a>(op: &str, args: &'a [Value]) -> Result<&'a str, String> {
    match args {
        [Value::String(version)] => Ok(version),
        [Value::Object(release)] => release
            .get("version")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("{op}:bad-args")),
        _ => Err(format!("{op}:bad-args")),
    }
}

/// The one object argument of an op, decoded leniently: keys the type does not name are ignored (the
/// argument is a larger shared type, `ReleasesInfo`, of which the op reads a part). The error is a
/// fixed `<op>:bad-args`.
fn decode_lenient<T: serde::de::DeserializeOwned>(op: &str, args: &[Value]) -> Result<T, String> {
    let [arg @ Value::Object(_)] = args else {
        return Err(format!("{op}:bad-args"));
    };
    serde_json::from_value(arg.clone()).map_err(|_| format!("{op}:bad-args"))
}

/// The one object argument of an op, decoded strictly (the arg structs deny unknown fields). The
/// error is a fixed `<op>:bad-args`: a renderer or sidecar string never reaches it.
#[allow(dead_code)] // the first op with an object argument lands in a later plan
fn decode<T: serde::de::DeserializeOwned>(op: &str, args: &[Value]) -> Result<T, String> {
    let [arg] = args else {
        return Err(format!("{op}:bad-args"));
    };
    serde_json::from_value(arg.clone()).map_err(|_| format!("{op}:bad-args"))
}

/// The op wrapper: `work` runs holding a `Shutdown` registrant for exactly its lifetime and is
/// raced against the shutdown token, answering `<op>:shutdown` when cancelled and `<op>:panic` when
/// it panics. Once shutdown has begun, `work` is not started at all.
pub async fn guarded<F>(op: &str, ctx: &WineCtx, work: F) -> Result<Value, String>
where
    F: Future<Output = Result<Value, String>>,
{
    let _registrant = ctx.engine.shutdown.register("wine");
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
/// `gamelib-steamcm`'s: the shell's `rustInvoke` workers may call in concurrently.
fn runtime() -> Result<&'static Runtime, String> {
    static RUNTIME: OnceLock<Result<Runtime, String>> = OnceLock::new();
    RUNTIME
        .get_or_init(|| {
            Builder::new_multi_thread()
                .worker_threads(2)
                .thread_name("wine")
                .enable_all()
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// [`dispatch`] for a plain thread: blocks on the crate's own runtime. Called from inside a tokio
/// runtime it answers `<op>:wrong-thread` instead of panicking in `block_on`.
pub fn dispatch_sync(op: &str, args: &[Value], ctx: &WineCtx) -> Result<Value, String> {
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
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use serde_json::json;
    use std::sync::Arc;

    fn ctx(home: &FakeHome) -> WineCtx {
        let root = home.root().to_path_buf();
        let engine = EngineCtx::new(
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
        );
        WineCtx::new(Arc::new(engine), root.join("tools").join("runtime"))
    }

    /// A future that panics when polled: the shape of an op that hits a bug.
    fn panicking() -> impl Future<Output = Result<Value, String>> {
        std::future::poll_fn(|_| -> Poll<Result<Value, String>> { panic!("test-only op panic") })
    }

    #[test]
    fn ops_are_sorted_and_unique() {
        let mut sorted = OPS.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted, OPS);
    }

    #[tokio::test]
    async fn an_unknown_op_is_named_in_the_error() {
        let home = FakeHome::new("wine-lib-");
        let err = dispatch("nope", &[], &ctx(&home)).await.unwrap_err();
        assert_eq!(err, "unknown op: nope");
    }

    #[tokio::test]
    async fn the_dxvk_op_checks_its_arguments_and_answers_a_category_on_failure() {
        let home = FakeHome::new("wine-lib-");
        let ctx = ctx(&home);
        let op = "wine_dxvk_install_remove";
        let request = |tool: &str| {
            json!({
                "settings": {"winePrefix": home.root().join("nope").to_string_lossy()},
                "tool": tool,
                "action": "backup"
            })
        };
        // No arguments, an unknown tool and an unknown host key are fixed `bad-args`.
        for args in [
            vec![],
            vec![request("dxmt")],
            vec![request("dxvk"), json!({"nope": 1})],
            vec![request("dxvk"), json!({}), json!({})],
        ] {
            assert_eq!(
                dispatch(op, &args, &ctx).await.unwrap_err(),
                format!("{op}:bad-args")
            );
        }
        // A prefix that is not one is the TS answer: warned about, and true so a toggle is not stuck.
        assert_eq!(
            dispatch(op, &[request("dxvk")], &ctx).await,
            Ok(Value::Bool(true))
        );
        // Settings without a prefix are a category word, never the settings.
        let no_prefix = json!({"settings": {}, "tool": "dxvk", "action": "backup"});
        assert_eq!(
            dispatch(op, &[no_prefix], &ctx).await.unwrap_err(),
            format!("{op}:bad-settings")
        );
    }

    #[test]
    fn decode_takes_exactly_one_strict_argument() {
        #[derive(serde::Deserialize, Debug)]
        #[serde(deny_unknown_fields)]
        struct Args {
            #[allow(dead_code)]
            id: String,
        }
        assert!(decode::<Args>("wine_x", &[json!({"id": "a"})]).is_ok());
        assert_eq!(
            decode::<Args>("wine_x", &[json!(1), json!(2)]).unwrap_err(),
            "wine_x:bad-args"
        );
        assert_eq!(
            decode::<Args>("wine_x", &[json!({"id": "a", "extra": 1})]).unwrap_err(),
            "wine_x:bad-args"
        );
    }

    #[test]
    fn the_runtime_ops_are_in_the_sorted_op_table() {
        assert!(OPS.contains(&"wine_runtime_is_installed"));
        assert!(OPS.contains(&"wine_runtime_download"));
    }

    #[tokio::test]
    async fn a_runtime_op_takes_exactly_one_plain_string() {
        let home = FakeHome::new("wine-lib-");
        let ctx = ctx(&home);
        for bad in [
            vec![],
            vec![json!(1)],
            vec![json!(null)],
            vec![json!({ "name": "umu" })],
            vec![json!("umu"), json!("umu")],
            vec![json!("")],
            vec![json!("../umu")],
            vec![json!("a/b")],
        ] {
            for op in ["wine_runtime_is_installed", "wine_runtime_download"] {
                let err = dispatch(op, &bad, &ctx).await.unwrap_err();
                assert_eq!(err, format!("{op}:bad-args"), "{bad:?}");
            }
        }
        // Nothing was created for a refused call.
        assert!(!home.root().join("tools").exists());
    }

    #[test]
    fn the_manager_ops_are_in_the_sorted_op_table() {
        for op in [
            "wine_manager_list",
            "wine_manager_refresh",
            "wine_releases_info_ready",
        ] {
            assert!(OPS.contains(&op), "{op}");
        }
    }

    #[test]
    fn refresh_takes_a_flag_in_any_of_its_three_shapes_and_nothing_else() {
        let ok = |args: &[Value]| refresh_fetch_arg("wine_manager_refresh", args);
        assert_eq!(ok(&[]), Ok(false));
        assert_eq!(ok(&[Value::Null]), Ok(false));
        assert_eq!(ok(&[json!(true)]), Ok(true));
        assert_eq!(ok(&[json!({ "fetch": true })]), Ok(true));
        assert_eq!(ok(&[json!({})]), Ok(false));
        for bad in [
            vec![json!(1)],
            vec![json!("true")],
            vec![json!({ "fetch": "yes" })],
            vec![json!({ "fetch": true, "extra": 1 })],
            vec![json!(true), json!(true)],
        ] {
            assert_eq!(
                refresh_fetch_arg("wine_manager_refresh", &bad),
                Err("wine_manager_refresh:bad-args".to_string()),
                "{bad:?}"
            );
        }
    }

    #[tokio::test]
    async fn a_fresh_profile_lists_nothing_and_a_listing_takes_no_argument() {
        let home = FakeHome::new("wine-lib-");
        let ctx = ctx(&home);
        assert_eq!(
            dispatch("wine_manager_list", &[], &ctx).await,
            Ok(json!([]))
        );
        assert_eq!(
            dispatch("wine_manager_list", &[json!(1)], &ctx).await,
            Err("wine_manager_list:bad-args".to_string())
        );
    }

    #[tokio::test]
    async fn a_refresh_that_cannot_open_its_store_is_swallowed_like_the_ts_handler() {
        let home = FakeHome::new("wine-lib-");
        let ctx = ctx(&home);
        // A file that is not a JSON object is never overwritten, so the store cannot be opened.
        let dir = home.root().join("store");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("wine-downloader-info.json"), "not json").unwrap();
        assert_eq!(
            dispatch("wine_manager_refresh", &[json!(false)], &ctx).await,
            Ok(Value::Null)
        );
        assert_eq!(
            std::fs::read_to_string(dir.join("wine-downloader-info.json")).unwrap(),
            "not json"
        );
    }

    #[tokio::test]
    async fn the_releases_check_takes_one_object_and_ignores_the_keys_it_does_not_read() {
        let home = FakeHome::new("wine-lib-");
        let ctx = ctx(&home);
        let info = json!({
            "ge-proton": { "tag": "GE-Proton9-1", "published_at": "2024-06-01T00:00:00Z" },
            "dxvk": { "tag": "v2", "published_at": "2024-06-01T00:00:00Z" },
            "anticheatFiles": { "shaMac": "a", "shaLinux": "b" },
        });
        // Nothing is stored, so nothing is outdated and no request is made.
        assert_eq!(
            dispatch("wine_releases_info_ready", &[info], &ctx).await,
            Ok(Value::Null)
        );
        for bad in [vec![], vec![json!("x")], vec![json!({}), json!({})]] {
            assert_eq!(
                dispatch("wine_releases_info_ready", &bad, &ctx).await,
                Err("wine_releases_info_ready:bad-args".to_string()),
                "{bad:?}"
            );
        }
    }

    #[tokio::test]
    async fn the_dxmt_releases_op_takes_one_object_and_swallows_the_listeners_rejection() {
        let home = FakeHome::new("wine-lib-");
        let ctx = ctx(&home);
        // Not a Mac: DXMT has nothing to do, and the op says so with `null`, whatever the feed carried.
        for info in [json!({}), json!({ "dxmt": { "tag": "v0.80" } })] {
            assert_eq!(
                dispatch("wine_dxmt_releases_info", &[info], &ctx).await,
                Ok(Value::Null)
            );
        }
        for bad in [vec![], vec![json!("x")], vec![json!({}), json!({})]] {
            assert_eq!(
                dispatch("wine_dxmt_releases_info", &bad, &ctx).await,
                Err("wine_dxmt_releases_info:bad-args".to_string()),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn install_takes_the_release_and_optionally_the_settings_and_nothing_else() {
        let release = json!({ "version": "GE-Proton9-27" });
        let args = [release.clone()];
        let (got, settings) = install_args("wine_manager_install", &args).unwrap();
        assert_eq!(got, &release);
        assert_eq!(settings, manager::install::InstallSettings::default());
        let with = json!({ "downloadProtonToSteam": true, "defaultSteamPath": "/s" });
        let (_, settings) = install_args("wine_manager_install", &[release.clone(), with]).unwrap();
        assert!(settings.download_proton_to_steam && settings.default_steam_path == "/s");
        for bad in [
            vec![],
            vec![json!("GE-Proton9-27")],
            vec![release.clone(), json!("x")],
            vec![release.clone(), json!({ "extra": 1 })],
            vec![release.clone(), json!({}), json!({})],
        ] {
            assert_eq!(
                install_args("wine_manager_install", &bad).map(|_| ()),
                Err("wine_manager_install:bad-args".to_string()),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn remove_reads_only_the_version_of_what_it_is_given() {
        let op = "wine_manager_remove";
        assert_eq!(remove_version_arg(op, &[json!("v")]), Ok("v"));
        assert_eq!(
            remove_version_arg(op, &[json!({ "version": "v", "installDir": "/etc" })]),
            Ok("v")
        );
        for bad in [
            vec![],
            vec![json!({})],
            vec![json!(1)],
            vec![json!("a"), json!("b")],
        ] {
            assert_eq!(
                remove_version_arg(op, &bad),
                Err("wine_manager_remove:bad-args".to_string()),
                "{bad:?}"
            );
        }
    }

    #[tokio::test]
    async fn a_removal_of_an_unknown_version_answers_false_through_the_op() {
        let home = FakeHome::new("wine-lib-");
        assert_eq!(
            dispatch("wine_manager_remove", &[json!("nope")], &ctx(&home)).await,
            Ok(Value::Bool(false))
        );
    }

    #[tokio::test]
    async fn dispatch_sync_inside_a_runtime_is_wrong_thread() {
        let home = FakeHome::new("wine-lib-");
        let err = dispatch_sync("wine_probe", &[], &ctx(&home)).unwrap_err();
        assert_eq!(err, "wine_probe:wrong-thread");
    }

    #[test]
    fn dispatch_sync_on_a_plain_thread_answers_unknown_op() {
        let home = FakeHome::new("wine-lib-");
        let err = dispatch_sync("nope", &[], &ctx(&home)).unwrap_err();
        assert_eq!(err, "unknown op: nope");
    }

    #[tokio::test]
    async fn a_panicking_op_answers_panic() {
        let home = FakeHome::new("wine-lib-");
        let err = guarded("wine_probe", &ctx(&home), panicking())
            .await
            .unwrap_err();
        assert_eq!(err, "wine_probe:panic");
    }

    #[tokio::test]
    async fn a_cancelled_shutdown_answers_shutdown_and_releases_its_registrant() {
        let home = FakeHome::new("wine-lib-");
        let ctx = ctx(&home);
        ctx.engine.shutdown.token().cancel();
        let work = async { Ok(Value::Null) };
        let err = guarded("wine_probe", &ctx, work).await.unwrap_err();
        assert_eq!(err, "wine_probe:shutdown");
        assert!(ctx
            .engine
            .shutdown
            .drain(std::time::Duration::from_millis(50))
            .is_empty());
    }
}
