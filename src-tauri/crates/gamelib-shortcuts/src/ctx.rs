//! What every op is handed. The crate reads no environment variable and no profile path of its own:
//! the shell builds one `ShortcutsCtx` and every op takes `&ShortcutsCtx`. Later plans add fields.

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

/// Everything an op needs from outside the crate. Fields are public so the shell can fill the ones a
/// later plan adds; [`ShortcutsCtx::new`] gives each a neutral default.
pub struct ShortcutsCtx {
    /// The one owner of every store file (Phase 85). A store is opened through it, never by file I/O
    /// of this crate's own.
    pub host: Arc<StoreHost>,
    pub clock: Arc<dyn Clock>,
    pub platform: Platform,
    /// In-flight ops hold a registrant of this and race its token (D-20).
    pub shutdown: Shutdown,
}

impl ShortcutsCtx {
    pub fn new(
        host: Arc<StoreHost>,
        clock: Arc<dyn Clock>,
        platform: Platform,
        shutdown: Shutdown,
    ) -> ShortcutsCtx {
        ShortcutsCtx {
            host,
            clock,
            platform,
            shutdown,
        }
    }
}
