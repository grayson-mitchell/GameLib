//! The leaf information and cache services (Phase 86, SVC-01): wiki game info and umu, the CrossOver
//! index, store search and discounts, anti-cheat info, recent games, per-game overrides and the
//! SteamGridDB artwork, ported from the TypeScript sidecar.
//!
//! Tauri-free, no environment reads, no `keyring` and no child process (D-19, D-20). Paths, the
//! clock, the platform, the API keys and the baked ITAD key all arrive in [`ctx::InfoCtx`], so the
//! crate runs headlessly on a fake HOME (`gamelib-info-cli`) and in the shell alike. Every op goes
//! through [`dispatch`], which answers `unknown op: <op>` for a name not in [`OPS`].
//!
//! Persisted state goes through the Phase 85 StoreHost only (D-18): [`cache_view`] reproduces the TS
//! `CacheStore` semantics over it. The two documented exceptions, `areweanticheatyet.json` (the
//! [`anticheat`] slice) and the override image files, are plain files.

pub mod anticheat;
pub mod cache_view;
pub mod crossover;
pub mod ctx;
pub mod discounts;
pub mod http;
pub mod itad;
pub mod js;
pub mod overrides;
pub mod recent;
pub mod runner_caps;
pub mod secrets;
pub mod steamgrid;
pub mod umu;
pub mod wiki;

use ctx::InfoCtx;
use serde_json::Value;
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::runtime::{Builder, Handle, Runtime};

/// Ops reachable from the shell and the CLI. Keep sorted; each slice adds its own.
pub const OPS: &[&str] = &[
    "info_anticheat_download",
    "info_anticheat_info",
    "info_anticheat_status",
    "info_crossover_rating_map",
    "info_gog_discounts",
    "info_itad_deals",
    "info_itad_gids",
    "info_itad_key_status",
    "info_itad_search",
    "info_itad_set_key",
    "info_overrides_attach",
    "info_overrides_get",
    "info_overrides_get_all",
    "info_overrides_set",
    "info_recent_add",
    "info_recent_remove",
    "info_steamgrid_grids",
    "info_steamgrid_has_key",
    "info_steamgrid_heroes",
    "info_steamgrid_search",
    "info_steamgrid_set_key",
    "info_umu_get",
    "info_wiki_cache_clear",
    "info_wiki_get",
];

/// Runs `op` over `args`. `Err` is only an unknown op, bad arguments, a missing collaborator, a
/// shutdown, a wrong thread or a panic (`<op>:panic`).
pub async fn dispatch(op: &str, args: &[Value], ctx: &InfoCtx) -> Result<Value, String> {
    let Some(name) = OPS.iter().copied().find(|o| *o == op) else {
        return Err(format!("unknown op: {op}"));
    };
    guarded(name, ctx, route(name, args, ctx)).await
}

