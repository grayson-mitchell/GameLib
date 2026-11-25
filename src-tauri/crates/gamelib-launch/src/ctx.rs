//! What every launch op is handed: the engine context, the known-fix context and the wine context the
//! launch builders read. The crate reads no environment variable and no profile path of its own.

use std::sync::Arc;

use gamelib_engine::ctx::EngineCtx;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_wine::ctx::WineCtx;

/// The shell (or the CLI) builds one `LaunchCtx` and every op takes `&LaunchCtx`. Cloning gives another
/// handle on the same contexts (all three are shared behind an `Arc`).
#[derive(Clone)]
pub struct LaunchCtx {
    /// The directories, clock, platform, shutdown, sinks and log the engine crate already owns.
    pub engine: Arc<EngineCtx>,
    /// The known-fix layers and overlay catalogue the launch builders apply.
    pub knownfix: Arc<KnownFixCtx>,
    /// The wine command core: the env builders' runtime path, and the spawn and prefix pieces the
    /// prepare steps of 88.1-11 to 88.1-14 run through.
    pub wine: Arc<WineCtx>,
}

impl LaunchCtx {
    pub fn new(
        engine: Arc<EngineCtx>,
        knownfix: Arc<KnownFixCtx>,
        wine: Arc<WineCtx>,
    ) -> LaunchCtx {
        LaunchCtx {
            engine,
            knownfix,
            wine,
        }
    }
}
