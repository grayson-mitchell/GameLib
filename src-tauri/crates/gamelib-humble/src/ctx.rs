//! What every op is handed. The crate reads no environment variable and no profile path of its own:
//! the shell builds one `HumbleCtx` and every op takes `&HumbleCtx`. Later plans add fields.

use std::path::PathBuf;
use std::sync::Arc;

use gamelib_core::clock::Clock;
use gamelib_core::emitter::FrontendEmitter;
use gamelib_core::shutdown::Shutdown;
use gamelib_store::host::StoreHost;
use serde_json::Value;

/// The platform the app runs on, as the shell reports it (the crate never asks the OS).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Mac,
    Linux,
    Windows,
}

/// The emitter a context gets until the shell's is wired in: the push goes nowhere.
#[derive(Debug, Default, Clone, Copy)]
pub struct NullEmitter;

impl FrontendEmitter for NullEmitter {
    fn emit(&self, _channel: &str, _args: Vec<Value>) {}
}

/// The crate's diagnostic lines. A line is FIXED text: an op name, a short tag or a count. It never
/// carries a URL, a cookie, a header, a key value, an order id or a profile path (T-94-24, and the
/// same rule as `gamelib-info`'s log), so the shell can write every line to `gamelib.log`.
pub trait HumbleLog: Send + Sync + 'static {
    fn info(&self, line: &str);
    fn warn(&self, line: &str);
    fn error(&self, line: &str);
}

/// Everything an op needs from outside the crate. Fields are public so the shell can fill the ones a
/// later plan adds; [`HumbleCtx::new`] gives each a neutral default.
pub struct HumbleCtx {
    /// The one owner of every store file (Phase 85). A store is opened through it, never by file I/O
    /// of this crate's own.
    pub host: Arc<StoreHost>,
    /// The folder the store files sit under: `<user_data>/store_cache/...` and
    /// `<user_data>/humble_store/config.json`.
    pub user_data: PathBuf,
    pub clock: Arc<dyn Clock>,
    pub platform: Platform,
    /// In-flight ops hold a registrant of this and race its token (D-20).
    pub shutdown: Shutdown,
    /// What reaches the renderer: a frontend message pushed from Rust. [`NullEmitter`] until the
    /// shell's is wired in.
    pub emitter: Arc<dyn FrontendEmitter>,
    /// The diagnostic log; `None` is silent (a headless run).
    pub log: Option<Arc<dyn HumbleLog>>,
}

impl HumbleCtx {
    pub fn new(
        host: Arc<StoreHost>,
        user_data: PathBuf,
        clock: Arc<dyn Clock>,
        platform: Platform,
        shutdown: Shutdown,
    ) -> HumbleCtx {
        HumbleCtx {
            host,
            user_data,
            clock,
            platform,
            shutdown,
            emitter: Arc::new(NullEmitter),
            log: None,
        }
    }

    /// The emitter the shell pushes through.
    pub fn with_emitter(mut self, emitter: Arc<dyn FrontendEmitter>) -> HumbleCtx {
        self.emitter = emitter;
        self
    }

    /// The diagnostic log.
    pub fn with_log(mut self, log: Arc<dyn HumbleLog>) -> HumbleCtx {
        self.log = Some(log);
        self
    }

    /// Writes a warning line when a log is set. `line` must be fixed text (see [`HumbleLog`]).
    pub fn warn(&self, line: &str) {
        if let Some(log) = &self.log {
            log.warn(line);
        }
    }
}
