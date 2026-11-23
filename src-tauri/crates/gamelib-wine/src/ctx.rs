//! What every wine op is handed: the engine context the engine ops share, plus the one directory
//! only this crate needs. The crate reads no environment variable and no profile path of its own.

use std::path::PathBuf;
use std::sync::Arc;

use gamelib_engine::ctx::EngineCtx;

/// The shell (or the CLI) builds one `WineCtx` and every op takes `&WineCtx`.
pub struct WineCtx {
    /// The directories, clock, platform and shutdown the engine crate already owns.
    pub engine: Arc<EngineCtx>,
    /// Where the Wine runtime (the engine's prefix tooling) is installed, as the shell resolves it.
    pub runtime_path: PathBuf,
}

impl WineCtx {
    pub fn new(engine: Arc<EngineCtx>, runtime_path: PathBuf) -> WineCtx {
        WineCtx {
            engine,
            runtime_path,
        }
    }
}
