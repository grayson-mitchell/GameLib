//! What every launch op is handed: the engine context and the known-fix context the launch builders
//! read. The crate reads no environment variable and no profile path of its own.

use std::sync::Arc;

use gamelib_engine::ctx::EngineCtx;
use gamelib_knownfix::ctx::KnownFixCtx;

/// The shell (or the CLI) builds one `LaunchCtx` and every op takes `&LaunchCtx`. Cloning gives another
/// handle on the same contexts (both are shared behind an `Arc`).
#[derive(Clone)]
pub struct LaunchCtx {
    /// The directories, clock, platform, shutdown, sinks and log the engine crate already owns.
    pub engine: Arc<EngineCtx>,
    /// The known-fix layers and overlay catalogue the launch builders apply.
    pub knownfix: Arc<KnownFixCtx>,
}

impl LaunchCtx {
    pub fn new(engine: Arc<EngineCtx>, knownfix: Arc<KnownFixCtx>) -> LaunchCtx {
        LaunchCtx { engine, knownfix }
    }
}
