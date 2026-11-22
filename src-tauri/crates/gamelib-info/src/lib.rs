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
//! `CacheStore` semantics over it. The two documented exceptions, `areweanticheatyet.json` and the
//! override image files, are added by their slices.

pub mod cache_view;
pub mod ctx;

use ctx::InfoCtx;
use serde_json::Value;
use std::sync::OnceLock;
use tokio::runtime::{Builder, Handle, Runtime};

/// Ops reachable from the shell and the CLI. Keep sorted; each slice adds its own.
pub const OPS: &[&str] = &[];

/// Runs `op` over `args`. `Err` is only an unknown op, bad arguments, a missing collaborator, a
/// shutdown, a wrong thread or a panic (`<op>:panic`).
pub async fn dispatch(op: &str, _args: &[Value], _ctx: &InfoCtx) -> Result<Value, String> {
    // Each slice adds its arms here, in step with `OPS`.
    Err(format!("unknown op: {op}"))
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
