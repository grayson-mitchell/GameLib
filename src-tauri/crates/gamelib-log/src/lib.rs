//! The native log writer (Phase 84, FND-05): GameLib's own Tauri-free port of `log_writer.ts`.
//!
//! Format, rotation and the per-chunk newline rule match the TS writer byte for byte (the golden in
//! `tests/fixtures/golden`). The writer reads no environment: `LogConfig` carries the log dir, the
//! user-data dir, the clock and the timezone source.

pub mod format;
pub mod frame;
pub mod prefix;
pub mod writer;

use std::sync::OnceLock;
use std::time::Duration;

pub use prefix::{Level, Prefix};
pub use writer::{Entry, LogConfig, Logger, SystemTz, TargetBatch, TzOffset};

static GLOBAL: OnceLock<Logger> = OnceLock::new();

/// Starts the process-wide logger. The first call wins: a second call returns `false`, drops its
/// config and never rotates anything.
pub fn init(cfg: LogConfig) -> bool {
    let mut won = false;
    GLOBAL.get_or_init(|| {
        won = true;
        Logger::start(cfg)
    });
    won
}

pub fn global() -> Option<&'static Logger> {
    GLOBAL.get()
}

/// Does nothing before `init`.
pub fn log(prefix: Prefix, level: Level, msg: &str) {
    if let Some(logger) = global() {
        logger.log(prefix, level, msg);
    }
}

/// Submits batches to the global logger. Does nothing before `init`.
pub fn submit(batches: Vec<TargetBatch>) {
    if let Some(logger) = global() {
        logger.submit(batches);
    }
}

/// `false` before `init` or when the writer did not drain within `within`.
pub fn flush(within: Duration) -> bool {
    global().is_some_and(|l| l.flush(within))
}
