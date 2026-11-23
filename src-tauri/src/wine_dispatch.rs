//! The shell's side of the wine services (Phase 87, SVC-02): the one [`WineCtx`], and the `wine`
//! native channels, over the Tauri-free `gamelib-wine` crate.
//!
//! D-20: one `Arc<WineCtx>` is built in `run_setup` right after [`engine_dispatch::install`], from
//! the engine context and the runtimes directory `<tools>/runtimes` (`appPaths.ts` `runtimePath`).
//! Nothing here spawns a process or waits without a bound: every op runs inside the crate's `guarded`
//! wrapper (a shutdown registrant raced against the token). Until [`install`] has run, an op answers
//! `<channel>: not-ready`.
//!
//! D-06: the runtime download is Rust's alone (87-18): the renderer's `downloadRuntime` channel is
//! native here and the launcher reaches `wine_runtime_download` through the `rustInvoke` arms, so a runtime
//! download never has a TS and a Rust writer at once.
//!
//! T-87-17, T-87-65: the runtime name is the renderer's (or the sidecar's). It is decoded against the
//! three names and a rejection is a fixed literal that never echoes the input.

use super::*;

use gamelib_wine::ctx::WineCtx;
use gamelib_wine::runtimes::RuntimeName;

/// The one context, set once by [`install`].
static WINE_CTX: OnceLock<Arc<WineCtx>> = OnceLock::new();

/// The installed context, or `None` before [`install`] (and in a unit test that built its own).
pub(crate) fn wine_ctx() -> Option<&'static Arc<WineCtx>> {
    WINE_CTX.get()
}

/// Builds the wine context from the engine context and stores it. A no-op when the engine context
/// was not installed (no home directory), so every wine op answers not-ready. A second call is
/// ignored (the first context stays).
pub(crate) fn install() {
    let Some(engine) = engine_dispatch::engine_ctx() else {
        return;
    };
    let runtime_path = engine.paths.tools_path.join("runtimes");
    let _ = WINE_CTX.set(Arc::new(WineCtx::new(Arc::clone(engine), runtime_path)));
}

/// What a rejected argument looks like: the JSON path and the zod-vocabulary code. Fixed literals
/// only, never the renderer's value (T-87-17).
type Rejection = (&'static str, &'static str);

/// Decodes the one `name` argument of `isRuntimeInstalled` and `downloadRuntime`: exactly one string, one of
/// `eac_runtime`, `battleye_runtime`, `umu`.
fn parse_runtime_name(args: &[Value]) -> Result<RuntimeName, Rejection> {
    let [arg] = args else {
        return Err(("(args)", "invalid_type"));
    };
    let Value::String(name) = arg else {
        return Err(("0", "invalid_type"));
    };
    RuntimeName::parse(name).ok_or(("0", "invalid_value"))
}

/// Runs `op` over `args` on the blocking pool. The crate's own async `dispatch` is driven with
/// `block_on` there (never `dispatch_sync`, which refuses a thread inside a runtime), so a file read
/// stays off the async workers and the op still holds its shutdown registrant.
async fn run_wine_op(
    wine: Arc<WineCtx>,
    op: &'static str,
    args: Vec<Value>,
    failed: &'static str,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        tauri::async_runtime::block_on(gamelib_wine::dispatch(op, &args, &wine))
    })
    .await
    .map_err(|_| failed.to_string())?
}

/// The shared body of the two runtime channels: validates `args` before the context is looked at (a
/// bad call is rejected the same way before and after the install), then runs `op` over the one decoded
/// name. An error is a fixed literal (the crate's `<op>:<category>` or the invalid-args marker),
/// never the renderer's string.
fn runtime_channel(
    channel: &'static str,
    op: &'static str,
    failed: &'static str,
    args: Vec<Value>,
) -> NativeFuture {
    Box::pin(async move {
        let name = parse_runtime_name(&args)
            .map_err(|(path, code)| invalid_args(channel, &[path], &[code]))?;
        let wine = wine_ctx().ok_or_else(|| format!("{channel}: not ready"))?;
        run_wine_op(
            Arc::clone(wine),
            op,
            vec![Value::String(name.as_str().to_string())],
            failed,
        )
        .await
    })
}

