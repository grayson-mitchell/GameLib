//! The desktop and Steam shortcut services (Phase 94, SVC-05): the `.app` and Desktop link, the Steam
//! `shortcuts.vdf` writes and icon generation, ported from the TypeScript sidecar. Each plan adds its
//! modules and ops here.
//!
//! Tauri-free, no environment reads, no `keyring`, and a child process only ever through the
//! `SpecRunner` the shell injects (never a spawn of this crate's own). Everything an op needs
//! arrives in [`ctx::ShortcutsCtx`]. Every op goes through [`dispatch`], which answers
//! `unknown op: <op>` for a name not in [`OPS`].
//!
//! This crate depends on neither `gamelib-humble` nor `tauri`; `cargo tree` proves it (94-02).

pub mod add;
pub mod ctx;
pub mod exists;
pub mod game;
pub mod http;
pub mod icns;
pub mod icons;
pub mod launch_url;
pub mod linux;
pub mod mac;
pub mod notice;
pub mod paths;
pub mod proof;
pub mod registry;
pub mod remove;
pub mod sanitize;
#[cfg(any(test, feature = "testing"))]
pub mod testing;
pub mod windows;

use ctx::ShortcutsCtx;
use serde_json::Value;
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};
use tokio::runtime::{Builder, Handle, Runtime};

/// Ops reachable from the shell. Keep sorted; each plan adds its own.
pub const OPS: &[&str] = &["shortcuts_add", "shortcuts_exist", "shortcuts_remove"];

/// The runner names a game can belong to, as the renderer and the sidecar spell them.
const RUNNERS: &[&str] = &["gog", "legendary", "nile", "sideload", "steam"];

/// The arguments of `shortcuts_exist`: the game's own `appName` and `runner` (validated, not used to
/// build a path) and its `title`, the one input the TS library managers hold and Rust cannot gather.
/// A game with no title (the library's `{}` sentinel) arrives with no `title` or a `null` one.
#[derive(Debug, serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ExistArgs {
    pub app_name: String,
    pub runner: String,
    #[serde(default)]
    pub title: Option<String>,
}

/// Ops that exist only in this crate's own unit tests, to pin the dispatch contract. Never part of
/// a release [`OPS`].
#[cfg(test)]
const TEST_OPS: &[&str] = &["shortcuts_test_echo", "shortcuts_test_panic"];

fn test_ops() -> &'static [&'static str] {
    #[cfg(test)]
    {
        TEST_OPS
    }
    #[cfg(not(test))]
    {
        &[]
    }
}

/// Runs `op` over `args`. `Err` is only an unknown op, bad arguments, a missing collaborator, a
/// shutdown, a wrong thread or a panic (`<op>:panic`).
pub async fn dispatch(op: &str, args: &[Value], ctx: &ShortcutsCtx) -> Result<Value, String> {
    let Some(name) = OPS
        .iter()
        .copied()
        .chain(test_ops().iter().copied())
        .find(|o| *o == op)
    else {
        return Err(format!("unknown op: {op}"));
    };
    guarded(name, ctx, route(name, args, ctx)).await
}

/// Each plan adds its arms here, in step with `OPS`.
async fn route(op: &str, args: &[Value], ctx: &ShortcutsCtx) -> Result<Value, String> {
    #[cfg(test)]
    if let Some(done) = test_route(op, args) {
        return done;
    }
    match op {
        "shortcuts_exist" => {
            let args: ExistArgs = decode(op, args)?;
            if args.app_name.is_empty() || !RUNNERS.contains(&args.runner.as_str()) {
                return Err(format!("{op}:bad-args"));
            }
            Ok(Value::Bool(
                exists::shortcuts_exist(ctx, args.title.as_deref()).await,
            ))
        }
        "shortcuts_add" => {
            let args: add::AddArgs = decode(op, args)?;
            // A shortcut file is named from the title and launches the app name under a known runner.
            if args.game.app_name.is_empty()
                || args.game.title.is_empty()
                || !RUNNERS.contains(&args.game.runner.as_str())
            {
                return Err(format!("{op}:bad-args"));
            }
            to_value(op, add::shortcuts_add(ctx, args).await)
        }
        "shortcuts_remove" => {
            let args: remove::RemoveArgs = decode(op, args)?;
            to_value(op, remove::shortcuts_remove(ctx, args).await)
        }
        _ => Err(format!("unknown op: {op}")),
    }
}

/// An op's outcome as the JSON the shell answers with.
fn to_value<T: serde::Serialize>(op: &str, outcome: T) -> Result<Value, String> {
    serde_json::to_value(outcome).map_err(|_| format!("{op}:serialize"))
}

/// The one object argument of an op, decoded strictly (the arg structs deny unknown fields). The
/// error is a fixed `<op>:bad-args`: a renderer or sidecar string never reaches it.
fn decode<T: serde::de::DeserializeOwned>(op: &str, args: &[Value]) -> Result<T, String> {
    let [arg] = args else {
        return Err(format!("{op}:bad-args"));
    };
    serde_json::from_value(arg.clone()).map_err(|_| format!("{op}:bad-args"))
}

