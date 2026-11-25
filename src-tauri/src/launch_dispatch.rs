//! The shell's side of the launch services (Phase 88.1, SVC-03): the one [`LaunchCtx`], and the
//! `launch_*` `rustInvoke` arms over the Tauri-free `gamelib-launch` crate.
//!
//! D-20: one `Arc<LaunchCtx>` is built by [`install`] in `run_setup` right after
//! [`knownfix_dispatch::install`], from the engine, known-fix and wine contexts already installed. Nothing
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

/// Builds the launch context from the engine, known-fix and wine contexts and stores it. A no-op when any
/// of the three was not installed (no home directory), so every launch channel answers not ready. A second
/// call is ignored (the first context stays).
pub(crate) fn install() {
    let (Some(engine), Some(knownfix), Some(wine)) = (
        engine_dispatch::engine_ctx(),
        knownfix_dispatch::knownfix_ctx(),
        wine_dispatch::wine_ctx(),
    ) else {
        return;
    };
    let ctx = LaunchCtx::new(Arc::clone(engine), Arc::clone(knownfix), Arc::clone(wine));
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
        Arc::new(LaunchCtx::new(engine, knownfix, wine))
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
}
