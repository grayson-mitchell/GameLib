//! The known-fix services (Phase 88, SVC-03): the profile layers, the overlay catalogue and the fix
//! resolution the launch path applies, ported from the TypeScript sidecar (D-03). Each plan adds its
//! modules and ops here.
//!
//! Tauri-free, no environment reads (the relay URL and the app version arrive as values in
//! [`ctx::KnownFixCtx`]), no `keyring`, and a child process only ever through `gamelib-proc`. Every
//! log line goes through `EngineCtx.log` as fixed text, which the engine's redactor then holds to: a
//! line never carries a URL, query, header, token, account name or profile path. Every op goes through
//! [`dispatch`], which answers `unknown op: <op>` for a name not in [`OPS`].
//!
//! This crate may depend on `gamelib-engine` and `gamelib-wine`; neither of them ever depends on it
//! (87 D-04, the one-way rule).

pub mod catalogue;
pub mod ctx;

/// The cancel token a long op takes, re-exported so the shell, which owns the renderer's cancel, needs
/// no `tokio-util` of its own.
pub use tokio_util::sync::CancellationToken;

use ctx::KnownFixCtx;
use serde_json::Value;
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};
use tokio::runtime::{Builder, Handle, Runtime};

/// Ops reachable from the shell and the CLI. Keep sorted; each plan adds its own.
pub const OPS: &[&str] = &["knownfix_overlay_catalogue"];

/// Runs `op` over `args`. `Err` is only an unknown op, bad arguments, a shutdown, a wrong thread or a
/// panic (`<op>:panic`).
pub async fn dispatch(op: &str, args: &[Value], ctx: &KnownFixCtx) -> Result<Value, String> {
    let Some(name) = OPS.iter().copied().find(|o| *o == op) else {
        return Err(format!("unknown op: {op}"));
    };
    guarded(name, ctx, route(name, args, ctx)).await
}

/// Each plan adds its arms here, in step with `OPS`.
async fn route(op: &str, args: &[Value], _ctx: &KnownFixCtx) -> Result<Value, String> {
    match op {
        // The overlay catalogue the signed app pins (D-03): the shared JSON, parsed once.
        "knownfix_overlay_catalogue" => {
            if !args.is_empty() {
                return Err(format!("{op}:bad-args"));
            }
            let catalogue = catalogue::catalogue().map_err(|e| format!("{op}:{e}"))?;
            serde_json::to_value(catalogue).map_err(|_| format!("{op}:bad-result"))
        }
        _ => Err(format!("unknown op: {op}")),
    }
}

/// The one object argument of an op, decoded strictly (the arg structs deny unknown fields). The
/// error is a fixed `<op>:bad-args`: a renderer or sidecar string never reaches it.
// First used by the op the next plan adds; the dispatch tests exercise it today.
#[allow(dead_code)]
fn decode<T: serde::de::DeserializeOwned>(op: &str, args: &[Value]) -> Result<T, String> {
    let [arg] = args else {
        return Err(format!("{op}:bad-args"));
    };
    serde_json::from_value(arg.clone()).map_err(|_| format!("{op}:bad-args"))
}

