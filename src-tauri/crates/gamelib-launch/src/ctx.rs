//! What every launch op is handed: the engine context, the known-fix context, the wine context and the
//! information context the launch builders and the prepare step read. The crate reads no environment
//! variable and no profile path of its own.

use std::sync::Arc;

use gamelib_engine::ctx::EngineCtx;
use gamelib_info::ctx::InfoCtx;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_wine::ctx::WineCtx;

/// The shell (or the CLI) builds one `LaunchCtx` and every op takes `&LaunchCtx`. Cloning gives another
/// handle on the same contexts (all four are shared behind an `Arc`).
#[derive(Clone)]
pub struct LaunchCtx {
    /// The directories, clock, platform, shutdown, sinks and log the engine crate already owns.
    pub engine: Arc<EngineCtx>,
    /// The known-fix layers and overlay catalogue the launch builders apply.
    pub knownfix: Arc<KnownFixCtx>,
    /// The wine command core: the env builders' runtime path, and the spawn and prefix pieces the
    /// prepare steps of 88.1-11 to 88.1-14 run through.
    pub wine: Arc<WineCtx>,
    /// The information context: the anti-cheat lookup and the system-information read the prepare step logs.
    /// In the shell this is the one `info_dispatch` context, so the native system-information channel and
    /// the launch log share one single-flight cache (88.1-11).
    pub info: Arc<InfoCtx>,
}

impl LaunchCtx {
    pub fn new(
        engine: Arc<EngineCtx>,
        knownfix: Arc<KnownFixCtx>,
        wine: Arc<WineCtx>,
        info: Arc<InfoCtx>,
    ) -> LaunchCtx {
        LaunchCtx {
            engine,
            knownfix,
            wine,
            info,
        }
    }
}