/// The op wrapper (D-20): `work` runs holding a `Shutdown` registrant for exactly its lifetime and
/// is raced against the shutdown token, answering `<op>:shutdown` when cancelled and `<op>:panic`
/// when it panics. Once shutdown has begun, `work` is not started at all.
pub async fn guarded<F>(op: &str, ctx: &ShortcutsCtx, work: F) -> Result<Value, String>
where
    F: Future<Output = Result<Value, String>>,
{
    let _registrant = ctx.shutdown.register("shortcuts");
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
                .thread_name("shortcuts")
                .enable_all()
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// [`dispatch`] for a plain thread: blocks on the crate's own runtime. Called from inside a tokio
/// runtime it answers `<op>:wrong-thread` instead of panicking in `block_on`.
pub fn dispatch_sync(op: &str, args: &[Value], ctx: &ShortcutsCtx) -> Result<Value, String> {
    if Handle::try_current().is_ok() {
        return Err(format!("{op}:wrong-thread"));
    }
    runtime()
        .map_err(|e| format!("{op}:no-runtime ({e})"))?
        .block_on(dispatch(op, args, ctx))
}

#[cfg(test)]
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct EchoArgs {
    n: u64,
}

/// The test-only arms: `echo` proves the strict decode and a success, `panic` the `<op>:panic` arm.
#[cfg(test)]
fn test_route(op: &str, args: &[Value]) -> Option<Result<Value, String>> {
    match op {
        "shortcuts_test_echo" => Some(decode::<EchoArgs>(op, args).map(|a| Value::from(a.n))),
        "shortcuts_test_panic" => panic!("test panic"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use serde_json::json;
    use std::sync::Arc;
    use std::time::Duration;

    fn ctx(shutdown: Shutdown) -> ShortcutsCtx {
        ShortcutsCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            ctx::Platform::Linux,
            shutdown,
        )
    }

    #[test]
    fn ops_are_sorted_and_unique() {
        assert!(OPS.windows(2).all(|w| w[0] < w[1]));
    }

    #[test]
    fn test_ops_never_reach_a_release_ops_list() {
        for op in TEST_OPS {
            assert!(!OPS.contains(op), "{op} must not be in OPS");
        }
    }

    #[tokio::test]
    async fn an_unknown_op_is_named() {
        let got = dispatch("shortcuts_nope", &[], &ctx(Shutdown::new())).await;
        assert_eq!(got, Err("unknown op: shortcuts_nope".to_string()));
    }

    #[tokio::test]
    async fn a_known_op_answers_its_value() {
        let got = dispatch(
            "shortcuts_test_echo",
            &[json!({ "n": 7 })],
            &ctx(Shutdown::new()),
        )
        .await;
        assert_eq!(got, Ok(json!(7)));
    }

    #[tokio::test]
    async fn bad_args_never_echo_the_input() {
        let ctx = ctx(Shutdown::new());
        let op = "shortcuts_test_echo";
        let want = Err(format!("{op}:bad-args"));
        assert_eq!(dispatch(op, &[], &ctx).await, want);
        assert_eq!(
            dispatch(op, &[json!({ "n": 1 }), json!({ "n": 2 })], &ctx).await,
            want
        );
        assert_eq!(
            dispatch(op, &[json!({ "n": "secret-text" })], &ctx).await,
            want
        );
        assert_eq!(
            dispatch(op, &[json!({ "n": 1, "extra": "secret-text" })], &ctx).await,
            want
        );
    }

    #[tokio::test]
    async fn a_panicking_op_answers_panic() {
        let got = dispatch("shortcuts_test_panic", &[], &ctx(Shutdown::new())).await;
        assert_eq!(got, Err("shortcuts_test_panic:panic".to_string()));
    }

    #[tokio::test]
    async fn a_cancelled_token_answers_shutdown_and_starts_no_work() {
        let shutdown = Shutdown::new();
        // `drain` cancels the token; nothing is registered yet, so it returns at once.
        assert!(shutdown.drain(Duration::ZERO).is_empty());
        let got = dispatch("shortcuts_test_echo", &[json!({ "n": 1 })], &ctx(shutdown)).await;
        assert_eq!(got, Err("shortcuts_test_echo:shutdown".to_string()));
    }

    #[tokio::test]
    async fn the_registrant_is_released_when_the_op_ends() {
        let shutdown = Shutdown::new();
        let ctx = ctx(shutdown.clone());
        let done = dispatch("shortcuts_test_echo", &[json!({ "n": 1 })], &ctx).await;
        assert_eq!(done, Ok(json!(1)));
        // Nothing still held: the drain finds no name to wait on.
        assert!(shutdown.drain(Duration::from_millis(50)).is_empty());
    }

    #[test]
    fn dispatch_sync_blocks_on_the_crate_runtime_from_a_plain_thread() {
        let got = dispatch_sync(
            "shortcuts_test_echo",
            &[json!({ "n": 3 })],
            &ctx(Shutdown::new()),
        );
        assert_eq!(got, Ok(json!(3)));
    }

    #[tokio::test]
    async fn dispatch_sync_inside_a_runtime_is_wrong_thread() {
        let got = dispatch_sync(
            "shortcuts_test_echo",
            &[json!({ "n": 3 })],
            &ctx(Shutdown::new()),
        );
        assert_eq!(got, Err("shortcuts_test_echo:wrong-thread".to_string()));
    }
}
