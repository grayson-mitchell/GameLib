//! What every op is handed. The crate reads no environment variable and no profile path of its own:
//! the shell (or the CLI) builds one `EngineCtx` and every op takes `&EngineCtx`.

use std::path::PathBuf;
use std::sync::Arc;

use gamelib_core::clock::Clock;
use gamelib_core::shutdown::Shutdown;
use gamelib_store::host::StoreHost;

/// The platform the app runs on, as the shell reports it (the crate never asks the OS).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Mac,
    Linux,
    Windows,
}

/// Directories the shell resolves. Store files live under `user_data` (`store_cache/<name>.json`);
/// `app_folder` holds the settings documents; `tools_path` is `<appFolder>/tools`, where engines,
/// runtimes and helper tools are installed; `user_home` is the operator's home directory as the
/// shell reads it (never the process environment of this crate).
#[derive(Debug, Clone)]
pub struct EnginePaths {
    pub app_folder: PathBuf,
    pub user_data: PathBuf,
    pub tools_path: PathBuf,
    pub user_home: PathBuf,
    pub temp: PathBuf,
}

/// Everything an op needs from outside the crate. Fields are public so the shell can fill the ones
/// a later slice adds; [`EngineCtx::new`] gives each a neutral default.
pub struct EngineCtx {
    /// The one owner of every store file (Phase 85). A store is opened through it, never by file
    /// I/O of this crate's own.
    pub host: Arc<StoreHost>,
    pub clock: Arc<dyn Clock>,
    pub platform: Platform,
    pub paths: EnginePaths,
    /// In-flight ops hold a registrant of this and race its token.
    pub shutdown: Shutdown,
}

impl EngineCtx {
    pub fn new(
        host: Arc<StoreHost>,
        clock: Arc<dyn Clock>,
        platform: Platform,
        paths: EnginePaths,
        shutdown: Shutdown,
    ) -> EngineCtx {
        EngineCtx {
            host,
            clock,
            platform,
            paths,
            shutdown,
        }
    }
}
