//! The engine services (Phase 87, SVC-02): the pinned fallback engine, engine selection and the
//! tool resolvers, ported from the TypeScript sidecar. Each plan adds its modules and ops here.
//!
//! Tauri-free, no environment reads, no `keyring`, and a child process only ever through
//! `gamelib-proc`. Paths, the clock and the platform all arrive in [`ctx::EngineCtx`], so the crate
//! runs headlessly on a fake HOME (`gamelib-engine-cli`) and in the shell alike. Every op goes
//! through [`dispatch`], which answers `unknown op: <op>` for a name not in [`OPS`].
//!
//! This crate never depends on `gamelib-wine` (D-04): the dependency runs the other way.

pub mod ctx;
pub mod dxvk;
pub mod fetch;
pub mod pins;
pub mod sinks;
#[cfg(feature = "testing")]
pub mod testing;

use ctx::EngineCtx;
use serde_json::Value;
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};
use tokio::runtime::{Builder, Handle, Runtime};

/// Ops reachable from the shell and the CLI. Keep sorted; each plan adds its own.
pub const OPS: &[&str] = &["engine_pins"];

/// Runs `op` over `args`. `Err` is only an unknown op, bad arguments, a missing collaborator, a
/// shutdown, a wrong thread or a panic (`<op>:panic`).
pub async fn dispatch(op: &str, args: &[Value], ctx: &EngineCtx) -> Result<Value, String> {
    let Some(name) = OPS.iter().copied().find(|o| *o == op) else {
        return Err(format!("unknown op: {op}"));
    };
    guarded(name, ctx, route(name, args, ctx)).await
}

/// Each plan adds its arms here, in step with `OPS`.
async fn route(op: &str, args: &[Value], _ctx: &EngineCtx) -> Result<Value, String> {
    match op {
        "engine_pins" => {
            if !args.is_empty() {
                return Err(format!("{op}:bad-args"));
            }
            let table = pins::pins().map_err(|e| format!("{op}:{e}"))?;
            serde_json::to_value(table).map_err(|_| format!("{op}:encode"))
        }
        _ => Err(format!("unknown op: {op}")),
    }
}

/// The one object argument of an op, decoded strictly (the arg structs deny unknown fields). The
/// error is a fixed `<op>:bad-args`: a renderer or sidecar string never reaches it.
#[allow(dead_code)] // the first op with an argument lands in a later plan
fn decode<T: serde::de::DeserializeOwned>(op: &str, args: &[Value]) -> Result<T, String> {
    let [arg] = args else {
        return Err(format!("{op}:bad-args"));
    };
    serde_json::from_value(arg.clone()).map_err(|_| format!("{op}:bad-args"))
}

/// The op wrapper: `work` runs holding a `Shutdown` registrant for exactly its lifetime and is
/// raced against the shutdown token, answering `<op>:shutdown` when cancelled and `<op>:panic` when
/// it panics. Once shutdown has begun, `work` is not started at all.
pub async fn guarded<F>(op: &str, ctx: &EngineCtx, work: F) -> Result<Value, String>
where
    F: Future<Output = Result<Value, String>>,
{
    let _registrant = ctx.shutdown.register("engine");
    let token = ctx.shutdown.token();
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
                .thread_name("engine")
                .enable_all()
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// [`dispatch`] for a plain thread: blocks on the crate's own runtime. Called from inside a tokio
/// runtime it answers `<op>:wrong-thread` instead of panicking in `block_on`.
pub fn dispatch_sync(op: &str, args: &[Value], ctx: &EngineCtx) -> Result<Value, String> {
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
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use serde_json::json;
    use std::sync::Arc;

    fn ctx(home: &FakeHome) -> EngineCtx {
        let root = home.root().to_path_buf();
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            ctx::Platform::Linux,
            ctx::EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
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
        assert!(OPS.contains(&"engine_pins"));
    }

    #[tokio::test]
    async fn an_unknown_op_is_named_in_the_error() {
        let home = FakeHome::new("engine-lib-");
        let err = dispatch("nope", &[], &ctx(&home)).await.unwrap_err();
        assert_eq!(err, "unknown op: nope");
    }

    #[tokio::test]
    async fn engine_pins_answers_the_shared_table() {
        let home = FakeHome::new("engine-lib-");
        let value = dispatch("engine_pins", &[], &ctx(&home)).await.unwrap();
        assert_eq!(value["current"]["id"], "wine-staging-11.20");
        assert!(value["previous"].is_null());
    }

    #[tokio::test]
    async fn a_two_argument_call_is_bad_args() {
        let home = FakeHome::new("engine-lib-");
        let args = [json!(1), json!(2)];
        let err = dispatch("engine_pins", &args, &ctx(&home))
            .await
            .unwrap_err();
        assert_eq!(err, "engine_pins:bad-args");
    }

    #[test]
    fn decode_takes_exactly_one_strict_argument() {
        #[derive(serde::Deserialize, Debug)]
        #[serde(deny_unknown_fields)]
        struct Args {
            #[allow(dead_code)]
            id: String,
        }
        assert!(decode::<Args>("engine_x", &[json!({"id": "a"})]).is_ok());
        assert_eq!(
            decode::<Args>("engine_x", &[]).unwrap_err(),
            "engine_x:bad-args"
        );
        assert_eq!(
            decode::<Args>("engine_x", &[json!({"id": "a", "extra": 1})]).unwrap_err(),
            "engine_x:bad-args"
        );
    }

    #[tokio::test]
    async fn dispatch_sync_inside_a_runtime_is_wrong_thread() {
        let home = FakeHome::new("engine-lib-");
        let err = dispatch_sync("engine_pins", &[], &ctx(&home)).unwrap_err();
        assert_eq!(err, "engine_pins:wrong-thread");
    }

    #[test]
    fn dispatch_sync_on_a_plain_thread_runs_the_op() {
        let home = FakeHome::new("engine-lib-");
        let value = dispatch_sync("engine_pins", &[], &ctx(&home)).unwrap();
        assert_eq!(value["current"]["id"], "wine-staging-11.20");
    }

    #[tokio::test]
    async fn a_panicking_op_answers_panic() {
        let home = FakeHome::new("engine-lib-");
        let err = guarded("engine_pins", &ctx(&home), panicking())
            .await
            .unwrap_err();
        assert_eq!(err, "engine_pins:panic");
    }

    #[tokio::test]
    async fn a_cancelled_shutdown_answers_shutdown_and_releases_its_registrant() {
        let home = FakeHome::new("engine-lib-");
        let ctx = ctx(&home);
        ctx.shutdown.token().cancel();
        let err = dispatch("engine_pins", &[], &ctx).await.unwrap_err();
        assert_eq!(err, "engine_pins:shutdown");
        assert!(ctx
            .shutdown
            .drain(std::time::Duration::from_millis(50))
            .is_empty());
    }
}
