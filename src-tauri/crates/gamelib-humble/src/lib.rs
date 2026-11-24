//! The Humble Bundle services (Phase 94, SVC-04): the session, library sync and key redeem, ported
//! from the TypeScript sidecar. Each plan adds its modules and ops here.
//!
//! Tauri-free, no environment reads, no `keyring`, and a child process only ever through the
//! `SpecRunner` the shell injects (never a spawn of this crate's own). Everything an op needs
//! arrives in [`ctx::HumbleCtx`]. Every op goes through [`dispatch`], which answers
//! `unknown op: <op>` for a name not in [`OPS`].
//!
//! This crate depends on neither `gamelib-shortcuts` nor `tauri`; `cargo tree` proves it (94-02).

pub mod app_id_resolver;
pub mod classify;
pub mod ctx;
pub mod http;
pub mod js_date;
pub mod js_value;
pub mod stores;

use ctx::HumbleCtx;
use serde_json::Value;
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};
use tokio::runtime::{Builder, Handle, Runtime};

/// Ops reachable from the shell. Keep sorted; each plan adds its own.
pub const OPS: &[&str] = &["humble_get_gifted_at", "humble_get_ownership_overrides"];

/// Ops that exist only in this crate's own unit tests, to pin the dispatch contract. Never part of
/// a release [`OPS`].
#[cfg(test)]
const TEST_OPS: &[&str] = &["humble_test_echo", "humble_test_panic"];

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
pub async fn dispatch(op: &str, args: &[Value], ctx: &HumbleCtx) -> Result<Value, String> {
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
async fn route(op: &str, args: &[Value], ctx: &HumbleCtx) -> Result<Value, String> {
    #[cfg(test)]
    if let Some(done) = test_route(op, args) {
        return done;
    }
    match op {
        "humble_get_gifted_at" => {
            no_args(op, args)?;
            Ok(map_value(stores::gifted_at(ctx)))
        }
        "humble_get_ownership_overrides" => {
            no_args(op, args)?;
            Ok(map_value(stores::ownership_overrides(ctx)))
        }
        _ => Err(format!("unknown op: {op}")),
    }
}

/// An op that takes no argument: exactly `[]`. The error is the fixed `<op>:bad-args`.
fn no_args(op: &str, args: &[Value]) -> Result<(), String> {
    if args.is_empty() {
        Ok(())
    } else {
        Err(format!("{op}:bad-args"))
    }
}

/// A string-keyed map as the JSON object the renderer reads.
fn map_value(map: std::collections::BTreeMap<String, Value>) -> Value {
    Value::Object(map.into_iter().collect())
}

/// The one object argument of an op, decoded strictly (the arg structs deny unknown fields). The
/// error is a fixed `<op>:bad-args`: a renderer or sidecar string never reaches it.
#[allow(dead_code)]
fn decode<T: serde::de::DeserializeOwned>(op: &str, args: &[Value]) -> Result<T, String> {
    let [arg] = args else {
        return Err(format!("{op}:bad-args"));
    };
    serde_json::from_value(arg.clone()).map_err(|_| format!("{op}:bad-args"))
}

/// The op wrapper (D-20): `work` runs holding a `Shutdown` registrant for exactly its lifetime and
/// is raced against the shutdown token, answering `<op>:shutdown` when cancelled and `<op>:panic`
/// when it panics. Once shutdown has begun, `work` is not started at all.
pub async fn guarded<F>(op: &str, ctx: &HumbleCtx, work: F) -> Result<Value, String>
where
    F: Future<Output = Result<Value, String>>,
{
    let _registrant = ctx.shutdown.register("humble");
    let token = ctx.shutdown.token();
    let work = std::pin::pin!(work);
    let mut work = CatchUnwind(work);
    tokio::select! {
        biased;
        _ = token.cancelled() => {
            // Fixed text: the op name and a category, never an argument (T-94-24).
            ctx.warn(&format!("{op}: stopped by shutdown"));
            Err(format!("{op}:shutdown"))
        }
        done = &mut work => match done {
            Ok(result) => result,
            Err(()) => {
                ctx.warn(&format!("{op}: panicked"));
                Err(format!("{op}:panic"))
            }
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
                .thread_name("humble")
                .enable_all()
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// [`dispatch`] for a plain thread: blocks on the crate's own runtime. Called from inside a tokio
/// runtime it answers `<op>:wrong-thread` instead of panicking in `block_on`.
pub fn dispatch_sync(op: &str, args: &[Value], ctx: &HumbleCtx) -> Result<Value, String> {
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
        "humble_test_echo" => Some(decode::<EchoArgs>(op, args).map(|a| Value::from(a.n))),
        "humble_test_panic" => panic!("test panic"),
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

    fn ctx(shutdown: Shutdown) -> HumbleCtx {
        HumbleCtx::new(
            Arc::new(StoreHost::new()),
            std::path::PathBuf::new(),
            Arc::new(SystemClock),
            ctx::Platform::Linux,
            shutdown,
            Arc::new(http::NoHttp),
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
        let got = dispatch("humble_nope", &[], &ctx(Shutdown::new())).await;
        assert_eq!(got, Err("unknown op: humble_nope".to_string()));
    }

    #[tokio::test]
    async fn a_known_op_answers_its_value() {
        let got = dispatch(
            "humble_test_echo",
            &[json!({ "n": 7 })],
            &ctx(Shutdown::new()),
        )
        .await;
        assert_eq!(got, Ok(json!(7)));
    }

    #[tokio::test]
    async fn bad_args_never_echo_the_input() {
        let ctx = ctx(Shutdown::new());
        let op = "humble_test_echo";
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
        let got = dispatch("humble_test_panic", &[], &ctx(Shutdown::new())).await;
        assert_eq!(got, Err("humble_test_panic:panic".to_string()));
    }

    #[tokio::test]
    async fn a_cancelled_token_answers_shutdown_and_starts_no_work() {
        let shutdown = Shutdown::new();
        // `drain` cancels the token; nothing is registered yet, so it returns at once.
        assert!(shutdown.drain(Duration::ZERO).is_empty());
        let got = dispatch("humble_test_echo", &[json!({ "n": 1 })], &ctx(shutdown)).await;
        assert_eq!(got, Err("humble_test_echo:shutdown".to_string()));
    }

    #[tokio::test]
    async fn the_registrant_is_released_when_the_op_ends() {
        let shutdown = Shutdown::new();
        let ctx = ctx(shutdown.clone());
        let done = dispatch("humble_test_echo", &[json!({ "n": 1 })], &ctx).await;
        assert_eq!(done, Ok(json!(1)));
        // Nothing still held: the drain finds no name to wait on.
        assert!(shutdown.drain(Duration::from_millis(50)).is_empty());
    }

    /// Records every line the crate wrote.
    #[derive(Default)]
    struct RecordingLog(std::sync::Mutex<Vec<String>>);

    impl ctx::HumbleLog for RecordingLog {
        fn info(&self, line: &str) {
            self.0.lock().unwrap().push(format!("info {line}"));
        }
        fn warn(&self, line: &str) {
            self.0.lock().unwrap().push(format!("warn {line}"));
        }
        fn error(&self, line: &str) {
            self.0.lock().unwrap().push(format!("error {line}"));
        }
    }

    /// The values a log line must never carry (T-94-24).
    const SECRETS: [&str; 3] = [
        "https://www.humblebundle.com/api/v1/order/GKSECRET?key=SECRET-KEY-VALUE",
        "_simpleauth_sess=SECRET-COOKIE-VALUE",
        "ABCDE-FGHIJ-KLMNO",
    ];

    #[tokio::test]
    async fn a_log_line_an_op_writes_is_fixed_text_with_no_url_cookie_or_key() {
        let log = Arc::new(RecordingLog::default());
        let args: Vec<Value> = SECRETS.iter().map(|s| json!({ "value": s })).collect();

        // A panicking op writes a line.
        let panicking = ctx(Shutdown::new()).with_log(log.clone());
        let got = dispatch("humble_test_panic", &args, &panicking).await;
        assert_eq!(got, Err("humble_test_panic:panic".to_string()));

        // An op refused by shutdown writes a line.
        let shutdown = Shutdown::new();
        assert!(shutdown.drain(Duration::ZERO).is_empty());
        let stopped = ctx(shutdown).with_log(log.clone());
        let got = dispatch("humble_test_echo", &args, &stopped).await;
        assert_eq!(got, Err("humble_test_echo:shutdown".to_string()));

        // A refused argument writes none, and its error is fixed text too.
        let refused = ctx(Shutdown::new()).with_log(log.clone());
        let got = dispatch("humble_get_gifted_at", &args, &refused).await;
        assert_eq!(got, Err("humble_get_gifted_at:bad-args".to_string()));

        let lines = log.0.lock().unwrap().clone();
        assert_eq!(
            lines,
            [
                "warn humble_test_panic: panicked",
                "warn humble_test_echo: stopped by shutdown"
            ]
        );
        for line in &lines {
            for secret in SECRETS {
                assert!(!line.contains(secret), "{line} carries a secret");
            }
        }
    }

    #[test]
    fn dispatch_sync_blocks_on_the_crate_runtime_from_a_plain_thread() {
        let got = dispatch_sync(
            "humble_test_echo",
            &[json!({ "n": 3 })],
            &ctx(Shutdown::new()),
        );
        assert_eq!(got, Ok(json!(3)));
    }

    #[tokio::test]
    async fn dispatch_sync_inside_a_runtime_is_wrong_thread() {
        let got = dispatch_sync(
            "humble_test_echo",
            &[json!({ "n": 3 })],
            &ctx(Shutdown::new()),
        );
        assert_eq!(got, Err("humble_test_echo:wrong-thread".to_string()));
    }
}