/// The native `isRuntimeInstalled` handler (slice `wine`, D-14): whether the EAC, BattlEye or umu
/// runtime is installed and current, answered by `wine_runtime_is_installed`.
pub(crate) fn is_runtime_installed(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    runtime_channel(
        "isRuntimeInstalled",
        "wine_runtime_is_installed",
        "isRuntimeInstalled: the check did not finish",
        args,
    )
}

/// The native `downloadRuntime` handler (slice `wine`, D-14): downloads and extracts the EAC, BattlEye
/// or umu runtime, answered by `wine_runtime_download` (`true` when the runtime is installed after it).
/// It has no deadline of its own: the crate op holds a shutdown registrant and is cancelled by the
/// token, so a download outlasting the sidecar's 60 s invoke bound is not cut short.
pub(crate) fn download_runtime(_ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    runtime_channel(
        "downloadRuntime",
        "wine_runtime_download",
        "downloadRuntime: the download did not finish",
        args,
    )
}

/// Runs `op` over `args` for a `rustInvoke` arm. These arms run on the dispatcher's worker thread, never
/// inside a runtime, so the crate's own `dispatch_sync` drives the op there. Before [`install`] the
/// answer is `<op>:not-ready`.
fn rpc_wine_op(
    wine: Option<&Arc<WineCtx>>,
    op: &'static str,
    args: &[Value],
) -> Result<Value, String> {
    let wine = wine.ok_or_else(|| format!("{op}:not-ready"))?;
    gamelib_wine::dispatch_sync(op, args, wine)
}

/// The `wine_runtime_is_installed` `rustInvoke` arm (the launcher's `isRuntimeInstalled` shim, 87-18):
/// the generated decode (one string, one of the three names) first, then the crate, which refuses
/// anything but exactly one plain-component string again (T-87-65). Rejections are fixed
/// `<op>:bad-args` literals.
pub(crate) fn rpc_wine_runtime_is_installed(args: &[Value]) -> Result<Value, String> {
    WineRuntimeIsInstalledArgs::from_args(args)?;
    rpc_wine_op(wine_ctx(), "wine_runtime_is_installed", args)
}

