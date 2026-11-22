//! What every op is handed. The crate reads no environment variable and no profile path of its own:
//! the shell (or the CLI) builds one `InfoCtx` and every op takes `&InfoCtx`.

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
/// `app_folder` holds the settings documents and the scratch files that sit outside the store tree.
#[derive(Debug, Clone)]
pub struct InfoPaths {
    pub app_folder: PathBuf,
    pub user_data: PathBuf,
    pub temp: PathBuf,
    /// The bundled `public` directory, where the shell knows it (a later slice's offline fallback).
    pub public_dir: Option<PathBuf>,
}

/// Everything an op needs from outside the crate. Fields are public so the shell can fill the ones
/// a later slice adds; [`InfoCtx::new`] gives each a neutral default.
pub struct InfoCtx {
    /// The one owner of every store file (Phase 85). A cache or user-state store is opened through
    /// it, never by file I/O of this crate's own.
    pub host: Arc<StoreHost>,
    pub clock: Arc<dyn Clock>,
    pub platform: Platform,
    pub paths: InfoPaths,
    pub app_version: String,
    /// In-flight ops hold a registrant of this and race its token (D-20).
    pub shutdown: Shutdown,
}

impl InfoCtx {
    pub fn new(
        host: Arc<StoreHost>,
        clock: Arc<dyn Clock>,
        platform: Platform,
        paths: InfoPaths,
        app_version: String,
        shutdown: Shutdown,
    ) -> InfoCtx {
        InfoCtx {
            host,
            clock,
            platform,
            paths,
            app_version,
            shutdown,
        }
    }
}