/// Each slice adds its arms here, in step with `OPS`.
async fn route(op: &str, args: &[Value], ctx: &InfoCtx) -> Result<Value, String> {
    match op {
        "info_anticheat_download" => anticheat::download(ctx, decode(op, args)?).await,
        "info_anticheat_info" => anticheat::info(ctx, decode(op, args)?),
        "info_anticheat_status" => anticheat::status(ctx, decode(op, args)?),
        "info_crossover_rating_map" => {
            crossover::rating_map::rating_map_op(ctx, decode(op, args)?).await
        }
        "info_gog_discounts" => discounts::gog_discounts(ctx, decode(op, args)?).await,
        "info_itad_deals" => itad::deals(ctx, decode(op, args)?).await,
        "info_itad_gids" => itad::steam_gids(ctx, decode(op, args)?).await,
        "info_itad_key_status" => itad::key_status(ctx, decode(op, args)?),
        "info_itad_search" => itad::search(ctx, decode(op, args)?).await,
        "info_itad_set_key" => itad::set_key(ctx, decode(op, args)?),
        "info_overrides_attach" => overrides::attach(ctx, decode(op, args)?),
        "info_overrides_get" => Ok(overrides::get(ctx, &decode(op, args)?).to_value()),
        "info_overrides_get_all" => {
            if !args.is_empty() {
                return Err(format!("{op}:bad-args"));
            }
            Ok(overrides::get_all(ctx).to_value())
        }
        "info_overrides_set" => overrides::set(ctx, decode(op, args)?).map(Value::Bool),
        "info_recent_add" => recent::add(ctx, decode(op, args)?).map(|()| Value::Null),
        "info_recent_remove" => recent::remove(ctx, decode(op, args)?).map(|()| Value::Null),
        "info_steamgrid_grids" => steamgrid::get_grids(ctx, decode(op, args)?).await,
        "info_steamgrid_has_key" => steamgrid::has_api_key(ctx, decode(op, args)?),
        "info_steamgrid_heroes" => steamgrid::get_heroes(ctx, decode(op, args)?).await,
        "info_steamgrid_search" => steamgrid::search_game(ctx, decode(op, args)?).await,
        "info_steamgrid_set_key" => steamgrid::set_api_key(ctx, decode(op, args)?),
        "info_umu_get" => umu::get(ctx, decode(op, args)?).await,
        "info_wiki_cache_clear" => wiki::clear_cache(ctx, decode(op, args)?).map(|()| Value::Null),
        "info_wiki_get" => wiki::get(ctx, decode(op, args)?).await,
        _ => Err(format!("unknown op: {op}")),
    }
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
pub async fn guarded<F>(op: &str, ctx: &InfoCtx, work: F) -> Result<Value, String>
where
    F: Future<Output = Result<Value, String>>,
{
    let _registrant = ctx.shutdown.register("info");
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
                .thread_name("info")
                .enable_all()
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// How long the boot migration may run before the shell stops waiting for it (D-26): a cold Keychain
/// can hold a read for the shell's own 45 s bound, and boot must not wait on that.
pub const SGDB_MIGRATION_BOUND: Duration = Duration::from_secs(10);

/// Runs [`secrets::migrate_sgdb_plaintext`] once, in the background, as bounded boot work (D-26), and
/// hands `report` exactly one word describing how it ended: an outcome label (see
/// [`secrets::MigrationOutcome::label`]), `timeout` when it ran past `bound`, `shutdown` when the
/// application began to exit first (the work is then not started at all if it had not begun), or
/// `panic`. The word never carries a key, a length or a path.
///
/// The work holds a `Shutdown` registrant named `info-sgdb-migrate` for as long as it really runs, so
/// an exit waits for it within the one exit budget instead of cutting a settings write short. After
/// `bound` the wait is abandoned (the blocking read cannot be interrupted) but the registrant is
/// still held by the worker until it returns.
///
/// Callable from any thread: the work runs on the crate's own runtime. An error is only a runtime
/// that could not be built.
pub fn spawn_sgdb_migration(
    ctx: std::sync::Arc<InfoCtx>,
    bound: Duration,
    report: impl FnOnce(&'static str) + Send + 'static,
) -> Result<(), String> {
    let runtime = runtime().map_err(|e| format!("sgdb_migrate:no-runtime ({e})"))?;
    runtime.spawn(async move {
        let token = ctx.shutdown.token();
        if token.is_cancelled() {
            report("shutdown");
            return;
        }
        let registrant = ctx.shutdown.register("info-sgdb-migrate");
        let worker = std::sync::Arc::clone(&ctx);
        let work = tokio::task::spawn_blocking(move || {
            let _registrant = registrant;
            secrets::migrate_sgdb_plaintext(&worker)
        });
        let word = tokio::select! {
            biased;
            _ = token.cancelled() => "shutdown",
            done = tokio::time::timeout(bound, work) => match done {
                Ok(Ok(outcome)) => outcome.label(),
                Ok(Err(_)) => "panic",
                Err(_) => "timeout",
            },
        };
        report(word);
    });
    Ok(())
}

/// [`dispatch`] for a plain thread: blocks on the crate's own runtime. Called from inside a tokio
/// runtime it answers `<op>:wrong-thread` instead of panicking in `block_on`.
pub fn dispatch_sync(op: &str, args: &[Value], ctx: &InfoCtx) -> Result<Value, String> {
    if Handle::try_current().is_ok() {
        return Err(format!("{op}:wrong-thread"));
    }
    runtime()
        .map_err(|e| format!("{op}:no-runtime ({e})"))?
        .block_on(dispatch(op, args, ctx))
}