/// The op wrapper: `work` runs holding a `Shutdown` registrant for exactly its lifetime and is
/// raced against the shutdown token, answering `<op>:shutdown` when cancelled and `<op>:panic` when
/// it panics. Once shutdown has begun, `work` is not started at all.
pub async fn guarded<F>(op: &str, ctx: &KnownFixCtx, work: F) -> Result<Value, String>
where
    F: Future<Output = Result<Value, String>>,
{
    let _registrant = ctx.engine.shutdown.register("knownfix");
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
                .thread_name("knownfix")
                .enable_all()
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// [`dispatch`] for a plain thread: blocks on the crate's own runtime. Called from inside a tokio
/// runtime it answers `<op>:wrong-thread` instead of panicking in `block_on`.
pub fn dispatch_sync(op: &str, args: &[Value], ctx: &KnownFixCtx) -> Result<Value, String> {
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

    // The same literals `knownFixOverlayCatalogue.test.ts` pins on the TS side.
    const ARCHIVE_URL: &str = "https://github.com/grayson-mitchell/GameLib/releases/download/overlay-gst-libav-1.24.13-x86_64/gst-libav-1.24.13-macos-x86_64.tar.gz";
    const NOTICES_URL: &str =
        "https://github.com/grayson-mitchell/GameLib/releases/tag/overlay-gst-libav-1.24.13-x86_64";

    fn ctx(home: &FakeHome) -> KnownFixCtx {
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
        KnownFixCtx::new(Arc::new(engine), None, "https://relay.test", "1.2.3")
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
        assert!(OPS.contains(&"knownfix_overlay_catalogue"));
    }

    #[tokio::test]
    async fn an_unknown_op_is_named() {
        let home = FakeHome::new("knownfix-lib-");
        let err = dispatch("nope", &[], &ctx(&home)).await.unwrap_err();
        assert_eq!(err, "unknown op: nope");
    }

    #[tokio::test]
    async fn the_catalogue_op_takes_no_argument() {
        let home = FakeHome::new("knownfix-lib-");
        let ctx = ctx(&home);
        let op = "knownfix_overlay_catalogue";
        for bad in [vec![json!(1)], vec![json!({})], vec![json!(null), json!(1)]] {
            assert_eq!(
                dispatch(op, &bad, &ctx).await.unwrap_err(),
                format!("{op}:bad-args"),
                "{bad:?}"
            );
        }
        let answer = dispatch(op, &[], &ctx).await.unwrap();
        assert_eq!(answer["entries"][0]["id"], "gst-libav-1.24.13");
        assert_eq!(
            answer["targetEnv"]["gstreamer-plugin-path"],
            "GST_PLUGIN_PATH"
        );
        // Nothing was created for a read of compiled-in data.
        assert!(!home.root().join("overlays").exists());
    }

    #[test]
    fn decode_takes_exactly_one_strict_argument() {
        #[derive(serde::Deserialize, Debug)]
        #[serde(deny_unknown_fields)]
        struct Args {
            #[allow(dead_code)]
            id: String,
        }
        assert!(decode::<Args>("knownfix_x", &[json!({"id": "a"})]).is_ok());
        assert_eq!(
            decode::<Args>("knownfix_x", &[json!(1), json!(2)]).unwrap_err(),
            "knownfix_x:bad-args"
        );
        assert_eq!(
            decode::<Args>("knownfix_x", &[json!({"id": "a", "extra": 1})]).unwrap_err(),
            "knownfix_x:bad-args"
        );
    }

    #[test]
    fn the_catalogue_urls_are_the_literals_the_ts_test_pins() {
        let entry = catalogue::lookup("gst-libav-1.24.13").expect("the pinned overlay");
        assert_eq!(catalogue::archive_url(entry), ARCHIVE_URL);
        assert_eq!(catalogue::notices_url().unwrap(), NOTICES_URL);
        assert_eq!(entry.files.len(), 10);
        assert_eq!(entry.archive_size, 8_279_592);
        assert!(catalogue::lookup("gst-libav-1.24.13 ").is_none());
        assert!(catalogue::lookup("__proto__").is_none());
    }

    #[test]
    fn the_paths_derive_from_the_app_folder_as_app_paths_ts_builds_them() {
        let home = FakeHome::new("knownfix-lib-");
        let ctx = ctx(&home);
        let root = home.root();
        assert_eq!(ctx.paths.fixes, root.join("fixes"));
        assert_eq!(ctx.paths.local, root.join("fixes").join("local"));
        assert_eq!(ctx.paths.overlays, root.join("overlays"));
        assert_eq!(ctx.paths.bundled, None);
        assert_eq!(ctx.relay_url, "https://relay.test");
        assert_eq!(ctx.app_version, "1.2.3");
    }

    #[tokio::test]
    async fn dispatch_sync_inside_a_runtime_is_wrong_thread() {
        let home = FakeHome::new("knownfix-lib-");
        let err = dispatch_sync("knownfix_probe", &[], &ctx(&home)).unwrap_err();
        assert_eq!(err, "knownfix_probe:wrong-thread");
    }

    #[test]
    fn dispatch_sync_on_a_plain_thread_answers_the_op_and_unknown_op() {
        let home = FakeHome::new("knownfix-lib-");
        let ctx = ctx(&home);
        let err = dispatch_sync("nope", &[], &ctx).unwrap_err();
        assert_eq!(err, "unknown op: nope");
        let answer = dispatch_sync("knownfix_overlay_catalogue", &[], &ctx).unwrap();
        assert_eq!(answer["entries"][0]["id"], "gst-libav-1.24.13");
    }

    #[tokio::test]
    async fn a_panicking_op_answers_panic() {
        let home = FakeHome::new("knownfix-lib-");
        let err = guarded("knownfix_probe", &ctx(&home), panicking())
            .await
            .unwrap_err();
        assert_eq!(err, "knownfix_probe:panic");
    }

    #[tokio::test]
    async fn a_cancelled_shutdown_answers_shutdown_and_releases_its_registrant() {
        let home = FakeHome::new("knownfix-lib-");
        let ctx = ctx(&home);
        ctx.engine.shutdown.token().cancel();
        let work = async { Ok(Value::Null) };
        let err = guarded("knownfix_probe", &ctx, work).await.unwrap_err();
        assert_eq!(err, "knownfix_probe:shutdown");
        assert!(ctx
            .engine
            .shutdown
            .drain(std::time::Duration::from_millis(50))
            .is_empty());
    }
}