/// The `wine_runtime_download` `rustInvoke` arm (the launcher's `downloadRuntime` shim, 87-18), decoded
/// the same way. The sidecar leaves this channel unbounded (`UNBOUNDED_RUST_CHANNELS`); the crate's
/// shutdown registrant and the token bound it instead.
pub(crate) fn rpc_wine_runtime_download(args: &[Value]) -> Result<Value, String> {
    WineRuntimeDownloadArgs::from_args(args)?;
    rpc_wine_op(wine_ctx(), "wine_runtime_download", args)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_runtime_name_is_one_of_the_three_and_nothing_else() {
        for name in ["eac_runtime", "battleye_runtime", "umu"] {
            assert_eq!(
                parse_runtime_name(&[json!(name)]).map(RuntimeName::as_str),
                Ok(name)
            );
        }
        for (args, want) in [
            (vec![], ("(args)", "invalid_type")),
            (vec![json!("umu"), json!("umu")], ("(args)", "invalid_type")),
            (vec![json!(1)], ("0", "invalid_type")),
            (vec![json!(null)], ("0", "invalid_type")),
            (vec![json!({ "name": "umu" })], ("0", "invalid_type")),
            (vec![json!("x")], ("0", "invalid_value")),
            (vec![json!("")], ("0", "invalid_value")),
            (vec![json!("UMU")], ("0", "invalid_value")),
            (vec![json!("../umu")], ("0", "invalid_value")),
        ] {
            assert_eq!(parse_runtime_name(&args).map(|_| ()), Err(want), "{args:?}");
        }
    }

    #[test]
    fn the_handler_validates_first_and_answers_not_ready_before_install() {
        assert!(wine_ctx().is_none());
        let router_ctx = Arc::new(crate::native_router::NativeCtx::for_tests(
            Arc::new(NoHost),
            None,
        ));
        let not_ready = tauri::async_runtime::block_on(is_runtime_installed(
            Arc::clone(&router_ctx),
            vec![json!("umu")],
        ));
        assert_eq!(not_ready, Err("isRuntimeInstalled: not ready".to_string()));
        let not_ready = tauri::async_runtime::block_on(download_runtime(
            Arc::clone(&router_ctx),
            vec![json!("umu")],
        ));
        assert_eq!(not_ready, Err("downloadRuntime: not ready".to_string()));
        let secret = "SECRET-RUNTIME-".repeat(80);
        for bad in [
            tauri::async_runtime::block_on(is_runtime_installed(
                Arc::clone(&router_ctx),
                vec![json!(secret)],
            )),
            tauri::async_runtime::block_on(is_runtime_installed(Arc::clone(&router_ctx), vec![])),
            tauri::async_runtime::block_on(download_runtime(
                Arc::clone(&router_ctx),
                vec![json!(secret)],
            )),
            tauri::async_runtime::block_on(download_runtime(
                Arc::clone(&router_ctx),
                vec![json!("umu"), json!("umu")],
            )),
            tauri::async_runtime::block_on(download_runtime(router_ctx, vec![])),
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
    fn the_rpc_arms_validate_first_and_answer_not_ready_before_install() {
        assert!(wine_ctx().is_none());
        assert_eq!(
            rpc_wine_runtime_download(&[json!("umu")]),
            Err("wine_runtime_download:not-ready".to_string())
        );
        assert_eq!(
            rpc_wine_runtime_is_installed(&[json!("eac_runtime")]),
            Err("wine_runtime_is_installed:not-ready".to_string())
        );
        for bad in [
            vec![],
            vec![json!(1)],
            vec![json!("x")],
            vec![json!("../umu")],
            vec![json!({ "name": "umu" })],
        ] {
            assert_eq!(
                rpc_wine_runtime_download(&bad),
                Err("wine_runtime_download:bad-args".to_string()),
                "{bad:?}"
            );
            assert_eq!(
                rpc_wine_runtime_is_installed(&bad),
                Err("wine_runtime_is_installed:bad-args".to_string()),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn an_rpc_arm_runs_the_crate_op_on_the_calling_thread_and_refuses_a_second_argument() {
        let missing = std::path::PathBuf::from("gamelib-wine-rpc-test-missing").join("runtimes");
        let engine = engine_dispatch::build_ctx(
            Arc::new(gamelib_store::host::StoreHost::new()),
            std::path::Path::new("gamelib-wine-rpc-test-missing"),
            std::path::PathBuf::from("home"),
            std::path::PathBuf::from("tmp"),
            Arc::new(gamelib_engine::sinks::NullEmitter),
            Arc::new(engine_dispatch::ShellEngineUi::silent(Arc::new(
                gamelib_engine::sinks::NullEmitter,
            ))),
            gamelib_core::shutdown::Shutdown::new(),
        );
        let wine = Arc::new(WineCtx::new(Arc::new(engine), missing));
        assert_eq!(
            rpc_wine_op(Some(&wine), "wine_runtime_is_installed", &[json!("umu")]),
            Ok(json!(false))
        );
        assert_eq!(
            rpc_wine_op(
                Some(&wine),
                "wine_runtime_is_installed",
                &[json!("umu"), json!("umu")]
            ),
            Err("wine_runtime_is_installed:bad-args".to_string())
        );
    }

    /// A host that does nothing: the runtime handlers never reach the native host.
    struct NoHost;
    impl crate::native_router::NativeHost for NoHost {
        fn open_url(&self, _url: String) {}
        fn reveal_path(&self, _path: String) {}
    }

    #[test]
    fn an_op_runs_through_the_crate_on_the_blocking_pool() {
        // A runtimes directory that does not exist: the crate answers false without a request.
        let missing =
            std::path::PathBuf::from("gamelib-wine-dispatch-test-missing").join("runtimes");
        let engine = engine_dispatch::build_ctx(
            Arc::new(gamelib_store::host::StoreHost::new()),
            std::path::Path::new("gamelib-wine-dispatch-test-missing"),
            std::path::PathBuf::from("home"),
            std::path::PathBuf::from("tmp"),
            Arc::new(gamelib_engine::sinks::NullEmitter),
            Arc::new(engine_dispatch::ShellEngineUi::silent(Arc::new(
                gamelib_engine::sinks::NullEmitter,
            ))),
            gamelib_core::shutdown::Shutdown::new(),
        );
        let wine = Arc::new(WineCtx::new(Arc::new(engine), missing));
        let answer = tauri::async_runtime::block_on(run_wine_op(
            wine,
            "wine_runtime_is_installed",
            vec![json!("umu")],
            "x",
        ));
        assert_eq!(answer, Ok(json!(false)));
    }

    #[test]
    fn the_wine_slice_is_the_one_the_manifest_names() {
        assert_eq!(crate::native_router::WINE_SLICE, "wine");
    }
}
